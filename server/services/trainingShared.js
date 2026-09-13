/**
 * 培训模块（/api/training）—— 共享收敛（业务/装维统一入口）
 * 三层化拆分后，跨服务公共片段统一收拢于此：
 *   - 人员落键（resolveTrainingPersonId / resolveTrainingPersonName / resolveTrainerEmployeeId 等）
 *   - 日期清洗（formatDateYMD / normalizeSigninDate 挂 register）与业务月（computeMonthRange）
 *   - 脱敏（maskIdCard）/ 时效状态（calcExpiryStatus）/ 记录格式化（formatRecordRow）
 *   - 内存降级态（memoryPlans / memoryRecords / memoryTrainingAttachments / memoryTrainingVersions
 *     / memoryRequirements / memoryTrainingPlans 及其计数器、initMemoryData）
 *   - 表初始化 ensureTables
 *   - CSV 导出组装 buildTrainingCsvExport（只返回描述对象，写 res 由 controller 负责）
 *   - 子路由工厂 createTrainingSubRoute（router 以参数传入，由 route 层复用挂载）
 *
 * 服务层不依赖 express（仅 router 参数化传入的 attach 实例用于工厂挂载）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require('xlsx');
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const {
  paginateMemory, buildListResponse, sendNotFound, buildMemoryRecord, camelKeys,
} = require('../utils/commonResponse');
const { hashSensitive } = require('../utils/encryption');

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
let memoryRequirements = [];
let memoryTrainingPlans = [];
let planIdCounter = 1;
let recordIdCounter = 1;
let trainingAttachmentIdCounter = 1;
let trainingVersionIdCounter = 1;
let requirementIdCounter = 1;
let planIdCounter2 = 1000;

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

// ============================================================
// CSV 导出组装（只返回描述对象，写 res 由 controller 负责；字节与原 sendTrainingCsvExport 逐字一致）
// ============================================================
function buildTrainingCsvExport(data) {
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
  const contentDisposition = `attachment; filename="training_${new Date().toISOString().slice(0, 10)}.csv"`;
  return { contentType: 'text/csv; charset=utf-8', contentDisposition, csv };
}

// ============================================================
// 子路由: 培训台账 / 新员工 / 驾驶员 / 太行
// 由 route 层以 router 参数复用挂载（工厂逻辑原样保留：内存态 + DB 双模式）
// ============================================================
function createTrainingSubRoute(router, routePath, trainingType, storeKey) {
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

module.exports = {
  pool,
  isConnected,
  hashSensitive,
  resolveEmployeeId,
  resolveTrainingPersonId,
  resolveTrainingPersonName,
  resolveTrainerEmployeeId,
  cleanRowText,
  SIGNIN_REQUIRED_HEADERS,
  computeMonthRange,
  ensureTables,
  calcExpiryStatus,
  initMemoryData,
  maskIdCard,
  formatDateYMD,
  formatRecordRow,
  buildTrainingCsvExport,
  createTrainingSubRoute,
  buildMemoryRecord,
  camelKeys,
  paginateMemory,
  buildListResponse,
  sendNotFound,
  // 内存态（原样保留，供测试/工厂/降级复用）
  memoryPlans,
  memoryRecords,
  memoryTrainingAttachments,
  memoryTrainingVersions,
  memoryRequirements,
  memoryTrainingPlans,
  planIdCounter,
  recordIdCounter,
  trainingAttachmentIdCounter,
  trainingVersionIdCounter,
  requirementIdCounter,
  planIdCounter2,
};