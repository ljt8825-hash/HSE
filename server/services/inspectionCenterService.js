/**
 * HSE 员工域 · 检查管理中心服务（inspection_plan / inspection_task / inspection_record / hazard_record / 检查模板 表）
 * 从 hse-employee/inspection-center.js route 内联 handler 迁移 —— 行为逐字节不变
 */
const { pool } = require('../config/db');

const VALID_PLAN_TYPES = ['routine', 'periodic', 'special', 'audit', 'external', 'emergency'];
const VALID_PLAN_CATEGORIES = ['safety', 'health', 'environment', 'fire', 'equipment', 'quality'];
const VALID_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'];
const VALID_TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const VALID_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const VALID_RECORD_RESULTS = ['pass', 'fail', 'pending', 'not_applicable'];
const VALID_HAZARD_LEVELS = ['critical', 'high', 'medium', 'low'];
const VALID_HAZARD_CATEGORIES = ['safety', 'health', 'environment', 'fire', 'equipment', 'process', 'behavior'];
const VALID_HAZARD_STATUSES = ['open', 'in_progress', 'pending_review', 'closed', 'rejected'];
const VALID_REVIEW_STATUSES = ['pending', 'passed', 'failed'];
const VALID_SOURCE_TYPES = ['inspection', 'report', 'audit', 'external', 'other'];
// 注意：源文件在 createInspectionPlan/updateInspectionPlan 中引用了 VALID_INSPECTION_FREQUENCIES 但从未声明，
// 触发 ReferenceError → error(-1, '...is not defined')。此处不声明、不导入，以保持行为逐字节不变。

// ============================================================
// 一、inspection_plan — 检查计划
// ============================================================

// GET /inspection-plans
async function listInspectionPlans(query) {
  const { plan_type, plan_category, is_active, department_id, responsible_id, keyword, page = 1, pageSize = 20 } = query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'ip.is_deleted = false';
  const params = [];
  let idx = 1;
  if (plan_type) { where += ` AND ip.plan_type = $${idx}`; params.push(plan_type); idx++; }
  if (plan_category) { where += ` AND ip.plan_category = $${idx}`; params.push(plan_category); idx++; }
  if (is_active !== undefined) { where += ` AND ip.is_active = $${idx}`; params.push(is_active === 'true'); idx++; }
  if (department_id) { where += ` AND ip.department_id = $${idx}`; params.push(department_id); idx++; }
  if (responsible_id) { where += ` AND ip.responsible_id = $${idx}`; params.push(responsible_id); idx++; }
  if (keyword) { where += ` AND (ip.plan_name ILIKE $${idx} OR ip.plan_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
  const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_plan ip WHERE ${where}`, params);
  const total = parseInt(count.rows[0].total);
  params.push(parseInt(pageSize), offset);
  const result = await pool.query(
    `SELECT ip.*, e.name AS responsible_name, d.name AS department_name
     FROM inspection_plan ip
     LEFT JOIN employee e ON ip.responsible_id = e.id
     LEFT JOIN department d ON ip.department_id = d.id
     WHERE ${where}
     ORDER BY ip.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, params);
  return { rows: result.rows, total, pageNum: parseInt(page), limitNum: parseInt(pageSize) };
}

// GET /inspection-plans/stats
async function getInspectionPlanStats() {
  const stats = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_active = true) AS active,
       COUNT(*) FILTER (WHERE plan_type = 'routine') AS routine,
       COUNT(*) FILTER (WHERE plan_type = 'special') AS special
     FROM inspection_plan WHERE is_deleted = false`);
  const byCategory = await pool.query(
    `SELECT plan_category, COUNT(*) AS count FROM inspection_plan WHERE is_deleted = false AND plan_category IS NOT NULL GROUP BY plan_category ORDER BY count DESC`);
  return { ...stats.rows[0], byCategory: byCategory.rows };
}

// GET /inspection-plans/:id
async function getInspectionPlan(id) {
  const result = await pool.query(
    `SELECT ip.*, e.name AS responsible_name, d.name AS department_name
     FROM inspection_plan ip
     LEFT JOIN employee e ON ip.responsible_id = e.id
     LEFT JOIN department d ON ip.department_id = d.id
     WHERE ip.id = $1 AND ip.is_deleted = false`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查计划不存在' };
  return { row: result.rows[0] };
}

// POST /inspection-plans
async function createInspectionPlan(body, userId) {
  const { plan_name, plan_code, plan_type = 'routine', plan_category, description, scope_description, inspection_items,
          frequency = 'monthly', frequency_interval = 1, start_date, end_date, next_inspection_date,
          responsible_id, assignee_ids, department_id, position_id, approval_required = false, approval_level = 1,
          remark } = body;
  if (!plan_name || !plan_code || !start_date || !responsible_id) {
    return { error: -3, message: '缺少必填字段' };
  }
  if (!VALID_PLAN_TYPES.includes(plan_type)) return { error: -3, message: `plan_type 必须为: ${VALID_PLAN_TYPES.join(', ')}` };
  if (plan_category && !VALID_PLAN_CATEGORIES.includes(plan_category)) return { error: -3, message: `plan_category 必须为: ${VALID_PLAN_CATEGORIES.join(', ')}` };
  if (!VALID_INSPECTION_FREQUENCIES.includes(frequency)) return { error: -3, message: `frequency 必须为: ${VALID_INSPECTION_FREQUENCIES.join(', ')}` };
  const result = await pool.query(
    `INSERT INTO inspection_plan (plan_name, plan_code, plan_type, plan_category, description, scope_description, inspection_items,
      frequency, frequency_interval, start_date, end_date, next_inspection_date,
      responsible_id, assignee_ids, department_id, position_id, approval_required, approval_level, remark, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [plan_name, plan_code, plan_type, plan_category || null, description || null, scope_description || null, inspection_items ? JSON.stringify(inspection_items) : null,
     frequency, frequency_interval, start_date, end_date || null, next_inspection_date || null,
     responsible_id, assignee_ids || null, department_id || null, position_id || null, approval_required, approval_level, remark || null, userId || null]);
  return { row: result.rows[0], audit: { plan_name } };
}

// PUT /inspection-plans/:id
async function updateInspectionPlan(id, body) {
  if (body.plan_type && !VALID_PLAN_TYPES.includes(body.plan_type)) return { error: -3, message: `plan_type 必须为: ${VALID_PLAN_TYPES.join(', ')}` };
  if (body.plan_category && !VALID_PLAN_CATEGORIES.includes(body.plan_category)) return { error: -3, message: `plan_category 必须为: ${VALID_PLAN_CATEGORIES.join(', ')}` };
  if (body.frequency && !VALID_INSPECTION_FREQUENCIES.includes(body.frequency)) return { error: -3, message: `frequency 必须为: ${VALID_INSPECTION_FREQUENCIES.join(', ')}` };
  const fields = [];
  const params = [];
  let idx = 1;
  const mappings = {
    plan_name: 'plan_name', plan_code: 'plan_code', plan_type: 'plan_type', plan_category: 'plan_category',
    description: 'description', scope_description: 'scope_description', frequency: 'frequency',
    frequency_interval: 'frequency_interval', start_date: 'start_date', end_date: 'end_date',
    next_inspection_date: 'next_inspection_date', responsible_id: 'responsible_id', department_id: 'department_id',
    position_id: 'position_id', is_active: 'is_active', approval_required: 'approval_required',
    approval_level: 'approval_level', remark: 'remark'
  };
  for (const [key, col] of Object.entries(mappings)) {
    if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
  }
  if (body.inspection_items !== undefined) { fields.push(`inspection_items = $${idx}`); params.push(body.inspection_items ? JSON.stringify(body.inspection_items) : null); idx++; }
  if (body.assignee_ids !== undefined) { fields.push(`assignee_ids = $${idx}`); params.push(body.assignee_ids); idx++; }
  if (fields.length === 0) return { error: -3, message: '请提供要更新的字段' };
  fields.push('updated_at = NOW()');
  params.push(id);
  const result = await pool.query(`UPDATE inspection_plan SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
  if (result.rows.length === 0) return { error: -2, message: '检查计划不存在' };
  return { row: result.rows[0] };
}

// DELETE /inspection-plans/:id
async function deleteInspectionPlan(id) {
  const result = await pool.query(`UPDATE inspection_plan SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查计划不存在' };
  return { row: result.rows[0] };
}

// POST /inspection-plans/:id/generate-tasks — 生成检查任务
async function generateInspectionTasks(id, userId) {
  const planResult = await pool.query(`SELECT * FROM inspection_plan WHERE id = $1 AND is_deleted = false AND is_active = true`, [id]);
  if (planResult.rows.length === 0) return { error: -2, message: '检查计划不存在或未激活' };
  const plan = planResult.rows[0];
  // 生成一个检查任务
  const taskCode = `${plan.plan_code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
  const taskResult = await pool.query(
    `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date,
      due_date, status, priority, inspection_items, total_items_count, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [plan.id, `${plan.plan_name} - ${new Date().toISOString().slice(0, 10)}`, taskCode, plan.responsible_id,
     plan.assignee_ids || null, new Date().toISOString().slice(0, 10),
     plan.next_inspection_date || null, 'pending', 'normal',
     plan.inspection_items, plan.inspection_items ? JSON.parse(plan.inspection_items).length : 0,
     userId || null]);
  // 更新下次检查日期
  if (plan.frequency !== 'once') {
    const nextDate = new Date();
    const interval = plan.frequency_interval || 1;
    switch (plan.frequency) {
      case 'daily': nextDate.setDate(nextDate.getDate() + interval); break;
      case 'weekly': nextDate.setDate(nextDate.getDate() + interval * 7); break;
      case 'monthly': nextDate.setMonth(nextDate.getMonth() + interval); break;
      case 'quarterly': nextDate.setMonth(nextDate.getMonth() + interval * 3); break;
      case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + interval); break;
    }
    await pool.query(`UPDATE inspection_plan SET next_inspection_date = $1, updated_at = NOW() WHERE id = $2`,
      [nextDate.toISOString().slice(0, 10), plan.id]);
  }
  return { row: taskResult.rows[0] };
}

// POST /inspection-plans/batch-generate
async function batchGenerateInspectionTasks(userId) {
  const plans = await pool.query(`SELECT * FROM inspection_plan WHERE is_deleted = false AND is_active = true`);
  let generated = 0;
  for (const plan of plans.rows) {
    if (!plan.next_inspection_date || new Date(plan.next_inspection_date) <= new Date()) {
      const taskCode = `${plan.plan_code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
      await pool.query(
        `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, scheduled_date, status, priority, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [plan.id, `${plan.plan_name} - ${new Date().toISOString().slice(0, 10)}`, taskCode,
         plan.responsible_id, new Date().toISOString().slice(0, 10), 'pending', 'normal', userId || null]);
      generated++;
    }
  }
  return { generated };
}

// ============================================================
// 二、inspection_task — 检查任务
// ============================================================

// GET /inspection-tasks
async function listInspectionTasks(query) {
  const { plan_id, assignee_id, status, priority, scheduled_date_from, scheduled_date_to, keyword, page = 1, pageSize = 20 } = query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'it.is_deleted = false';
  const params = [];
  let idx = 1;
  if (plan_id) { where += ` AND it.plan_id = $${idx}`; params.push(plan_id); idx++; }
  if (assignee_id) { where += ` AND it.assignee_id = $${idx}`; params.push(assignee_id); idx++; }
  if (status) { where += ` AND it.status = $${idx}`; params.push(status); idx++; }
  if (priority) { where += ` AND it.priority = $${idx}`; params.push(priority); idx++; }
  if (scheduled_date_from) { where += ` AND it.scheduled_date >= $${idx}`; params.push(scheduled_date_from); idx++; }
  if (scheduled_date_to) { where += ` AND it.scheduled_date <= $${idx}`; params.push(scheduled_date_to); idx++; }
  if (keyword) { where += ` AND (it.task_name ILIKE $${idx} OR it.task_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
  const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_task it WHERE ${where}`, params);
  const total = parseInt(count.rows[0].total);
  params.push(parseInt(pageSize), offset);
  const result = await pool.query(
    `SELECT it.*, ip.plan_name, e.name AS assignee_name
     FROM inspection_task it
     LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
     LEFT JOIN employee e ON it.assignee_id = e.id
     WHERE ${where}
     ORDER BY it.scheduled_date DESC, it.id DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, params);
  return { rows: result.rows, total, pageNum: parseInt(page), limitNum: parseInt(pageSize) };
}

// GET /inspection-tasks/stats
async function getInspectionTaskStats() {
  const stats = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending,
       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status = 'overdue') AS overdue
     FROM inspection_task WHERE is_deleted = false`);
  const byPriority = await pool.query(
    `SELECT priority, COUNT(*) AS count FROM inspection_task WHERE is_deleted = false GROUP BY priority ORDER BY count DESC`);
  return { ...stats.rows[0], byPriority: byPriority.rows };
}

// GET /inspection-tasks/:id
async function getInspectionTask(id) {
  const result = await pool.query(
    `SELECT it.*, ip.plan_name, e.name AS assignee_name
     FROM inspection_task it
     LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
     LEFT JOIN employee e ON it.assignee_id = e.id
     WHERE it.id = $1 AND it.is_deleted = false`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查任务不存在' };
  return { row: result.rows[0] };
}

// GET /inspection-tasks/assignee/:employeeId
async function listInspectionTasksByAssignee(employeeId) {
  const result = await pool.query(
    `SELECT it.*, ip.plan_name
     FROM inspection_task it
     LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
     WHERE it.assignee_id = $1 AND it.is_deleted = false AND it.status IN ('pending', 'in_progress', 'overdue')
     ORDER BY it.scheduled_date`, [employeeId]);
  return result.rows;
}

// POST /inspection-tasks
async function createInspectionTask(body, userId) {
  const { plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date, due_date,
          priority = 'normal', inspection_items, supervisor_id } = body;
  if (!plan_id || !task_name || !task_code || !assignee_id || !scheduled_date) {
    return { error: -3, message: '缺少必填字段' };
  }
  if (priority && !VALID_TASK_PRIORITIES.includes(priority)) return { error: -3, message: `priority 必须为: ${VALID_TASK_PRIORITIES.join(', ')}` };
  const result = await pool.query(
    `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date,
      due_date, status, priority, inspection_items, total_items_count, supervisor_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [plan_id, task_name, task_code, assignee_id, inspectors || null, scheduled_date,
     due_date || null, 'pending', priority, inspection_items ? JSON.stringify(inspection_items) : null,
     inspection_items ? JSON.parse(inspection_items).length : 0, supervisor_id || null, userId || null]);
  return { row: result.rows[0] };
}

// PUT /inspection-tasks/:id
async function updateInspectionTask(id, body) {
  if (body.status && !VALID_TASK_STATUSES.includes(body.status)) return { error: -3, message: `status 必须为: ${VALID_TASK_STATUSES.join(', ')}` };
  if (body.priority && !VALID_TASK_PRIORITIES.includes(body.priority)) return { error: -3, message: `priority 必须为: ${VALID_TASK_PRIORITIES.join(', ')}` };
  const fields = [];
  const params = [];
  let idx = 1;
  const mappings = {
    task_name: 'task_name', task_code: 'task_code', assignee_id: 'assignee_id',
    scheduled_date: 'scheduled_date', due_date: 'due_date', status: 'status',
    priority: 'priority', progress: 'progress', result_summary: 'result_summary',
    completed_items_count: 'completed_items_count', total_items_count: 'total_items_count',
    hazards_found_count: 'hazards_found_count', supervisor_id: 'supervisor_id'
  };
  for (const [key, col] of Object.entries(mappings)) {
    if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
  }
  if (body.inspectors !== undefined) { fields.push(`inspectors = $${idx}`); params.push(body.inspectors); idx++; }
  if (body.inspection_items !== undefined) { fields.push(`inspection_items = $${idx}`); params.push(body.inspection_items ? JSON.stringify(body.inspection_items) : null); idx++; }
  if (fields.length === 0) return { error: -3, message: '请提供要更新的字段' };
  fields.push('updated_at = NOW()');
  params.push(id);
  const result = await pool.query(`UPDATE inspection_task SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
  if (result.rows.length === 0) return { error: -2, message: '检查任务不存在' };
  return { row: result.rows[0] };
}

// PUT /inspection-tasks/:id/start
async function startInspectionTask(id) {
  const result = await pool.query(
    `UPDATE inspection_task SET status = 'in_progress', actual_start_time = NOW(), updated_at = NOW()
     WHERE id = $1 AND is_deleted = false AND status = 'pending' RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '任务不存在或状态不允许开始' };
  return { row: result.rows[0] };
}

// PUT /inspection-tasks/:id/complete
async function completeInspectionTask(id, result_summary) {
  const result = await pool.query(
    `UPDATE inspection_task SET status = 'completed', actual_end_time = NOW(), result_summary = $1, updated_at = NOW()
     WHERE id = $2 AND is_deleted = false AND status = 'in_progress' RETURNING *`,
    [result_summary || null, id]);
  if (result.rows.length === 0) return { error: -2, message: '任务不存在或状态不允许完成' };
  return { row: result.rows[0] };
}

// PUT /inspection-tasks/:id/approve
async function approveInspectionTask(id, body, userId) {
  const { approval_status, approval_comment } = body;
  if (!approval_status || !VALID_APPROVAL_STATUSES.includes(approval_status)) {
    return { error: -3, message: `approval_status 必须为: ${VALID_APPROVAL_STATUSES.join(', ')}` };
  }
  const result = await pool.query(
    `UPDATE inspection_task SET approval_status = $1, approval_comment = $2, approval_time = NOW(), approved_by = $3, updated_at = NOW()
     WHERE id = $4 AND is_deleted = false RETURNING *`,
    [approval_status, approval_comment || null, userId || null, id]);
  if (result.rows.length === 0) return { error: -2, message: '检查任务不存在' };
  return { row: result.rows[0] };
}

// DELETE /inspection-tasks/:id
async function deleteInspectionTask(id) {
  const result = await pool.query(`UPDATE inspection_task SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查任务不存在' };
  return { row: result.rows[0] };
}

// ============================================================
// 三、inspection_record — 检查记录
// ============================================================

// GET /inspection-records
async function listInspectionRecords(query) {
  const { task_id, employee_id, result, is_hazard_detected, inspection_time_from, inspection_time_to, page = 1, pageSize = 20 } = query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'ir.is_deleted = false';
  const params = [];
  let idx = 1;
  if (task_id) { where += ` AND ir.task_id = $${idx}`; params.push(task_id); idx++; }
  if (employee_id) { where += ` AND ir.employee_id = $${idx}`; params.push(employee_id); idx++; }
  if (result) { where += ` AND ir.result = $${idx}`; params.push(result); idx++; }
  if (is_hazard_detected !== undefined) { where += ` AND ir.is_hazard_detected = $${idx}`; params.push(is_hazard_detected === 'true'); idx++; }
  if (inspection_time_from) { where += ` AND ir.inspection_time >= $${idx}`; params.push(inspection_time_from); idx++; }
  if (inspection_time_to) { where += ` AND ir.inspection_time <= $${idx}`; params.push(inspection_time_to); idx++; }
  const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_record ir WHERE ${where}`, params);
  const total = parseInt(count.rows[0].total);
  params.push(parseInt(pageSize), offset);
  const result2 = await pool.query(
    `SELECT ir.*, e.name AS employee_name, it.task_name
     FROM inspection_record ir
     LEFT JOIN employee e ON ir.employee_id = e.id
     LEFT JOIN inspection_task it ON ir.task_id = it.id
     WHERE ${where}
     ORDER BY ir.inspection_time DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, params);
  return { rows: result2.rows, total, pageNum: parseInt(page), limitNum: parseInt(pageSize) };
}

// GET /inspection-records/stats
async function getInspectionRecordStats() {
  const stats = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE result = 'pass') AS passed,
       COUNT(*) FILTER (WHERE result = 'fail') AS failed,
       COUNT(*) FILTER (WHERE is_hazard_detected = true) AS hazards_found
     FROM inspection_record WHERE is_deleted = false`);
  const byCategory = await pool.query(
    `SELECT item_category, COUNT(*) AS count FROM inspection_record WHERE is_deleted = false AND item_category IS NOT NULL GROUP BY item_category ORDER BY count DESC`);
  return { ...stats.rows[0], byCategory: byCategory.rows };
}

// GET /inspection-records/:id
async function getInspectionRecord(id) {
  const result = await pool.query(
    `SELECT ir.*, e.name AS employee_name, it.task_name
     FROM inspection_record ir
     LEFT JOIN employee e ON ir.employee_id = e.id
     LEFT JOIN inspection_task it ON ir.task_id = it.id
     WHERE ir.id = $1 AND ir.is_deleted = false`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查记录不存在' };
  return { row: result.rows[0] };
}

// GET /inspection-records/task/:taskId
async function listInspectionRecordsByTask(taskId) {
  const result = await pool.query(
    `SELECT ir.*, e.name AS employee_name
     FROM inspection_record ir
     LEFT JOIN employee e ON ir.employee_id = e.id
     WHERE ir.task_id = $1 AND ir.is_deleted = false
     ORDER BY ir.inspection_time DESC`, [taskId]);
  return result.rows;
}

// GET /inspection-records/employee/:employeeId
async function listInspectionRecordsByEmployee(employeeId) {
  const result = await pool.query(
    `SELECT ir.*, it.task_name
     FROM inspection_record ir
     LEFT JOIN inspection_task it ON ir.task_id = it.id
     WHERE ir.employee_id = $1 AND ir.is_deleted = false
     ORDER BY ir.inspection_time DESC`, [employeeId]);
  return result.rows;
}

// POST /inspection-records
async function createInspectionRecord(body, userId) {
  const { task_id, plan_id, employee_id, position_id, inspection_time, inspection_location,
          item_name, item_category, item_code, result = 'pass', comment, photos, attachments,
          ai_analysis, ai_suggestion, ai_confidence, is_hazard_detected = false } = body;
  if (!task_id || !employee_id || !item_name || !inspection_time) {
    return { error: -3, message: '缺少必填字段' };
  }
  if (!VALID_RECORD_RESULTS.includes(result)) return { error: -3, message: `result 必须为: ${VALID_RECORD_RESULTS.join(', ')}` };
  const insertResult = await pool.query(
    `INSERT INTO inspection_record (task_id, plan_id, employee_id, position_id, inspection_time, inspection_location,
      item_name, item_category, item_code, result, comment, photos, attachments,
      ai_analysis, ai_suggestion, ai_confidence, is_hazard_detected)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [task_id, plan_id || null, employee_id, position_id || null, inspection_time, inspection_location || null,
     item_name, item_category || null, item_code || null, result, comment || null,
     photos ? JSON.stringify(photos) : null, attachments ? JSON.stringify(attachments) : null,
     ai_analysis || null, ai_suggestion || null, ai_confidence || null, is_hazard_detected]);
  // 更新任务检查项计数
  if (result === 'pass' || result === 'fail') {
    await pool.query(`UPDATE inspection_task SET completed_items_count = COALESCE(completed_items_count, 0) + 1 WHERE id = $1`, [task_id]);
  }
  // 如果发现问题，创建隐患记录
  if (is_hazard_detected && result === 'fail') {
    const hazardCode = `HD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const hazardResult = await pool.query(
      `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
        hazard_level, hazard_category, description, location, responsible_id, deadline_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [hazardCode, task_id, insertResult.rows[0].id, employee_id, null, position_id || null,
       'medium', item_category || 'safety', comment || `${item_name}不合格`, inspection_location || null,
       employee_id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), 'open', userId || null]);
    await pool.query(`UPDATE inspection_record SET hazard_record_id = $1 WHERE id = $2`,
      [hazardResult.rows[0].id, insertResult.rows[0].id]);
    await pool.query(`UPDATE inspection_task SET hazards_found_count = COALESCE(hazards_found_count, 0) + 1 WHERE id = $1`, [task_id]);
  }
  return { row: insertResult.rows[0] };
}

// PUT /inspection-records/:id
async function updateInspectionRecord(id, body) {
  if (body.result && !VALID_RECORD_RESULTS.includes(body.result)) return { error: -3, message: `result 必须为: ${VALID_RECORD_RESULTS.join(', ')}` };
  const fields = [];
  const params = [];
  let idx = 1;
  const mappings = {
    inspection_time: 'inspection_time', inspection_location: 'inspection_location',
    item_name: 'item_name', item_category: 'item_category', item_code: 'item_code',
    result: 'result', comment: 'comment', ai_analysis: 'ai_analysis',
    ai_suggestion: 'ai_suggestion', ai_confidence: 'ai_confidence', is_hazard_detected: 'is_hazard_detected'
  };
  for (const [key, col] of Object.entries(mappings)) {
    if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
  }
  if (body.photos !== undefined) { fields.push(`photos = $${idx}`); params.push(body.photos ? JSON.stringify(body.photos) : null); idx++; }
  if (body.attachments !== undefined) { fields.push(`attachments = $${idx}`); params.push(body.attachments ? JSON.stringify(body.attachments) : null); idx++; }
  if (fields.length === 0) return { error: -3, message: '请提供要更新的字段' };
  fields.push('updated_at = NOW()');
  params.push(id);
  const result = await pool.query(`UPDATE inspection_record SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
  if (result.rows.length === 0) return { error: -2, message: '检查记录不存在' };
  return { row: result.rows[0] };
}

// DELETE /inspection-records/:id
async function deleteInspectionRecord(id) {
  const result = await pool.query(`UPDATE inspection_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查记录不存在' };
  return { row: result.rows[0] };
}

// POST /inspection-records/batch-create
async function batchCreateInspectionRecords(body) {
  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) return { error: -3, message: '请提供检查记录数组' };
  let successCount = 0, failCount = 0;
  const errors = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        await client.query(
          `INSERT INTO inspection_record (task_id, plan_id, employee_id, inspection_time, item_name, item_category, result, comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [item.task_id, item.plan_id || null, item.employee_id, item.inspection_time,
           item.item_name, item.item_category || null, item.result || 'pass', item.comment || null]);
        successCount++;
      } catch (e) { errors.push({ index: i, message: e.message }); failCount++; }
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return { total: items.length, success: successCount, failed: failCount, errors };
}

// ============================================================
// 四、hazard_record — 隐患记录
// ============================================================

// GET /hazard-records
async function listHazardRecords(query) {
  const { task_id, responsible_id, hazard_level, hazard_category, status, is_closed, keyword, page = 1, pageSize = 20 } = query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'hr.is_deleted = false';
  const params = [];
  let idx = 1;
  if (task_id) { where += ` AND hr.task_id = $${idx}`; params.push(task_id); idx++; }
  if (responsible_id) { where += ` AND hr.responsible_id = $${idx}`; params.push(responsible_id); idx++; }
  if (hazard_level) { where += ` AND hr.hazard_level = $${idx}`; params.push(hazard_level); idx++; }
  if (hazard_category) { where += ` AND hr.hazard_category = $${idx}`; params.push(hazard_category); idx++; }
  if (status) { where += ` AND hr.status = $${idx}`; params.push(status); idx++; }
  if (is_closed !== undefined) { where += ` AND hr.is_closed = $${idx}`; params.push(is_closed === 'true'); idx++; }
  if (keyword) { where += ` AND (hr.description ILIKE $${idx} OR hr.hazard_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
  const count = await pool.query(`SELECT COUNT(*) AS total FROM hazard_record hr WHERE ${where}`, params);
  const total = parseInt(count.rows[0].total);
  params.push(parseInt(pageSize), offset);
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     LEFT JOIN employee r ON hr.responsible_id = r.id
     WHERE ${where}
     ORDER BY hr.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, params);
  return { rows: result.rows, total, pageNum: parseInt(page), limitNum: parseInt(pageSize) };
}

// GET /hazard-records/stats
async function getHazardRecordStats() {
  const stats = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'open') AS open_count,
       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE status = 'closed') AS closed,
       COUNT(*) FILTER (WHERE is_closed = false AND deadline_date < CURRENT_DATE) AS overdue
     FROM hazard_record WHERE is_deleted = false`);
  const byLevel = await pool.query(
    `SELECT hazard_level, COUNT(*) AS count FROM hazard_record WHERE is_deleted = false GROUP BY hazard_level ORDER BY count DESC`);
  const byCategory = await pool.query(
    `SELECT hazard_category, COUNT(*) AS count FROM hazard_record WHERE is_deleted = false GROUP BY hazard_category ORDER BY count DESC`);
  return { ...stats.rows[0], byLevel: byLevel.rows, byCategory: byCategory.rows };
}

// GET /hazard-records/open
async function listOpenHazardRecords() {
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     LEFT JOIN employee r ON hr.responsible_id = r.id
     WHERE hr.is_deleted = false AND hr.status IN ('open', 'in_progress')
     ORDER BY hr.hazard_level = 'critical' DESC, hr.hazard_level = 'high' DESC, hr.created_at DESC`);
  return result.rows;
}

// GET /hazard-records/overdue
async function listOverdueHazardRecords() {
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     LEFT JOIN employee r ON hr.responsible_id = r.id
     WHERE hr.is_deleted = false AND hr.is_closed = false AND hr.deadline_date < CURRENT_DATE
     ORDER BY hr.deadline_date, hr.hazard_level`);
  return result.rows;
}

// GET /hazard-records/task/:taskId
async function listHazardRecordsByTask(taskId) {
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     LEFT JOIN employee r ON hr.responsible_id = r.id
     WHERE hr.task_id = $1 AND hr.is_deleted = false
     ORDER BY hr.created_at DESC`, [taskId]);
  return result.rows;
}

// GET /hazard-records/responsible/:employeeId
async function listHazardRecordsByResponsible(employeeId) {
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     WHERE hr.responsible_id = $1 AND hr.is_deleted = false AND hr.is_closed = false
     ORDER BY hr.deadline_date`, [employeeId]);
  return result.rows;
}

// GET /hazard-records/:id
async function getHazardRecord(id) {
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name, rev.name AS reviewer_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     LEFT JOIN employee r ON hr.responsible_id = r.id
     LEFT JOIN employee rev ON hr.reviewer_id = rev.id
     WHERE hr.id = $1 AND hr.is_deleted = false`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0] };
}

// POST /hazard-records
async function createHazardRecord(body, userId) {
  const { hazard_code, task_id, record_id, employee_id, department_id, position_id,
          hazard_level = 'medium', hazard_category, hazard_type, description, location, photos, evidence,
          root_cause, responsible_id, corrective_actions, deadline_date, status = 'open' } = body;
  if (!hazard_code || !task_id || !employee_id || !description || !responsible_id || !deadline_date) {
    return { error: -3, message: '缺少必填字段' };
  }
  if (!VALID_HAZARD_LEVELS.includes(hazard_level)) return { error: -3, message: `hazard_level 必须为: ${VALID_HAZARD_LEVELS.join(', ')}` };
  if (!VALID_HAZARD_CATEGORIES.includes(hazard_category)) return { error: -3, message: `hazard_category 必须为: ${VALID_HAZARD_CATEGORIES.join(', ')}` };
  if (!VALID_HAZARD_STATUSES.includes(status)) return { error: -3, message: `status 必须为: ${VALID_HAZARD_STATUSES.join(', ')}` };
  const result = await pool.query(
    `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
      hazard_level, hazard_category, hazard_type, description, location, photos, evidence,
      root_cause, responsible_id, corrective_actions, deadline_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [hazard_code, task_id, record_id || null, employee_id, department_id || null, position_id || null,
     hazard_level, hazard_category, hazard_type || null, description, location || null,
     photos ? JSON.stringify(photos) : null, evidence ? JSON.stringify(evidence) : null,
     root_cause || null, responsible_id, corrective_actions ? JSON.stringify(corrective_actions) : null,
     deadline_date, status, userId || null]);
  return { row: result.rows[0] };
}

// PUT /hazard-records/:id
async function updateHazardRecord(id, body) {
  if (body.hazard_level && !VALID_HAZARD_LEVELS.includes(body.hazard_level)) return { error: -3, message: `hazard_level 必须为: ${VALID_HAZARD_LEVELS.join(', ')}` };
  if (body.hazard_category && !VALID_HAZARD_CATEGORIES.includes(body.hazard_category)) return { error: -3, message: `hazard_category 必须为: ${VALID_HAZARD_CATEGORIES.join(', ')}` };
  if (body.status && !VALID_HAZARD_STATUSES.includes(body.status)) return { error: -3, message: `status 必须为: ${VALID_HAZARD_STATUSES.join(', ')}` };
  const fields = [];
  const params = [];
  let idx = 1;
  const mappings = {
    hazard_code: 'hazard_code', hazard_level: 'hazard_level', hazard_category: 'hazard_category',
    hazard_type: 'hazard_type', description: 'description', location: 'location',
    root_cause: 'root_cause', responsible_id: 'responsible_id', deadline_date: 'deadline_date',
    actual_completion_date: 'actual_completion_date', status: 'status', review_status: 'review_status',
    review_comment: 'review_comment', review_date: 'review_date', is_closed: 'is_closed'
  };
  for (const [key, col] of Object.entries(mappings)) {
    if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
  }
  if (body.photos !== undefined) { fields.push(`photos = $${idx}`); params.push(body.photos ? JSON.stringify(body.photos) : null); idx++; }
  if (body.evidence !== undefined) { fields.push(`evidence = $${idx}`); params.push(body.evidence ? JSON.stringify(body.evidence) : null); idx++; }
  if (body.corrective_actions !== undefined) { fields.push(`corrective_actions = $${idx}`); params.push(body.corrective_actions ? JSON.stringify(body.corrective_actions) : null); idx++; }
  if (fields.length === 0) return { error: -3, message: '请提供要更新的字段' };
  fields.push('updated_at = NOW()');
  params.push(id);
  const result = await pool.query(`UPDATE hazard_record SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0] };
}

// PUT /hazard-records/:id/assign
async function assignHazardRecord(id, body) {
  const { responsible_id, deadline_date } = body;
  if (!responsible_id) return { error: -3, message: '请指定整改责任人' };
  const result = await pool.query(
    `UPDATE hazard_record SET responsible_id = $1, deadline_date = COALESCE($2, deadline_date), updated_at = NOW()
     WHERE id = $3 AND is_deleted = false RETURNING *`,
    [responsible_id, deadline_date || null, id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0] };
}

// PUT /hazard-records/:id/complete
async function completeHazardRecord(id, body) {
  const { corrective_actions, actual_completion_date } = body;
  const result = await pool.query(
    `UPDATE hazard_record SET
       status = 'pending_review',
       corrective_actions = $1,
       actual_completion_date = COALESCE($2, CURRENT_DATE),
       updated_at = NOW()
     WHERE id = $3 AND is_deleted = false AND status IN ('open', 'in_progress') RETURNING *`,
    [corrective_actions ? JSON.stringify(corrective_actions) : null, actual_completion_date || null, id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在或状态不允许完成' };
  return { row: result.rows[0] };
}

// PUT /hazard-records/:id/review
async function reviewHazardRecord(id, body, userId) {
  const { review_status, review_comment } = body;
  if (!review_status || !VALID_REVIEW_STATUSES.includes(review_status)) {
    return { error: -3, message: `review_status 必须为: ${VALID_REVIEW_STATUSES.join(', ')}` };
  }
  const isClosed = review_status === 'passed';
  const result = await pool.query(
    `UPDATE hazard_record SET
       review_status = $1,
       review_comment = $2,
       reviewer_id = $3,
       review_date = CURRENT_DATE,
       is_closed = $4,
       status = CASE WHEN $4 THEN 'closed' ELSE status END,
       updated_at = NOW()
     WHERE id = $5 AND is_deleted = false RETURNING *`,
    [review_status, review_comment || null, userId || null, isClosed, id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0], reviewStatus: review_status };
}

// PUT /hazard-records/:id/close
async function closeHazardRecord(id) {
  const result = await pool.query(
    `UPDATE hazard_record SET is_closed = true, status = 'closed', updated_at = NOW()
     WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0] };
}

// DELETE /hazard-records/:id
async function deleteHazardRecord(id) {
  const result = await pool.query(`UPDATE hazard_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0] };
}

// ============================================================
// 五、检查清单模板 API
// ============================================================

// GET /checklist-templates
async function listChecklistTemplates(query) {
  const { template_category, is_active, keyword, page = 1, pageSize = 20 } = query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  let where = 'ict.is_deleted = false';
  const params = [];
  let idx = 1;
  if (template_category) { where += ` AND ict.template_category = $${idx}`; params.push(template_category); idx++; }
  if (is_active !== undefined) { where += ` AND ict.is_active = $${idx}`; params.push(is_active === 'true'); idx++; }
  if (keyword) { where += ` AND (ict.template_name ILIKE $${idx} OR ict.template_code ILIKE $${idx})`; params.push(`%${keyword}%`); idx++; }
  const count = await pool.query(`SELECT COUNT(*) AS total FROM inspection_checklist_template ict WHERE ${where}`, params);
  const total = parseInt(count.rows[0].total);
  params.push(parseInt(pageSize), offset);
  const result = await pool.query(
    `SELECT ict.*, e.name AS created_by_name,
            (SELECT COUNT(*) FROM inspection_checklist_item ici WHERE ici.template_id = ict.id AND ici.is_deleted = false) AS items_count
     FROM inspection_checklist_template ict
     LEFT JOIN employee e ON ict.created_by = e.id
     WHERE ${where}
     ORDER BY ict.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`, params);
  return { rows: result.rows, total, pageNum: parseInt(page), limitNum: parseInt(pageSize) };
}

// GET /checklist-templates/:id
async function getChecklistTemplate(id) {
  const templateResult = await pool.query(
    `SELECT ict.*, e.name AS created_by_name
     FROM inspection_checklist_template ict
     LEFT JOIN employee e ON ict.created_by = e.id
     WHERE ict.id = $1 AND ict.is_deleted = false`, [id]);
  if (templateResult.rows.length === 0) return { error: -2, message: '模板不存在' };
  const itemsResult = await pool.query(
    `SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order, id`,
    [id]);
  return { row: { ...templateResult.rows[0], items: itemsResult.rows } };
}

// POST /checklist-templates
async function createChecklistTemplate(body, userId) {
  const { template_name, template_code, template_category, description, version = '1.0', applicable_scope, remark } = body;
  if (!template_name || !template_code) return { error: -3, message: '缺少必填字段' };
  const result = await pool.query(
    `INSERT INTO inspection_checklist_template (template_name, template_code, template_category, description, version, applicable_scope, remark, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [template_name, template_code, template_category || null, description || null, version, applicable_scope || null, remark || null, userId || null]);
  return { row: result.rows[0] };
}

// PUT /checklist-templates/:id
async function updateChecklistTemplate(id, body) {
  const fields = [];
  const params = [];
  let idx = 1;
  const mappings = { template_name: 'template_name', template_category: 'template_category', description: 'description', version: 'version', is_active: 'is_active', applicable_scope: 'applicable_scope', remark: 'remark' };
  for (const [key, col] of Object.entries(mappings)) {
    if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
  }
  if (fields.length === 0) return { error: -3, message: '请提供要更新的字段' };
  fields.push('updated_at = NOW()');
  params.push(id);
  const result = await pool.query(`UPDATE inspection_checklist_template SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
  if (result.rows.length === 0) return { error: -2, message: '模板不存在' };
  return { row: result.rows[0] };
}

// DELETE /checklist-templates/:id
async function deleteChecklistTemplate(id) {
  const result = await pool.query(`UPDATE inspection_checklist_template SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '模板不存在' };
  await pool.query(`UPDATE inspection_checklist_item SET is_deleted = true WHERE template_id = $1`, [id]);
  return { row: result.rows[0] };
}

// POST /checklist-templates/:id/apply — 应用模板到计划
async function applyChecklistTemplate(id, body) {
  const { plan_id } = body;
  if (!plan_id) return { error: -3, message: '请指定计划ID' };
  const templateResult = await pool.query(`SELECT * FROM inspection_checklist_template WHERE id = $1 AND is_deleted = false`, [id]);
  if (templateResult.rows.length === 0) return { error: -2, message: '模板不存在' };
  const itemsResult = await pool.query(`SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order`, [id]);
  await pool.query(`UPDATE inspection_plan SET template_id = $1, updated_at = NOW() WHERE id = $2`, [id, plan_id]);
  return { row: { template_id: id, plan_id, items_count: itemsResult.rows.length } };
}

// ============================================================
// 六、检查项模板 API
// ============================================================

// GET /checklist-items/template/:templateId
async function listChecklistItemsByTemplate(templateId) {
  const result = await pool.query(
    `SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order, id`,
    [templateId]);
  return result.rows;
}

// POST /checklist-items
async function createChecklistItem(body, userId) {
  const { template_id, item_code, item_name, item_category, description, standard_requirement, inspection_method, sort_order = 0, is_required = true, remark } = body;
  if (!template_id || !item_name) return { error: -3, message: '缺少必填字段' };
  const result = await pool.query(
    `INSERT INTO inspection_checklist_item (template_id, item_code, item_name, item_category, description, standard_requirement, inspection_method, sort_order, is_required, remark, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [template_id, item_code || null, item_name, item_category || null, description || null, standard_requirement || null, inspection_method || null, sort_order, is_required, remark || null, userId || null]);
  return { row: result.rows[0] };
}

// PUT /checklist-items/:id
async function updateChecklistItem(id, body) {
  const fields = [];
  const params = [];
  let idx = 1;
  const mappings = { item_code: 'item_code', item_name: 'item_name', item_category: 'item_category', description: 'description', standard_requirement: 'standard_requirement', inspection_method: 'inspection_method', sort_order: 'sort_order', is_required: 'is_required', remark: 'remark' };
  for (const [key, col] of Object.entries(mappings)) {
    if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
  }
  if (fields.length === 0) return { error: -3, message: '请提供要更新的字段' };
  fields.push('updated_at = NOW()');
  params.push(id);
  const result = await pool.query(`UPDATE inspection_checklist_item SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
  if (result.rows.length === 0) return { error: -2, message: '检查项不存在' };
  return { row: result.rows[0] };
}

// DELETE /checklist-items/:id
async function deleteChecklistItem(id) {
  const result = await pool.query(`UPDATE inspection_checklist_item SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  if (result.rows.length === 0) return { error: -2, message: '检查项不存在' };
  return { row: result.rows[0] };
}

// POST /checklist-items/batch-create
async function batchCreateChecklistItems(body, userId) {
  const { template_id, items } = body;
  if (!template_id || !Array.isArray(items) || items.length === 0) return { error: -3, message: '缺少必填字段' };
  let successCount = 0, failCount = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      try {
        await client.query(
          `INSERT INTO inspection_checklist_item (template_id, item_code, item_name, item_category, sort_order, is_required, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [template_id, item.item_code || null, item.item_name, item.item_category || null, item.sort_order || 0, item.is_required !== false, userId || null]);
        successCount++;
      } catch (e) { failCount++; }
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return { total: items.length, success: successCount, failed: failCount };
}

// ============================================================
// 七、隐患来源追踪 API
// ============================================================

// GET /hazard-records/source/:sourceType/:sourceId
async function listHazardRecordsBySource(sourceType, sourceId) {
  if (!VALID_SOURCE_TYPES.includes(sourceType)) return { error: -3, message: `source_type 必须为: ${VALID_SOURCE_TYPES.join(', ')}` };
  const result = await pool.query(
    `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
     FROM hazard_record hr
     LEFT JOIN employee e ON hr.employee_id = e.id
     LEFT JOIN employee r ON hr.responsible_id = r.id
     WHERE hr.source_type = $1 AND hr.source_id = $2 AND hr.is_deleted = false`,
    [sourceType, sourceId]);
  return result.rows;
}

// POST /hazard-records/from-inspection — 从检查记录创建隐患
async function createHazardRecordFromInspection(body, userId) {
  const { record_id, hazard_level = 'medium', hazard_category, description, location, responsible_id, deadline_date } = body;
  if (!record_id || !description || !responsible_id || !deadline_date) return { error: -3, message: '缺少必填字段' };
  // 获取检查记录
  const recordResult = await pool.query(`SELECT * FROM inspection_record WHERE id = $1 AND is_deleted = false`, [record_id]);
  if (recordResult.rows.length === 0) return { error: -2, message: '检查记录不存在' };
  const record = recordResult.rows[0];
  // 创建隐患记录
  const hazardCode = `HD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  const hazardResult = await pool.query(
    `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
      hazard_level, hazard_category, hazard_type, description, location, responsible_id, deadline_date, status,
      source_type, source_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [hazardCode, record.task_id, record.id, record.employee_id, null, record.position_id,
     hazard_level, hazard_category || record.item_category || 'safety', record.item_name, description, location || record.inspection_location,
     responsible_id, deadline_date, 'open', 'inspection', record.id, userId || null]);
  // 更新检查记录
  await pool.query(`UPDATE inspection_record SET is_hazard_detected = true, hazard_record_id = $1 WHERE id = $2`, [hazardResult.rows[0].id, record_id]);
  return { row: hazardResult.rows[0] };
}

// PUT /hazard-records/:id/confirm — 确认隐患
async function confirmHazardRecord(id, userId) {
  const result = await pool.query(
    `UPDATE hazard_record SET confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND is_deleted = false RETURNING *`,
    [userId || null, id]);
  if (result.rows.length === 0) return { error: -2, message: '隐患记录不存在' };
  return { row: result.rows[0] };
}

module.exports = {
  VALID_PLAN_TYPES,
  VALID_PLAN_CATEGORIES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALID_APPROVAL_STATUSES,
  VALID_RECORD_RESULTS,
  VALID_HAZARD_LEVELS,
  VALID_HAZARD_CATEGORIES,
  VALID_HAZARD_STATUSES,
  VALID_REVIEW_STATUSES,
  VALID_SOURCE_TYPES,
  listInspectionPlans,
  getInspectionPlanStats,
  getInspectionPlan,
  createInspectionPlan,
  updateInspectionPlan,
  deleteInspectionPlan,
  generateInspectionTasks,
  batchGenerateInspectionTasks,
  listInspectionTasks,
  getInspectionTaskStats,
  getInspectionTask,
  listInspectionTasksByAssignee,
  createInspectionTask,
  updateInspectionTask,
  startInspectionTask,
  completeInspectionTask,
  approveInspectionTask,
  deleteInspectionTask,
  listInspectionRecords,
  getInspectionRecordStats,
  getInspectionRecord,
  listInspectionRecordsByTask,
  listInspectionRecordsByEmployee,
  createInspectionRecord,
  updateInspectionRecord,
  deleteInspectionRecord,
  batchCreateInspectionRecords,
  listHazardRecords,
  getHazardRecordStats,
  listOpenHazardRecords,
  listOverdueHazardRecords,
  listHazardRecordsByTask,
  listHazardRecordsByResponsible,
  getHazardRecord,
  createHazardRecord,
  updateHazardRecord,
  assignHazardRecord,
  completeHazardRecord,
  reviewHazardRecord,
  closeHazardRecord,
  deleteHazardRecord,
  listChecklistTemplates,
  getChecklistTemplate,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  applyChecklistTemplate,
  listChecklistItemsByTemplate,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  batchCreateChecklistItems,
  listHazardRecordsBySource,
  createHazardRecordFromInspection,
  confirmHazardRecord,
};