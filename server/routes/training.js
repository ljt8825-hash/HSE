/**
 * 培训管理路由 - PostgreSQL + 内存降级双模式
 * 
 * 路由结构:
 *   /records          → 培训计划列表（主页面，内存模式有完整计划数据）
 *   /records/:id      → 培训计划详情
 *   /ledger           → 培训台账（全部培训记录）
 *   /new-employees    → 新员工培训记录
 *   /taihang          → 太行培训记录
 *   /driver           → 驾驶员实操培训记录
 *   /stats            → 培训统计
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { paginateMemory, buildListResponse, sendNotFound, buildMemoryRecord, camelKeys } = require('../utils/commonResponse');
const { uploadDocument, getFileUrl, fixFilenameEncoding } = require('../middleware/upload');
const { hashSensitive } = require('../utils/encryption');
const { requireRole } = require('../middleware/auth');
const assessmentEvent = require('../services/assessmentEventService'); // 月度自动考核事件

/**
 * Sprint D Step 10: 通过 id_card 自动解析 employee_id
 * 优先级: 1) 调用方已传入 employee_id  2) 用 id_card hash 查 employee.id_card_hash
 * @param {string} idCard - 明文身份证号
 * @param {bigint|null} existingEmployeeId - 调用方已传入的 employee_id
 * @returns {Promise<bigint|null>} 解析到的 employee.id，或 null
 */
async function resolveEmployeeId(idCard, existingEmployeeId) {
  if (existingEmployeeId) return existingEmployeeId;
  if (!idCard || typeof idCard !== 'string' || idCard.trim() === '') return null;
  const hash = hashSensitive(idCard.trim());
  if (!hash) return null;
  try {
    const r = await pool.query(
      'SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false LIMIT 1',
      [hash]
    );
    if (r.rows.length > 0) return r.rows[0].id;
    console.warn(`[training] id_card hash 未匹配到 employee: ${idCard.substring(0, 6)}****`);
  } catch (e) {
    console.error('[training] resolveEmployeeId 查询失败:', e.message);
  }
  return null;
}

/**
 * 阶段5（提示词-05）：培训人员落键，口径对齐三违 violations.resolveViolatorId
 * 优先级：① 显式传入的 employeeId/personnelId ② 身份证 hash 命中 employee.id_card_hash
 *         ③ 姓名在 v_employee_org_full 唯一存活匹配
 * 重名 / 未匹配 → 返回 null（调用方保留原值，不落键、不报错）
 * @param {string} name 参训人姓名（自由文本）
 * @param {string} idCard 身份证号（明文）
 * @param {number|null} existingId 调用方显式传入的 employee_id / personnel_id
 * @returns {Promise<number|null>}
 */
async function resolveTrainingPersonId(name, idCard, existingId) {
  if (existingId) return existingId;

  // ① 身份证 hash（明文 id_card 不落库，仅用于解析）
  if (idCard && typeof idCard === 'string' && idCard.trim() !== '') {
    const hash = hashSensitive(idCard.trim());
    if (hash) {
      try {
        const r = await pool.query(
          'SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false LIMIT 1',
          [hash]
        );
        if (r.rows.length > 0) return r.rows[0].id;
        console.warn(`[training] id_card hash 未匹配到 employee: ${idCard.substring(0, 6)}****`);
      } catch (e) {
        console.error('[training] resolveTrainingPersonId (id_card) 查询失败:', e.message);
      }
    }
  }

  // ② 姓名唯一存活匹配（重名放弃，避免错挂）
  const nm = name ? String(name).trim() : '';
  if (nm) {
    try {
      const r = await pool.query(
        `SELECT employee_id FROM v_employee_org_full
          WHERE name = $1 AND is_deleted = false AND is_current = true`,
        [nm]
      );
      if (r.rows.length === 1) return r.rows[0].employee_id;
      if (r.rows.length > 1) {
        console.warn(`[training] 姓名 "${nm}" 匹配到 ${r.rows.length} 条在职员工，跳过（重名风险）`);
      }
    } catch (e) {
      console.error('[training] resolveTrainingPersonId (name) 查询失败:', e.message);
    }
  }
  return null;
}

/**
 * 阶段5：按 employee_id 取员工主数据权威姓名（v_employee_org_full 优先，employee 兜底）。
 * 落键成功时以主数据为准写回 name，避免自由文本错名。
 */
async function resolveTrainingPersonName(employeeId) {
  if (!employeeId) return null;
  try {
    const r = await pool.query(
      `SELECT name FROM v_employee_org_full
        WHERE employee_id = $1 AND is_deleted = false AND is_current = true LIMIT 1`,
      [employeeId]
    );
    if (r.rows.length > 0) return r.rows[0].name;
  } catch (e) { /* 视图异常走兜底 */ }
  try {
    const r = await pool.query(
      'SELECT name FROM employee WHERE id = $1 AND is_deleted = false LIMIT 1',
      [employeeId]
    );
    if (r.rows.length > 0) return r.rows[0].name;
  } catch (e) { /* 忽略 */ }
  return null;
}

/**
 * 培训人员(培训讲师)落键：按讲师姓名解析到职工主数据 trainer_id。
 * 培训记录页面按「培训人员」汇总，姓名取自员工档案（v_employee_org_full），
 * 因此 trainer 姓名需唯一存活匹配才落键 trainer_id；重名/未匹配返回 null 保留原文。
 * @param {string} trainerName 讲师姓名（自由文本）
 * @returns {Promise<number|null>}
 */
async function resolveTrainerEmployeeId(trainerName) {
  if (!trainerName || typeof trainerName !== 'string') return null;
  const nm = trainerName.trim();
  if (!nm) return null;
  try {
    const r = await pool.query(
      `SELECT employee_id FROM v_employee_org_full
        WHERE name = $1 AND is_deleted = false AND is_current = true`,
      [nm]
    );
    if (r.rows.length === 1) return r.rows[0].employee_id;
    if (r.rows.length > 1) {
      console.warn(`[training] 讲师姓名 "${nm}" 匹配到 ${r.rows.length} 条在职员工，跳过（重名风险）`);
    }
  } catch (e) {
    console.error('[training] resolveTrainerEmployeeId 查询失败:', e.message);
  }
  return null;
}

/**
 * 签到表导入：按姓名在花名册（v_employee_org_full）定位在职员工。
 * 在职(relation_status='active') 返回其上级(培训人员)与所属班组/作业中心；
 * 花名册查无此人 → 视为已离职（departed）。
 * @param {string} name 姓名（OCR/签到表文本）
 * @returns {Promise<{matched:boolean, inpost?:boolean, departed?:boolean, employeeId?:number, name?:string,
 *   orgName?:string, orgType?:string, orgPath?:string, positionName?:string,
 *   supervisorId?:number|null, supervisorName?:string|null}>}
 */
async function resolveRosterPerson(name) {
  const nm = name ? String(name).trim() : '';
  if (!nm) return { matched: false, departed: true, name: '' };
  try {
    const r = await pool.query(
      `SELECT employee_id AS "employeeId", name, org_name AS "orgName", org_type AS "orgType",
              org_path AS "orgPath", position_name AS "positionName",
              supervisor_id AS "supervisorId", supervisor_name AS "supervisorName"
         FROM v_employee_org_full
        WHERE name = $1 AND is_deleted = false AND is_current = true AND relation_status = 'active'
        LIMIT 1`,
      [nm],
    );
    if (r.rows.length > 0) return { matched: true, inpost: true, departed: false, ...r.rows[0] };
    return { matched: false, inpost: false, departed: true, name: nm };
  } catch (e) {
    // 视图异常时保守视为已离职，但标记 error 供上层记录
    return { matched: false, inpost: false, departed: true, name: nm, error: e.message };
  }
}

/**
 * 签到表导入：为「已离职」未培训人员定位所属组织（班组/作业中心）的负责人（培训人员）。
 * 已离职者不在花名册，无法经 employee_assignment.supervisor_id 找上级，
 * 故按签到表「部门」字段反查该组织下担任经理/管理员的负责人作为培训人员。
 * @param {string} deptName 签到表「部门」字段
 * @returns {Promise<{trainerId:number, trainerName:string}|null>}
 */
async function resolveOrgTrainer(deptName) {
  const nm = (deptName ? String(deptName) : '').trim();
  if (!nm) return null;
  try {
    const r = await pool.query(
      `SELECT employee_id AS "trainerId", name AS "trainerName"
         FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND org_name = $1
          AND position_name IN ('乡镇作业中心经理','管理员','环卫作业中心片区长','网格长')
        LIMIT 1`,
      [nm],
    );
    return r.rows.length > 0 ? { trainerId: r.rows[0].trainerId, trainerName: r.rows[0].trainerName } : null;
  } catch (e) {
    return null;
  }
}

function cleanRowText(v) {
  return v == null ? '' : String(v).replace(/[\ufffd\u25a0\u25a1\u25c6\u25cf\ufffc]/g, '').trim();
}

// 签到表必填表头字段（规则1：任一为空 → 信息不完整）
const SIGNIN_REQUIRED_HEADERS = ['培训日期', '培训地点', '主持人', '记录人', '部门', '参加人员'];

/**
 * 计算培训人员按月的汇总缺少数 = 应培训(所辖单位在职编制) - 实际培训(trainer_id 命中记录数)
 */
function computeMonthRange(month) {
  // month: 'YYYY-MM'，缺省为当前月（北京时间）
  // 说明：直接在年月数值上推算字符串，避免 toISOString() 把本地时间转 UTC 造成日期偏移一整天。
  const m = month && /^\d{4}-\d{2}$/.test(String(month)) ? String(month) : null;
  const now = new Date();
  const y = m ? +m.slice(0, 4) : now.getFullYear();
  const mo = m ? +m.slice(5, 7) : now.getMonth() + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const monthLabel = `${y}-${pad(mo)}`;
  const startDate = `${monthLabel}-01`;
  let endY = y, endM = mo + 1;
  if (endM > 12) { endM = 1; endY++; }
  const endDate = `${endY}-${pad(endM)}-01`;
  return { monthLabel, startDate, endDate };
}

// ========== 数据库表初始化（IF NOT EXISTS，可重复执行） ==========
let tablesInitialized = false;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    // 1. 培训附件表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_attachments (
        id            BIGSERIAL PRIMARY KEY,
        record_id     BIGINT NOT NULL,
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_attachments_record ON training_attachments(record_id)');

    // 2. 培训版本履历表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_versions (
        id             BIGSERIAL PRIMARY KEY,
        record_id      BIGINT NOT NULL,
        version        VARCHAR(32) NOT NULL,
        change_type    VARCHAR(32) NOT NULL DEFAULT 'update',
        change_summary TEXT,
        changed_by     VARCHAR(64),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_versions_record ON training_versions(record_id)');

    // 3. Sprint5.9: 添加 employee_id/trainer_id 字段
    await pool.query(`ALTER TABLE IF EXISTS training_records ADD COLUMN IF NOT EXISTS employee_id BIGINT`);
    await pool.query(`ALTER TABLE IF EXISTS training_records ADD COLUMN IF NOT EXISTS trainer_id BIGINT`);

    // 3.1 Sprint5.11: 培训记录关联培训计划
    await pool.query(`ALTER TABLE IF EXISTS training_records ADD COLUMN IF NOT EXISTS training_plan_id BIGINT`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_records_plan ON training_records(training_plan_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_records_employee ON training_records(employee_id)');

    // 4. Sprint5.10: 培训要求表（岗位驱动培训管理）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_requirements (
        id BIGSERIAL PRIMARY KEY,
        position_id BIGINT NOT NULL,
        position_name VARCHAR(128) NOT NULL,
        training_name VARCHAR(255) NOT NULL,
        training_cycle VARCHAR(32) NOT NULL,
        is_required BOOLEAN NOT NULL DEFAULT TRUE,
        duration_minutes INT NOT NULL DEFAULT 60,
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_requirements_position ON training_requirements(position_id)');

    // 5. Sprint5.10: 培训计划表（独立于培训记录）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_plans (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        plan_type VARCHAR(32) NOT NULL DEFAULT 'annual',
        training_type VARCHAR(64) NOT NULL,
        target_audience VARCHAR(255),
        trainer_name VARCHAR(64),
        trainer_id BIGINT,
        planned_attendees INT DEFAULT 0,
        actual_attendees INT DEFAULT 0,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        location VARCHAR(255),
        duration_hours DECIMAL(5,1) DEFAULT 4,
        content TEXT,
        exam_required BOOLEAN DEFAULT FALSE,
        pass_score INT DEFAULT 60,
        status VARCHAR(32) DEFAULT 'draft',
        remark TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_plans_status ON training_plans(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_training_plans_plan_type ON training_plans(plan_type)');
    // 06F 对齐《安全培训教育实施计划表》附件1：补充培训时间(文本)与责任部门(人)两列
    await pool.query('ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS training_time VARCHAR(255)');
    await pool.query('ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS responsible_dept VARCHAR(255)');

    // 6. 月度培训台账导入存储表（培训记录「按培训人员汇总」覆盖口径）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hse_training_ledger_monthly (
        id SERIAL PRIMARY KEY,
        trainer_id INT,
        trainer_name TEXT NOT NULL,
        month CHAR(7) NOT NULL,
        expected_count INT NOT NULL DEFAULT 0,
        actual_count INT NOT NULL DEFAULT 0,
        missing_count INT NOT NULL DEFAULT 0,
        incomplete_count INT NOT NULL DEFAULT 0,
        source TEXT DEFAULT 'excel-import',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (trainer_id, month)
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_hse_training_ledger_monthly_month ON hse_training_ledger_monthly(month)');

    tablesInitialized = true;
    console.log('[Training] 数据库表 attachments/versions/employee_id/trainer_id/requirements/plans/ledger_monthly 已就绪');
  } catch (err) {
    console.warn('[Training] 数据库表初始化失败:', err.message);
  }
}

// ========== 时效状态计算（培训证书有效期，默认12个月） ==========
// 规则：基于 training_date + validity_period(月) 计算到期日
// - 过期：当前日期 > 到期日
// - 临期：距到期日 ≤ 30 天
// - 正常：距到期日 > 30 天
function calcExpiryStatus(trainingDate, validityPeriod) {
  const vp = validityPeriod || 12; // 默认12个月有效期
  if (!trainingDate) return 'unknown';
  const eff = new Date(trainingDate);
  if (isNaN(eff.getTime())) return 'unknown';
  const expiry = new Date(eff);
  expiry.setMonth(expiry.getMonth() + parseInt(vp));
  const now = new Date();
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'normal';
}

// ========== 内存降级存储 ==========
let memoryPlans = [];
let memoryRecords = [];
let memoryTrainingAttachments = [];
let memoryTrainingVersions = [];
let planIdCounter = 1;
let recordIdCounter = 1;
let trainingAttachmentIdCounter = 1;
let trainingVersionIdCounter = 1;

function initMemoryData() {
  if (memoryPlans.length > 0) return;
  // 种子数据已移除，内存模式仅用于 API 兼容性（空数据）
  memoryPlans = [];
  memoryRecords = [];
  planIdCounter = 1;
  recordIdCounter = 1;
}

// ========== 身份证号脱敏（提示词-134 T6，对齐超龄模块 131-F2） ==========
function maskIdCard(idCard) {
  if (!idCard || typeof idCard !== 'string') return '';
  if (idCard.length <= 8) return idCard;
  return idCard.slice(0, 4) + '**********' + idCard.slice(-4);
}

// ========== 本地时区日期格式化（修复：toISOString 按 UTC 序列化会把 +8 时区的训练日期回拨一天） ==========
// Postgres date/timestamp 经 pg 驱动解析为 JS Date 后，用 toISOString() 得到的是 UTC 字符串，
// 在 Asia/Shanghai(+8) 下会显示为存储日期的前一天；改为按本地年月日拼装，保证“改多少存多少、显示多少”。
function formatDateYMD(value) {
  const _r0 = (value instanceof Date ? value.getFullYear() : 'n/a');
  const _r1 = (value instanceof Date ? String(value.getMonth() + 1).padStart(2, '0') : 'n/a');
  const _r2 = (value instanceof Date ? String(value.getDate()).padStart(2, '0') : 'n/a');
  const _ret = (value instanceof Date) ? `${_r0}-${_r1}-${_r2}` : (value == null ? null : String(value).slice(0, 10) || null);
  return _ret;
}

// ========== formatRow: training_records → 前端格式 ==========
function formatRecordRow(row) {
  const trainingDate = formatDateYMD(row.training_date);
  return camelKeys({
    id: row.id,
    name: row.name || '',
    personnelId: row.personnel_id || null,
    employeeId: row.employee_id || null,
    // 提示词-57 v2: 受训人上级（花名册为基石）
    supervisorId: row.supervisor_id || null,
    supervisorName: row.supervisor_name || null,
    trainerId: row.trainer_id || null,
    trainingPlanId: row.training_plan_id || null,
    idCard: maskIdCard(row.id_card),   // 提示词-134 T6: 脱敏展示；原始 id_card 字段仍保留明文供导出用
    department: row.dept || '',
    position: row.position || '',
    gridLevel: row.grid_level || '',
    frequency: row.frequency || '',
    trainingType: row.training_type || '',
    trainingDate: trainingDate,
    durationMinutes: row.duration_minutes || 0,
    content: row.content || '',
    result: row.result || '',
    score: row.score !== null ? parseFloat(row.score) : null,
    trainer: row.trainer || '',
    remark: row.remark || '',
    // 证书管理扩展字段（提示词-证书管理）：人员类型 / 有效期 / 置顶
    personnelType: row.personnel_type || '',
    validity: row.validity || '',
    is_pinned: row.is_pinned ?? false,
    expiryStatus: calcExpiryStatus(trainingDate),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// ========== GET /records — 培训计划列表 ==========
router.get('/records', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      let data = memoryPlans.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword, type, status } = req.query;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.title && r.title.toLowerCase().includes(kw)) || (r.trainer && r.trainer.toLowerCase().includes(kw)));
      }
      if (type) data = data.filter(r => r.type === type);
      if (status) data = data.filter(r => r.status === status);
      const { list, total } = paginateMemory(data, page, pageSize);
      return buildListResponse(res, list, total, page, pageSize, '查询成功(内存模式)');
    }

    // DB模式: 从 training_records 构建（聚合为计划视角）
    const { page = 1, pageSize = 20, keyword, type, status } = req.query;
    let whereSql = ' WHERE tr.is_deleted = false';
    const params = [];
    let paramIdx = 0;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (tr.name ILIKE $${paramIdx} OR tr.content ILIKE $${paramIdx} OR tr.trainer ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (type) {
      paramIdx++;
      whereSql += ` AND tr.training_type = $${paramIdx}`;
      params.push(type);
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_records tr${whereSql}`, params);
    const total = countResult.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    params.push(parseInt(pageSize));
    paramIdx++;
    params.push(offset);

    const result = await pool.query(`SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name
       FROM training_records tr
       LEFT JOIN employee_assignment ea ON tr.employee_id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
       ${whereSql} ORDER BY tr.is_pinned DESC NULLS LAST, CASE tr.personnel_type WHEN '主要负责人' THEN 0 WHEN '安全管理人员' THEN 1 ELSE 2 END, tr.training_date ASC NULLS LAST, tr.id ASC LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
    res.json(success({ list: result.rows.map(formatRecordRow), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 报表导出端点（必须定义在 /:id 之前，避免被参数路由遮蔽）
// ============================================================

// ========== GET /records/export — 导出培训记录清单（CSV） ==========
router.get('/records/export', requireRole('admin', 'safety_manager'), async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted).map(r => ({
        ...r,
        expiry_status: calcExpiryStatus(r.trainingDate || r.training_date),
      }));
      return sendTrainingCsvExport(res, data);
    }

    const result = await pool.query(`
      SELECT id, name, dept, position, training_type, training_date, duration_minutes,
             content, result, score, trainer, remark, personnel_type, validity, created_at
      FROM training_records WHERE is_deleted = FALSE ORDER BY is_pinned DESC NULLS LAST, training_date ASC NULLS LAST, id ASC
    `);
    const list = result.rows.map(r => ({
      ...r,
      expiry_status: calcExpiryStatus(r.training_date),
    }));
    sendTrainingCsvExport(res, list);
  } catch (err) {
    next(err);
  }
});

// ========== GET /ledger/export — 导出培训台账（CSV） ==========
router.get('/ledger/export', requireRole('admin', 'safety_manager'), async (req, res, next) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const data = memoryRecords.filter(r => !r.is_deleted);
      return sendTrainingCsvExport(res, data);
    }

    const result = await pool.query(`
      SELECT id, name, dept, position, training_type, training_date, duration_minutes,
             content, result, score, trainer, remark, personnel_type, validity, created_at
      FROM training_records WHERE is_deleted = FALSE ORDER BY training_date DESC NULLS LAST, id DESC
    `);
    sendTrainingCsvExport(res, result.rows);
  } catch (err) {
    next(err);
  }
});

// ========== GET /records/:id — 单条 ==========
router.get('/records/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!record) return sendNotFound(res);
      return res.json(success(record, '查询成功(内存模式)'));
    }
    const result = await pool.query('SELECT * FROM training_records WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRecordRow(result.rows[0]), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== POST /records — 创建 ==========
router.post('/records', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      initMemoryData();
      const record = {
        id: planIdCounter++,
        title: b.title || '',
        type: b.type || 'safety',
        status: b.status || 'draft',
        targetAudience: b.targetAudience || '',
        trainer: b.trainer || '',
        plannedAttendees: b.plannedAttendees || 0,
        actualAttendees: b.actualAttendees,
        startDate: b.startDate || new Date().toISOString(),
        endDate: b.endDate || new Date().toISOString(),
        location: b.location || '',
        duration: b.duration || 0,
        content: b.content || '',
        examRequired: b.examRequired || false,
        passScore: b.passScore,
        remark: b.remark || '',
        is_deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryPlans.push(record);
      return res.json(success(record, '创建成功(内存模式)'));
    }

    await ensureTables();

    const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, personnel_type, validity, is_pinned } = b;
    // 兼容前端 camelCase 入参（personnelType / validity / isPinned），与 snake_case 等价
    const personnelTypeIn = personnel_type != null ? personnel_type : (b.personnelType ?? '');
    const validityIn = validity != null ? validity : (b.validity ?? '');
    const isPinnedIn = is_pinned != null ? is_pinned : (b.isPinned ?? false);
    // 兼容前端 camelCase 入参（employeeId / personnelId / idCard），与 snake_case 等价
    const employeeIdIn = employee_id != null ? employee_id : b.employeeId;
    const personnelIdIn = personnel_id != null ? personnel_id : b.personnelId;
    const idCardIn = id_card != null ? id_card : b.idCard;
    // 阶段5：人员落键（显式 employeeId/personnelId > 身份证 hash > 姓名唯一匹配）
    const resolvedEmployeeId = await resolveTrainingPersonId(name, idCardIn, employeeIdIn || personnelIdIn || null);
    // 落键成功则以员工主数据为准同步标准姓名，避免自由文本错名
    const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;
    const finalName = standardName || name || '';
    const finalPersonnelId = resolvedEmployeeId != null ? resolvedEmployeeId : (personnelIdIn || null);
    // 花名册自动匹配：落键到员工后，若部门/职位未显式提供（新增行只填姓名），则从 v_employee_org_full 自动带出
    let finalDept = dept || '';
    let finalPosition = position || '';
    if (!finalDept || !finalPosition) {
      const orgRes = await pool.query(
        'SELECT org_name, position_name FROM v_employee_org_full WHERE employee_id = $1 AND is_current = true AND is_deleted = false LIMIT 1',
        [resolvedEmployeeId]
      );
      const org = orgRes.rows[0];
      if (org) {
        finalDept = finalDept || org.org_name || '';
        finalPosition = finalPosition || org.position_name || '';
      }
    }
    // 培训人员(讲师)落键：显式 trainerId > 讲师姓名唯一匹配
    let finalTrainerId = trainer_id != null ? trainer_id : (b.trainerId ?? null);
    if (finalTrainerId == null && trainer) finalTrainerId = await resolveTrainerEmployeeId(trainer);
    const insertResult = await pool.query(`
      INSERT INTO training_records (personnel_id, name, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, personnel_type, validity, is_pinned)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [finalPersonnelId, finalName, idCardIn || '', finalDept, finalPosition, grid_level || '', frequency || '', training_type || 'HSE', training_date || null, duration_minutes || 0, content || '', result || '合格', score || null, trainer || '', remark || '', resolvedEmployeeId, finalTrainerId, personnelTypeIn || '', validityIn || '', isPinnedIn]);
    res.json(success(formatRecordRow(insertResult.rows[0]), '创建成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== PUT /records/:id — 更新 ==========
router.put('/records/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      initMemoryData();
      const idx = memoryPlans.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      Object.assign(memoryPlans[idx], b, { updatedAt: new Date().toISOString() });
      return res.json(success(memoryPlans[idx], '更新成功(内存模式)'));
    }

    const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, personnel_type, validity, is_pinned } = b;
    // 兼容前端 camelCase 入参（employeeId / personnelId / idCard / personnelType / validity / isPinned），与 snake_case 等价
    const employeeIdIn = employee_id != null ? employee_id : b.employeeId;
    const personnelTypeIn = personnel_type != null ? personnel_type : (b.personnelType ?? null);
    const validityIn = validity != null ? validity : (b.validity ?? null);
    const isPinnedIn = is_pinned != null ? is_pinned : (b.isPinned ?? null);
    const personnelIdIn = personnel_id != null ? personnel_id : b.personnelId;
    const idCardIn = id_card != null ? id_card : b.idCard;
    // 阶段5：人员落键（同 POST 口径）；未落键时保留调用方传入值，维持 COALESCE 局部更新语义
    const resolvedEmployeeId = await resolveTrainingPersonId(name, idCardIn, employeeIdIn || personnelIdIn || null);
    const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;
    const finalName = standardName || name;
    const finalPersonnelId = resolvedEmployeeId != null ? resolvedEmployeeId : personnelIdIn;
    const finalEmployeeId = resolvedEmployeeId != null ? resolvedEmployeeId : employeeIdIn;
    // 花名册自动匹配（编辑场景）：本次更新携带姓名 且 未显式提供部门/职位时，从 v_employee_org_full 补齐
    const nameTouched = !!(b && typeof b === 'object' && 'name' in b);
    let finalDept = dept;
    let finalPosition = position;
    if (nameTouched && finalEmployeeId && (finalDept === undefined || finalPosition === undefined)) {
      const orgResU = await pool.query(
        'SELECT org_name, position_name FROM v_employee_org_full WHERE employee_id = $1 AND is_current = true AND is_deleted = false LIMIT 1',
        [finalEmployeeId]
      );
      const orgU = orgResU.rows[0];
      if (orgU) {
        if (finalDept === undefined) finalDept = orgU.org_name;
        if (finalPosition === undefined) finalPosition = orgU.position_name;
      }
    }
    // 培训人员(讲师)落键（同 POST 口径）
    let finalTrainerId = trainer_id != null ? trainer_id : (b.trainerId ?? null);
    if (finalTrainerId == null && trainer) finalTrainerId = await resolveTrainerEmployeeId(trainer);
    const updateResult = await pool.query(`
      UPDATE training_records SET
        name = COALESCE($1, name), personnel_id = COALESCE($2, personnel_id),
        id_card = COALESCE($3, id_card), dept = COALESCE($4, dept),
        position = COALESCE($5, position), grid_level = COALESCE($6, grid_level),
        frequency = COALESCE($7, frequency), training_type = COALESCE($8, training_type),
        training_date = COALESCE($9, training_date), duration_minutes = COALESCE($10, duration_minutes),
        content = COALESCE($11, content), result = COALESCE($12, result),
        score = COALESCE($13, score), trainer = COALESCE($14, trainer),
        remark = COALESCE($15, remark), employee_id = COALESCE($16, employee_id),
        trainer_id = COALESCE($17, trainer_id),
        personnel_type = COALESCE($18, personnel_type), validity = COALESCE($19, validity),
        is_pinned = COALESCE($20, is_pinned),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $21 AND is_deleted = false RETURNING *`,
      [finalName, finalPersonnelId, idCardIn, finalDept, finalPosition, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, finalEmployeeId, finalTrainerId, personnelTypeIn != null ? personnelTypeIn : null, validityIn != null ? validityIn : null, isPinnedIn, req.params.id]);
    if (updateResult.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(formatRecordRow(updateResult.rows[0]), '更新成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== DELETE /records/:id — 删除 ==========
router.delete('/records/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      record.is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }
    const result = await pool.query('UPDATE training_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 子路由: 培训台账 / 新员工 / 驾驶员
// ============================================================
function createTrainingSubRoute(routePath, trainingType, storeKey) {
  router.get(`/${routePath}`, async (req, res) => {
    try {
      if (!isConnected()) {
        initMemoryData();
        let data = memoryRecords.filter(r => !r.is_deleted);
        if (trainingType) data = data.filter(r => r.training_type === trainingType);
        const { page = 1, pageSize = 20, keyword, result } = req.query;
        if (keyword) {
          const kw = keyword.toLowerCase();
          data = data.filter(r => (r.name && r.name.toLowerCase().includes(kw)) || (r.dept && r.dept.toLowerCase().includes(kw)) || (r.content && r.content.toLowerCase().includes(kw)));
        }
        if (result) data = data.filter(r => r.result === result);
        const { list, total } = paginateMemory(data, page, pageSize);
        return buildListResponse(res, list, total, page, pageSize, '查询成功(内存模式)');
      }

      const { page = 1, pageSize = 20, keyword, result } = req.query;
      let whereSql = ' WHERE tr.is_deleted = false';
      const params = [];
      let paramIdx = 0;

      if (trainingType) {
        paramIdx++;
        whereSql += ` AND tr.training_type = $${paramIdx}`;
        params.push(trainingType);
      }
      if (keyword) {
        paramIdx++;
        whereSql += ` AND (tr.name ILIKE $${paramIdx} OR tr.dept ILIKE $${paramIdx} OR tr.content ILIKE $${paramIdx})`;
        params.push(`%${keyword}%`);
      }
      if (result) {
        paramIdx++;
        whereSql += ` AND tr.result = $${paramIdx}`;
        params.push(result);
      }

      const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_records tr${whereSql}`, params);
      const total = countResult.rows[0].total;
      const offset = (parseInt(page) - 1) * parseInt(pageSize);
      paramIdx++;
      params.push(parseInt(pageSize));
      paramIdx++;
      params.push(offset);

      const resultList = await pool.query(`SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name FROM training_records tr LEFT JOIN employee_assignment ea ON tr.employee_id = ea.employee_id AND ea.is_primary = true AND ea.is_current = true AND ea.is_deleted = false LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false${whereSql} ORDER BY tr.training_date DESC NULLS LAST, tr.id DESC LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
      res.json(success({ list: resultList.rows.map(formatRecordRow), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
    } catch (err) { res.json(error(-1, err.message)); }
  });

  router.post(`/${routePath}`, requireRole('admin', 'safety_manager'), async (req, res) => {
    try {
      const b = { ...req.body, training_type: trainingType || req.body?.training_type || 'HSE' };
      if (!isConnected()) {
        initMemoryData();
        const record = buildMemoryRecord(recordIdCounter++, b);
        memoryRecords.push(record);
        return res.json(success(formatRecordRow(record), '创建成功(内存模式)'));
      }
      await ensureTables();
      const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, training_plan_id } = b;
      // 兼容前端 camelCase 入参（employeeId / personnelId / idCard），与 snake_case 等价
      const employeeIdIn = employee_id != null ? employee_id : b.employeeId;
      const personnelIdIn = personnel_id != null ? personnel_id : b.personnelId;
      const idCardIn = id_card != null ? id_card : b.idCard;
      // 阶段5：人员落键（显式 employeeId/personnelId > 身份证 hash > 姓名唯一匹配）
      const resolvedEmployeeId = await resolveTrainingPersonId(name, idCardIn, employeeIdIn || personnelIdIn || null);
      const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;
      const finalName = standardName || (name || '').trim();
      const finalPersonnelId = resolvedEmployeeId != null ? resolvedEmployeeId : (personnelIdIn || null);
      // 培训人员(讲师)落键：显式 trainerId > 讲师姓名唯一匹配
      let finalTrainerId = trainer_id != null ? trainer_id : (b.trainerId ?? null);
      if (finalTrainerId == null && trainer) finalTrainerId = await resolveTrainerEmployeeId(trainer);
      const insertResult = await pool.query(`
        INSERT INTO training_records (personnel_id, name, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, training_plan_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [finalPersonnelId, finalName, idCardIn || '', dept || '', position || '', grid_level || '', frequency || '', trainingType || training_type || 'HSE', training_date || null, duration_minutes || 0, content || '', result || '合格', score || null, trainer || '', remark || '', resolvedEmployeeId, finalTrainerId, training_plan_id || null]);
      res.json(success(formatRecordRow(insertResult.rows[0]), '创建成功'));
    } catch (err) { res.json(error(-1, err.message)); }
  });

  router.put(`/${routePath}/:id`, requireRole('admin', 'safety_manager'), async (req, res) => {
    try {
      const b = req.body;
      if (!isConnected()) {
        initMemoryData();
        const idx = memoryRecords.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
        if (idx === -1) return res.json(error(-2, '记录不存在'));
        Object.assign(memoryRecords[idx], b, { updated_at: new Date().toISOString() });
        return res.json(success(formatRecordRow(memoryRecords[idx]), '更新成功(内存模式)'));
      }
      const { name, personnel_id, id_card, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id, training_plan_id } = b;
      // 兼容前端 camelCase 入参（employeeId / personnelId / idCard），与 snake_case 等价
      const employeeIdIn = employee_id != null ? employee_id : b.employeeId;
      const personnelIdIn = personnel_id != null ? personnel_id : b.personnelId;
      const idCardIn = id_card != null ? id_card : b.idCard;
      // 阶段5：人员落键（同 POST 口径）；未落键时保留调用方传入值，维持 COALESCE 局部更新语义
      const resolvedEmployeeId = await resolveTrainingPersonId(name, idCardIn, employeeIdIn || personnelIdIn || null);
      const standardName = resolvedEmployeeId ? await resolveTrainingPersonName(resolvedEmployeeId) : null;
      const finalName = standardName || name;
      const finalPersonnelId = resolvedEmployeeId != null ? resolvedEmployeeId : personnelIdIn;
      const finalEmployeeId = resolvedEmployeeId != null ? resolvedEmployeeId : employeeIdIn;
      // 培训人员(讲师)落键（同 POST 口径）
      let finalTrainerId = trainer_id != null ? trainer_id : (b.trainerId ?? null);
      if (finalTrainerId == null && trainer) finalTrainerId = await resolveTrainerEmployeeId(trainer);
      const updateResult = await pool.query(`
        UPDATE training_records SET
          name = COALESCE($1, name), personnel_id = COALESCE($2, personnel_id),
          id_card = COALESCE($3, id_card), dept = COALESCE($4, dept),
          position = COALESCE($5, position), grid_level = COALESCE($6, grid_level),
          frequency = COALESCE($7, frequency), training_type = COALESCE($8, training_type),
          training_date = COALESCE($9, training_date), duration_minutes = COALESCE($10, duration_minutes),
          content = COALESCE($11, content), result = COALESCE($12, result),
          score = COALESCE($13, score), trainer = COALESCE($14, trainer),
          remark = COALESCE($15, remark), employee_id = COALESCE($16, employee_id),
          trainer_id = COALESCE($17, trainer_id), training_plan_id = COALESCE($18, training_plan_id),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $19 AND is_deleted = false RETURNING *`,
        [finalName, finalPersonnelId, idCardIn, dept, position, grid_level, frequency, training_type, training_date, duration_minutes, content, result, score, trainer, remark, finalEmployeeId, finalTrainerId, training_plan_id, req.params.id]);
      if (updateResult.rows.length === 0) return res.json(error(-2, '记录不存在'));
      res.json(success(formatRecordRow(updateResult.rows[0]), '更新成功'));
    } catch (err) { res.json(error(-1, err.message)); }
  });

  router.delete(`/${routePath}/:id`, requireRole('admin', 'safety_manager'), async (req, res) => {
    try {
      if (!isConnected()) {
        initMemoryData();
        const record = memoryRecords.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
        if (!record) return res.json(error(-2, '记录不存在'));
        record.is_deleted = true;
        return res.json(success(null, '删除成功(内存模式)'));
      }
      const result = await pool.query('UPDATE training_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
      res.json(success(null, '删除成功'));
    } catch (err) { res.json(error(-1, err.message)); }
  });
}

// 培训台账（全部记录）
createTrainingSubRoute('ledger', null, 'records');
// 新员工培训
createTrainingSubRoute('new-employees', '新员工', 'records');
// 驾驶员实操
createTrainingSubRoute('driver', '驾驶员', 'records');
// 太行培训（兼容旧路由）
createTrainingSubRoute('taihang', '太行', 'records');

// =====================================================================
// 培训记录页面改造：按「培训人员」月度汇总
//   GET /ledger/personnel-summary?month=YYYY-MM        → 每培训人员一行
//   GET /ledger/personnel-summary/:employeeId/records?month= → 该培训人员当月实际培训明细
// =====================================================================

// ========== GET /ledger/months — 有月度培训台账数据的月份（倒序） ==========
// 供「培训记录」月份下拉使用：返回 hse_training_ledger_monthly 中实际有记录的月份，
// 前端将其与「最近12个月」合并，从而能选中并查看更早的月份（如 2025-08/09）。
router.get('/ledger/months', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT month FROM hse_training_ledger_monthly ORDER BY month DESC`,
    );
    res.json(success({ months: r.rows.map((x) => x.month) }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== GET /ledger/personnel-summary — 培训人员月度汇总 ==========
// 口径：
//   - 培训人员清单 = v_employee_org_full 按岗位/职能口径（乡镇作业中心经理/管理员/片区长/网格长 + 职能部门）
//   - 应培训人数   = 该培训人员所辖组织单位（org_path 前缀）下的在职在册员工数
//   - 实际培训人数 = 当月 training_records 中 trainer_id 命中该培训人员的记录数
//   - 缺少人数     = 应培训 - 实际培训（前端/这里计算）
router.get('/ledger/personnel-summary', async (req, res) => {
  try {
    await ensureTables();
    const { startDate, endDate, monthLabel } = computeMonthRange(req.query.month);
    const rows = await pool.query(
      `WITH monthly AS (
          SELECT trainer_id, trainer_name, expected_count, actual_count, missing_count, incomplete_count
          FROM hse_training_ledger_monthly
          WHERE month = $1
       ), untrained AS (
          SELECT trainer_id,
                 COUNT(*) FILTER (WHERE status = 'inpost')::int AS untrained_inpost,
                 COUNT(*) FILTER (WHERE status = 'departed')::int AS untrained_departed,
                 string_agg(DISTINCT CASE WHEN status = 'inpost' THEN name END, '、') AS inpost_names,
                 string_agg(DISTINCT CASE WHEN status = 'departed' THEN name END, '、') AS departed_names
          FROM hse_untrained_log
          WHERE month = $1
          GROUP BY trainer_id
       )
       SELECT COALESCE(m.trainer_id, 0) AS "employeeId",
              COALESCE(e.name, m.trainer_name) AS name,
              COALESCE(e.org_name, '') AS "department",
              COALESCE(e.position_name, '') AS "position",
              COALESCE(e.org_type, '') AS "orgType",
              m.expected_count AS "expectedCount",
              m.actual_count AS "actualCount",
              m.missing_count AS "monthlyMissing",
              COALESCE(m.incomplete_count, 0) AS "incompleteCount",
              COALESCE(u.untrained_inpost, 0) AS "untrainedInpost",
              COALESCE(u.untrained_departed, 0) AS "untrainedDeparted",
              COALESCE(u.inpost_names, '') AS "inpostNames",
              COALESCE(u.departed_names, '') AS "departedNames"
       FROM monthly m
         LEFT JOIN v_employee_org_full e ON e.employee_id = m.trainer_id
         LEFT JOIN untrained u ON u.trainer_id = m.trainer_id
       ORDER BY "department", name`,
      [monthLabel],
    );
    const list = rows.rows.map((r) => {
      const { expectedCount, actualCount, untrainedInpost, untrainedDeparted, monthlyMissing } = r;
      const importedTotal = (untrainedInpost || 0) + (untrainedDeparted || 0);
      // 缺少数：月度台账导入值优先；其次以「签到表导入登记」为准；当月未导入时回退『应培训 − 实际培训』（规则5）
      const missingCount = monthlyMissing != null
        ? monthlyMissing
        : (importedTotal > 0
            ? importedTotal
            : ((expectedCount || 0) - (actualCount || 0)));
      return { ...r, month: monthLabel, missingCount, expectedCount, actualCount };
    });
    res.json(success({ list, total: list.length, month: monthLabel }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// 人员月度汇总查询（列表 / 导出共用）
async function loadPersonnelSummary(month) {
  await ensureTables();
  const { startDate, endDate, monthLabel } = computeMonthRange(month);
  const rows = await pool.query(
    `WITH monthly AS (
        SELECT trainer_id, trainer_name, expected_count, actual_count, missing_count, incomplete_count
        FROM hse_training_ledger_monthly
        WHERE month = $1
     ), untrained AS (
        SELECT trainer_id,
               COUNT(*) FILTER (WHERE status = 'inpost')::int AS untrained_inpost,
               COUNT(*) FILTER (WHERE status = 'departed')::int AS untrained_departed,
               string_agg(DISTINCT CASE WHEN status = 'inpost' THEN name END, '、') AS inpost_names,
               string_agg(DISTINCT CASE WHEN status = 'departed' THEN name END, '、') AS departed_names
        FROM hse_untrained_log
        WHERE month = $1
        GROUP BY trainer_id
     )
     SELECT COALESCE(m.trainer_id, 0) AS "employeeId",
            COALESCE(e.name, m.trainer_name) AS name,
            COALESCE(e.org_name, '') AS "department",
            COALESCE(e.position_name, '') AS "position",
            COALESCE(e.org_type, '') AS "orgType",
            m.expected_count AS "expectedCount",
            m.actual_count AS "actualCount",
            m.missing_count AS "monthlyMissing",
            COALESCE(m.incomplete_count, 0) AS "incompleteCount",
            COALESCE(u.untrained_inpost, 0) AS "untrainedInpost",
            COALESCE(u.untrained_departed, 0) AS "untrainedDeparted",
            COALESCE(u.inpost_names, '') AS "inpostNames",
            COALESCE(u.departed_names, '') AS "departedNames"
     FROM monthly m
       LEFT JOIN v_employee_org_full e ON e.employee_id = m.trainer_id
       LEFT JOIN untrained u ON u.trainer_id = m.trainer_id
     ORDER BY "department", name`,
    [monthLabel],
  );
  return rows.rows.map((r) => {
    const { expectedCount, actualCount, untrainedInpost, untrainedDeparted, monthlyMissing } = r;
    const importedTotal = (untrainedInpost || 0) + (untrainedDeparted || 0);
    const missingCount = monthlyMissing != null
      ? monthlyMissing
      : (importedTotal > 0
          ? importedTotal
          : ((expectedCount || 0) - (actualCount || 0)));
    return { ...r, month: monthLabel, missingCount, expectedCount, actualCount };
  });
}

// ========== GET /ledger/personnel-summary/export — 人员月度汇总导出（含未培训姓名及在岗/离职状态） ==========
router.get('/ledger/personnel-summary/export', requireRole('admin', 'safety_manager'), async (req, res, next) => {
  try {
    if (!isConnected()) return res.json(error(-2, '内存模式下不支持导出，请连接数据库'));
    const list = await loadPersonnelSummary(req.query.month);
    const headers = ['姓名', '部门', '岗位', '培训日期', '应培训人数', '实际培训人数', '缺少人数', '资料不完整', '在岗未培训人员', '离职未培训人员'];
    const rows = list.map((r) => [
      r.name || '',
      r.department || '',
      r.position || '',
      r.month || '',
      r.expectedCount != null ? r.expectedCount : '',
      r.actualCount != null ? r.actualCount : '',
      r.missingCount != null ? r.missingCount : '',
      r.incompleteCount != null ? r.incompleteCount : '',
      (r.inpostNames || ''),
      (r.departedNames || ''),
    ].map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + headers.map((h) => `"${h}"`).join(',') + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="personnel_summary_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) { next(err); }
});

// ========== POST /ledger/monthly-import — 月度培训台账 Excel 导入 ==========
// 口径：培训人数→应培训、未培训人数→实际、缺少签字人数→缺少、资料不完整→资料不完整
// 按培训人姓名聚合；导入前清空该月 hse_training_ledger_monthly 数据（覆盖式导入）
const _ledgerTmpDir = path.join(os.tmpdir(), 'hse-training-ledger');
if (!fs.existsSync(_ledgerTmpDir)) fs.mkdirSync(_ledgerTmpDir, { recursive: true });
const ledgerUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, _ledgerTmpDir),
    filename: (req, file, cb) => cb(
      null,
      `${Date.now()}_${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || '').toLowerCase() || '.xlsx'}`,
    ),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/ledger/monthly-import', requireRole('admin', 'safety_manager'), ledgerUpload.single('file'), async (req, res, next) => {
  try {
    if (!isConnected()) return res.json(error(-2, '内存模式下不支持导入，请连接数据库'));
    if (!req.file) return res.json(error(-2, '请上传 Excel 文件'));
    await ensureTables();
    const month = req.body.month && /^\d{4}-\d{2}$/.test(String(req.body.month))
      ? String(req.body.month)
      : computeMonthRange(null).monthLabel;

    const wb = XLSX.readFile(req.file.path);
    const sheetName = wb.SheetNames.find((n) => String(n).includes('月度培训台账')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    // 定位表头行（需含「培训人」列；人数列兼容新旧两种表头）
    // 新版：培训人数/未培训人数/缺少签字人数/资料不完整
    // 旧版：应到人数/实到人数/缺少签字人数（无资料不完整）
    let headerRowIdx = -1;
    let headerMap = {};
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const row = raw[i] || [];
      const idx = {};
      row.forEach((v, c) => {
        const t = String(v == null ? '' : v).replace(/\s+/g, '');
        if (t) idx[t] = c;
      });
      if (idx['培训人'] != null && (idx['培训人数'] != null || idx['应到人数'] != null)) {
        headerRowIdx = i;
        headerMap = idx;
        break;
      }
    }
    if (headerRowIdx < 0) {
      return res.json(error(-2, `未在「${sheetName}」工作表中找到表头（需含「培训人」及「培训人数/应到人数」列）`));
    }

    const colTrainer = headerMap['培训人'];
    const colExpected = headerMap['培训人数'] != null ? headerMap['培训人数'] : headerMap['应到人数'];
    const colActual = headerMap['未培训人数'] != null ? headerMap['未培训人数'] : headerMap['实到人数'];
    const colMissing = headerMap['缺少签字人数'];
    // 兼容两种表头写法：旧「资料不完整」/ Excel 常用「表头内容缺失」
    const colIncomplete = headerMap['资料不完整'] != null
      ? headerMap['资料不完整']
      : (headerMap['表头内容缺失'] != null ? headerMap['表头内容缺失'] : null);

    const toInt = (v) => {
      if (v == null || v === '') return 0;
      const n = parseInt(String(v).replace(/[^\d.-]/g, ''), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };

    // 按培训人姓名聚合（同一培训人多场次求和）
    const agg = new Map();
    for (let i = headerRowIdx + 1; i < raw.length; i++) {
      const row = raw[i] || [];
      let name = String(row[colTrainer] == null ? '' : row[colTrainer]).trim();
      // 培训人列含顿号时取第一个名字（如「刘金涛、张玉祯」→「刘金涛」）
      if (name.includes('、')) name = name.split('、')[0].trim();
      if (!name) continue;
      const cur = agg.get(name) || { name, expected: 0, actual: 0, missing: 0, incomplete: 0 };
      cur.expected += toInt(row[colExpected]);
      cur.actual += toInt(row[colActual]);
      cur.missing += toInt(row[colMissing]);
      cur.incomplete += toInt(row[colIncomplete]);
      agg.set(name, cur);
    }
    if (agg.size === 0) return res.json(error(-2, '未解析到任何培训人数据'));

    // 培训人姓名 → employee_id（v_employee_org_full 在职在册）
    const names = [...agg.keys()];
    const empRes = await pool.query(
      `SELECT employee_id, name FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND name = ANY($1)`,
      [names],
    );
    const nameToId = new Map();
    empRes.rows.forEach((r) => {
      if (!nameToId.has(r.name)) nameToId.set(r.name, r.employee_id);
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM hse_training_ledger_monthly WHERE month = $1', [month]);
      for (const item of agg.values()) {
        await client.query(
          `INSERT INTO hse_training_ledger_monthly
             (trainer_id, trainer_name, month, expected_count, actual_count, missing_count, incomplete_count, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'excel-import')
           ON CONFLICT (trainer_id, month) DO UPDATE SET
             trainer_name = EXCLUDED.trainer_name,
             expected_count = EXCLUDED.expected_count,
             actual_count = EXCLUDED.actual_count,
             missing_count = EXCLUDED.missing_count,
             incomplete_count = EXCLUDED.incomplete_count,
             updated_at = CURRENT_TIMESTAMP`,
          [nameToId.get(item.name) || null, item.name, month, item.expected, item.actual, item.missing, item.incomplete],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const unmatched = names.filter((n) => !nameToId.has(n));
    try { fs.unlinkSync(req.file.path); } catch (e) { /* 忽略 */ }
    const values = [...agg.values()];
    return res.json(success({
      month,
      sheet: sheetName,
      trainers: agg.size,
      unmatched,
      expectedTotal: values.reduce((s, x) => s + x.expected, 0),
      actualTotal: values.reduce((s, x) => s + x.actual, 0),
      missingTotal: values.reduce((s, x) => s + x.missing, 0),
      incompleteTotal: values.reduce((s, x) => s + x.incomplete, 0),
    }, '月度培训台账导入成功'));
  } catch (err) { next(err); }
});

// ========== GET /ledger/personnel-summary/:employeeId/records — 培训人员当月培训明细 ==========
router.get('/ledger/personnel-summary/:employeeId/records', async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const { startDate, endDate } = computeMonthRange(req.query.month);
    const employeeId = parseInt(req.params.employeeId);
    if (!employeeId) return res.json(error(-2, '参数错误'));
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM training_records tr
        WHERE tr.is_deleted = false AND tr.trainer_id = $1
          AND tr.training_date >= $2 AND tr.training_date < $3`,
      [employeeId, startDate, endDate],
    );
    const total = countResult.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const resultList = await pool.query(
      `SELECT tr.*, sup.id AS supervisor_id, sup.name AS supervisor_name
         FROM training_records tr
         LEFT JOIN employee_assignment ea
           ON tr.employee_id = ea.employee_id AND ea.is_primary = true
          AND ea.is_current = true AND ea.is_deleted = false
         LEFT JOIN employee sup ON ea.supervisor_id = sup.id AND sup.is_deleted = false
        WHERE tr.is_deleted = false AND tr.trainer_id = $1
          AND tr.training_date >= $2 AND tr.training_date < $3
        ORDER BY tr.training_date DESC NULLS LAST, tr.id DESC
        LIMIT $4 OFFSET $5`,
      [employeeId, startDate, endDate, parseInt(pageSize), offset],
    );
    res.json(success({ list: resultList.rows.map(formatRecordRow), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== GET /ledger/plan-content-options — 培训计划内容下拉 ==========
// 用途：新增/批量弹窗的「培训内容」下拉，选中某培训计划后自动带入其内容/类型/日期
router.get('/ledger/plan-content-options', async (req, res) => {
  try {
    if (!isConnected()) {
      const list = memoryTrainingPlans.filter((r) => !r.is_deleted).map((r) => ({
        id: r.id,
        label: `${(r.title || '').trim() || (r.content || '').trim() || `计划#${r.id}`}`,
        content: r.content || '',
        trainingType: r.training_type || 'HSE',
        startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
        status: r.status || 'draft',
      }));
      return res.json(success({ list }, '查询成功(内存模式)'));
    }
    await ensureTables();
    // 计划表是否已有 month 列（结构未定，做向下兼容：有 month 列且传了月份才按月过滤）
    const month =
      req.query.month && /^\d{4}-\d{2}$/.test(String(req.query.month))
        ? String(req.query.month)
        : null;
    let hasMonth = false;
    try {
      const cc = await pool.query(
        `SELECT COUNT(*)::int AS c FROM information_schema.columns
           WHERE table_name = 'training_plans' AND column_name = 'month'`,
      );
      hasMonth = (cc.rows[0]?.c ?? 0) > 0;
    } catch { hasMonth = false; }
    const sqlParams = [];
    let whereMonth = '';
    if (hasMonth && month) {
      sqlParams.push(month);
      whereMonth = ` AND (month IS NULL OR month = $${sqlParams.length})`;
    }
    const result = await pool.query(
      `SELECT id, title, content, training_type, start_date, status
         FROM training_plans WHERE is_deleted = false${whereMonth}
        ORDER BY (start_date IS NULL) ASC, start_date DESC`,
      sqlParams,
    );
    const list = result.rows.map((r) => ({
      id: r.id,
      label: `${(r.title || '').trim() || (r.content || '').trim() || `计划#${r.id}`}`,
      content: r.content || '',
      trainingType: r.training_type || 'HSE',
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      status: r.status || 'draft',
    }));
    res.json(success({ list }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== GET /ledger/training-type-options — 培训类型动态选项 ==========
// 开放式：下拉内容取自 training_records 里已出现的培训类型，随数据增删自动变化，不硬编码。
router.get('/ledger/training-type-options', async (req, res) => {
  try {
    const list = [];
    if (isConnected()) {
      await ensureTables();
      const r = await pool.query(
        `SELECT DISTINCT trim(training_type) AS t FROM training_records
          WHERE training_type IS NOT NULL AND trim(training_type) <> ''
          ORDER BY t`,
      );
      r.rows.forEach((x) => { const v = String(x.t); if (v && !list.includes(v)) list.push(v); });
    }
    res.json(success({ list }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

/**
 * 签到表导入：按「部门」字段反查该组织下的在职应培训名单（姓名列表）。
 * 用于“未培训 = 应到 − 已签到”的差分判定（实际签到表仅列出已到场人员）。
 * @param {string} deptName 签到表「部门」字段
 * @returns {Promise<string[]|null>} 匹配到组织时返回在职姓名列表，否则 null
 */
async function resolveDeptExpectedNames(deptName) {
  const nm = cleanRowText(deptName);
  if (!nm) return null;
  try {
    const r = await pool.query(
      `SELECT DISTINCT name FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND (org_name = $1 OR org_path = $1 OR org_path LIKE $1 || '/%'
               OR org_path LIKE '%/' || $1 || '/%')
        ORDER BY name`,
      [nm],
    );
    return r.rows.map((x) => x.name);
  } catch (e) {
    return null;
  }
}

// 按「签到者姓名」反查其所在部门，再取这些部门的应到（在职）名单。
// 规则4口径：一张签到表可能覆盖多个部门（部门字段仅代表其中一页），
// 未培训 = 反查到的各部门应到 − 本表已签到。不依赖 PDF 表头「部门」字段。
async function resolveExpectedByAttendeeNames(attendeeNames) {
  const names = (attendeeNames || [])
    .map((n) => cleanRowText(n)).filter(Boolean);
  if (!names.length) return null;
  try {
    // 1) 反查签到姓名命中部门的 org_path（取签到者所在的部门/作业中心 OID）
    const org = await pool.query(
      `SELECT DISTINCT org_path FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND name = ANY($1)
          AND (org_type = 'organization' OR org_path <> '')`,
      [names],
    );
    const paths = org.rows.map((r) => r.org_path).filter(Boolean);
    if (!paths.length) return [];
    // 2) 取这些部门下（含其子部门）应到名单
    const r = await pool.query(
      `SELECT DISTINCT name FROM v_employee_org_full
        WHERE is_deleted = false AND is_current = true AND relation_status = 'active'
          AND (org_path = ANY($1)
               OR EXISTS (
                 SELECT 1 FROM unnest($1::text[]) AS p
                 WHERE v_employee_org_full.org_path LIKE p || '/%'
                    OR v_employee_org_full.org_path LIKE '%/' || p || '/%'
               ))
        ORDER BY name`,
      [paths],
    );
    return r.rows.map((x) => x.name);
  } catch (e) {
    return null;
  }
}

// 未培训：单人落定（规则3/4）。在岗→上级+班组/作业中心；查无此人→已离职（按部门反查负责人）
async function classifyUntrained(name, deptName) {
  const nm = cleanRowText(name);
  if (!nm) return null;
  const hit = await resolveRosterPerson(nm);
  if (hit.inpost && hit.employeeId) {
    return {
      name: hit.name || nm, status: 'inpost', employeeId: hit.employeeId,
      orgName: hit.orgName || '', orgType: hit.orgType || '',
      trainerId: hit.supervisorId != null ? hit.supervisorId : null,
      trainerName: hit.supervisorName || '', deptName: hit.orgName || deptName || '',
    };
  }
  const orgTrainer = await resolveOrgTrainer(deptName);
  return {
    name: nm, status: 'departed', employeeId: null,
    orgName: deptName || '', orgType: '',
    trainerId: orgTrainer ? orgTrainer.trainerId : null,
    trainerName: orgTrainer ? orgTrainer.trainerName : '',
    deptName: deptName || '', orgUnassigned: !orgTrainer,
  };
}

// 将已识别未培训去重（name + status）
function dedupeUntrained(list) {
  const seen = new Set();
  const out = [];
  for (const u of list) {
    if (!u || !u.name) continue;
    const key = `${u.name}|${u.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

// 签到表「培训日期」归一化为 YYYY-MM-DD；无法解析时回退当月 1 号
function normalizeSigninDate(raw, fallbackMonth) {
  const text = String(raw || '').trim();
  const fallback = fallbackMonth && /^\d{4}-\d{2}$/.test(fallbackMonth)
    ? `${fallbackMonth}-01` : null;
  if (!text) return fallback;
  const full = text.match(/(\d{4})[年\-/. ]*(\d{1,2})[月\-/. ]*(\d{1,2})/);
  if (full) {
    return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`;
  }
  const short = text.match(/(\d{1,2})[月\-/. ]+(\d{1,2})/);
  if (short) {
    const y = fallbackMonth ? fallbackMonth.slice(0, 4) : String(new Date().getFullYear());
    return `${y}-${String(short[1]).padStart(2, '0')}-${String(short[2]).padStart(2, '0')}`;
  }
  return fallback;
}

// 方案A：为签到表「已签到人员」批量生成实际培训记录（training_records）。
// 归属：每个已签到者取花名册上级(supervisor)作为培训人员(trainer_id)，
// 使「按培训人员月度汇总」的实际培训人数 = 该培训人员下已签到人数。
// 幂等：同 培训人员+姓名+内容+日期 的有效记录已存在则跳过，避免重复导入堆叠。
async function generateSigninRecords(names, rawHeaders, monthLabel, sessionRef) {
  if (!isConnected()) return { created: 0, attributed: 0, skipped: 0 };
  const seen = new Set();
  const cleanNames = [];
  for (const n of Array.isArray(names) ? names : []) {
    const t = cleanRowText(n);
    if (t && !seen.has(t)) { seen.add(t); cleanNames.push(t); }
  }
  if (!cleanNames.length) return { created: 0, attributed: 0, skipped: 0 };

  const headers = rawHeaders && typeof rawHeaders === 'object' ? rawHeaders : {};
  const cleanH = (k, alt, ocr) =>
    cleanRowText(headers[k] || headers[alt] || headers[ocr]).replace(/^[：:\s]+/, '');
  const content = cleanH('培训内容', '内容', 'content') || '安全培训';
  const trainingDate = normalizeSigninDate(cleanH('培训日期', '日期', 'training_date'), monthLabel);
  if (!trainingDate) return { created: 0, attributed: 0, skipped: 0 };

  // 1) 批量反查花名册归属（姓名 → 上级/培训人员），与单条 resolveRosterPerson 口径一致
  const roster = await pool.query(
    `SELECT DISTINCT ON (name) name, employee_id AS "employeeId", org_name AS "orgName",
            position_name AS "positionName", supervisor_id AS "supervisorId",
            supervisor_name AS "supervisorName"
       FROM v_employee_org_full
      WHERE name = ANY($1) AND is_deleted = false AND is_current = true
        AND relation_status = 'active'
      ORDER BY name, employee_id`,
    [cleanNames],
  );
  const byName = new Map(roster.rows.map((r) => [r.name, r]));

  const candidates = [];
  for (const nm of cleanNames) {
    const hit = byName.get(nm);
    if (!hit || hit.supervisorId == null) continue; // 查无此人/无上级 → 跳过归属
    candidates.push({
      trainerId: Number(hit.supervisorId),
      employeeId: hit.employeeId != null ? Number(hit.employeeId) : null,
      name: hit.name || nm,
      dept: hit.orgName || '',
      position: hit.positionName || '',
      trainer: hit.supervisorName || '',
    });
  }
  if (!candidates.length) return { created: 0, attributed: 0, skipped: cleanNames.length };

  // 2) 一次查询已存在的（内容+日期都相同），按 trainer_id|name 幂等去重
  const trainerIds = [...new Set(candidates.map((c) => c.trainerId))];
  const cNames = [...new Set(candidates.map((c) => c.name))];
  const exists = await pool.query(
    `SELECT DISTINCT trainer_id, name FROM training_records
      WHERE is_deleted = false AND training_date = $1 AND content = $2
        AND trainer_id = ANY($3) AND name = ANY($4)`,
    [trainingDate, content, trainerIds, cNames],
  );
  const existsKey = new Set(exists.rows.map((r) => `${r.trainer_id}|${String(r.name).trim()}`));

  let created = 0;
  for (const c of candidates) {
    const key = `${c.trainerId}|${c.name}`;
    if (existsKey.has(key)) continue; // 已存在，跳过
    await pool.query(
      `INSERT INTO training_records
         (personnel_id, name, dept, position, training_type, training_date,
          duration_minutes, content, result, score, trainer, remark, employee_id, trainer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [null, c.name, c.dept, c.position, '安全培训', trainingDate, null, content,
       '合格', null, c.trainer, `签到表导入(${monthLabel})`, c.employeeId, c.trainerId],
    );
    created++;
  }
  return { created, attributed: candidates.length, skipped: cleanNames.length - candidates.length };
}

// =====================================================================
// 签到表导入：识别校验 + 未培训登记
//   POST /ledger/signin/recognize  → 头部校验 + 花名册匹配，返回未培训预览（不落库）
//   POST /ledger/signin/confirm    → 将未培训固化到 hse_untrained_log（幂等 upsert）
//   GET  /ledger/personnel-summary/:employeeId/untrained?month= → 弹窗名单
// =====================================================================
// 规则映射（依据实际签到表：姓名列仅列出已到场人员）：
//   1) 培训日期/地点/主持人/记录人/部门/参加[人]数 任一为空 → 信息不完整
//   2) 培训内容 为空 → 培训内容未填写
//   3) 未培训 = 应到(该部门在职) − 已签到(本表姓名) 。单个姓名也可直接判定（预印版）
//   4) 在岗未培训 → 上级(培训人员) + 所属班组/作业中心
//   5) 缺少数按导入登记（hse_untrained_log）为准
router.post('/ledger/signin/recognize', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-3, '当前为内存模式，不支持签到表登记'));
    const body = req.body || {};
    const viewerMonth = computeMonthRange(body.month).monthLabel;
    const headers = (body.headers && typeof body.headers === 'object') ? body.headers : {};
    const participants = Array.isArray(body.participants) ? body.participants : [];
    const attendees = Array.isArray(body.attendees) ? body.attendees : [];
    // [DEBUG-TEMP] 定位应到0：记录收到的人数
    try { console.log('[signin-debug] body keys=', Object.keys(body).join(','), 'attendees=', attendees.length, 'participants=', participants.length); } catch(e) {}

    const cleanHeader = (k, alt, ocrKey) =>
      cleanRowText(headers[k] || headers[alt] || headers[ocrKey]).replace(/^[：:\s]+/, '');
    const h = {
      trainingDate: cleanHeader('培训日期', '日期', 'training_date'),
      location: cleanHeader('培训地点', '地点', 'location'),
      host: cleanHeader('主持人', undefined, 'host'),
      recorder: cleanHeader('记录人', undefined, 'recorder'),
      dept: cleanHeader('部门', '单位', 'dept'),
      attendee: cleanHeader('参加人数', '参加人员', 'attendee'),
      content: cleanHeader('培训内容', '内容', 'content'),
    };

    // 规则1：必填表头字段
    const headerIssues = [];
    if (!h.trainingDate) headerIssues.push('培训日期');
    if (!h.location) headerIssues.push('培训地点');
    if (!h.host) headerIssues.push('主持人');
    if (!h.recorder) headerIssues.push('记录人');
    if (!h.dept) headerIssues.push('部门');
    if (!h.attendee) headerIssues.push('参加人数');
    const infoIncomplete = headerIssues.length > 0;

    // 规则2：培训内容
    const contentMissing = !h.content;

    // 已签到集合：由 attendees（签到表姓名列）与 participants(attended=true) 构成
    const signed = new Set();
    attendees.forEach((n) => { const t = cleanRowText(n); if (t) signed.add(t); });
    participants.forEach((p) => {
      if (p.attended === true || p.attended === 'true' || p.attended === 1) {
        const t = cleanRowText(p && p.name);
        if (t) signed.add(t);
      }
    });

    const untrained = [];
    const unassigned = [];

    // 路径A（规则3·预印版签到表）：姓名在册但右侧为空 → 直接判定未培训
    for (const p of participants) {
      const isExplicitUntrained =
        (p.attended === false || p.attended === 'false' || p.attended === 0)
        && cleanRowText(p.name);
      if (!isExplicitUntrained) continue;
      const u = await classifyUntrained(p.name, h.dept);
      untrained.push(u);
      if (u && u.status === 'departed' && u.orgUnassigned) unassigned.push(u.name);
    }

    // 路径B（实际签到表）：未培训 = 反查签到者所属部门的应到(在职) − 本表已签到
    // 规则4口径：以「姓名反查花名册的部门」为准，不依赖 PDF 表头「部门」字段
    // （表头部门仅代表其中一页，PDF 多页时逐页部门不同，直接差分会取空）。
    const expectedNames = await resolveExpectedByAttendeeNames([...attendees, ...participants.map((p) => p.name)]);
    if (expectedNames && expectedNames.length > 0 && signed.size > 0) {
      for (const nm of expectedNames) {
        if (signed.has(nm)) continue;
        const u = await classifyUntrained(nm, h.dept);
        untrained.push(u);
        if (u && u.status === 'departed' && u.orgUnassigned) unassigned.push(u.name);
      }
    }

    const deduped = dedupeUntrained(untrained);
    res.json(success({
      month: viewerMonth,
      header: h,
      infoIncomplete,
      headerIssues,
      contentMissing,
      expectedCount: expectedNames ? expectedNames.length : null,
      signedCount: signed.size,
      untrained: deduped,
      unassigned,
      counts: {
        inpost: deduped.filter((u) => u.status === 'inpost').length,
        departed: deduped.filter((u) => u.status === 'departed').length,
      },
    }, infoIncomplete || contentMissing ? '签到表存在信息缺失，请核对' : '识别完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// 将识别结果中的未培训人员固化到 hse_untrained_log
router.post('/ledger/signin/confirm', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-3, '当前为内存模式，不支持登记'));
    const body = req.body || {};
    const viewerMonth = computeMonthRange(body.month).monthLabel;
    const untrained = Array.isArray(body.untrained) ? body.untrained : [];
    const sessionRef = cleanRowText(body.sessionRef || body.headers?.dept || '签到表导入');

    // 1) 未培训登记（幂等 upsert）——0 人也是合法签到完成，不报错
    let wrote = 0;
    let updated = 0;
    if (untrained.length) {
      for (const u of untrained) {
        const nm = cleanRowText(u.name);
        const status = u.status === 'departed' ? 'departed' : 'inpost';
        if (!nm) continue;
        const trainerId = u.trainerId != null ? Number(u.trainerId) : null;
        const employeeId = u.employeeId != null ? Number(u.employeeId) : null;
        const trainerName = cleanRowText(u.trainerName);
        const deptName = cleanRowText(u.deptName);
        if (trainerId == null) {
          // 无法归属到任何培训人员的，不落库，避免静默丢在汇总外
          continue;
        }
        const r = await pool.query(
          `INSERT INTO hse_untrained_log
             (trainer_id, trainer_name, month, employee_id, name, dept_name, status, record_type, session_ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (trainer_id, month, name, status)
           DO UPDATE SET employee_id = EXCLUDED.employee_id, dept_name = EXCLUDED.dept_name,
                         trainer_name = EXCLUDED.trainer_name,
                         record_type = EXCLUDED.record_type, session_ref = EXCLUDED.session_ref
           RETURNING (xmax = 0) AS inserted_new`,
          [trainerId, trainerName || null, viewerMonth, employeeId, nm,
           deptName || null, status, 'signin-import', sessionRef],
        );
        if (r.rows[0] && r.rows[0].inserted_new) wrote += 1;
        else updated += 1;
      }
    }

    // 2) 方案A：为「已签到人员」同步生成实际培训记录（training_records），幂等去重
    const attendees = Array.isArray(body.attendees) ? body.attendees : [];
    let generated = { created: 0, attributed: 0, skipped: 0 };
    try {
      generated = await generateSigninRecords(attendees, body.headers, viewerMonth, sessionRef);
    } catch (err) {
      // 生成实际培训记录失败不阻断未培训登记结果，仅透出提示
      console.error('[signin-confirm] 生成培训记录失败:', err.message);
    }

    const msg = [
      wrote + updated > 0 ? `未培训 登记 ${wrote} 条/更新 ${updated} 条` : '',
      generated.created > 0 ? `已签到记录生成培训记录 ${generated.created} 条` : '',
    ].filter(Boolean).join('；') || '本次签到未产生登记/记录（0 人出席或均已登记）';
    res.json(success({
      wrote,
      updated,
      generated,
      month: viewerMonth,
    }, msg));
  } catch (err) { res.json(error(-1, err.message)); }
});

// 未培训名单（弹窗）：某培训人员当月未培训人员列表
router.get('/ledger/personnel-summary/:employeeId/untrained', async (req, res) => {
  try {
    const monthLabel = computeMonthRange(req.query.month).monthLabel;
    const trainerId = parseInt(req.params.employeeId);
    if (!trainerId) return res.json(error(-2, '参数错误'));
    const r = await pool.query(
      `SELECT id, name, dept_name AS "deptName", status, employee_id AS "employeeId",
              trainer_name AS "trainerName",
              to_char(created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt"
         FROM hse_untrained_log
        WHERE trainer_id = $1 AND month = $2
        ORDER BY status, created_at DESC, id`,
      [trainerId, monthLabel],
    );
    res.json(success({ list: r.rows, month: monthLabel, total: r.rows.length }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== POST /ledger/personnel-summary/batch-create — 批量录入培训记录 ==========
// 对所选培训人员（trainerIds）各补录一条当月培训记录，内容/类型/日期统一带入，无需逐一填写。
router.post('/ledger/personnel-summary/batch-create', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const {
      trainerIds, name, trainingType, trainingDate,
      durationMinutes, content, score, result, trainingPlanId,
    } = req.body;
    const ids = Array.isArray(trainerIds)
      ? trainerIds.filter((v) => v != null).map(Number)
      : (trainerIds != null ? [Number(trainerIds)] : []);
    if (!ids.length) return res.json(error(-2, '请选择培训人员'));
    if (!trainingDate) return res.json(error(-2, '请填写培训日期'));
    await ensureTables();
    let created = 0;
    for (const trainerId of ids) {
      const trainerName = await resolveTrainingPersonName(trainerId);
      const finalName = (name && String(name).trim()) || trainerName || '培训登记';
      const insertResult = await pool.query(
        `INSERT INTO training_records
           (personnel_id, name, dept, position, training_type, training_date,
            duration_minutes, content, result, score, trainer, employee_id, trainer_id, training_plan_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [null, finalName, '', '', '安全培训', trainingDate,
          durationMinutes || 0, content || '', result || '合格', score || null,
          trainerName || '', null, trainerId, trainingPlanId || null],
      );
      if (insertResult.rows.length) created++;
    }
    res.json(success({ created }, created ? `批量录入成功，新增 ${created} 条` : '未新增任何培训记录'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== POST /ledger/personnel-summary/batch-delete — 批量删除培训记录 ==========
// 删除所选培训人员在指定月份（缺省当前月）的所有培训记录；单行删除即传 [employeeId]。
router.post('/ledger/personnel-summary/batch-delete', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const { trainerIds, month } = req.body;
    const ids = Array.isArray(trainerIds)
      ? trainerIds.filter((v) => v != null).map(Number)
      : (trainerIds != null ? [Number(trainerIds)] : []);
    if (!ids.length) return res.json(error(-2, '请选择培训人员'));
    await ensureTables();
    const { startDate, endDate } = computeMonthRange(month);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `UPDATE training_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
         WHERE trainer_id IN (${placeholders}) AND is_deleted = false
           AND training_date >= $${ids.length + 1} AND training_date < $${ids.length + 2}
         RETURNING id`,
      [...ids, startDate, endDate],
    );
    res.json(success({ deleted: result.rowCount || 0 }, `已删除 ${result.rowCount || 0} 条培训记录`));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ========== GET /stats — 培训统计 ==========
router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) {
      initMemoryData();
      const plans = memoryPlans.filter(r => !r.is_deleted);
      const records = memoryRecords.filter(r => !r.is_deleted);
      const passed = records.filter(r => r.result === '合格').length;
      const totalScored = records.filter(r => r.score !== null && r.score !== undefined).length;
      return res.json(success({
        totalPlans: plans.length,
        ongoing: plans.filter(p => p.status === 'ongoing').length,
        completed: plans.filter(p => p.status === 'completed').length,
        totalAttendees: records.length,
        passRate: totalScored > 0 ? Math.round((passed / totalScored) * 1000) / 10 : 0,
        byType: {},
      }, '统计成功(内存模式)'));
    }

    const [planResult, recordResult, typeResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM training_records WHERE is_deleted = false'),
      pool.query("SELECT result, COUNT(*)::int AS count FROM training_records WHERE is_deleted = false GROUP BY result"),
      pool.query("SELECT training_type, COUNT(*)::int AS count FROM training_records WHERE is_deleted = false GROUP BY training_type"),
    ]);

    const byResult = {};
    recordResult.rows.forEach(r => { byResult[r.result] = parseInt(r.count); });
    const byType = {};
    typeResult.rows.forEach(r => { byType[r.training_type] = parseInt(r.count); });

    const passed = byResult['合格'] || 0;
    const failed = byResult['不合格'] || 0;
    const totalScored = passed + failed;

    res.json(success({
      totalPlans: parseInt(planResult.rows[0].total),
      ongoing: 0,
      completed: passed,
      totalAttendees: parseInt(planResult.rows[0].total),
      passRate: totalScored > 0 ? Math.round((passed / totalScored) * 1000) / 10 : 0,
      byType,
    }, '统计成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 培训附件管理端点
// ============================================================

// ========== GET /records/:id/attachments — 附件列表 ==========
router.get('/records/:id/attachments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { version = '' } = req.query;

    if (!isConnected()) {
      initMemoryData();
      let data = memoryTrainingAttachments.filter(a => a.record_id === parseInt(id) && !a.is_deleted);
      if (version) data = data.filter(a => a.version === version);
      return res.json(success(data.map(camelKeys), '查询成功(内存模式)'));
    }

    await ensureTables();

    let sql = 'SELECT * FROM training_attachments WHERE record_id = $1 AND is_deleted = FALSE';
    const params = [id];
    let paramIdx = 1;
    if (version) {
      paramIdx++;
      sql += ` AND version = $${paramIdx}`;
      params.push(version);
    }
    sql += ' ORDER BY is_latest DESC, created_at DESC';

    const result = await pool.query(sql, params);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ========== POST /records/:id/attachments — 上传附件 ==========
router.post('/records/:id/attachments', requireRole('admin', 'safety_manager'), uploadDocument.single('file'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.json(error(-1, '请上传文件'));

    const { version = '1.0', uploaded_by = 'admin' } = req.body;
    const fileUrl = getFileUrl(req, req.file.filename, 'documents');
    const originalName = fixFilenameEncoding(req.file.originalname);

    if (!isConnected()) {
      initMemoryData();
      memoryTrainingAttachments.forEach(a => {
        if (a.record_id === parseInt(id) && a.is_latest) a.is_latest = false;
      });
      const record = buildMemoryRecord(trainingAttachmentIdCounter++, {
        record_id: parseInt(id),
        filename: req.file.filename,
        original_name: originalName,
        file_type: 'document',
        file_size: req.file.size,
        file_url: fileUrl,
        version,
        uploaded_by,
        is_latest: true,
      });
      memoryTrainingAttachments.push(record);
      // 同步记录版本履历
      memoryTrainingVersions.push(buildMemoryRecord(trainingVersionIdCounter++, {
        record_id: parseInt(id),
        version,
        change_type: 'create',
        change_summary: `上传附件 ${originalName}`,
        changed_by: uploaded_by,
      }));
      return res.json(success(camelKeys(record), '上传成功(内存模式)'));
    }

    await ensureTables();

    await pool.query(
      'UPDATE training_attachments SET is_latest = FALSE WHERE record_id = $1 AND is_latest = TRUE',
      [id]
    );

    const result = await pool.query(`
      INSERT INTO training_attachments (record_id, filename, original_name, file_type, file_size, file_url, version, uploaded_by, is_latest)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *
    `, [id, req.file.filename, originalName, 'document', req.file.size, fileUrl, version, uploaded_by]);

    // 同步记录版本履历
    await pool.query(`
      INSERT INTO training_versions (record_id, version, change_type, change_summary, changed_by)
      VALUES ($1, $2, 'create', $3, $4)
    `, [id, version, `上传附件 ${originalName}`, uploaded_by]);

    res.json(success(camelKeys(result.rows[0]), '上传成功'));
  } catch (err) {
    next(err);
  }
});

// ========== DELETE /records/:id/attachments/:aid — 删除附件 ==========
router.delete('/records/:id/attachments/:aid', requireRole('admin', 'safety_manager'), async (req, res, next) => {
  try {
    const { id, aid } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const att = memoryTrainingAttachments.find(a => a.id === parseInt(aid) && a.record_id === parseInt(id) && !a.is_deleted);
      if (!att) return sendNotFound(res, '附件不存在');
      att.is_deleted = true;
      // 记录删除履历
      memoryTrainingVersions.push(buildMemoryRecord(trainingVersionIdCounter++, {
        record_id: parseInt(id),
        version: att.version,
        change_type: 'delete',
        change_summary: `删除附件 ${att.original_name}`,
        changed_by: 'admin',
      }));
      return res.json(success(null, '删除成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'UPDATE training_attachments SET is_deleted = TRUE WHERE id = $1 AND record_id = $2 RETURNING id',
      [aid, id]
    );
    if (result.rows.length === 0) return sendNotFound(res, '附件不存在');
    res.json(success(null, '删除成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 培训版本管理端点
// ============================================================

// ========== GET /records/:id/versions — 历史版本履历 ==========
router.get('/records/:id/versions', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isConnected()) {
      initMemoryData();
      const data = memoryTrainingVersions.filter(v => v.record_id === parseInt(id));
      return res.json(success(data.map(camelKeys), '查询成功(内存模式)'));
    }

    await ensureTables();

    const result = await pool.query(
      'SELECT * FROM training_versions WHERE record_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    next(err);
  }
});

// ============================================================
// CSV 导出辅助函数
// ============================================================
function sendTrainingCsvExport(res, data) {
  const headers = ['ID', '姓名', '部门', '岗位', '培训类型', '培训日期', '时长(分钟)', '培训内容', '结果', '成绩', '培训师', '时效状态', '备注', '创建时间'];
  const rows = data.map(r => [
    r.id || '',
    (r.name || '').replace(/"/g, '""'),
    r.dept || r.department || '',
    r.position || '',
    r.training_type || r.trainingType || '',
    r.training_date ? new Date(r.training_date).toISOString().slice(0, 10) : '',
    r.duration_minutes || r.durationMinutes || 0,
    (r.content || '').replace(/"/g, '""'),
    r.result || '',
    r.score !== null && r.score !== undefined ? r.score : '',
    r.trainer || '',
    r.expiry_status || r.expiryStatus || '',
    (r.remark || '').replace(/"/g, '""'),
    r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
  ].map(v => `"${v}"`).join(','));
  const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="training_${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}

// ============================================================
// Sprint5.10: 培训要求管理端点
// ============================================================
let memoryRequirements = [];
let requirementIdCounter = 1;

router.get('/requirements', async (req, res) => {
  try {
    if (!isConnected()) {
      let data = memoryRequirements.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, positionId, keyword } = req.query;
      if (positionId) data = data.filter(r => r.position_id === parseInt(positionId));
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.position_name && r.position_name.toLowerCase().includes(kw)) || (r.training_name && r.training_name.toLowerCase().includes(kw)));
      }
      const { list, total } = paginateMemory(data, page, pageSize);
      return buildListResponse(res, list.map(camelKeys), total, page, pageSize, '查询成功(内存模式)');
    }

    await ensureTables();
    const { page = 1, pageSize = 20, positionId, keyword } = req.query;
    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;

    if (positionId) {
      paramIdx++;
      whereSql += ` AND position_id = $${paramIdx}`;
      params.push(parseInt(positionId));
    }
    if (keyword) {
      paramIdx++;
      whereSql += ` AND (position_name ILIKE $${paramIdx} OR training_name ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_requirements${whereSql}`, params);
    const total = countResult.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    params.push(parseInt(pageSize));
    paramIdx++;
    params.push(offset);

    const result = await pool.query(`SELECT * FROM training_requirements${whereSql} ORDER BY position_name, training_name LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
    res.json(success({ list: result.rows.map(camelKeys), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.get('/requirements/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      const record = memoryRequirements.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      return res.json(success(camelKeys(record), '查询成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query('SELECT * FROM training_requirements WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(camelKeys(result.rows[0]), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.post('/requirements', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      const record = buildMemoryRecord(requirementIdCounter++, {
        position_id: b.positionId || b.position_id || 0,
        position_name: b.positionName || b.position_name || '',
        training_name: b.trainingName || b.training_name || '',
        training_cycle: b.trainingCycle || b.training_cycle || '年度',
        is_required: b.isRequired !== undefined ? b.isRequired : true,
        duration_minutes: b.durationMinutes || b.duration_minutes || 60,
        remark: b.remark || '',
      });
      memoryRequirements.push(record);
      return res.json(success(camelKeys(record), '创建成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query(`
      INSERT INTO training_requirements (position_id, position_name, training_name, training_cycle, is_required, duration_minutes, remark)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.positionId || b.position_id || 0, b.positionName || b.position_name || '', b.trainingName || b.training_name || '',
       b.trainingCycle || b.training_cycle || '年度', b.isRequired !== undefined ? b.isRequired : true,
       b.durationMinutes || b.duration_minutes || 60, b.remark || '']);
    res.json(success(camelKeys(result.rows[0]), '创建成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.put('/requirements/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      const idx = memoryRequirements.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      if (b.positionId !== undefined) memoryRequirements[idx].position_id = b.positionId;
      if (b.positionName !== undefined) memoryRequirements[idx].position_name = b.positionName;
      if (b.trainingName !== undefined) memoryRequirements[idx].training_name = b.trainingName;
      if (b.trainingCycle !== undefined) memoryRequirements[idx].training_cycle = b.trainingCycle;
      if (b.isRequired !== undefined) memoryRequirements[idx].is_required = b.isRequired;
      if (b.durationMinutes !== undefined) memoryRequirements[idx].duration_minutes = b.durationMinutes;
      if (b.remark !== undefined) memoryRequirements[idx].remark = b.remark;
      memoryRequirements[idx].updated_at = new Date().toISOString();
      return res.json(success(camelKeys(memoryRequirements[idx]), '更新成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query(`
      UPDATE training_requirements SET
        position_id = COALESCE($1, position_id),
        position_name = COALESCE($2, position_name),
        training_name = COALESCE($3, training_name),
        training_cycle = COALESCE($4, training_cycle),
        is_required = COALESCE($5, is_required),
        duration_minutes = COALESCE($6, duration_minutes),
        remark = COALESCE($7, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND is_deleted = false RETURNING *`,
      [b.positionId, b.positionName, b.trainingName, b.trainingCycle, b.isRequired, b.durationMinutes, b.remark, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(camelKeys(result.rows[0]), '更新成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.delete('/requirements/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) {
      const idx = memoryRequirements.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      memoryRequirements[idx].is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query('UPDATE training_requirements SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.10: 培训计划管理端点（独立表）
// ============================================================
let memoryTrainingPlans = [];
let planIdCounter2 = 1000;

router.get('/plans', async (req, res) => {
  try {
    if (!isConnected()) {
      let data = memoryTrainingPlans.filter(r => !r.is_deleted);
      const { page = 1, pageSize = 20, keyword, planType, status } = req.query;
      if (keyword) {
        const kw = keyword.toLowerCase();
        data = data.filter(r => (r.title && r.title.toLowerCase().includes(kw)) || (r.trainer_name && r.trainer_name.toLowerCase().includes(kw)));
      }
      if (planType) data = data.filter(r => r.plan_type === planType);
      if (status) data = data.filter(r => r.status === status);
      const { list, total } = paginateMemory(data, page, pageSize);
      return buildListResponse(res, list.map(camelKeys), total, page, pageSize, '查询成功(内存模式)');
    }

    await ensureTables();
    const { page = 1, pageSize = 20, keyword, planType, status } = req.query;
    let whereSql = ' WHERE is_deleted = false';
    const params = [];
    let paramIdx = 0;

    if (keyword) {
      paramIdx++;
      whereSql += ` AND (title ILIKE $${paramIdx} OR trainer_name ILIKE $${paramIdx} OR target_audience ILIKE $${paramIdx} OR content ILIKE $${paramIdx} OR responsible_dept ILIKE $${paramIdx} OR training_time ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
    }
    if (planType) {
      paramIdx++;
      whereSql += ` AND plan_type = $${paramIdx}`;
      params.push(planType);
    }
    if (status) {
      paramIdx++;
      whereSql += ` AND status = $${paramIdx}`;
      params.push(status);
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM training_plans${whereSql}`, params);
    const total = countResult.rows[0].total;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    params.push(parseInt(pageSize));
    paramIdx++;
    params.push(offset);

    // 对齐《安全培训教育实施计划表》：按序号（plan_no 数字）升序，无序号的排最后
    const orderSql = ` ORDER BY (CASE WHEN plan_no ~ '^[0-9]+$' THEN plan_no::int ELSE 2147483647 END) ASC, start_date ASC, id ASC`;
    const result = await pool.query(`SELECT * FROM training_plans${whereSql}${orderSql} LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`, params);
    res.json(success({ list: result.rows.map(camelKeys), total, page: parseInt(page), pageSize: parseInt(pageSize) }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.get('/plans/:id', async (req, res) => {
  try {
    if (!isConnected()) {
      const record = memoryTrainingPlans.find(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (!record) return res.json(error(-2, '记录不存在'));
      return res.json(success(camelKeys(record), '查询成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query('SELECT * FROM training_plans WHERE id = $1 AND is_deleted = false', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(camelKeys(result.rows[0]), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.post('/plans', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      const record = buildMemoryRecord(planIdCounter2++, {
        title: b.title || '',
        plan_type: b.planType || b.plan_type || 'annual',
        training_type: b.trainingType || b.training_type || 'HSE',
        target_audience: b.targetAudience || '',
        trainer_name: b.trainerName || '',
        trainer_id: b.trainerId || null,
        planned_attendees: b.plannedAttendees || 0,
        actual_attendees: b.actualAttendees || 0,
        start_date: b.startDate || new Date().toISOString().slice(0, 10),
        end_date: b.endDate || new Date().toISOString().slice(0, 10),
        location: b.location || '',
        duration_hours: b.durationHours || 4,
        content: b.content || '',
        exam_required: b.examRequired || false,
        pass_score: b.passScore || 60,
        status: b.status || 'draft',
        remark: b.remark || '',
        training_time: b.trainingTime || '',
        responsible_dept: b.responsibleDept || '',
      });
      memoryTrainingPlans.push(record);
      return res.json(success(camelKeys(record), '创建成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query(`
      INSERT INTO training_plans (title, plan_type, training_type, target_audience, trainer_name, trainer_id, planned_attendees, actual_attendees, start_date, end_date, location, duration_hours, content, exam_required, pass_score, status, remark, training_time, responsible_dept)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [b.title || '', b.planType || b.plan_type || 'annual', b.trainingType || b.training_type || 'HSE',
       b.targetAudience || '', b.trainerName || '', b.trainerId || null, b.plannedAttendees || 0, b.actualAttendees || 0,
       b.startDate || new Date().toISOString().slice(0, 10), b.endDate || new Date().toISOString().slice(0, 10),
       b.location || '', b.durationHours || 4, b.content || '', b.examRequired || false, b.passScore || 60,
       b.status || 'draft', b.remark || '', b.trainingTime || '', b.responsibleDept || '']);
    res.json(success(camelKeys(result.rows[0]), '创建成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.put('/plans/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const b = req.body;
    if (!isConnected()) {
      const idx = memoryTrainingPlans.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      if (b.title !== undefined) memoryTrainingPlans[idx].title = b.title;
      if (b.planType !== undefined) memoryTrainingPlans[idx].plan_type = b.planType;
      if (b.trainingType !== undefined) memoryTrainingPlans[idx].training_type = b.trainingType;
      if (b.targetAudience !== undefined) memoryTrainingPlans[idx].target_audience = b.targetAudience;
      if (b.trainerName !== undefined) memoryTrainingPlans[idx].trainer_name = b.trainerName;
      if (b.trainerId !== undefined) memoryTrainingPlans[idx].trainer_id = b.trainerId;
      if (b.plannedAttendees !== undefined) memoryTrainingPlans[idx].planned_attendees = b.plannedAttendees;
      if (b.actualAttendees !== undefined) memoryTrainingPlans[idx].actual_attendees = b.actualAttendees;
      if (b.startDate !== undefined) memoryTrainingPlans[idx].start_date = b.startDate;
      if (b.endDate !== undefined) memoryTrainingPlans[idx].end_date = b.endDate;
      if (b.location !== undefined) memoryTrainingPlans[idx].location = b.location;
      if (b.durationHours !== undefined) memoryTrainingPlans[idx].duration_hours = b.durationHours;
      if (b.content !== undefined) memoryTrainingPlans[idx].content = b.content;
      if (b.examRequired !== undefined) memoryTrainingPlans[idx].exam_required = b.examRequired;
      if (b.passScore !== undefined) memoryTrainingPlans[idx].pass_score = b.passScore;
      if (b.status !== undefined) memoryTrainingPlans[idx].status = b.status;
      if (b.remark !== undefined) memoryTrainingPlans[idx].remark = b.remark;
      if (b.trainingTime !== undefined) memoryTrainingPlans[idx].training_time = b.trainingTime;
      if (b.responsibleDept !== undefined) memoryTrainingPlans[idx].responsible_dept = b.responsibleDept;
      memoryTrainingPlans[idx].updated_at = new Date().toISOString();
      return res.json(success(camelKeys(memoryTrainingPlans[idx]), '更新成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query(`
      UPDATE training_plans SET
        title = COALESCE($1, title),
        plan_type = COALESCE($2, plan_type),
        training_type = COALESCE($3, training_type),
        target_audience = COALESCE($4, target_audience),
        trainer_name = COALESCE($5, trainer_name),
        trainer_id = COALESCE($6, trainer_id),
        planned_attendees = COALESCE($7, planned_attendees),
        actual_attendees = COALESCE($8, actual_attendees),
        start_date = COALESCE($9, start_date),
        end_date = COALESCE($10, end_date),
        location = COALESCE($11, location),
        duration_hours = COALESCE($12, duration_hours),
        content = COALESCE($13, content),
        exam_required = COALESCE($14, exam_required),
        pass_score = COALESCE($15, pass_score),
        status = COALESCE($16, status),
        remark = COALESCE($17, remark),
        training_time = COALESCE($18, training_time),
        responsible_dept = COALESCE($19, responsible_dept),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $20 AND is_deleted = false RETURNING *`,
      [b.title, b.planType, b.trainingType, b.targetAudience, b.trainerName, b.trainerId,
       b.plannedAttendees, b.actualAttendees, b.startDate, b.endDate, b.location, b.durationHours,
       b.content, b.examRequired, b.passScore, b.status, b.remark,
       b.trainingTime !== undefined ? b.trainingTime : null,
       b.responsibleDept !== undefined ? b.responsibleDept : null,
       req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(camelKeys(result.rows[0]), '更新成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

router.delete('/plans/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) {
      const idx = memoryTrainingPlans.findIndex(r => r.id === parseInt(req.params.id) && !r.is_deleted);
      if (idx === -1) return res.json(error(-2, '记录不存在'));
      memoryTrainingPlans[idx].is_deleted = true;
      return res.json(success(null, '删除成功(内存模式)'));
    }

    await ensureTables();
    const result = await pool.query('UPDATE training_plans SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '记录不存在'));
    res.json(success(null, '删除成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.10: 培训统计增强端点
// ============================================================
router.get('/stats/enhanced', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        byPosition: {},
        byEmployee: {},
        overdueEmployees: [],
        positionCompletionRate: {},
        employeeCompletionRate: {},
      }, '统计成功(内存模式)'));
    }

    await ensureTables();

    const [positionResult, employeeResult] = await Promise.all([
      pool.query(`
        SELECT r.position_name, COUNT(*) as required_count,
               COUNT(t.employee_id) as completed_count
        FROM training_requirements r
        LEFT JOIN training_records t ON t.position = r.position_name AND t.result = '合格'
        WHERE r.is_deleted = false AND t.is_deleted = false
        GROUP BY r.position_name
      `),
      pool.query(`
        SELECT ev.name, ev.position_name, ev.employee_code,
               COUNT(t.employee_id) as training_count
        FROM v_employee_current ev
        LEFT JOIN training_records t ON t.employee_id = ev.employee_id AND t.result = '合格'
        WHERE ev.assignment_status = 'active' AND (t.is_deleted = false OR t.id IS NULL)
        GROUP BY ev.name, ev.position_name, ev.employee_code
      `),
    ]);

    const byPosition = {};
    const positionCompletionRate = {};
    positionResult.rows.forEach(row => {
      const required = parseInt(row.required_count) || 0;
      const completed = parseInt(row.completed_count) || 0;
      byPosition[row.position_name] = { required, completed };
      positionCompletionRate[row.position_name] = required > 0 ? Math.round((completed / required) * 1000) / 10 : 0;
    });

    const byEmployee = {};
    const employeeCompletionRate = {};
    employeeResult.rows.forEach(row => {
      const key = `${row.name}(${row.employee_code})`;
      byEmployee[key] = parseInt(row.training_count) || 0;
      employeeCompletionRate[key] = {};
    });

    const overdueResult = await pool.query(`
      SELECT ev.name, ev.employee_code, ev.position_name, ev.org_name,
             t.training_date, t.training_type, t.expiry_status
      FROM v_employee_current ev
      JOIN training_records t ON t.employee_id = ev.employee_id
      WHERE ev.assignment_status = 'active' AND t.is_deleted = false AND t.expiry_status = 'expired'
      ORDER BY t.training_date DESC
    `);

    const overdueEmployees = overdueResult.rows.map(row => camelKeys({
      name: row.name,
      employeeCode: row.employee_code,
      positionName: row.position_name,
      orgName: row.org_name,
      trainingDate: row.training_date ? new Date(row.training_date).toISOString().slice(0, 10) : '',
      trainingType: row.training_type,
      expiryStatus: row.expiry_status,
    }));

    res.json(success({
      byPosition,
      byEmployee,
      overdueEmployees,
      positionCompletionRate,
      employeeCompletionRate,
    }, '统计成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.11: 从培训计划生成培训记录
// 接收: { planId, employeeIds: [], trainingDate, result, score, remark }
// 为每个 employeeId 创建一条 training_records 记录，关联 training_plan_id
// ============================================================
router.post('/plans/:id/execute', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { employeeIds = [], trainingDate, result = '合格', score = null, remark = '', trainerId = null } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.json(error(-1, '请选择至少一名参训员工'));
    }

    if (!isConnected()) {
      initMemoryData();
      // 内存模式：先查询计划
      const plan = memoryTrainingPlans.find(p => p.id === planId && !p.is_deleted);
      if (!plan) return res.json(error(-2, '培训计划不存在'));
      const created = [];
      for (const empId of employeeIds) {
        const record = buildMemoryRecord(recordIdCounter++, {
          employee_id: empId,
          trainer_id: trainerId || plan.trainer_id || null,
          training_plan_id: planId,
          training_type: plan.training_type || 'HSE',
          training_date: trainingDate || new Date().toISOString().slice(0, 10),
          duration_minutes: Math.round((plan.duration_hours || 4) * 60),
          content: plan.content || plan.title || '',
          result,
          score,
          trainer: plan.trainer_name || '',
          remark,
        });
        memoryRecords.push(record);
        created.push(formatRecordRow(record));
      }
      // 更新计划实际人数
      plan.actual_attendees = (plan.actual_attendees || 0) + created.length;
      return res.json(success({ created, count: created.length }, `成功生成${created.length}条培训记录(内存模式)`));
    }

    await ensureTables();

    // 查询培训计划
    const planResult = await pool.query('SELECT * FROM training_plans WHERE id = $1 AND is_deleted = false', [planId]);
    if (planResult.rows.length === 0) return res.json(error(-2, '培训计划不存在'));
    const plan = planResult.rows[0];

    // 批量查询员工信息（使用 v_employee_current 视图，如不存在则降级到 hse_employees）
    let employeeRows = [];
    try {
      const empResult = await pool.query(
        'SELECT employee_id, name, position_name, org_name FROM v_employee_current WHERE employee_id = ANY($1::bigint[]) AND assignment_status = \'active\'',
        [employeeIds]
      );
      employeeRows = empResult.rows;
    } catch (e) {
      // 降级：直接用传入的 employee_id，无姓名信息
      employeeRows = employeeIds.map(id => ({ employee_id: id, name: '', position_name: '', org_name: '' }));
    }

    const empMap = new Map(employeeRows.map(r => [r.employee_id, r]));
    const created = [];
    const effectiveDate = trainingDate || new Date().toISOString().slice(0, 10);
    const durationMinutes = Math.round((parseFloat(plan.duration_hours) || 4) * 60);

    for (const empId of employeeIds) {
      const emp = empMap.get(parseInt(empId)) || empMap.get(empId) || { name: '', position_name: '', org_name: '' };
      const insertResult = await pool.query(`
        INSERT INTO training_records (employee_id, trainer_id, training_plan_id, name, dept, position, training_type, training_date, duration_minutes, content, result, score, trainer, remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [empId, trainerId || plan.trainer_id || null, planId, emp.name || '', emp.org_name || '', emp.position_name || '',
         plan.training_type || 'HSE', effectiveDate, durationMinutes, plan.content || plan.title || '',
         result, score, plan.trainer_name || '', remark]);
      created.push(formatRecordRow(insertResult.rows[0]));

      // 月度自动考核：培训结果不合格 → 本人扣分
      if (result === '不合格') {
        assessmentEvent.publish(assessmentEvent.EVENT_TYPES.TRAINING_FAILED, {
          trainingId: insertResult.rows[0].id,
          employeeId: empId,
          content: plan.content || plan.title || '',
          trainingDate: effectiveDate,
        });
      }
    }

    // 更新培训计划实际参训人数
    await pool.query('UPDATE training_plans SET actual_attendees = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [(plan.actual_attendees || 0) + created.length, planId]);

    res.json(success({ created, count: created.length }, `成功生成${created.length}条培训记录`));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.11: 培训到期检查
// 输出: 即将到期人员（30天内）、已逾期人员
// 注: 接口能力已完成，定时调度 Sprint6 实现
// ============================================================
router.get('/reminders/expiry', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysAhead = parseInt(days);

    if (!isConnected()) {
      return res.json(success({
        expiring: [],
        expired: [],
        note: '内存模式无员工数据',
      }, '查询成功(内存模式)'));
    }

    await ensureTables();

    // 基于员工最新培训记录计算时效
    // 规则: training_date + 12个月 = 到期日
    // - expired: 当前日期 > 到期日
    // - expiring: 距到期日 ≤ daysAhead 天
    const result = await pool.query(`
      WITH latest_training AS (
        SELECT DISTINCT ON (ev.employee_id)
          ev.employee_id,
          ev.name,
          ev.employee_code,
          ev.position_name,
          ev.org_name,
          ev.is_driver,
          t.training_date,
          t.training_type,
          t.result,
          CASE
            WHEN t.training_date IS NULL THEN NULL
            ELSE (t.training_date::timestamp + INTERVAL '12 months')::date
          END AS expiry_date,
          CASE
            WHEN t.training_date IS NULL THEN 'missing'
            WHEN (t.training_date::timestamp + INTERVAL '12 months')::date < CURRENT_DATE THEN 'expired'
            WHEN (t.training_date::timestamp + INTERVAL '12 months')::date <= CURRENT_DATE + ($1 || ' days')::interval THEN 'expiring'
            ELSE 'normal'
          END AS expiry_status
        FROM v_employee_current ev
        LEFT JOIN training_records t ON t.employee_id = ev.employee_id AND t.is_deleted = false AND t.result = '合格'
        WHERE ev.assignment_status = 'active'
        ORDER BY ev.employee_id, t.training_date DESC NULLS LAST
      )
      SELECT * FROM latest_training
      WHERE expiry_status IN ('expired', 'expiring', 'missing')
      ORDER BY expiry_status, expiry_date NULLS LAST
    `, [String(daysAhead)]);

    const expiring = [];
    const expired = [];
    const missing = [];

    result.rows.forEach(row => {
      const item = {
        employeeId: row.employee_id,
        name: row.name,
        employeeCode: row.employee_code,
        positionName: row.position_name,
        orgName: row.org_name,
        isDriver: row.is_driver,
        trainingDate: row.training_date ? new Date(row.training_date).toISOString().slice(0, 10) : '',
        expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 10) : '',
        trainingType: row.training_type,
        expiryStatus: row.expiry_status,
      };
      if (row.expiry_status === 'expiring') expiring.push(item);
      else if (row.expiry_status === 'expired') expired.push(item);
      else if (row.expiry_status === 'missing') missing.push(item);
    });

    res.json(success({
      expiring,
      expired,
      missing,
      summary: {
        expiringCount: expiring.length,
        expiredCount: expired.length,
        missingCount: missing.length,
        total: expiring.length + expired.length + missing.length,
      },
      note: '接口能力已完成，定时调度 Sprint6 实现',
    }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.11: 新员工培训自动识别
// 规则: 入职日期 + 新员工培训要求 → 识别未完成人员
// ============================================================
router.get('/reminders/new-employee', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        incomplete: [],
        summary: { totalCount: 0, incompleteCount: 0 },
      }, '查询成功(内存模式)'));
    }

    await ensureTables();

    // 1. 查询新员工培训要求（基于培训名称包含"新员工"或 plan_type='new_employee'）
    const requirementsResult = await pool.query(`
      SELECT id, position_id, position_name, training_name, duration_minutes
      FROM training_requirements
      WHERE is_deleted = false AND (training_name ILIKE '%新员工%' OR training_name ILIKE '%入职%')
    `);

    // 2. 查询所有新员工（入职日期在近90天内且 assignment_status='active'）
    // 使用 v_employee_current 视图，如果不存在则降级
    let newEmployees = [];
    try {
      const empResult = await pool.query(`
        SELECT ev.employee_id, ev.name, ev.employee_code, ev.position_name, ev.org_name,
               ev.start_date AS hire_date, ev.assignment_status
        FROM v_employee_current ev
        WHERE ev.assignment_status = 'active'
          AND ev.start_date IS NOT NULL
          AND ev.start_date >= CURRENT_DATE - INTERVAL '90 days'
        ORDER BY ev.start_date DESC
      `);
      newEmployees = empResult.rows;
    } catch (e) {
      // 降级: 无视图时返回空
      newEmployees = [];
    }

    // 3. 对每个新员工，检查是否有对应的培训记录
    const incomplete = [];
    for (const emp of newEmployees) {
      // 查询该员工是否有"新员工"类型的培训记录
      const recordResult = await pool.query(`
        SELECT id, training_type, result, training_date
        FROM training_records
        WHERE employee_id = $1 AND is_deleted = false
          AND (training_type ILIKE '%新员工%' OR training_type = '新员工')
        ORDER BY training_date DESC LIMIT 1
      `, [emp.employee_id]);

      if (recordResult.rows.length === 0 || recordResult.rows[0].result !== '合格') {
        incomplete.push({
          employeeId: emp.employee_id,
          name: emp.name,
          employeeCode: emp.employee_code,
          positionName: emp.position_name,
          orgName: emp.org_name,
          hireDate: emp.hire_date ? new Date(emp.hire_date).toISOString().slice(0, 10) : '',
          daysSinceHire: emp.hire_date
            ? Math.floor((new Date() - new Date(emp.hire_date)) / (1000 * 60 * 60 * 24))
            : 0,
          lastTrainingDate: recordResult.rows.length > 0 && recordResult.rows[0].training_date
            ? new Date(recordResult.rows[0].training_date).toISOString().slice(0, 10)
            : '',
          lastTrainingResult: recordResult.rows.length > 0 ? recordResult.rows[0].result : '',
          status: recordResult.rows.length === 0 ? '未培训' : '未合格',
        });
      }
    }

    res.json(success({
      incomplete,
      requirements: requirementsResult.rows.map(camelKeys),
      summary: {
        totalCount: newEmployees.length,
        incompleteCount: incomplete.length,
        completedCount: newEmployees.length - incomplete.length,
      },
    }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.11: 培训分析增强
// 高风险岗位培训完成率 / 驾驶员培训完成率 / 新员工培训完成率
// ============================================================
router.get('/analysis/enhanced', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({
        highRiskPosition: { total: 0, completed: 0, rate: 0 },
        driver: { total: 0, completed: 0, rate: 0 },
        newEmployee: { total: 0, completed: 0, rate: 0 },
      }, '查询成功(内存模式)'));
    }

    await ensureTables();

    // 高风险岗位定义: 岗位名称包含以下关键词
    const highRiskKeywords = ['司机', '电工', '焊工', '锅炉', '起重', '叉车', '特种', '危化'];
    // 构建SQL LIKE 条件
    const highRiskCondition = highRiskKeywords.map((_, i) => `position_name ILIKE $${i + 1}`).join(' OR ');
    const highRiskParams = highRiskKeywords.map(k => `%${k}%`);

    // 1. 高风险岗位培训完成率
    // 规则: 高风险岗位员工中，有合格培训记录的比例
    let highRiskPosition = { total: 0, completed: 0, rate: 0 };
    try {
      const hrResult = await pool.query(`
        WITH hr_employees AS (
          SELECT DISTINCT employee_id, name, position_name
          FROM v_employee_current
          WHERE assignment_status = 'active' AND (${highRiskCondition})
        ),
        hr_trained AS (
          SELECT DISTINCT h.employee_id
          FROM hr_employees h
          JOIN training_records t ON t.employee_id = h.employee_id
            AND t.is_deleted = false AND t.result = '合格'
        )
        SELECT
          (SELECT COUNT(*) FROM hr_employees)::int AS total,
          (SELECT COUNT(*) FROM hr_trained)::int AS completed
      `, highRiskParams);
      if (hrResult.rows.length > 0) {
        const total = parseInt(hrResult.rows[0].total) || 0;
        const completed = parseInt(hrResult.rows[0].completed) || 0;
        highRiskPosition = { total, completed, rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0 };
      }
    } catch (e) { /* 视图不存在时降级 */ }

    // 2. 驾驶员培训完成率
    let driver = { total: 0, completed: 0, rate: 0 };
    try {
      const driverResult = await pool.query(`
        WITH driver_employees AS (
          SELECT DISTINCT employee_id, name
          FROM v_employee_current
          WHERE assignment_status = 'active' AND is_driver = true
        ),
        driver_trained AS (
          SELECT DISTINCT d.employee_id
          FROM driver_employees d
          JOIN training_records t ON t.employee_id = d.employee_id
            AND t.is_deleted = false AND t.result = '合格'
            AND (t.training_type ILIKE '%驾驶员%' OR t.training_type ILIKE '%驾驶%')
        )
        SELECT
          (SELECT COUNT(*) FROM driver_employees)::int AS total,
          (SELECT COUNT(*) FROM driver_trained)::int AS completed
      `);
      if (driverResult.rows.length > 0) {
        const total = parseInt(driverResult.rows[0].total) || 0;
        const completed = parseInt(driverResult.rows[0].completed) || 0;
        driver = { total, completed, rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0 };
      }
    } catch (e) { /* 降级 */ }

    // 3. 新员工培训完成率（入职90天内的新员工）
    let newEmployee = { total: 0, completed: 0, rate: 0 };
    try {
      const newEmpResult = await pool.query(`
        WITH new_employees AS (
          SELECT DISTINCT employee_id, name, start_date AS hire_date
          FROM v_employee_current
          WHERE assignment_status = 'active'
            AND start_date IS NOT NULL
            AND start_date >= CURRENT_DATE - INTERVAL '90 days'
        ),
        new_trained AS (
          SELECT DISTINCT n.employee_id
          FROM new_employees n
          JOIN training_records t ON t.employee_id = n.employee_id
            AND t.is_deleted = false AND t.result = '合格'
            AND (t.training_type ILIKE '%新员工%' OR t.training_type = '新员工')
        )
        SELECT
          (SELECT COUNT(*) FROM new_employees)::int AS total,
          (SELECT COUNT(*) FROM new_trained)::int AS completed
      `);
      if (newEmpResult.rows.length > 0) {
        const total = parseInt(newEmpResult.rows[0].total) || 0;
        const completed = parseInt(newEmpResult.rows[0].completed) || 0;
        newEmployee = { total, completed, rate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0 };
      }
    } catch (e) { /* 降级 */ }

    res.json(success({
      highRiskPosition,
      driver,
      newEmployee,
      summary: {
        overallRate: (highRiskPosition.total + driver.total + newEmployee.total) > 0
          ? Math.round(
              ((highRiskPosition.completed + driver.completed + newEmployee.completed) /
               (highRiskPosition.total + driver.total + newEmployee.total)) * 1000
            ) / 10
          : 0,
      },
    }, '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

module.exports = router;
// 供 training-ocr 等路由复用「同口径」人员落键（挂在 router 对象上，不改变路由导出契约）
module.exports.resolveTrainingPersonId = resolveTrainingPersonId;
module.exports.resolveTrainingPersonName = resolveTrainingPersonName;
