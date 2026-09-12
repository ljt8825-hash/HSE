const { pool } = require('../config/db');
const wsServer = require('./wsServer');

async function safeQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

async function createNotification({
  userId,
  title,
  content,
  type = 'system',
  bizType,
  bizId,
  pushWs = true,
}) {
  try {
    const result = await safeQuery(
      'INSERT INTO notifications (user_id, title, content, type, biz_type, biz_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, title, content || '', type, bizType || null, bizId || null]
    );
    const notification = result.rows[0];

    if (pushWs && userId) {
      try {
        wsServer.sendToUser(userId, {
          id: notification.id,
          title,
          content,
          type,
          bizType,
          bizId,
          createdAt: notification.created_at,
        });
      } catch (wsErr) {
        console.warn('[Notification] WS推送失败:', wsErr.message);
      }
    }

    return notification;
  } catch (err) {
    console.error('[Notification] 创建失败:', err.message);
    return null;
  }
}

async function createWorkflowTaskNotification(task, instance) {
  return createNotification({
    userId: task.assigneeId,
    title: `新的待办任务：${task.taskName}`,
    content: `流程「${instance.workflowName}」有新的待办任务需要您处理，发起人：${instance.initiatorName}`,
    type: 'workflow',
    bizType: 'workflow_task',
    bizId: String(task.id),
  });
}

module.exports = {
  createNotification,
  createWorkflowTaskNotification,
};
