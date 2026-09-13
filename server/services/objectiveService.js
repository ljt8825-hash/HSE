/**
 * 目标管理模块（/api/objectives）—— 业务层
 * 原 routes/objectives.js（2017 行）全部业务 + SQL + 内存降级收敛于此。
 * 每个端点对应一个 service 函数，返回统一描述符（__t: json / list / file / fileinfo / not-found / next），
 * 由 controllers/objectiveController.js 的 respond() 统一解释为对外 JSON / 二进制契约，行为与原路由一致。
 *
 * 数据源两态：PostgreSQL / 内存降级（mem）。
 * 核心子域：contracts / committees / responsibilities(责任书台账 + 责任制考核) / budgets /
 *           attachments(通用附件) / goals(安全目标) / committee-activities(安委会活动) / 统计聚合。
 * 别名重派发（/org-personnel→/committees 等）属绑定层逻辑，见 routes/objectives/main.js，不在此层。
 */

const { pool, isConnected } = require('../config/db');
const {
  getTargetResponsibilityRule,
  getContractStatuses,
  getContractTypes,
  getCommitteeMemberTypes,
  getAssessmentGradesTR,
  getBudgetCategories,
  getBudgetWarningThreshold,
} = require('../config/hseRules');
const { validateUploadedFile, fixFilenameEncoding } = require('../middleware/upload');
const XLSX = require('xlsx');
const fs = require('fs');

const rule = getTargetResponsibilityRule();

// ============================================================
// 内存模式单例（与 routes/objectives.js 原 mem 语义一致，仅本模块内部使用）
// ============================================================
const mem = {
  contracts: [], committees: [], responsibilities: [], budgets: [], attachments: [],
  counters: { contracts: 1, committees: 1, responsibilities: 1, budgets: 1, attachments: 1 },
};

function nowISO() { return new Date().toISOString(); }

// ============================================================
// 建表保障
// ============================================================
const TABLE_SQL = {
  contracts: `CREATE TABLE IF NOT EXISTS hse_target_contracts (
    id BIGSERIAL PRIMARY KEY, contract_no VARCHAR(64) UNIQUE, title VARCHAR(200) NOT NULL,
    contract_type VARCHAR(32), status VARCHAR(32) DEFAULT 'draft', version VARCHAR(32) DEFAULT '1.0',
    signer_org VARCHAR(200), signer_person_name VARCHAR(100), signer_employee_id BIGINT,
    signee_org VARCHAR(200), signee_person_name VARCHAR(100), signee_employee_id BIGINT,
    sign_date DATE, effective_date DATE, expiry_date DATE, review_cycle_months INT DEFAULT 12,
    org_unit_id BIGINT, department VARCHAR(100), township VARCHAR(100),
    content_summary TEXT, is_archived BOOLEAN DEFAULT FALSE, archived_at TIMESTAMP,
    remark VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT, updated_by BIGINT, is_deleted BOOLEAN DEFAULT FALSE
  )`,
  committees: `CREATE TABLE IF NOT EXISTS hse_safety_committee (
    id BIGSERIAL PRIMARY KEY, member_type VARCHAR(32) NOT NULL, employee_id BIGINT,
    employee_no VARCHAR(50), employee_name VARCHAR(100) NOT NULL, position VARCHAR(100),
    department VARCHAR(100), township VARCHAR(100), org_unit_id BIGINT,
    title_in_committee VARCHAR(100), duty_desc TEXT, start_date DATE, end_date DATE,
    status VARCHAR(32) DEFAULT 'active', contact_phone VARCHAR(32), contact_email VARCHAR(100),
    sort_order INT DEFAULT 0, remark VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by BIGINT, updated_by BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE
  )`,
  responsibilities: `CREATE TABLE IF NOT EXISTS hse_responsibility_assessment (
    id BIGSERIAL PRIMARY KEY, employee_id BIGINT, employee_no VARCHAR(50),
    employee_name VARCHAR(100) NOT NULL, position VARCHAR(100), department VARCHAR(100),
    township VARCHAR(100), org_unit_id BIGINT, period_year INT, period_quarter INT,
    assessment_period VARCHAR(50), score_total NUMERIC(8,2), grade VARCHAR(20),
    responsibility_items TEXT, evidence_refs TEXT, status VARCHAR(32) DEFAULT 'pending',
    assessed_by BIGINT, assessed_at TIMESTAMP, remark VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT, updated_by BIGINT, is_deleted BOOLEAN DEFAULT FALSE
  )`,
  budgets: `CREATE TABLE IF NOT EXISTS hse_safety_budget (
    id BIGSERIAL PRIMARY KEY, budget_code VARCHAR(64) UNIQUE, budget_year INT NOT NULL,
    category VARCHAR(50), department VARCHAR(100), project_name VARCHAR(200), item_name VARCHAR(200),
    budget_amount NUMERIC(14,2) DEFAULT 0, spent_amount NUMERIC(14,2) DEFAULT 0,
    org_unit_id BIGINT, responsible_person VARCHAR(100), responsible_employee_id BIGINT,
    start_date DATE, end_date DATE, status VARCHAR(32) DEFAULT 'active',
    description TEXT, remark VARCHAR(500),
    measure_item TEXT, budget_subject VARCHAR(32), purpose TEXT,
    plan_time DATE, location VARCHAR(200), spec VARCHAR(200),
    plan_quantity NUMERIC(12,2) DEFAULT 0, plan_unit_price NUMERIC(14,4) DEFAULT 0, plan_total NUMERIC(14,2) DEFAULT 0,
    actual_quantity NUMERIC(12,2) DEFAULT 0, actual_unit_price NUMERIC(14,4) DEFAULT 0,
    use_status VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_by BIGINT, updated_by BIGINT,
    is_deleted BOOLEAN DEFAULT FALSE
  )`,
  attachments: `CREATE TABLE IF NOT EXISTS hse_objectives_attachments (
    id BIGSERIAL PRIMARY KEY, biz_type VARCHAR(50) NOT NULL, biz_id BIGINT NOT NULL,
    file_name VARCHAR(255), file_path VARCHAR(500), file_size BIGINT, file_type VARCHAR(50),
    uploaded_by BIGINT, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, is_deleted BOOLEAN DEFAULT FALSE
  )`,
  goals: `CREATE TABLE IF NOT EXISTS safety_goals (
    id BIGSERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, year INT NOT NULL,
    type VARCHAR(32) DEFAULT 'custom', target_value NUMERIC(12,2) DEFAULT 0,
    current_value NUMERIC(12,2) DEFAULT 0, unit VARCHAR(20) DEFAULT '%',
    department VARCHAR(100), responsible_person VARCHAR(100), responsible_person_id BIGINT,
    status VARCHAR(32) DEFAULT 'on_track', deadline DATE, description TEXT, progress INT DEFAULT 0, remark VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT, updated_by BIGINT, is_deleted BOOLEAN DEFAULT FALSE
  )`,
  unmatched: `CREATE TABLE IF NOT EXISTS hse_responsibility_unmatched (
    id BIGSERIAL PRIMARY KEY, batch_no VARCHAR(64),
    employee_code VARCHAR(50), name VARCHAR(100), id_card VARCHAR(200),
    source_target_value VARCHAR(10), source_signed BOOLEAN,
    reason VARCHAR(100), imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
};

async function ensureTables() {
  if (!isConnected()) return;
  for (const k of Object.keys(TABLE_SQL)) {
    try { await pool.query(TABLE_SQL[k]); } catch (e) { /* ignore */ }
  }
}

async function ensureCommitteeActivityTable() {
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_safety_committee_activity (
        id              SERIAL PRIMARY KEY,
        activity_name   VARCHAR(255) NOT NULL,
        activity_type   VARCHAR(64),
        activity_date   DATE,
        host_department VARCHAR(128),
        participants    INTEGER NOT NULL DEFAULT 0,
        location        VARCHAR(255),
        summary         TEXT,
        pdf_file        VARCHAR(255) DEFAULT '',
        original_name   VARCHAR(255) DEFAULT '',
        remark          TEXT,
        sort_order      INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        is_deleted      BOOLEAN DEFAULT FALSE
      )
    `);
  } catch (e) { /* ignore */ }
}

// ============================================================
// 通用工具
// ============================================================
function paginate(arr, page, pageSize) {
  const total = arr.length;
  const p = Math.max(1, parseInt(page) || 1);
  const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
  const offset = (p - 1) * ps;
  return { list: arr.slice(offset, offset + ps), total, page: p, pageSize: ps };
}

function calcBudgetStatus(budgetAmt, spentAmt) {
  if (!budgetAmt || budgetAmt <= 0) return { executionRate: 0, status: 'normal' };
  const rate = (spentAmt / budgetAmt) * 100;
  const warn = getBudgetWarningThreshold();
  let status = 'normal';
  if (rate >= 100) status = 'overspend';
  else if (rate >= warn) status = 'warning';
  return { executionRate: Math.round(rate * 100) / 100, status };
}

// ============================================================
// 目标责任书台账（员工花名册 × 签订状态）
// ============================================================
function buildRosterFrom() {
  return `
    FROM v_employee_current e
    LEFT JOIN LATERAL (
      SELECT id, status, sign_date, title
      FROM hse_target_contracts
      WHERE signee_employee_id = e.employee_id AND is_deleted = false
      ORDER BY sign_date DESC NULLS LAST, id DESC
      LIMIT 1
    ) c ON true
  `;
}

function buildRosterWhere({ keyword, department, signStatus }, params) {
  const where = ["e.employee_deleted = false", "e.assignment_status = 'active'"];
  if (keyword) {
    params.push(`%${keyword}%`);
    where.push(`(e.employee_code ILIKE $${params.length} OR e.name ILIKE $${params.length})`);
  }
  if (department) {
    params.push(department);
    where.push(`e.org_name = $${params.length}`);
  }
  if (signStatus === 'signed') {
    where.push(`c.status = 'signed'`);
  } else if (signStatus === 'unsigned') {
    where.push(`(c.status IS NULL OR c.status <> 'signed')`);
  } else if (signStatus === 'unsigned_no_source') {
    where.push(`c.id IS NULL`);
  }
  return where;
}

// 单元格取值（兼容中/英表头）
function cellVal(row, names) {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// 签订状态归一化：缺失视为未签订
function normalizeSignStatus(v) {
  if (v === undefined || v === null) return 'unsigned';
  const s = String(v).trim();
  if (/^(已签|signed|是|√|yes|true|1)$/i.test(s)) return 'signed';
  if (/^(未签|unsigned|否|no|false|0|未签订)$/i.test(s)) return 'unsigned';
  return 'unsigned';
}

// 灵活日期解析：YYYY-MM-DD / YYYY/MM/DD / Excel 序列号
function parseFlexDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const d = new Date(s.replace(/\//g, '-'));
    return isNaN(d.getTime()) ? null : s.replace(/\//g, '-');
  }
  if (/^\d{4,5}$/.test(s)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + parseInt(s, 10) * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// 按 员工ID / 员工编号 / 身份证号 / 姓名 解析签订人（在职、未删除），要求唯一匹配
async function resolveSignee({ employeeId, employeeCode, name, idCard }) {
  const base = "employee_deleted=false AND assignment_status='active'";
  if (employeeId) {
    const r = await pool.query(`SELECT employee_id, name, org_unit_id, org_name FROM v_employee_current WHERE ${base} AND employee_id=$1`, [employeeId]);
    if (r.rows.length) return r.rows[0];
  }
  if (employeeCode) {
    const r = await pool.query(`SELECT employee_id, name, org_unit_id, org_name FROM v_employee_current WHERE ${base} AND employee_code ILIKE $1`, [String(employeeCode).trim()]);
    if (r.rows.length) return r.rows[0];
  }
  if (idCard) {
    const r = await pool.query(`SELECT employee_id, name, org_unit_id, org_name FROM v_employee_current WHERE ${base} AND id_card=$1`, [String(idCard).trim()]);
    if (r.rows.length === 1) return r.rows[0];
  }
  if (name) {
    const r = await pool.query(`SELECT employee_id, name, org_unit_id, org_name FROM v_employee_current WHERE ${base} AND name=$1`, [String(name).trim()]);
    if (r.rows.length === 1) return r.rows[0];
  }
  return null;
}

// ============================================================
// 安全人员及安委会 — 前端字段 ↔ DB 列名映射
// ============================================================
function mapCommitteeBody(b = {}) {
  const row = {};
  if (b.name !== undefined) row.employee_name = b.name;
  if (b.phone !== undefined) row.contact_phone = b.phone;
  if (b.position !== undefined) row.position = b.position;
  if (b.department !== undefined) row.department = b.department;
  if (b.township !== undefined) row.township = b.township;
  if (b.status !== undefined) row.status = b.status;
  if (b.memberType !== undefined) row.member_type = b.memberType;
  if (b.employeeId !== undefined) row.employee_id = b.employeeId;
  if (b.employeeNo !== undefined) row.employee_no = b.employeeNo;
  if (b.orgUnitId !== undefined) row.org_unit_id = b.orgUnitId;
  if (b.titleInCommittee !== undefined) row.title_in_committee = b.titleInCommittee;
  if (b.dutyDesc !== undefined) row.duty_desc = b.dutyDesc;
  if (b.remark !== undefined) row.remark = b.remark;
  return row;
}

function committeeToCamel(r) {
  if (!r) return r;
  return {
    id: r.id,
    name: r.employee_name,
    employeeId: r.employee_id,
    employeeNo: r.employee_no,
    memberType: r.member_type,
    position: r.position,
    department: r.department,
    township: r.township,
    orgUnitId: r.org_unit_id,
    titleInCommittee: r.title_in_committee,
    dutyDesc: r.duty_desc,
    startDate: r.start_date,
    endDate: r.end_date,
    phone: r.contact_phone,
    contactEmail: r.contact_email,
    status: r.status,
    sortOrder: r.sort_order,
    remark: r.remark,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ============================================================
// 安全费用预算 — DB 行 ↔ 前端结构
// ============================================================
function budgetToCamel(r) {
  if (!r) return r;
  return {
    ...r,
    budgetYear: r.budget_year ?? r.budgetYear,
    year: r.budget_year ?? r.year,
    item: r.item_name ?? r.project_name ?? r.item,
    itemName: r.item_name ?? r.project_name ?? r.itemName,
    projectName: r.project_name ?? r.projectName,
    budgetAmount: r.budget_amount ?? r.budgetAmount,
    usedAmount: r.spent_amount ?? r.used_amount ?? r.usedAmount,
    spentAmount: r.spent_amount ?? r.spentAmount,
    measureItem: r.measure_item ?? r.measureItem,
    budgetSubject: r.budget_subject ?? r.budgetSubject,
    planTime: r.plan_time ?? r.planTime,
    planQuantity: r.plan_quantity ?? r.planQuantity,
    planUnitPrice: r.plan_unit_price ?? r.planUnitPrice,
    planTotal: r.plan_total ?? r.planTotal,
    actualQuantity: r.actual_quantity ?? r.actualQuantity,
    actualUnitPrice: r.actual_unit_price ?? r.actualUnitPrice,
    actualExpenditureQuantity: r.actual_expenditure_quantity ?? r.actualExpenditureQuantity,
    actualExpenditureUnitPrice: r.actual_expenditure_unit_price ?? r.actualExpenditureUnitPrice,
    actualExpenditureTotal: r.actual_expenditure_total ?? r.actualExpenditureTotal,
    useStatus: r.use_status ?? r.useStatus,
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
  };
}

function budgetToSnake(b) {
  const fieldMap = {
    budget_year: b.budgetYear ?? b.budget_year ?? b.year,
    year: b.budgetYear ?? b.budget_year ?? b.year,
    category: b.category,
    department: b.department,
    project_name: b.projectName ?? b.project_name ?? b.itemName ?? b.item,
    item_name: b.itemName ?? b.item_name ?? b.item ?? b.projectName,
    budget_amount: b.budgetAmount ?? b.budget_amount,
    spent_amount: b.spentAmount ?? b.spent_amount ?? b.usedAmount ?? b.used_amount,
    measure_item: b.measureItem ?? b.measure_item,
    budget_subject: b.budgetSubject ?? b.budget_subject,
    purpose: b.purpose,
    plan_time: b.planTime ?? b.plan_time,
    location: b.location,
    spec: b.spec,
    plan_quantity: b.planQuantity ?? b.plan_quantity,
    plan_unit_price: b.planUnitPrice ?? b.plan_unit_price,
    plan_total: b.planTotal ?? b.plan_total,
    actual_quantity: b.actualQuantity ?? b.actual_quantity,
    actual_unit_price: b.actualUnitPrice ?? b.actual_unit_price,
    actual_expenditure_quantity: b.actualExpenditureQuantity ?? b.actual_expenditure_quantity,
    actual_expenditure_unit_price: b.actualExpenditureUnitPrice ?? b.actual_expenditure_unit_price,
    actual_expenditure_total: b.actualExpenditureTotal ?? b.actual_expenditure_total,
    use_status: b.useStatus ?? b.use_status,
    status: b.status,
    remark: b.remark,
  };
  return fieldMap;
}

// ============================================================
// 安全目标 (safety_goals) 映射
// ============================================================
function goalToCamel(r) {
  if (!r) return r;
  return {
    id: r.id,
    title: r.title,
    year: r.year,
    type: r.type,
    targetValue: parseFloat(r.target_value) || 0,
    currentValue: parseFloat(r.current_value) || 0,
    unit: r.unit,
    department: r.department,
    responsiblePerson: r.responsible_person,
    responsiblePersonId: r.responsible_person_id ? parseInt(r.responsible_person_id) : null,
    status: r.status,
    deadline: r.deadline,
    description: r.description,
    progress: parseInt(r.progress) || 0,
    remark: r.remark,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ============================================================
// 责任制考核 (hse_responsibility_assessment) 映射
// ============================================================
function responsibilityToCamel(r) {
  if (!r) return r;
  return {
    id: r.id,
    employeeId: r.employee_id != null ? parseInt(r.employee_id) : null,
    employeeNo: r.employee_no ?? null,
    person: r.employee_name ?? '',
    position: r.position ?? '',
    department: r.department ?? '',
    township: r.township ?? '',
    orgUnitId: r.org_unit_id != null ? parseInt(r.org_unit_id) : null,
    year: r.period_year ?? null,
    quarter: r.period_quarter ?? null,
    assessmentPeriod: r.assessment_period ?? '',
    score: r.score_total != null ? Number(r.score_total) : null,
    level: r.grade ?? '',
    responsibilityItems: r.responsibility_items ?? '',
    evidenceRefs: r.evidence_refs ?? '',
    status: r.status ?? '',
    assessedBy: r.assessed_by != null ? parseInt(r.assessed_by) : null,
    assessedAt: r.assessed_at ?? null,
    remark: r.remark ?? '',
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    createdBy: r.created_by != null ? parseInt(r.created_by) : null,
    updatedBy: r.updated_by != null ? parseInt(r.updated_by) : null,
    isDeleted: r.is_deleted ?? false,
  };
}

const RESPONSIBILITY_FIELD_MAP = {
  employeeId: 'employee_id',
  employeeNo: 'employee_no',
  person: 'employee_name',
  position: 'position',
  department: 'department',
  township: 'township',
  orgUnitId: 'org_unit_id',
  year: 'period_year',
  quarter: 'period_quarter',
  assessmentPeriod: 'assessment_period',
  score: 'score_total',
  level: 'grade',
  status: 'status',
  assessedBy: 'assessed_by',
  remark: 'remark',
};

function toResponsibilitySnake(body) {
  const mapped = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (v === undefined) continue;
    const dbCol = RESPONSIBILITY_FIELD_MAP[k] || k;
    mapped[dbCol] = v;
  }
  return mapped;
}

// ============================================================
// 安委会活动 映射
// ============================================================
function mapCommitteeActivityBody(b = {}) {
  const row = {};
  if (b.activityName !== undefined) row.activity_name = b.activityName;
  if (b.activityType !== undefined) row.activity_type = b.activityType;
  if (b.activityDate !== undefined) row.activity_date = b.activityDate || null;
  if (b.hostDepartment !== undefined) row.host_department = b.hostDepartment;
  if (b.participants !== undefined) row.participants = parseInt(b.participants) || 0;
  if (b.location !== undefined) row.location = b.location;
  if (b.summary !== undefined) row.summary = b.summary;
  if (b.pdfFile !== undefined) row.pdf_file = b.pdfFile;
  if (b.originalName !== undefined) row.original_name = b.originalName;
  if (b.remark !== undefined) row.remark = b.remark;
  return row;
}

function committeeActivityToCamel(r = {}) {
  return {
    id: r.id,
    activityName: r.activity_name || '',
    activityType: r.activity_type || '',
    activityDate: toDateYmd(r.activity_date),
    hostDepartment: r.host_department || '',
    participants: r.participants || 0,
    location: r.location || '',
    summary: r.summary || '',
    pdfFile: r.pdf_file || '',
    originalName: r.original_name || '',
    remark: r.remark || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 任意日期值 → 'YYYY-MM-DD'，与前端 dayjs 严格解析兼容
function toDateYmd(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// Excel 单元格日期 → YYYY-MM-DD
function normalizeXlsDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, '0');
    const d = String(m[3]).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  return s.length >= 8 ? s : null;
}

// 描述符快捷构造
const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message) => ({ __t: 'json', error: { code, message } });
const list = (list_, total, page, pageSize, message) => ({ __t: 'list', list: list_, total, page, pageSize, message });

// ============================================================
// 1. 规则查询
// ============================================================
function rules() {
  return ok({
    contractStatuses: getContractStatuses(),
    contractTypes: getContractTypes(),
    committeeMemberTypes: getCommitteeMemberTypes(),
    assessmentGrades: getAssessmentGradesTR(),
    budgetCategories: getBudgetCategories(),
    budgetWarningThreshold: getBudgetWarningThreshold(),
    forbidden: rule.forbidden || {},
  }, '规则查询成功');
}

// ============================================================
// 2. 目标责任书签订台账
// ============================================================
async function rosterStats(query) {
  try {
    if (!isConnected()) {
      return ok({ total: 0, signed: 0, unsigned: 0, signRate: 0 }, '统计成功(内存模式)');
    }
    await ensureTables();
    const { keyword, department, signStatus } = query;
    const params = [];
    const where = buildRosterWhere({ keyword, department, signStatus }, params);
    const from = buildRosterFrom();
    const totalR = await pool.query(`SELECT COUNT(*)::int AS c ${from} WHERE ${where.join(' AND ')}`, params);
    const signedR = await pool.query(`SELECT COUNT(*)::int AS c ${from} WHERE ${where.join(' AND ')} AND c.status = 'signed'`, params);
    const total = parseInt(totalR.rows[0].c);
    const signed = parseInt(signedR.rows[0].c);
    const unsigned = total - signed;
    return ok({ total, signed, unsigned, signRate: total > 0 ? Math.round((signed / total) * 100) : 0 }, '统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function rosterStatus(query) {
  try {
    const { page = 1, pageSize = 10, keyword, department, signStatus } = query;
    const p = Math.max(1, parseInt(page) || 1);
    const ps = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    if (!isConnected()) {
      return ok({ list: [], total: 0, page: p, pageSize: ps }, '查询成功(内存模式)');
    }
    await ensureTables();
    const params = [];
    const where = buildRosterWhere({ keyword, department, signStatus }, params);
    const from = buildRosterFrom();
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c ${from} WHERE ${where.join(' AND ')}`, params),
      pool.query(
        `SELECT
          e.employee_id,
          e.employee_code,
          e.name,
          e.org_name AS department,
          e.unit_name AS team,
          e.position_name AS position,
          to_char(e.start_date, 'YYYY-MM-DD') AS hire_date,
          e.supervisor_name AS supervisor,
          c.id AS contract_id,
          c.status AS contract_status,
          to_char(c.sign_date, 'YYYY-MM-DD') AS sign_date,
          c.title AS contract_title,
          CASE WHEN c.id IS NULL THEN true ELSE false END AS no_source_record
        ${from}
        WHERE ${where.join(' AND ')}
        ORDER BY e.org_name, e.employee_code
        LIMIT ${ps} OFFSET ${(p - 1) * ps}`,
        params,
      ),
    ]);
    const data = listR.rows.map((r) => ({
      employeeId: r.employee_id,
      employeeCode: r.employee_code,
      name: r.name,
      department: r.department,
      team: r.team,
      position: r.position,
      hireDate: r.hire_date,
      supervisor: r.supervisor,
      contractId: r.contract_id,
      contractStatus: r.contract_status,
      contractTitle: r.contract_title,
      noSourceRecord: r.no_source_record,
      signDate: r.sign_date,
      signStatus: r.contract_status === 'signed' ? 'signed' : 'unsigned',
    }));
    return list(data, parseInt(countR.rows[0].c), p, ps, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function employeeLookup(query) {
  try {
    const { keyword } = query;
    if (!isConnected()) return ok([], '内存模式无数据');
    await ensureTables();
    const params = [];
    let where = "employee_deleted=false AND assignment_status='active'";
    if (keyword) {
      params.push(`%${keyword}%`);
      where += ` AND (employee_code ILIKE $${params.length} OR name ILIKE $${params.length} OR id_card ILIKE $${params.length})`;
    }
    const r = await pool.query(
      `SELECT employee_id, employee_code, name, id_card, org_name AS department, position_name AS position
       FROM v_employee_current WHERE ${where} ORDER BY org_name, employee_code LIMIT 50`,
      params,
    );
    return ok(r.rows.map((x) => ({
      employeeId: x.employee_id,
      employeeCode: x.employee_code,
      name: x.name,
      idCard: x.id_card,
      department: x.department,
      position: x.position,
    })), '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function rosterCreate(body) {
  try {
    const b = body || {};
    if (!isConnected()) return err(-1, '内存模式不支持录入');
    await ensureTables();
    const emp = await resolveSignee(b);
    if (!emp) return err(-2, '未匹配到员工，请核对员工编号/姓名/身份证号');
    const status = normalizeSignStatus(b.status);
    const title = (b.title && String(b.title).trim()) || `${emp.name} 目标责任书`;
    const signDate = parseFlexDate(b.signDate);
    const contractType = (b.contractType && String(b.contractType).trim()) || '目标责任书';
    const ex = await pool.query(
      `SELECT id FROM hse_target_contracts WHERE signee_employee_id=$1 AND is_deleted=false ORDER BY sign_date DESC NULLS LAST, id DESC LIMIT 1`,
      [emp.employee_id],
    );
    let rec;
    if (ex.rows.length) {
      const r = await pool.query(
        `UPDATE hse_target_contracts SET status=$1, sign_date=$2, title=$3, signee_person_name=$4, contract_type=$5, org_unit_id=$6, department=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING *`,
        [status, signDate, title, emp.name, contractType, emp.org_unit_id, emp.org_name, ex.rows[0].id],
      );
      rec = r.rows[0];
    } else {
      const r = await pool.query(
        `INSERT INTO hse_target_contracts(title, contract_type, status, signee_employee_id, signee_person_name, sign_date, org_unit_id, department)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [title, contractType, status, emp.employee_id, emp.name, signDate, emp.org_unit_id, emp.org_name],
      );
      rec = r.rows[0];
    }
    return ok(rec, '保存成功');
  } catch (e) { return err(-1, e.message); }
}

async function rosterTemplate() {
  try {
    if (!isConnected()) return err(-1, '内存模式不支持下载');
    const headers = ['员工编码', '姓名', '身份证件号', '目标责任书', '责任书标题', '签订日期'];
    const example = ['', '', '', '1', '2025年度安全生产目标责任书', '2025-01-15'];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 32 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '责任书签订台账');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      __t: 'file',
      buffer: buf,
      filename: '责任书签订台账导入模板.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  } catch (e) { return err(-1, e.message); }
}

// 导入前先清理临时文件（无论成败）并返回清理结果
function safeUnlink(path) {
  try { if (path) fs.unlinkSync(path); } catch (_) {}
}

async function rosterImport(file) {
  try {
    if (!isConnected()) return err(-1, '内存模式不支持导入');
    await ensureTables();
    if (!file) return err(-2, '未收到文件');
    const sig = validateUploadedFile(file, 'excel');
    if (!sig.valid) return err(-1, sig.error || '文件校验失败');
    const wb = XLSX.readFile(file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    let inserted = 0, updated = 0, unmatched = 0, total = 0;
    const unmatchedSamples = [];
    const unmatchedRows = [];
    for (const row of rows) {
      const employeeCode = cellVal(row, ['员工编码', '员工编号', 'employeeCode', 'employee_code', '工号', '编码']);
      const name = cellVal(row, ['姓名', 'name']);
      const idCard = cellVal(row, ['身份证件号', '身份证号', 'idCard', 'id_card', '身份证', '证件号']);
      const title = cellVal(row, ['责任书标题', 'title', '责任书名称']);
      const statusRaw = cellVal(row, ['目标责任书', '签订状态', 'status', '状态']);
      const signDateRaw = cellVal(row, ['签订日期', 'signDate', 'sign_date', '日期']);
      if (!employeeCode && !name && !idCard && !title) continue;
      total++;
      const emp = await resolveSignee({ employeeCode, name, idCard });
      if (!emp) {
        unmatched++;
        unmatchedRows.push({
          employeeCode: (employeeCode || '').toString().trim(),
          name: (name || '').toString().trim(),
          idCard: (idCard || '').toString().trim(),
          sourceTargetValue: (statusRaw || '').toString().trim(),
          sourceSigned: normalizeSignStatus(statusRaw) === 'signed',
        });
        if (unmatchedSamples.length < 10) unmatchedSamples.push({ employeeCode, name, idCard });
        continue;
      }
      const status = normalizeSignStatus(statusRaw);
      const t = title || `${emp.name} 目标责任书`;
      const signDate = parseFlexDate(signDateRaw);
      const ex = await pool.query(
        `SELECT id FROM hse_target_contracts WHERE signee_employee_id=$1 AND is_deleted=false ORDER BY sign_date DESC NULLS LAST, id DESC LIMIT 1`,
        [emp.employee_id],
      );
      if (ex.rows.length) {
        await pool.query(
          `UPDATE hse_target_contracts SET status=$1, sign_date=$2, title=$3, signee_person_name=$4, org_unit_id=$5, department=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7`,
          [status, signDate, t, emp.name, emp.org_unit_id, emp.org_name, ex.rows[0].id],
        );
        updated++;
      } else {
        await pool.query(
          `INSERT INTO hse_target_contracts(title, contract_type, status, signee_employee_id, signee_person_name, sign_date, org_unit_id, department)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [t, '目标责任书', status, emp.employee_id, emp.name, signDate, emp.org_unit_id, emp.org_name],
        );
        inserted++;
      }
    }
    safeUnlink(file.path);
    // 持久化对账差异（不阻断导入）
    try {
      const batchNo = `IMP${Date.now()}`;
      await pool.query('DELETE FROM hse_responsibility_unmatched');
      if (unmatchedRows.length) {
        await Promise.all(
          unmatchedRows.map((u) =>
            pool.query(
              'INSERT INTO hse_responsibility_unmatched(batch_no, employee_code, name, id_card, source_target_value, source_signed, reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [
                batchNo,
                u.employeeCode || null,
                u.name || null,
                u.idCard || null,
                u.sourceTargetValue || null,
                u.sourceSigned,
                '不在当前在职花名册(已离职)',
              ],
            ),
          ),
        );
      }
    } catch (diffErr) {
      console.warn('对账差异表写入失败(不阻断导入):', diffErr?.message || diffErr);
    }
    return ok({ inserted, updated, unmatched, total, unmatchedSamples }, '导入完成');
  } catch (e) {
    return err(-1, e.message);
  }
}

async function rosterUnmatched() {
  try {
    if (!isConnected()) return err(-1, '内存模式不支持');
    await ensureTables();
    const r = await pool.query(
      `SELECT employee_code AS "employeeCode", name, id_card AS "idCard",
              source_target_value AS "sourceTargetValue", source_signed AS "sourceSigned",
              reason, to_char(imported_at, 'YYYY-MM-DD HH24:MI') AS "importedAt"
       FROM hse_responsibility_unmatched ORDER BY employee_code`,
    );
    return ok({ list: r.rows, total: r.rows.length }, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function rosterDetail(idRaw) {
  try {
    const contractId = parseInt(idRaw, 10);
    if (!isConnected()) return err(-1, '内存模式不支持查看');
    await ensureTables();
    const r = await pool.query(
      `SELECT
        c.id, c.title, c.contract_type, c.status, c.sign_date,
        e.employee_id, e.employee_code, e.name, e.org_name AS department,
        e.unit_name AS team, e.position_name AS position,
        to_char(e.start_date, 'YYYY-MM-DD') AS hire_date,
        e.supervisor_name AS supervisor
      FROM hse_target_contracts c
      LEFT JOIN v_employee_current e ON e.employee_id = c.signee_employee_id
      WHERE c.id = $1 AND c.is_deleted = false`,
      [contractId],
    );
    if (!r.rows.length) return err(-2, '责任书记录不存在');
    const row = r.rows[0];
    return ok({
      contractId: row.id,
      title: row.title,
      contractType: row.contract_type,
      status: row.status,
      signDate: row.sign_date,
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      name: row.name,
      department: row.department,
      team: row.team,
      position: row.position,
      hireDate: row.hire_date,
      supervisor: row.supervisor,
    }, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function rosterUpdate(idRaw, body) {
  try {
    const contractId = parseInt(idRaw, 10);
    if (!isConnected()) return err(-1, '内存模式不支持编辑');
    await ensureTables();
    const b = body || {};
    const ex = await pool.query('SELECT id, signee_employee_id FROM hse_target_contracts WHERE id=$1 AND is_deleted=false', [contractId]);
    if (!ex.rows.length) return err(-2, '责任书记录不存在');
    const status = normalizeSignStatus(b.status);
    const title = (b.title && String(b.title).trim()) || undefined;
    const contractType = (b.contractType && String(b.contractType).trim()) || undefined;
    const signDate = b.signDate !== undefined ? parseFlexDate(b.signDate) : undefined;
    const sets = ['status=$1', 'updated_at=CURRENT_TIMESTAMP'];
    const params = [status];
    let idx = 1;
    if (title !== undefined) { idx++; sets.push(`title=$${idx}`); params.push(title); }
    if (contractType !== undefined) { idx++; sets.push(`contract_type=$${idx}`); params.push(contractType); }
    if (signDate !== undefined) { idx++; sets.push(`sign_date=$${idx}`); params.push(signDate); }
    params.push(contractId);
    const r = await pool.query(
      `UPDATE hse_target_contracts SET ${sets.join(', ')} WHERE id=$${idx + 1} RETURNING *`,
      params,
    );
    return ok(r.rows[0], '更新成功');
  } catch (e) { return err(-1, e.message); }
}

async function rosterDelete(idRaw) {
  try {
    const contractId = parseInt(idRaw, 10);
    if (!isConnected()) {
      const idx = mem.contracts.findIndex(c => c.id === contractId && !c.is_deleted);
      if (idx >= 0) mem.contracts[idx].is_deleted = true;
      return ok(null, '删除成功(内存模式)');
    }
    await ensureTables();
    await pool.query('UPDATE hse_target_contracts SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [contractId]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 3. 通用附件
// ============================================================
async function attachmentList(bizType, id) {
  try {
    if (!isConnected()) {
      const arr = mem.attachments.filter(a => a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
      return ok(arr, '查询成功(内存模式)');
    }
    const r = await pool.query('SELECT * FROM hse_objectives_attachments WHERE biz_type=$1 AND biz_id=$2 AND is_deleted=false ORDER BY uploaded_at DESC', [bizType, parseInt(id)]);
    return ok(r.rows, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function attachmentCreate(bizType, id, body) {
  try {
    const { file_name, file_path, file_size, file_type, uploaded_by } = body;
    if (!isConnected()) {
      const rec = { id: mem.counters.attachments++, biz_type: bizType, biz_id: parseInt(id), file_name, file_path, file_size, file_type, uploaded_by, uploaded_at: nowISO(), is_deleted: false };
      mem.attachments.push(rec);
      return ok(rec, '上传成功(内存模式)');
    }
    const r = await pool.query(
      'INSERT INTO hse_objectives_attachments(biz_type,biz_id,file_name,file_path,file_size,file_type,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [bizType, parseInt(id), file_name, file_path, file_size, file_type, uploaded_by]
    );
    return ok(r.rows[0], '上传成功');
  } catch (e) { return err(-1, e.message); }
}

async function attachmentDelete(aid, bizType, id) {
  try {
    const aidN = parseInt(aid);
    if (!isConnected()) {
      const r = mem.attachments.find(x => x.id === aidN && !x.is_deleted);
      if (r) { r.is_deleted = true; }
      return ok(null, '删除成功(内存模式)');
    }
    await pool.query('UPDATE hse_objectives_attachments SET is_deleted=true WHERE id=$1', [aidN]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 4. contracts
// ============================================================
async function contractStats() {
  try {
    if (!isConnected()) {
      const data = mem.contracts.filter(r => !r.is_deleted);
      const signed = data.filter(r => r.status === 'signed').length;
      const pending = data.filter(r => r.status === 'pending').length;
      return ok({ total: data.length, signed, pending, signRate: data.length > 0 ? Math.round((signed / data.length) * 100) : 0 }, '统计成功(内存模式)');
    }
    await ensureTables();
    const [totalR, signedR, pendingR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false AND status='signed'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false AND status='pending'"),
    ]);
    const total = parseInt(totalR.rows[0].c);
    const signed = parseInt(signedR.rows[0].c);
    const pending = parseInt(pendingR.rows[0].c);
    return ok({ total, signed, pending, signRate: total > 0 ? Math.round((signed / total) * 100) : 0 }, '统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function contractList(query) {
  try {
    const { page, pageSize, keyword, contractType, status } = query;
    if (!isConnected()) {
      let data = mem.contracts.filter(r => !r.is_deleted);
      if (keyword) { data = data.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase())); }
      if (contractType) { data = data.filter(r => r.contract_type === contractType); }
      if (status) { data = data.filter(r => r.status === status); }
      const pg = paginate(data, page, pageSize);
      return { __t: 'list', ...pg, message: '查询成功(内存模式)' };
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(title ILIKE $${params.length} OR contract_no ILIKE $${params.length})`); }
    if (contractType) { params.push(contractType); where.push(`contract_type=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_target_contracts WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    return list(listR.rows, parseInt(countR.rows[0].c), p, ps, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function contractExport() {
  try {
    if (!isConnected()) {
      const data = mem.contracts.filter(r => !r.is_deleted);
      return ok({ total: data.length, list: data }, '导出数据(内存模式)');
    }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_target_contracts WHERE is_deleted=false ORDER BY created_at DESC');
    return ok({ total: r.rows.length, list: r.rows }, '导出成功');
  } catch (e) { return err(-1, e.message); }
}

async function contractDetail(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) {
      const r = mem.contracts.find(x => x.id === id && !x.is_deleted);
      return r ? ok(r) : err(-2, '不存在');
    }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_target_contracts WHERE id=$1 AND is_deleted=false', [id]);
    return r.rows.length ? ok(r.rows[0]) : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function contractCreate(body) {
  try {
    const b = body;
    if (!isConnected()) {
      const rec = { id: mem.counters.contracts++, ...b, is_deleted: false, created_at: nowISO(), updated_at: nowISO() };
      mem.contracts.push(rec);
      return ok(rec, '创建成功(内存模式)');
    }
    await ensureTables();
    const keys = Object.keys(b); const vals = keys.map((_, i) => `$${i + 1}`);
    const r = await pool.query(`INSERT INTO hse_target_contracts(${keys.join(',')}) VALUES(${vals.join(',')}) RETURNING *`, keys.map(k => b[k]));
    return ok(r.rows[0], '创建成功');
  } catch (e) { return err(-1, e.message); }
}

async function contractUpdate(idRaw, body) {
  try {
    const id = parseInt(idRaw); const b = body;
    if (!isConnected()) {
      const idx = mem.contracts.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return err(-2, '不存在');
      Object.assign(mem.contracts[idx], b, { updated_at: nowISO() });
      return ok(mem.contracts[idx], '更新成功(内存模式)');
    }
    await ensureTables();
    const keys = Object.keys(b); const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
    const r = await pool.query(`UPDATE hse_target_contracts SET ${sets}, updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => b[k]), id]);
    return r.rows.length ? ok(r.rows[0], '更新成功') : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function contractDelete(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) {
      const r = mem.contracts.find(x => x.id === id && !x.is_deleted);
      if (r) r.is_deleted = true;
      return ok(null, '删除成功(内存模式)');
    }
    await pool.query('UPDATE hse_target_contracts SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 5. committees
// ============================================================
async function committeeStats() {
  try {
    if (!isConnected()) {
      const data = mem.committees.filter(r => !r.is_deleted);
      return ok({ total: data.length, active: data.filter(r => r.status === 'active').length, safetyManager: data.filter(r => r.member_type === 'safety_manager').length, committeeMember: data.filter(r => r.member_type === 'committee_member').length }, '统计成功(内存模式)');
    }
    await ensureTables();
    const [totalR, activeR, smR, cmR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false AND status='active'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false AND member_type='safety_manager'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false AND member_type='committee_member'"),
    ]);
    return ok({ total: parseInt(totalR.rows[0].c), active: parseInt(activeR.rows[0].c), safetyManager: parseInt(smR.rows[0].c), committeeMember: parseInt(cmR.rows[0].c) }, '统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function committeeList(query) {
  try {
    const { page, pageSize, keyword, memberType, status } = query;
    if (!isConnected()) {
      let data = mem.committees.filter(r => !r.is_deleted).map(committeeToCamel);
      if (keyword) data = data.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (memberType) data = data.filter(r => r.memberType === memberType);
      if (status) data = data.filter(r => r.status === status);
      const pg = paginate(data, page, pageSize);
      return { __t: 'list', ...pg, message: '查询成功(内存模式)' };
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(employee_name ILIKE $${params.length} OR employee_no ILIKE $${params.length})`); }
    if (memberType) { params.push(memberType); where.push(`member_type=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_safety_committee WHERE ${where.join(' AND ')} ORDER BY sort_order, created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    return list(listR.rows.map(committeeToCamel), parseInt(countR.rows[0].c), p, ps, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function committeeExport() {
  try {
    if (!isConnected()) {
      const data = mem.committees.filter(r => !r.is_deleted).map(committeeToCamel);
      return ok({ total: data.length, list: data }, '导出(内存)');
    }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_safety_committee WHERE is_deleted=false ORDER BY sort_order');
    return ok({ total: r.rows.length, list: r.rows.map(committeeToCamel) }, '导出成功');
  } catch (e) { return err(-1, e.message); }
}

async function committeeDetail(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) {
      const r = mem.committees.find(x => x.id === id && !x.is_deleted);
      return r ? ok(committeeToCamel(r)) : err(-2, '不存在');
    }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_safety_committee WHERE id=$1 AND is_deleted=false', [id]);
    return r.rows.length ? ok(committeeToCamel(r.rows[0])) : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function committeeCreate(body) {
  try {
    const b = body || {};
    const mapped = mapCommitteeBody(b);
    if (!isConnected()) {
      if (!mapped.employee_name) return err(-2, '姓名不能为空');
      const rec = {
        id: mem.counters.committees++,
        ...mapped,
        member_type: mapped.member_type || 'safety_manager',
        status: mapped.status || 'active',
        is_deleted: false,
        created_at: nowISO(),
        updated_at: nowISO(),
      };
      mem.committees.push(rec);
      return ok(committeeToCamel(rec), '创建成功(内存模式)');
    }
    await ensureTables();
    if (!mapped.employee_name) return err(-2, '姓名不能为空');
    if (!mapped.member_type) mapped.member_type = 'safety_manager';
    if (!mapped.status) mapped.status = 'active';
    const keys = Object.keys(mapped);
    const r = await pool.query(
      `INSERT INTO hse_safety_committee(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      keys.map((k) => mapped[k])
    );
    return ok(committeeToCamel(r.rows[0]), '创建成功');
  } catch (e) { return err(-1, e.message); }
}

async function committeeUpdate(idRaw, body) {
  try {
    const id = parseInt(idRaw);
    const b = body || {};
    const mapped = mapCommitteeBody(b);
    if (!isConnected()) {
      const idx = mem.committees.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return err(-2, '不存在');
      Object.assign(mem.committees[idx], mapped, { updated_at: nowISO() });
      return ok(committeeToCamel(mem.committees[idx]), '更新成功(内存模式)');
    }
    await ensureTables();
    if (Object.keys(mapped).length === 0) return err(-2, '没有可更新字段');
    const sets = Object.keys(mapped).map((k, i) => `${k}=$${i + 1}`).join(',');
    const r = await pool.query(
      `UPDATE hse_safety_committee SET ${sets}, updated_at=CURRENT_TIMESTAMP WHERE id=$${Object.keys(mapped).length + 1} AND is_deleted=false RETURNING *`,
      [...Object.keys(mapped).map((k) => mapped[k]), id]
    );
    return r.rows.length ? ok(committeeToCamel(r.rows[0]), '更新成功') : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function committeeDelete(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) { const r = mem.committees.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return ok(null, '删除成功(内存)'); }
    await pool.query('UPDATE hse_safety_committee SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 6. responsibilities（责任制考核）
// ============================================================
async function responsibilityStats() {
  try {
    const grades = getAssessmentGradesTR();
    if (!isConnected()) {
      const data = mem.responsibilities.filter(r => !r.is_deleted);
      const byGrade = {};
      grades.forEach(g => byGrade[g] = data.filter(r => r.grade === g).length);
      return ok({ total: data.length, byGrade, excellentRate: data.length > 0 ? Math.round((byGrade.excellent / data.length) * 100) : 0, failCount: byGrade.fail || 0 }, '统计成功(内存模式)');
    }
    await ensureTables();
    const totalR = await pool.query('SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE is_deleted=false');
    const gradePromises = grades.map(g => pool.query('SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE is_deleted=false AND grade=$1', [g]));
    const gradeResults = await Promise.all(gradePromises);
    const byGrade = {};
    grades.forEach((g, i) => byGrade[g] = parseInt(gradeResults[i].rows[0].c));
    const total = parseInt(totalR.rows[0].c);
    return ok({ total, byGrade, excellentRate: total > 0 ? Math.round(((byGrade.excellent || 0) / total) * 100) : 0, failCount: byGrade.fail || 0 }, '统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function responsibilityList(query) {
  try {
    const { page, pageSize, keyword, grade, status, periodYear } = query;
    if (!isConnected()) {
      let data = mem.responsibilities.filter(r => !r.is_deleted);
      if (keyword) data = data.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (grade) data = data.filter(r => r.grade === grade);
      if (status) data = data.filter(r => r.status === status);
      if (periodYear) data = data.filter(r => r.period_year === parseInt(periodYear));
      const pg = paginate(data, page, pageSize);
      return { __t: 'list', ...pg, message: '查询成功(内存模式)' };
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(employee_name ILIKE $${params.length} OR employee_no ILIKE $${params.length})`); }
    if (grade) { params.push(grade); where.push(`grade=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    if (periodYear) { params.push(parseInt(periodYear)); where.push(`period_year=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_responsibility_assessment WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    return list(listR.rows.map(responsibilityToCamel), parseInt(countR.rows[0].c), p, ps, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function responsibilityDetail(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) { const r = mem.responsibilities.find(x => x.id === id && !x.is_deleted); return r ? ok(r) : err(-2, '不存在'); }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_responsibility_assessment WHERE id=$1 AND is_deleted=false', [id]);
    return r.rows.length ? ok(responsibilityToCamel(r.rows[0])) : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function responsibilityCreate(body) {
  try {
    const mapped = toResponsibilitySnake(body);
    if (!isConnected()) { const rec = { id: mem.counters.responsibilities++, ...mapped, is_deleted: false, created_at: nowISO(), updated_at: nowISO() }; mem.responsibilities.push(rec); return ok(rec, '创建(内存)'); }
    await ensureTables();
    const keys = Object.keys(mapped);
    const r = await pool.query(`INSERT INTO hse_responsibility_assessment(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => mapped[k]));
    return ok(responsibilityToCamel(r.rows[0]), '创建成功');
  } catch (e) { return err(-1, e.message); }
}

async function responsibilityUpdate(idRaw, body) {
  try {
    const id = parseInt(idRaw); const mapped = toResponsibilitySnake(body);
    if (!isConnected()) {
      const idx = mem.responsibilities.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return err(-2, '不存在');
      Object.assign(mem.responsibilities[idx], mapped, { updated_at: nowISO() });
      return ok(mem.responsibilities[idx], '更新(内存)');
    }
    await ensureTables();
    const keys = Object.keys(mapped);
    const r = await pool.query(`UPDATE hse_responsibility_assessment SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => mapped[k]), id]);
    return r.rows.length ? ok(responsibilityToCamel(r.rows[0]), '更新成功') : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function responsibilityDelete(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) { const r = mem.responsibilities.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return ok(null, '删除(内存)'); }
    await pool.query('UPDATE hse_responsibility_assessment SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 7. budgets
// ============================================================
async function budgetStats(query) {
  try {
    const { keyword, category, budgetYear, year, status } = query;
    const effectiveBudgetYear = budgetYear || year;
    if (!isConnected()) {
      let data = mem.budgets.filter(r => !r.is_deleted);
      if (keyword) data = data.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (category) data = data.filter(r => r.category === category);
      const by = parseInt(effectiveBudgetYear); if (effectiveBudgetYear && !isNaN(by)) data = data.filter(r => r.budget_year === by);
      if (status) data = data.filter(r => r.status === status);
      const planTotal = data.reduce((s, r) => {
        const annual = parseFloat(r.annual_plan_total);
        if (annual > 0) return s + annual;
        return s + (parseFloat(r.plan_total) || (parseFloat(r.plan_quantity) || 0) * (parseFloat(r.plan_unit_price) || 0));
      }, 0);
      const useExpend = by && by >= 2026;
      const spentTotal = data.reduce((s, r) => {
        if (useExpend) {
          const ae = parseFloat(r.actual_expenditure_total);
          if (ae > 0) return s + ae;
          const aq = parseFloat(r.actual_expenditure_quantity) || 0, au = parseFloat(r.actual_expenditure_unit_price) || 0;
          return s + aq * au;
        }
        const actualTotal = parseFloat(r.actual_total);
        if (actualTotal > 0) return s + actualTotal;
        const spent = parseFloat(r.spent_amount) || 0;
        const actual = (parseFloat(r.actual_quantity) || 0) * (parseFloat(r.actual_unit_price) || 0);
        return s + (spent > 0 ? spent / 10000 : actual);
      }, 0);
      const warnItems = data.filter(r => calcBudgetStatus(r.budget_amount, r.spent_amount).status === 'warning').length;
      return ok({ total: data.length, planTotal: Math.round(planTotal * 10000) / 10000, spentTotal: Math.round(spentTotal * 10000) / 10000, executionRate: planTotal > 0 ? Math.round((spentTotal / planTotal) * 100) : 0, warningItems: warnItems }, '统计(内存)');
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(project_name ILIKE $${params.length} OR item_name ILIKE $${params.length} OR measure_item ILIKE $${params.length} OR budget_code ILIKE $${params.length})`); }
    if (category) { params.push(category); where.push(`category=$${params.length}`); }
    const by = parseInt(effectiveBudgetYear); if (effectiveBudgetYear && !isNaN(by)) { params.push(by); where.push(`budget_year=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    const whereSql = where.join(' AND ');
    const [totalR, sumR, allR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_safety_budget WHERE ${whereSql}`, params),
      pool.query(`SELECT
        COALESCE(NULLIF(MAX(annual_plan_total), 0), 0)::numeric AS apt,
        COALESCE(SUM(plan_total), 0)::numeric AS pt,
        COALESCE(SUM(actual_total), 0)::numeric AS at,
        COALESCE(SUM(actual_expenditure_total), 0)::numeric AS aet,
        COALESCE(SUM(CASE WHEN COALESCE(spent_amount, 0) > 0 THEN spent_amount / 10000.0 ELSE COALESCE(actual_quantity * actual_unit_price, 0) END), 0)::numeric AS st
      FROM hse_safety_budget WHERE ${whereSql}`, params),
      pool.query(`SELECT budget_amount, spent_amount FROM hse_safety_budget WHERE ${whereSql}`, params),
    ]);
    const sumRow = sumR.rows[0];
    const annualPlanTotal = parseFloat(sumRow.apt) || 0;
    const planTotal = annualPlanTotal > 0 ? annualPlanTotal : (parseFloat(sumRow.pt) || 0);
    const actualTotalSum = parseFloat(sumRow.at) || 0;
    const actualExpendSum = parseFloat(sumRow.aet) || 0;
    const useExpenditure = by && by >= 2026;
    const st = useExpenditure ? actualExpendSum : (actualTotalSum > 0 ? actualTotalSum : (parseFloat(sumRow.st) || 0));
    const warn = getBudgetWarningThreshold();
    let warningItems = 0;
    allR.rows.forEach(row => {
      const b = parseFloat(row.budget_amount) || 0; const s = parseFloat(row.spent_amount) || 0;
      if (b > 0 && (s / b) * 100 >= warn) warningItems++;
    });
    return ok({ total: parseInt(totalR.rows[0].c), planTotal: Math.round(planTotal * 10000) / 10000, spentTotal: Math.round(st * 10000) / 10000, executionRate: planTotal > 0 ? Math.round((st / planTotal) * 100) : 0, warningItems }, '统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function budgetList(query) {
  try {
    const { page, pageSize, keyword, category, budgetYear, year, status } = query;
    const effectiveBudgetYear = budgetYear || year;
    if (!isConnected()) {
      let data = mem.budgets.filter(r => !r.is_deleted);
      if (keyword) data = data.filter(r => JSON.stringify(r).toLowerCase().includes(keyword.toLowerCase()));
      if (category) data = data.filter(r => r.category === category);
      const by = parseInt(effectiveBudgetYear); if (effectiveBudgetYear && !isNaN(by)) data = data.filter(r => r.budget_year === by);
      if (status) data = data.filter(r => r.status === status);
      data.sort((a, b) => (b.plan_time || '').localeCompare(a.plan_time || ''));
      const pg = paginate(data, page, pageSize);
      return { __t: 'list', ...pg, message: '查询(内存)' };
    }
    await ensureTables();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`(project_name ILIKE $${params.length} OR item_name ILIKE $${params.length} OR measure_item ILIKE $${params.length} OR budget_code ILIKE $${params.length})`); }
    if (category) { params.push(category); where.push(`category=$${params.length}`); }
    const by = parseInt(effectiveBudgetYear); if (effectiveBudgetYear && !isNaN(by)) { params.push(by); where.push(`budget_year=$${params.length}`); }
    if (status) { params.push(status); where.push(`status=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_safety_budget WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_safety_budget WHERE ${where.join(' AND ')} ORDER BY plan_time DESC NULLS LAST, created_at DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    const data = listR.rows.map(row => {
      const b = parseFloat(row.budget_amount) || 0; const s = parseFloat(row.spent_amount) || 0;
      return { ...budgetToCamel(row), ...calcBudgetStatus(b, s) };
    });
    return list(data, parseInt(countR.rows[0].c), p, ps, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function budgetExport() {
  try {
    if (!isConnected()) return ok({ total: mem.budgets.filter(r => !r.is_deleted).length, list: mem.budgets.filter(r => !r.is_deleted) }, '导出(内存)');
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_safety_budget WHERE is_deleted=false ORDER BY plan_time DESC NULLS LAST, budget_year DESC');
    return ok({ total: r.rows.length, list: r.rows }, '导出成功');
  } catch (e) { return err(-1, e.message); }
}

async function budgetDetail(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) { const r = mem.budgets.find(x => x.id === id && !x.is_deleted); return r ? ok(r) : err(-2, '不存在'); }
    await ensureTables();
    const r = await pool.query('SELECT * FROM hse_safety_budget WHERE id=$1 AND is_deleted=false', [id]);
    if (!r.rows.length) return err(-2, '不存在');
    const row = r.rows[0];
    return ok({ ...budgetToCamel(row), ...calcBudgetStatus(parseFloat(row.budget_amount) || 0, parseFloat(row.spent_amount) || 0) });
  } catch (e) { return err(-1, e.message); }
}

async function budgetCreate(body) {
  try {
    const b = body;
    if (!isConnected()) { const rec = { id: mem.counters.budgets++, ...b, is_deleted: false, created_at: nowISO(), updated_at: nowISO() }; mem.budgets.push(rec); return ok(rec, '创建(内存)'); }
    await ensureTables();
    const fm = budgetToSnake(b);
    const keys = Object.keys(fm);
    const r = await pool.query(`INSERT INTO hse_safety_budget(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => fm[k]));
    return ok(budgetToCamel(r.rows[0]), '创建成功');
  } catch (e) { return err(-1, e.message); }
}

async function budgetUpdate(idRaw, body) {
  try {
    const id = parseInt(idRaw); const b = body;
    if (!isConnected()) {
      const idx = mem.budgets.findIndex(x => x.id === id && !x.is_deleted);
      if (idx === -1) return err(-2, '不存在');
      Object.assign(mem.budgets[idx], b, { updated_at: nowISO() });
      return ok(mem.budgets[idx], '更新(内存)');
    }
    await ensureTables();
    const fm = budgetToSnake(b);
    const updates = [];
    const params = [];
    let idx = 1;
    for (const [k, v] of Object.entries(fm)) {
      if (v !== undefined) {
        updates.push(`${k}=$${idx}`);
        params.push(v);
        idx++;
      }
    }
    params.push(id);
    const r = await pool.query(`UPDATE hse_safety_budget SET ${updates.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${idx} RETURNING *`, params);
    return r.rows.length ? ok(budgetToCamel(r.rows[0]), '更新成功') : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function budgetDelete(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) { const r = mem.budgets.find(x => x.id === id && !x.is_deleted); if (r) r.is_deleted = true; return ok(null, '删除(内存)'); }
    await pool.query('UPDATE hse_safety_budget SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 8. 月度履职考核统计 + 统计总览 + 汇总
// ============================================================
async function monthlyStats() {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    if (!isConnected()) {
      return ok({ cycleCode: `HSE-CYCLE-${currentYear}${String(currentMonth).padStart(2, '0')}`, targetCount: 0, scoredCount: 0, completionRate: 0, excellentCount: 0, failCount: 0 }, '统计(内存模式)');
    }
    const cycleCode = `HSE-CYCLE-${currentYear}${String(currentMonth).padStart(2, '0')}`;
    const cycleR = await pool.query('SELECT * FROM hse_assessment_cycle WHERE cycle_code=$1 AND is_deleted=false LIMIT 1', [cycleCode]);
    if (!cycleR.rows.length) return ok({ cycleCode, targetCount: 0, scoredCount: 0, completionRate: 0, excellentCount: 0, failCount: 0 }, '当前周期未创建');
    const cycle = cycleR.rows[0];
    const grades = getAssessmentGradesTR();
    const gradePromises = grades.map(g => pool.query('SELECT COUNT(*)::int AS c FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=false AND grade=$2', [cycle.id, g]));
    const gradeResults = await Promise.all(gradePromises);
    const byGrade = {};
    grades.forEach((g, i) => byGrade[g] = parseInt(gradeResults[i].rows[0].c));
    const tc = parseInt(cycle.target_count) || 0;
    const sc = parseInt(cycle.scored_count) || 0;
    return ok({ cycleCode, targetCount: tc, scoredCount: sc, completionRate: tc > 0 ? Math.round((sc / tc) * 100) : 0, excellentCount: byGrade.excellent || 0, failCount: byGrade.fail || 0, byGrade }, '统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function statsOverview() {
  try {
    if (!isConnected()) {
      const c = mem.contracts.filter(r => !r.is_deleted);
      const signed = c.filter(r => r.status === 'signed').length;
      const cm = mem.committees.filter(r => !r.is_deleted);
      const b = mem.budgets.filter(r => !r.is_deleted);
      const bt = b.reduce((s, r) => s + (parseFloat(r.budget_amount) || 0), 0);
      const st = b.reduce((s, r) => s + (parseFloat(r.spent_amount) || 0), 0);
      const warn = getBudgetWarningThreshold();
      return ok({
        contracts: { total: c.length, signed, pending: c.filter(r => r.status === 'pending').length, signRate: c.length > 0 ? Math.round((signed / c.length) * 100) : 0 },
        committees: { total: cm.length, active: cm.filter(r => r.status === 'active').length, safetyManager: cm.filter(r => r.member_type === 'safety_manager').length, committeeMember: cm.filter(r => r.member_type === 'committee_member').length },
        responsibilities: { total: mem.responsibilities.filter(r => !r.is_deleted).length, excellentRate: 0, failCount: 0 },
        budgets: { total: b.length, budgetTotal: Math.round(bt * 100) / 100, spentTotal: Math.round(st * 100) / 100, executionRate: bt > 0 ? Math.round((st / bt) * 100) : 0, warningItems: b.filter(r => { const bb = parseFloat(r.budget_amount) || 0; const ss = parseFloat(r.spent_amount) || 0; return bb > 0 && (ss / bb) * 100 >= warn; }).length },
        monthly: { cycleCode: '', targetCount: 0, scoredCount: 0, completionRate: 0, excellentCount: 0, failCount: 0 },
      }, '总览统计(内存模式)');
    }
    await ensureTables();
    const now = new Date(); const cy = now.getFullYear(); const cm2 = String(now.getMonth() + 1).padStart(2, '0');
    const cycleCode = `HSE-CYCLE-${cy}${cm2}`;
    const [
      cTotal, cSigned, cPending,
      cmTotal, cmActive, smCount, cmCount,
      rTotal,
      bTotal, bSum,
      cycleR,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false AND status='signed'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false AND status='pending'"),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false'),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false AND status='active'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false AND member_type='safety_manager'"),
      pool.query("SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false AND member_type='committee_member'"),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_safety_budget WHERE is_deleted=false'),
      pool.query('SELECT COALESCE(SUM(budget_amount),0)::numeric AS bt, COALESCE(SUM(spent_amount),0)::numeric AS st FROM hse_safety_budget WHERE is_deleted=false'),
      pool.query('SELECT * FROM hse_assessment_cycle WHERE cycle_code=$1 AND is_deleted=false LIMIT 1', [cycleCode]).catch(() => ({ rows: [] })),
    ]);
    const ct = parseInt(cTotal.rows[0].c); const cs = parseInt(cSigned.rows[0].c); const cp = parseInt(cPending.rows[0].c);
    const rTotalN = parseInt(rTotal.rows[0].c);
    const bt = parseFloat(bSum.rows[0].bt); const st = parseFloat(bSum.rows[0].st);
    const allB = await pool.query('SELECT budget_amount, spent_amount FROM hse_safety_budget WHERE is_deleted=false');
    const warn = getBudgetWarningThreshold();
    let wi = 0;
    allB.rows.forEach(row => { const b = parseFloat(row.budget_amount) || 0; const s = parseFloat(row.spent_amount) || 0; if (b > 0 && (s / b) * 100 >= warn) wi++; });
    let monthly = { cycleCode, targetCount: 0, scoredCount: 0, completionRate: 0, excellentCount: 0, failCount: 0 };
    if (cycleR && cycleR.rows && cycleR.rows.length) {
      const cycle = cycleR.rows[0];
      try {
        const [exR, faR] = await Promise.all([
          pool.query("SELECT COUNT(*)::int AS c FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=false AND grade='excellent'", [cycle.id]),
          pool.query("SELECT COUNT(*)::int AS c FROM hse_assessment_target WHERE cycle_id=$1 AND is_deleted=false AND grade='fail'", [cycle.id]),
        ]);
        const tcount = parseInt(cycle.target_count) || 0; const scount = parseInt(cycle.scored_count) || 0;
        monthly = { cycleCode, targetCount: tcount, scoredCount: scount, completionRate: tcount > 0 ? Math.round((scount / tcount) * 100) : 0, excellentCount: parseInt(exR.rows[0].c), failCount: parseInt(faR.rows[0].c) };
      } catch (e) { /* ignore */ }
    }
    let excellentRate = 0; let failCount = 0;
    try {
      const [ex2, fa2] = await Promise.all([
        pool.query("SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE is_deleted=false AND grade='excellent'"),
        pool.query("SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE is_deleted=false AND grade='fail'"),
      ]);
      excellentRate = rTotalN > 0 ? Math.round((parseInt(ex2.rows[0].c) / rTotalN) * 100) : 0;
      failCount = parseInt(fa2.rows[0].c);
    } catch (e) { /* ignore */ }
    return ok({
      contracts: { total: ct, signed: cs, pending: cp, signRate: ct > 0 ? Math.round((cs / ct) * 100) : 0 },
      committees: { total: parseInt(cmTotal.rows[0].c), active: parseInt(cmActive.rows[0].c), safetyManager: parseInt(smCount.rows[0].c), committeeMember: parseInt(cmCount.rows[0].c) },
      responsibilities: { total: rTotalN, excellentRate, failCount },
      budgets: { total: parseInt(bTotal.rows[0].c), budgetTotal: Math.round(bt * 100) / 100, spentTotal: Math.round(st * 100) / 100, executionRate: bt > 0 ? Math.round((st / bt) * 100) : 0, warningItems: wi },
      monthly,
    }, '总览统计成功');
  } catch (e) { return err(-1, e.message); }
}

async function summaryStats() {
  try {
    if (!isConnected()) {
      return ok({
        totalContracts: mem.contracts.filter(r => !r.is_deleted).length,
        totalCommittees: mem.committees.filter(r => !r.is_deleted).length,
        totalResponsibilities: mem.responsibilities.filter(r => !r.is_deleted).length,
        totalBudgets: mem.budgets.filter(r => !r.is_deleted).length,
        budgetTotal: mem.budgets.filter(r => !r.is_deleted).reduce((s, r) => s + (parseFloat(r.budget_amount) || 0), 0),
      }, '统计(内存)');
    }
    await ensureTables();
    const [c, cm, r, b, bs] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM hse_target_contracts WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_safety_committee WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_responsibility_assessment WHERE is_deleted=false'),
      pool.query('SELECT COUNT(*)::int AS c FROM hse_safety_budget WHERE is_deleted=false'),
      pool.query('SELECT COALESCE(SUM(budget_amount),0)::numeric AS bt FROM hse_safety_budget WHERE is_deleted=false'),
    ]);
    return ok({
      totalContracts: parseInt(c.rows[0].c),
      totalCommittees: parseInt(cm.rows[0].c),
      totalResponsibilities: parseInt(r.rows[0].c),
      totalBudgets: parseInt(b.rows[0].c),
      budgetTotal: parseFloat(bs.rows[0].bt),
    }, '获取统计成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 9. 安全目标管理 (safety_goals)
// ============================================================
// 第二个 /stats：有安全目标则返回目标统计，否则透传 next() 交由第一个 /stats（summaryStats）处理
async function goalStats() {
  try {
    await ensureTables();
    const rows = await pool.query('SELECT * FROM safety_goals WHERE is_deleted=false');
    const list = rows.rows.map(goalToCamel);
    const total = list.length;
    const achieved = list.filter(g => g.status === 'achieved').length;
    const onTrack = list.filter(g => g.status === 'on_track').length;
    const atRisk = list.filter(g => g.status === 'at_risk').length;
    const behind = list.filter(g => g.status === 'behind').length;
    const avgProgress = total > 0 ? Math.round(list.reduce((s, g) => s + (g.progress || 0), 0) / total) : 0;
    if (total > 0) {
      return ok({ total, achieved, onTrack, atRisk, behind, avgProgress }, '安全目标统计');
    }
    return { __t: 'next' };
  } catch (e) { throw e; }
}

async function goalList(query) {
  const { page = 1, pageSize = 10, keyword, year, type, status, department } = query;
  const isGoalQuery = keyword !== undefined || year !== undefined || type !== undefined || status !== undefined || department !== undefined;
  if (!isGoalQuery && page == 1 && pageSize == 10) {
    await ensureTables();
    const check = await pool.query('SELECT COUNT(*)::int AS c FROM safety_goals WHERE is_deleted=false');
    if (parseInt(check.rows[0].c) === 0) {
      return ok({ module: '目标职责', menus: ['contracts', 'committees', 'responsibilities', 'budgets', 'monthly assessment'] }, '目标管理模块');
    }
  }
  try {
    await ensureTables();
    const where = ['is_deleted=false'];
    const params = [];
    let idx = 1;
    if (keyword) { where.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`); params.push(`%${keyword}%`); idx++; }
    if (year) { where.push(`year = $${idx}`); params.push(parseInt(year)); idx++; }
    if (type) { where.push(`type = $${idx}`); params.push(type); idx++; }
    if (status) { where.push(`status = $${idx}`); params.push(status); idx++; }
    if (department) { where.push(`department = $${idx}`); params.push(department); idx++; }
    const ps = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const p = Math.max(1, parseInt(page) || 1);
    const offset = (p - 1) * ps;
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM safety_goals WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM safety_goals WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${ps} OFFSET ${offset}`, params),
    ]);
    return list(listR.rows.map(goalToCamel), parseInt(countR.rows[0].c), p, ps, '获取安全目标列表成功');
  } catch (e) { return err(-1, e.message); }
}

async function goalDetail(idRaw) {
  try {
    await ensureTables();
    const id = parseInt(idRaw);
    const r = await pool.query('SELECT * FROM safety_goals WHERE id=$1 AND is_deleted=false', [id]);
    if (r.rows.length === 0) return err(-2, '目标不存在');
    return ok(goalToCamel(r.rows[0]), '获取成功');
  } catch (e) { return err(-1, e.message); }
}

async function goalCreate(body, userId) {
  try {
    await ensureTables();
    const b = body || {};
    const progress = b.targetValue > 0
      ? Math.min(100, Math.round(((b.currentValue || 0) / b.targetValue) * 100))
      : 0;
    const keys = ['title', 'year', 'type', 'target_value', 'current_value', 'unit', 'department', 'responsible_person', 'responsible_person_id', 'status', 'deadline', 'description', 'progress', 'remark', 'created_by'];
    const values = [
      b.title,
      b.year || new Date().getFullYear(),
      b.type || 'custom',
      b.targetValue ?? b.target_value ?? 0,
      b.currentValue ?? b.current_value ?? 0,
      b.unit || '%',
      b.department || null,
      b.responsiblePerson ?? b.responsible_person ?? null,
      (() => { const v = b.responsiblePersonId ?? b.responsible_person_id; const n = parseInt(v); return (v && !isNaN(n)) ? n : null; })(),
      b.status || 'on_track',
      b.deadline || null,
      b.description || null,
      b.progress ?? progress,
      b.remark || null,
      userId || null,
    ];
    const r = await pool.query(
      `INSERT INTO safety_goals(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      values
    );
    return ok(goalToCamel(r.rows[0]), '创建成功');
  } catch (e) { return err(-1, e.message); }
}

async function goalUpdate(idRaw, body, userId) {
  try {
    await ensureTables();
    const id = parseInt(idRaw);
    const b = body || {};
    const exist = await pool.query('SELECT * FROM safety_goals WHERE id=$1 AND is_deleted=false', [id]);
    if (exist.rows.length === 0) return err(-2, '目标不存在');
    const old = exist.rows[0];
    const fieldMap = {
      title: b.title, year: b.year, type: b.type,
      target_value: b.targetValue ?? b.target_value,
      current_value: b.currentValue ?? b.current_value,
      unit: b.unit, department: b.department,
      responsible_person: b.responsiblePerson ?? b.responsible_person,
      responsible_person_id: (() => { const v = b.responsiblePersonId ?? b.responsible_person_id; const n = parseInt(v); return (v && !isNaN(n)) ? n : null; })(),
      status: b.status, deadline: b.deadline, description: b.description,
      remark: b.remark,
    };
    const updates = [];
    const params = [];
    let idx = 1;
    for (const [k, v] of Object.entries(fieldMap)) {
      if (v !== undefined) {
        updates.push(`${k}=$${idx}`);
        params.push(v);
        idx++;
      }
    }
    const tv = fieldMap.target_value !== undefined ? fieldMap.target_value : old.target_value;
    const cv = fieldMap.current_value !== undefined ? fieldMap.current_value : old.current_value;
    if (b.progress !== undefined) {
      updates.push(`progress=$${idx}`);
      params.push(b.progress);
      idx++;
    } else if (tv > 0) {
      updates.push(`progress=$${idx}`);
      params.push(Math.min(100, Math.round((cv / tv) * 100)));
      idx++;
    }
    updates.push(`updated_at=CURRENT_TIMESTAMP`);
    if (userId) {
      updates.push(`updated_by=$${idx}`);
      params.push(userId);
      idx++;
    }
    params.push(id);
    const r = await pool.query(`UPDATE safety_goals SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, params);
    return ok(goalToCamel(r.rows[0]), '更新成功');
  } catch (e) { return err(-1, e.message); }
}

async function goalDelete(idRaw) {
  try {
    await ensureTables();
    const id = parseInt(idRaw);
    await pool.query('UPDATE safety_goals SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [id]);
    return ok(null, '删除成功');
  } catch (e) { return err(-1, e.message); }
}

// ============================================================
// 10. 花名册部门动态选项
// ============================================================
async function rosterDepartments() {
  try {
    if (!isConnected()) return ok([], '数据库未连接');
    const r = await pool.query(
      `SELECT DISTINCT org_name FROM v_employee_current
       WHERE org_name IS NOT NULL AND org_name <> '' AND is_current = true
       ORDER BY org_name`
    );
    const list = r.rows.map((x) => x.org_name).filter((v) => !!v);
    return ok(list, '查询成功');
  } catch (e) {
    return err(-1, e.message);
  }
}

// ============================================================
// 11. 安委会组织开展活动（committee-activities）
// ============================================================
async function committeeActivityList(query) {
  try {
    const { page, pageSize, keyword, activityType } = query;
    if (!isConnected()) return ok({ list: [], total: 0, page: 1, pageSize: 10 }, '查询成功(内存模式)');
    await ensureCommitteeActivityTable();
    const where = ['is_deleted=false']; const params = [];
    if (keyword) { params.push(`%${keyword}%`); where.push(`activity_name ILIKE $${params.length}`); }
    if (activityType) { params.push(activityType); where.push(`activity_type=$${params.length}`); }
    const p = Math.max(1, parseInt(page) || 1); const ps = Math.min(Math.max(1, parseInt(pageSize) || 20), 200);
    const [countR, listR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM hse_safety_committee_activity WHERE ${where.join(' AND ')}`, params),
      pool.query(`SELECT * FROM hse_safety_committee_activity WHERE ${where.join(' AND ')} ORDER BY activity_date DESC NULLS LAST, sort_order, id DESC LIMIT ${ps} OFFSET ${(p - 1) * ps}`, params),
    ]);
    return list(listR.rows.map(committeeActivityToCamel), parseInt(countR.rows[0].c), p, ps, '查询成功');
  } catch (e) { return err(-1, e.message); }
}

async function committeeActivityImportPdf(file) {
  try {
    if (!file) return err(-1, '请上传 PDF 文件');
    const validation = validateUploadedFile(file, 'pdf');
    if (!validation.valid) return err(-1, validation.error);
    return ok({
      storedName: file.filename,
      originalName: fixFilenameEncoding(file.originalname),
      fileSize: file.size,
    }, 'PDF 上传完成');
  } catch (e) {
    return err(-1, `PDF 上传失败: ${e.message}`);
  }
}

async function committeeActivityCreate(body) {
  try {
    const b = body;
    if (!b.activityName || !String(b.activityName).trim()) return err(-1, '请填写活动名称');
    if (!isConnected()) return err(-2, '数据库未连接');
    await ensureCommitteeActivityTable();
    const row = mapCommitteeActivityBody(b);
    const keys = Object.keys(row);
    const r = await pool.query(`INSERT INTO hse_safety_committee_activity(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => row[k]));
    return ok(committeeActivityToCamel(r.rows[0]), '创建成功');
  } catch (e) { return err(-1, e.message); }
}

async function committeeActivityUpdate(idRaw, body) {
  try {
    const id = parseInt(idRaw); const b = body;
    if (!isConnected()) return err(-2, '数据库未连接');
    await ensureCommitteeActivityTable();
    const row = mapCommitteeActivityBody(b);
    if (Object.keys(row).length === 0) return err(-1, '没有可更新字段');
    const keys = Object.keys(row);
    const r = await pool.query(`UPDATE hse_safety_committee_activity SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => row[k]), id]);
    return r.rows.length ? ok(committeeActivityToCamel(r.rows[0]), '更新成功') : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function committeeActivityDelete(idRaw) {
  try {
    const id = parseInt(idRaw);
    if (!isConnected()) return err(-2, '数据库未连接');
    await ensureCommitteeActivityTable();
    const r = await pool.query('UPDATE hse_safety_committee_activity SET is_deleted=true, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *', [id]);
    return r.rows.length ? ok(committeeActivityToCamel(r.rows[0]), '删除成功') : err(-2, '不存在');
  } catch (e) { return err(-1, e.message); }
}

async function committeeActivityTemplate() {
  try {
    const headers = ['序号', '年份', '日期', '会议名称', '会议地点', '参与人数', '备注'];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '安委会会议台账');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return {
      __t: 'file',
      buffer: buf,
      filename: '安委会活动导入模板.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  } catch (e) {
    throw e;
  }
}

async function committeeActivityImport(file) {
  try {
    if (!file) return err(-1, '请上传 Excel 文件');
    if (!isConnected()) return err(-2, '数据库未连接');
    await ensureCommitteeActivityTable();

    const buf = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
    if (!buf) return err(-1, '文件读取失败');

    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return err(-1, '文件无工作表');
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const cells = (rows[i] || []).map((c) => String(c).trim());
      if (cells.includes('会议名称')) { headerIdx = i; break; }
    }
    if (headerIdx === -1) {
      safeUnlink(file.path);
      return err(-1, '未找到表头（需包含“会议名称”列）');
    }
    const header = (rows[headerIdx] || []).map((c) => String(c).trim());
    const ci = {
      year: header.indexOf('年份'),
      date: header.indexOf('日期'),
      name: header.indexOf('会议名称'),
      location: header.indexOf('会议地点'),
      participants: header.indexOf('参与人数'),
      remark: header.indexOf('备注'),
    };
    if (ci.name === -1) {
      safeUnlink(file.path);
      return err(-1, '缺少“会议名称”列');
    }

    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const name = ci.name >= 0 ? String(row[ci.name] ?? '').trim() : '';
      if (!name) continue;
      records.push({
        activity_name: name,
        activity_type: '安委会会议',
        activity_date: normalizeXlsDate(ci.date >= 0 ? row[ci.date] : ''),
        host_department: '',
        participants: ci.participants >= 0 ? (parseInt(row[ci.participants], 10) || 0) : 0,
        location: ci.location >= 0 ? String(row[ci.location] ?? '').trim() : '',
        summary: '',
        remark: ci.remark >= 0 ? String(row[ci.remark] ?? '').trim() : '',
      });
    }

    if (records.length === 0) {
      safeUnlink(file.path);
      return err(-1, '没有可导入的有效数据（会议名称为空）');
    }

    let inserted = 0;
    for (const rec of records) {
      const keys = Object.keys(rec);
      await pool.query(
        `INSERT INTO hse_safety_committee_activity(${keys.join(',')}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(',')})`,
        keys.map((k) => rec[k]),
      );
      inserted++;
    }
    safeUnlink(file.path);
    return ok({ inserted, total: records.length }, `成功导入 ${inserted} 条安委会会议记录`);
  } catch (e) {
    return err(-1, `导入失败: ${e.message}`);
  }
}

// 文件定位：记录 ID → pdf_file / original_name；实际流式输出由 controller 负责（需触碰 res/fs 响应）
async function committeeActivityFileInfo(idRaw) {
  try {
    const id = parseInt(idRaw, 10);
    if (!Number.isInteger(id) || id <= 0) return err(404, '记录不存在');
    if (!isConnected()) return err(404, '记录不存在');
    const result = await pool.query('SELECT pdf_file, original_name FROM hse_safety_committee_activity WHERE id=$1 AND is_deleted=false', [id]);
    if (result.rows.length === 0) return err(404, '记录不存在');
    const row = result.rows[0];
    if (!row.pdf_file) return err(404, '暂无文档');
    return { __t: 'fileinfo', fileName: row.pdf_file, dispositionName: row.original_name || row.pdf_file };
  } catch (e) {
    return err(500, '文件读取失败');
  }
}

module.exports = {
  // 规则
  rules,
  // 责任书台账
  rosterStats,
  rosterStatus,
  employeeLookup,
  rosterCreate,
  rosterTemplate,
  rosterImport,
  rosterUnmatched,
  rosterDetail,
  rosterUpdate,
  rosterDelete,
  // 通用附件
  attachmentList,
  attachmentCreate,
  attachmentDelete,
  // contracts
  contractStats,
  contractList,
  contractExport,
  contractDetail,
  contractCreate,
  contractUpdate,
  contractDelete,
  // committees
  committeeStats,
  committeeList,
  committeeExport,
  committeeDetail,
  committeeCreate,
  committeeUpdate,
  committeeDelete,
  // responsibilities（责任制考核）
  responsibilityStats,
  responsibilityList,
  responsibilityDetail,
  responsibilityCreate,
  responsibilityUpdate,
  responsibilityDelete,
  // budgets
  budgetStats,
  budgetList,
  budgetExport,
  budgetDetail,
  budgetCreate,
  budgetUpdate,
  budgetDelete,
  // 统计
  monthlyStats,
  statsOverview,
  summaryStats,
  goalStats,
  // goals
  goalList,
  goalDetail,
  goalCreate,
  goalUpdate,
  goalDelete,
  // 花名册部门
  rosterDepartments,
  // 安委会活动
  committeeActivityList,
  committeeActivityImportPdf,
  committeeActivityCreate,
  committeeActivityUpdate,
  committeeActivityDelete,
  committeeActivityTemplate,
  committeeActivityImport,
  committeeActivityFileInfo,
  // 内存单例（供测试/扩展引用，等价原 routes/objectives.js 的 mem）
  memoryStores: mem,
};