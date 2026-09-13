/**
 * 三违记录（/api/violations）—— service 层
 * 原 routes/violations.js 的业务逻辑全部下沉至此：
 *   - DB 表初始化 / 索引 / 动态加列
 *   - Sprint D Step 10 违规人身份解析（id_card hash → employee，name 降级）
 *   - 阶段2 权威姓名同步（v_employee_org_full 优先，employee 兜底）
 *   - 内存降级存储、list 复杂排序（有图优先 + 日期）
 *   - CSV 导出（memory 24 列 / DB 20 列两套，与原文逐字节一致）
 *   - 月度自动考核事件（assessmentEvent）与 hse_event 同步、审计日志
 *
 * 契约：每个对外函数返回统一描述符
 *   - 成功 JSON：{ __t:'json', payload, message }（等价原 res.json(success(...))）
 *   - 业务错误：{ __t:'json', error:{code,message} }（等价原 res.json(error(code,msg))）
 *     code 语义沿用原值：-2 记录不存在/状态不可操作；-1 校验/通用失败。
 *   - CSV：{ __t:'csv', csv }（等价原 export/csv 的 res 写逻辑）
 *
 * 异常约定：本域所有端点 catch 均为 `res.json(error(-1, '操作失败，请稍后重试'))`
 * 固定文案（非 err.message）。故业务函数遇 DB 异常应抛错，由 controller 的 run()
 * 归一为该固定描述符；业务内的「预期分支」（记录不存在 / 状态不允许 / 参数缺失）
 * 均返回描述符（不抛错），保持 HTTP 200 原语义。
 */

const { pool, isConnected } = require('../config/db');
const { camelKeys, buildListResponse } = require('../utils/commonResponse');
const { auditLog } = require('../routes/audit');
const hseEventSync = require('../services/hseEventSyncService');
const assessmentEvent = require('../services/assessmentEventService'); // 月度自动考核事件
const { hashSensitive } = require('../utils/encryption');

const ok = (payload, message) => ({ __t: 'json', payload, message });
const err = (code, message) => ({ __t: 'json', error: { code, message } });

/**
 * Sprint D Step 10: 通过 violator_id_card 或 violator_name 自动解析 violator_id
 * 优先级: 1) 调用方已传入 violator_id  2) id_card hash 查 employee.id_card_hash
 *          3) violator_name 查 employee.name（仅当唯一匹配时）
 */
async function resolveViolatorId(violatorName, violatorIdCard, existingViolatorId) {
  if (existingViolatorId) return existingViolatorId;
  // 优先用 id_card hash 匹配
  if (violatorIdCard && typeof violatorIdCard === 'string' && violatorIdCard.trim() !== '') {
    const hash = hashSensitive(violatorIdCard.trim());
    if (hash) {
      try {
        const r = await pool.query(
          'SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false LIMIT 1',
          [hash]
        );
        if (r.rows.length > 0) return r.rows[0].id;
        console.warn(`[violations] violator_id_card hash 未匹配到 employee: ${violatorIdCard.substring(0, 6)}****`);
      } catch (e) {
        console.error('[violations] resolveViolatorId (id_card) 查询失败:', e.message);
      }
    }
  }
  // 降级: 用姓名匹配（仅当唯一匹配时）
  if (violatorName && violatorName.trim() !== '') {
    try {
      const r = await pool.query(
        'SELECT id FROM employee WHERE name = $1 AND is_deleted = false',
        [violatorName.trim()]
      );
      if (r.rows.length === 1) {
        console.log(`[violations] violator_name "${violatorName}" 唯一匹配到 employee.id=${r.rows[0].id}`);
        return r.rows[0].id;
      }
      if (r.rows.length > 1) {
        console.warn(`[violations] violator_name "${violatorName}" 匹配到 ${r.rows.length} 条 employee，跳过（重名风险）`);
      }
    } catch (e) {
      console.error('[violations] resolveViolatorId (name) 查询失败:', e.message);
    }
  }
  return null;
}

/**
 * 阶段2：通过 employee.id 取权威姓名（v_employee_org_full 优先，employee 兜底）。
 * 录入端传入 violator_id 时，以员工主数据为准同步 violator_name，避免自由文本错名。
 */
async function resolveViolatorName(employeeId) {
  if (!employeeId) return null;
  try {
    const r = await pool.query(
      `SELECT name FROM v_employee_org_full WHERE employee_id = $1 AND is_deleted = false AND is_current = true LIMIT 1`,
      [employeeId]
    );
    if (r.rows.length > 0) return r.rows[0].name;
  } catch (e) { /* 视图异常忽略，走兜底 */ }
  try {
    const r = await pool.query(
      `SELECT name FROM employee WHERE id = $1 AND is_deleted = false LIMIT 1`,
      [employeeId]
    );
    if (r.rows.length > 0) return r.rows[0].name;
  } catch (e) { /* 忽略 */ }
  return null;
}

let tablesInitialized = false;
let memoryRecords = [];
let memoryIdCounter = 1;

async function ensureTables() {
  if (tablesInitialized) return;
  if (!isConnected()) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS violation_records (
        id BIGSERIAL PRIMARY KEY,
        no VARCHAR(64),
        violation_type VARCHAR(64) DEFAULT '',
        violation_level VARCHAR(32) DEFAULT '',
        risk_level VARCHAR(32) DEFAULT '中',
        description TEXT DEFAULT '',
        location VARCHAR(255),
        violation_date DATE,
        occur_time TIME,
        violator_name VARCHAR(64),
        violator_id BIGINT,
        inspector_name VARCHAR(64),
        inspector_id BIGINT,
        handler_name VARCHAR(64),
        handler_id BIGINT,
        punisher_name VARCHAR(64),
        punisher_id BIGINT,
        punishment_type VARCHAR(64),
        punishment_amount DECIMAL(10,2),
        rectification TEXT,
        rectification_time TIMESTAMPTZ,
        review_result VARCHAR(32),
        review_time TIMESTAMPTZ,
        need_retraining BOOLEAN DEFAULT FALSE,
        training_plan_id BIGINT,
        status VARCHAR(32) DEFAULT '待处理',
        remark TEXT,
        area_team VARCHAR(128),
        upload_time TIMESTAMPTZ,
        grid_level VARCHAR(64),
        position VARCHAR(64),
        violator_gender VARCHAR(16),
        violator_age INTEGER,
        vehicle_type_or_cleaner VARCHAR(128),
        report_status VARCHAR(32),
        image_content TEXT,
        violation_behavior VARCHAR(255),
        violation_type_result VARCHAR(64),
        need_rectification VARCHAR(16),
        rectification_executor VARCHAR(64),
        rectification_photos TEXT,
        schematic_diagram TEXT,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const newColumns = [
      ['area_team', 'VARCHAR(128)'],
      ['upload_time', 'TIMESTAMPTZ'],
      ['grid_level', 'VARCHAR(64)'],
      ['position', 'VARCHAR(64)'],
      ['violator_gender', 'VARCHAR(16)'],
      ['violator_age', 'INTEGER'],
      ['vehicle_type_or_cleaner', 'VARCHAR(128)'],
      ['report_status', 'VARCHAR(32)'],
      ['image_content', 'TEXT'],
      ['violation_behavior', 'VARCHAR(255)'],
      ['violation_type_result', 'VARCHAR(64)'],
      ['need_rectification', 'VARCHAR(16)'],
      ['rectification_executor', 'VARCHAR(64)'],
      ['rectification_photos', 'TEXT'],
      ['schematic_diagram', 'TEXT'],
      // 每日"三违"检查汇总模板新增字段（昵称 / 标记 / 是否补交）
      ['nickname', 'VARCHAR(64)'],
      ['mark', 'VARCHAR(64)'],
      ['is_supplementary', 'VARCHAR(16)'],
      // Sprint D Step 10: 新增 violator_id_card 列，用于关联 employee
      ['violator_id_card', 'VARCHAR(32)'],
      // 阶段2a（提示词-02 B1）：查处来源，用于阶段3 三违扣分分级计分
      // 字典：company=公司查处(5分/次) / township=乡镇及以下查处(1分/次) / self=自查自纠(1分/次) / NULL=未标注
      // 建表语句同见 server/sql/sprint_violation_governance_phase2a.sql
      ['check_source', 'VARCHAR(20)'],
    ];
    for (const [col, type] of newColumns) {
      try {
        await pool.query(`ALTER TABLE violation_records ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (e) { /* ignore if exists */ }
    }
    await pool.query('CREATE INDEX IF NOT EXISTS idx_violation_records_violation_date ON violation_records(violation_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_violation_records_status ON violation_records(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_violation_records_violator_id ON violation_records(violator_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_violation_records_risk_level ON violation_records(risk_level)');
    tablesInitialized = true;
    console.log('[Violations] 数据库表已就绪');
  } catch (err) {
    console.warn('[Violations] 数据库表初始化失败:', err.message);
  }
}

function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRow(row) {
  return camelKeys({
    id: row.id,
    no: row.no || null,
    violationType: row.violation_type || '',
    violationLevel: row.violation_level || '',
    riskLevel: row.risk_level || '中',
    description: row.description || '',
    location: row.location || '',
    violationDate: row.violation_date ? formatDate(row.violation_date) : null,
    occurTime: row.occur_time || null,
    violatorName: row.violator_name || '',
    // 提示词-57 v2: 三违人员直接上级（经由 v_employee_org_full）
    supervisorId: row.supervisor_id || null,
    supervisorName: row.supervisor_name || null,
    violatorId: row.violator_id || null,
    inspectorName: row.inspector_name || '',
    inspectorId: row.inspector_id || null,
    handlerName: row.handler_name || '',
    handlerId: row.handler_id || null,
    punisherName: row.punisher_name || '',
    punisherId: row.punisher_id || null,
    punishmentType: row.punishment_type || '',
    punishmentAmount: row.punishment_amount || null,
    rectification: row.rectification || '',
    rectificationTime: row.rectification_time || null,
    reviewResult: row.review_result || '',
    reviewTime: row.review_time || null,
    needRetraining: row.need_retraining || false,
    trainingPlanId: row.training_plan_id || null,
    status: row.status || '待处理',
    remark: row.remark || '',
    areaTeam: row.area_team || '',
    uploadTime: row.upload_time || null,
    gridLevel: row.grid_level || '',
    position: row.position || '',
    violatorGender: row.violator_gender || '',
    violatorAge: row.violator_age || null,
    vehicleTypeOrCleaner: row.vehicle_type_or_cleaner || '',
    reportStatus: row.report_status || '',
    imageContent: row.image_content || '',
    violationBehavior: row.violation_behavior || '',
    violationTypeResult: row.violation_type_result || '',
    needRectification: row.need_rectification || '',
    rectificationExecutor: row.rectification_executor || '',
    rectificationPhotos: row.rectification_photos || '',
    schematicDiagram: row.schematic_diagram || '',
    nickname: row.nickname || '',
    mark: row.mark || '',
    isSupplementary: row.is_supplementary || '',
    // 阶段2a：查处来源（company/township/self，未标注为 null）
    checkSource: row.check_source || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function buildMemoryRecord(id, data) {
  const now = new Date().toISOString();
  return {
    id,
    no: data.no || null,
    violation_type: data.violation_type || '',
    violation_level: data.violation_level || '',
    risk_level: data.risk_level || '中',
    description: data.description || '',
    location: data.location || '',
    violation_date: data.violation_date || null,
    occur_time: data.occur_time || null,
    violator_name: data.violator_name || '',
    violator_id: data.violator_id || null,
    inspector_name: data.inspector_name || '',
    inspector_id: data.inspector_id || null,
    handler_name: data.handler_name || '',
    handler_id: data.handler_id || null,
    punisher_name: data.punisher_name || '',
    punisher_id: data.punisher_id || null,
    punishment_type: data.punishment_type || '',
    punishment_amount: data.punishment_amount || null,
    rectification: data.rectification || '',
    rectification_time: data.rectification_time || null,
    review_result: data.review_result || '',
    review_time: data.review_time || null,
    need_retraining: data.need_retraining || false,
    training_plan_id: data.training_plan_id || null,
    status: data.status || '待处理',
    remark: data.remark || '',
    area_team: data.area_team || '',
    upload_time: data.upload_time || null,
    grid_level: data.grid_level || '',
    position: data.position || '',
    violator_gender: data.violator_gender || '',
    violator_age: data.violator_age || null,
    vehicle_type_or_cleaner: data.vehicle_type_or_cleaner || '',
    report_status: data.report_status || '',
    image_content: data.image_content || '',
    violation_behavior: data.violation_behavior || '',
    violation_type_result: data.violation_type_result || '',
    need_rectification: data.need_rectification || '',
    rectification_executor: data.rectification_executor || '',
    rectification_photos: data.rectification_photos || '',
    schematic_diagram: data.schematic_diagram || '',
    nickname: data.nickname || '',
    mark: data.mark || '',
    is_supplementary: data.is_supplementary || '',
    check_source: data.check_source || null,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  };
}

// ========== GET / — 列表 ==========
async function list(query) {
  const { page = 1, pageSize = 10, keyword, violationType, areaTeam, gridLevel, startDate, endDate, checkSource } = query;
  const pageNum = Math.max(1, parseInt(page));
  const sizeNum = Math.min(100, Math.max(1, parseInt(pageSize)));
  const offset = (pageNum - 1) * sizeNum;

  if (!isConnected()) {
    let records = memoryRecords.filter(r => !r.is_deleted);
    if (keyword) {
      records = records.filter(r => 
        (r.description && r.description.includes(keyword)) ||
        (r.violator_name && r.violator_name.includes(keyword)) ||
        (r.inspector_name && r.inspector_name.includes(keyword)) ||
        (r.violation_behavior && r.violation_behavior.includes(keyword))
      );
    }
    if (violationType) records = records.filter(r => (r.violation_type_result || '') === violationType);
    if (areaTeam) records = records.filter(r => r.area_team === areaTeam);
    if (gridLevel) records = records.filter(r => r.grid_level === gridLevel);
    if (startDate) records = records.filter(r => (r.violation_date || r.upload_time) >= startDate);
    if (endDate) records = records.filter(r => (r.violation_date || r.upload_time) <= endDate);
    // 阶段2a：按查处来源筛选（camelCase 契约）
    if (checkSource) records = records.filter(r => r.check_source === checkSource);

    const total = records.length;
    records.sort((a, b) => {
      // 有图记录优先
      const aImg = (a.image_content || '') !== '';
      const bImg = (b.image_content || '') !== '';
      if (aImg !== bImg) return aImg ? -1 : 1;
      const da = a.violation_date || '0';
      const db = b.violation_date || '0';
      if (db !== da) return db > da ? 1 : -1;
      return (b.id || 0) - (a.id || 0);
    });
    const paginated = records.slice(offset, offset + sizeNum);
    return ok({ list: paginated.map(formatRow), total, page: pageNum, pageSize: sizeNum }, '查询成功(内存模式)');
  }

  await ensureTables();

  const conditions = ['is_deleted = false'];
  const params = [];
  let i = 1;

  if (keyword) {
    conditions.push(`(description ILIKE $${i} OR violator_name ILIKE $${i} OR inspector_name ILIKE $${i} OR violation_behavior ILIKE $${i})`);
    params.push(`%${keyword}%`);
    i++;
  }
  if (violationType) {
    if (violationType === '违反劳动纪律') {
      conditions.push(`(
        (violation_type_result IS NULL OR violation_type_result = '')
        AND EXISTS (
          SELECT 1 FROM v_employee_org_full emp
          WHERE emp.name = violation_records.violator_name
            AND emp.is_deleted = false AND emp.is_current = true
            AND (violation_records.area_team IS NULL OR violation_records.area_team = '' OR emp.org_name LIKE '%' || violation_records.area_team || '%')
            AND (emp.position_name LIKE '%保洁员%'
              OR emp.position_name LIKE '%驾驶员%'
              OR emp.position_name LIKE '%挂桶工%'
              OR emp.position_name LIKE '%转运站操作工%'
              OR emp.position_name LIKE '%转运站管理员%'
              OR emp.position_name LIKE '%转运站操作员%')
        )
      ) OR violation_type_result = $${i}`);
    } else {
      conditions.push(`violation_type_result = $${i}`);
    }
    params.push(violationType);
    i++;
  }
  if (areaTeam) {
    conditions.push(`area_team = $${i}`);
    params.push(areaTeam);
    i++;
  }
  if (gridLevel) {
    conditions.push(`grid_level = $${i}`);
    params.push(gridLevel);
    i++;
  }
  if (startDate) {
    conditions.push(`COALESCE(violation_date, upload_time::date) >= $${i}`);
    params.push(startDate);
    i++;
  }
  if (endDate) {
    conditions.push(`COALESCE(violation_date, upload_time::date) <= $${i}`);
    params.push(endDate);
    i++;
  }
  // 阶段2a：按查处来源筛选（company / township / self）
  if (checkSource) {
    conditions.push(`check_source = $${i}`);
    params.push(checkSource);
    i++;
  }

  const whereClause = conditions.join(' AND ');
  const countResult = await pool.query(`SELECT COUNT(*) FROM violation_records WHERE ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await pool.query(
    `SELECT v.*,
      emp.supervisor_id,
      emp.supervisor_name,
      CASE
        WHEN (v.violation_type_result IS NULL OR v.violation_type_result = '')
          AND emp.position_name IS NOT NULL
          AND (emp.position_name LIKE '%保洁员%'
            OR emp.position_name LIKE '%驾驶员%'
            OR emp.position_name LIKE '%挂桶工%'
            OR emp.position_name LIKE '%转运站操作工%'
            OR emp.position_name LIKE '%转运站管理员%'
            OR emp.position_name LIKE '%转运站操作员%')
        THEN '违反劳动纪律'
        ELSE v.violation_type_result
      END as violation_type_result_resolved
     FROM violation_records v
     LEFT JOIN LATERAL (
       SELECT emp.position_name, emp.supervisor_id, emp.supervisor_name
       FROM v_employee_org_full emp
       WHERE emp.name = v.violator_name
         AND emp.is_deleted = false AND emp.is_current = true
         AND (v.area_team IS NULL OR v.area_team = '' OR emp.org_name LIKE '%' || v.area_team || '%')
       LIMIT 1
     ) emp ON true
     WHERE ${whereClause}
     ORDER BY
       CASE WHEN (v.image_content IS NOT NULL AND v.image_content != '') THEN 0 ELSE 1 END,
       v.violation_date DESC NULLS LAST, v.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, sizeNum, offset]
  );

  const resolvedRows = result.rows.map(row => ({
    ...row,
    violation_type_result: row.violation_type_result_resolved || row.violation_type_result || '',
  }));
  return ok({ list: resolvedRows.map(formatRow), total, page: pageNum, pageSize: sizeNum }, '查询成功');
}

// ========== GET /stats — 统计 ==========
async function stats() {
  if (!isConnected()) {
    const records = memoryRecords.filter(r => !r.is_deleted);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const yearRecords = records.filter(r => {
      const d = r.violation_date ? new Date(r.violation_date) : r.upload_time ? new Date(r.upload_time) : null;
      return d && d.getFullYear() === year;
    });
    const monthRecords = records.filter(r => {
      const d = r.violation_date ? new Date(r.violation_date) : r.upload_time ? new Date(r.upload_time) : null;
      return d && d.getFullYear() === year && d.getMonth() === month;
    });
    const s = {
      total: yearRecords.length,
      pending: records.filter(r => r.status === '待处理').length,
      processed: records.filter(r => r.status === '已处理').length,
      level1Month: monthRecords.filter(r => r.grid_level && r.grid_level.includes('一级')).length,
      level2Month: monthRecords.filter(r => r.grid_level && r.grid_level.includes('二级')).length,
      level3Month: monthRecords.filter(r => r.grid_level && r.grid_level.includes('三级')).length,
    };
    return ok(s, '查询成功(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(YEAR FROM NOW())) as total_year,
      COUNT(*) FILTER (WHERE status = '待处理') as pending,
      COUNT(*) FILTER (WHERE status = '已处理') as processed,
      COUNT(*) FILTER (WHERE
        EXTRACT(YEAR FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(YEAR FROM NOW())
        AND EXTRACT(MONTH FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(MONTH FROM NOW())
        AND grid_level LIKE '%一级%') as level1_month,
      COUNT(*) FILTER (WHERE
        EXTRACT(YEAR FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(YEAR FROM NOW())
        AND EXTRACT(MONTH FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(MONTH FROM NOW())
        AND grid_level LIKE '%二级%') as level2_month,
      COUNT(*) FILTER (WHERE
        EXTRACT(YEAR FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(YEAR FROM NOW())
        AND EXTRACT(MONTH FROM COALESCE(violation_date, upload_time::date)) = EXTRACT(MONTH FROM NOW())
        AND grid_level LIKE '%三级%') as level3_month
    FROM violation_records WHERE is_deleted = false
  `);

  const row = result.rows[0];
  const s = {
    total: parseInt(row.total_year) || 0,
    pending: parseInt(row.pending) || 0,
    processed: parseInt(row.processed) || 0,
    level1Month: parseInt(row.level1_month) || 0,
    level2Month: parseInt(row.level2_month) || 0,
    level3Month: parseInt(row.level3_month) || 0,
  };

  return ok(s, '查询成功');
}

// ========== GET /filter-options — 筛选选项 ==========
async function filterOptions() {
  if (!isConnected()) {
    const records = memoryRecords.filter(r => !r.is_deleted);
    const areaTeams = [...new Set(records.map(r => r.area_team).filter(Boolean))];
    const gridLevels = [...new Set(records.map(r => r.grid_level).filter(Boolean))];
    const checkSources = [
      { value: 'company', label: '公司查处' },
      { value: 'township', label: '乡镇查处' },
      { value: 'self', label: '自查自纠' },
    ];
    return ok({ areaTeams, gridLevels, checkSources }, '查询成功(内存模式)');
  }

  await ensureTables();

  const [areaResult, gridResult] = await Promise.all([
    pool.query(`SELECT DISTINCT area_team FROM violation_records WHERE is_deleted = false AND area_team IS NOT NULL AND area_team != '' ORDER BY area_team`),
    pool.query(`SELECT DISTINCT grid_level FROM violation_records WHERE is_deleted = false AND grid_level IS NOT NULL AND grid_level != '' ORDER BY grid_level`),
  ]);

  const areaTeams = areaResult.rows.map(r => r.area_team);
  const gridLevels = gridResult.rows.map(r => r.grid_level);

  // 阶段2a：查处来源为固定字典（非从数据派生），前端下拉直接用
  const checkSources = [
    { value: 'company', label: '公司查处' },
    { value: 'township', label: '乡镇查处' },
    { value: 'self', label: '自查自纠' },
  ];

  return ok({ areaTeams, gridLevels, checkSources }, '查询成功');
}

// ========== GET /:id — 单条 ==========
async function detail(params) {
  if (!isConnected()) {
    const record = memoryRecords.find(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (!record) return err(-2, '记录不存在');
    return ok(formatRow(record), '查询成功(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(`
    SELECT v.*,
      CASE
        WHEN (v.violation_type_result IS NULL OR v.violation_type_result = '')
          AND emp.position_name IS NOT NULL
          AND (emp.position_name LIKE '%保洁员%'
            OR emp.position_name LIKE '%驾驶员%'
            OR emp.position_name LIKE '%挂桶工%'
            OR emp.position_name LIKE '%转运站操作工%'
            OR emp.position_name LIKE '%转运站管理员%'
            OR emp.position_name LIKE '%转运站操作员%')
        THEN '违反劳动纪律'
        ELSE v.violation_type_result
      END as violation_type_result_resolved
     FROM violation_records v
     LEFT JOIN LATERAL (
       SELECT emp.position_name
       FROM v_employee_org_full emp
       WHERE emp.name = v.violator_name
         AND emp.is_deleted = false AND emp.is_current = true
         AND (v.area_team IS NULL OR v.area_team = '' OR emp.org_name LIKE '%' || v.area_team || '%')
       LIMIT 1
     ) emp ON true
     WHERE v.id = $1 AND v.is_deleted = false`, [params.id]);
  if (result.rows.length === 0) return err(-2, '记录不存在');

  const row = result.rows[0];
  row.violation_type_result = row.violation_type_result_resolved || row.violation_type_result || '';
  return ok(formatRow(row), '查询成功');
}

// ========== POST / — 创建 ==========
async function create(body, req) {
  const b = body;
  const violationType = b.violationType || b.violation_type || '';
  const violationLevel = b.violationLevel || b.violation_level || '';
  const riskLevel = b.riskLevel || b.risk_level || '中';
  const description = b.description || '';
  const location = b.location || '';
  const violationDate = b.violationDate || b.violation_date || null;
  const occurTime = b.occurTime || b.occur_time || null;
  const violatorName = b.violatorName || b.violator_name || '';
  const violatorIdCard = b.violatorIdCard || b.violator_id_card || '';
  const violatorId = b.violatorId || b.violator_id || null;
  const inspectorName = b.inspectorName || b.inspector_name || '';
  const inspectorId = b.inspectorId || b.inspector_id || null;
  const handlerName = b.handlerName || b.handler_name || '';
  const handlerId = b.handlerId || b.handler_id || null;
  const punisherName = b.punisherName || b.punisher_name || '';
  const punisherId = b.punisherId || b.punisher_id || null;
  const punishmentType = b.punishmentType || b.punishment_type || '';
  const punishmentAmount = b.punishmentAmount || b.punishment_amount || null;
  const rectification = b.rectification || '';
  const status = b.status || '待处理';
  const remark = b.remark || '';
  const areaTeam = b.areaTeam || b.area_team || '';
  const uploadTime = b.uploadTime || b.upload_time || null;
  const gridLevel = b.gridLevel || b.grid_level || '';
  const position = b.position || '';
  const violatorGender = b.violatorGender || b.violator_gender || '';
  const violatorAge = b.violatorAge || b.violator_age || null;
  const vehicleTypeOrCleaner = b.vehicleTypeOrCleaner || b.vehicle_type_or_cleaner || '';
  const reportStatus = b.reportStatus || b.report_status || '';
  const imageContent = b.imageContent || b.image_content || '';
  const violationBehavior = b.violationBehavior || b.violation_behavior || '';
  const violationTypeResult = b.violationTypeResult || b.violation_type_result || '';
  const needRectification = b.needRectification || b.need_rectification || '';
  const rectificationExecutor = b.rectificationExecutor || b.rectification_executor || '';
  const rectificationPhotos = b.rectificationPhotos || b.rectification_photos || '';
  const schematicDiagram = b.schematicDiagram || b.schematic_diagram || '';
  const nickname = b.nickname || '';
  const mark = b.mark || '';
  const isSupplementary = b.is_supplementary || b.isSupplementary || '';
  // 阶段2a：查处来源（company / township / self；未标注为 null）
  const checkSource = b.checkSource || b.check_source || null;
  // 阶段2：新建时查处来源必选（从源头消灭新的 NULL）
  if (!checkSource) {
    return err(-1, '查处来源为必填项（公司查处 / 乡镇查处 / 自查自纠）');
  }

  const needRetraining = b.needRetraining || b.need_retraining || (violationLevel === '严重');

  const fields = {
    no: b.no || null,
    violation_type: violationType,
    violation_level: violationLevel,
    risk_level: riskLevel,
    description,
    location,
    violation_date: violationDate,
    occur_time: occurTime,
    violator_name: violatorName,
    violator_id: violatorId,
    violator_id_card: violatorIdCard || null,
    inspector_name: inspectorName,
    inspector_id: inspectorId,
    handler_name: handlerName,
    handler_id: handlerId,
    punisher_name: punisherName,
    punisher_id: punisherId,
    punishment_type: punishmentType,
    punishment_amount: punishmentAmount,
    rectification,
    status,
    need_retraining: needRetraining,
    remark,
    area_team: areaTeam,
    upload_time: uploadTime,
    grid_level: gridLevel,
    position,
    violator_gender: violatorGender,
    violator_age: violatorAge,
    vehicle_type_or_cleaner: vehicleTypeOrCleaner,
    report_status: reportStatus,
    image_content: imageContent,
    violation_behavior: violationBehavior,
    violation_type_result: violationTypeResult,
    need_rectification: needRectification,
    rectification_executor: rectificationExecutor,
    rectification_photos: rectificationPhotos,
    schematic_diagram: schematicDiagram,
    nickname,
    mark,
    is_supplementary: isSupplementary,
    check_source: checkSource,
  };

  if (!isConnected()) {
    const record = buildMemoryRecord(memoryIdCounter++, fields);
    memoryRecords.push(record);
    return ok(formatRow(record), '创建成功(内存模式)');
  }

  await ensureTables();

  // Sprint D Step 10: 自动解析 violator_id（id_card hash 优先，name 降级）
  const resolvedViolatorId = await resolveViolatorId(violatorName, violatorIdCard, violatorId);
  fields.violator_id = resolvedViolatorId;
  // 阶段2：传入 violator_id 时，以员工主数据为准同步权威姓名（覆盖自由文本）
  if (resolvedViolatorId) {
    const authName = await resolveViolatorName(resolvedViolatorId);
    if (authName) fields.violator_name = authName;
  }

  const cols = Object.keys(fields);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool.query(
    `INSERT INTO violation_records (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`,
    Object.values(fields)
  );

  const newRecord = result.rows[0];

  // 既存缺陷修复（2026-08-30，见执行报告-02 第 5 节「偏离项」）：
  // hseEventSyncService 未导出 syncViolation，原调用 `hseEventSync.syncViolation(...)` 会在
  // 取属性阶段同步抛出 TypeError，导致「INSERT 已成功、却返回操作失败」并留下孤儿记录。
  // 改为存在性守卫，恢复「事件同步为旁路、失败不阻断主流程」的原始设计意图。
  if (typeof hseEventSync.syncViolation === 'function') {
    hseEventSync.syncViolation(newRecord.id, newRecord).catch(err => {
      console.error('Failed to sync violation to hse_events:', err.message);
    });
  } else {
    console.warn('[Violation] hseEventSync.syncViolation 未实现，跳过事件同步（不影响三违记录本身）');
  }

  // 月度自动考核：触发三违扣分（个人 + 直属上级传导）
  assessmentEvent.publish(assessmentEvent.EVENT_TYPES.VIOLATION_CREATED, {
    violationId: newRecord.id,
    violationType: newRecord.violation_type,
    violatorId: newRecord.violator_id,
    violatorName: newRecord.violator_name,
    violationDate: newRecord.violation_date,
  });

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'create', module: 'violations', description: `创建三违记录`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(newRecord), '创建成功');
}

// ========== PUT /:id — 更新 ==========
async function update(params, body, req) {
  const b = body;
  const setClauses = [];
  const ps = [];
  let i = 1;

  // 阶段2：编辑传入 violator_id 时，预解析权威姓名（仅解析到才覆盖）
  let resolvedViolatorName = undefined;
  if (b.violatorId) {
    resolvedViolatorName = await resolveViolatorName(b.violatorId);
  }

  if (b.no !== undefined) { setClauses.push(`no = $${i++}`); ps.push(b.no); }
  if (b.violationType !== undefined) { setClauses.push(`violation_type = $${i++}`); ps.push(b.violationType); }
  if (b.violationLevel !== undefined) { setClauses.push(`violation_level = $${i++}`); ps.push(b.violationLevel); }
  if (b.riskLevel !== undefined) { setClauses.push(`risk_level = $${i++}`); ps.push(b.riskLevel); }
  if (b.description !== undefined) { setClauses.push(`description = $${i++}`); ps.push(b.description); }
  if (b.location !== undefined) { setClauses.push(`location = $${i++}`); ps.push(b.location); }
  if (b.violationDate !== undefined) { setClauses.push(`violation_date = $${i++}`); ps.push(b.violationDate); }
  if (b.occurTime !== undefined) { setClauses.push(`occur_time = $${i++}`); ps.push(b.occurTime); }
  if (b.violatorName !== undefined) { setClauses.push(`violator_name = $${i++}`); ps.push(b.violatorName); }
  if (b.violatorIdCard !== undefined) { setClauses.push(`violator_id_card = $${i++}`); ps.push(b.violatorIdCard || null); }
  if (b.violatorId !== undefined) { setClauses.push(`violator_id = $${i++}`); ps.push(b.violatorId || null); }
  // 阶段2：编辑传入 violator_id 且解析到权威姓名时，同步覆盖 violator_name
  if (b.violatorId && resolvedViolatorName) { setClauses.push(`violator_name = $${i++}`); ps.push(resolvedViolatorName); }
  if (b.inspectorName !== undefined) { setClauses.push(`inspector_name = $${i++}`); ps.push(b.inspectorName); }
  if (b.inspectorId !== undefined) { setClauses.push(`inspector_id = $${i++}`); ps.push(b.inspectorId || null); }
  if (b.handlerName !== undefined) { setClauses.push(`handler_name = $${i++}`); ps.push(b.handlerName); }
  if (b.handlerId !== undefined) { setClauses.push(`handler_id = $${i++}`); ps.push(b.handlerId || null); }
  if (b.punisherName !== undefined) { setClauses.push(`punisher_name = $${i++}`); ps.push(b.punisherName); }
  if (b.punisherId !== undefined) { setClauses.push(`punisher_id = $${i++}`); ps.push(b.punisherId || null); }
  if (b.punishmentType !== undefined) { setClauses.push(`punishment_type = $${i++}`); ps.push(b.punishmentType); }
  if (b.punishmentAmount !== undefined) { setClauses.push(`punishment_amount = $${i++}`); ps.push(b.punishmentAmount || null); }
  if (b.rectification !== undefined) { setClauses.push(`rectification = $${i++}`); ps.push(b.rectification); }
  if (b.rectificationTime !== undefined) { setClauses.push(`rectification_time = $${i++}`); ps.push(b.rectificationTime || null); }
  if (b.reviewResult !== undefined) { setClauses.push(`review_result = $${i++}`); ps.push(b.reviewResult); }
  if (b.reviewTime !== undefined) { setClauses.push(`review_time = $${i++}`); ps.push(b.reviewTime || null); }
  if (b.needRetraining !== undefined) { setClauses.push(`need_retraining = $${i++}`); ps.push(b.needRetraining); }
  if (b.trainingPlanId !== undefined) { setClauses.push(`training_plan_id = $${i++}`); ps.push(b.trainingPlanId || null); }
  if (b.status !== undefined) { setClauses.push(`status = $${i++}`); ps.push(b.status); }
  if (b.remark !== undefined) { setClauses.push(`remark = $${i++}`); ps.push(b.remark); }
  if (b.nickname !== undefined) { setClauses.push(`nickname = $${i++}`); ps.push(b.nickname); }
  if (b.mark !== undefined) { setClauses.push(`mark = $${i++}`); ps.push(b.mark); }
  if (b.isSupplementary !== undefined) { setClauses.push(`is_supplementary = $${i++}`); ps.push(b.isSupplementary); }
  // 阶段2a：查处来源（camelCase；显式传 null 表示清除标注）
  if (b.checkSource !== undefined) { setClauses.push(`check_source = $${i++}`); ps.push(b.checkSource || null); }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  ps.push(params.id);

  if (!isConnected()) {
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    if (b.no !== undefined) memoryRecords[idx].no = b.no;
    if (b.violationType !== undefined) memoryRecords[idx].violation_type = b.violationType;
    if (b.violationLevel !== undefined) memoryRecords[idx].violation_level = b.violationLevel;
    if (b.riskLevel !== undefined) memoryRecords[idx].risk_level = b.riskLevel;
    if (b.description !== undefined) memoryRecords[idx].description = b.description;
    if (b.location !== undefined) memoryRecords[idx].location = b.location;
    if (b.violationDate !== undefined) memoryRecords[idx].violation_date = b.violationDate;
    if (b.occurTime !== undefined) memoryRecords[idx].occur_time = b.occurTime;
    if (b.violatorName !== undefined) memoryRecords[idx].violator_name = b.violatorName;
    if (b.violatorId !== undefined) memoryRecords[idx].violator_id = b.violatorId || null;
    if (b.violatorId && resolvedViolatorName) memoryRecords[idx].violator_name = resolvedViolatorName;
    if (b.inspectorName !== undefined) memoryRecords[idx].inspector_name = b.inspectorName;
    if (b.inspectorId !== undefined) memoryRecords[idx].inspector_id = b.inspectorId || null;
    if (b.handlerName !== undefined) memoryRecords[idx].handler_name = b.handlerName;
    if (b.handlerId !== undefined) memoryRecords[idx].handler_id = b.handlerId || null;
    if (b.punisherName !== undefined) memoryRecords[idx].punisher_name = b.punisherName;
    if (b.punisherId !== undefined) memoryRecords[idx].punisher_id = b.punisherId || null;
    if (b.punishmentType !== undefined) memoryRecords[idx].punishment_type = b.punishmentType;
    if (b.punishmentAmount !== undefined) memoryRecords[idx].punishment_amount = b.punishmentAmount || null;
    if (b.rectification !== undefined) memoryRecords[idx].rectification = b.rectification;
    if (b.rectificationTime !== undefined) memoryRecords[idx].rectification_time = b.rectificationTime || null;
    if (b.reviewResult !== undefined) memoryRecords[idx].review_result = b.reviewResult;
    if (b.reviewTime !== undefined) memoryRecords[idx].review_time = b.reviewTime || null;
    if (b.needRetraining !== undefined) memoryRecords[idx].need_retraining = b.needRetraining;
    if (b.trainingPlanId !== undefined) memoryRecords[idx].training_plan_id = b.trainingPlanId || null;
    if (b.status !== undefined) memoryRecords[idx].status = b.status;
    if (b.remark !== undefined) memoryRecords[idx].remark = b.remark;
    if (b.nickname !== undefined) memoryRecords[idx].nickname = b.nickname;
    if (b.mark !== undefined) memoryRecords[idx].mark = b.mark;
    if (b.is_supplementary !== undefined) memoryRecords[idx].is_supplementary = b.isSupplementary;
    if (b.checkSource !== undefined) memoryRecords[idx].check_source = b.checkSource || null;
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), '更新成功(内存模式)');
  }

  const result = await pool.query(
    `UPDATE violation_records SET ${setClauses.join(', ')} WHERE id = $${i} AND is_deleted = false RETURNING *`,
    ps
  );

  if (result.rows.length === 0) return err(-2, '记录不存在');

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'update', module: 'violations', description: `更新三违记录 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(result.rows[0]), '更新成功');
}

// ========== DELETE /batch — 批量删除 ==========
async function batchDelete(body, req) {
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return err(-1, '请选择要删除的记录');
  }
  const intIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
  if (intIds.length === 0) {
    return err(-1, '无效的ID列表');
  }

  if (!isConnected()) {
    intIds.forEach(id => {
      const idx = memoryRecords.findIndex(r => r.id === id && !r.is_deleted);
      if (idx !== -1) {
        memoryRecords[idx].is_deleted = true;
        memoryRecords[idx].updated_at = new Date().toISOString();
      }
    });
    return ok({ deleted: intIds.length }, '批量删除成功(内存模式)');
  }

  await ensureTables();

  const placeholders = intIds.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool.query(
    `UPDATE violation_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders}) AND is_deleted = false`,
    intIds
  );

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'batch_delete', module: 'violations', description: `批量删除三违记录 ${intIds.length} 条`, ip: req?.ip }).catch(() => {});
  return ok({ deleted: result.rowCount }, '批量删除成功');
}

// ========== DELETE /:id — 软删除 ==========
async function remove(params, req) {
  if (!isConnected()) {
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    memoryRecords[idx].is_deleted = true;
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(null, '删除成功(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(
    'UPDATE violation_records SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = false RETURNING *',
    [params.id]
  );

  if (result.rows.length === 0) return err(-2, '记录不存在');

  // 月度自动考核：撤销该三违对应的个人+传导扣分
  const delRecord = result.rows[0];
  assessmentEvent.publish(assessmentEvent.EVENT_TYPES.VIOLATION_DELETED, {
    violationId: params.id,
    violatorId: delRecord.violator_id,
  });

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'delete', module: 'violations', description: `删除三违记录 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(null, '删除成功');
}

// ========== CSV 导出辅助 ==========
const CSV_HEADERS = ['序号', '片区/班组', '上传时间', '检查人姓名', '网格等级', '所属岗位', '违章人姓名', '违章人性别', '违章人年龄', '车辆类型/保洁员', '上报状态', '图片内容', '三违行为', '三违类型', '需要整改', '整改执行人', '整改后的照片', '示意图', '昵称', '标记', '是否补交', '编号', '状态', '备注'];

function buildCsvFromRows(rows, useMemoryShape) {
  let csv = '\uFEFF' + CSV_HEADERS.join(',') + '\n';
  rows.forEach((r, idx) => {
    const row = useMemoryShape
      ? [
          idx + 1, r.area_team || '', r.upload_time || '', r.inspector_name || '', r.grid_level || '',
          r.position || '', r.violator_name || '', r.violator_gender || '', r.violator_age || '',
          r.vehicle_type_or_cleaner || '', r.report_status || '',
          `"${(r.image_content || '').replace(/"/g, '""')}"`,
          `"${(r.violation_behavior || '').replace(/"/g, '""')}"`,
          r.violation_type_result || '', r.need_rectification || '', r.rectification_executor || '',
          `"${(r.rectification_photos || '').replace(/"/g, '""')}"`,
          `"${(r.schematic_diagram || '').replace(/"/g, '""')}"`,
          r.nickname || '', r.mark || '', r.is_supplementary || '', r.no || '', r.status || '',
          `"${(r.remark || '').replace(/"/g, '""')}"`,
        ]
      : [
          idx + 1, r.area_team || '', r.upload_time || '', r.inspector_name || '', r.grid_level || '',
          r.position || '', r.violator_name || '', r.violator_gender || '', r.violator_age || '',
          r.vehicle_type_or_cleaner || '', r.report_status || '',
          `"${(r.image_content || '').replace(/"/g, '""')}"`,
          `"${(r.violation_behavior || '').replace(/"/g, '""')}"`,
          r.violation_type_result || '', r.need_rectification || '', r.rectification_executor || '',
          `"${(r.rectification_photos || '').replace(/"/g, '""')}"`,
          `"${(r.schematic_diagram || '').replace(/"/g, '""')}"`,
          r.status || '',
          `"${(r.remark || '').replace(/"/g, '""')}"`,
        ];
    csv += row.join(',') + '\n';
  });
  return csv;
}

// ========== GET /export/csv — 导出三违 CSV ==========
async function exportCsv() {
  if (!isConnected()) {
    const records = memoryRecords.filter(r => !r.is_deleted);
    return { __t: 'csv', csv: buildCsvFromRows(records, true) };
  }

  await ensureTables();

  const result = await pool.query('SELECT * FROM violation_records WHERE is_deleted = false ORDER BY violation_date DESC');
  return { __t: 'csv', csv: buildCsvFromRows(result.rows, false) };
}

// ========== PUT /:id/rectify — 整改提交 ==========
async function rectify(params, body, req) {
  const b = body;
  const rectification = b.rectification || '';
  const handlerName = b.handlerName || '';
  const handlerId = b.handlerId || null;

  if (!isConnected()) {
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    memoryRecords[idx].rectification = rectification;
    memoryRecords[idx].rectification_time = new Date().toISOString();
    memoryRecords[idx].handler_name = handlerName;
    memoryRecords[idx].handler_id = handlerId;
    memoryRecords[idx].status = '待复查';
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), '整改提交成功(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(
    `UPDATE violation_records 
     SET rectification = $1, rectification_time = CURRENT_TIMESTAMP, handler_name = $2, handler_id = $3, status = '待复查', updated_at = CURRENT_TIMESTAMP 
     WHERE id = $4 AND is_deleted = false AND status IN ('待处理', '整改中') RETURNING *`,
    [rectification, handlerName, handlerId, params.id]
  );

  if (result.rows.length === 0) return err(-2, '记录不存在或状态不允许整改');

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'rectify', module: 'violations', description: `整改三违记录 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(result.rows[0]), '整改提交成功');
}

// ========== PUT /:id/review — 复查确认 ==========
async function review(params, body, req) {
  const b = body;
  const reviewResult = b.reviewResult || '';
  const remark = b.remark || '';

  let status = '';
  if (reviewResult === '合格') {
    status = '已关闭';
  } else if (reviewResult === '不合格') {
    status = '整改中';
  }

  if (!isConnected()) {
    const idx = memoryRecords.findIndex(r => r.id === parseInt(params.id) && !r.is_deleted);
    if (idx === -1) return err(-2, '记录不存在');
    memoryRecords[idx].review_result = reviewResult;
    memoryRecords[idx].review_time = new Date().toISOString();
    memoryRecords[idx].status = status;
    if (remark) memoryRecords[idx].remark = remark;
    memoryRecords[idx].updated_at = new Date().toISOString();
    return ok(formatRow(memoryRecords[idx]), '复查完成(内存模式)');
  }

  await ensureTables();

  const result = await pool.query(
    `UPDATE violation_records 
     SET review_result = $1, review_time = CURRENT_TIMESTAMP, status = $2, remark = COALESCE($3, remark), updated_at = CURRENT_TIMESTAMP 
     WHERE id = $4 AND is_deleted = false AND status = '待复查' RETURNING *`,
    [reviewResult, status, remark, params.id]
  );

  if (result.rows.length === 0) return err(-2, '记录不存在或状态不允许复查');

  // 月度自动考核：复查合格（已关闭）时撤销该三违的“未及时处理”扣分
  if (status === '已关闭') {
    assessmentEvent.publish(assessmentEvent.EVENT_TYPES.VIOLATION_CLOSED, {
      violationId: params.id,
      violatorId: result.rows[0].violator_id,
    });
  }

  auditLog({ userId: req?.user?.id, username: req?.user?.username, action: 'review', module: 'violations', description: `复查三违记录 ID=${params.id}`, ip: req?.ip }).catch(() => {});
  return ok(formatRow(result.rows[0]), '复查完成');
}

// ========== GET /statistics/employee-count — 人员统计 ==========
async function statisticsEmployeeCount(query) {
  const { startDate, endDate } = query;

  if (!isConnected()) {
    let records = memoryRecords.filter(r => !r.is_deleted);
    if (startDate) records = records.filter(r => r.violation_date >= startDate);
    if (endDate) records = records.filter(r => r.violation_date <= endDate);

    const counts = {};
    records.forEach(r => {
      const key = r.violator_id || r.violator_name;
      counts[key] = (counts[key] || 0) + 1;
    });

    const result = Object.entries(counts)
      .map(([key, count]) => ({
        employeeId: typeof key === 'number' ? key : null,
        employeeName: typeof key === 'string' && !/^\d+$/.test(key) ? key : '',
        violationCount: count
      }))
      .sort((a, b) => b.violationCount - a.violationCount);

    return ok(result);
  }

  await ensureTables();

  let q = `
    SELECT violator_id, violator_name, COUNT(*) as violation_count
    FROM violation_records
    WHERE is_deleted = false
  `;
  const params = [];
  let i = 1;

  if (startDate) {
    q += ` AND violation_date >= $${i++}`;
    params.push(startDate);
  }
  if (endDate) {
    q += ` AND violation_date <= $${i++}`;
    params.push(endDate);
  }

  q += ' GROUP BY violator_id, violator_name ORDER BY violation_count DESC';

  const result = await pool.query(q, params);

  return ok(result.rows.map(row => ({
    employeeId: row.violator_id || null,
    employeeName: row.violator_name || '',
    violationCount: parseInt(row.violation_count)
  })));
}

// ========== GET /statistics/high-risk — 高风险人员统计 ==========
async function statisticsHighRisk(query) {
  const { startDate, endDate } = query;

  if (!isConnected()) {
    let records = memoryRecords.filter(r => !r.is_deleted && r.risk_level === '高');
    if (startDate) records = records.filter(r => r.violation_date >= startDate);
    if (endDate) records = records.filter(r => r.violation_date <= endDate);

    const counts = {};
    records.forEach(r => {
      const key = r.violator_id || r.violator_name;
      counts[key] = (counts[key] || 0) + 1;
    });

    const result = Object.entries(counts)
      .filter(([, count]) => count >= 2)
      .map(([key, count]) => ({
        employeeId: typeof key === 'number' ? key : null,
        employeeName: typeof key === 'string' && !/^\d+$/.test(key) ? key : '',
        highRiskCount: count
      }))
      .sort((a, b) => b.highRiskCount - a.highRiskCount);

    return ok(result);
  }

  await ensureTables();

  let q = `
    SELECT violator_id, violator_name, COUNT(*) as high_risk_count
    FROM violation_records
    WHERE is_deleted = false AND risk_level = '高'
  `;
  const params = [];
  let i = 1;

  if (startDate) {
    q += ` AND violation_date >= $${i++}`;
    params.push(startDate);
  }
  if (endDate) {
    q += ` AND violation_date <= $${i++}`;
    params.push(endDate);
  }

  q += ' GROUP BY violator_id, violator_name HAVING COUNT(*) >= 2 ORDER BY high_risk_count DESC';

  const result = await pool.query(q, params);

  return ok(result.rows.map(row => ({
    employeeId: row.violator_id || null,
    employeeName: row.violator_name || '',
    highRiskCount: parseInt(row.high_risk_count)
  })));
}

// ========== GET /statistics/department-ranking — 部门排行 ==========
async function statisticsDepartmentRanking(query) {
  const { startDate, endDate } = query;

  if (!isConnected()) {
    let records = memoryRecords.filter(r => !r.is_deleted);
    if (startDate) records = records.filter(r => r.violation_date >= startDate);
    if (endDate) records = records.filter(r => r.violation_date <= endDate);

    const counts = {};
    records.forEach(r => {
      const dept = r.location || '未知部门';
      counts[dept] = (counts[dept] || 0) + 1;
    });

    const result = Object.entries(counts)
      .map(([department, count]) => ({ department, violationCount: count }))
      .sort((a, b) => b.violationCount - a.violationCount);

    return ok(result);
  }

  await ensureTables();

  let q = `
    SELECT location as department, COUNT(*) as violation_count
    FROM violation_records
    WHERE is_deleted = false
  `;
  const params = [];
  let i = 1;

  if (startDate) {
    q += ` AND violation_date >= $${i++}`;
    params.push(startDate);
  }
  if (endDate) {
    q += ` AND violation_date <= $${i++}`;
    params.push(endDate);
  }

  q += ' GROUP BY location ORDER BY violation_count DESC';

  const result = await pool.query(q, params);

  return ok(result.rows.map(row => ({
    department: row.department || '未知部门',
    violationCount: parseInt(row.violation_count)
  })));
}

// ========== GET /statistics/position-ranking — 岗位排行 ==========
async function statisticsPositionRanking(query) {
  const { startDate, endDate } = query;

  if (!isConnected()) {
    let records = memoryRecords.filter(r => !r.is_deleted);
    if (startDate) records = records.filter(r => r.violation_date >= startDate);
    if (endDate) records = records.filter(r => r.violation_date <= endDate);

    const counts = {};
    records.forEach(r => {
      const pos = r.violation_type || '未知岗位';
      counts[pos] = (counts[pos] || 0) + 1;
    });

    const result = Object.entries(counts)
      .map(([position, count]) => ({ position, violationCount: count }))
      .sort((a, b) => b.violationCount - a.violationCount);

    return ok(result);
  }

  await ensureTables();

  let q = `
    SELECT violation_type as position, COUNT(*) as violation_count
    FROM violation_records
    WHERE is_deleted = false
  `;
  const params = [];
  let i = 1;

  if (startDate) {
    q += ` AND violation_date >= $${i++}`;
    params.push(startDate);
  }
  if (endDate) {
    q += ` AND violation_date <= $${i++}`;
    params.push(endDate);
  }

  q += ' GROUP BY violation_type ORDER BY violation_count DESC';

  const result = await pool.query(q, params);

  return ok(result.rows.map(row => ({
    position: row.position || '未知岗位',
    violationCount: parseInt(row.violation_count)
  })));
}

module.exports = {
  resolveViolatorId,
  resolveViolatorName,
  list,
  stats,
  filterOptions,
  detail,
  create,
  update,
  batchDelete,
  remove,
  exportCsv,
  rectify,
  review,
  statisticsEmployeeCount,
  statisticsHighRisk,
  statisticsDepartmentRanking,
  statisticsPositionRanking,
};