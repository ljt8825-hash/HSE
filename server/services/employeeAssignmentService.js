/**
 * 人员组织关系服务层 - Sprint-C Phase 1
 * 
 * 职责：
 * 1. 封装 employee_assignment 的 CRUD 操作
 * 2. 提供 department → hse_org_unit 的组织映射
 * 3. 统一人员组织关系的数据源
 * 
 * 约束：
 * - 本服务作为 employee_assignment 的唯一写入入口
 * - 禁止直接操作 hse_employee_org（已冻结）
 */

const { pool } = require('../config/db');
// M1-01：统一任职段写入服务（由本模块的三个核心入口在已持有事务 client 的前提下调用）
const { writeSegment } = require('./assignmentSegmentService');
const {
  STATUS_MAP,
  STATUS_REVERSE_MAP,
  TERMINAL_RELATION_VALUES,
  RELATION,
  normalizeStatus,
  normalizeStatusOrDefault,
  isTerminalStatus,
  isTerminalRelation,
  isWritableStatus,
  isActionOnlyStatus,
  toStatusLabel,
  statusLabelSql,
  toHistoryStatusLabel,
} = require('./employeeStatusDict');

// ============================================================
// 常量定义
// ============================================================
// A-02d：状态映射统一收敛到 services/employeeStatusDict.js（唯一事实源）。
// 此处保持 STATUS_MAP / STATUS_REVERSE_MAP 的导出名不变，避免破坏既有消费者。

// ============================================================
// 组织映射函数
// ============================================================

/**
 * 解析 org_unit_id（从 5 列扁平组织到 hse_org_unit）
 * 
 * 策略：
 * 1. 优先使用 team_id（班组级）匹配 hse_org_unit
 * 2. 其次使用 project_id/enterprise_id/region_id/group_id
 * 3. 匹配方式：通过 department.name = hse_org_unit.org_name
 * 
 * @param {Object} client - 数据库连接（支持事务）
 * @param {Object} orgParams - { group_id, region_id, enterprise_id, project_id, team_id }
 * @returns {Promise<{orgUnitId: number|null, orgPath: string|null}>}
 */
async function resolveOrgUnitId(client, orgParams) {
  const { group_id, region_id, enterprise_id, project_id, team_id } = orgParams;
  
  // 按优先级排序：班组 > 项目 > 企业 > 区域 > 集团
  const orgIds = [
    { id: team_id, level: 'team' },
    { id: project_id, level: 'project' },
    { id: enterprise_id, level: 'enterprise' },
    { id: region_id, level: 'region' },
    { id: group_id, level: 'group' },
  ].filter(item => item.id != null);
  
  if (orgIds.length === 0) {
    return { orgUnitId: null, orgPath: null };
  }
  
  // 尝试按优先级匹配
  for (const { id, level } of orgIds) {
    // 方案1：通过 department.id 直接匹配（如果 hse_org_unit 有对应字段）
    // 方案2：通过 department.name 匹配 hse_org_unit.org_name
    const result = await client.query(
      `SELECT ou.id, ou.org_path
       FROM department d
       LEFT JOIN hse_org_unit ou ON ou.org_name = d.name AND ou.is_deleted = false
       WHERE d.id = $1 AND d.is_deleted = false`,
      [id]
    );
    
    if (result.rows.length > 0 && result.rows[0].id) {
      return {
        orgUnitId: result.rows[0].id,
        orgPath: result.rows[0].org_path,
      };
    }
  }
  
  // 如果都匹配不到，返回 null（允许 org_unit_id 为空）
  // 同时构建一个临时的 org_path 用于审计
  const deptIds = [group_id, region_id, enterprise_id, project_id, team_id].filter(Boolean);
  if (deptIds.length > 0) {
    const names = await client.query(
      `SELECT id, name FROM department WHERE id = ANY($1::bigint[]) AND is_deleted = false`,
      [deptIds]
    );
    const nameMap = new Map(names.rows.map(r => [r.id, r.name]));
    const pathParts = [];
    if (group_id && nameMap.has(group_id)) pathParts.push(nameMap.get(group_id));
    if (region_id && nameMap.has(region_id)) pathParts.push(nameMap.get(region_id));
    if (enterprise_id && nameMap.has(enterprise_id)) pathParts.push(nameMap.get(enterprise_id));
    if (project_id && nameMap.has(project_id)) pathParts.push(nameMap.get(project_id));
    if (team_id && nameMap.has(team_id)) pathParts.push(nameMap.get(team_id));
    return { orgUnitId: null, orgPath: pathParts.length > 0 ? '/' + pathParts.join('/') : null };
  }
  
  return { orgUnitId: null, orgPath: null };
}

/**
 * 构建 org_path（从 department 表获取名称）
 * 
 * @param {Object} client - 数据库连接
 * @param {Object} orgParams - { group_id, region_id, enterprise_id, project_id, team_id }
 * @returns {Promise<string|null>}
 */
async function buildOrgPathFromDepartment(client, orgParams) {
  const { group_id, region_id, enterprise_id, project_id, team_id } = orgParams;
  const ids = [group_id, region_id, enterprise_id, project_id, team_id].filter(Boolean);
  
  if (ids.length === 0) return null;
  
  const result = await client.query(
    `SELECT id, name FROM department WHERE id = ANY($1::bigint[]) AND is_deleted = false`,
    [ids]
  );
  
  const map = new Map(result.rows.map(r => [r.id, r.name]));
  const pathParts = [];
  if (group_id && map.has(group_id)) pathParts.push(map.get(group_id));
  if (region_id && map.has(region_id)) pathParts.push(map.get(region_id));
  if (enterprise_id && map.has(enterprise_id)) pathParts.push(map.get(enterprise_id));
  if (project_id && map.has(project_id)) pathParts.push(map.get(project_id));
  if (team_id && map.has(team_id)) pathParts.push(map.get(team_id));
  
  return pathParts.length > 0 ? '/' + pathParts.join('/') : null;
}

// ============================================================
// CRUD 操作
// ============================================================

/**
 * 获取员工当前有效的组织关系
 * 
 * @param {number} employeeId - 员工ID
 * @returns {Promise<Object|null>}
 */
async function getCurrentAssignment(employeeId) {
  const result = await pool.query(
    `SELECT ea.*, 
            ou.org_name, ou.org_path as unit_path,
            p.name as position_name,
            s.name as supervisor_name
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
     WHERE ea.employee_id = $1 
       AND ea.is_current = true 
       AND ea.is_deleted = false`,
    [employeeId]
  );
  return result.rows[0] || null;
}

/**
 * 获取员工组织关系历史
 * 
 * @param {number} employeeId - 员工ID
 * @returns {Promise<Array>}
 */
async function getAssignmentHistory(employeeId) {
  const result = await pool.query(
    `SELECT ea.*, 
            ou.org_name, ou.org_path as unit_path,
            p.name as position_name,
            eh.event_type, eh.event_date, eh.before_status, eh.after_status, eh.remark as history_remark
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     LEFT JOIN employee_history eh ON eh.employee_id = ea.employee_id 
       AND eh.event_date = ea.start_date AND eh.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_deleted = false
     ORDER BY ea.start_date DESC, ea.id DESC`,
    [employeeId]
  );
  return result.rows;
}

/**
 * 结束员工当前组织关系
 * 
 * @param {Object} client - 数据库连接（支持事务）
 * @param {number} employeeId - 员工ID
 * @param {string} endDate - 结束日期 (YYYY-MM-DD)
 * @returns {Promise<number>} - 影响行数
 */
async function endCurrentAssignment(client, employeeId, endDate) {
  const result = await client.query(
    `UPDATE employee_assignment 
     SET is_current = false, end_date = $2, updated_at = NOW()
     WHERE employee_id = $1 AND is_current = true AND is_deleted = false`,
    [employeeId, endDate]
  );
  return result.rowCount;
}

/**
 * 创建新的组织关系
 * 
 * @param {Object} client - 数据库连接（支持事务）
 * @param {Object} params - 参数对象
 * @returns {Promise<Object>} - 新建记录
 */
async function createAssignment(client, params) {
  const {
    employee_id,
    org_unit_id,
    position_id,
    supervisor_id,
    status,
    start_date,
    remark,
    created_by,
  } = params;
  
  // 状态标准化（中文 / 别称 → 存储编码）；空值沿用默认 active
  const normalizedStatus = normalizeStatusOrDefault(status, 'active');
  // §四.9：未知编码不得静默落库
  if (!normalizedStatus || !isWritableStatus(normalizedStatus)) {
    throw new Error(`createAssignment: 无法识别的任职状态「${status}」，可选: 在职/待岗/借调/停薪留职/离职/辞职/死亡/退休/返聘`);
  }
  
  const result = await client.query(
    `INSERT INTO employee_assignment (
      employee_id, org_unit_id, position_id, supervisor_id,
      status, is_current, is_primary, start_date, remark, created_by
    ) VALUES ($1, $2, $3, $4, $5, true, true, $6, $7, $8)
    RETURNING *`,
    [
      employee_id,
      org_unit_id || null,
      position_id || null,
      supervisor_id || null,
      normalizedStatus,
      start_date,
      remark || null,
      created_by || null,
    ]
  );
  
  return result.rows[0];
}

/**
 * 更新组织关系状态
 * 
 * @param {Object} client - 数据库连接（支持事务）
 * @param {number} assignmentId - assignment ID
 * @param {string} newStatus - 新状态
 * @param {string} endDate - 结束日期（终态时使用）
 * @returns {Promise<Object>} - 更新后的记录
 */
async function updateAssignmentStatus(client, assignmentId, newStatus, endDate = null) {
  // 状态标准化（中文 / 别称 → 存储编码）
  const normalizedStatus = normalizeStatus(newStatus);
  if (!normalizedStatus || !isWritableStatus(normalizedStatus)) {
    throw new Error(`updateAssignmentStatus: 无法识别的任职状态「${newStatus}」`);
  }

  // 终态：inactive（辞职/死亡/退休的新业务统一编码）+ retired（历史兼容值）
  const isTerminal = isTerminalStatus(normalizedStatus);
  
  const result = await client.query(
    `UPDATE employee_assignment 
     SET status = $2, 
         is_current = ${isTerminal ? 'false' : 'is_current'},
         end_date = ${isTerminal ? '$3' : 'end_date'},
         updated_at = NOW()
     WHERE id = $1 AND is_deleted = false
     RETURNING *`,
    isTerminal 
      ? [assignmentId, normalizedStatus, endDate]
      : [assignmentId, normalizedStatus]
  );
  
  return result.rows[0];
}

/**
 * 根据旧模型 ID 查找对应的 assignment
 * 用于状态变更接口的兼容处理
 * 
 * @param {Object} client - 数据库连接
 * @param {number} employeeId - 员工ID
 * @returns {Promise<Object|null>}
 */
async function findCurrentAssignmentByEmployeeId(client, employeeId) {
  const result = await client.query(
    `SELECT * FROM employee_assignment 
     WHERE employee_id = $1 AND is_current = true AND is_deleted = false`,
    [employeeId]
  );
  return result.rows[0] || null;
}

// ============================================================
// 业务编排（自 hse-employee/assignment.js route 迁移，行为逐字节不变）
// ============================================================

/**
 * 获取员工当前组织关系（详情视图，含状态中文映射）
 * 对应 GET /org/employee/:employeeId
 * @param {number} employeeId
 * @returns {Promise<{row: Object|null}>} row 为 null 表示无当前组织关系
 */
async function getCurrentAssignmentDetail(employeeId) {
  const result = await pool.query(
    `SELECT ea.id, ea.employee_id, ea.position_id, ea.start_date, ea.end_date,
            ea.supervisor_id, 
            ${statusLabelSql('ea.status')} AS status,
            ea.status AS status_code,
            ea.is_current, ea.remark AS change_reason,
            -- A-02A：终态登记弹窗需要展示「当前人员关系」，因此只读返回权威关系原值。
            -- 该字段仅用于展示，写入一律走 POST /org/terminate（本查询无任何写副作用）。
            e.employment_relation,
            e.name AS employee_name,
            ou.id AS org_unit_id,
            ou.org_path,
            ou.org_name,
            p.name AS position_name,
            s.name AS supervisor_name
     FROM employee_assignment ea
     LEFT JOIN employee e ON e.id = ea.employee_id
     LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     LEFT JOIN employee s ON ea.supervisor_id = s.id AND s.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
    [employeeId]
  );
  return { row: result.rows[0] || null };
}

/**
 * 获取员工组织关系历史（详情视图，含状态中文映射 + 人事变动关联）
 * 对应 GET /org/employee/:employeeId/history
 * @param {number} employeeId
 * @returns {Promise<Array>}
 */
async function getAssignmentHistoryDetail(employeeId) {
  const result = await pool.query(
    `SELECT ea.id, ea.position_id, ea.start_date, ea.end_date,
            ${statusLabelSql('ea.status')} AS status,
            ea.is_current, ea.remark AS change_reason, ea.created_at,
            ou.org_path,
            p.name AS position_name,
            eh.event_type, eh.event_date, eh.before_status, eh.after_status,
            eh.approval_no, eh.remark
     FROM employee_assignment ea
     LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     LEFT JOIN position p ON ea.position_id = p.id AND p.is_deleted = false
     LEFT JOIN employee_history eh ON eh.employee_id = ea.employee_id AND eh.event_date = ea.start_date AND eh.is_deleted = false
     WHERE ea.employee_id = $1 AND ea.is_deleted = false
     ORDER BY ea.start_date DESC, ea.id DESC`,
    [employeeId]
  );
  return result.rows;
}

// ============================================================
// A-02e.5-B1（P0）：普通分配入口的终态防复活闸门
// ============================================================

/**
 * 业务状态冲突错误码。
 * 与 B02-DEC-03.22 §Batch B 验收口径（「终态人调岗 ⇒ 返回 -4 且零写入」）保持一致。
 */
const BIZ_CONFLICT = -4;

/**
 * 判定「权威用工关系」是否允许走普通分配（调岗/入职）入口。
 *
 * 判定依据【只能是】employee.employment_relation —— 人员关系的唯一权威字段
 * （见 employeeStatusDict.js 文件头 §1、§11）。明确禁止用下列间接信息推断终态：
 *   - employee_assignment.status（段状态不是关系事实，DICT §12）；
 *   - 「存在已关闭的终态段」「无 is_current=true 段」等历史任职记录形态；
 *   - 姓名、统计结果、前端展示值。
 *
 * 取值处置：
 *   - 辞职 / 死亡 / 退休（TERMINAL_RELATION_VALUES）→ 拒绝；
 *   - NULL / 空串 → 允许（= 待核实，不推断、不补值）；
 *   - 正式员工 / 待岗（历史兼容值）/ 其它历史遗留值 → 允许
 *     （无证据不得判定为终态；未知值的治理属数据治理事项，不在本闸门内猜测）。
 *
 * @param {string|null|undefined} relation - employee.employment_relation 原值
 * @returns {{ok: true} | {ok: false, message: string}}
 */
function checkRelationAllowsAssignment(relation) {
  if (relation == null) return { ok: true };
  const value = String(relation).trim();
  if (!value) return { ok: true };
  if (!TERMINAL_RELATION_VALUES.includes(value)) return { ok: true };
  return {
    ok: false,
    message: `员工用工关系为「${value}」，属于终态，禁止通过调岗/分配入口重新建立任职记录；`
      + '退休人员请使用返聘流程（POST /api/hse/employee/org/rehire），'
      + '辞职/死亡不适用返聘，如需恢复须先由人事处理用工关系。',
  };
}

/**
 * 调岗/分配组织关系（核心事务）
 * 对应 POST /org/assign：结束当前关系 → 新增关系 → 记录 employee_history
 * 事件发布在 COMMIT 之后执行（fire-and-forget，失败仅告警不影响主流程）
 * @param {Object} params
 * @returns {Promise<{error?: number, message?: string, responseData?: Object, eventType?: string, employeeName?: string}>}
 */
async function assignEmployee(params) {
  const {
    employee_id, group_id, region_id, enterprise_id, project_id, team_id,
    position_id, start_date, supervisor_id, change_reason, remark, userId,
  } = params;

  if (!employee_id) return { error: -3, message: '员工ID不能为空' };
  if (!start_date) return { error: -3, message: '开始日期不能为空' };

  // 验证员工存在，并读取权威关系字段（终态闸门的唯一判定依据）
  const empResult = await pool.query(
    `SELECT id, name, employment_relation FROM employee WHERE id = $1 AND is_deleted = false`,
    [employee_id]
  );
  if (empResult.rows.length === 0) return { error: -2, message: '员工不存在' };

  // A-02e.5-B1（P0）：终态闸门。
  // 位置刻意选在 pool.connect()/BEGIN 之前：拒绝时【不取连接、不开事务、不写任何表、不发事件】，
  // 「零副作用」因而可被直接断言（见 __tests__/employee-assignment-terminal-guard.unit.test.js），
  // 比「事务内校验 + ROLLBACK」更强（后者仍会产生一次连接与一次回滚）。
  const relationGuard = checkRelationAllowsAssignment(empResult.rows[0].employment_relation);
  if (!relationGuard.ok) {
    return { error: BIZ_CONFLICT, message: relationGuard.message };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // A-02B（B02-DEC-03.35）并发栅栏：事务内再次锁定员工行并复核关系。
    // 原关系闸门在 BEGIN 之前（零副作用快拒），但「闸门 → BEGIN」之间存在竞争窗口：
    // 若 terminateEmployee 在此期间 FOR UPDATE 锁员工并改关系为终态后提交，
    // 本函数 BEGIN 后不会重锁员工、不会再复核关系，会继续为「已终态人员」新建 active 任职段，
    // 造成 employment_relation(终态) 与 is_current=true active 任职段不一致。
    // 故在事务内再次 FOR UPDATE 锁员工并复核——与 terminateEmployee 锁序一致（先员工后段），
    // 二者因此被串行化：谁先拿到员工行锁谁先执行，后者重读到的必是已提交的终态关系。
    const txEmpResult = await client.query(
      `SELECT id, name, employment_relation FROM employee WHERE id = $1 FOR UPDATE`,
      [employee_id]
    );
    if (txEmpResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在' };
    }
    const txRelationGuard = checkRelationAllowsAssignment(txEmpResult.rows[0].employment_relation);
    if (!txRelationGuard.ok) {
      await client.query('ROLLBACK');
      return { error: BIZ_CONFLICT, message: txRelationGuard.message };
    }

    // 查询当前组织关系（从 employee_assignment）
    const currentOrgResult = await client.query(
      `SELECT ea.id, ea.org_unit_id, ea.position_id, ea.start_date, ea.status,
              ou.org_path
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id
       WHERE ea.employee_id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
      [employee_id]
    );

    let beforeOrgUnitId = null;
    let beforePositionId = null;
    let beforeStatus = null;
    if (currentOrgResult.rows.length > 0) {
      const currentOrg = currentOrgResult.rows[0];
      beforeOrgUnitId = currentOrg.org_unit_id;
      beforePositionId = currentOrg.position_id;
      beforeStatus = currentOrg.status;
    }

    // 解析 org_unit_id（从 5 列扁平组织映射到 hse_org_unit）
    const { orgUnitId, orgPath } = await resolveOrgUnitId(client, {
      group_id, region_id, enterprise_id, project_id, team_id,
    });

    // M1-01：统一任职段写入。事务由本函数持有（已在 BEGIN 之后），writeSegment 不另起事务/连接。
    // 关闭谓词沿用 assignEmployee 历史口径（仅按 id 关闭，endDate = 新段生效日-1）；
    // 当前段数量保护（A=0 放行 / B=1 关段并校验 rowCount / C=>1 拒绝）由 writeSegment 统一执行。
    const endDate = new Date(start_date);
    endDate.setDate(endDate.getDate() - 1);
    const segmentEndDate = endDate.toISOString().split('T')[0];

    let writeResult;
    try {
      writeResult = await writeSegment(client, {
        employeeId: employee_id,
        scenario: 'ASSIGN',
        currentSegments: currentOrgResult.rows,
        newSegment: {
          employee_id,
          org_unit_id: orgUnitId,
          position_id: position_id || null,
          supervisor_id: supervisor_id || null,
          status: 'active',
          start_date,
          remark: change_reason || '调岗',
          created_by: userId || null,
        },
        endDate: segmentEndDate,
      });
    } catch (e) {
      // C 场景（多条当前段）：转化为业务冲突错误返回，不抛 500
      if (e && e.name === 'SegmentConflictError') {
        await client.query('ROLLBACK');
        return { error: BIZ_CONFLICT, message: e.message };
      }
      // 其余异常（如 B rowCount 不符）交由外层 catch 统一回滚
      throw e;
    }

    const newOrgResult = { rows: writeResult.inserted ? [writeResult.inserted] : [] };

    // 记录人事变动
    const eventType = currentOrgResult.rows.length === 0 ? '入职' : '调岗';
    await client.query(
      `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '在职', $9, $10)`,
      [employee_id, eventType, start_date, beforeOrgUnitId, orgUnitId, beforePositionId, position_id || null, beforeStatus, remark || null, userId || null]
    );

    await client.query('COMMIT');

    // P0-2: 发布员工事件（调岗/入职 → EMPLOYEE_TRANSFERRED）
    try {
      const employeeEventService = require('./employeeEventService');
      employeeEventService.publishEmployeeEvent({
        type: 'EMPLOYEE_TRANSFERRED',
        employeeId: employee_id,
        occurredAt: new Date().toISOString(),
        payload: {
          fromOrgUnitId: beforeOrgUnitId,
          toOrgUnitId: orgUnitId,
          fromPositionId: beforePositionId,
          toPositionId: position_id || null,
          changeReason: change_reason || eventType,
        },
      });
    } catch (e) {
      console.warn('[hse-employee] 发布 EMPLOYEE_TRANSFERRED 事件失败:', e.message);
    }

    // 构建响应（保持原有响应结构）
    const responseData = {
      id: newOrgResult.rows[0].id,
      employee_id: employee_id,
      org_unit_id: orgUnitId,
      org_path: orgPath,
      position_id: position_id || null,
      start_date: start_date,
      supervisor_id: supervisor_id || null,
      status: '在职',
      is_current: true,
      change_reason: change_reason || '调岗',
    };
    return { responseData, eventType, employeeName: empResult.rows[0].name };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// A-02e.5-B2.2：返聘正向出口（独立业务动作，不是状态变更）
// ============================================================
// 规则依据：B02-DEC-03.22 §4（RH-01~RH-09）+ B02-DEC-03.26 §2/§3。
// 与 assignEmployee（调岗）的边界：调岗的语义是「在职人员换组织」，返聘的语义是
// 「终态人员重新建立用工关系」，后者必须同时改关系、建段、写历史，因此独立入口。

/** 返聘新段的任职状态编码（DICT 已有值，不得新增编码） */
const REHIRE_SEGMENT_STATUS = 'reinstated';

/**
 * 严格日期字面量校验（YYYY-MM-DD）。
 * DT-02：返聘生效日期是【业务日期】，必须显式传入；禁止 CURRENT_DATE / NOW() / 前端预填系统日兜底。
 * @param {*} value
 * @returns {boolean}
 */
function isIsoDateString(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === v;
}

/** pg 的 DATE 可能返回 Date 对象或字符串，统一成 YYYY-MM-DD，避免时区偏移参与比较 */
function toDateString(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const v = String(value).trim();
  return v ? v.slice(0, 10) : null;
}

/**
 * 返聘资格不满足时的文案。
 * 只按 employee.employment_relation 的真实取值分支；不读取任职段形态、不推断、不补值。
 * @param {string} relation - 已 trim 的关系原值（空串表示 NULL / 空白）
 * @returns {string}
 */
function rehireRejectMessage(relation) {
  if (!relation) {
    return '员工用工关系为空（待核实），无法确认其处于「退休」终态，禁止返聘；'
      + '请先由人事核实并登记用工关系，不得由返聘流程代为推断或补值。';
  }
  if (relation === RELATION.FORMAL) {
    return '员工当前用工关系为「正式员工」，并非退休终态，无需返聘；'
      + '如需调整组织请使用调岗入口（POST /api/hse/employee/org/assign）。';
  }
  if (relation === RELATION.RESIGNED || relation === RELATION.DECEASED) {
    return `员工用工关系为「${relation}」，不属于可返聘的终态；返聘仅适用于「退休」人员。`;
  }
  return `员工用工关系为「${relation}」，不属于可返聘的退休终态（仅「退休」可返聘）。`;
}

/**
 * 返聘（核心事务）—— A-02e.5-B2.2
 * 对应 POST /org/rehire：校验资格 → 重置用工关系 → 新建任职段 → 写返聘历史 → 发事件
 *
 * 事务边界：单个 client + BEGIN/COMMIT，任一写失败整体 ROLLBACK。
 * 写入顺序（固定，测试断言之）：
 *   1) SELECT employee ... FOR UPDATE      —— 锁行 + 读权威关系（并发/重复返聘串行化）
 *   2) SELECT employee_assignment (is_current=true)  —— 有则判数据异常，直接拒绝
 *   3) SELECT employee_assignment (最新一条)         —— 旧终态段，只读，不修改
 *   4) SELECT hse_org_unit / resolveOrgUnitId        —— 解析目标组织（新段必须可归属）
 *   5) UPDATE employee SET employment_relation='正式员工'
 *   6) INSERT employee_assignment (status='reinstated', is_current=true, is_primary=true, start_date=D)
 *   7) INSERT employee_history (event_type='返聘', event_date=D, before_status='退休', after_status='返聘')
 *   8) COMMIT → 发布 EMPLOYEE_REHIRED（内存事件，失败仅告警；持久留痕由 5/6/7 与审计日志承担）
 *
 * 明确不做：不修改/不重开/不删除旧终态段；不写 employment_relationship_status（死列）；
 *          不给 employment_relation 增加「返聘」取值；不接受客户端指定操作者身份（只认入参 userId）。
 *
 * @param {Object} params
 * @param {number} params.employee_id
 * @param {string} params.start_date 业务生效日 YYYY-MM-DD（必填）
 * @param {number} [params.org_unit_id] 目标组织（或由 team_id 等 5 列扁平组织解析）
 * @param {number} [params.position_id]
 * @param {number} [params.supervisor_id]
 * @param {string} [params.change_reason]
 * @param {string} [params.remark]
 * @param {number|null} [params.userId] 服务端操作者（来自 req.user，不接受客户端指定）
 * @returns {Promise<{error?: number, message?: string, responseData?: Object, eventType?: string, employeeName?: string, audit?: Object}>}
 */
async function rehireEmployee(params) {
  const {
    employee_id, org_unit_id, group_id, region_id, enterprise_id, project_id, team_id,
    position_id, supervisor_id, start_date, change_reason, remark, userId,
  } = params || {};

  if (!employee_id) return { error: -3, message: '员工ID不能为空' };
  if (!start_date) {
    return { error: -3, message: '返聘生效日期不能为空（业务日期必须显式传入，禁止用系统日期代替）' };
  }
  if (!isIsoDateString(start_date)) {
    return { error: -3, message: `返聘生效日期格式非法「${start_date}」，必须为 YYYY-MM-DD` };
  }
  const effectiveDate = String(start_date).trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1) 锁行 + 读权威关系 ──────────────────────────────────
    const empResult = await client.query(
      `SELECT id, name, employment_relation FROM employee
       WHERE id = $1 AND is_deleted = false FOR UPDATE`,
      [employee_id]
    );
    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在' };
    }
    const employee = empResult.rows[0];
    const relation = employee.employment_relation == null
      ? ''
      : String(employee.employment_relation).trim();

    // ── 2) 资格判定：只有「退休」可返聘 ───────────────────────
    if (relation !== RELATION.RETIRED) {
      await client.query('ROLLBACK');
      return { error: BIZ_CONFLICT, message: rehireRejectMessage(relation) };
    }

    // ── 3) 现有任职段：只识别异常，不自动修复 ──────────────────
    const currentResult = await client.query(
      `SELECT id, status FROM employee_assignment
       WHERE employee_id = $1 AND is_current = true AND is_deleted = false`,
      [employee_id]
    );
    if (currentResult.rows.length > 0) {
      await client.query('ROLLBACK');
      const ids = currentResult.rows.map((r) => r.id).join(',');
      return {
        error: BIZ_CONFLICT,
        message: `员工仍有 ${currentResult.rows.length} 条 is_current=true 的任职段（ID=${ids}），`
          + '与「退休」关系矛盾，属数据异常；返聘不自动关闭、不覆盖既有任职段，请先人工核实。',
      };
    }

    const prevResult = await client.query(
      `SELECT id, status, org_unit_id, position_id, start_date, end_date
       FROM employee_assignment
       WHERE employee_id = $1 AND is_deleted = false
       ORDER BY start_date DESC, id DESC
       LIMIT 1`,
      [employee_id]
    );
    if (prevResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: '员工无任何历史任职段，与「退休」关系矛盾，属数据异常；'
          + '返聘需要可追溯的原终态段，禁止在历史缺失的情况下直接建段，请先人工核实。',
      };
    }
    const prev = prevResult.rows[0];
    const prevStart = toDateString(prev.start_date);
    const prevEnd = toDateString(prev.end_date);

    // ── 3b) 时间轴：新段生效日必须晚于旧段 ────────────────────
    if (prevStart && prevEnd && prevEnd < prevStart) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: `原任职段时间轴倒挂（start_date=${prevStart} > end_date=${prevEnd}，段ID=${prev.id}），`
          + '属数据异常；返聘不修改旧段，请先人工核实。',
      };
    }
    const boundary = prevEnd || prevStart;
    if (boundary && effectiveDate <= boundary) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: `返聘生效日期（${effectiveDate}）必须晚于原任职段${prevEnd ? '结束日期' : '开始日期'}（${boundary}），`
          + '否则新旧任职段在时间轴上重叠。',
      };
    }

    // ── 4) 解析目标组织（新段必须可归属，否则列表/统计无归属）──
    let resolvedOrgUnitId = null;
    let orgPath = null;
    if (org_unit_id != null && String(org_unit_id).trim() !== '') {
      const orgResult = await client.query(
        `SELECT id, org_path FROM hse_org_unit WHERE id = $1 AND is_deleted = false`,
        [org_unit_id]
      );
      if (orgResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: -3, message: `目标组织不存在或已删除（org_unit_id=${org_unit_id}）` };
      }
      resolvedOrgUnitId = orgResult.rows[0].id;
      orgPath = orgResult.rows[0].org_path;
    } else {
      const resolved = await resolveOrgUnitId(client, {
        group_id, region_id, enterprise_id, project_id, team_id,
      });
      resolvedOrgUnitId = resolved.orgUnitId;
      orgPath = resolved.orgPath;
    }
    if (!resolvedOrgUnitId) {
      await client.query('ROLLBACK');
      return {
        error: -3,
        message: '返聘必须指定目标组织（org_unit_id 或 team_id/project_id 等组织参数），'
          + '否则新任职段无法归属部门，会破坏列表与统计口径。',
      };
    }

    // ── 5) 关系：权威字段重置为「正式员工」（RH-04）────────────
    // 只写 employment_relation；不写 employment_relationship_status（历史死列，A-02e.5-B2.1 §6）
    const relUpdate = await client.query(
      `UPDATE employee SET employment_relation = $2, updated_at = NOW()
       WHERE id = $1 AND is_deleted = false`,
      [employee_id, RELATION.FORMAL]
    );
    if (relUpdate.rowCount === 0) {
      // 已 FOR UPDATE 锁行，理论上不可达；显式判 0 行以防「UPDATE 未命中仍继续建段」
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在或已删除，用工关系未更新' };
    }

    // ── 6) 新段（RH-03 四字段一致性）──────────────────────────
    // M1-01：统一任职段写入。rehire 不关闭既有段（入口已在步骤3 拒绝「存在当前段」），
    //        故 currentSegments 传 []（A 场景：仅新建），由 writeSegment 统一校验/插入。
    const segmentResult = await writeSegment(client, {
      employeeId: employee_id,
      scenario: 'REHIRE',
      currentSegments: [], // rehire 已先行拒绝「存在 is_current 段」，此处必为空
      newSegment: {
        employee_id,
        org_unit_id: resolvedOrgUnitId,
        position_id: position_id || null,
        supervisor_id: supervisor_id || null,
        status: REHIRE_SEGMENT_STATUS,
        start_date: effectiveDate,
        remark: change_reason || '返聘',
        created_by: userId || null,
      },
    });
    if (!segmentResult.inserted) {
      throw new Error('返聘失败：新任职段未创建');
    }
    const newAssignmentId = segmentResult.inserted.id;

    // ── 7) 历史（event_date 必须等于新段 start_date，否则现有历史查询关联不上）──
    // getAssignmentHistory / getAssignmentHistoryDetail 以 eh.event_date = ea.start_date 关联，
    // 因此 event_date 与 start_date 必须同源同日；不得用 NOW() 或任意复用旧日期凑关联。
    await client.query(
      `INSERT INTO employee_history (
         employee_id, event_type, event_date, before_dept_id, after_dept_id,
         before_position_id, after_position_id, before_status, after_status, remark, approver_id
       ) VALUES ($1, '返聘', $2, $3, $4, $5, $6, $7, '返聘', $8, $9)`,
      [
        employee_id, effectiveDate, prev.org_unit_id || null, resolvedOrgUnitId,
        prev.position_id || null, position_id || null, RELATION.RETIRED,
        remark || null, userId || null,
      ]
    );

    await client.query('COMMIT');

    // ── 8) 事件（COMMIT 之后；失败仅告警，不回滚已完成事务）────
    try {
      const employeeEventService = require('./employeeEventService');
      employeeEventService.publishEmployeeEvent({
        type: 'EMPLOYEE_REHIRED',
        employeeId: employee_id,
        occurredAt: new Date().toISOString(),
        payload: {
          fromRelation: RELATION.RETIRED,
          toRelation: RELATION.FORMAL,
          fromStatus: toStatusLabel(prev.status),
          toStatus: '返聘',
          toStatusCode: REHIRE_SEGMENT_STATUS,
          effectiveDate,
          previousAssignmentId: prev.id,
          newAssignmentId,
          orgUnitId: resolvedOrgUnitId,
          positionId: position_id || null,
        },
      });
    } catch (e) {
      console.warn('[hse-employee] 发布 EMPLOYEE_REHIRED 事件失败:', e.message);
    }

    const responseData = {
      id: newAssignmentId,
      employee_id,
      org_unit_id: resolvedOrgUnitId,
      org_path: orgPath,
      position_id: position_id || null,
      start_date: effectiveDate,
      supervisor_id: supervisor_id || null,
      status: '返聘',
      status_code: REHIRE_SEGMENT_STATUS,
      is_current: true,
      is_primary: true,
      employment_relation: RELATION.FORMAL,
      change_reason: change_reason || '返聘',
      previous_assignment_id: prev.id,
    };

    return {
      responseData,
      eventType: '返聘',
      employeeName: employee.name,
      audit: {
        employeeId: employee_id,
        fromRelation: relation,
        toRelation: RELATION.FORMAL,
        effectiveDate,
        previousAssignmentId: prev.id,
        newAssignmentId,
      },
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 人员状态变更（待岗/复岗/离职/退休）
 * 对应 PUT /org/:id/status：更新状态 → 记录 employee_history
 * 事件发布在 COMMIT 之后执行
 * @param {Object} params { id, status, event_date, remark, userId }
 * @returns {Promise<{error?: number, message?: string, audit?: Object}>}
 */
async function changeAssignmentStatus(params) {
  const { id, status, event_date, remark, userId } = params;
  // A-02d：接受口语/书面业务语义（含辞职、死亡），统一归一到存储编码
  // A-02e.5-B2.2：「返聘」已从白名单移除 —— 它不是状态变更，而是独立业务动作（见 rehireEmployee）
  const validStatuses = ['在职', '待岗', '借调', '停薪留职', '离职', '辞职', '死亡', '退休'];
  const normalizedStatus = normalizeStatus(status);
  // A-02e.5-B2.2：reinstated 只能由返聘动作写入。此处显式拒绝（而不是落到 -3「无效状态」），
  // 因为入参在业务上是「合法状态名」，只是走错了接口；-3 会误导调用方去改参数名。
  if (isActionOnlyStatus(normalizedStatus)) {
    return {
      error: BIZ_CONFLICT,
      message: '「返聘」不是状态变更动作，本接口不再支持；请使用返聘流程 POST /api/hse/employee/org/rehire'
        + '（该流程在同一事务内创建新任职段、重置用工关系并写入返聘历史）。',
    };
  }
  if (!validStatuses.includes(status) || !normalizedStatus || !isWritableStatus(normalizedStatus)) {
    return { error: -3, message: `无效状态，可选: ${validStatuses.join('/')}` };
  }
  if (!event_date) return { error: -3, message: '事件日期不能为空' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 查询当前组织关系
    const orgResult = await client.query(
      `SELECT ea.id, ea.employee_id, ea.status, ea.position_id, ea.org_unit_id, ou.org_path
       FROM employee_assignment ea
       LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
       WHERE ea.id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
      [id]
    );
    if (orgResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: -2, message: '组织关系不存在或非当前记录' };
    }

    const org = orgResult.rows[0];
    const beforeStatus = toStatusLabel(org.status);

    // 更新状态
    // 终态判定必须基于【归一后的编码】，而不是中文入参字面量：
    // 否则新增的「辞职 / 死亡」（→ inactive）会漏掉 is_current / end_date 处理（A-02d §四.3）。
    if (isTerminalStatus(normalizedStatus)) {
      // 终态（inactive / 历史 retired）：结束当前任职段
      await client.query(
        `UPDATE employee_assignment SET status = $2, is_current = false, end_date = $3, updated_at = NOW() WHERE id = $1`,
        [id, normalizedStatus, event_date]
      );
    } else {
      // 中间态（待岗 / 借调 / 停薪留职）与在职 / 返聘：只改状态，
      // 不得仅因状态名称而自动关闭任职段（A-02d §四.4）
      await client.query(
        `UPDATE employee_assignment SET status = $2, updated_at = NOW() WHERE id = $1`,
        [id, normalizedStatus]
      );
    }

    // 映射状态到事件类型（人事事件标签，独立于 status 编码；原因权威仍为 employment_relation）
    // 注：'返聘' 键已不可达（该入参在函数入口被 -4 拒绝，见 A-02e.5-B2.2），
    //     保留仅为历史事件标签映射的完整性，不构成返聘写入口。
    const eventMap = {
      '待岗': '待岗', '借调': '借调', '停薪留职': '停薪留职',
      '离职': '离职', '辞职': '辞职', '死亡': '死亡', '退休': '退休', '返聘': '返聘',
    };
    let eventType;
    if (status === '在职' && beforeStatus === '待岗') {
      eventType = '复岗';
    } else {
      eventType = eventMap[status] || '状态变更';
    }

    // 记录人事变动（使用 org_unit_id）
    // D2：after_status 保留【终态原因】语义（辞职 / 死亡 / 退休 原样写入），
    //     否则三种原因都会被归一成「离职」，与同记录的 event_type 相互矛盾、
    //     历史事件失去原因可辨性。非终态值仍走编码 → 中文标签。
    //     历史旧记录不做批量改写（旧值保持原样语义）。
    await client.query(
      `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9)`,
      [org.employee_id, eventType, event_date, org.org_unit_id, org.position_id, beforeStatus, toHistoryStatusLabel(status, normalizedStatus), remark || null, userId || null]
    );

    await client.query('COMMIT');

    // P0-2: 发布员工事件（离职/辞职/死亡 → EMPLOYEE_RESIGNED，其他 → EMPLOYEE_STATUS_CHANGED）
    try {
      const employeeEventService = require('./employeeEventService');
      const resignedLabels = ['离职', '辞职', '死亡'];
      const eventTypeForEvent = resignedLabels.includes(status) ? 'EMPLOYEE_RESIGNED' : 'EMPLOYEE_STATUS_CHANGED';
      employeeEventService.publishEmployeeEvent({
        type: eventTypeForEvent,
        employeeId: org.employee_id,
        occurredAt: new Date().toISOString(),
        payload: {
          fromStatus: beforeStatus,
          // D2：与 employee_history.after_status 同源，保留终态原因（辞职 / 死亡 / 退休），
          // 避免事件层把三种原因统一呈现为「离职」。
          toStatus: toHistoryStatusLabel(status, normalizedStatus),
          toStatusCode: normalizedStatus,
        },
      });
    } catch (e) {
      console.warn('[hse-employee] 发布 STATUS 事件失败:', e.message);
    }

    return { audit: { employeeId: org.employee_id, beforeStatus, status, statusCode: normalizedStatus } };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// 终态登记（A-02A / B02-DEC-03.34）
// ============================================================
// 与 changeAssignmentStatus（PUT /org/:id/status）的边界：
//   后者是「任职段状态切换」，以 employee_assignment.id 为入参，业务上还可能只改段（如待岗/借调），
//   本函数是「人员出现终态事实」的专用业务动作，以 employee_id 为入参，
//   必须在同一事务内完成【关系权威写入 + 任职段关闭 + 人事历史 + 持久审计】四件事。
//   二者不合并：合并会让「待岗/复岗」这类高频段操作也背上人事终态事务。

/**
 * 可登记的终态类型 → 权威用工关系取值。
 * 三者一一对应，**不存在**笼统的「离职」关系值（业务规则 §3.2）。
 * 之所以显式建表而不是复用 status 归一：employment_relation 是独立维度，不得由状态编码反推。
 */
const TERMINATION_RELATION_MAP = Object.freeze({
  '辞职': RELATION.RESIGNED,
  '死亡': RELATION.DECEASED,
  '退休': RELATION.RETIRED,
});

/**
 * 终态关闭任职段时写入的段状态编码。
 * DICT 的既有约定：新业务终态统一走 inactive（retired 仅为历史数据兼容保留，不再新写入）。
 * 终态【原因】由 employment_relation + employee_history.event_type/after_status 承载。
 */
const TERMINATION_SEGMENT_STATUS = 'inactive';

/**
 * 终态登记（核心事务）—— A-02A
 * 对应 POST /org/terminate：关系权威写入 → 关闭当前有效任职段 → 人事历史 → 持久审计
 *
 * 事务边界：单个 client + BEGIN/COMMIT，任一写失败（含历史/审计）整体 ROLLBACK，
 * 不会出现「关系已改、段未关」「段已关、关系未改」「业务成功但无历史/审计」三种半成品。
 *
 * 写入顺序（固定，单测断言之）：
 *   1) SELECT employee ... FOR UPDATE                  —— 锁行，串行化并发终态登记
 *   2) 关系闸门（空 / 已终态 / 非正式员工 一律拒绝）      —— 只读 employment_relation，不读段形态
 *   3) SELECT employee_assignment (is_current=true) FOR UPDATE —— 必须存在且唯一，不补造
 *   4) 时间轴校验（终态日期不得早于当前段开始日期）
 *   5) UPDATE employee  (employment_relation + leave_date)
 *   6) UPDATE employee_assignment (status=inactive, is_current=false, end_date)
 *   7) INSERT employee_history
 *   8) INSERT sys_operation_log（同事务持久审计）
 *   9) COMMIT → 事件发布（失败仅告警，不回滚已完成事务）
 *
 * @param {Object} params
 * @param {number|string} params.employee_id 员工 ID（不是任职段 ID）
 * @param {string} params.terminal_type 辞职 / 死亡 / 退休
 * @param {string} params.event_date 业务事件日期 YYYY-MM-DD（必填，禁止系统日期兜底）
 * @param {string} [params.remark]
 * @param {number|null} [params.userId] 操作者（仅来自 req.user）
 * @param {string|null} [params.username]
 * @param {string|null} [params.ip]
 * @param {string|null} [params.userAgent]
 * @returns {Promise<{error?: number, message?: string, responseData?: Object, eventType?: string, audit?: Object}>}
 */
async function terminateEmployee(params) {
  const {
    employee_id, terminal_type, event_date, remark,
    userId, username, ip, userAgent,
  } = params || {};

  // ── 0) 入参校验：全部在获取连接之前，非法入参不产生任何数据库交互 ──
  if (employee_id == null || String(employee_id).trim() === '') {
    return { error: -3, message: '员工ID不能为空' };
  }
  const terminalType = terminal_type == null ? '' : String(terminal_type).trim();
  const terminalRelation = TERMINATION_RELATION_MAP[terminalType];
  if (!terminalRelation) {
    return {
      error: -3,
      message: `无效的终态类型「${terminal_type ?? ''}」，只能登记：${Object.keys(TERMINATION_RELATION_MAP).join(' / ')}`
        + '（不得使用笼统的「离职」代替具体关系）',
    };
  }
  if (event_date == null || String(event_date).trim() === '') {
    return { error: -3, message: '业务事件日期不能为空（必须由操作人显式填写，禁止用系统日期代替）' };
  }
  if (!isIsoDateString(event_date)) {
    return { error: -3, message: `业务事件日期格式非法「${event_date}」，必须为 YYYY-MM-DD` };
  }
  const effectiveDate = String(event_date).trim();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1) 锁定员工行 + 读权威关系 ─────────────────────────────
    const empResult = await client.query(
      `SELECT id, name, employment_relation, is_deleted FROM employee WHERE id = $1 FOR UPDATE`,
      [employee_id]
    );
    if (empResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: -2, message: '员工不存在' };
    }
    const employee = empResult.rows[0];
    if (employee.is_deleted) {
      await client.query('ROLLBACK');
      return { error: BIZ_CONFLICT, message: '员工已删除（软删），不允许登记终态' };
    }
    const beforeRelation = employee.employment_relation == null
      ? ''
      : String(employee.employment_relation).trim();

    // ── 2) 关系闸门：只读 employment_relation，绝不读段形态反推 ──
    if (!beforeRelation) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: '员工用工关系为空（待核实），不得登记终态；请先由人事核实并补齐用工关系，'
          + '不得由终态登记代为推断或补值。',
      };
    }
    if (isTerminalRelation(beforeRelation)) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: `员工已处于终态「${beforeRelation}」，不允许重复登记终态。`,
      };
    }
    if (beforeRelation !== RELATION.FORMAL) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: `员工当前用工关系为「${beforeRelation}」，不属于可登记终态的「正式员工」状态，`
          + '请先人工核实用工关系。',
      };
    }

    // ── 3) 当前有效任职段：必须存在且唯一；缺失时禁止补造 ──────
    const curResult = await client.query(
      `SELECT id, status, org_unit_id, position_id, start_date
         FROM employee_assignment
        WHERE employee_id = $1 AND is_current = true AND is_deleted = false
        FOR UPDATE`,
      [employee_id]
    );
    if (curResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: '员工无当前有效任职段，不允许在未核实数据的情况下自动补造任职段；'
          + '请先人工核实其任职数据。',
      };
    }
    if (curResult.rows.length > 1) {
      await client.query('ROLLBACK');
      const ids = curResult.rows.map((r) => r.id).join(',');
      return {
        error: BIZ_CONFLICT,
        message: `员工存在 ${curResult.rows.length} 条 is_current=true 的任职段（ID=${ids}），属数据异常；`
          + '终态登记不猜测应关闭哪一条，请先人工核实。',
      };
    }
    const current = curResult.rows[0];
    const segmentStart = toDateString(current.start_date);

    // ── 4) 时间轴：终态日期不得早于当前段开始日期（否则倒挂）──
    if (segmentStart && effectiveDate < segmentStart) {
      await client.query('ROLLBACK');
      return {
        error: BIZ_CONFLICT,
        message: `登记日期（${effectiveDate}）早于当前任职段开始日期（${segmentStart}），`
          + '会造成任职段时间轴倒挂；请核对业务日期。',
      };
    }

    // ── 5) 关系权威写入（含离职日期）──────────────────────────
    // 只写 employment_relation；不写 employment_relationship_status（历史死列，A-02e.5-B2.1 §6）
    const relUpdate = await client.query(
      `UPDATE employee SET employment_relation = $2, leave_date = $3, updated_at = NOW()
        WHERE id = $1 AND is_deleted = false`,
      [employee_id, terminalRelation, effectiveDate]
    );
    if (relUpdate.rowCount === 0) {
      // 已 FOR UPDATE 锁行，理论上不可达；显式判 0 行以防「关系未更新仍继续关段」
      throw new Error('终态登记失败：员工用工关系未更新（记录不存在或已删除）');
    }

    // ── 6) 关闭当前有效任职段 ─────────────────────────────────
    // M1-01：统一任职段写入。terminate 已在本步骤前保证「当前段存在且唯一」，
    //        故 currentSegments 传 curResult.rows（B 场景：关闭该段并强校验 rowCount）。
    //        关闭谓词沿用 terminate 历史口径（status=inactive + is_current/is_deleted 幂等谓词），
    //        rowCount !== 1 时 writeSegment 抛 SegmentCloseFailedError，交由下方 catch 回滚。
    await writeSegment(client, {
      employeeId: employee_id,
      scenario: 'TERMINATE',
      currentSegments: curResult.rows,
      closeStatus: TERMINATION_SEGMENT_STATUS,
      endDate: effectiveDate,
    });

    // ── 7) 人事历史（event_type / after_status 保留终态原因）──
    // 关联口径沿用既有实现：getAssignmentHistoryDetail 以 eh.event_date = ea.start_date 关联，
    // 终态历史挂不到段起始日属既有模型限制（A-02e-E 处理），本节点不改关联口径。
    await client.query(
      `INSERT INTO employee_history (
         employee_id, event_type, event_date, before_dept_id, after_dept_id,
         before_position_id, after_position_id, before_status, after_status, remark, approver_id
       ) VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9)`,
      [
        employee_id, terminalType, effectiveDate,
        current.org_unit_id || null, current.position_id || null,
        toStatusLabel(current.status), terminalType,
        remark || null, userId || null,
      ]
    );

    // ── 8) 持久审计（同一事务内写 sys_operation_log）──────────
    // 与 routes/audit.js#auditLog 的差异：auditLog 走独立 pool 连接、失败静默、且在事务外，
    // 无法保证「业务成功 ⇔ 审计存在」。本动作要求可追溯，故与业务写同事务提交。
    const auditDetail = {
      action: 'TERMINATE',
      result: 'success',
      employeeId: employee.id,
      employeeName: employee.name,
      assignmentId: current.id,
      beforeRelation,
      afterRelation: terminalRelation,
      beforeAssignmentStatus: toStatusLabel(current.status),
      beforeAssignmentStatusCode: current.status,
      afterAssignmentStatus: toStatusLabel(TERMINATION_SEGMENT_STATUS),
      afterAssignmentStatusCode: TERMINATION_SEGMENT_STATUS,
      eventDate: effectiveDate,
      operatorId: userId || null,
      operatorName: username || null,
    };
    await client.query(
      `INSERT INTO sys_operation_log
        (module, action, target_id, target_type, operator, ip, user_id, username,
         description, ip_address, user_agent, status_code, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        '人员状态', 'update', employee.id, 'employee', username || null, ip || null,
        userId || null, username || '',
        `终态登记: ${employee.name}(ID=${employee.id}) 关系 ${beforeRelation}→${terminalRelation}，`
          + `任职段 ID=${current.id} 关闭，事件日期 ${effectiveDate}`,
        ip ? String(ip).slice(0, 50) : null,
        userAgent ? String(userAgent).slice(0, 500) : null,
        200,
        JSON.stringify(auditDetail),
      ]
    );

    await client.query('COMMIT');

    // ── 9) 事件（COMMIT 之后；失败仅告警，不回滚已完成事务）────
    try {
      const employeeEventService = require('./employeeEventService');
      const resignedLabels = ['辞职', '死亡'];
      employeeEventService.publishEmployeeEvent({
        type: resignedLabels.includes(terminalType) ? 'EMPLOYEE_RESIGNED' : 'EMPLOYEE_STATUS_CHANGED',
        employeeId: employee.id,
        occurredAt: new Date().toISOString(),
        payload: {
          fromRelation: beforeRelation,
          toRelation: terminalRelation,
          fromStatus: toStatusLabel(current.status),
          toStatus: terminalType,
          toStatusCode: TERMINATION_SEGMENT_STATUS,
          effectiveDate,
          assignmentId: current.id,
        },
      });
    } catch (e) {
      console.warn('[hse-employee] 发布 TERMINATE 事件失败:', e.message);
    }

    return {
      responseData: {
        employee_id: employee.id,
        employee_name: employee.name,
        employment_relation: terminalRelation,
        leave_date: effectiveDate,
        assignment_id: current.id,
        assignment_status: terminalType,
        assignment_status_code: TERMINATION_SEGMENT_STATUS,
        is_current: false,
        end_date: effectiveDate,
        event_date: effectiveDate,
      },
      eventType: terminalType,
      employeeName: employee.name,
      audit: auditDetail,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================
// 统计查询
// ============================================================

/**
 * 按状态统计员工数
 *
 * ⚠️ 统计口径限制（A-02d §四.8）：本函数只统计 is_current=true 的任职段，
 *    其中包含 pending / secondment / unpaid_leave 等【中间态】，
 *    因此【不能】直接当作「实际在岗人数」使用。系统尚未定义「实际在岗」口径
 *    （组织树与员工统计的在岗人数以 employment_relation = '正式员工' 为准），此处保持原行为不猜测。
 *
 * @returns {Promise<Array>}
 */
async function getEmployeeCountByStatus() {
  const result = await pool.query(
    `SELECT 
       ${statusLabelSql('status')} as status_label,
       COUNT(*)::int as count
     FROM employee_assignment
     WHERE is_current = true AND is_deleted = false
     GROUP BY status
     ORDER BY count DESC`
  );
  return result.rows;
}

/**
 * 获取各部门「当前任职段」员工数（用于组织树统计）
 *
 * ⚠️ 统计口径限制（A-02d §四.8）：未按 status 过滤，含 pending / secondment / unpaid_leave 中间态，
 *    是「当前任职段人数」而非「实际在岗人数」。如需在岗口径，应以 employment_relation 为准
 *    或由业务另行定义，禁止在此隐式猜测。
 *
 * @param {Array<number>} deptIds - 部门ID列表
 * @returns {Promise<Object>} - { deptId: count }
 */
async function getEmployeeCountByDepartments(deptIds) {
  if (!deptIds || deptIds.length === 0) return {};
  
  const result = await pool.query(
    `SELECT ou.id as org_unit_id, COUNT(DISTINCT ea.employee_id)::int as count
     FROM employee_assignment ea
     JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
     WHERE ea.is_current = true AND ea.is_deleted = false
       AND ou.id = ANY($1::bigint[])
     GROUP BY ou.id`,
    [deptIds]
  );
  
  const countMap = {};
  result.rows.forEach(r => {
    countMap[r.org_unit_id] = r.count;
  });
  
  return countMap;
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  // 常量
  STATUS_MAP,
  STATUS_REVERSE_MAP,
  
  // 组织映射
  resolveOrgUnitId,
  buildOrgPathFromDepartment,
  
  // CRUD
  getCurrentAssignment,
  getAssignmentHistory,
  endCurrentAssignment,
  createAssignment,
  updateAssignmentStatus,
  findCurrentAssignmentByEmployeeId,
  
  // 业务编排（自 hse-employee/assignment.js route 迁移）
  getCurrentAssignmentDetail,
  getAssignmentHistoryDetail,
  assignEmployee,
  changeAssignmentStatus,
  rehireEmployee,
  terminateEmployee,
  
  // 统计
  getEmployeeCountByStatus,
  getEmployeeCountByDepartments,
};