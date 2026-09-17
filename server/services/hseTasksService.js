/**
 * HSE 任务中心（/api/hse/tasks）—— service 层
 * 原 routes/hse-tasks.js 的业务逻辑全部下沉至此（任务/D全集列表、详情、状态流转、
 * 检查任务执行、统计、待办/逾期，以及 reminder 提醒、workflow 工作流与考核事件联动）。
 *
 * 契约：每个对外函数返回统一描述符，由 controller 的 respond() 解释为对外响应：
 *   - 成功 JSON：{ __t:'json', payload, message } → res.json(success(payload, message))（HTTP 200）
 *   - 业务错误：{ __t:'json', error:{ code, message }, httpStatus }
 *     code 沿袭原 error(msg) 只传一参的怪异写法 → 文案落在 code 字段、message 为默认 '操作失败'；
 *     httpStatus 承载原 res.status(404/400)。
 *   - 非预期异常：抛错，由 controller 的 run() 归一为 res.status(500).json(error(err.message))。
 */

const { pool } = require('../config/db');
const workflowService = require('./workflowService');
const reminderService = require('./reminderService');
const assessmentEvent = require('./assessmentEventService');

const ok = (payload, message) => ({ __t: 'json', payload, message });
const fail = (message, httpStatus) => ({ __t: 'json', error: { code: message, message: '操作失败' }, httpStatus });

// ========== GET / — 任务列表 ==========
async function list(query) {
  const { task_type, status, responsible_person_id, department_id, page = 1, size = 20 } = query;

  let whereClause = 'WHERE t.is_deleted = FALSE';
  const params = [];
  let paramIndex = 1;

  if (task_type) {
    whereClause += ` AND t.task_type = $${paramIndex++}`;
    params.push(task_type);
  }
  if (status) {
    whereClause += ` AND t.status = $${paramIndex++}`;
    params.push(status);
  }
  if (responsible_person_id) {
    whereClause += ` AND t.responsible_person_id = $${paramIndex++}`;
    params.push(responsible_person_id);
  }
  if (department_id) {
    whereClause += ` AND t.department_id = $${paramIndex++}`;
    params.push(department_id);
  }

  const offset = (page - 1) * size;

  const result = await pool.query(
    `SELECT t.*, d.name AS department_name
     FROM hse_tasks t
     LEFT JOIN departments d ON t.department_id = d.id
     ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, size, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM hse_tasks t ${whereClause}`,
    params
  );

  return ok({
    list: result.rows,
    total: parseInt(countResult.rows[0].total),
    page: parseInt(page),
    size: parseInt(size)
  });
}

// ========== GET /:taskId — 任务详情 ==========
async function detail(params) {
  const { taskId } = params;

  const result = await pool.query(
    `SELECT t.*, d.name AS department_name,
            e.event_code, e.title AS event_title, e.severity, e.status AS event_status
     FROM hse_tasks t
     LEFT JOIN departments d ON t.department_id = d.id
     LEFT JOIN hse_events e ON t.source_event_id = e.id
     WHERE t.id = $1 AND t.is_deleted = FALSE`,
    [taskId]
  );

  if (result.rows.length === 0) {
    return fail('任务不存在', 404);
  }

  const task = result.rows[0];

  // 获取提醒记录
  const reminders = await reminderService.getTaskReminders(taskId);

  return ok({ ...task, reminders });
}

// ========== PUT /:taskId/status — 更新任务状态 ==========
async function updateStatus(params, body) {
  const { taskId } = params;
  const { status } = body;

  if (!status) {
    return fail('缺少状态参数', 400);
  }

  // 获取任务当前信息
  const taskResult = await pool.query(
    `SELECT * FROM hse_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    return fail('任务不存在', 404);
  }

  const task = taskResult.rows[0];

  // 更新状态
  const updateResult = await pool.query(
    `UPDATE hse_tasks
     SET status = $1,
         completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, taskId]
  );

  // 事件时效优化：任务进入完成态 → 实时撤销逾期扣分
  if (['completed', 'done', '已完成'].includes(status)) {
    assessmentEvent.publish(assessmentEvent.EVENT_TYPES.TASK_DONE, {
      taskId: task.id,
      title: task.title,
      assigneeId: task.responsible_person_id,
      deadline: task.deadline,
      eventDate: new Date().toISOString(),
    });
  }

  // 触发工作流
  if (status === 'completed') {
    if (task.task_type === 'rectification') {
      await workflowService.onRectificationCompleted({
        id: task.source_id,
        hazard_id: task.source_event_id,
        responsible_person_id: task.responsible_person_id,
        responsible_person_name: task.responsible_person,
        department_id: task.department_id,
        created_by: task.created_by
      });
    }
  }

  return ok(updateResult.rows[0], '任务状态更新成功');
}

// ========== POST / — 创建任务 ==========
async function create(body, req) {
  const {
    task_type,
    source_event_id,
    source_table,
    source_id,
    title,
    description,
    responsible_person_id,
    responsible_person,
    department_id,
    priority,
    deadline
  } = body;

  if (!task_type || !title) {
    return fail('缺少必要参数：task_type, title', 400);
  }

  const result = await pool.query(
    `INSERT INTO hse_tasks (
      task_code, task_type, source_event_id, source_table, source_id,
      title, description, responsible_person_id, responsible_person,
      department_id, priority, deadline, status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      workflowService.generateTaskCode(task_type),
      task_type,
      source_event_id || null,
      source_table || null,
      source_id || null,
      title,
      description || null,
      responsible_person_id || null,
      responsible_person || null,
      department_id || null,
      priority || 'normal',
      deadline || null,
      'pending',
      req.user?.id || 1
    ]
  );

  const task = result.rows[0];

  // 调度提醒
  if (deadline) {
    await reminderService.scheduleReminder(task.id, 'approaching', deadline);
  }

  // 事件时效优化：创建即已逾期的任务，实时发布逾期扣分事件
  if (deadline && new Date(deadline).getTime() < Date.now()) {
    assessmentEvent.publish(assessmentEvent.EVENT_TYPES.TASK_OVERDUE, {
      taskId: task.id,
      title: task.title,
      assigneeId: task.responsible_person_id,
      deadline,
      eventDate: new Date().toISOString(),
    });
  }

  return ok(task, '任务创建成功');
}

// ========== DELETE /:taskId — 删除任务 ==========
async function remove(params) {
  const { taskId } = params;

  const result = await pool.query(
    `UPDATE hse_tasks SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [taskId]
  );

  if (result.rows.length === 0) {
    return fail('任务不存在', 404);
  }

  return ok(null, '任务删除成功');
}

// ========== GET /stats/overview — 任务统计 ==========
async function statsOverview() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
      COUNT(*) FILTER (WHERE is_overdue = TRUE) AS overdue_count,
      COUNT(*) FILTER (WHERE task_type = 'rectification') AS rectification_count,
      COUNT(*) FILTER (WHERE task_type = 'review') AS review_count,
      COUNT(*) FILTER (WHERE task_type = 'training') AS training_count,
      COUNT(*) FILTER (WHERE task_type = 'inspection') AS inspection_count,
      COUNT(*) AS total_count
    FROM hse_tasks
    WHERE is_deleted = FALSE
  `);

  const stats = result.rows[0];

  // 计算完成率
  const total = parseInt(stats.total_count);
  const completed = parseInt(stats.completed_count);
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return ok({ ...stats, completion_rate: completionRate });
}

// ========== GET /stats/ranking — 责任人排名 ==========
async function statsRanking() {
  const result = await pool.query(`
    SELECT
      t.responsible_person,
      COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_count,
      COUNT(*) FILTER (WHERE t.is_overdue = TRUE) AS overdue_count,
      COUNT(*) AS total_count
    FROM hse_tasks t
    WHERE t.is_deleted = FALSE
      AND t.responsible_person IS NOT NULL
    GROUP BY t.responsible_person
    ORDER BY completed_count DESC, overdue_count ASC
    LIMIT 10
  `);

  const rankings = result.rows.map(row => ({
    ...row,
    completion_rate: parseInt(row.total_count) > 0
      ? Math.round((parseInt(row.completed_count) / parseInt(row.total_count)) * 100)
      : 0
  }));

  return ok(rankings);
}

// ========== GET /inspection — 检查任务列表 ==========
async function listInspection(query) {
  const { plan_id, executor_id, department_id, status, scheduled_date } = query;

  let whereClause = 'WHERE it.is_deleted = FALSE';
  const params = [];
  let paramIndex = 1;

  if (plan_id) {
    whereClause += ` AND it.plan_id = $${paramIndex++}`;
    params.push(plan_id);
  }
  if (executor_id) {
    whereClause += ` AND it.executor_id = $${paramIndex++}`;
    params.push(executor_id);
  }
  if (department_id) {
    whereClause += ` AND it.department_id = $${paramIndex++}`;
    params.push(department_id);
  }
  if (status) {
    whereClause += ` AND it.status = $${paramIndex++}`;
    params.push(status);
  }
  if (scheduled_date) {
    whereClause += ` AND it.scheduled_date = $${paramIndex++}`;
    params.push(scheduled_date);
  }

  const result = await pool.query(
    `SELECT it.*, ip.plan_code, ip.plan_name, d.name AS department_name
     FROM hse_inspection_tasks it
     LEFT JOIN hse_inspection_plans ip ON it.plan_id = ip.id
     LEFT JOIN departments d ON it.department_id = d.id
     ${whereClause}
     ORDER BY it.scheduled_date ASC`,
    params
  );

  return ok({ list: result.rows, total: result.rows.length });
}

// ========== POST /inspection — 创建检查任务 ==========
async function createInspection(body, req) {
  const { plan_id, executor_id, executor_name, department_id, scheduled_date } = body;

  if (!plan_id || !scheduled_date) {
    return fail('缺少必要参数：plan_id, scheduled_date', 400);
  }

  const result = await pool.query(
    `INSERT INTO hse_inspection_tasks (
      plan_id, task_code, executor_id, executor_name,
      department_id, scheduled_date, status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      plan_id,
      `IT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      executor_id || null,
      executor_name || null,
      department_id || null,
      scheduled_date,
      'pending',
      req.user?.id || 1
    ]
  );

  return ok(result.rows[0], '检查任务创建成功');
}

// ========== POST /inspection/:taskId/execute — 执行检查任务 ==========
async function executeInspection(params, body) {
  const { taskId } = params;
  const { findings } = body;

  const taskResult = await pool.query(
    `SELECT * FROM hse_inspection_tasks WHERE id = $1 AND is_deleted = FALSE`,
    [taskId]
  );

  if (taskResult.rows.length === 0) {
    return fail('检查任务不存在', 404);
  }

  const task = taskResult.rows[0];

  const findingsCount = await workflowService.executeInspectionTask(task, findings || []);

  return ok({
    task_id: taskId,
    findings_count: findingsCount,
    message: `检查完成，发现 ${findingsCount} 项隐患`
  });
}

// ========== GET /pending — 待办任务 ==========
async function pending(query) {
  const { responsible_person_id, department_id } = query;

  let whereClause = "WHERE t.is_deleted = FALSE AND t.status IN ('pending', 'in_progress')";
  const params = [];
  let paramIndex = 1;

  if (responsible_person_id) {
    whereClause += ` AND t.responsible_person_id = $${paramIndex++}`;
    params.push(responsible_person_id);
  }
  if (department_id) {
    whereClause += ` AND t.department_id = $${paramIndex++}`;
    params.push(department_id);
  }

  const result = await pool.query(
    `SELECT t.*, d.name AS department_name
     FROM hse_tasks t
     LEFT JOIN departments d ON t.department_id = d.id
     ${whereClause}
     ORDER BY t.deadline ASC, t.priority DESC`,
    params
  );

  return ok({ list: result.rows, total: result.rows.length });
}

// ========== GET /overdue — 逾期任务 ==========
async function overdue(query) {
  const { department_id } = query;

  let whereClause = 'WHERE t.is_deleted = FALSE AND t.is_overdue = TRUE';
  const params = [];
  let paramIndex = 1;

  if (department_id) {
    whereClause += ` AND t.department_id = $${paramIndex++}`;
    params.push(department_id);
  }

  const result = await pool.query(
    `SELECT t.*, d.name AS department_name
     FROM hse_tasks t
     LEFT JOIN departments d ON t.department_id = d.id
     ${whereClause}
     ORDER BY t.overdue_days DESC, t.escalation_level DESC`,
    params
  );

  return ok({ list: result.rows, total: result.rows.length });
}

module.exports = {
  list,
  detail,
  updateStatus,
  create,
  remove,
  statsOverview,
  statsRanking,
  listInspection,
  createInspection,
  executeInspection,
  pending,
  overdue,
};