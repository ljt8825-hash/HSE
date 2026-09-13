/**
 * HSE 员工域 · 人事变动记录服务（employee_history 表，生命周期含 operator_id）
 * 从 hse-employee/history.js route 内联 handler 迁移 —— 行为逐字节不变
 * 仅承载业务规则 + SQL；无 express 依赖，可独立单测
 */

const { pool } = require('../config/db');

// GET /history/employee/:employeeId — 员工人事变动历史
async function listEmployeeHistory(employeeId) {
  const result = await pool.query(
    `SELECT eh.id, eh.employee_id, eh.event_type, eh.event_date,
            eh.before_dept_id, eh.after_dept_id,
            eh.before_position_id, eh.after_position_id,
            eh.before_status, eh.after_status,
            eh.approver_id, eh.approve_date, eh.approval_no, eh.remark,
            eh.operator_id,
            eh.created_at,
            dp.name AS before_dept_name, da.name AS after_dept_name,
            pp.name AS before_position_name, pa.name AS after_position_name,
            ap.name AS approver_name,
            u.username AS operator_name, u.real_name AS operator_real_name
     FROM employee_history eh
     LEFT JOIN department dp ON eh.before_dept_id = dp.id AND dp.is_deleted = false
     LEFT JOIN department da ON eh.after_dept_id = da.id AND da.is_deleted = false
     LEFT JOIN position pp ON eh.before_position_id = pp.id AND pp.is_deleted = false
     LEFT JOIN position pa ON eh.after_position_id = pa.id AND pa.is_deleted = false
     LEFT JOIN employee ap ON eh.approver_id = ap.id AND ap.is_deleted = false
     LEFT JOIN users u ON eh.operator_id = u.id
     WHERE eh.employee_id = $1 AND eh.is_deleted = false
     ORDER BY eh.event_date DESC, eh.id DESC`,
    [employeeId]
  );
  return result.rows;
}

module.exports = {
  listEmployeeHistory,
};
