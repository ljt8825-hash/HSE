const { pool } = require('../config/db');

async function safeQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

function parseDefinition(definition) {
  if (!definition) return { nodes: [], edges: [], nodeMap: {} };
  const def = typeof definition === 'string' ? JSON.parse(definition) : definition;
  const nodes = def.nodes || [];
  const edges = def.edges || [];
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.code] = n; });
  return { nodes, edges, nodeMap };
}

function evalCondition(expr, formData) {
  if (!expr) return true;
  try {
    const fn = new Function('formData', `return (${expr});`);
    const result = fn(formData || {});
    return !!result;
  } catch (err) {
    console.warn('[Workflow Engine] 条件表达式执行失败:', expr, err.message);
    return true;
  }
}

function getNextNodes(currentCode, { nodes, edges, nodeMap }, formData) {
  if (edges && edges.length > 0) {
    const outgoing = edges.filter(e => e.source === currentCode);
    const result = [];
    for (const edge of outgoing) {
      if (edge.conditionExpr) {
        if (evalCondition(edge.conditionExpr, formData)) {
          const target = nodeMap[edge.target];
          if (target) result.push(target);
        }
      } else {
        const target = nodeMap[edge.target];
        if (target) result.push(target);
      }
    }
    if (result.length > 0) return result;
  }
  const idx = nodes.findIndex(n => n.code === currentCode);
  if (idx >= 0 && idx < nodes.length - 1) {
    return [nodes[idx + 1]];
  }
  return [];
}

async function resolveAssignees(node, initiatorId, initiatorName, formData) {
  const assigneeType = node.assigneeType || 'user';
  const assigneeValue = node.assigneeValue;

  if (assigneeType === 'initiator') {
    return [{ id: initiatorId, name: initiatorName }];
  }

  if (assigneeType === 'dynamic' && assigneeValue && formData) {
    const dynamicId = formData[assigneeValue];
    if (dynamicId) {
      try {
        const result = await safeQuery('SELECT id, username AS name FROM users WHERE id = $1', [dynamicId]);
        if (result.rows.length > 0) {
          return result.rows.map(r => ({ id: r.id, name: r.name }));
        }
      } catch (err) {
        console.warn('[Workflow Engine] 动态审批人查询失败:', err.message);
      }
      return [{ id: dynamicId, name: `用户${dynamicId}` }];
    }
  }

  if (assigneeType === 'role' && assigneeValue) {
    const roleIds = Array.isArray(assigneeValue) ? assigneeValue : [assigneeValue];
    try {
      const placeholders = roleIds.map((_, i) => `$${i + 1}`).join(',');
      const result = await safeQuery(
        `SELECT u.id, u.username AS name FROM users u
         JOIN user_roles ur ON u.id = ur.user_id
         WHERE ur.role_id IN (${placeholders})`,
        roleIds.map(id => parseInt(id, 10))
      );
      if (result.rows.length > 0) {
        return result.rows.map(r => ({ id: r.id, name: r.name }));
      }
    } catch (err) {
      console.warn('[Workflow Engine] 角色用户查询失败:', err.message);
    }
  }

  if (assigneeType === 'user' && assigneeValue) {
    const userIds = Array.isArray(assigneeValue) ? assigneeValue : [assigneeValue];
    try {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      const result = await safeQuery(
        `SELECT id, username AS name FROM users WHERE id IN (${placeholders})`,
        userIds.map(id => parseInt(id, 10))
      );
      if (result.rows.length > 0) {
        return result.rows.map(r => ({ id: r.id, name: r.name }));
      }
    } catch (err) {
      console.warn('[Workflow Engine] 指定用户查询失败:', err.message);
    }
  }

  return [{ id: 1, name: 'admin' }];
}

async function createTasks(instanceId, node, initiatorId, initiatorName, formData) {
  if (node.type === 'cc') {
    const assignees = await resolveAssignees(node, initiatorId, initiatorName, formData);
    for (const assignee of assignees) {
      await safeQuery(
        'INSERT INTO workflow_tasks (instance_id, task_code, task_name, assignee_id, assignee_name, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [instanceId, node.code, node.name, assignee.id, assignee.name, 'cc']
      );
    }
    return { created: false, isCC: true };
  }

  if (node.type === 'approval') {
    const assignees = await resolveAssignees(node, initiatorId, initiatorName, formData);
    for (const assignee of assignees) {
      await safeQuery(
        'INSERT INTO workflow_tasks (instance_id, task_code, task_name, assignee_id, assignee_name, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [instanceId, node.code, node.name, assignee.id, assignee.name, 'pending']
      );
    }
    return { created: true, count: assignees.length };
  }

  return { created: false };
}

async function advanceWorkflow(instanceId, currentNodeCode, definition, formData, operatorId, operatorName) {
  const graph = parseDefinition(definition);
  const nextNodes = getNextNodes(currentNodeCode, graph, formData);

  if (nextNodes.length === 0) {
    await safeQuery(
      'UPDATE workflow_instances SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['completed', instanceId]
    );
    await safeQuery(
      'INSERT INTO workflow_history (instance_id, node_name, action, operator_id, operator_name) VALUES ($1, $2, $3, $4, $5)',
      [instanceId, '结束', 'complete', operatorId, operatorName]
    );
    return { completed: true };
  }

  let advanced = false;
  let currentNode = currentNodeCode;

  for (const nextNode of nextNodes) {
    if (nextNode.type === 'end') {
      await safeQuery(
        'UPDATE workflow_instances SET status = $1, current_node = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['completed', nextNode.code, instanceId]
      );
      await safeQuery(
        'INSERT INTO workflow_history (instance_id, node_name, action, operator_id, operator_name) VALUES ($1, $2, $3, $4, $5)',
        [instanceId, nextNode.name, 'complete', operatorId, operatorName]
      );
      return { completed: true };
    }

    if (nextNode.type === 'condition') {
      await safeQuery(
        'INSERT INTO workflow_history (instance_id, node_name, action, operator_id, operator_name) VALUES ($1, $2, $3, $4, $5)',
        [instanceId, nextNode.name, 'condition', operatorId, operatorName]
      );
      const result = await advanceWorkflow(instanceId, nextNode.code, definition, formData, operatorId, operatorName);
      if (result.completed) return { completed: true };
      advanced = true;
      continue;
    }

    if (nextNode.type === 'parallel') {
      await safeQuery(
        'INSERT INTO workflow_history (instance_id, node_name, action, operator_id, operator_name) VALUES ($1, $2, $3, $4, $5)',
        [instanceId, nextNode.name, 'parallel_start', operatorId, operatorName]
      );
      const parallelNext = getNextNodes(nextNode.code, graph, formData);
      for (const pNode of parallelNext) {
        if (pNode.type === 'approval' || pNode.type === 'cc') {
          await createTasks(instanceId, pNode, operatorId, operatorName, formData);
        }
      }
      await safeQuery(
        'UPDATE workflow_instances SET current_node = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [nextNode.code, instanceId]
      );
      return { completed: false, parallel: true };
    }

    if (nextNode.type === 'approval' || nextNode.type === 'cc') {
      await createTasks(instanceId, nextNode, operatorId, operatorName, formData);
      currentNode = nextNode.code;
      advanced = true;
    }
  }

  if (advanced) {
    await safeQuery(
      'UPDATE workflow_instances SET current_node = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [currentNode, instanceId]
    );
  }

  return { completed: false };
}

async function checkParallelComplete(instanceId, nodeCode, definition) {
  const graph = parseDefinition(definition);
  const parallelNode = graph.nodeMap[nodeCode];
  if (!parallelNode || parallelNode.type !== 'parallel') return false;

  const nextNodes = getNextNodes(nodeCode, graph, {});
  const taskCodes = nextNodes.filter(n => n.type === 'approval').map(n => n.code);

  if (taskCodes.length === 0) return true;

  const result = await safeQuery(
    `SELECT task_code, status FROM workflow_tasks
     WHERE instance_id = $1 AND task_code = ANY($2)`,
    [instanceId, taskCodes]
  );

  if (result.rows.length === 0) return false;

  const allApproved = taskCodes.every(code => {
    const codeTasks = result.rows.filter(r => r.task_code === code);
    return codeTasks.length > 0 && codeTasks.every(t => t.status === 'approved');
  });

  return allApproved;
}

module.exports = {
  parseDefinition,
  evalCondition,
  getNextNodes,
  resolveAssignees,
  createTasks,
  advanceWorkflow,
  checkParallelComplete,
};
