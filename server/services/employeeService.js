/**
 * HSE 员工域 · 员工 CRUD 服务（employee 表，无 age，年龄由视图计算）
 * 从 hse-employee/employee.js route 内联 handler 迁移 —— 行为逐字节不变
 * 仅承载业务规则 + SQL；无 express 依赖，可独立单测
 */

const { pool } = require('../config/db');
const { decryptFields } = require('../middleware/encryption');
const employeeEventService = require('./employeeEventService');
const { writeSegment, SegmentConflictError } = require('./assignmentSegmentService');
const {
  statusLabelSql,
  displayStatusSql,
  leftRelationInSql,
  knownRelationInSql,
  terminalRelationInSql,
  validateRelationInput,
  RELATION,
} = require('./employeeStatusDict');
const { ENCRYPT_FIELDS, secureEncode, parseIdList, fetchEmployeeInfosByIds, buildOverAgeCondition } = require('../routes/hse-employee/_shared');

// 脱敏：身份证 前6 + **** + 后4
function maskIdCard(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 10) return '****';
  return `${s.slice(0, 6)}****${s.slice(-4)}`;
}

// 脱敏：手机 前3 + **** + 后4
function maskPhone(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 7) return '****';
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

// 日期格式化 YYYY-MM-DD（null 安全）
function formatProfileDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// GET /employees — 分页查询员工列表（通过视图返回年龄）
async function listEmployees(query) {
  const { page = 1, pageSize = 20, keyword, personType, personCategory, status, gender, deptName, positionName, employmentRelation, overageOnly } = query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['e.is_deleted = false'];
  const params = [];
  let paramIdx = 1;

  if (keyword) {
    conditions.push(`(ev.name ILIKE $${paramIdx} OR ev.employee_code ILIKE $${paramIdx} OR e.phone ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }
  if (personType) {
    conditions.push(`e.person_type = $${paramIdx}`);
    params.push(personType);
    paramIdx++;
  }
  if (personCategory) {
    conditions.push(`e.person_category = $${paramIdx}`);
    params.push(personCategory);
    paramIdx++;
  }
  if (gender) {
    conditions.push(`e.gender = $${paramIdx}`);
    params.push(gender);
    paramIdx++;
  }
  if (deptName) {
    conditions.push(`(ev.org_name = $${paramIdx} OR opu.unit_name = $${paramIdx})`);
    params.push(deptName);
    paramIdx++;
  }
  if (positionName) {
    conditions.push(`ev.position_name = $${paramIdx}`);
    params.push(positionName);
    paramIdx++;
  }
  // 统计卡点击联动：按「用工关系状态」/超龄口径过滤（与 /employees/stats 口径一致）
  if (overageOnly === 'true' || employmentRelation) {
    if (overageOnly === 'true') {
      // 超龄：仅在在职（正式员工）中按男60/女50判定
      conditions.push(`e.employment_relation = '正式员工'`);
      conditions.push(buildOverAgeCondition('e'));
    } else if (employmentRelation === 'active') {
      conditions.push(`e.employment_relation = '正式员工'`);
    } else if (employmentRelation === 'left') {
      // 离职口径 = 辞职 + 死亡（退休单列，不并入离职 —— B02-DEC-03.15 §七）
      conditions.push(leftRelationInSql('e.employment_relation'));
    } else if (employmentRelation === 'total') {
      // 花名册全员：含退休，否则退休人员会被排除在「总数」之外
      conditions.push(knownRelationInSql('e.employment_relation'));
    }
  } else if (status) {
    // 状态筛选：在职 / 离职以花名册用工关系为权威（与统计卡一致）；待岗 / 返聘按任职状态
    if (status === 'active') {
      conditions.push(`e.employment_relation = '正式员工'`);
    } else if (status === 'left') {
      conditions.push(leftRelationInSql('e.employment_relation'));
    } else if (status === 'retired') {
      // 退休（D1）：新数据以「关系 = 退休」为权威；旧数据可能只有 assignment_status = 'retired'，
      // 两者并集保证「新记录可筛选 + 旧数据读取兼容」。
      conditions.push(
        `(e.employment_relation = '${RELATION.RETIRED}' OR ev.assignment_status = 'retired')`,
      );
    } else {
      conditions.push(`ev.assignment_status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
  } else {
    // 默认（未选状态）仅显示花名册在职：用工关系状态 = 正式员工
    conditions.push(`e.employment_relation = '正式员工'`);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM v_employee_current ev
     JOIN employee e ON e.id = ev.employee_id
     LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
     LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
     WHERE ${whereClause}`,
    params
  );
  const total = countResult.rows[0].total;

  params.push(limitNum, offset);
  const result = await pool.query(
    `SELECT ev.employee_id AS id, ev.employee_code, e.id_card, ev.name, e.gender,
            e.birth_date, e.phone, e.person_category, e.person_type,
            e.is_public_welfare, e.id_address,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(e.birth_date))::int END AS age,
            ea.org_unit_id,
            -- 「部门」列归因口径：乡镇作业中心级组织显示为「xx镇乡镇作业中心」，其余保持 org_name
            CASE WHEN ev.org_type = 'town_center' THEN regexp_replace(ev.org_name, '作业中心$', '乡镇作业中心')
                 ELSE ev.org_name END AS dept_name,
            ou.org_path AS org_path,
            ea.position_id, ev.position_name,
            ${displayStatusSql('e.employment_relation', 'ev.assignment_status')} AS org_status,
            ea.start_date,
            e.leave_date,
            -- 返聘入口资格标记（A-02e.5-D1）：**只读派生布尔**，不落库、不参与写入。
            -- 唯一 true 来源是 employee.employment_relation 去空格后等于「退休」——
            -- 与 employeeAssignmentService.rehireEmployee 的资格判定（String(relation).trim() === '退休'）同源；
            -- 关系为 NULL / 辞职 / 死亡 / 未知值一律 false（COALESCE 保证不会返回 NULL）。
            -- 前端仅据此决定「是否展示返聘入口」，真正的资格校验仍在返聘事务内（FOR UPDATE + 关系权威）。
            -- 复用 RELATION.RETIRED 常量，禁止在此硬编码中文取值。
            (COALESCE(trim(e.employment_relation), '') = '${RELATION.RETIRED}') AS is_retired_relation,
            -- 终态登记入口资格标记（A-02A / B02-DEC-03.34）：**只读派生布尔**，不落库、不参与写入。
            -- 唯一 true 来源是 employee.employment_relation 命中终态原因集合（辞职 / 死亡 / 退休），
            -- 与 employeeAssignmentService.terminateEmployee 的关系闸门同源（同一常量集合）。
            -- 关系为 NULL / 空串 / 未知历史值一律 false（COALESCE 保证不返回 NULL）。
            -- 刻意**不**在此返回 employment_relation 原值：人员编辑弹窗会读取该字段并原样回传，
            -- 一旦出现在列表里，编辑姓名/手机号就会顺带写关系（P0-A1 扩大到高频路径）。
            (COALESCE(${terminalRelationInSql('e.employment_relation')}, false)) AS is_terminal_relation,
            CASE WHEN ev.position_name ILIKE '%驾驶员%' OR ev.position_name ILIKE '%司机%' THEN true ELSE false END AS is_driver,
            ea_sup.supervisor_id AS supervisor_id,
            sup.name AS supervisor_name
     FROM v_employee_current ev
     JOIN employee e ON e.id = ev.employee_id
     LEFT JOIN employee_assignment ea ON ea.employee_id = ev.employee_id AND ea.is_current = true AND ea.is_deleted = false AND ea.is_primary = true
     LEFT JOIN hse_operation_unit opu ON opu.id = ea.operation_unit_id AND opu.is_deleted = false
     LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id AND ou.is_deleted = false
     LEFT JOIN employee_assignment ea_sup ON ev.employee_id = ea_sup.employee_id AND ea_sup.is_primary = true AND ea_sup.is_current = true AND ea_sup.is_deleted = false
     LEFT JOIN employee sup ON ea_sup.supervisor_id = sup.id AND sup.is_deleted = false
     WHERE ${whereClause}
     ORDER BY ea.start_date DESC NULLS LAST
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params
  );

  return { rows: result.rows, total, pageNum, limitNum };
}

// GET /employees/filter-options — 筛选项动态化（提示词-92 任务1）
async function getFilterOptions() {
  const r = await pool.query(`
    SELECT
      (SELECT COALESCE(json_agg(d ORDER BY d), '[]'::json)
       FROM (SELECT DISTINCT ev.org_name AS d
             FROM v_employee_current ev
             JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
             WHERE ev.org_name IS NOT NULL) t) AS departments,
      (SELECT COALESCE(json_agg(p ORDER BY p), '[]'::json)
       FROM (SELECT DISTINCT ev.position_name AS p
             FROM v_employee_current ev
             JOIN employee e ON e.id = ev.employee_id AND e.is_deleted = false
             WHERE ev.position_name IS NOT NULL) t) AS positions
  `);
  const row = r.rows[0] || {};
  return { departments: row.departments || [], positions: row.positions || [] };
}

// GET /employees/stats — 员工统计
async function getEmployeeStats() {
  // 在职/离职口径以「花名册·用工关系状态」为权威
  // 离职 = 辞职 + 死亡；退休单列（B02-DEC-03.15 §七：退休不得误标为离职）
  const ACTIVE_RELATION = `e.employment_relation = '正式员工'`;
  const LEFT_RELATION = leftRelationInSql('e.employment_relation');
  const KNOWN_RELATION = knownRelationInSql('e.employment_relation');

  const [totalResult, typeResult, categoryResult, statusResult, listTotalResult, activeResult, leftResult, overAgeResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM employee WHERE is_deleted = false`),
    pool.query(`SELECT person_type, COUNT(*)::int AS count FROM employee WHERE is_deleted = false AND person_type IS NOT NULL GROUP BY person_type ORDER BY count DESC`),
    pool.query(`SELECT person_category, COUNT(*)::int AS count FROM employee WHERE is_deleted = false AND person_category IS NOT NULL GROUP BY person_category`),
    pool.query(`
      SELECT 
        ${statusLabelSql('ea.status')} AS status,
        COUNT(*)::int AS count 
      FROM employee_assignment ea 
      WHERE ea.is_current = true AND ea.is_deleted = false 
      GROUP BY ea.status
    `),
    pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${KNOWN_RELATION}`),
    pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${ACTIVE_RELATION}`),
    pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${LEFT_RELATION}`),
    pool.query(`SELECT COUNT(*)::int AS n FROM employee e WHERE e.is_deleted = false AND ${ACTIVE_RELATION} AND ${buildOverAgeCondition('e')}`),
  ]);

  return {
    total: totalResult.rows[0].total,
    listTotal: listTotalResult.rows[0].n,
    activeCount: activeResult.rows[0].n,
    leftCount: leftResult.rows[0].n,
    overAgeCount: overAgeResult.rows[0].n,
    byPersonType: typeResult.rows,
    byPersonCategory: categoryResult.rows,
    byOrgStatus: statusResult.rows,
  };
}

// GET /employees/batch — 批量获取员工基础信息（GET query.ids）
async function batchGetEmployees(ids) {
  if (ids === null) return { error: -3, message: 'ids 参数格式错误（需逗号分隔数字或数字数组）' };
  if (ids.length === 0) return { rows: [] };
  if (ids.length > 200) return { error: -4, message: '单次最多查询 200 个 ID' };
  const rows = await fetchEmployeeInfosByIds(ids);
  return { rows };
}

// POST /employees/batch — 批量获取员工基础信息（body { ids }）
async function batchGetEmployeesByBody(ids) {
  if (ids === null) return { error: -3, message: 'ids 参数格式错误（需数字数组或逗号分隔字符串）' };
  if (ids.length === 0) return { rows: [] };
  if (ids.length > 200) return { error: -4, message: '单次最多查询 200 个 ID' };
  const rows = await fetchEmployeeInfosByIds(ids);
  return { rows };
}

// GET /events — 员工事件轮询端点（P0-2）
function getEvents(since) {
  const list = employeeEventService.getEventsSince(since);
  return { events: list, serverTime: Date.now() };
}

// GET /employees/:id/profile — 员工主档案（R1-Phase1 收尾 · 提示词-40 任务 C）
async function getEmployeeProfile(empId) {
  const empResult = await pool.query(
    `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
            e.person_category, e.person_type, e.id_address,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
     FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
    [empId],
  );
  if (empResult.rows.length === 0) return { error: -2, message: '员工不存在' };

  const emp = empResult.rows[0];
  decryptFields(emp, ENCRYPT_FIELDS); // 解密身份证/手机（若已加密）

  const orgResult = await pool.query(
    `SELECT ea.org_unit_id, ea.operation_unit_id, ea.position_id, ea.start_date,
            ${statusLabelSql('ea.status')} AS assignment_status,
            ou.org_name, ou.org_type,
            opu.unit_name, opu.unit_type AS operation_unit_type,
            p.name AS position_name,
            CASE WHEN p.name ILIKE '%驾驶员%' OR p.name ILIKE '%司机%' THEN true ELSE false END AS is_driver
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     LEFT JOIN hse_operation_unit opu ON ea.operation_unit_id = opu.id AND opu.is_deleted = false
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
    [empId],
  );
  const org = orgResult.rows[0] || null;

  const [haz, acc, emg, trn, vio] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM hazards WHERE (checker_id = $1 OR fixer_id = $1) AND is_deleted = false`, [empId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM accidents WHERE handler_id = $1 AND is_deleted = false`, [empId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM emergency_plans WHERE responsible_person_id = $1 AND is_deleted = false`, [empId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM training_records WHERE employee_id = $1 AND is_deleted = false`, [empId]),
    pool.query(`SELECT COUNT(*)::int AS c FROM violation_records WHERE violator_id = $1 AND is_deleted = false`, [empId]),
  ]);

  return {
    profile: {
      id: emp.id,
      employeeCode: emp.employee_code,
      name: emp.name,
      gender: emp.gender,
      age: emp.age,
      idCard: maskIdCard(emp.id_card),
      phone: maskPhone(emp.phone),
      // 注：employee 表无 hire_date 列，入职日期取当前任职 assignment.start_date
      hireDate: org ? formatProfileDate(org.start_date) : null,
      status: org ? org.assignment_status : '未知',
      orgUnitId: org ? org.org_unit_id : null,
      orgName: org ? org.org_name : null,
      orgType: org ? org.org_type : null,
      positionId: org ? org.position_id : null,
      positionName: org ? org.position_name : null,
      operationUnitId: org ? org.operation_unit_id : null,
      unitName: org ? org.unit_name : null,
      isDriver: org ? org.is_driver : false,
      stats: {
        hazardCount: haz.rows[0].c,
        accidentCount: acc.rows[0].c,
        emergencyPlanCount: emg.rows[0].c,
        trainingCount: trn.rows[0].c,
        violationCount: vio.rows[0].c,
      },
    },
  };
}

// 关联业务列表通用分页查询（hazards / accidents / emergency-plans / training / violations）
async function listEmployeeRelated({ empId, query, table, whereCols, selectCols, orderBy, orderExpr }) {
  const pageNum = Math.max(1, parseInt(query.page) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(query.pageSize) || 10), 200);
  const offset = (pageNum - 1) * limitNum;
  const where = whereCols(empId);
  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE ${where}`, [empId]);
  const total = countR.rows[0].total;
  const r = await pool.query(
    `SELECT ${selectCols} FROM ${table} WHERE ${where} ORDER BY ${orderExpr} LIMIT $2 OFFSET $3`,
    [empId, limitNum, offset],
  );
  return { rows: r.rows, total, pageNum, limitNum };
}

// GET /employees/:id/hazards — 隐患记录（checker_id 或 fixer_id）
function listEmployeeHazards(empId, query) {
  return listEmployeeRelated({
    empId, query,
    table: 'hazards',
    whereCols: (id) => `(checker_id = $1 OR fixer_id = $1) AND is_deleted = false`,
    selectCols: 'id, no, hazard_date, category, level, status, checker_id, fixer_id, description',
    orderBy: 'hazard_date',
    orderExpr: 'hazard_date DESC NULLS LAST',
  });
}

// GET /employees/:id/accidents — 事故记录（handler_id）
function listEmployeeAccidents(empId, query) {
  return listEmployeeRelated({
    empId, query,
    table: 'accidents',
    whereCols: (id) => `handler_id = $1 AND is_deleted = false`,
    selectCols: 'id, no, accident_date, accident_type, level, status, handler_id, description',
    orderBy: 'accident_date',
    orderExpr: 'accident_date DESC NULLS LAST',
  });
}

// GET /employees/:id/emergency-plans — 应急预案（responsible_person_id）
function listEmployeeEmergencyPlans(empId, query) {
  return listEmployeeRelated({
    empId, query,
    table: 'emergency_plans',
    whereCols: (id) => `responsible_person_id = $1 AND is_deleted = false`,
    selectCols: 'id, name, type, level, status, responsible_person_id',
    orderBy: 'id',
    orderExpr: 'id DESC',
  });
}

// GET /employees/:id/training — 培训记录（employee_id）
function listEmployeeTraining(empId, query) {
  return listEmployeeRelated({
    empId, query,
    table: 'training_records',
    whereCols: (id) => `employee_id = $1 AND is_deleted = false`,
    selectCols: 'id, name, training_type, training_date, result, score, employee_id',
    orderBy: 'training_date',
    orderExpr: 'training_date DESC NULLS LAST',
  });
}

// GET /employees/:id/violations — 三违记录（violator_id 精确匹配；读源为 violation_records）
function listEmployeeViolations(empId, query) {
  return listEmployeeRelated({
    empId, query,
    table: 'violation_records',
    whereCols: (id) => `violator_id = $1 AND is_deleted = false`,
    selectCols: 'id, no, violation_date, violation_type, status, violator_name AS name, position, description',
    orderBy: 'violation_date',
    orderExpr: 'violation_date DESC NULLS LAST',
  });
}

// GET /employees/:id — 员工详情（含组织关系和年龄）
async function getEmployeeDetail(id) {
  const result = await pool.query(
    `SELECT e.id, e.employee_code, e.id_card, e.name, e.gender, e.birth_date, e.phone,
            e.person_category, e.person_type, e.is_public_welfare, e.id_address, e.created_at, e.updated_at,
            CASE WHEN e.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM age(e.birth_date))::INT ELSE NULL END AS age
     FROM employee e WHERE e.id = $1 AND e.is_deleted = false`,
    [id]
  );
  if (result.rows.length === 0) return { error: -2, message: '员工不存在' };

  const emp = result.rows[0];

  // 查询当前组织关系 - Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
  const orgResult = await pool.query(
    `SELECT ea.id, ea.position_id, ea.start_date, ea.supervisor_id,
            ${statusLabelSql('ea.status')} AS status,
            ou.org_path,
            ou.id AS org_unit_id,
            ou.org_name,
            p.name AS position_name,
            s.name AS supervisor_name
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
    [id]
  );

  emp.org = orgResult.rows[0] || null;
  return { row: emp };
}

// POST /employees — 新增员工（纯身份数据，手动加密 + 哈希）
// Sprint5.1.1: 返回 {row, error}
async function createEmployee(body) {
  const { employee_code, id_card, name, gender, birth_date, phone, person_category, person_type, is_public_welfare, id_address } = body;
  if (!name) return { error: -3, message: '姓名不能为空' };

  // 检查工号唯一性
  if (employee_code) {
    const existCode = await pool.query(`SELECT id FROM employee WHERE employee_code = $1 AND is_deleted = false`, [employee_code]);
    if (existCode.rows.length > 0) return { error: -4, message: '工号已存在' };
  }
  // Sprint5.1.1: 通过 id_card_hash 做唯一性校验（解决 AES-GCM 随机IV不可比较问题）
  const idCardEnc = secureEncode(id_card); // { cipher, hash }
  const phoneEnc = secureEncode(phone);
  if (idCardEnc.hash) {
    const existIdCard = await pool.query(`SELECT id FROM employee WHERE id_card_hash = $1 AND is_deleted = false`, [idCardEnc.hash]);
    if (existIdCard.rows.length > 0) return { error: -4, message: '身份证号已存在' };
  }
  if (phoneEnc.hash) {
    const existPhone = await pool.query(`SELECT id FROM employee WHERE phone_hash = $1 AND is_deleted = false`, [phoneEnc.hash]);
    if (existPhone.rows.length > 0) return { error: -4, message: '手机号已存在' };
  }

  const result = await pool.query(
    `INSERT INTO employee (employee_code, id_card, id_card_hash, name, gender, birth_date, phone, phone_hash, person_category, person_type, is_public_welfare, id_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [employee_code || null, idCardEnc.cipher, idCardEnc.hash, name, gender || null, birth_date || null,
     phoneEnc.cipher, phoneEnc.hash, person_category || null, person_type || null, is_public_welfare || false, id_address || null]
  );
  return { row: result.rows[0], audit: { name, employee_code: employee_code || '-' } };
}

// PUT /employees/:id — 更新员工信息（手动加密 + 哈希唯一性校验）
// Sprint5.1.1: 返回 {row, error}
async function updateEmployee(id, updates) {
  const fields = [];
  const values = [];
  let paramIdx = 1;

  // A-02B（B02-DEC-03.35）普通编辑接口收口：
  // employee.employment_relation 是人员关系权威字段，其变更只能走专用业务闭环
  // （A-02A 终态登记 / B2.2 返聘）。普通编辑请求只要显式携带该字段，
  // 必须在「任何业务更新之前」明确拒绝，不得静默忽略（否则前端会误判关系修改成功）。
  // -4 = 本域既有「业务冲突」拒绝码（与 assignEmployee / terminateEmployee 闸门同源）。
  if (updates && updates.employment_relation !== undefined) {
    return {
      error: -4,
      message: '人员关系（employment_relation）不能通过普通编辑接口修改；如需变更，请使用「终态登记」或「返聘」专用入口。',
    };
  }

  // 工号唯一性检查
  if (updates.employee_code) {
    const existCode = await pool.query(`SELECT id FROM employee WHERE employee_code = $1 AND id != $2 AND is_deleted = false`, [updates.employee_code, id]);
    if (existCode.rows.length > 0) return { error: -4, message: '工号已存在' };
  }
  // Sprint5.1.1: 身份证 + 手机号哈希唯一性校验
  const idCardEnc = secureEncode(updates.id_card);
  const phoneEnc = secureEncode(updates.phone);
  if (idCardEnc.hash) {
    const existIdCard = await pool.query(`SELECT id FROM employee WHERE id_card_hash = $1 AND id != $2 AND is_deleted = false`, [idCardEnc.hash, id]);
    if (existIdCard.rows.length > 0) return { error: -4, message: '身份证号已存在' };
  }
  if (phoneEnc.hash) {
    const existPhone = await pool.query(`SELECT id FROM employee WHERE phone_hash = $1 AND id != $2 AND is_deleted = false`, [phoneEnc.hash, id]);
    if (existPhone.rows.length > 0) return { error: -4, message: '手机号已存在' };
  }

  // 普通字段
  const allowedFields = ['employee_code', 'name', 'gender', 'birth_date', 'person_category', 'person_type', 'is_public_welfare', 'id_address'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${paramIdx++}`);
      values.push(updates[field]);
    }
  }
  // A-02B（B02-DEC-03.35）：employment_relation 的写路径已被函数顶部闸门显式拒绝，
  // 此处不再保留任何写路径——普通编辑无权修改人员关系，避免「白名单静默删除后返回成功」造成误判。
  if (updates.leave_date !== undefined) {
    fields.push(`leave_date = $${paramIdx++}`);
    values.push(updates.leave_date ? String(updates.leave_date).trim() : null);
  }
  // 加密字段：明文 → 密文 + 哈希 同步写入
  if (updates.id_card !== undefined) {
    fields.push(`id_card = $${paramIdx++}`);
    values.push(idCardEnc.cipher);
    fields.push(`id_card_hash = $${paramIdx++}`);
    values.push(idCardEnc.hash);
  }
  if (updates.phone !== undefined) {
    fields.push(`phone = $${paramIdx++}`);
    values.push(phoneEnc.cipher);
    fields.push(`phone_hash = $${paramIdx++}`);
    values.push(phoneEnc.hash);
  }
  if (fields.length === 0) return { error: -3, message: '没有要更新的字段' };

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE employee SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
    values
  );
  if (result.rows.length === 0) return { error: -2, message: '员工不存在或已删除' };

  // P0-2: 发布员工事件（信息变更 → EMPLOYEE_INFO_UPDATED）
  try {
    const changedFields = [];
    for (const f of ['employee_code', 'name', 'gender', 'birth_date', 'person_category', 'person_type', 'is_public_welfare', 'id_address', 'id_card', 'phone']) {
      if (updates[f] !== undefined) changedFields.push(f);
    }
    if (changedFields.length > 0) {
      employeeEventService.publishEmployeeEvent({
        type: 'EMPLOYEE_INFO_UPDATED',
        employeeId: parseInt(id, 10),
        occurredAt: new Date().toISOString(),
        payload: { fields: changedFields },
      });
    }
  } catch (e) {
    console.warn('[hse-employee] 发布 EMPLOYEE_INFO_UPDATED 事件失败:', e.message);
  }

  return { row: result.rows[0], audit: { id, name: updates.name || '' } };
}

// GET /employees/:id/roster-authority — 员工「花名册权威状态」
// 以花名册「用工关系状态」为权威：按 id_card_hash > employee_code > 姓名 定位花名册行
async function getRosterAuthority(id) {
  const target = await pool.query(
    `SELECT id, employee_code, name, id_card_hash, employment_relation, leave_date FROM employee WHERE id = $1 AND is_deleted = false`,
    [id]
  );
  if (target.rows.length === 0) return { error: -2, message: '员工不存在或已删除' };
  const t = target.rows[0];

  // 依次按 id_card_hash > employee_code > 姓名，定位有 employment_relation 的花名册行
  const pick = async (where, params) => {
    const r = await pool.query(
      `SELECT employment_relation, leave_date FROM employee
       WHERE is_deleted = false AND employment_relation IS NOT NULL AND ${where}
       ORDER BY id LIMIT 1`,
      params
    );
    return r.rows[0] || null;
  };
  let authority = null;
  let matchedBy = '';
  if (t.id_card_hash) { authority = await pick(`id_card_hash = $1`, [t.id_card_hash]); if (authority) matchedBy = 'id_card'; }
  if (!authority && t.employee_code) { authority = await pick(`employee_code = $1`, [t.employee_code]); if (authority) matchedBy = 'employee_code'; }
  if (!authority && t.name) { authority = await pick(`name = $1`, [t.name]); if (authority) matchedBy = 'name'; }

  return {
    data: {
      id: t.id,
      found: !!authority,
      matchedBy,
      employment_relation: authority ? authority.employment_relation : t.employment_relation ?? null,
      leave_date: authority ? authority.leave_date : t.leave_date ?? null,
    },
  };
}

// DELETE /employees/:id — 删除员工（软删除，同时结束当前组织关系）
// 【B-1-P1-02-E 事务化】原实现两次独立 pool.query（软删 employee + 关闭任职段），
//   第二次失败会出现"员工已软删但任职段仍 is_current=true"的半更新脏状态。
//   现改为单事务：任一失败整体 ROLLBACK，两步同生共死。
//   保留原语义：end_date = CURRENT_DATE（删除当天即任职终点，不改为 ASG 的 start-1 规则，
//   因为删除无新段 start_date 可对齐）；返回结构不变。
async function deleteEmployee(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) 锁定员工主表记录（与 M1-01/M1-02 一致的锁定入口）
    const empRes = await client.query(
      `SELECT id, name, employment_relation, is_deleted
       FROM employee WHERE id = $1 FOR UPDATE`,
      [id]
    );
    // 2) 锁后确认员工存在且未删除（沿用原有业务返回语义）
    if (empRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在或已删除' };
    }
    const emp = empRes.rows[0];
    if (emp.is_deleted) {
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在或已删除' };
    }

    // 3) 锁后读取权威用工关系：按【现有】员工关系规则，删除不区分 relation
    //    （删除不是离职登记，不得修改 employment_relation，也不得引入新的终态拦截；
    //     §4.1 明确不得自行改变业务含义）。此处仅捕获锁定查询返回的关系值，
    //    供审计 / 下游使用；不作为拦截依据。
    const employmentRelation = emp.employment_relation;

    // 4) 锁定员工后再读取当前有效任职段（冻结口径：is_current=true 且未删除）
    const segRes = await client.query(
      `SELECT id, employee_id, org_unit_id, position_id, status, is_current, is_primary, start_date, end_date
       FROM employee_assignment
       WHERE employee_id = $1 AND is_current = true AND is_deleted = false
       ORDER BY id`,
      [id]
    );
    const currentSegments = segRes.rows; // 0 / 1 / >1

    // 5) 通过统一任职段服务关闭当前任职段：
    //    A=0 不关闭；B=1 校验 rowCount=1；C=>1 抛 SegmentConflictError（调用方转为业务拒绝）。
    //    DELETE 场景：end_date=CURRENT_DATE（数据库语义），不改 status / employment_relation。
    let closed;
    try {
      ({ closed } = await writeSegment(client, {
        employeeId: id,
        scenario: 'DELETE',
        currentSegments,
      }));
    } catch (segErr) {
      if (segErr && segErr.name === 'SegmentConflictError') {
        // C 场景：多条当前段，数据异常 → 业务拒绝 + 回滚（不得抛 500）
        await client.query('ROLLBACK');
        return { error: -3, message: '存在多条当前有效任职段，数据异常，已拒绝删除' };
      }
      // 其他（含 SegmentCloseFailedError）→ 交由外层 catch 统一回滚 + 抛出
      throw segErr;
    }

    // 6) 软删除 employee（仅当任职段关闭成功 / 无当前段后）
    const delRes = await client.query(
      `UPDATE employee SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id, name`,
      [id]
    );
    if (delRes.rows.length === 0) {
      // 防御性：软删除未命中（已被锁保护，理论上不会到这）→ 回滚，不提交
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在或已删除' };
    }

    await client.query('COMMIT');
    return { audit: { id, name: delRes.rows[0].name } };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e; // 显式向上抛出，由路由层统一错误处理；不静默吞掉、不返回伪造成功
  } finally {
    client.release();
  }
}

module.exports = {
  maskIdCard,
  maskPhone,
  formatProfileDate,
  listEmployees,
  getFilterOptions,
  getEmployeeStats,
  batchGetEmployees,
  batchGetEmployeesByBody,
  getEvents,
  getEmployeeProfile,
  listEmployeeHazards,
  listEmployeeAccidents,
  listEmployeeEmergencyPlans,
  listEmployeeTraining,
  listEmployeeViolations,
  getEmployeeDetail,
  createEmployee,
  updateEmployee,
  getRosterAuthority,
  deleteEmployee,
};
