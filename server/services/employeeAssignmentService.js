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

// ============================================================
// 常量定义
// ============================================================

// 状态映射：中文 → 英文（新模型标准）
const STATUS_MAP = {
  '在职': 'active',
  '待岗': 'pending',
  '离职': 'inactive',
  '退休': 'retired',
  '返聘': 'reinstated',
  'active': 'active',
  'pending': 'pending',
  'inactive': 'inactive',
  'retired': 'retired',
  'reinstated': 'reinstated',
};

// 英文 → 中文（响应转换）
const STATUS_REVERSE_MAP = {
  'active': '在职',
  'pending': '待岗',
  'inactive': '离职',
  'retired': '退休',
  'reinstated': '返聘',
};

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
  
  // 状态标准化（中文 → 英文）
  const normalizedStatus = STATUS_MAP[status] || status || 'active';
  
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
  // 状态标准化
  const normalizedStatus = STATUS_MAP[newStatus] || newStatus;
  
  // 终态：离职/退休
  const terminalStatuses = ['inactive', 'retired'];
  const isTerminal = terminalStatuses.includes(normalizedStatus);
  
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
            CASE 
              WHEN ea.status = 'active' THEN '在职'
              WHEN ea.status = 'pending' THEN '待岗'
              WHEN ea.status = 'inactive' THEN '离职'
              WHEN ea.status = 'retired' THEN '退休'
              WHEN ea.status = 'reinstated' THEN '返聘'
              ELSE ea.status
            END AS status,
            ea.is_current, ea.remark AS change_reason,
            ou.id AS org_unit_id,
            ou.org_path,
            ou.org_name,
            p.name AS position_name,
            s.name AS supervisor_name
     FROM employee_assignment ea
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
            CASE 
              WHEN ea.status = 'active' THEN '在职'
              WHEN ea.status = 'pending' THEN '待岗'
              WHEN ea.status = 'inactive' THEN '离职'
              WHEN ea.status = 'retired' THEN '退休'
              WHEN ea.status = 'reinstated' THEN '返聘'
              ELSE ea.status
            END AS status,
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

  // 验证员工存在
  const empResult = await pool.query(`SELECT id, name FROM employee WHERE id = $1 AND is_deleted = false`, [employee_id]);
  if (empResult.rows.length === 0) return { error: -2, message: '员工不存在' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

      // 结束当前组织关系
      const endDate = new Date(start_date);
      endDate.setDate(endDate.getDate() - 1);
      await client.query(
        `UPDATE employee_assignment SET is_current = false, end_date = $2, updated_at = NOW()
         WHERE id = $1`,
        [currentOrg.id, endDate.toISOString().split('T')[0]]
      );
    }

    // 解析 org_unit_id（从 5 列扁平组织映射到 hse_org_unit）
    const { orgUnitId, orgPath } = await resolveOrgUnitId(client, {
      group_id, region_id, enterprise_id, project_id, team_id,
    });

    // 新增组织关系
    const newOrgResult = await client.query(
      `INSERT INTO employee_assignment (
          employee_id, org_unit_id, position_id, supervisor_id, 
          status, is_current, is_primary, start_date, remark, created_by
        ) VALUES ($1, $2, $3, $4, 'active', true, true, $5, $6, $7) RETURNING *`,
      [employee_id, orgUnitId, position_id || null, supervisor_id || null,
       start_date, change_reason || '调岗', userId || null]
    );

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

/**
 * 人员状态变更（待岗/复岗/离职/退休/返聘）
 * 对应 PUT /org/:id/status：更新状态 → 记录 employee_history
 * 事件发布在 COMMIT 之后执行
 * @param {Object} params { id, status, event_date, remark, userId }
 * @returns {Promise<{error?: number, message?: string, audit?: Object}>}
 */
async function changeAssignmentStatus(params) {
  const { id, status, event_date, remark, userId } = params;
  const validStatuses = ['在职', '待岗', '离职', '退休', '返聘'];
  if (!validStatuses.includes(status)) return { error: -3, message: `无效状态，可选: ${validStatuses.join('/')}` };
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
    const beforeStatus = STATUS_REVERSE_MAP[org.status] || org.status;

    // 状态标准化（中文 → 英文）
    const normalizedStatus = STATUS_MAP[status] || status;

    // 更新状态
    if (status === '离职' || status === '退休') {
      // 终态：结束当前记录
      await client.query(
        `UPDATE employee_assignment SET status = $2, is_current = false, end_date = $3, updated_at = NOW() WHERE id = $1`,
        [id, normalizedStatus, event_date]
      );
    } else {
      // 非终态（待岗/复岗/返聘）：更新状态
      await client.query(
        `UPDATE employee_assignment SET status = $2, updated_at = NOW() WHERE id = $1`,
        [id, normalizedStatus]
      );
    }

    // 映射状态到事件类型
    const eventMap = { '待岗': '待岗', '离职': '离职', '退休': '退休', '返聘': '返聘' };
    let eventType;
    if (status === '在职' && beforeStatus === '待岗') {
      eventType = '复岗';
    } else {
      eventType = eventMap[status] || '状态变更';
    }

    // 记录人事变动（使用 org_unit_id）
    await client.query(
      `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9)`,
      [org.employee_id, eventType, event_date, org.org_unit_id, org.position_id, beforeStatus, status, remark || null, userId || null]
    );

    await client.query('COMMIT');

    // P0-2: 发布员工事件（离职 → EMPLOYEE_RESIGNED，其他 → EMPLOYEE_STATUS_CHANGED）
    try {
      const employeeEventService = require('./employeeEventService');
      const eventTypeForEvent = (status === '离职') ? 'EMPLOYEE_RESIGNED' : 'EMPLOYEE_STATUS_CHANGED';
      employeeEventService.publishEmployeeEvent({
        type: eventTypeForEvent,
        employeeId: org.employee_id,
        occurredAt: new Date().toISOString(),
        payload: {
          fromStatus: beforeStatus,
          toStatus: status,
        },
      });
    } catch (e) {
      console.warn('[hse-employee] 发布 STATUS 事件失败:', e.message);
    }

    return { audit: { employeeId: org.employee_id, beforeStatus, status } };
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
 * @returns {Promise<Array>}
 */
async function getEmployeeCountByStatus() {
  const result = await pool.query(
    `SELECT 
       CASE 
         WHEN status = 'active' THEN '在职'
         WHEN status = 'pending' THEN '待岗'
         WHEN status = 'inactive' THEN '离职'
         WHEN status = 'retired' THEN '退休'
         WHEN status = 'reinstated' THEN '返聘'
         ELSE status
       END as status_label,
       COUNT(*)::int as count
     FROM employee_assignment
     WHERE is_current = true AND is_deleted = false
     GROUP BY status
     ORDER BY count DESC`
  );
  return result.rows;
}

/**
 * 获取各部门在职员工数（用于组织树统计）
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
  
  // 统计
  getEmployeeCountByStatus,
  getEmployeeCountByDepartments,
};