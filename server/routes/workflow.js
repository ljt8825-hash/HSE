const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { authMiddleware: verifyToken } = require('../middleware/auth');
const workflowEngine = require('../utils/workflowEngine');
const notificationService = require('../services/notificationService');

async function safeQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

router.get('/definitions', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '查询成功(内存模式)'));
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx++} OR code ILIKE $${paramIdx++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      safeQuery(`SELECT COUNT(*)::int AS total FROM workflows ${whereClause}`, params),
      safeQuery(
        `SELECT id, code, name, description, is_active, sort_order, created_at
         FROM workflows
         ${whereClause}
         ORDER BY sort_order ASC, created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      )
    ]);

    res.json(success({
      list: dataResult.rows,
      total: countResult.rows[0]?.total || 0
    }, '查询成功'));
  } catch (err) {
    console.error('[Workflow /definitions] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.get('/definitions/:id', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!isConnected()) {
      return res.json(success({}, '查询成功(内存模式)'));
    }

    const result = await safeQuery(
      'SELECT id, code, name, description, definition, is_active, sort_order, created_at FROM workflows WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '流程定义不存在'));
    }

    res.json(success(result.rows[0], '查询成功'));
  } catch (err) {
    console.error('[Workflow /definitions/:id] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.post('/definitions', verifyToken, async (req, res) => {
  try {
    const { code, name, description, definition, sortOrder = 0, isActive = true } = req.body;

    if (!code || !name) {
      return res.status(400).json(error(400, '缺少必填参数'));
    }

    if (!isConnected()) {
      return res.json(success({ id: Date.now(), code, name }, '创建成功(内存模式)'));
    }

    const result = await safeQuery(
      'INSERT INTO workflows (code, name, description, definition, sort_order, is_active, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [code, name, description, definition, sortOrder, isActive, req.user?.username || 'admin']
    );

    res.json(success(result.rows[0], '流程定义创建成功'));
  } catch (err) {
    console.error('[Workflow /definitions] 创建失败:', err.message);
    if (err.code === '23505') {
      return res.status(400).json(error(400, '流程编码已存在'));
    }
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.put('/definitions/:id', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, definition, sortOrder, isActive } = req.body;

    if (!isConnected()) {
      return res.json(success({ id }, '更新成功(内存模式)'));
    }

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIdx++}`);
      params.push(description);
    }
    if (definition !== undefined) {
      updates.push(`definition = $${paramIdx++}`);
      params.push(definition);
    }
    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIdx++}`);
      params.push(sortOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      params.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json(error(400, '没有可更新的字段'));
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const result = await safeQuery(
      `UPDATE workflows SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '流程定义不存在'));
    }

    res.json(success(result.rows[0], '流程定义更新成功'));
  } catch (err) {
    console.error('[Workflow /definitions/:id] 更新失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.delete('/definitions/:id', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (!isConnected()) {
      return res.json(success(null, '删除成功(内存模式)'));
    }

    const result = await safeQuery('DELETE FROM workflows WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '流程定义不存在'));
    }

    res.json(success(null, '流程定义删除成功'));
  } catch (err) {
    console.error('[Workflow /definitions/:id] 删除失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.post('/instances', verifyToken, async (req, res) => {
  try {
    const { workflowId, workflowCode, businessKey, formData } = req.body;

    if (!workflowId || !workflowCode) {
      return res.status(400).json(error(400, '缺少必填参数'));
    }

    if (!isConnected()) {
      const instanceId = Date.now();
      return res.json(success({ id: instanceId }, '流程发起成功(内存模式)'));
    }

    const workflowResult = await safeQuery('SELECT id, code, name, definition FROM workflows WHERE id = $1 AND is_active = true', [workflowId]);
    if (workflowResult.rows.length === 0) {
      return res.status(404).json(error(404, '流程定义不存在或未启用'));
    }

    const workflow = workflowResult.rows[0];
    const initiatorId = req.user?.id || 1;
    const initiatorName = req.user?.username || 'admin';

    const definition = typeof workflow.definition === 'string' ? JSON.parse(workflow.definition) : workflow.definition;
    const graph = workflowEngine.parseDefinition(definition);
    const startNode = graph.nodes.find(n => n.type === 'start');
    const firstNodeCode = startNode?.code || 'submit';

    const instanceResult = await safeQuery(
      'INSERT INTO workflow_instances (workflow_id, workflow_code, workflow_name, business_key, status, current_node, initiator_id, initiator_name, form_data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [workflowId, workflow.code, workflow.name, businessKey, 'running', firstNodeCode, initiatorId, initiatorName, formData]
    );

    const instance = instanceResult.rows[0];

    await safeQuery(
      'INSERT INTO workflow_history (instance_id, node_name, action, operator_id, operator_name) VALUES ($1, $2, $3, $4, $5)',
      [instance.id, startNode?.name || '提交申请', 'submit', initiatorId, initiatorName]
    );

    await workflowEngine.advanceWorkflow(
      instance.id,
      firstNodeCode,
      definition,
      formData,
      initiatorId,
      initiatorName
    );

    const newTasksResult = await safeQuery(
      'SELECT * FROM workflow_tasks WHERE instance_id = $1 AND status = $2',
      [instance.id, 'pending']
    );
    for (const task of newTasksResult.rows) {
      notificationService.createNotification({
        userId: task.assignee_id,
        title: `新的待办任务：${task.task_name}`,
        content: `流程「${workflow.name}」有新的待办任务，发起人：${initiatorName}`,
        type: 'workflow',
        bizType: 'workflow_task',
        bizId: String(task.id),
      });
    }

    res.json(success(instance, '流程发起成功'));
  } catch (err) {
    console.error('[Workflow /instances] 创建失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.get('/instances', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, workflowCode, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '查询成功(内存模式)'));
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (workflowCode) {
      conditions.push(`workflow_code = $${paramIdx++}`);
      params.push(workflowCode);
    }
    if (keyword) {
      conditions.push(`workflow_name ILIKE $${paramIdx++}`);
      params.push(`%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      safeQuery(`SELECT COUNT(*)::int AS total FROM workflow_instances ${whereClause}`, params),
      safeQuery(
        `SELECT id, workflow_id, workflow_code, workflow_name, business_key, status, current_node, initiator_name, created_at, updated_at, completed_at
         FROM workflow_instances
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      )
    ]);

    res.json(success({
      list: dataResult.rows,
      total: countResult.rows[0]?.total || 0
    }, '查询成功'));
  } catch (err) {
    console.error('[Workflow /instances] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.get('/instances/:id', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (!isConnected()) {
      return res.json(success({}, '查询成功(内存模式)'));
    }

    const [instanceResult, tasksResult, historyResult, workflowResult] = await Promise.all([
      safeQuery('SELECT * FROM workflow_instances WHERE id = $1', [id]),
      safeQuery('SELECT * FROM workflow_tasks WHERE instance_id = $1 ORDER BY created_at ASC', [id]),
      safeQuery('SELECT * FROM workflow_history WHERE instance_id = $1 ORDER BY created_at ASC', [id]),
      safeQuery('SELECT w.definition, w.code AS workflow_code FROM workflows w JOIN workflow_instances i ON w.id = i.workflow_id WHERE i.id = $1', [id])
    ]);

    if (instanceResult.rows.length === 0) {
      return res.status(404).json(error(404, '流程实例不存在'));
    }

    res.json(success({
      instance: instanceResult.rows[0],
      tasks: tasksResult.rows,
      history: historyResult.rows,
      definition: workflowResult.rows[0]?.definition
    }, '查询成功'));
  } catch (err) {
    console.error('[Workflow /instances/:id] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.get('/tasks', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, assigneeId } = req.query;
    const offset = (page - 1) * pageSize;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '查询成功(内存模式)'));
    }

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`t.status = $${paramIdx++}`);
      params.push(status);
    }
    if (assigneeId) {
      conditions.push(`t.assignee_id = $${paramIdx++}`);
      params.push(assigneeId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      safeQuery(`SELECT COUNT(*)::int AS total FROM workflow_tasks t ${whereClause}`, params),
      safeQuery(
        `SELECT t.id, t.instance_id, t.task_code, t.task_name, t.assignee_id, t.assignee_name, t.status, t.priority, t.comment, t.created_at, t.updated_at, t.completed_at,
                i.workflow_name, i.workflow_code, i.initiator_name, i.created_at AS instance_created_at
         FROM workflow_tasks t
         LEFT JOIN workflow_instances i ON t.instance_id = i.id
         ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, pageSize, offset]
      )
    ]);

    res.json(success({
      list: dataResult.rows,
      total: countResult.rows[0]?.total || 0
    }, '查询成功'));
  } catch (err) {
    console.error('[Workflow /tasks] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.post('/tasks/:id/action', verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { action, comment } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json(error(400, '无效操作类型'));
    }

    if (!isConnected()) {
      return res.json(success({ id, action }, '操作成功(内存模式)'));
    }

    const taskResult = await safeQuery('SELECT * FROM workflow_tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json(error(404, '任务不存在'));
    }

    const task = taskResult.rows[0];
    if (task.status !== 'pending') {
      return res.status(400).json(error(400, '任务状态不允许操作'));
    }

    await safeQuery(
      'UPDATE workflow_tasks SET status = $1, comment = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [action === 'approve' ? 'approved' : 'rejected', comment, id]
    );

    const operatorId = req.user?.id || 1;
    const operatorName = req.user?.username || 'admin';

    await safeQuery(
      'INSERT INTO workflow_history (instance_id, node_name, action, operator_id, operator_name, comment) VALUES ($1, $2, $3, $4, $5, $6)',
      [task.instance_id, task.task_name, action, operatorId, operatorName, comment]
    );

    if (action === 'approve') {
      const [instanceResult, workflowResult] = await Promise.all([
        safeQuery('SELECT * FROM workflow_instances WHERE id = $1', [task.instance_id]),
        safeQuery(
          'SELECT w.definition FROM workflows w JOIN workflow_instances i ON w.id = i.workflow_id WHERE i.id = $1',
          [task.instance_id]
        ),
      ]);

      const instance = instanceResult.rows[0];
      const definition = workflowResult.rows[0]?.definition;
      const graph = workflowEngine.parseDefinition(definition);
      const currentNode = graph.nodeMap[task.task_code];

      const sameNodeTasks = await safeQuery(
        'SELECT * FROM workflow_tasks WHERE instance_id = $1 AND task_code = $2 AND status = $3',
        [task.instance_id, task.task_code, 'pending']
      );

      if (sameNodeTasks.rows.length === 0 && currentNode) {
        if (currentNode.type !== 'parallel') {
          const formData = typeof instance.form_data === 'string'
            ? JSON.parse(instance.form_data)
            : instance.form_data;

          await workflowEngine.advanceWorkflow(
            task.instance_id,
            task.task_code,
            definition,
            formData,
            operatorId,
            operatorName
          );
        } else {
          const allDone = await workflowEngine.checkParallelComplete(
            task.instance_id,
            instance.current_node,
            definition
          );
          if (allDone) {
            const formData = typeof instance.form_data === 'string'
              ? JSON.parse(instance.form_data)
              : instance.form_data;
            await workflowEngine.advanceWorkflow(
              task.instance_id,
              instance.current_node,
              definition,
              formData,
              operatorId,
              operatorName
            );
          }
        }

        const newTasksResult = await safeQuery(
          'SELECT * FROM workflow_tasks WHERE instance_id = $1 AND status = $2 AND created_at > NOW() - INTERVAL \'5 seconds\'',
          [task.instance_id, 'pending']
        );
        for (const newTask of newTasksResult.rows) {
          notificationService.createNotification({
            userId: newTask.assignee_id,
            title: `新的待办任务：${newTask.task_name}`,
            content: `流程「${instance.workflow_name}」有新的待办任务需要您处理`,
            type: 'workflow',
            bizType: 'workflow_task',
            bizId: String(newTask.id),
          });
        }
      }
    } else {
      await safeQuery(
        'UPDATE workflow_instances SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['rejected', task.instance_id]
      );
    }

    res.json(success({ id, action }, '操作成功'));
  } catch (err) {
    console.error('[Workflow /tasks/:id/action] 操作失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

router.get('/my-tasks', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status = 'pending' } = req.query;
    const offset = (page - 1) * pageSize;
    const userId = req.user?.id || 1;

    if (!isConnected()) {
      return res.json(success({ list: [], total: 0 }, '查询成功(内存模式)'));
    }

    const [countResult, dataResult] = await Promise.all([
      safeQuery('SELECT COUNT(*)::int AS total FROM workflow_tasks WHERE assignee_id = $1 AND status = $2', [userId, status]),
      safeQuery(
        `SELECT t.id, t.instance_id, t.task_code, t.task_name, t.assignee_id, t.assignee_name, t.status, t.priority, t.created_at,
                i.workflow_name, i.workflow_code, i.initiator_name
         FROM workflow_tasks t
         LEFT JOIN workflow_instances i ON t.instance_id = i.id
         WHERE t.assignee_id = $1 AND t.status = $2
         ORDER BY t.created_at DESC
         LIMIT $3 OFFSET $4`,
        [userId, status, pageSize, offset]
      )
    ]);

    res.json(success({
      list: dataResult.rows,
      total: countResult.rows[0]?.total || 0
    }, '查询成功'));
  } catch (err) {
    console.error('[Workflow /my-tasks] 查询失败:', err.message);
    res.status(500).json(error(500, '服务器内部错误'));
  }
});

module.exports = router;
