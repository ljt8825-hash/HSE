/**
 * HSE 隐患整改闭环中心路由 - Sprint5.5
 *
 * 依据: sprint5.5-design-document.md
 * 对应表: hazard_record / rectification_task / rectification_action / review_record
 *
 * 功能模块:
 *   1. 隐患确认（更新 hazard_record.status = confirmed）
 *   2. 整改任务 CRUD（rectification_task）
 *   3. 整改措施 CRUD（rectification_action）
 *   4. 复查记录 CRUD（review_record）
 *   5. 统计接口（闭环率、超期统计）
 *   6. AI 整改建议（仅建议，不参与决策）
 *   7. 责任人查询
 *
 * 权限: admin / safety_manager 可写；其他角色只读
 *
 * 数据约束: 全部责任关系使用 employee_id，禁止姓名字段关联
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { requireRole } = require('../middleware/auth');
const { auditLog } = require('./audit');
const { createNotification } = require('../services/notificationService');
const assessmentEvent = require('../services/assessmentEventService');

// ============================================================
// 辅助函数
// ============================================================

function generateCode(prefix) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${prefix}-${dateStr}-${random}`;
}

function camelKeys(obj) {
  if (!obj) return obj;
  const result = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

function calcOverdueStatus(deadlineDate, status) {
  if (!deadlineDate) return 'unknown';
  const dd = new Date(deadlineDate);
  if (isNaN(dd.getTime())) return 'unknown';
  if (status === 'completed' || status === 'cancelled') return 'resolved';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  dd.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((dd - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'expiring';
  return 'normal';
}

// ============================================================
// 一、隐患确认接口
// ============================================================

// POST /confirm — 确认隐患
router.post('/confirm', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { hazard_id, confirmed_by, confirmation_note } = req.body;
    if (!hazard_id) return res.json(error(-3, '隐患ID不能为空'));
    if (!confirmed_by) return res.json(error(-3, '确认人ID不能为空'));

    const result = await pool.query(
      `UPDATE hazard_record SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND is_deleted = false AND status = 'pending'
       RETURNING id, hazard_code, hazard_title, status, confirmed_by, confirmed_at`,
      [confirmed_by, hazard_id]
    );

    if (result.rows.length === 0) {
      return res.json(error(-2, '隐患不存在或状态不允许确认'));
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'confirm', module: '隐患整改',
      description: `确认隐患 ID=${hazard_id}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys(result.rows[0]), '隐患确认成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 二、整改任务接口（rectification_task）
// ============================================================

// GET /tasks — 整改任务列表（分页）
router.get('/tasks', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ list: [], total: 0, page: 1, pageSize: 20 }, '数据库未连接'));

    const { page = 1, pageSize = 20, hazard_id, responsible_id, status, is_overdue } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['rt.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (hazard_id) {
      conditions.push(`rt.hazard_id = $${paramIdx++}`);
      params.push(hazard_id);
    }
    if (responsible_id) {
      conditions.push(`rt.responsible_id = $${paramIdx++}`);
      params.push(responsible_id);
    }
    if (status) {
      conditions.push(`rt.status = $${paramIdx++}`);
      params.push(status);
    }
    if (is_overdue === 'true') {
      conditions.push(`rt.deadline_date < CURRENT_DATE AND rt.status NOT IN ('completed', 'cancelled')`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM rectification_task rt WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT rt.*, e.name AS responsible_name, d.name AS department_name,
              hr.hazard_title, hr.hazard_level
       FROM rectification_task rt
       LEFT JOIN employee e ON rt.responsible_id = e.id AND e.is_deleted = false
       LEFT JOIN department d ON rt.department_id = d.id AND d.is_deleted = false
       LEFT JOIN hazard_record hr ON rt.hazard_id = hr.id AND hr.is_deleted = false
       WHERE ${whereClause}
       ORDER BY rt.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    const list = result.rows.map(row => ({
      ...camelKeys(row),
      overdueStatus: calcOverdueStatus(row.deadline_date, row.status),
    }));

    res.json(success({ list, total, page: pageNum, pageSize: limitNum }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /tasks/:id — 整改任务详情
router.get('/tasks/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT rt.*, e.name AS responsible_name, d.name AS department_name,
              hr.hazard_title, hr.hazard_level, hr.hazard_description
       FROM rectification_task rt
       LEFT JOIN employee e ON rt.responsible_id = e.id AND e.is_deleted = false
       LEFT JOIN department d ON rt.department_id = d.id AND d.is_deleted = false
       LEFT JOIN hazard_record hr ON rt.hazard_id = hr.id AND hr.is_deleted = false
       WHERE rt.id = $1 AND rt.is_deleted = false`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '整改任务不存在'));

    const task = {
      ...camelKeys(result.rows[0]),
      overdueStatus: calcOverdueStatus(result.rows[0].deadline_date, result.rows[0].status),
    };

    const actionsResult = await pool.query(
      `SELECT ra.*, ea.name AS action_responsible_name
       FROM rectification_action ra
       LEFT JOIN employee ea ON ra.responsible_id = ea.id AND ea.is_deleted = false
       WHERE ra.task_id = $1 AND ra.is_deleted = false
       ORDER BY ra.created_at DESC`,
      [req.params.id]
    );
    task.actions = actionsResult.rows.map(camelKeys);

    res.json(success(task, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /tasks — 创建整改任务
router.post('/tasks', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { hazard_id, task_title, description, responsible_id, department_id, deadline_date, priority } = req.body;
    if (!hazard_id) return res.json(error(-3, '隐患ID不能为空'));
    if (!task_title) return res.json(error(-3, '任务标题不能为空'));
    if (!responsible_id) return res.json(error(-3, '责任人ID不能为空'));
    if (!deadline_date) return res.json(error(-3, '整改期限不能为空'));

    const hazardCheck = await pool.query(
      `SELECT id, status FROM hazard_record WHERE id = $1 AND is_deleted = false`,
      [hazard_id]
    );
    if (hazardCheck.rows.length === 0) return res.json(error(-2, '隐患不存在'));
    if (hazardCheck.rows[0].status === 'closed') return res.json(error(-3, '已关闭隐患不能创建整改任务'));

    const taskCode = generateCode('RT');

    const result = await pool.query(
      `INSERT INTO rectification_task (task_code, hazard_id, task_title, description, responsible_id, department_id, deadline_date, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [taskCode, hazard_id, task_title, description || null, responsible_id, department_id || null,
       deadline_date, priority || 'normal', req.user?.id || null]
    );

    await pool.query(
      `UPDATE hazard_record SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [hazard_id]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '整改任务',
      description: `创建整改任务: ${task_title}（隐患ID=${hazard_id}）`,
      ip: req.ip,
    }).catch(() => {});

    // 事件时效优化：创建即已超期的整改任务，实时发布超期扣分事件
    if (calcOverdueStatus(deadline_date, 'processing') === 'overdue') {
      assessmentEvent.publish(assessmentEvent.EVENT_TYPES.HAZARD_OVERDUE, {
        rectificationId: result.rows[0].id,
        hazardId,
        responsiblePersonId: responsible_id,
        deadline: deadline_date,
        eventDate: new Date().toISOString(),
      });
    }

    res.json(success(camelKeys(result.rows[0]), '整改任务创建成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /tasks/:id — 更新整改任务
router.put('/tasks/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = ['task_title', 'description', 'responsible_id', 'department_id', 'deadline_date', 'actual_completion_date', 'status', 'progress', 'priority'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIdx++}`);
        values.push(updates[field]);
      }
    }
    if (fields.length === 0) return res.json(error(-3, '没有要更新的字段'));

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE rectification_task SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.json(error(-2, '整改任务不存在'));

    const updated = result.rows[0];

    if (updated.status === 'completed' && updated.hazard_id) {
      const reviewCount = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM review_record WHERE hazard_id = $1 AND is_deleted = false`,
        [updated.hazard_id]
      );
      if (reviewCount.rows[0].cnt === 0) {
        await pool.query(
          `UPDATE hazard_record SET status = 'pending_review', updated_at = NOW() WHERE id = $1`,
          [updated.hazard_id]
        );
      }
    }

    const overdueStatus = calcOverdueStatus(updated.deadline_date, updated.status);
    const baseHazard = { rectificationId: updated.id, hazardId: updated.hazard_id, responsiblePersonId: updated.responsible_id };

    // 事件时效优化：任务被更新为完成 → 实时撤销超期扣分
    if (updated.status === 'completed') {
      assessmentEvent.publish(assessmentEvent.EVENT_TYPES.HAZARD_RESOLVED, {
        ...baseHazard,
        deadline: updated.deadline_date,
        eventDate: new Date().toISOString(),
      });
    }
    // 事件时效优化：任务已超期且未完成 → 实时发布超期扣分事件
    if (overdueStatus === 'overdue' && updated.status !== 'completed' && updated.status !== 'cancelled') {
      assessmentEvent.publish(assessmentEvent.EVENT_TYPES.HAZARD_OVERDUE, {
        ...baseHazard,
        deadline: updated.deadline_date,
        eventDate: new Date().toISOString(),
      });
    }
    if (overdueStatus === 'overdue' && updated.status !== 'completed' && updated.status !== 'cancelled') {
      try {
        const hazardResult = await pool.query(
          `SELECT hazard_title FROM hazard_record WHERE id = $1 AND is_deleted = false`,
          [updated.hazard_id]
        );
        const hazardTitle = hazardResult.rows[0]?.hazard_title || '隐患';
        await createNotification({
          userId: null,
          title: `整改超期提醒：${hazardTitle}`,
          content: `任务编号 ${updated.task_code}（${updated.task_title}）已超期，请立即处置。`,
          type: 'system',
          bizType: 'rectification_overdue',
          bizId: updated.task_code,
          pushWs: true,
        });
      } catch (_e) {
        // 通知失败不影响主流程
      }
    }

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '整改任务',
      description: `更新整改任务 ID=${req.params.id}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success({ ...camelKeys(updated), overdueStatus }, '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /tasks/:id — 删除整改任务（软删除）
router.delete('/tasks/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `UPDATE rectification_task SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id, task_title`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '整改任务不存在'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '整改任务',
      description: `删除整改任务: ${result.rows[0].task_title} (ID=${req.params.id})`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 三、整改措施接口（rectification_action）
// ============================================================

// GET /tasks/:taskId/actions — 整改措施列表
router.get('/tasks/:taskId/actions', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const result = await pool.query(
      `SELECT ra.*, e.name AS responsible_name
       FROM rectification_action ra
       LEFT JOIN employee e ON ra.responsible_id = e.id AND e.is_deleted = false
       WHERE ra.task_id = $1 AND ra.is_deleted = false
       ORDER BY ra.created_at DESC`,
      [req.params.taskId]
    );

    res.json(success(result.rows.map(camelKeys), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /tasks/:taskId/actions — 创建整改措施
router.post('/tasks/:taskId/actions', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { action_description, action_type, responsible_id, resource_required, estimated_cost, planned_start_date, planned_end_date } = req.body;
    if (!action_description) return res.json(error(-3, '措施描述不能为空'));

    const taskCheck = await pool.query(
      `SELECT id FROM rectification_task WHERE id = $1 AND is_deleted = false`,
      [req.params.taskId]
    );
    if (taskCheck.rows.length === 0) return res.json(error(-2, '整改任务不存在'));

    const actionCode = generateCode('RA');

    const result = await pool.query(
      `INSERT INTO rectification_action (task_id, action_code, action_description, action_type, responsible_id, resource_required, estimated_cost, planned_start_date, planned_end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [req.params.taskId, actionCode, action_description, action_type || null, responsible_id || null,
       resource_required || null, estimated_cost || null, planned_start_date || null,
       planned_end_date || null, req.user?.id || null]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '整改措施',
      description: `创建整改措施: ${action_description}（任务ID=${req.params.taskId}）`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(camelKeys(result.rows[0]), '整改措施创建成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /actions/:id — 更新整改措施
router.put('/actions/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = ['action_description', 'action_type', 'responsible_id', 'resource_required', 'estimated_cost', 'planned_start_date', 'planned_end_date', 'actual_start_date', 'actual_end_date', 'status', 'completion_note'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIdx++}`);
        values.push(updates[field]);
      }
    }
    if (fields.length === 0) return res.json(error(-3, '没有要更新的字段'));

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE rectification_action SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.json(error(-2, '整改措施不存在'));

    res.json(success(camelKeys(result.rows[0]), '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /actions/:id — 删除整改措施（软删除）
router.delete('/actions/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `UPDATE rectification_action SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '整改措施不存在'));

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 四、复查记录接口（review_record）
// ============================================================

// GET /reviews — 复查记录列表
router.get('/reviews', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ list: [], total: 0, page: 1, pageSize: 20 }, '数据库未连接'));

    const { page = 1, pageSize = 20, hazard_id, reviewer_id, review_result } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['rr.is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (hazard_id) {
      conditions.push(`rr.hazard_id = $${paramIdx++}`);
      params.push(hazard_id);
    }
    if (reviewer_id) {
      conditions.push(`rr.reviewer_id = $${paramIdx++}`);
      params.push(reviewer_id);
    }
    if (review_result) {
      conditions.push(`rr.review_result = $${paramIdx++}`);
      params.push(review_result);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM review_record rr WHERE ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT rr.*, e.name AS reviewer_name, hr.hazard_title, rt.task_title
       FROM review_record rr
       LEFT JOIN employee e ON rr.reviewer_id = e.id AND e.is_deleted = false
       LEFT JOIN hazard_record hr ON rr.hazard_id = hr.id AND hr.is_deleted = false
       LEFT JOIN rectification_task rt ON rr.task_id = rt.id AND rt.is_deleted = false
       WHERE ${whereClause}
       ORDER BY rr.review_date DESC, rr.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json(success({ list: result.rows.map(camelKeys), total, page: pageNum, pageSize: limitNum }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /reviews/:id — 复查记录详情
router.get('/reviews/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT rr.*, e.name AS reviewer_name, hr.hazard_title, rt.task_title
       FROM review_record rr
       LEFT JOIN employee e ON rr.reviewer_id = e.id AND e.is_deleted = false
       LEFT JOIN hazard_record hr ON rr.hazard_id = hr.id AND hr.is_deleted = false
       LEFT JOIN rectification_task rt ON rr.task_id = rt.id AND rt.is_deleted = false
       WHERE rr.id = $1 AND rr.is_deleted = false`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '复查记录不存在'));

    res.json(success(camelKeys(result.rows[0]), '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /reviews — 创建复查记录
router.post('/reviews', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { hazard_id, task_id, reviewer_id, review_date, review_result, review_score, review_note } = req.body;
    if (!hazard_id) return res.json(error(-3, '隐患ID不能为空'));
    if (!reviewer_id) return res.json(error(-3, '复查人ID不能为空'));
    if (!review_result) return res.json(error(-3, '复查结果不能为空'));

    const hazardCheck = await pool.query(
      `SELECT id, status FROM hazard_record WHERE id = $1 AND is_deleted = false`,
      [hazard_id]
    );
    if (hazardCheck.rows.length === 0) return res.json(error(-2, '隐患不存在'));

    const validResults = ['pass', 'fail', 'partial'];
    if (!validResults.includes(review_result)) {
      return res.json(error(-3, `复查结果必须是 ${validResults.join('/')}`));
    }

    const reviewCode = generateCode('RV');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO review_record (review_code, hazard_id, task_id, reviewer_id, review_date, review_result, review_score, review_note, is_final, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [reviewCode, hazard_id, task_id || null, reviewer_id, review_date || new Date(),
         review_result, review_score || null, review_note || null, review_result === 'pass',
         req.user?.id || null]
      );

      if (review_result === 'pass') {
        await client.query(
          `UPDATE hazard_record SET status = 'closed', updated_at = NOW() WHERE id = $1`,
          [hazard_id]
        );
        if (task_id) {
          await client.query(
            `UPDATE rectification_task SET status = 'completed', actual_completion_date = $2, updated_at = NOW() WHERE id = $1`,
            [task_id, review_date || new Date().toISOString().slice(0, 10)]
          );
        }
      } else if (review_result === 'fail') {
        if (task_id) {
          await client.query(
            `UPDATE rectification_task SET status = 'processing', progress = 0, updated_at = NOW() WHERE id = $1`,
            [task_id]
          );
        }
        await client.query(
          `UPDATE hazard_record SET status = 'processing', updated_at = NOW() WHERE id = $1`,
          [hazard_id]
        );
      }

      await client.query('COMMIT');

      // 事件时效优化：复查通过 → 隐患闭环完成，实时撤销超期扣分
      if (review_result === 'pass' && task_id) {
        try {
          const taskRow = await pool.query(
            `SELECT id, hazard_id, responsible_id, deadline_date FROM rectification_task WHERE id = $1 AND is_deleted = false`,
            [task_id]
          );
          const t = taskRow.rows[0];
          if (t) {
            assessmentEvent.publish(assessmentEvent.EVENT_TYPES.HAZARD_RESOLVED, {
              rectificationId: t.id,
              hazardId: t.hazard_id,
              responsiblePersonId: t.responsible_id,
              deadline: t.deadline_date,
              eventDate: new Date().toISOString(),
            });
          }
        } catch (_e) { /* 事件发布失败不影响主流程 */ }
      }

      await auditLog({
        userId: req.user?.id, username: req.user?.username,
        action: 'create', module: '复查记录',
        description: `创建复查记录: ${review_result}（隐患ID=${hazard_id}）`,
        ip: req.ip,
      }).catch(() => {});

      res.json(success(camelKeys(result.rows[0]), '复查记录创建成功'));
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

// DELETE /reviews/:id — 删除复查记录（软删除）
router.delete('/reviews/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `UPDATE review_record SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '复查记录不存在'));

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 五、统计接口
// ============================================================

// GET /stats — 整改闭环统计
router.get('/stats', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ total_hazard: 0, closed_hazard: 0, closed_rate: 0 }, '数据库未连接'));

    const [totalResult, confirmedResult, processingResult, closedResult, overdueResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM hazard_record WHERE is_deleted = false`),
      pool.query(`SELECT COUNT(*)::int AS total FROM hazard_record WHERE is_deleted = false AND status = 'confirmed'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM hazard_record WHERE is_deleted = false AND status = 'processing'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM hazard_record WHERE is_deleted = false AND status = 'closed'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM rectification_task WHERE is_deleted = false AND deadline_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')`),
    ]);

    const total = totalResult.rows[0].total;
    const confirmed = confirmedResult.rows[0].total;
    const processing = processingResult.rows[0].total;
    const closed = closedResult.rows[0].total;
    const overdueTaskCount = overdueResult.rows[0].total;

    const closedRate = total > 0 ? ((closed / total) * 100).toFixed(1) : '0.0';

    const departmentStats = await pool.query(`
      SELECT hr.department_id, d.name AS department_name,
             COUNT(*)::int AS total,
             SUM(CASE WHEN hr.status = 'closed' THEN 1 ELSE 0 END)::int AS closed
      FROM hazard_record hr
      LEFT JOIN department d ON hr.department_id = d.id AND d.is_deleted = false
      WHERE hr.is_deleted = false AND hr.department_id IS NOT NULL
      GROUP BY hr.department_id, d.name
      ORDER BY total DESC
    `);

    const responsibleStats = await pool.query(`
      SELECT rt.responsible_id, e.name AS responsible_name,
             COUNT(*)::int AS total,
             SUM(CASE WHEN rt.status = 'completed' THEN 1 ELSE 0 END)::int AS completed
      FROM rectification_task rt
      LEFT JOIN employee e ON rt.responsible_id = e.id AND e.is_deleted = false
      WHERE rt.is_deleted = false
      GROUP BY rt.responsible_id, e.name
      ORDER BY total DESC
      LIMIT 20
    `);

    const avgDaysResult = await pool.query(`
      SELECT AVG(EXTRACT(DAY FROM AGE(NOW(), hr.created_at)))::numeric(5,1) AS avg_days
      FROM hazard_record hr
      WHERE hr.is_deleted = false AND hr.status = 'closed' AND hr.created_at IS NOT NULL
    `);

    res.json(success({
      total_hazard: total,
      confirmed_hazard: confirmed,
      processing_hazard: processing,
      closed_hazard: closed,
      closed_rate: parseFloat(closedRate),
      overdue_task_count: overdueTaskCount,
      average_days_to_close: avgDaysResult.rows[0].avg_days || null,
      stats_by_department: departmentStats.rows.map(camelKeys),
      stats_by_responsible: responsibleStats.rows.map(camelKeys),
    }, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// GET /stats/overdue — 超期/临期任务统计
router.get('/stats/overdue', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success({ overdue_tasks: [], expiring_tasks: [] }, '数据库未连接'));

    const overdueResult = await pool.query(`
      SELECT rt.*, e.name AS responsible_name, hr.hazard_title
      FROM rectification_task rt
      LEFT JOIN employee e ON rt.responsible_id = e.id AND e.is_deleted = false
      LEFT JOIN hazard_record hr ON rt.hazard_id = hr.id AND hr.is_deleted = false
      WHERE rt.is_deleted = false AND rt.deadline_date < CURRENT_DATE AND rt.status NOT IN ('completed', 'cancelled')
      ORDER BY rt.deadline_date ASC
    `);

    const expiringResult = await pool.query(`
      SELECT rt.*, e.name AS responsible_name, hr.hazard_title
      FROM rectification_task rt
      LEFT JOIN employee e ON rt.responsible_id = e.id AND e.is_deleted = false
      LEFT JOIN hazard_record hr ON rt.hazard_id = hr.id AND hr.is_deleted = false
      WHERE rt.is_deleted = false AND rt.deadline_date >= CURRENT_DATE AND rt.deadline_date <= CURRENT_DATE + INTERVAL '7 days' AND rt.status NOT IN ('completed', 'cancelled')
      ORDER BY rt.deadline_date ASC
    `);

    res.json(success({
      overdue_tasks: overdueResult.rows.map(r => ({ ...camelKeys(r), overdueStatus: 'overdue' })),
      expiring_tasks: expiringResult.rows.map(r => ({ ...camelKeys(r), overdueStatus: 'expiring' })),
    }, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 六、责任人查询
// ============================================================

// GET /responsible/:employeeId/tasks — 查询责任人的整改任务
router.get('/responsible/:employeeId/tasks', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const employeeId = req.params.employeeId;

    const empResult = await pool.query(
      `SELECT id, name FROM employee WHERE id = $1 AND is_deleted = false`,
      [employeeId]
    );
    if (empResult.rows.length === 0) return res.json(error(-2, '员工不存在'));

    const statsResult = await pool.query(`
      SELECT COUNT(*)::int AS total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS completed,
             SUM(CASE WHEN deadline_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END)::int AS overdue
      FROM rectification_task
      WHERE responsible_id = $1 AND is_deleted = false
    `, [employeeId]);

    const tasksResult = await pool.query(`
      SELECT rt.*, hr.hazard_title, hr.hazard_level
      FROM rectification_task rt
      LEFT JOIN hazard_record hr ON rt.hazard_id = hr.id AND hr.is_deleted = false
      WHERE rt.responsible_id = $1 AND rt.is_deleted = false
      ORDER BY rt.deadline_date ASC
    `, [employeeId]);

    const stats = statsResult.rows[0];
    res.json(success({
      employee_id: parseInt(employeeId),
      employee_name: empResult.rows[0].name,
      total_tasks: stats.total,
      completed_tasks: stats.completed,
      overdue_tasks: stats.overdue,
      tasks: tasksResult.rows.map(r => ({ ...camelKeys(r), overdueStatus: calcOverdueStatus(r.deadline_date, r.status) })),
    }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// 七、AI 整改建议（仅建议，不参与决策）
// ============================================================

// POST /tasks/:id/ai-suggestions — 获取AI整改建议
router.post('/tasks/:id/ai-suggestions', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { hazard_description, hazard_level, location } = req.body;

    if (!hazard_description) {
      const taskResult = await pool.query(
        `SELECT hr.hazard_description, hr.hazard_level, hr.location
         FROM rectification_task rt
         LEFT JOIN hazard_record hr ON rt.hazard_id = hr.id AND hr.is_deleted = false
         WHERE rt.id = $1 AND rt.is_deleted = false`,
        [req.params.id]
      );
      if (taskResult.rows.length > 0) {
        const hr = taskResult.rows[0];
        return res.json(success({
          ai_suggestions: `针对${hr.hazard_level || '一般'}隐患"${hr.hazard_description || ''}"（位置：${hr.location || ''}），建议：1. 立即组织人员现场勘查；2. 制定详细整改方案；3. 明确整改责任人及时限；4. 整改完成后组织复查验收。`,
          ai_risk_hint: '请关注整改进度，确保按时完成，避免隐患升级。',
          analysis_basis: 'full_text',
          prompt_version: '1.0',
        }, 'AI建议生成成功（模拟）'));
      }
      return res.json(error(-2, '整改任务不存在'));
    }

    res.json(success({
      ai_suggestions: `针对${hazard_level || '一般'}隐患"${hazard_description}"（位置：${location || ''}），建议：1. 立即组织人员现场勘查；2. 制定详细整改方案；3. 明确整改责任人及时限；4. 整改完成后组织复查验收。`,
      ai_risk_hint: '请关注整改进度，确保按时完成，避免隐患升级。',
      analysis_basis: 'full_text',
      prompt_version: '1.0',
    }, 'AI建议生成成功（模拟）'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;