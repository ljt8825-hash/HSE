/**
 * 保险模块共享辅助（从 routes/insurance.js 顶部/各子域迁移）
 * 供 vehicle / personnel / overage / attachments / other / policies / stats / policy-read 各子域复用。
 * 行为与原内联定义逐字节一致，不可在此存放路由 handler / express 依赖。
 * 内存降级存储（memoryStores / memoryCounters / memoryAttachments / memoryVersions）为单例，
 * 由各子域 service 共享，顶层 routes/insurance.js 亦导出同一引用供固定行为测试写入。
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { error } = require('../middleware/response');
const { pool, isConnected } = require('../config/db');
const { BUSINESS_DAY_SQL, getBusinessDayStr } = require('../services/businessDay');

// F1（提示词-131）：over_age_personnel.id_card 为 varchar(32)，密文长度 68，物理上无法存储；
// 统一策略：写入不加密（两条路由一致），读取仍挂 decryptMiddleware（对明文为 no-op）。
// R2（提示词-132）：导出 CSV 中身份证号脱敏（保留前4后4）。
function maskIdCard(v) {
  const s = String(v || '');
  if (!s) return '';
  if (s.length < 8) return '****';
  return `${s.slice(0, 4)}**********${s.slice(-4)}`;
}

// ========== 时效状态计算（保险到期/人员超龄） ==========
// 规则：基于 expire_date 计算
// - 过期：当前日期 > 到期日期
// - 临期：距到期日期 ≤ 30 天
// - 正常：距到期日期 > 30 天
// - 未知：无到期日期
// 任务13（车辆收敛）：使用 Asia/Shanghai 业务日，与人员保险 isPolicyActiveOnBusinessDay 口径一致
function calcExpiryStatus(expireDate, businessDay) {
  if (!expireDate) return 'unknown';
  const ed = new Date(expireDate);
  if (isNaN(ed.getTime())) return 'unknown';
  const todayStr = businessDay || getBusinessDayStr();
  const today = new Date(todayStr + 'T00:00:00+08:00');
  const edMidnight = new Date(ed.getFullYear() + '-' + String(ed.getMonth()+1).padStart(2,'0') + '-' + String(ed.getDate()).padStart(2,'0') + 'T00:00:00+08:00');
  const diffDays = Math.ceil((edMidnight - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'normal';
}

// ========== 附件/版本表初始化 ==========
let tablesInitialized = false;
async function ensureAttachmentTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_attachments (
        id            BIGSERIAL PRIMARY KEY,
        biz_type      VARCHAR(32) NOT NULL,
        biz_id        BIGINT NOT NULL,
        filename      VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type     VARCHAR(64) NOT NULL DEFAULT 'document',
        file_size     BIGINT NOT NULL DEFAULT 0,
        file_url      VARCHAR(512) NOT NULL,
        version       VARCHAR(32) NOT NULL DEFAULT '1.0',
        uploaded_by   VARCHAR(64),
        is_latest     BOOLEAN NOT NULL DEFAULT TRUE,
        is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_insurance_attachments_biz ON insurance_attachments(biz_type, biz_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_versions (
        id             BIGSERIAL PRIMARY KEY,
        biz_type       VARCHAR(32) NOT NULL,
        biz_id         BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_insurance_versions_biz ON insurance_versions(biz_type, biz_id)');

    const vehicleColumns = [
      { name: 'policy_holder', type: 'VARCHAR(200)', default: "''" },
      { name: 'registered_owner', type: 'VARCHAR(200)', default: "''" },
      { name: 'compulsory_start', type: 'DATE', default: 'NULL' },
      { name: 'compulsory_end', type: 'DATE', default: 'NULL' },
      { name: 'commercial_start', type: 'DATE', default: 'NULL' },
      { name: 'commercial_end', type: 'DATE', default: 'NULL' },
      { name: 'vehicle_damage_amount', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'vehicle_damage_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'third_party_amount', type: 'VARCHAR(50)', default: "''" },
      { name: 'third_party_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'passenger_amount', type: 'VARCHAR(50)', default: "''" },
      { name: 'passenger_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'commercial_total', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'compulsory_premium', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'vehicle_tax', type: 'DECIMAL(12,2)', default: '0' },
      { name: 'total_premium', type: 'DECIMAL(12,2)', default: '0' },
    ];

    for (const col of vehicleColumns) {
      try {
        await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT ${col.default}`);
      } catch (e) {
        logger.info(`[Insurance] vehicles.${col.name} skip:`, { message: e.message.substring(0, 60), stack: e.stack });
      }
    }

    tablesInitialized = true;
    logger.info('[Insurance] 附件/版本表已就绪，车辆保险字段已扩展');
  } catch (err) {
    logger.warn('[Insurance] 附件/版本表初始化失败:', { message: err.message, stack: err.stack });
  }
}

// ========== 内存降级存储（单例，各子域 service 共享引用） ==========
const memoryStores = {
  vehicle: [],
  personnel: [],
  overage: [],
  other: [],
  budget: [],
  pendingInsurance: [],
  policies: []
};
const memoryCounters = { vehicle: 1, personnel: 1, overage: 1, other: 1, budget: 1, pendingInsurance: 1, policies: 1 };
// 附件/版本内存存储
const memoryAttachments = [];
let memoryAttachmentIdCounter = 1;
const memoryVersions = [];
let memoryVersionIdCounter = 1;

function initMemoryData() {
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
}

// vehicles 表日期列：统一按本地时区输出 YYYY-MM-DD（兼容 Date / 字符串两种来源）
function toDateStr(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

// 厂牌车型清洗：去掉关键字前方的文字/字母/数字，仅保留关键字及其之后内容
function cleanModel(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const keywords = ['吸污车', '车厢可卸式垃圾车', '自装卸式垃圾车', '载货汽车'];
  let cut = -1;
  for (const kw of keywords) {
    const i = raw.indexOf(kw);
    if (i >= 0 && (cut === -1 || i < cut)) cut = i;
  }
  return cut >= 0 ? raw.slice(cut) : raw;
}

// 商业险合计兜底
function calcCommercialTotal(row) {
  const stored = parseFloat(row.commercial_total);
  if (stored > 0) return stored;
  return (parseFloat(row.third_party_premium) || 0)
       + (parseFloat(row.vehicle_damage_premium) || 0)
       + (parseFloat(row.passenger_premium) || 0);
}

// 保费合计兜底：按 交强险+商业险合计+车船税 重算
function calcTotalPremium(row) {
  const stored = parseFloat(row.total_premium);
  const expected = (parseFloat(row.compulsory_premium) || 0)
                + calcCommercialTotal(row)
                + (parseFloat(row.vehicle_tax) || 0);
  if (stored && Math.abs(stored - expected) <= 0.01) return stored;
  return expected;
}

function formatVehicle(row, businessDay) {
  const insuranceEnd = toDateStr(row.insurance_end);
  const commercialEnd = toDateStr(row.commercial_end);
  const compulsoryEnd = toDateStr(row.compulsory_end);
  // 取「最早到期」的非空险种日期
  const endCandidates = [commercialEnd, compulsoryEnd, insuranceEnd].filter(Boolean);
  const effEnd = endCandidates.length ? endCandidates.sort()[0] : null;
  return {
    id: row.id,
    plate: row.plate || '',
    vin: row.vin || '',
    engine_no: row.engine_no || '',
    reg_date: toDateStr(row.reg_date),
    model: cleanModel(row.model || ''),
    owner: row.owner || '',
    insurance_type: row.insurance_type || '',
    insurance_start: toDateStr(row.insurance_start),
    insurance_end: insuranceEnd,
    premium: parseFloat(row.premium) || 0,
    vehicle_type: row.vehicle_type || '',
    status: row.status || '在用',
    expiryStatus: calcExpiryStatus(effEnd, businessDay),
    remark: row.remark || '',
    policy_holder: row.policy_holder || '',
    registered_owner: row.registered_owner || '',
    compulsory_start: toDateStr(row.compulsory_start),
    compulsory_end: compulsoryEnd,
    commercial_start: toDateStr(row.commercial_start),
    commercial_end: commercialEnd,
    vehicle_damage_amount: row.vehicle_damage_amount ? parseFloat(row.vehicle_damage_amount) : 0,
    vehicle_damage_premium: parseFloat(row.vehicle_damage_premium) || 0,
    third_party_amount: row.third_party_amount || '',
    third_party_premium: parseFloat(row.third_party_premium) || 0,
    passenger_amount: row.passenger_amount || '',
    passenger_premium: parseFloat(row.passenger_premium) || 0,
    commercial_total: calcCommercialTotal(row),
    compulsory_premium: parseFloat(row.compulsory_premium) || 0,
    vehicle_tax: parseFloat(row.vehicle_tax) || 0,
    total_premium: calcTotalPremium(row),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/** 把 Date/字符串统一为 YYYY-MM-DD 业务日字符串 */
function toBusinessDayStr(input) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
  if (input == null) return getBusinessDayStr();
  return getBusinessDayStr(input);
}

/** 计算单个险种状态（任务7：统一口径） */
function calcInsuranceStatus({ isCurrent, startDate, expireDate } = {}, today) {
  const t = toBusinessDayStr(today);
  if (isCurrent !== true) return 'uninsured';
  const start = startDate ? toDateStr(startDate) : null;
  const exp = expireDate ? toDateStr(expireDate) : null;
  if (!start || !exp) return 'uninsured';
  if (start > exp) return 'uninsured';
  if (start > t) return 'uninsured';
  if (exp < t) return 'expired';
  const daysLeft = Math.ceil((new Date(`${exp}T00:00:00Z`) - new Date(`${t}T00:00:00Z`)) / 86400000);
  if (daysLeft <= 30) return 'expiring';
  return 'insured';
}

// 兼容旧签名（仅依据到期日；新代码请使用 calcInsuranceStatus）
function calcInsTypeStatus(expireDate) {
  return calcInsuranceStatus({ expireDate });
}

/** 记录排名（与 SQL ROW_NUMBER 等价） */
function insuranceRecordRank(rec, t) {
  const st = calcInsuranceStatus({ isCurrent: rec.is_current, startDate: rec.start_date, expireDate: rec.expire_date }, t);
  if (st === 'insured' || st === 'expiring') return 0;
  const dayStr = toBusinessDayStr(t);
  if (rec.is_current === true) {
    const start = rec.start_date ? toDateStr(rec.start_date) : null;
    const exp = rec.expire_date ? toDateStr(rec.expire_date) : null;
    const hasValidDates = start != null && exp != null && start <= exp;
    if (hasValidDates) {
      if (start > dayStr) return 1;
      if (exp < dayStr) return 2;
    }
  }
  return 3;
}

/** 内存模式确定性选单比较器 */
function compareInsuranceRecords(a, b, today) {
  const t = toBusinessDayStr(today);
  const ra = insuranceRecordRank(a, t);
  const rb = insuranceRecordRank(b, t);
  if (ra !== rb) return ra - rb;
  const ac = a.is_current === true ? 1 : 0;
  const bc = b.is_current === true ? 1 : 0;
  if (ac !== bc) return bc - ac;
  const ae = a.expire_date ? toDateStr(a.expire_date) : null;
  const be = b.expire_date ? toDateStr(b.expire_date) : null;
  if ((ae == null) !== (be == null)) return ae == null ? 1 : -1;
  if (ae !== be) return ae > be ? -1 : 1;
  const as = a.start_date ? toDateStr(a.start_date) : null;
  const bs = b.start_date ? toDateStr(b.start_date) : null;
  if ((as == null) !== (bs == null)) return as == null ? 1 : -1;
  if (as !== bs) return as > bs ? -1 : 1;
  return (b.id || 0) - (a.id || 0);
}

/** 从同 employee_id + 险种的多条记录中确定性选择一条用于展示 */
function pickBestInsuranceRecord(records, today) {
  if (!Array.isArray(records) || records.length === 0) return null;
  let best = records[0];
  for (let i = 1; i < records.length; i++) {
    if (compareInsuranceRecords(records[i], best, today) < 0) best = records[i];
  }
  return best;
}

/**
 * 单险种状态 SQL 共享构造（任务9，提示词09，唯一真值表）。
 * 与 JS calcInsuranceStatus 完全对应。
 */
function policyStateSql(alias) {
  const a = alias;
  const BD = BUSINESS_DAY_SQL;
  const hasValidDates = `${a}.start_date IS NOT NULL AND ${a}.expire_date IS NOT NULL AND ${a}.start_date <= ${a}.expire_date`;
  const active = `${a}.is_current = true AND ${hasValidDates} AND ${a}.start_date <= ${BD} AND ${a}.expire_date >= ${BD}`;
  const future = `${a}.is_current = true AND ${hasValidDates} AND ${a}.start_date > ${BD}`;
  const expired = `${a}.is_current = true AND ${hasValidDates} AND ${a}.expire_date < ${BD}`;
  const expiring = `${a}.is_current = true AND ${hasValidDates} AND ${a}.start_date <= ${BD} AND ${a}.expire_date >= ${BD} AND ${a}.expire_date <= ${BD} + INTERVAL '30 days'`;
  return { active, future, expired, expiring, hasValidDates };
}

function policyPivotSql(insuranceType) {
  const a = 'p';
  const st = policyStateSql(a);
  return `
      SELECT ${a}.* FROM (
        SELECT ${a}.*, ROW_NUMBER() OVER (
          PARTITION BY ${a}.employee_id
          ORDER BY
            CASE WHEN ${st.active} THEN 0
                 WHEN ${st.future} THEN 1
                 WHEN ${st.expired} THEN 2
                 ELSE 3
            END ASC,
            ${a}.is_current DESC, ${a}.expire_date DESC NULLS LAST,
            ${a}.start_date DESC NULLS LAST, ${a}.id DESC
        ) AS rn
        FROM personnel_insurance ${a}
        WHERE ${a}.insurance_type = '${insuranceType}' AND ${a}.is_deleted = false
      ) ${a} WHERE ${a}.rn = 1`;
}

/** SQL 当前有效表达式 */
function activePolicySql(alias) {
  return policyStateSql(alias).active;
}

/** SQL 快照不一致表达式 */
function snapshotMismatchSql(alias, ev) {
  return `(${alias}.id IS NOT NULL AND (COALESCE(${alias}.person_name,'') <> COALESCE(${ev}.name,'') OR COALESCE(${alias}.department,'') <> COALESCE(${ev}.org_name,'') OR COALESCE(${alias}.position,'') <> COALESCE(${ev}.position_name,'')))`;
}

/** 人员级互斥四态 SQL 构造（任务9，提示词09） */
function personLevelSql(aliasEmp, aliasInj) {
  const BD = BUSINESS_DAY_SQL;
  const empState = policyStateSql(aliasEmp);
  const injState = policyStateSql(aliasInj);
  const expiring = `((${aliasEmp}.id IS NOT NULL AND ${empState.expiring}) OR (${aliasInj}.id IS NOT NULL AND ${injState.expiring}))`;
  const covered = `((${empState.active}) OR (${injState.active}))`;
  const hasExpired = `((${aliasEmp}.id IS NOT NULL AND ${empState.expired}) OR (${aliasInj}.id IS NOT NULL AND ${injState.expired}))`;
  return { expiring, covered, hasExpired };
}

// 花名册在职口径：JOIN employee 过滤 employment_relation = '正式员工'
const ACTIVE_ROSTER_JOIN = `JOIN employee emp_rel
  ON emp_rel.id = ev.employee_id
  AND emp_rel.is_deleted = false
  AND emp_rel.employment_relation = '正式员工'`;

/**
 * 人员保险人数口径 pivot SQL（/personnel/stats 与 /stats/overview.personnel 共用）
 */
function buildPersonnelStatsPivotSql() {
  const ps = personLevelSql('emp_piv', 'inj_piv');
  const cs = complianceStatusSql('emp_piv', 'inj_piv');
  return `
        WITH emp_piv AS (${policyPivotSql('雇主责任险')}),
        inj_piv AS (${policyPivotSql('工伤保险')})
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE ${ps.covered})::int AS covered,
          COUNT(*) FILTER (WHERE NOT (${ps.covered}) AND (${ps.hasExpired}))::int AS expired,
          COUNT(*) FILTER (WHERE NOT (${ps.covered}) AND NOT (${ps.hasExpired}))::int AS pending,
          COUNT(*) FILTER (WHERE ${ps.expiring})::int AS expiring,
          COUNT(*) FILTER (WHERE NOT ${cs})::int AS noncompliant
        FROM v_employee_current ev
        ${ACTIVE_ROSTER_JOIN}
        LEFT JOIN emp_piv ON emp_piv.employee_id = ev.employee_id
        LEFT JOIN inj_piv ON inj_piv.employee_id = ev.employee_id
        WHERE ev.employee_deleted = false`;
}

/** 人员级互斥四态 JS 纯函数 */
function calcPersonStatus(empStatus, injStatus) {
  const eExp = empStatus === 'expiring';
  const iExp = injStatus === 'expiring';
  const eAct = empStatus === 'insured' || eExp;
  const iAct = injStatus === 'insured' || iExp;
  if (eExp || iExp) return 'expiring';
  if (eAct || iAct) return 'insured';
  if (empStatus === 'expired' || injStatus === 'expired') return 'expired';
  return 'uninsured';
}

/** 合规判定（雇主险10万/80万档 + 工伤险按记录存在） */
function calcComplianceStatus({ employerStatus, injuryExists, empCoverage } = {}) {
  const empActive = employerStatus === 'insured' || employerStatus === 'expiring';
  const hasInj = injuryExists === true;
  const coverage = Number(empCoverage) || 0;
  if (empActive && coverage >= 800000) return 'compliant';
  if (empActive && coverage >= 100000 && hasInj) return 'compliant';
  if (hasInj && !empActive) return 'compliant';
  return 'noncompliant';
}

/** 合规判定 SQL 表达式 */
function complianceStatusSql(aliasEmp, aliasInj) {
  const empAct = activePolicySql(aliasEmp);
  const hasInj = `${aliasInj}.id IS NOT NULL`;
  return `((${empAct} AND COALESCE(${aliasEmp}.coverage_amount, 0) >= 800000) OR (${empAct} AND COALESCE(${aliasEmp}.coverage_amount, 0) >= 100000 AND ${hasInj}) OR (${hasInj} AND NOT (${empAct})))`;
}

// 人员保险（单条）格式化
function formatPersonnelIns(row, emp) {
  const insuranceStatus = calcInsuranceStatus({
    isCurrent: row.is_current,
    startDate: row.start_date,
    expireDate: row.expire_date,
  });
  const policyEndDate = row.expire_date ? toDateStr(row.expire_date) : null;
  const name = (emp && emp.name != null) ? emp.name : (row.person_name || '');
  const department = (emp && emp.department != null) ? emp.department : (row.department || row.dept || '');
  const position = (emp && emp.position != null) ? emp.position : (row.position || row.post || '');
  let syncStatus = 'missing';
  if (emp && emp.id != null) {
    const nameMatch = (emp.name || '') === (row.person_name || '');
    const deptMatch = (emp.department || '') === (row.department || row.dept || '');
    const posMatch = (emp.position || '') === (row.position || row.post || '');
    syncStatus = (nameMatch && deptMatch && posMatch) ? 'synced' : 'unsynced';
  }
  return {
    id: row.id,
    employeeId: row.employee_id ?? null,
    personnelId: row.personnel_id || null,
    name,
    idCard: row.id_card || row.idcard || '',
    phone: row.phone || '',
    department,
    position,
    workType: row.work_type || row.workType || '',
    isHighRisk: row.is_high_risk === true || row.isHighRisk === true,
    highRiskCategory: row.high_risk_category || row.highRiskCategory || undefined,
    employeeType: row.employee_type || row.employeeType || '',
    entryDate: row.entry_date ? toDateStr(row.entry_date) : null,
    insuranceStatus,
    expiryStatus: insuranceStatus === 'insured' ? 'normal'
      : insuranceStatus === 'expiring' ? 'expiring'
      : insuranceStatus === 'expired' ? 'expired' : 'unknown',
    insuranceType: row.insurance_type || '',
    policyNumber: row.policy_no || row.policyNumber || '',
    policyStartDate: row.start_date ? toDateStr(row.start_date) : null,
    policyEndDate,
    premium: parseFloat(row.premium) || 0,
    remark: row.remark || '',
    syncStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 人员保险透视格式化（一行=一人，雇主险+工伤险两列）
function formatPersonnelInsPivoted(row, emp) {
  const employerStatus = calcInsuranceStatus({
    isCurrent: row.emp_is_current,
    startDate: row.emp_start_date,
    expireDate: row.emp_expire_date,
  });
  const injuryStatus = calcInsuranceStatus({
    isCurrent: row.inj_is_current,
    startDate: row.inj_start_date,
    expireDate: row.inj_expire_date,
  });
  const name       = row.name || ((emp && emp.name != null)       ? emp.name       : (row.person_name || ''));
  const department = row.org_name || ((emp && emp.department != null) ? emp.department : (row.department || ''));
  const position   = row.position_name || ((emp && emp.position != null)   ? emp.position   : (row.position || ''));
  const gender     = row.gender || '';
  const age        = (row.age != null && row.age !== '') ? parseInt(row.age, 10) : null;
  const idCard = row.id_card || '';
  const hasAnyInsurance = row.emp_id != null || row.inj_id != null;
  let syncStatus = 'missing';
  if (hasAnyInsurance) {
    const snapshots = [];
    if (row.emp_id != null) snapshots.push({ name: row.emp_person_name, dept: row.emp_department, pos: row.emp_position });
    if (row.inj_id != null) snapshots.push({ name: row.inj_person_name, dept: row.inj_department, pos: row.inj_position });
    const allMatch = snapshots.every((s) =>
      (s.name || '') === (name || '') &&
      (s.dept || '') === (department || '') &&
      (s.pos || '') === (position || '')
    );
    syncStatus = allMatch ? 'synced' : 'unsynced';
  }
  const complianceStatus = calcComplianceStatus({ employerStatus, injuryExists: row.inj_id != null, empCoverage: row.emp_coverage });

  return {
    rowKey: `employee:${row.employee_id ?? row.employeeId ?? ''}`,
    employeeId: row.employee_id ?? row.employeeId ?? null,
    personName: name,
    idCard,
    department,
    position,
    entryDate: row.entry_date ? toDateStr(row.entry_date) : null,
    gender,
    age,
    personnelId: row.personnel_id || row.employee_id || null,
    employer: {
      id: row.emp_id || null,
      recordExists: row.emp_id != null,
      hasInsurance: employerStatus === 'insured' || employerStatus === 'expiring',
      isCurrent: row.emp_is_current === true,
      policyNo: row.emp_policy_no || '',
      startDate:  row.emp_start_date  ? toDateStr(row.emp_start_date) : null,
      expireDate: row.emp_expire_date ? toDateStr(row.emp_expire_date) : null,
      premium:  parseFloat(row.emp_premium)  || 0,
      coverage: parseFloat(row.emp_coverage) || 0,
      status: employerStatus,
    },
    injury: {
      id: row.inj_id || null,
      recordExists: row.inj_id != null,
      hasInsurance: row.inj_id != null,
      isCurrent: row.inj_is_current === true,
      policyNo: row.inj_policy_no || '',
      startDate:  row.inj_start_date  ? toDateStr(row.inj_start_date) : null,
      expireDate: row.inj_expire_date ? toDateStr(row.inj_expire_date) : null,
      premium:  parseFloat(row.inj_premium)  || 0,
      coverage: parseFloat(row.inj_coverage) || 0,
      status: injuryStatus,
    },
    personStatus: calcPersonStatus(employerStatus, injuryStatus),
    complianceStatus,
    syncStatus,
  };
}

// 超龄人员格式化
function formatOverage(row) {
  const expireDate = row.expire_date ? toDateStr(row.expire_date) : null;
  return {
    id: row.id,
    personnel_id: row.personnel_id || null,
    name: row.name || '',
    id_card: row.id_card || '',
    gender: row.gender || '',
    birth_date: row.birth_date ? toDateStr(row.birth_date) : null,
    age: row.age || 0,
    dept: row.dept || '',
    position: row.position || '',
    hire_date: row.hire_date ? toDateStr(row.hire_date) : null,
    person_type: row.person_type || '',
    control_type: row.control_type || '',
    is_to_optimize: row.is_to_optimize || false,
    actual_insurance: row.actual_insurance || '',
    has_injury: row.has_injury || false,
    has_employer: row.has_employer || false,
    compliance: row.compliance || '',
    expire_date: expireDate,
    expiryStatus: calcExpiryStatus(expireDate),
    optimize_status: row.optimize_status || '待处理',
    optimize_date: row.optimize_date ? toDateStr(row.optimize_date) : null,
    optimize_remark: row.optimize_remark || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// ========== other_insurance 表初始化 ==========
async function ensureOtherInsuranceTable() {
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS other_insurance (
        id              BIGSERIAL PRIMARY KEY,
        insurance_type  VARCHAR(64) NOT NULL,
        policy_no       VARCHAR(128),
        insured_subject VARCHAR(255),
        coverage_amount NUMERIC(15,2) DEFAULT 0,
        premium         NUMERIC(15,2) DEFAULT 0,
        start_date      DATE,
        expire_date     DATE,
        insurance_company VARCHAR(255),
        department      VARCHAR(128),
        contact_person  VARCHAR(64),
        contact_phone   VARCHAR(32),
        status          VARCHAR(32) DEFAULT '有效',
        remark          TEXT,
        is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_other_insurance_type ON other_insurance(insurance_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_other_insurance_expire ON other_insurance(expire_date)');
    await pool.query('ALTER TABLE other_insurance ADD COLUMN IF NOT EXISTS pdf_file VARCHAR(255)').catch(() => {});
  } catch (err) {
    logger.warn('[Insurance] other_insurance表初始化失败:', { message: err.message, stack: err.stack });
  }
}

function toDateString(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return v.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  }
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatOtherInsurance(row) {
  const startDate = toDateString(row.start_date);
  const expireDate = toDateString(row.expire_date);
  return {
    id: row.id,
    insuranceType: row.insurance_type || '',
    policyNo: row.policy_no || '',
    insuredSubject: row.insured_subject || '',
    coverageAmount: parseFloat(row.coverage_amount) || 0,
    premium: parseFloat(row.premium) || 0,
    startDate,
    expireDate,
    insuranceCompany: row.insurance_company || '',
    department: row.department || '',
    pdfFile: row.pdf_file || '',
    contactPerson: row.contact_person || '',
    contactPhone: row.contact_phone || '',
    status: row.status || '有效',
    expiryStatus: calcExpiryStatus(expireDate),
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ========== 从 PDF 文本提取其他保险关键字段 ==========
function extractOtherInsuranceFields(text) {
  if (!text || typeof text !== 'string') {
    return { policyNo: null, startDate: null, expireDate: null, insuranceCompany: null };
  }
  const t = text.replace(/\s+/g, ' ').trim();

  let policyNo = null;
  const policyPatterns = [
    /保险单号[：:\s]+([A-Za-z0-9\-]{5,50})/,
    /保单号码[：:\s]+([A-Za-z0-9\-]{5,50})/,
    /保单号[：:\s]+([A-Za-z0-9\-]{5,50})/,
    /Policy\s*No\.?[：:\s]+([A-Za-z0-9\-]{5,50})/i,
  ];
  for (const re of policyPatterns) {
    const m = t.match(re);
    if (m && m[1]) { policyNo = m[1].trim(); break; }
  }

  function normalizeDate(s) {
    if (!s) return null;
    const cleaned = s
      .replace(/[年月]/g, '-')
      .replace(/[日]/g, '')
      .replace(/\//g, '-')
      .replace(/\./g, '-')
      .replace(/\s+/g, '');
    const parts = cleaned.split('-');
    if (parts.length < 3) return null;
    const [y, m, d] = parts;
    if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    const date = new Date(`${y}-${mm}-${dd}`);
    if (isNaN(date.getTime())) return null;
    return `${y}-${mm}-${dd}`;
  }

  let startDate = null;
  let expireDate = null;

  const periodPatterns = [
    /保险期间[：:\s]*自\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)[\s起]*[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    /保险期限[：:\s]*自\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)[\s起]*[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    /保险期间[：:\s]*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)[\s起]*[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    /自\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)\s*[零]?时起[\s\S]{0,30}?[至到~]\s*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
  ];
  for (const re of periodPatterns) {
    const m = t.match(re);
    if (m && m[1] && m[2]) { startDate = normalizeDate(m[1]); expireDate = normalizeDate(m[2]); break; }
  }

  if (!startDate) {
    const startPatterns = [
      /(?:保险)?起期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /生效日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /起始日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /开始日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    ];
    for (const re of startPatterns) {
      const m = t.match(re);
      if (m && m[1]) { startDate = normalizeDate(m[1]); break; }
    }
  }
  if (!expireDate) {
    const endPatterns = [
      /(?:保险)?止期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /到期日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /终止日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /结束日期[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
      /保险届满[：:\s]+(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?)/,
    ];
    for (const re of endPatterns) {
      const m = t.match(re);
      if (m && m[1]) { expireDate = normalizeDate(m[1]); break; }
    }
  }

  let insuranceCompany = null;
  const companyPatterns = [
    /保险人[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /承保公司[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /保险公司[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /承保人[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
    /保险人名称[：:\s]+([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/,
  ];
  for (const re of companyPatterns) {
    const m = t.match(re);
    if (m && m[1]) { insuranceCompany = m[1].trim().replace(/\s+/g, ''); break; }
  }
  if (!insuranceCompany) {
    const fallback = t.match(/([\u4e00-\u9fa5]{2,20}(?:财产|责任|意外|健康)?保险(?:股份)?(?:有限)?公司)/);
    if (fallback && fallback[1]) insuranceCompany = fallback[1].trim();
  }

  return { policyNo, startDate, expireDate, insuranceCompany };
}

// ========== insurance_policies 表初始化 ==========
async function ensurePolicyTable() {
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS insurance_policies (
        id             BIGSERIAL PRIMARY KEY,
        name           VARCHAR(255) NOT NULL,
        type           VARCHAR(64) NOT NULL,
        policy_no      VARCHAR(64),
        year           VARCHAR(16),
        file_name      VARCHAR(255) NOT NULL,
        original_name  VARCHAR(255) NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_insurance_policies_type ON insurance_policies(type)');
    await pool.query(`ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policy_no VARCHAR(64)`);
    await pool.query(`ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS year VARCHAR(16)`);
  } catch (err) {
    logger.warn('[Insurance] insurance_policies表初始化失败:', { message: err.message, stack: err.stack });
  }
}

/** 服务端文件流返回（文件名来自记录的服务端字段，二次白名单 + 目录前缀校验） */
function streamInsuranceFile(res, fileName, { dispositionName } = {}) {
  if (!fileName || typeof fileName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    return res.status(404).json(error(404, '文件不存在'));
  }
  const insuranceDir = path.join(__dirname, '..', 'uploads', 'insurance');
  const filePath = path.join(insuranceDir, fileName);
  if (!filePath.startsWith(insuranceDir + path.sep)) {
    return res.status(400).json(error(400, '非法路径'));
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json(error(404, '文件不存在'));
  }
  res.setHeader('Content-Type', 'application/pdf');
  const safeName = dispositionName || fileName;
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = fs.createReadStream(filePath);
  let headersSent = false;
  res.on('finish', () => { headersSent = true; });
  stream.on('error', (err) => {
    logger.error('[Insurance] 保单文件流读取失败:', { message: err && err.message, stack: err && err.stack });
    if (!res.headersSent && !headersSent) {
      if (err && err.code === 'ENOENT') {
        return res.status(404).json(error(404, '文件不存在'));
      }
      return res.status(500).json(error(500, '文件读取失败'));
    }
    res.end();
  });
  stream.pipe(res);
}

module.exports = {
  // 存储单例
  memoryStores,
  memoryCounters,
  memoryAttachments,
  memoryVersions,
  initMemoryData,
  // 表初始化
  ensureAttachmentTables,
  ensureOtherInsuranceTable,
  ensurePolicyTable,
  // 纯格式化/工具
  toDateStr,
  toDateString,
  toBusinessDayStr,
  cleanModel,
  maskIdCard,
  calcExpiryStatus,
  calcCommercialTotal,
  calcTotalPremium,
  formatVehicle,
  calcInsuranceStatus,
  calcInsTypeStatus,
  insuranceRecordRank,
  compareInsuranceRecords,
  pickBestInsuranceRecord,
  calcPersonStatus,
  calcComplianceStatus,
  formatPersonnelIns,
  formatPersonnelInsPivoted,
  formatOverage,
  formatOtherInsurance,
  extractOtherInsuranceFields,
  streamInsuranceFile,
  // SQL 构造
  policyStateSql,
  policyPivotSql,
  activePolicySql,
  snapshotMismatchSql,
  personLevelSql,
  complianceStatusSql,
  buildPersonnelStatsPivotSql,
  ACTIVE_ROSTER_JOIN,
  BUSINESS_DAY_SQL,
  getBusinessDayStr,
};