/**
 * HSE 员工域 · 人员组织关系维护（employee_assignment，含调岗流程 + 状态变更）—— 纯绑定路由
 * 业务已下沉：controllers/hse-assignment.js（薄 handler）→ services/employeeAssignmentService.js（业务+SQL）
 * 对外路由契约逐字节不变，由父路由 router.use('/', this) 挂载，
 * 最终契约 /api/hse/employee/org/...
 */
const express = require('express');
const router = express.Router();

const { requireRole, requirePermission } = require('../../middleware/auth');
const {
  getCurrentAssignment,
  getAssignmentHistory,
  assignEmployee,
  changeAssignmentStatus,
  rehireEmployee,
  terminateEmployee,
} = require('../../controllers/hse-assignment');

// GET /org/employee/:employeeId — 员工当前组织关系
router.get('/org/employee/:employeeId', getCurrentAssignment);

// GET /org/employee/:employeeId/history — 员工组织关系历史
router.get('/org/employee/:employeeId/history', getAssignmentHistory);

// POST /org/assign — 调岗/分配组织关系（核心）
router.post('/org/assign', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), assignEmployee);

// POST /org/rehire — 返聘（A-02e.5-B2.2）：终态（退休）人员的唯一正向出口
// 权限与 /org/assign 同级（hse:personnel:create），不降低原有门槛（B02-DEC-03.22 §RH-07）
router.post('/org/rehire', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), rehireEmployee);

// PUT /org/:id/status — 人员状态变更（待岗/复岗/离职/辞职/死亡/退休）
// 注：自 A-02e.5-B2.2 起，「返聘」不再经本接口办理（服务层返回 -4，指向 POST /org/rehire）
router.put('/org/:id/status', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), changeAssignmentStatus);

// POST /org/terminate — 终态登记（A-02A）：辞职 / 死亡 / 退休 的唯一权威业务出口
// 回调关系：employee.employment_relation + leave_date + 关闭当前任职段 + 人事历史 + 持久审计，
// 全部在同一事务内完成。权限与状态变更同级（hse:personnel:update），不降低门槛、不放宽角色。
router.post('/org/terminate', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), terminateEmployee);

module.exports = router;
