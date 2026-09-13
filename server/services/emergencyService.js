/**
 * 应急管理模块（/api/emergency）—— 业务层
 * 原 routes/emergency.js（约 2550 行）全部业务 + SQL + 内存降级 + 建表逻辑收敛于此。
 * 每类端点对应一个 service 函数，返回统一描述符（__t: json / list / csv / not-found / validation-error），
 * 由 controllers/emergencyController.js 的 respond() 解释为对外 JSON 契约，行为与原路由逐字节一致。
 *
 * 覆盖端点：/plans /drills /stats /stats/overview /materials /teams /teams/generate
 *           /events 及通用附件 /:bizType/:id/attachments。
 * 存储：emergency_palns/drills/materials/teams/team_members/events/...attachments 表 + 内存降级。
 *
 * 与 accidents 域不同点：原 emergency.js 无「建表启动 IIFE」，各端点按需调用 ensureTables()/ensureAllTables()，
 * 故此处同样按需调用，不新增启动自检（保持原行为）。
 */

const { pool, isConnected } = require('../config/db');
const { auditLog } = require('../routes/audit');
const { paginateMemory, buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const { decrypt } = require('../utils/encryption');

// ========== 数据库表初始化（IF NOT EXISTS，可重复执行） ==========
let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    // 1. 预案附件表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_plan_attachments (
        id            BIGSERIAL PRIMARY KEY,
        plan_id       BIGINT NOT NULL,
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_plan_attachments_plan ON emergency_plan_attachments(plan_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_plan_attachments_latest ON emergency_plan_attachments(plan_id, is_latest) WHERE is_deleted = FALSE');

    // 2. 预案版本履历表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_plan_versions (
        id             BIGSERIAL PRIMARY KEY,
        plan_id        BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        snapshot       JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON emergency_plan_versions(plan_id)');

    tablesInitialized = true;
    console.log('[Emergency] 数据库表 attachments/versions 已就绪');
  } catch (err) {
    console.warn('[Emergency] 数据库表初始化失败:', err.message);
  }
}

// ========== 扩展数据库表初始化 ==========
async function ensureAllTables() {
  await ensureTables();
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_materials (
        id                BIGSERIAL PRIMARY KEY,
        name              VARCHAR(255) NOT NULL,
        category          VARCHAR(64),
        spec              VARCHAR(255),
        quantity          INT NOT NULL DEFAULT 0,
        location          VARCHAR(255),
        responsible_person VARCHAR(64),
        expire_date       DATE,
        remark            TEXT,
        is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_materials_category ON emergency_materials(category)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_materials_expire ON emergency_materials(expire_date)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_teams (
        id            BIGSERIAL PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        type          VARCHAR(64),
        department    VARCHAR(255),
        leader_id     BIGINT,
        leader_name   VARCHAR(64),
        contact_phone VARCHAR(32),
        description   TEXT,
        member_ids    BIGINT[] DEFAULT '{}',
        is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_team_members (
        id            BIGSERIAL PRIMARY KEY,
        team_id       BIGINT NOT NULL,
        employee_id   BIGINT,
        employee_name VARCHAR(64) NOT NULL,
        role          VARCHAR(64),
        phone         VARCHAR(32),
        is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_team_members_team ON emergency_team_members(team_id)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_events (
        id                BIGSERIAL PRIMARY KEY,
        title             VARCHAR(255) NOT NULL,
        event_type        VARCHAR(64),
        event_level       VARCHAR(32),
        happen_time       TIMESTAMPTZ,
        location          VARCHAR(255),
        reporter          VARCHAR(64),
        status            VARCHAR(32) DEFAULT 'reporting',
        response_process  TEXT,
        handling_measures TEXT,
        result            TEXT,
        related_plan_id   BIGINT,
        related_drill_id  BIGINT,
        remark            TEXT,
        is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_events_type ON emergency_events(event_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_events_status ON emergency_events(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_events_happen ON emergency_events(happen_time)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_attachments (
        id            BIGSERIAL PRIMARY KEY,
        biz_type      VARCHAR(32) NOT NULL,
        biz_id        BIGINT NOT NULL,
        filename      VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        file_type     VARCHAR(64) NOT NULL DEFAULT 'document',
        file_size     BIGINT NOT NULL DEFAULT 0,
        file_url      VARCHAR(512) NOT NULL,
        uploaded_by   VARCHAR(64),
        is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_attachments_biz ON emergency_attachments(biz_type, biz_id)');

    console.log('[Emergency] 扩展数据库表 materials/teams/events/attachments 已就绪');
  } catch (err) {
    console.warn('[Emergency] 扩展数据库表初始化失败:', err.message);
  }
}

// ========== 内存降级存储 ==========
let memoryPlans = [];
let memoryDrills = [];
let planIdCounter = 1;
let drillIdCounter = 1;
let memoryPlanAttachments = [];
let memoryPlanAttachmentIdCounter = 1;
let memoryPlanVersions = [];
let memoryPlanVersionIdCounter = 1;

let memoryMaterials = [];
let materialIdCounter = 1;
let memoryTeams = [];
let teamIdCounter = 1;
let memoryTeamMembers = [];
let teamMemberIdCounter = 1;
let memoryEvents = [];
let eventIdCounter = 1;
let memoryAttachments = [];
let memoryAttachmentIdCounter = 1;

function initMemoryData() {
  if (memoryPlans.length > 0) return;
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
  memoryPlans = [];
  memoryDrills = [];
  planIdCounter = 1;
  drillIdCounter = 1;
  memoryPlanAttachments = [];
  memoryPlanAttachmentIdCounter = 1;
  memoryPlanVersions = [];
  memoryPlanVersionIdCounter = 1;
}

function initMemoryDataAll() {
  initMemoryData();
}

// ========== 时效状态计算（临期/过期/正常） ==========
// 规则：基于 effective_date + validity_period(月) 计算到期日
// - 过期：当前日期 > 到期日
// - 临期：距到期日 ≤ 30 天（含已过期）
// - 正常：距到期日 > 30 天 或 长期有效（validity_period 为空）
function calcExpiryStatus(expiryDate) {
  if (!expiryDate) return 'permanent';
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'valid';
}

// ========== formatPlanRow: emergency_plans → 前端格式 ==========
function formatPlanRow(row) {
  const effectiveDate = row.effective_date || null;
  const validityPeriod = row.validity_period || null;
  return {
    id: Number(row.id),
    title: row.name || '',
    type: row.type || 'other',
    level: row.level || 'level4',
    status: row.status || 'active',
    department: row.responsible_dept || '',
    responsiblePerson: row.responsible_person || '',
    // P0-3: 预案责任人关联员工ID（花名册为基石）
    responsiblePersonId: row.responsible_person_id || null,
    contactPhone: row.contact_phone || '',
    description: row.description || '',
    procedures: row.plan_content || '',
    resources: row.remark || '',
    version: row.version || 'v1.0',
    location: row.location || '',
    planContent: row.plan_content || '',
    effectiveDate: effectiveDate,
    expiryDate: row.expiry_date || null,
    validityPeriod: validityPeriod,
    expiryStatus: calcExpiryStatus(row.expiry_date),
    lastDrillDate: row.last_drill_date || null,
    attachmentUrl: row.attachment_url || '',
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    responsible_dept: row.responsible_dept,
    responsible_person: row.responsible_person,
    contact_phone: row.contact_phone,
    plan_content: row.plan_content,
    effective_date: row.effective_date,
    expiry_date: row.expiry_date,
    validity_period: row.validity_period,
    last_drill_date: row.last_drill_date,
    attachment_url: row.attachment_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ========== formatDrillRow: emergency_drills → 前端格式 ==========
function formatDrillRow(row) {
  return camelKeys({
    id: Number(row.id),
    no: row.no || '',
    drillDate: row.drill_date,
    township: row.township || '',
    name: row.name || '',
    drillLevel: row.drill_level || '',
    drillType: row.drill_type || 'tabletop',
    participants: row.participants || 0,
    duration: row.duration || 0,
    location: row.location || '',
    organizer: row.organizer || '',
    result: row.result || 'pass',
    remark: row.remark || '',
    status: row.status || '已完成',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // 保留 snake_case 原始值供导出等场景使用
    drill_date: row.drill_date,
    drill_level: row.drill_level,
    drill_type: row.drill_type,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

// ========== 物资有效期状态计算 ==========
function readExpiringDays() {
  try {
    const fs = require('fs');
    const path = require('path');
    const rulePath = path.join(__dirname, '..', 'config', 'emergency-rule.json');
    if (fs.existsSync(rulePath)) {
      const rule = JSON.parse(fs.readFileSync(rulePath, 'utf-8'));
      if (rule.expiringDays) return parseInt(rule.expiringDays);
    }
  } catch (e) {}
  return 30;
}

function calcMaterialStatus(expireDate) {
  if (!expireDate) return 'normal';
  const exp = new Date(expireDate);
  if (isNaN(exp.getTime())) return 'normal';
  const now = new Date();
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  const expiringDays = readExpiringDays();
  if (diffDays <= expiringDays) return 'expiring';
  return 'normal';
}

// ========== formatMaterialRow ==========
function formatMaterialRow(row) {
  return {
    id: Number(row.id),
    name: row.name || '',
    category: row.category || '',
    spec: row.spec || '',
    quantity: row.quantity || 0,
    location: row.location || '',
    responsiblePerson: row.responsible_person || '',
    expireDate: row.expire_date ? (row.expire_date instanceof Date ? row.expire_date.toISOString().slice(0, 10) : String(row.expire_date).slice(0, 10)) : null,
    remark: row.remark || '',
    status: calcMaterialStatus(row.expire_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    responsible_person: row.responsible_person,
    expire_date: row.expire_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ========== formatTeamRow ==========
function formatTeamRow(row) {
  return {
    id: Number(row.id),
    name: row.name || '',
    type: row.type || '',
    department: row.department || '',
    leaderId: row.leader_id != null ? Number(row.leader_id) : null,
    leaderName: row.leader_name || '',
    contactPhone: row.contact_phone || '',
    description: row.description || '',
    memberIds: Array.isArray(row.member_ids) ? row.member_ids.map((x) => Number(x)) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leader_id: row.leader_id,
    leader_name: row.leader_name,
    contact_phone: row.contact_phone,
    member_ids: row.member_ids,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ========== formatTeamMemberRow ==========
function formatTeamMemberRow(row) {
  return {
    id: Number(row.id),
    teamId: Number(row.team_id),
    employeeId: row.employee_id != null ? Number(row.employee_id) : null,
    employeeName: row.employee_name || '',
    role: row.role || '',
    phone: row.phone || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    team_id: row.team_id,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ========== formatEventRow ==========
function formatEventRow(row) {
  return {
    id: Number(row.id),
    title: row.title || '',
    eventType: row.event_type || '',
    eventLevel: row.event_level || '',
    happenTime: row.happen_time || null,
    location: row.location || '',
    reporter: row.reporter || '',
    status: row.status || 'reporting',
    responseProcess: row.response_process || '',
    handlingMeasures: row.handling_measures || '',
    result: row.result || '',
    relatedPlanId: row.related_plan_id || null,
    relatedDrillId: row.related_drill_id || null,
    personnelId: row.personnel_id != null ? Number(row.personnel_id) : null,
    personnel_id: row.personnel_id,
    remark: row.remark || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    event_type: row.event_type,
    event_level: row.event_level,
    happen_time: row.happen_time,
    response_process: row.response_process,
    handling_measures: row.handling_measures,
    related_plan_id: row.related_plan_id,
    related_drill_id: row.related_drill_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ========== 辅助：创建版本记录 ==========
async function createPlanVersion(planId, version, changeType, changeSummary, changedBy) {
  try {
    if (!isConnected()) {
      memoryPlanVersions.push(buildMemoryRecord(memoryPlanVersionIdCounter++, {
        plan_id: planId,
        version: version || '1.0',
        change_type: changeType || 'update',
        change_summary: changeSummary || '',
        changed_by: changedBy || 'admin',
      }));
      return;
    }
    await pool.query(`
      INSERT INTO emergency_plan_versions (plan_id, version, change_type, change_summary, changed_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [planId, version || '1.0', changeType || 'update', changeSummary || '', changedBy || 'admin']);
  } catch (e) {
    console.warn('[Emergency] 创建版本记录失败:', e.message);
  }
}

// ========== CSV 导出辅助函数（返回 {writeHeaders, content}，由 controller 落响应头） ==========
function buildPlanCsvExport(data) {
  const headers = ['预案名称', '类型', '级别', '责任部门', '责任人', '联系电话', '生效日期', '到期日期', '状态', '备注'];
  const rows = data.map(r => [
    (r.name || r.title || '').replace(/"/g, '""'),
    r.type || '',
    r.level || '',
    r.responsible_dept || r.department || '',
    r.responsible_person || r.responsiblePerson || '',
    r.contact_phone || r.contactPhone || '',
    r.effective_date ? new Date(r.effective_date).toISOString().slice(0, 10) : '',
    r.expiry_date ? new Date(r.expiry_date).toISOString().slice(0, 10) : '',
    r.status || '',
    (r.remark || '').replace(/"/g, '""'),
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return {
    writeHeaders: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="emergency_plans_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
    content: csv,
  };
}

function buildDrillCsvExport(data) {
  const headers = ['编号', '演练日期', '乡镇', '名称', '演练级别', '演练类型', '参演人数', '时长(分钟)', '地点', '组织单位', '结果', '状态', '备注'];
  const rows = data.map(r => [
    r.no || '',
    r.drill_date ? (new Date(r.drill_date).toISOString().slice(0, 10)) : '',
    r.township || '',
    (r.name || '').replace(/"/g, '""'),
    r.drill_level || '',
    r.drill_type || '',
    r.participants || 0,
    r.duration || 0,
    r.location || '',
    r.organizer || '',
    r.result || '',
    r.status || '',
    (r.remark || '').replace(/"/g, '""'),
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return {
    writeHeaders: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="emergency_drills_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
    content: csv,
  };
}

function buildMaterialCsvExport(data) {
  const headers = ['ID', '物资名称', '分类', '规格', '数量', '存放位置', '负责人', '有效期', '状态', '备注', '创建时间'];
  const rows = data.map(r => [
    r.id || '',
    (r.name || '').replace(/"/g, '""'),
    r.category || '',
    r.spec || '',
    r.quantity || 0,
    r.location || '',
    r.responsible_person || r.responsiblePerson || '',
    r.expire_date ? new Date(r.expire_date).toISOString().slice(0, 10) : '',
    calcMaterialStatus(r.expire_date),
    (r.remark || '').replace(/"/g, '""'),
    r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  return {
    writeHeaders: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="emergency_materials_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
    content: csv,
  };
}

// ============================================================
// 应急预案 CRUD
// ============================================================

// ========== GET /plans/stats — 预案统计 ==========
async function planStats() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const plans = memoryPlans.filter(r => !r.is_deleted);
      return {
        __t: 'json',
        payload: {
          total: plans.length,
          published: plans.filter(p => p.status === 'active' || p.status === 'published').length,
          pendingReview: plans.filter(p => p.status === 'pending' || p.status === 'review').length,
          byType: {},
        },
        message: '统计成功(内存模式)',
      };
    }
    const [totalR, pubR, pendR, typeR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_plans WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false AND status IN ('active', 'published')"),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false AND status IN ('pending', 'review')"),
      pool.query("SELECT type, COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false GROUP BY type"),
    ]);
    const byType = {};
    typeR.rows.forEach(r => { byType[r.type || 'unknown'] = parseInt(r.count); });
    return {
      __t: 'json',
      payload: {
        total: parseInt(totalR.rows[0].total),
        published: parseInt(pubR.rows[0].count),
        pendingReview: parseInt(pendR.rows[0].count),
        byType,
      },
      message: '统计成功',
    };
  } catch (err) { console.error('[Emergency] 查询预案统计失败:', err.message); throw err; }
}

// ========== GET /plans — 预案列表 ==========
async function planList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, type, level, status } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryPlans.filter(r => !r.is_deleted);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.title && r.title.toLowerCase().includes(kw)) ||
          (r.description && r.description.toLowerCase().includes(kw))
        );
      }
      if (type) data = data.filter(r => r.type === type);
      if (level) data = data.filter(r => r.level === level);
      if (status) data = data.filter(r => r.status === status);
      const { list: rawList, total } = paginateMemory(data, pageNum, limitNum);
      const list = rawList.map(r => ({
        ...r,
        expiryStatus: calcExpiryStatus(r.expiryDate),
      }));
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx++} OR description ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (type) { conditions.push(`type = $${paramIdx++}`); params.push(type); }
    if (level) { conditions.push(`level = $${paramIdx++}`); params.push(level); }
    if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }

    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM emergency_plans ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM emergency_plans ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    return { __t: 'json', payload: { list: result.rows.map(formatPlanRow), total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询预案列表失败:', err.message);
    throw err;
  }
}

// ========== GET /plans/export — 导出预案清单（CSV） ==========
async function planExport() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryPlans.filter(r => !r.is_deleted).map(r => ({
        ...r,
        expiry_status: calcExpiryStatus(r.expiryDate),
      }));
      return { __t: 'csv', ...buildPlanCsvExport(data) };
    }

    const result = await pool.query(`
      SELECT id, name, type, level, responsible_dept, responsible_person,
             contact_phone, effective_date, expiry_date, status, remark
      FROM emergency_plans WHERE is_deleted = FALSE ORDER BY created_at DESC
    `);
    const list = result.rows.map(r => ({
      ...r,
      expiry_status: calcExpiryStatus(r.expiry_date),
    }));
    return { __t: 'csv', ...buildPlanCsvExport(list) };
  } catch (err) {
    console.error('[Emergency] 导出预案清单失败:', err.message);
    throw err;
  }
}

// ========== GET /plans/:id — 单条预案 ==========
async function planDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryPlans.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found' };
      return { __t: 'json', payload: record, message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM emergency_plans WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatPlanRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询预案详情失败:', err.message);
    throw err;
  }
}

// ========== POST /plans — 创建预案 ==========
async function planCreate(body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: planIdCounter++,
        title: b.title || '',
        type: b.type || 'other',
        level: b.level || 'level4',
        status: b.status || 'active',
        department: b.department || '',
        responsiblePerson: b.responsiblePerson || '',
        contactPhone: b.contactPhone || '',
        description: b.description || '',
        procedures: b.procedures || '',
        resources: b.resources || '',
        version: b.version || 'v1.0',
        location: b.location || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryPlans.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const result = await pool.query(`
      INSERT INTO emergency_plans (name, type, level, location, description, responsible_dept, responsible_person, contact_phone, plan_content, attachment_url, status, effective_date, expiry_date, last_drill_date, remark, responsible_person_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      b.title || b.name || '',
      b.type || 'other',
      b.level || 'level4',
      b.location || '',
      b.description || '',
      b.department || b.responsible_dept || '',
      b.responsiblePerson || b.responsible_person || '',
      b.contactPhone || b.contact_phone || '',
      b.procedures || b.planContent || b.plan_content || '',
      b.attachmentUrl || b.attachment_url || '',
      b.status || 'active',
      b.effectiveDate || b.effective_date || null,
      b.expiryDate || b.expiry_date || null,
      b.lastDrillDate || b.last_drill_date || null,
      b.remark || b.resources || '',
      b.responsiblePersonId || b.responsible_person_id || null,
    ]);

    await auditLog({ userId: audit.userId, username: audit.username, action: 'create', module: 'emergency', description: `创建应急预案: ${b.title || b.name}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatPlanRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[Emergency] 创建预案失败:', err.message);
    throw err;
  }
}

// ========== PUT /plans/:id — 更新预案 ==========
async function planUpdate(id, body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryPlans.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      Object.assign(memoryPlans[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryPlans[idx], message: '更新成功(内存模式)' };
    }

    const result = await pool.query(`
      UPDATE emergency_plans SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        level = COALESCE($3, level),
        location = COALESCE($4, location),
        description = COALESCE($5, description),
        responsible_dept = COALESCE($6, responsible_dept),
        responsible_person = COALESCE($7, responsible_person),
        contact_phone = COALESCE($8, contact_phone),
        plan_content = COALESCE($9, plan_content),
        attachment_url = COALESCE($10, attachment_url),
        status = COALESCE($11, status),
        effective_date = COALESCE($12, effective_date),
        expiry_date = COALESCE($13, expiry_date),
        last_drill_date = COALESCE($14, last_drill_date),
        remark = COALESCE($15, remark),
        responsible_person_id = COALESCE($16, responsible_person_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $17 AND is_deleted = false RETURNING *
    `, [
      b.title || b.name || null,
      b.type || null,
      b.level || null,
      b.location || null,
      b.description || null,
      b.department || b.responsible_dept || null,
      b.responsiblePerson || b.responsible_person || null,
      b.contactPhone || b.contact_phone || null,
      b.procedures || b.planContent || b.plan_content || null,
      b.attachmentUrl || b.attachment_url || null,
      b.status || null,
      b.effectiveDate || b.effective_date || null,
      b.expiryDate || b.expiry_date || null,
      b.lastDrillDate || b.last_drill_date || null,
      b.remark || b.resources || null,
      b.responsiblePersonId || b.responsible_person_id || null,
      id,
    ]);

    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: audit.userId, username: audit.username, action: 'update', module: 'emergency', description: `更新应急预案 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatPlanRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[Emergency] 更新预案失败:', err.message);
    throw err;
  }
}

// ========== DELETE /plans/:id — 删除预案 ==========
async function planDelete(id, audit) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryPlans.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    const result = await pool.query(
      'UPDATE emergency_plans SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };

    await auditLog({ userId: audit.userId, username: audit.username, action: 'delete', module: 'emergency', description: `删除应急预案 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Emergency] 删除预案失败:', err.message);
    throw err;
  }
}

// ============================================================
// 演练记录 CRUD
// ============================================================

// ========== GET /drills/stats — 演练统计 ==========
async function drillStats() {
  try {
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    if (!isConnected()) {
      initMemoryData();
      const drills = memoryDrills.filter(r => !r.is_deleted);
      const yearDrills = drills.filter(d => {
        const dd = new Date(d.drillDate || d.drill_date);
        return dd.getFullYear() === currentYear;
      });
      const passDrills = yearDrills.filter(d => d.result === 'pass' || d.result === 'excellent').length;
      const failDrills = yearDrills.filter(d => d.result && !['pass', 'excellent'].includes(d.result)).length;
      return {
        __t: 'json',
        payload: {
          total: drills.length,
          yearCount: yearDrills.length,
          passRate: yearDrills.length > 0 ? Math.round((passDrills / yearDrills.length) * 100) : 0,
          participantsTotal: drills.reduce((s, d) => s + (d.participants || 0), 0),
          failed: failDrills,
        },
        message: '统计成功(内存模式)',
      };
    }
    const [totalR, yearR, passR, partR, failR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_drills WHERE is_deleted = false'),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_drills WHERE is_deleted = false AND drill_date >= $1', [yearStart]),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_drills WHERE is_deleted = false AND drill_date >= $1 AND result IN ('pass', 'excellent')", [yearStart]),
      pool.query('SELECT COALESCE(SUM(participants), 0)::int AS total FROM emergency_drills WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_drills WHERE is_deleted = false AND drill_date >= $1 AND result NOT IN ('pass', 'excellent')", [yearStart]),
    ]);
    const yearCount = parseInt(yearR.rows[0].total);
    const passCount = parseInt(passR.rows[0].count);
    const failCount = parseInt(failR.rows[0].count);
    return {
      __t: 'json',
      payload: {
        total: parseInt(totalR.rows[0].total),
        yearCount,
        passRate: yearCount > 0 ? Math.round((passCount / yearCount) * 100) : 0,
        participantsTotal: parseInt(partR.rows[0].total),
        failed: failCount,
      },
      message: '统计成功',
    };
  } catch (err) { console.error('[Emergency] 查询演练统计失败:', err.message); throw err; }
}

// ========== GET /drills — 演练记录列表 ==========
async function drillList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, drillType, result: resultFilter, planId } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryDrills.filter(r => !r.is_deleted);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.township && r.township.toLowerCase().includes(kw)) ||
          (r.organizer && r.organizer.toLowerCase().includes(kw))
        );
      }
      if (drillType) data = data.filter(r => r.drillType === drillType);
      if (resultFilter) data = data.filter(r => r.result === resultFilter);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx++} OR township ILIKE $${paramIdx++} OR organizer ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (drillType) { conditions.push(`drill_type = $${paramIdx++}`); params.push(drillType); }
    if (resultFilter) { conditions.push(`result = $${paramIdx++}`); params.push(resultFilter); }

    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM emergency_drills ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM emergency_drills ${whereClause} ORDER BY drill_date DESC NULLS LAST, id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    return { __t: 'json', payload: { list: result.rows.map(formatDrillRow), total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询演练列表失败:', err.message);
    throw err;
  }
}

// ========== GET /drills/export — 导出演练记录（CSV） ==========
async function drillExport() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryDrills.filter(r => !r.is_deleted);
      return { __t: 'csv', ...buildDrillCsvExport(data) };
    }

    const result = await pool.query(`
      SELECT id, no, drill_date, township, name, drill_level, drill_type, participants,
             duration, location, organizer, result, remark, status, created_at
      FROM emergency_drills WHERE is_deleted = FALSE ORDER BY drill_date DESC NULLS LAST, id DESC
    `);
    return { __t: 'csv', ...buildDrillCsvExport(result.rows) };
  } catch (err) {
    console.error('[Emergency] 导出演练记录失败:', err.message);
    throw err;
  }
}

// ========== GET /drills/:id — 单条演练 ==========
async function drillDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryDrills.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found' };
      return { __t: 'json', payload: record, message: '查询成功(内存模式)' };
    }
    const result = await pool.query('SELECT * FROM emergency_drills WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatDrillRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询演练详情失败:', err.message);
    throw err;
  }
}

// ========== POST /drills — 创建演练记录 ==========
async function drillCreate(body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: drillIdCounter++,
        planId: b.planId || null,
        planTitle: b.planTitle || '',
        drillType: b.drillType || 'tabletop',
        drillDate: b.drillDate || new Date().toISOString().slice(0, 10),
        location: b.location || '',
        participants: b.participants || 0,
        duration: b.duration || 0,
        result: b.result || 'pass',
        summary: b.summary || '',
        improvements: b.improvements || '',
        evaluator: b.evaluator || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryDrills.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    const insertResult = await pool.query(`
      INSERT INTO emergency_drills (no, drill_date, township, name, drill_level, drill_type, participants, duration, location, organizer, result, remark, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      b.no || `DR${Date.now()}`,
      b.drillDate || b.drill_date || null,
      b.township || '',
      b.name || '',
      b.drillLevel || b.drill_level || '',
      b.drillType || b.drill_type || 'tabletop',
      b.participants || 0,
      b.duration || 0,
      b.location || '',
      b.organizer || '',
      b.result || 'pass',
      b.remark || '',
      b.status || '已完成',
    ]);

    await auditLog({ userId: audit.userId, username: audit.username, action: 'create', module: 'emergency', description: `创建演练记录: ${b.name || b.no}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatDrillRow(insertResult.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[Emergency] 创建演练记录失败:', err.message);
    throw err;
  }
}

// ========== PUT /drills/:id — 更新演练记录 ==========
async function drillUpdate(id, body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryDrills.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      Object.assign(memoryDrills[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryDrills[idx], message: '更新成功(内存模式)' };
    }

    const updateResult = await pool.query(`
      UPDATE emergency_drills SET
        no = COALESCE($1, no), drill_date = COALESCE($2, drill_date),
        township = COALESCE($3, township), name = COALESCE($4, name),
        drill_level = COALESCE($5, drill_level), drill_type = COALESCE($6, drill_type),
        participants = COALESCE($7, participants), duration = COALESCE($8, duration),
        location = COALESCE($9, location), organizer = COALESCE($10, organizer),
        result = COALESCE($11, result), remark = COALESCE($12, remark),
        status = COALESCE($13, status), updated_at = CURRENT_TIMESTAMP
      WHERE id = $14 AND is_deleted = false RETURNING *`,
      [b.no || null, b.drillDate || b.drill_date || null, b.township || null, b.name || null,
       b.drillLevel || b.drill_level || null, b.drillType || b.drill_type || null, b.participants || null,
       b.duration || null, b.location || null, b.organizer || null, b.result || null, b.remark || null,
       b.status || null, id]);

    if (updateResult.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: audit.userId, username: audit.username, action: 'update', module: 'emergency', description: `更新演练记录 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatDrillRow(updateResult.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[Emergency] 更新演练记录失败:', err.message);
    throw err;
  }
}

// ========== DELETE /drills/:id — 删除演练记录 ==========
async function drillDelete(id, audit) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryDrills.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    const result = await pool.query(
      'UPDATE emergency_drills SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };

    await auditLog({ userId: audit.userId, username: audit.username, action: 'delete', module: 'emergency', description: `删除演练记录 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Emergency] 删除演练记录失败:', err.message);
    throw err;
  }
}

// ============================================================
// 统计接口
// ============================================================
// ========== GET /stats/overview — 应急总览统计 ==========
async function statsOverview() {
  try {
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    if (!isConnected()) {
      initMemoryDataAll();
      const plans = memoryPlans.filter(r => !r.is_deleted);
      const drills = memoryDrills.filter(r => !r.is_deleted);
      const materials = memoryMaterials.filter(r => !r.is_deleted);
      const teams = memoryTeams.filter(r => !r.is_deleted);
      const teamMembers = memoryTeamMembers.filter(r => !r.is_deleted);
      const events = memoryEvents.filter(r => !r.is_deleted);
      const yearDrills = drills.filter(d => new Date(d.drillDate || d.drill_date).getFullYear() === currentYear);
      const yearEvents = events.filter(e => new Date(e.happenTime || e.happen_time).getFullYear() === currentYear);
      const passDrills = yearDrills.filter(d => d.result === 'pass' || d.result === 'excellent').length;
      return {
        __t: 'json',
        payload: {
          plans: { total: plans.length, published: plans.filter(p => p.status === 'active' || p.status === 'published').length, pendingReview: plans.filter(p => p.status === 'pending' || p.status === 'review').length },
          drills: { yearCount: yearDrills.length, passRate: yearDrills.length > 0 ? Math.round((passDrills / yearDrills.length) * 100) : 0 },
          materials: { total: materials.length, expiring: materials.filter(m => calcMaterialStatus(m.expireDate) === 'expiring').length, expired: materials.filter(m => calcMaterialStatus(m.expireDate) === 'expired').length },
          teams: { total: teams.length, memberCount: teamMembers.length },
          events: { yearCount: yearEvents.length, handling: yearEvents.filter(e => e.status !== 'closed' && e.status !== 'resolved').length },
        },
        message: '统计成功(内存模式)',
      };
    }
    await ensureAllTables();
    const [planTotalR, planPublishedR, planPendingR, drillYearR, drillPassR, materialTotalR, teamTotalR, teamMemberR, eventYearR, eventHandlingR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_plans WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false AND status IN ('active', 'published')"),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false AND status IN ('pending', 'review')"),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_drills WHERE is_deleted = false AND drill_date >= $1', [yearStart]),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_drills WHERE is_deleted = false AND drill_date >= $1 AND result IN ('pass', 'excellent')", [yearStart]),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_materials WHERE is_deleted = false'),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_teams WHERE is_deleted = false'),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_team_members WHERE is_deleted = false'),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_events WHERE is_deleted = false AND happen_time >= $1', [yearStart]),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_events WHERE is_deleted = false AND happen_time >= $1 AND status NOT IN ('closed', 'resolved')", [yearStart]),
    ]);
    const matResult = await pool.query('SELECT expire_date FROM emergency_materials WHERE is_deleted = false');
    const matList = matResult.rows.map(formatMaterialRow);
    const ydc = parseInt(drillYearR.rows[0].total);
    const pdc = parseInt(drillPassR.rows[0].count);
    return {
      __t: 'json',
      payload: {
        plans: { total: parseInt(planTotalR.rows[0].total), published: parseInt(planPublishedR.rows[0].count), pendingReview: parseInt(planPendingR.rows[0].count) },
        drills: { yearCount: ydc, passRate: ydc > 0 ? Math.round((pdc / ydc) * 100) : 0 },
        materials: { total: parseInt(materialTotalR.rows[0].total), expiring: matList.filter(m => m.status === 'expiring').length, expired: matList.filter(m => m.status === 'expired').length },
        teams: { total: parseInt(teamTotalR.rows[0].total), memberCount: parseInt(teamMemberR.rows[0].total) },
        events: { yearCount: parseInt(eventYearR.rows[0].total), handling: parseInt(eventHandlingR.rows[0].count) },
      },
      message: '统计成功',
    };
  } catch (err) { console.error('[Emergency] 查询总览统计失败:', err.message); throw err; }
}

// ========== GET /stats — 兼容统计 ==========
async function statsLegacy() {
  try {
    if (!isConnected()) {
      initMemoryData();
      const plans = memoryPlans.filter(r => !r.is_deleted);
      const drills = memoryDrills.filter(r => !r.is_deleted);
      const excellentCount = drills.filter(d => d.result === 'excellent').length;
      const participantsTotal = drills.reduce((sum, d) => sum + (d.participants || 0), 0);
      const byType = {};
      plans.forEach(p => { byType[p.type] = (byType[p.type] || 0) + 1; });

      return {
        __t: 'json',
        payload: {
          totalPlans: plans.length,
          activePlans: plans.filter(p => p.status === 'active').length,
          totalDrills: drills.length,
          excellentDrills: excellentCount,
          participantsTotal,
          byType,
        },
        message: '统计成功(内存模式)',
      };
    }

    const [planTotalR, planActiveR, drillTotalR, drillExcellentR, drillParticipantsR, planTypeR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_plans WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false AND status = 'active'"),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_drills WHERE is_deleted = false'),
      pool.query("SELECT COUNT(*)::int AS count FROM emergency_drills WHERE is_deleted = false AND result = 'excellent'"),
      pool.query('SELECT COALESCE(SUM(participants), 0)::int AS total FROM emergency_drills WHERE is_deleted = false'),
      pool.query("SELECT type, COUNT(*)::int AS count FROM emergency_plans WHERE is_deleted = false GROUP BY type"),
    ]);

    const byType = {};
    planTypeR.rows.forEach(r => { byType[r.type || 'unknown'] = parseInt(r.count); });
    return {
      __t: 'json',
      payload: {
        totalPlans: parseInt(planTotalR.rows[0].total),
        activePlans: parseInt(planActiveR.rows[0].count),
        totalDrills: parseInt(drillTotalR.rows[0].total),
        excellentDrills: parseInt(drillExcellentR.rows[0].count),
        participantsTotal: parseInt(drillParticipantsR.rows[0].total),
        byType,
      },
      message: '统计成功',
    };
  } catch (err) {
    console.error('[Emergency] 查询兼容统计失败:', err.message);
    throw err;
  }
}

// ============================================================
// 预案附件管理端点
// ============================================================

// ========== GET /plans/:id/attachments — 附件列表 ==========
async function planAttachments(id, query) {
  try {
    const { version = '' } = query;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryPlanAttachments.filter(a => a.plan_id === parseInt(id) && !a.is_deleted);
      if (version) data = data.filter(a => a.version === version);
      return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
    }

    await ensureTables();

    let sql = 'SELECT * FROM emergency_plan_attachments WHERE plan_id = $1 AND is_deleted = FALSE';
    const params = [id];
    let paramIdx = 1;
    if (version) {
      paramIdx++;
      sql += ` AND version = $${paramIdx}`;
      params.push(version);
    }
    sql += ' ORDER BY is_latest DESC, created_at DESC';

    const result = await pool.query(sql, params);
    return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询预案附件失败:', err.message);
    throw err;
  }
}

// ========== POST /plans/:id/attachments — 上传附件 ==========
async function planUploadAttachment({ id, body, file, fileUrl, originalName }) {
  try {
    if (!file) return { __t: 'json', error: { code: -1, message: '请上传文件' } };

    const { version = '1.0', uploaded_by = 'admin' } = body;

    if (!isConnected()) {
      initMemoryData();
      memoryPlanAttachments.forEach(a => {
        if (a.plan_id === parseInt(id) && a.is_latest) a.is_latest = false;
      });
      const record = buildMemoryRecord(memoryPlanAttachmentIdCounter++, {
        plan_id: parseInt(id),
        filename: file.filename,
        original_name: originalName,
        file_type: 'document',
        file_size: file.size,
        file_url: fileUrl,
        version,
        uploaded_by,
        is_latest: true,
      });
      memoryPlanAttachments.push(record);
      return { __t: 'json', payload: camelKeys(record), message: '上传成功(内存模式)' };
    }

    await ensureTables();

    await pool.query(
      'UPDATE emergency_plan_attachments SET is_latest = FALSE WHERE plan_id = $1 AND is_latest = TRUE',
      [id]
    );

    const result = await pool.query(`
      INSERT INTO emergency_plan_attachments (plan_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *
    `, [id, file.filename, originalName, 'document', file.size, fileUrl, version, uploaded_by]);

    return { __t: 'json', payload: camelKeys(result.rows[0]), message: '上传成功' };
  } catch (err) {
    console.error('[Emergency] 上传预案附件失败:', err.message);
    throw err;
  }
}

// ========== DELETE /plans/:id/attachments/:aid — 删除附件 ==========
async function planDeleteAttachment(id, aid) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const att = memoryPlanAttachments.find(a => a.id === parseInt(aid) && a.plan_id === parseInt(id) && !a.is_deleted);
      if (!att) return { __t: 'not-found', message: '附件不存在' };
      att.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    await ensureTables();

    const result = await pool.query(
      'UPDATE emergency_plan_attachments SET is_deleted = TRUE WHERE id = $1 AND plan_id = $2 RETURNING id',
      [aid, id]
    );
    if (result.rows.length === 0) return { __t: 'not-found', message: '附件不存在' };
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Emergency] 删除预案附件失败:', err.message);
    throw err;
  }
}

// ========== GET /plans/:id/versions — 历史版本履历 ==========
async function planVersions(id) {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryPlanVersions.filter(v => v.plan_id === parseInt(id));
      return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
    }

    await ensureTables();

    const result = await pool.query(
      'SELECT * FROM emergency_plan_versions WHERE plan_id = $1 ORDER BY created_at DESC',
      [id]
    );
    return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询预案版本失败:', err.message);
    throw err;
  }
}

// ============================================================
// 应急物资 CRUD
// ============================================================

// ========== GET /materials/list — 物资列表 ==========
async function materialList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, category, status } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryDataAll();
      let data = memoryMaterials.filter(r => !r.is_deleted);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.location && r.location.toLowerCase().includes(kw))
        );
      }
      if (category) data = data.filter(r => r.category === category);
      if (status) data = data.filter(r => calcMaterialStatus(r.expireDate) === status);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      const finalList = list.map(r => ({ ...r, status: calcMaterialStatus(r.expireDate) }));
      return { __t: 'list', list: finalList, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    await ensureAllTables();

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx++} OR location ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) { conditions.push(`category = $${paramIdx++}`); params.push(category); }

    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM emergency_materials ${whereClause}`, params);
    let total = countResult.rows[0].total;

    let listSql = `SELECT * FROM emergency_materials ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limitNum, offset);

    let result;
    if (status) {
      const allResult = await pool.query(`SELECT * FROM emergency_materials ${whereClause} ORDER BY created_at DESC`, params.slice(0, -2));
      const filtered = allResult.rows.map(formatMaterialRow).filter(r => r.status === status);
      total = filtered.length;
      result = { rows: filtered.slice(offset, offset + limitNum).map(r => ({ ...r, expire_date: r.expireDate })) };
    } else {
      result = await pool.query(listSql, params);
    }

    return { __t: 'json', payload: { list: (result.rows || []).map(formatMaterialRow), total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询物资列表失败:', err.message);
    throw err;
  }
}

// ========== GET /materials/stats — 物资统计 ==========
async function materialStats() {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const data = memoryMaterials.filter(r => !r.is_deleted);
      const byCategory = {};
      data.forEach(m => { byCategory[m.category || 'other'] = (byCategory[m.category || 'other'] || 0) + 1; });
      return {
        __t: 'json',
        payload: {
          total: data.length,
          expiring: data.filter(m => calcMaterialStatus(m.expireDate) === 'expiring').length,
          expired: data.filter(m => calcMaterialStatus(m.expireDate) === 'expired').length,
          byCategory,
        },
        message: '统计成功(内存模式)',
      };
    }

    await ensureAllTables();

    const result = await pool.query('SELECT * FROM emergency_materials WHERE is_deleted = false');
    const list = result.rows.map(formatMaterialRow);
    const byCategory = {};
    list.forEach(m => { byCategory[m.category || 'other'] = (byCategory[m.category || 'other'] || 0) + 1; });

    return {
      __t: 'json',
      payload: {
        total: list.length,
        expiring: list.filter(m => m.status === 'expiring').length,
        expired: list.filter(m => m.status === 'expired').length,
        byCategory,
      },
      message: '统计成功',
    };
  } catch (err) {
    console.error('[Emergency] 查询物资统计失败:', err.message);
    throw err;
  }
}

// ========== GET /materials/export — 导出物资 ==========
async function materialExport() {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const data = memoryMaterials.filter(r => !r.is_deleted);
      return { __t: 'csv', ...buildMaterialCsvExport(data) };
    }

    await ensureAllTables();
    const result = await pool.query('SELECT * FROM emergency_materials WHERE is_deleted = FALSE ORDER BY id DESC');
    return { __t: 'csv', ...buildMaterialCsvExport(result.rows) };
  } catch (err) {
    console.error('[Emergency] 导出物资失败:', err.message);
    throw err;
  }
}

// ========== GET /materials/:id — 单条物资 ==========
async function materialDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const record = memoryMaterials.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found' };
      return { __t: 'json', payload: { ...record, status: calcMaterialStatus(record.expireDate) }, message: '查询成功(内存模式)' };
    }
    await ensureAllTables();
    const result = await pool.query('SELECT * FROM emergency_materials WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatMaterialRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询物资详情失败:', err.message);
    throw err;
  }
}

// ========== POST /materials — 创建物资 ==========
async function materialCreate(body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryDataAll();
      const record = buildMemoryRecord(materialIdCounter++, {
        name: b.name || b.title || '',
        category: b.category || '',
        spec: b.spec || '',
        quantity: b.quantity || 0,
        location: b.location || '',
        responsiblePerson: b.responsiblePerson || b.responsible_person || '',
        expireDate: b.expireDate || b.expire_date || null,
        remark: b.remark || '',
      });
      memoryMaterials.push(record);
      return { __t: 'json', payload: { ...record, status: calcMaterialStatus(record.expireDate) }, message: '创建成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(`
      INSERT INTO emergency_materials (name, category, spec, quantity, location, responsible_person, expire_date, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      b.name || b.title || '',
      b.category || '',
      b.spec || '',
      b.quantity || 0,
      b.location || '',
      b.responsiblePerson || b.responsible_person || '',
      b.expireDate || b.expire_date || null,
      b.remark || '',
    ]);

    await auditLog({ userId: audit.userId, username: audit.username, action: 'create', module: 'emergency', description: `创建应急物资: ${b.name}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatMaterialRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[Emergency] 创建物资失败:', err.message);
    throw err;
  }
}

// ========== PUT /materials/:id — 更新物资 ==========
async function materialUpdate(id, body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryDataAll();
      const idx = memoryMaterials.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      Object.assign(memoryMaterials[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: { ...memoryMaterials[idx], status: calcMaterialStatus(memoryMaterials[idx].expireDate) }, message: '更新成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(`
      UPDATE emergency_materials SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        spec = COALESCE($3, spec),
        quantity = COALESCE($4, quantity),
        location = COALESCE($5, location),
        responsible_person = COALESCE($6, responsible_person),
        expire_date = COALESCE($7, expire_date),
        remark = COALESCE($8, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND is_deleted = false RETURNING *
    `, [
      b.name || b.title || null,
      b.category || null,
      b.spec || null,
      b.quantity != null ? b.quantity : null,
      b.location || null,
      b.responsiblePerson || b.responsible_person || null,
      b.expireDate || b.expire_date || null,
      b.remark || null,
      id,
    ]);

    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: audit.userId, username: audit.username, action: 'update', module: 'emergency', description: `更新应急物资 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatMaterialRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[Emergency] 更新物资失败:', err.message);
    throw err;
  }
}

// ========== DELETE /materials/:id — 删除物资 ==========
async function materialDelete(id, audit) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const record = memoryMaterials.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(
      'UPDATE emergency_materials SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };

    await auditLog({ userId: audit.userId, username: audit.username, action: 'delete', module: 'emergency', description: `删除应急物资 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Emergency] 删除物资失败:', err.message);
    throw err;
  }
}

// ============================================================
// 应急队伍 CRUD
// ============================================================

// ========== GET /teams/list — 队伍列表 ==========
async function teamList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, type, department } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryDataAll();
      let data = memoryTeams.filter(r => !r.is_deleted);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.name && r.name.toLowerCase().includes(kw)) ||
          (r.department && r.department.toLowerCase().includes(kw)) ||
          (r.leaderName && r.leaderName.toLowerCase().includes(kw))
        );
      }
      if (type) data = data.filter(r => r.type === type);
      if (department) data = data.filter(r => r.department === department);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    await ensureAllTables();

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx++} OR department ILIKE $${paramIdx++} OR leader_name ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (type) { conditions.push(`type = $${paramIdx++}`); params.push(type); }
    if (department) { conditions.push(`department = $${paramIdx++}`); params.push(department); }

    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM emergency_teams ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM emergency_teams ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    return { __t: 'json', payload: { list: result.rows.map(formatTeamRow), total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询队伍列表失败:', err.message);
    throw err;
  }
}

// ========== GET /teams/stats — 队伍统计 ==========
async function teamStats() {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const teams = memoryTeams.filter(r => !r.is_deleted);
      const memberCount = memoryTeamMembers.filter(m => !m.is_deleted).length;
      const byType = {};
      teams.forEach(t => { byType[t.type || 'other'] = (byType[t.type || 'other'] || 0) + 1; });
      const isFullKey = (k) => /full|专职|全职/i.test(k);
      const isPartKey = (k) => /part|兼职|业余/i.test(k);
      let fullTime = 0, partTime = 0;
      Object.entries(byType).forEach(([k, v]) => { if (isFullKey(k)) fullTime += v; else if (isPartKey(k)) partTime += v; });
      return { __t: 'json', payload: { total: teams.length, memberCount, fullTime, partTime, byType }, message: '统计成功(内存模式)' };
    }

    await ensureAllTables();

    const [teamR, memberR, typeR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_teams WHERE is_deleted = false'),
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_team_members WHERE is_deleted = false'),
      pool.query("SELECT type, COUNT(*)::int AS count FROM emergency_teams WHERE is_deleted = false GROUP BY type"),
    ]);

    const byType = {};
    typeR.rows.forEach(r => { byType[r.type || 'other'] = parseInt(r.count); });

    const isFullKey = (k) => /full|专职|全职/i.test(k);
    const isPartKey = (k) => /part|兼职|业余/i.test(k);
    let fullTime = 0, partTime = 0;
    Object.entries(byType).forEach(([k, v]) => { if (isFullKey(k)) fullTime += v; else if (isPartKey(k)) partTime += v; });

    return {
      __t: 'json',
      payload: {
        total: parseInt(teamR.rows[0].total),
        memberCount: parseInt(memberR.rows[0].total),
        fullTime,
        partTime,
        byType,
      },
      message: '统计成功',
    };
  } catch (err) {
    console.error('[Emergency] 查询队伍统计失败:', err.message);
    throw err;
  }
}

// ========== GET /teams/export — 导出队伍清单（CSV） ==========
function buildTeamCsvExport(data) {
  const headers = ['队伍名称', '队伍类型', '所属部门', '队长', '联系电话', '队员人数', '描述'];
  const rows = data.map(r => [
    r.name || '',
    r.type || '',
    r.department || '',
    r.leader_name || '',
    r.contact_phone || '',
    Array.isArray(r.member_ids) ? r.member_ids.length : 0,
    r.description || '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return {
    writeHeaders: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=emergency_teams.csv',
    },
    content: '\uFEFF' + csv,
  };
}

// ========== GET /teams/export — 导出队伍清单（CSV） ==========
async function teamExport() {
  try {
    await ensureAllTables();
    const result = await pool.query('SELECT * FROM emergency_teams WHERE is_deleted = FALSE ORDER BY created_at DESC');
    return { __t: 'csv', ...buildTeamCsvExport(result.rows) };
  } catch (err) {
    console.error('[Emergency] 导出队伍清单失败:', err.message);
    throw err;
  }
}

// ========== GET /teams/:id — 单条队伍（含成员） ==========
async function teamDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const record = memoryTeams.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found' };
      const members = memoryTeamMembers.filter(m => m.team_id === parseInt(id) && !m.is_deleted);
      return { __t: 'json', payload: { ...record, members }, message: '查询成功(内存模式)' };
    }
    await ensureAllTables();
    const teamResult = await pool.query('SELECT * FROM emergency_teams WHERE id = $1 AND is_deleted = false', [id]);
    if (teamResult.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    const memberResult = await pool.query('SELECT * FROM emergency_team_members WHERE team_id = $1 AND is_deleted = false ORDER BY id', [id]);
    return { __t: 'json', payload: { ...formatTeamRow(teamResult.rows[0]), members: memberResult.rows.map(formatTeamMemberRow) }, message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询队伍详情失败:', err.message);
    throw err;
  }
}

// ========== POST /teams — 创建队伍 ==========
async function teamCreate(body, audit) {
  try {
    const b = body;
    const members = Array.isArray(b.members) ? b.members : [];

    if (!isConnected()) {
      initMemoryDataAll();
      const teamId = teamIdCounter++;
      const teamRecord = buildMemoryRecord(teamId, {
        name: b.name || '',
        type: b.type || '',
        department: b.department || '',
        leaderId: b.leaderId || b.leader_id || null,
        leaderName: b.leaderName || b.leader_name || '',
        contactPhone: b.contactPhone || b.contact_phone || '',
        description: b.description || '',
        memberIds: b.memberIds || b.member_ids || members.map(m => m.employeeId || m.employee_id),
      });
      memoryTeams.push(teamRecord);
      members.forEach(m => {
        const memberRecord = buildMemoryRecord(teamMemberIdCounter++, {
          team_id: teamId,
          employee_id: m.employeeId || m.employee_id || null,
          employee_name: m.employeeName || m.employee_name || '',
          role: m.role || '',
          phone: m.phone || '',
        });
        memoryTeamMembers.push(memberRecord);
      });
      return { __t: 'json', payload: teamRecord, message: '创建成功(内存模式)' };
    }

    await ensureAllTables();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const teamResult = await client.query(`
        INSERT INTO emergency_teams (name, type, department, leader_id, leader_name, contact_phone, description, member_ids)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `, [
        b.name || '',
        b.type || '',
        b.department || '',
        b.leaderId || b.leader_id || null,
        b.leaderName || b.leader_name || '',
        b.contactPhone || b.contact_phone || '',
        b.description || '',
        b.memberIds || b.member_ids || (members.map(m => m.employeeId || m.employee_id).filter(Boolean)),
      ]);
      const teamId = teamResult.rows[0].id;

      for (const m of members) {
        await client.query(`
          INSERT INTO emergency_team_members (team_id, employee_id, employee_name, role, phone)
          VALUES ($1,$2,$3,$4,$5)
        `, [
          teamId,
          m.employeeId || m.employee_id || null,
          m.employeeName || m.employee_name || '',
          m.role || '',
          m.phone || '',
        ]);
      }
      await client.query('COMMIT');

      await auditLog({ userId: audit.userId, username: audit.username, action: 'create', module: 'emergency', description: `创建应急队伍: ${b.name}`, ip: audit.ip }).catch(() => {});
      return { __t: 'json', payload: formatTeamRow(teamResult.rows[0]), message: '创建成功' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Emergency] 创建队伍失败:', err.message);
    throw err;
  }
}

// ========== PUT /teams/:id — 更新队伍 ==========
async function teamUpdate(id, body, audit) {
  try {
    const b = body;
    const members = Array.isArray(b.members) ? b.members : null;

    if (!isConnected()) {
      initMemoryDataAll();
      const idx = memoryTeams.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      Object.assign(memoryTeams[idx], b, { updatedAt: new Date().toISOString() });
      if (members) {
        memoryTeamMembers.forEach(m => {
          if (m.team_id === parseInt(id)) m.is_deleted = true;
        });
        members.forEach(m => {
          const memberRecord = buildMemoryRecord(teamMemberIdCounter++, {
            team_id: parseInt(id),
            employee_id: m.employeeId || m.employee_id || null,
            employee_name: m.employeeName || m.employee_name || '',
            role: m.role || '',
            phone: m.phone || '',
          });
          memoryTeamMembers.push(memberRecord);
        });
      }
      return { __t: 'json', payload: memoryTeams[idx], message: '更新成功(内存模式)' };
    }

    await ensureAllTables();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const teamResult = await client.query(`
        UPDATE emergency_teams SET
          name = COALESCE($1, name),
          type = COALESCE($2, type),
          department = COALESCE($3, department),
          leader_id = COALESCE($4, leader_id),
          leader_name = COALESCE($5, leader_name),
          contact_phone = COALESCE($6, contact_phone),
          description = COALESCE($7, description),
          member_ids = COALESCE($8, member_ids),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 AND is_deleted = false RETURNING *
      `, [
        b.name || null,
        b.type || null,
        b.department || null,
        b.leaderId || b.leader_id || null,
        b.leaderName || b.leader_name || null,
        b.contactPhone || b.contact_phone || null,
        b.description || null,
        b.memberIds || b.member_ids || null,
        id,
      ]);

      if (teamResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      }

      if (members) {
        await client.query('UPDATE emergency_team_members SET is_deleted = true WHERE team_id = $1', [id]);
        for (const m of members) {
          await client.query(`
            INSERT INTO emergency_team_members (team_id, employee_id, employee_name, role, phone)
            VALUES ($1,$2,$3,$4,$5)
          `, [
            parseInt(id),
            m.employeeId || m.employee_id || null,
            m.employeeName || m.employee_name || '',
            m.role || '',
            m.phone || '',
          ]);
        }
      }
      await client.query('COMMIT');

      await auditLog({ userId: audit.userId, username: audit.username, action: 'update', module: 'emergency', description: `更新应急队伍 ID=${id}`, ip: audit.ip }).catch(() => {});
      return { __t: 'json', payload: formatTeamRow(teamResult.rows[0]), message: '更新成功' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Emergency] 更新队伍失败:', err.message);
    throw err;
  }
}

// ========== DELETE /teams/:id — 删除队伍 ==========
async function teamDelete(id, audit) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const record = memoryTeams.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      record.is_deleted = true;
      memoryTeamMembers.forEach(m => {
        if (m.team_id === parseInt(id)) m.is_deleted = true;
      });
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    await ensureAllTables();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const teamResult = await client.query(
        'UPDATE emergency_teams SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
        [id]
      );
      if (teamResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      }
      await client.query('UPDATE emergency_team_members SET is_deleted = true WHERE team_id = $1', [id]);
      await client.query('COMMIT');

      await auditLog({ userId: audit.userId, username: audit.username, action: 'delete', module: 'emergency', description: `删除应急队伍 ID=${id}`, ip: audit.ip }).catch(() => {});
      return { __t: 'json', payload: null, message: '删除成功' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Emergency] 删除队伍失败:', err.message);
    throw err;
  }
}

// ========== GET /teams/:id/members — 队伍成员列表 ==========
async function teamMembers(id) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const data = memoryTeamMembers.filter(m => m.team_id === parseInt(id) && !m.is_deleted);
      return { __t: 'json', payload: data, message: '查询成功(内存模式)' };
    }
    await ensureAllTables();
    const result = await pool.query('SELECT * FROM emergency_team_members WHERE team_id = $1 AND is_deleted = false ORDER BY id', [id]);
    return { __t: 'json', payload: result.rows.map(formatTeamMemberRow), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询队伍成员失败:', err.message);
    throw err;
  }
}

// ========== POST /teams/generate — 依据组织管理自动生成应急队伍 ==========
async function teamGenerate(audit) {
  try {
    await ensureAllTables();
    const client = await pool.connect();
    try {
      // 1. 读取组织树：环卫作业中心 / 市政绿化作业中心
      const centerRes = await client.query(
        `SELECT id, org_name FROM hse_org_unit WHERE org_type = 'center' AND is_deleted IS NOT TRUE ORDER BY id`
      );
      const centers = centerRes.rows;
      const hwCenter = centers.find((c) => /环卫/.test(c.org_name)) || centers[0] || null;
      const greenCenter = centers.find((c) => /市政绿化|绿化/.test(c.org_name)) || centers[1] || null;

      // 2. 关键岗位（按名称 + org_type 匹配，避免硬编码 ID）
      const posRes = await client.query(
        `SELECT id, name, org_type FROM position WHERE is_deleted IS NOT TRUE`
      );
      const managerPos = posRes.rows.find(
        (p) => p.name === '乡镇作业中心经理' && p.org_type === 'town_center'
      );
      const adminPosIds = posRes.rows
        .filter((p) => p.name === '管理员' && p.org_type === 'town_center')
        .map((p) => p.id);
      const driverPosIds = posRes.rows
        .filter((p) => /驾驶员/.test(p.name) && p.org_type === 'town_center')
        .map((p) => p.id);

      // 下属单位
      const childrenOf = async (centerId) => {
        const r = await client.query(
          `SELECT id, org_name, org_type FROM hse_org_unit WHERE parent_id = $1 AND is_deleted IS NOT TRUE ORDER BY id`,
          [centerId]
        );
        return r.rows;
      };
      // 队长：本单位「乡镇作业中心经理」
      const leaderOf = async (orgId) => {
        if (!managerPos) return null;
        const r = await client.query(
          `SELECT e.id, e.name, e.phone
           FROM employee_assignment ea
           JOIN employee e ON e.id = ea.employee_id
           JOIN position p ON p.id = ea.position_id
           WHERE ea.org_unit_id = $1 AND ea.is_current = true AND ea.is_deleted IS NOT TRUE
             AND p.id = $2
           LIMIT 1`,
          [orgId, managerPos.id]
        );
        return r.rows[0] || null;
      };
      // 队员：本单位「管理员」+「驾驶员」
      const membersOf = async (orgId, posIds) => {
        if (!posIds.length) return [];
        const r = await client.query(
          `SELECT DISTINCT e.id, e.name, e.phone, p.name AS pos_name
           FROM employee_assignment ea
           JOIN employee e ON e.id = ea.employee_id
           JOIN position p ON p.id = ea.position_id
           WHERE ea.org_unit_id = $1 AND ea.is_current = true AND ea.is_deleted IS NOT TRUE
             AND p.id = ANY($2)`,
          [orgId, posIds]
        );
        return r.rows;
      };

      const plan = []; // { orgName, type, leader, members, center }

      // 特殊队长指派：乡镇未配置「乡镇作业中心经理」岗位时，人工指定负责人
      // 津城街道作业中心 → 王铁民（员工 id=6789，管理员岗在册）
      const OVERRIDE_LEADERS = { '津城街道作业中心': '王铁民' };
      const overrideLeaderOf = async (orgName) => {
        const name = OVERRIDE_LEADERS[orgName];
        if (!name) return null;
        const r = await client.query(
          `SELECT e.id, e.name, e.phone
           FROM employee e
           WHERE e.name = $1 AND e.is_deleted IS NOT TRUE
           ORDER BY e.id LIMIT 1`,
          [name]
        );
        return r.rows[0] || null;
      };

      // 应急预案生效日期匹配：按队伍所属部门（orgName）与预案「负责部门/预案名称」匹配，
      // 取匹配预案的生效日期（effective_date）作为该队伍创建时间；无匹配或预案表为空时回退为当前生成时间
      const planEffectiveDateOf = async (orgName, baseName) => {
        const r = await client.query(
          `SELECT to_char(effective_date, 'YYYY-MM-DD') AS d
           FROM emergency_plans
           WHERE is_deleted IS NOT TRUE AND effective_date IS NOT NULL
             AND (
               responsible_dept = $1
               OR responsible_dept LIKE '%' || $1 || '%'
               OR $1 LIKE '%' || responsible_dept || '%'
               OR name LIKE '%' || $2 || '%'
             )
           ORDER BY effective_date DESC, created_at DESC
           LIMIT 1`,
          [orgName, baseName]
        );
        // 返回 UTC 零点 ISO，保证「创建时间」列日期与预案生效日期一致（避免会话时区偏移）
        return r.rows[0]?.d ? `${r.rows[0].d}T00:00:00.000Z` : null;
      };

      if (hwCenter) {
        const towns = await childrenOf(hwCenter.id);
        for (const t of towns) {
          let leader = await leaderOf(t.id);
          if (!leader) leader = await overrideLeaderOf(t.org_name);
          let members = await membersOf(t.id, [...adminPosIds, ...driverPosIds]);
          // 队长兼任队员（如指定队长同时在管理员/驾驶员岗位在册）时，从队员中排除，避免重复
          if (leader) members = members.filter((m) => m.id !== leader.id);
          const baseName = t.org_name.replace('作业中心', '').replace('公园', '').trim();
          const planDate = await planEffectiveDateOf(t.org_name, baseName);
          plan.push({ orgName: t.org_name, type: '应急救援队', leader, members, center: 'hw', planDate });
        }
      }
      if (greenCenter) {
        const parks = await childrenOf(greenCenter.id);
        for (const p of parks) {
          const baseName = p.org_name.replace('作业中心', '').replace('公园', '').trim();
          const planDate = await planEffectiveDateOf(p.org_name, baseName);
          plan.push({ orgName: p.org_name, type: '应急救援队', leader: null, members: [], center: 'green', planDate });
        }
      }

      // 3. 软删除旧队伍 + 写入新队伍（事务，全量替换）
      await client.query('BEGIN');
      await client.query(
        'UPDATE emergency_teams SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE is_deleted = false'
      );
      await client.query('UPDATE emergency_team_members SET is_deleted = true WHERE is_deleted = false');

      let created = 0;
      let hwCount = 0;
      let greenCount = 0;
      // 员工表手机号为 AES-256-GCM 加密存储（ENC:...），按姓名从花名册提取时解密为明文；
      // 解密失败时降级留空，避免写入密文乱码
      const plainPhone = (v) => {
        if (!v) return '';
        try {
          const d = decrypt(String(v));
          return d && !String(d).startsWith('ENC:') ? String(d) : '';
        } catch {
          return '';
        }
      };

      for (const t of plan) {
        const baseName = t.orgName.replace('作业中心', '').replace('公园', '').trim();
        const teamName = `${baseName}应急救援小队`;
        const memberIds = t.members.map((m) => m.id);
        const teamRes = await client.query(
          `INSERT INTO emergency_teams (name, type, department, leader_id, leader_name, contact_phone, description, member_ids, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, CURRENT_TIMESTAMP)) RETURNING id`,
          [
            teamName,
            t.type,
            t.orgName,
            t.leader ? t.leader.id : null,
            t.leader ? t.leader.name : '',
            t.leader ? plainPhone(t.leader.phone) : '',
            t.leader ? null : '负责人待定（组织尚未成立）',
            memberIds,
            t.planDate || null,
          ]
        );
        const teamId = teamRes.rows[0].id;
        for (const m of t.members) {
          await client.query(
            `INSERT INTO emergency_team_members (team_id, employee_id, employee_name, role, phone)
             VALUES ($1,$2,$3,$4,$5)`,
            [teamId, m.id, m.name, m.pos_name, plainPhone(m.phone)]
          );
        }
        created += 1;
        if (t.center === 'hw') hwCount += 1;
        else if (t.center === 'green') greenCount += 1;
      }
      await client.query('COMMIT');

      await auditLog({
        userId: audit.userId,
        username: audit.username,
        action: 'generate',
        module: 'emergency',
        description: `自动生成应急队伍 ${created} 支（环卫 ${hwCount} / 市政绿化 ${greenCount}）`,
        ip: audit.ip,
      }).catch(() => {});

      return {
        __t: 'json',
        payload: { created, hwCount, greenCount },
        message: `生成成功，共 ${created} 支队伍（环卫 ${hwCount} 支 / 市政绿化 ${greenCount} 支）`,
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Emergency] 自动生成应急队伍失败:', err.message);
    throw err;
  }
}

// ============================================================
// 应急事件 CRUD
// ============================================================

// ========== GET /events/list — 事件列表 ==========
async function eventList(query) {
  try {
    const { page = 1, pageSize = 20, keyword, eventType, eventLevel, status } = query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    if (!isConnected()) {
      initMemoryDataAll();
      let data = memoryEvents.filter(r => !r.is_deleted);
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r =>
          (r.title && r.title.toLowerCase().includes(kw)) ||
          (r.location && r.location.toLowerCase().includes(kw))
        );
      }
      if (eventType) data = data.filter(r => r.eventType === eventType);
      if (eventLevel) data = data.filter(r => r.eventLevel === eventLevel);
      if (status) data = data.filter(r => r.status === status);
      const { list, total } = paginateMemory(data, pageNum, limitNum);
      return { __t: 'list', list, total, page: pageNum, pageSize: limitNum, message: '查询成功(内存模式)' };
    }

    await ensureAllTables();

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(title ILIKE $${paramIdx++} OR location ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (eventType) { conditions.push(`event_type = $${paramIdx++}`); params.push(eventType); }
    if (eventLevel) { conditions.push(`event_level = $${paramIdx++}`); params.push(eventLevel); }
    if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }

    conditions.push('is_deleted = false');
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM emergency_events ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT * FROM emergency_events ${whereClause} ORDER BY happen_time DESC NULLS LAST, id DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    return { __t: 'json', payload: { list: result.rows.map(formatEventRow), total, page: pageNum, pageSize: limitNum }, message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询事件列表失败:', err.message);
    throw err;
  }
}

// ========== GET /events/stats — 事件统计 ==========
async function eventStats() {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const data = memoryEvents.filter(r => !r.is_deleted);
      const byType = {};
      const byStatus = {};
      const byLevel = {};
      data.forEach(e => {
        byType[e.eventType || 'other'] = (byType[e.eventType || 'other'] || 0) + 1;
        byStatus[e.status || 'unknown'] = (byStatus[e.status || 'unknown'] || 0) + 1;
        byLevel[e.eventLevel || 'unknown'] = (byLevel[e.eventLevel || 'unknown'] || 0) + 1;
      });
      const isClosedKey = (k) => /closed|resolved|结案|完成|已结束|done/i.test(k);
      let closed = 0;
      Object.entries(byStatus).forEach(([k, v]) => { if (isClosedKey(k)) closed += v; });
      const handling = data.length - closed;
      const avgDuration = 0;
      return { __t: 'json', payload: { total: data.length, handling, closed, avgDuration, byType, byStatus, byLevel }, message: '统计成功(内存模式)' };
    }

    await ensureAllTables();

    const [totalR, typeR, statusR, levelR] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM emergency_events WHERE is_deleted = false'),
      pool.query("SELECT event_type, COUNT(*)::int AS count FROM emergency_events WHERE is_deleted = false GROUP BY event_type"),
      pool.query("SELECT status, COUNT(*)::int AS count FROM emergency_events WHERE is_deleted = false GROUP BY status"),
      pool.query("SELECT event_level, COUNT(*)::int AS count FROM emergency_events WHERE is_deleted = false GROUP BY event_level"),
    ]);

    const byType = {};
    typeR.rows.forEach(r => { byType[r.event_type || 'other'] = parseInt(r.count); });
    const byStatus = {};
    statusR.rows.forEach(r => { byStatus[r.status || 'unknown'] = parseInt(r.count); });
    const byLevel = {};
    levelR.rows.forEach(r => { byLevel[r.event_level || 'unknown'] = parseInt(r.count); });

    const isClosedKey = (k) => /closed|resolved|结案|完成|已结束|done/i.test(k);
    let closed = 0;
    Object.entries(byStatus).forEach(([k, v]) => { if (isClosedKey(k)) closed += v; });
    const total = parseInt(totalR.rows[0].total);
    const handling = total - closed;
    const avgDuration = 0;
    return {
      __t: 'json',
      payload: {
        total,
        handling,
        closed,
        avgDuration,
        byType,
        byStatus,
        byLevel,
      },
      message: '统计成功',
    };
  } catch (err) {
    console.error('[Emergency] 查询事件统计失败:', err.message);
    throw err;
  }
}

// ========== GET /events/export — 导出事件清单（CSV） ==========
function buildEventCsvExport(data) {
  const headers = ['事件标题', '事件类型', '事件级别', '发生地点', '发生时间', '报告人', '处置状态', '处置结果', '关联预案ID', '关联演练ID', '备注'];
  const rows = data.map(r => [
    r.title || '',
    r.event_type || '',
    r.event_level || '',
    r.location || '',
    r.happen_time || '',
    r.reporter || '',
    r.status || '',
    r.result || '',
    r.related_plan_id || '',
    r.related_drill_id || '',
    r.remark || '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return {
    writeHeaders: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=emergency_events.csv',
    },
    content: '\uFEFF' + csv,
  };
}

// ========== GET /events/export — 导出事件清单（CSV） ==========
async function eventExport() {
  try {
    await ensureAllTables();
    const result = await pool.query('SELECT * FROM emergency_events WHERE is_deleted = FALSE ORDER BY created_at DESC');
    return { __t: 'csv', ...buildEventCsvExport(result.rows) };
  } catch (err) {
    console.error('[Emergency] 导出事件清单失败:', err.message);
    throw err;
  }
}

// ========== GET /events/:id — 单条事件 ==========
async function eventDetail(id) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const record = memoryEvents.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'not-found' };
      return { __t: 'json', payload: record, message: '查询成功(内存模式)' };
    }
    await ensureAllTables();
    const result = await pool.query('SELECT * FROM emergency_events WHERE id = $1 AND is_deleted = false', [id]);
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    return { __t: 'json', payload: formatEventRow(result.rows[0]), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询事件详情失败:', err.message);
    throw err;
  }
}

// ========== POST /events — 创建事件 ==========
async function eventCreate(body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryDataAll();
      const record = buildMemoryRecord(eventIdCounter++, {
        title: b.title || '',
        eventType: b.eventType || b.event_type || '',
        eventLevel: b.eventLevel || b.event_level || '',
        happenTime: b.happenTime || b.happen_time || null,
        location: b.location || '',
        reporter: b.reporter || '',
        status: b.status || 'reporting',
        responseProcess: b.responseProcess || b.response_process || '',
        handlingMeasures: b.handlingMeasures || b.handling_measures || '',
        result: b.result || '',
        relatedPlanId: b.relatedPlanId || b.related_plan_id || null,
        relatedDrillId: b.relatedDrillId || b.related_drill_id || null,
        personnelId: b.personnelId || b.personnel_id || null,
        remark: b.remark || '',
      });
      memoryEvents.push(record);
      return { __t: 'json', payload: record, message: '创建成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(`
      INSERT INTO emergency_events (title, event_type, event_level, happen_time, location, reporter, status, response_process, handling_measures, result, related_plan_id, related_drill_id, remark, personnel_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      b.title || '',
      b.eventType || b.event_type || '',
      b.eventLevel || b.event_level || '',
      b.happenTime || b.happen_time || null,
      b.location || '',
      b.reporter || '',
      b.status || 'reporting',
      b.responseProcess || b.response_process || '',
      b.handlingMeasures || b.handling_measures || '',
      b.result || '',
      b.relatedPlanId || b.related_plan_id || null,
      b.relatedDrillId || b.related_drill_id || null,
      b.remark || '',
      b.personnelId || b.personnel_id || null,
    ]);

    await auditLog({ userId: audit.userId, username: audit.username, action: 'create', module: 'emergency', description: `创建应急事件: ${b.title}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatEventRow(result.rows[0]), message: '创建成功' };
  } catch (err) {
    console.error('[Emergency] 创建事件失败:', err.message);
    throw err;
  }
}

// ========== PUT /events/:id — 更新事件 ==========
async function eventUpdate(id, body, audit) {
  try {
    const b = body;
    if (!isConnected()) {
      initMemoryDataAll();
      const idx = memoryEvents.findIndex(r => r.id === parseInt(id) && !r.is_deleted);
      if (idx === -1) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      Object.assign(memoryEvents[idx], b, { updatedAt: new Date().toISOString() });
      return { __t: 'json', payload: memoryEvents[idx], message: '更新成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(`
      UPDATE emergency_events SET
        title = COALESCE($1, title),
        event_type = COALESCE($2, event_type),
        event_level = COALESCE($3, event_level),
        happen_time = COALESCE($4, happen_time),
        location = COALESCE($5, location),
        reporter = COALESCE($6, reporter),
        status = COALESCE($7, status),
        response_process = COALESCE($8, response_process),
        handling_measures = COALESCE($9, handling_measures),
        result = COALESCE($10, result),
        related_plan_id = COALESCE($11, related_plan_id),
        related_drill_id = COALESCE($12, related_drill_id),
        personnel_id = COALESCE($13, personnel_id),
        remark = COALESCE($14, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15 AND is_deleted = false RETURNING *
    `, [
      b.title || null,
      b.eventType || b.event_type || null,
      b.eventLevel || b.event_level || null,
      b.happenTime || b.happen_time || null,
      b.location || null,
      b.reporter || null,
      b.status || null,
      b.responseProcess || b.response_process || null,
      b.handlingMeasures || b.handling_measures || null,
      b.result || null,
      b.relatedPlanId || b.related_plan_id || null,
      b.relatedDrillId || b.related_drill_id || null,
      b.personnelId || b.personnel_id || null,
      b.remark || null,
      id,
    ]);

    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
    await auditLog({ userId: audit.userId, username: audit.username, action: 'update', module: 'emergency', description: `更新应急事件 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: formatEventRow(result.rows[0]), message: '更新成功' };
  } catch (err) {
    console.error('[Emergency] 更新事件失败:', err.message);
    throw err;
  }
}

// ========== DELETE /events/:id — 删除事件 ==========
async function eventDelete(id, audit) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const record = memoryEvents.find(r => r.id === parseInt(id) && !r.is_deleted);
      if (!record) return { __t: 'json', error: { code: -2, message: '记录不存在' } };
      record.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(
      'UPDATE emergency_events SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );
    if (result.rows.length === 0) return { __t: 'json', error: { code: -2, message: '记录不存在' } };

    await auditLog({ userId: audit.userId, username: audit.username, action: 'delete', module: 'emergency', description: `删除应急事件 ID=${id}`, ip: audit.ip }).catch(() => {});
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Emergency] 删除事件失败:', err.message);
    throw err;
  }
}

// ============================================================
// 通用附件管理（plans/drills/materials/teams/events）
// ============================================================
const VALID_BIZ_TYPES = ['plans', 'drills', 'materials', 'teams', 'events'];

function getBizTable(bizType) {
  const map = {
    plans: 'emergency_plans',
    drills: 'emergency_drills',
    materials: 'emergency_materials',
    teams: 'emergency_teams',
    events: 'emergency_events',
  };
  return map[bizType];
}

// ========== GET /:bizType/:id/attachments — 附件列表（非 plans，plans 由 controller 重定向） ==========
async function getBizAttachments(bizType, id) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const data = memoryAttachments.filter(a => a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
      return { __t: 'json', payload: data.map(camelKeys), message: '查询成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(
      'SELECT * FROM emergency_attachments WHERE biz_type = $1 AND biz_id = $2 AND is_deleted = FALSE ORDER BY created_at DESC',
      [bizType, id]
    );
    return { __t: 'json', payload: result.rows.map(camelKeys), message: '查询成功' };
  } catch (err) {
    console.error('[Emergency] 查询通用附件失败:', err.message);
    throw err;
  }
}

// ========== POST /:bizType/:id/attachments — 上传附件（非 plans） ==========
async function uploadBizAttachment({ bizType, id, file, fileUrl, originalName, uploaded_by }) {
  try {
    if (!file) return { __t: 'json', error: { code: -1, message: '请上传文件' } };

    if (!isConnected()) {
      initMemoryDataAll();
      const record = buildMemoryRecord(memoryAttachmentIdCounter++, {
        biz_type: bizType,
        biz_id: parseInt(id),
        filename: file.filename,
        original_name: originalName,
        file_type: 'document',
        file_size: file.size,
        file_url: fileUrl,
        uploaded_by,
      });
      memoryAttachments.push(record);
      return { __t: 'json', payload: camelKeys(record), message: '上传成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(`
      INSERT INTO emergency_attachments (biz_type, biz_id, filename, original_name, file_type, file_size, file_url, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [bizType, id, file.filename, originalName, 'document', file.size, fileUrl, uploaded_by]);

    return { __t: 'json', payload: camelKeys(result.rows[0]), message: '上传成功' };
  } catch (err) {
    console.error('[Emergency] 上传通用附件失败:', err.message);
    throw err;
  }
}

// ========== DELETE /:bizType/:id/attachments/:aid — 删除附件（非 plans） ==========
async function deleteBizAttachment(bizType, id, aid) {
  try {
    if (!isConnected()) {
      initMemoryDataAll();
      const att = memoryAttachments.find(a => a.id === parseInt(aid) && a.biz_type === bizType && a.biz_id === parseInt(id) && !a.is_deleted);
      if (!att) return { __t: 'not-found', message: '附件不存在' };
      att.is_deleted = true;
      return { __t: 'json', payload: null, message: '删除成功(内存模式)' };
    }

    await ensureAllTables();
    const result = await pool.query(
      'UPDATE emergency_attachments SET is_deleted = TRUE WHERE id = $1 AND biz_type = $2 AND biz_id = $3 RETURNING id',
      [aid, bizType, id]
    );
    if (result.rows.length === 0) return { __t: 'not-found', message: '附件不存在' };
    return { __t: 'json', payload: null, message: '删除成功' };
  } catch (err) {
    console.error('[Emergency] 删除通用附件失败:', err.message);
    throw err;
  }
}

module.exports = {
  // 纯函数/常量
  calcExpiryStatus,
  calcMaterialStatus,
  readExpiringDays,
  formatPlanRow,
  formatDrillRow,
  formatMaterialRow,
  formatTeamRow,
  formatTeamMemberRow,
  formatEventRow,
  createPlanVersion,
  buildPlanCsvExport,
  buildDrillCsvExport,
  buildMaterialCsvExport,
  buildTeamCsvExport,
  buildEventCsvExport,
  VALID_BIZ_TYPES,
  getBizTable,
  ensureTables,
  ensureAllTables,
  // 端点 service
  planStats,
  planList,
  planExport,
  planDetail,
  planCreate,
  planUpdate,
  planDelete,
  planAttachments,
  planUploadAttachment,
  planDeleteAttachment,
  planVersions,
  drillStats,
  drillList,
  drillExport,
  drillDetail,
  drillCreate,
  drillUpdate,
  drillDelete,
  statsOverview,
  statsLegacy,
  materialList,
  materialStats,
  materialExport,
  materialDetail,
  materialCreate,
  materialUpdate,
  materialDelete,
  teamList,
  teamStats,
  teamExport,
  teamDetail,
  teamCreate,
  teamUpdate,
  teamDelete,
  teamMembers,
  teamGenerate,
  eventList,
  eventStats,
  eventExport,
  eventDetail,
  eventCreate,
  eventUpdate,
  eventDelete,
  getBizAttachments,
  uploadBizAttachment,
  deleteBizAttachment,
};