/**
 * HSE 员工域 · 人员组织关系维护（employee_assignment，含调岗流程 + 状态变更）
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/org/...
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { buildDetailResponse, camelKeys } = require('../../utils/commonResponse');
const { auditLog } = require('../audit');
const { requireRole, requirePermission } = require('../../middleware/auth');
const employeeEventService = require('../../services/employeeEventService');
const { resolveOrgUnitId, STATUS_MAP, STATUS_REVERSE_MAP } = require('../../services/employeeAssignmentService');

// ============================================================
// 四、人员组织关系维护 (hse_employee_org 表)
// ============================================================

// GET /org/employee/:employeeId — 员工当前组织关系
// Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
router.get('/org/employee/:employeeId', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

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
      [req.params.employeeId]
    );
    if (result.rows.length === 0) return res.json(error(-2, '无当前组织关系'));
    buildDetailResponse(res, result.rows[0], '查询成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /org/employee/:employeeId/history — 员工组织关系历史
// Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
router.get('/org/employee/:employeeId/history', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

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
      [req.params.employeeId]
    );
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /org/assign — 调岗/分配组织关系（核心）
// Sprint-C Phase 1: 使用 employee_assignment 替代 hse_employee_org
// 1. 结束当前组织关系(is_current=false, end_date=调岗前日)
// 2. 新增组织关系(is_current=true)
// 3. 记录 employee_history
router.post('/org/assign', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const {
      employee_id, group_id, region_id, enterprise_id, project_id, team_id,
      position_id, start_date, supervisor_id, change_reason, remark
    } = req.body;

    if (!employee_id) return res.json(error(-3, '员工ID不能为空'));
    if (!start_date) return res.json(error(-3, '开始日期不能为空'));

    // 验证员工存在
    const empResult = await pool.query(`SELECT id, name FROM employee WHERE id = $1 AND is_deleted = false`, [employee_id]);
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Sprint-C Phase 1: 查询当前组织关系（从 employee_assignment）
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

        // Sprint-C Phase 1: 结束当前组织关系（更新 employee_assignment）
        const endDate = new Date(start_date);
        endDate.setDate(endDate.getDate() - 1);
        await client.query(
          `UPDATE employee_assignment SET is_current = false, end_date = $2, updated_at = NOW()
           WHERE id = $1`,
          [currentOrg.id, endDate.toISOString().split('T')[0]]
        );
      }

      // Sprint-C Phase 1: 解析 org_unit_id（从 5 列扁平组织映射到 hse_org_unit）
      const { orgUnitId, orgPath } = await resolveOrgUnitId(client, { 
        group_id, region_id, enterprise_id, project_id, team_id 
      });

      // Sprint-C Phase 1: 新增组织关系（插入 employee_assignment）
      const newOrgResult = await client.query(
        `INSERT INTO employee_assignment (
            employee_id, org_unit_id, position_id, supervisor_id, 
            status, is_current, is_primary, start_date, remark, created_by
          ) VALUES ($1, $2, $3, $4, 'active', true, true, $5, $6, $7) RETURNING *`,
        [employee_id, orgUnitId, position_id || null, supervisor_id || null, 
         start_date, change_reason || '调岗', req.user?.id || null]
      );

      // 记录人事变动
      const eventType = currentOrgResult.rows.length === 0 ? '入职' : '调岗';
      await client.query(
        `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '在职', $9, $10)`,
        [employee_id, eventType, start_date, beforeOrgUnitId, orgUnitId, beforePositionId, position_id || null, beforeStatus, remark || null, req.user?.id || null]
      );

      await client.query('COMMIT');

      await auditLog({
        userId: req.user?.id, username: req.user?.username,
        action: 'update', module: '人员组织关系',
        description: `${eventType}: 员工${empResult.rows[0].name}(ID=${employee_id})`,
        ip: req.ip,
      }).catch(() => {});

      // P0-2: 发布员工事件（调岗/入职 → EMPLOYEE_TRANSFERRED）
      try {
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
      buildDetailResponse(res, responseData, `${eventType}成功`, { camelCase: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /org/:id/status — 人员状态变更（待岗/复岗/离职/退休/返聘）
router.put('/org/:id/status', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { status, event_date, remark } = req.body;
    const validStatuses = ['在职', '待岗', '离职', '退休', '返聘'];
    if (!validStatuses.includes(status)) return res.json(error(-3, `无效状态，可选: ${validStatuses.join('/')}`));
    if (!event_date) return res.json(error(-3, '事件日期不能为空'));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Sprint-C Phase 1: 查询当前组织关系（从 employee_assignment）
      const orgResult = await client.query(
        `SELECT ea.id, ea.employee_id, ea.status, ea.position_id, ea.org_unit_id, ou.org_path
         FROM employee_assignment ea
         LEFT JOIN hse_org_unit ou ON ea.org_unit_id = ou.id AND ou.is_deleted = false
         WHERE ea.id = $1 AND ea.is_current = true AND ea.is_deleted = false`,
        [req.params.id]
      );
      if (orgResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.json(error(-2, '组织关系不存在或非当前记录'));
      }

      const org = orgResult.rows[0];
      const beforeStatus = STATUS_REVERSE_MAP[org.status] || org.status;

      // Sprint-C Phase 1: 状态标准化（中文 → 英文）
      const normalizedStatus = STATUS_MAP[status] || status;

      // Sprint-C Phase 1: 更新状态（employee_assignment）
      if (status === '离职' || status === '退休') {
        // 终态：结束当前记录
        await client.query(
          `UPDATE employee_assignment SET status = $2, is_current = false, end_date = $3, updated_at = NOW() WHERE id = $1`,
          [req.params.id, normalizedStatus, event_date]
        );
      } else {
        // 非终态（待岗/复岗/返聘）：更新状态
        await client.query(
          `UPDATE employee_assignment SET status = $2, updated_at = NOW() WHERE id = $1`,
          [req.params.id, normalizedStatus]
        );
      }

      // 映射状态到事件类型
      // 注意: '在职' 状态变更可能来自"复岗"(从待岗恢复) 或初始入职(走 /org/assign)
      // 通过 beforeStatus 判断: 待岗→在职 为"复岗"
      const eventMap = { '待岗': '待岗', '离职': '离职', '退休': '退休', '返聘': '返聘' };
      let eventType;
      if (status === '在职' && beforeStatus === '待岗') {
        eventType = '复岗';
      } else {
        eventType = eventMap[status] || '状态变更';
      }

      // Sprint-C Phase 1: 记录人事变动（使用 org_unit_id）
      await client.query(
        `INSERT INTO employee_history (employee_id, event_type, event_date, before_dept_id, after_dept_id, before_position_id, after_position_id, before_status, after_status, remark, approver_id)
         VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9)`,
        [org.employee_id, eventType, event_date, org.org_unit_id, org.position_id, beforeStatus, status, remark || null, req.user?.id || null]
      );

      await client.query('COMMIT');

      await auditLog({
        userId: req.user?.id, username: req.user?.username,
        action: 'update', module: '人员状态',
        description: `状态变更: 员工ID=${org.employee_id} ${beforeStatus}→${status}`,
        ip: req.ip,
      }).catch(() => {});

      // P0-2: 发布员工事件（离职 → EMPLOYEE_RESIGNED，其他 → EMPLOYEE_STATUS_CHANGED）
      try {
        const eventType = (status === '离职') ? 'EMPLOYEE_RESIGNED' : 'EMPLOYEE_STATUS_CHANGED';
        employeeEventService.publishEmployeeEvent({
          type: eventType,
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

      res.json(success(null, '状态变更成功'));
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});
module.exports = router;
