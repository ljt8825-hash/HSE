/**
 * HSE 检查管理中心 (inspection_plan / inspection_task / inspection_record / hazard_record / 检查模板 表)
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/inspection-*(...) / hazard-records(...) / checklist-*(...)
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { buildListResponse, buildDetailResponse, camelKeys } = require('../../utils/commonResponse');
const { auditLog } = require('../audit');
const { requireRole, requirePermission } = require('../../middleware/auth');


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

// ============================================================
// 一、inspection_plan — 检查计划
// ============================================================

// GET /inspection-plans
router.get('/inspection-plans', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_type, plan_category, is_active, department_id, responsible_id, keyword, page = 1, pageSize = 20 } = req.query;
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
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-plans/stats
router.get('/inspection-plans/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE is_active = true) AS active,
         COUNT(*) FILTER (WHERE plan_type = 'routine') AS routine,
         COUNT(*) FILTER (WHERE plan_type = 'special') AS special
       FROM inspection_plan WHERE is_deleted = false`);
    const byCategory = await pool.query(
      `SELECT plan_category, COUNT(*) AS count FROM inspection_plan WHERE is_deleted = false AND plan_category IS NOT NULL GROUP BY plan_category ORDER BY count DESC`);
    res.json(success(camelKeys({ ...stats.rows[0], byCategory: byCategory.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-plans/:id
router.get('/inspection-plans/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ip.*, e.name AS responsible_name, d.name AS department_name
       FROM inspection_plan ip
       LEFT JOIN employee e ON ip.responsible_id = e.id
       LEFT JOIN department d ON ip.department_id = d.id
       WHERE ip.id = $1 AND ip.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查计划不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-plans
router.post('/inspection-plans', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_name, plan_code, plan_type = 'routine', plan_category, description, scope_description, inspection_items,
            frequency = 'monthly', frequency_interval = 1, start_date, end_date, next_inspection_date,
            responsible_id, assignee_ids, department_id, position_id, approval_required = false, approval_level = 1,
            remark } = req.body;
    if (!plan_name || !plan_code || !start_date || !responsible_id) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (!VALID_PLAN_TYPES.includes(plan_type)) return res.json(error(-3, `plan_type 必须为: ${VALID_PLAN_TYPES.join(', ')}`));
    if (plan_category && !VALID_PLAN_CATEGORIES.includes(plan_category)) return res.json(error(-3, `plan_category 必须为: ${VALID_PLAN_CATEGORIES.join(', ')}`));
    if (!VALID_INSPECTION_FREQUENCIES.includes(frequency)) return res.json(error(-3, `frequency 必须为: ${VALID_INSPECTION_FREQUENCIES.join(', ')}`));
    const result = await pool.query(
      `INSERT INTO inspection_plan (plan_name, plan_code, plan_type, plan_category, description, scope_description, inspection_items,
        frequency, frequency_interval, start_date, end_date, next_inspection_date,
        responsible_id, assignee_ids, department_id, position_id, approval_required, approval_level, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [plan_name, plan_code, plan_type, plan_category || null, description || null, scope_description || null, inspection_items ? JSON.stringify(inspection_items) : null,
       frequency, frequency_interval, start_date, end_date || null, next_inspection_date || null,
       responsible_id, assignee_ids || null, department_id || null, position_id || null, approval_required, approval_level, remark || null, req.user?.id || null]);
    await auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: '检查计划',
      description: `新增检查计划: ${plan_name}`, ip: req.ip }).catch(() => {});
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-plans/:id
router.put('/inspection-plans/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.plan_type && !VALID_PLAN_TYPES.includes(body.plan_type)) return res.json(error(-3, `plan_type 必须为: ${VALID_PLAN_TYPES.join(', ')}`));
    if (body.plan_category && !VALID_PLAN_CATEGORIES.includes(body.plan_category)) return res.json(error(-3, `plan_category 必须为: ${VALID_PLAN_CATEGORIES.join(', ')}`));
    if (body.frequency && !VALID_INSPECTION_FREQUENCIES.includes(body.frequency)) return res.json(error(-3, `frequency 必须为: ${VALID_INSPECTION_FREQUENCIES.join(', ')}`));
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
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_plan SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查计划不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /inspection-plans/:id
router.delete('/inspection-plans/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_plan SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查计划不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-plans/:id/generate-tasks — 生成检查任务
router.post('/inspection-plans/:id/generate-tasks', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const planResult = await pool.query(`SELECT * FROM inspection_plan WHERE id = $1 AND is_deleted = false AND is_active = true`, [req.params.id]);
    if (planResult.rows.length === 0) return res.json(error(-2, '检查计划不存在或未激活'));
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
       req.user?.id || null]);
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
    buildDetailResponse(res, taskResult.rows[0], '任务生成成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-plans/batch-generate
router.post('/inspection-plans/batch-generate', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const plans = await pool.query(`SELECT * FROM inspection_plan WHERE is_deleted = false AND is_active = true`);
    let generated = 0;
    for (const plan of plans.rows) {
      if (!plan.next_inspection_date || new Date(plan.next_inspection_date) <= new Date()) {
        const taskCode = `${plan.plan_code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}`;
        await pool.query(
          `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, scheduled_date, status, priority, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [plan.id, `${plan.plan_name} - ${new Date().toISOString().slice(0, 10)}`, taskCode,
           plan.responsible_id, new Date().toISOString().slice(0, 10), 'pending', 'normal', req.user?.id || null]);
        generated++;
      }
    }
    res.json(success(camelKeys({ generated }), '批量生成完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 二、inspection_task — 检查任务
// ============================================================

// GET /inspection-tasks
router.get('/inspection-tasks', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_id, assignee_id, status, priority, scheduled_date_from, scheduled_date_to, keyword, page = 1, pageSize = 20 } = req.query;
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
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-tasks/stats
router.get('/inspection-tasks/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
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
    res.json(success(camelKeys({ ...stats.rows[0], byPriority: byPriority.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-tasks/:id
router.get('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT it.*, ip.plan_name, e.name AS assignee_name
       FROM inspection_task it
       LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
       LEFT JOIN employee e ON it.assignee_id = e.id
       WHERE it.id = $1 AND it.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-tasks/assignee/:employeeId
router.get('/inspection-tasks/assignee/:employeeId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT it.*, ip.plan_name
       FROM inspection_task it
       LEFT JOIN inspection_plan ip ON it.plan_id = ip.id
       WHERE it.assignee_id = $1 AND it.is_deleted = false AND it.status IN ('pending', 'in_progress', 'overdue')
       ORDER BY it.scheduled_date`, [req.params.employeeId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-tasks
router.post('/inspection-tasks', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date, due_date,
            priority = 'normal', inspection_items, supervisor_id } = req.body;
    if (!plan_id || !task_name || !task_code || !assignee_id || !scheduled_date) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (priority && !VALID_TASK_PRIORITIES.includes(priority)) return res.json(error(-3, `priority 必须为: ${VALID_TASK_PRIORITIES.join(', ')}`));
    const result = await pool.query(
      `INSERT INTO inspection_task (plan_id, task_name, task_code, assignee_id, inspectors, scheduled_date,
        due_date, status, priority, inspection_items, total_items_count, supervisor_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [plan_id, task_name, task_code, assignee_id, inspectors || null, scheduled_date,
       due_date || null, 'pending', priority, inspection_items ? JSON.stringify(inspection_items) : null,
       inspection_items ? JSON.parse(inspection_items).length : 0, supervisor_id || null, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id
router.put('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.status && !VALID_TASK_STATUSES.includes(body.status)) return res.json(error(-3, `status 必须为: ${VALID_TASK_STATUSES.join(', ')}`));
    if (body.priority && !VALID_TASK_PRIORITIES.includes(body.priority)) return res.json(error(-3, `priority 必须为: ${VALID_TASK_PRIORITIES.join(', ')}`));
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
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_task SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id/start
router.put('/inspection-tasks/:id/start', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE inspection_task SET status = 'in_progress', actual_start_time = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_deleted = false AND status = 'pending' RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '任务不存在或状态不允许开始'));
    buildDetailResponse(res, result.rows[0], '任务已开始', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id/complete
router.put('/inspection-tasks/:id/complete', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { result_summary } = req.body;
    const result = await pool.query(
      `UPDATE inspection_task SET status = 'completed', actual_end_time = NOW(), result_summary = $1, updated_at = NOW()
       WHERE id = $2 AND is_deleted = false AND status = 'in_progress' RETURNING *`,
      [result_summary || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '任务不存在或状态不允许完成'));
    buildDetailResponse(res, result.rows[0], '任务已完成', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-tasks/:id/approve
router.put('/inspection-tasks/:id/approve', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { approval_status, approval_comment } = req.body;
    if (!approval_status || !VALID_APPROVAL_STATUSES.includes(approval_status)) {
      return res.json(error(-3, `approval_status 必须为: ${VALID_APPROVAL_STATUSES.join(', ')}`));
    }
    const result = await pool.query(
      `UPDATE inspection_task SET approval_status = $1, approval_comment = $2, approval_time = NOW(), approved_by = $3, updated_at = NOW()
       WHERE id = $4 AND is_deleted = false RETURNING *`,
      [approval_status, approval_comment || null, req.user?.id || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], '审批完成', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /inspection-tasks/:id
router.delete('/inspection-tasks/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_task SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查任务不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 三、inspection_record — 检查记录
// ============================================================

// GET /inspection-records
router.get('/inspection-records', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { task_id, employee_id, result, is_hazard_detected, inspection_time_from, inspection_time_to, page = 1, pageSize = 20 } = req.query;
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
    buildListResponse(res, result2.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/stats
router.get('/inspection-records/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const stats = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE result = 'pass') AS passed,
         COUNT(*) FILTER (WHERE result = 'fail') AS failed,
         COUNT(*) FILTER (WHERE is_hazard_detected = true) AS hazards_found
       FROM inspection_record WHERE is_deleted = false`);
    const byCategory = await pool.query(
      `SELECT item_category, COUNT(*) AS count FROM inspection_record WHERE is_deleted = false AND item_category IS NOT NULL GROUP BY item_category ORDER BY count DESC`);
    res.json(success(camelKeys({ ...stats.rows[0], byCategory: byCategory.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/:id
router.get('/inspection-records/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ir.*, e.name AS employee_name, it.task_name
       FROM inspection_record ir
       LEFT JOIN employee e ON ir.employee_id = e.id
       LEFT JOIN inspection_task it ON ir.task_id = it.id
       WHERE ir.id = $1 AND ir.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/task/:taskId
router.get('/inspection-records/task/:taskId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ir.*, e.name AS employee_name
       FROM inspection_record ir
       LEFT JOIN employee e ON ir.employee_id = e.id
       WHERE ir.task_id = $1 AND ir.is_deleted = false
       ORDER BY ir.inspection_time DESC`, [req.params.taskId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /inspection-records/employee/:employeeId
router.get('/inspection-records/employee/:employeeId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT ir.*, it.task_name
       FROM inspection_record ir
       LEFT JOIN inspection_task it ON ir.task_id = it.id
       WHERE ir.employee_id = $1 AND ir.is_deleted = false
       ORDER BY ir.inspection_time DESC`, [req.params.employeeId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-records
router.post('/inspection-records', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { task_id, plan_id, employee_id, position_id, inspection_time, inspection_location,
            item_name, item_category, item_code, result = 'pass', comment, photos, attachments,
            ai_analysis, ai_suggestion, ai_confidence, is_hazard_detected = false } = req.body;
    if (!task_id || !employee_id || !item_name || !inspection_time) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (!VALID_RECORD_RESULTS.includes(result)) return res.json(error(-3, `result 必须为: ${VALID_RECORD_RESULTS.join(', ')}`));
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
         employee_id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), 'open', req.user?.id || null]);
      await pool.query(`UPDATE inspection_record SET hazard_record_id = $1 WHERE id = $2`,
        [hazardResult.rows[0].id, insertResult.rows[0].id]);
      await pool.query(`UPDATE inspection_task SET hazards_found_count = COALESCE(hazards_found_count, 0) + 1 WHERE id = $1`, [task_id]);
    }
    buildDetailResponse(res, insertResult.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /inspection-records/:id
router.put('/inspection-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.result && !VALID_RECORD_RESULTS.includes(body.result)) return res.json(error(-3, `result 必须为: ${VALID_RECORD_RESULTS.join(', ')}`));
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
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_record SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /inspection-records/:id
router.delete('/inspection-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /inspection-records/batch-create
router.post('/inspection-records/batch-create', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.json(error(-3, '请提供检查记录数组'));
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
    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount, errors }), '批量创建完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 四、hazard_record — 隐患记录
// ============================================================

// GET /hazard-records
router.get('/hazard-records', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { task_id, responsible_id, hazard_level, hazard_category, status, is_closed, keyword, page = 1, pageSize = 20 } = req.query;
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
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/stats
router.get('/hazard-records/stats', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
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
    res.json(success(camelKeys({ ...stats.rows[0], byLevel: byLevel.rows, byCategory: byCategory.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/open（必须在 /:id 之前）
router.get('/hazard-records/open', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.is_deleted = false AND hr.status IN ('open', 'in_progress')
       ORDER BY hr.hazard_level = 'critical' DESC, hr.hazard_level = 'high' DESC, hr.created_at DESC`);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/overdue（必须在 /:id 之前）
router.get('/hazard-records/overdue', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.is_deleted = false AND hr.is_closed = false AND hr.deadline_date < CURRENT_DATE
       ORDER BY hr.deadline_date, hr.hazard_level`);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/task/:taskId（必须在 /:id 之前）
router.get('/hazard-records/task/:taskId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.task_id = $1 AND hr.is_deleted = false
       ORDER BY hr.created_at DESC`, [req.params.taskId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/responsible/:employeeId（必须在 /:id 之前）
router.get('/hazard-records/responsible/:employeeId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       WHERE hr.responsible_id = $1 AND hr.is_deleted = false AND hr.is_closed = false
       ORDER BY hr.deadline_date`, [req.params.employeeId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /hazard-records/:id
router.get('/hazard-records/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name, rev.name AS reviewer_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       LEFT JOIN employee rev ON hr.reviewer_id = rev.id
       WHERE hr.id = $1 AND hr.is_deleted = false`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /hazard-records
router.post('/hazard-records', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { hazard_code, task_id, record_id, employee_id, department_id, position_id,
            hazard_level = 'medium', hazard_category, hazard_type, description, location, photos, evidence,
            root_cause, responsible_id, corrective_actions, deadline_date, status = 'open' } = req.body;
    if (!hazard_code || !task_id || !employee_id || !description || !responsible_id || !deadline_date) {
      return res.json(error(-3, '缺少必填字段'));
    }
    if (!VALID_HAZARD_LEVELS.includes(hazard_level)) return res.json(error(-3, `hazard_level 必须为: ${VALID_HAZARD_LEVELS.join(', ')}`));
    if (!VALID_HAZARD_CATEGORIES.includes(hazard_category)) return res.json(error(-3, `hazard_category 必须为: ${VALID_HAZARD_CATEGORIES.join(', ')}`));
    if (!VALID_HAZARD_STATUSES.includes(status)) return res.json(error(-3, `status 必须为: ${VALID_HAZARD_STATUSES.join(', ')}`));
    const result = await pool.query(
      `INSERT INTO hazard_record (hazard_code, task_id, record_id, employee_id, department_id, position_id,
        hazard_level, hazard_category, hazard_type, description, location, photos, evidence,
        root_cause, responsible_id, corrective_actions, deadline_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [hazard_code, task_id, record_id || null, employee_id, department_id || null, position_id || null,
       hazard_level, hazard_category, hazard_type || null, description, location || null,
       photos ? JSON.stringify(photos) : null, evidence ? JSON.stringify(evidence) : null,
       root_cause || null, responsible_id, corrective_actions ? JSON.stringify(corrective_actions) : null,
       deadline_date, status, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id
router.put('/hazard-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    if (body.hazard_level && !VALID_HAZARD_LEVELS.includes(body.hazard_level)) return res.json(error(-3, `hazard_level 必须为: ${VALID_HAZARD_LEVELS.join(', ')}`));
    if (body.hazard_category && !VALID_HAZARD_CATEGORIES.includes(body.hazard_category)) return res.json(error(-3, `hazard_category 必须为: ${VALID_HAZARD_CATEGORIES.join(', ')}`));
    if (body.status && !VALID_HAZARD_STATUSES.includes(body.status)) return res.json(error(-3, `status 必须为: ${VALID_HAZARD_STATUSES.join(', ')}`));
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
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE hazard_record SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/assign
router.put('/hazard-records/:id/assign', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { responsible_id, deadline_date } = req.body;
    if (!responsible_id) return res.json(error(-3, '请指定整改责任人'));
    const result = await pool.query(
      `UPDATE hazard_record SET responsible_id = $1, deadline_date = COALESCE($2, deadline_date), updated_at = NOW()
       WHERE id = $3 AND is_deleted = false RETURNING *`,
      [responsible_id, deadline_date || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '分配成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/complete
router.put('/hazard-records/:id/complete', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { corrective_actions, actual_completion_date } = req.body;
    const result = await pool.query(
      `UPDATE hazard_record SET
         status = 'pending_review',
         corrective_actions = $1,
         actual_completion_date = COALESCE($2, CURRENT_DATE),
         updated_at = NOW()
       WHERE id = $3 AND is_deleted = false AND status IN ('open', 'in_progress') RETURNING *`,
      [corrective_actions ? JSON.stringify(corrective_actions) : null, actual_completion_date || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在或状态不允许完成'));
    buildDetailResponse(res, result.rows[0], '整改完成，待复查', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/review
router.put('/hazard-records/:id/review', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { review_status, review_comment } = req.body;
    if (!review_status || !VALID_REVIEW_STATUSES.includes(review_status)) {
      return res.json(error(-3, `review_status 必须为: ${VALID_REVIEW_STATUSES.join(', ')}`));
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
      [review_status, review_comment || null, req.user?.id || null, isClosed, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], `复查${review_status === 'passed' ? '通过' : '不通过'}`, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/close
router.put('/hazard-records/:id/close', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE hazard_record SET is_closed = true, status = 'closed', updated_at = NOW()
       WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '已关闭', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /hazard-records/:id
router.delete('/hazard-records/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE hazard_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// Sprint5.4 v65 扩展 - 检查模板 + 来源追踪
// ============================================================

const VALID_SOURCE_TYPES = ['inspection', 'report', 'audit', 'external', 'other'];

// ============================================================
// 检查清单模板 API
// ============================================================

// GET /checklist-templates
router.get('/checklist-templates', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_category, is_active, keyword, page = 1, pageSize = 20 } = req.query;
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
    buildListResponse(res, result.rows, total, parseInt(page), parseInt(pageSize), undefined, { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// GET /checklist-templates/:id
router.get('/checklist-templates/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const templateResult = await pool.query(
      `SELECT ict.*, e.name AS created_by_name
       FROM inspection_checklist_template ict
       LEFT JOIN employee e ON ict.created_by = e.id
       WHERE ict.id = $1 AND ict.is_deleted = false`, [req.params.id]);
    if (templateResult.rows.length === 0) return res.json(error(-2, '模板不存在'));
    const itemsResult = await pool.query(
      `SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order, id`,
      [req.params.id]);
    res.json(success(camelKeys({ ...templateResult.rows[0], items: itemsResult.rows })));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-templates
router.post('/checklist-templates', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_name, template_code, template_category, description, version = '1.0', applicable_scope, remark } = req.body;
    if (!template_name || !template_code) return res.json(error(-3, '缺少必填字段'));
    const result = await pool.query(
      `INSERT INTO inspection_checklist_template (template_name, template_code, template_category, description, version, applicable_scope, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [template_name, template_code, template_category || null, description || null, version, applicable_scope || null, remark || null, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /checklist-templates/:id
router.put('/checklist-templates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = { template_name: 'template_name', template_category: 'template_category', description: 'description', version: 'version', is_active: 'is_active', applicable_scope: 'applicable_scope', remark: 'remark' };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_checklist_template SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '模板不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /checklist-templates/:id
router.delete('/checklist-templates/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_checklist_template SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '模板不存在'));
    await pool.query(`UPDATE inspection_checklist_item SET is_deleted = true WHERE template_id = $1`, [req.params.id]);
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-templates/:id/apply — 应用模板到计划
router.post('/checklist-templates/:id/apply', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { plan_id } = req.body;
    if (!plan_id) return res.json(error(-3, '请指定计划ID'));
    const templateResult = await pool.query(`SELECT * FROM inspection_checklist_template WHERE id = $1 AND is_deleted = false`, [req.params.id]);
    if (templateResult.rows.length === 0) return res.json(error(-2, '模板不存在'));
    const itemsResult = await pool.query(`SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order`, [req.params.id]);
    await pool.query(`UPDATE inspection_plan SET template_id = $1, updated_at = NOW() WHERE id = $2`, [req.params.id, plan_id]);
    res.json(success(camelKeys({ template_id: req.params.id, plan_id, items_count: itemsResult.rows.length }), '模板已应用到计划'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 检查项模板 API
// ============================================================

// GET /checklist-items/template/:templateId
router.get('/checklist-items/template/:templateId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `SELECT * FROM inspection_checklist_item WHERE template_id = $1 AND is_deleted = false ORDER BY sort_order, id`,
      [req.params.templateId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-items
router.post('/checklist-items', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_id, item_code, item_name, item_category, description, standard_requirement, inspection_method, sort_order = 0, is_required = true, remark } = req.body;
    if (!template_id || !item_name) return res.json(error(-3, '缺少必填字段'));
    const result = await pool.query(
      `INSERT INTO inspection_checklist_item (template_id, item_code, item_name, item_category, description, standard_requirement, inspection_method, sort_order, is_required, remark, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [template_id, item_code || null, item_name, item_category || null, description || null, standard_requirement || null, inspection_method || null, sort_order, is_required, remark || null, req.user?.id || null]);
    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /checklist-items/:id
router.put('/checklist-items/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const body = req.body;
    const fields = [];
    const params = [];
    let idx = 1;
    const mappings = { item_code: 'item_code', item_name: 'item_name', item_category: 'item_category', description: 'description', standard_requirement: 'standard_requirement', inspection_method: 'inspection_method', sort_order: 'sort_order', is_required: 'is_required', remark: 'remark' };
    for (const [key, col] of Object.entries(mappings)) {
      if (body[key] !== undefined) { fields.push(`${col} = $${idx}`); params.push(body[key]); idx++; }
    }
    if (fields.length === 0) return res.json(error(-3, '请提供要更新的字段'));
    fields.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await pool.query(`UPDATE inspection_checklist_item SET ${fields.join(', ')} WHERE id = $${idx} AND is_deleted = false RETURNING *`, params);
    if (result.rows.length === 0) return res.json(error(-2, '检查项不存在'));
    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// DELETE /checklist-items/:id
router.delete('/checklist-items/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(`UPDATE inspection_checklist_item SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '检查项不存在'));
    buildDetailResponse(res, result.rows[0], '删除成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /checklist-items/batch-create
router.post('/checklist-items/batch-create', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { template_id, items } = req.body;
    if (!template_id || !Array.isArray(items) || items.length === 0) return res.json(error(-3, '缺少必填字段'));
    let successCount = 0, failCount = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        try {
          await client.query(
            `INSERT INTO inspection_checklist_item (template_id, item_code, item_name, item_category, sort_order, is_required, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [template_id, item.item_code || null, item.item_name, item.item_category || null, item.sort_order || 0, item.is_required !== false, req.user?.id || null]);
          successCount++;
        } catch (e) { failCount++; }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.json(success(camelKeys({ total: items.length, success: successCount, failed: failCount }), '批量创建完成'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// ============================================================
// 隐患来源追踪 API
// ============================================================

// GET /hazard-records/source/:sourceType/:sourceId
router.get('/hazard-records/source/:sourceType/:sourceId', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { sourceType, sourceId } = req.params;
    if (!VALID_SOURCE_TYPES.includes(sourceType)) return res.json(error(-3, `source_type 必须为: ${VALID_SOURCE_TYPES.join(', ')}`));
    const result = await pool.query(
      `SELECT hr.*, e.name AS employee_name, r.name AS responsible_name
       FROM hazard_record hr
       LEFT JOIN employee e ON hr.employee_id = e.id
       LEFT JOIN employee r ON hr.responsible_id = r.id
       WHERE hr.source_type = $1 AND hr.source_id = $2 AND hr.is_deleted = false`,
      [sourceType, sourceId]);
    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) { res.json(error(-1, err.message)); }
});

// POST /hazard-records/from-inspection — 从检查记录创建隐患
router.post('/hazard-records/from-inspection', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const { record_id, hazard_level = 'medium', hazard_category, description, location, responsible_id, deadline_date } = req.body;
    if (!record_id || !description || !responsible_id || !deadline_date) return res.json(error(-3, '缺少必填字段'));
    // 获取检查记录
    const recordResult = await pool.query(`SELECT * FROM inspection_record WHERE id = $1 AND is_deleted = false`, [record_id]);
    if (recordResult.rows.length === 0) return res.json(error(-2, '检查记录不存在'));
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
       responsible_id, deadline_date, 'open', 'inspection', record.id, req.user?.id || null]);
    // 更新检查记录
    await pool.query(`UPDATE inspection_record SET is_hazard_detected = true, hazard_record_id = $1 WHERE id = $2`, [hazardResult.rows[0].id, record_id]);
    buildDetailResponse(res, hazardResult.rows[0], '隐患创建成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

// PUT /hazard-records/:id/confirm — 确认隐患
router.put('/hazard-records/:id/confirm', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-2, '数据库未连接'));
    const result = await pool.query(
      `UPDATE hazard_record SET confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND is_deleted = false RETURNING *`,
      [req.user?.id || null, req.params.id]);
    if (result.rows.length === 0) return res.json(error(-2, '隐患记录不存在'));
    buildDetailResponse(res, result.rows[0], '确认成功', { camelCase: true });
  } catch (err) { res.json(error(-1, err.message)); }
});

module.exports = router;
