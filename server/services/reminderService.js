/**
 * HSE 任务提醒服务
 * 
 * 提醒类型：
 * - approaching: 临期提醒（截止日期前2天）
 * - overdue: 逾期提醒（超过截止日期）
 * - escalation: 升级提醒（逾期后根据级别升级）
 */

const { pool } = require('../config/db');
const { logger } = require('../middleware/requestLogger');

/**
 * 调度提醒
 */
async function scheduleReminder(taskId, reminderType, deadline) {
  try {
    const reminderDate = getReminderDate(reminderType, deadline);
    
    // 记录提醒计划
    await pool.query(
      `INSERT INTO hse_task_reminders (
        task_id, reminder_type, sent_at, channel, recipients, content, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        taskId,
        reminderType,
        reminderDate,
        'system',
        JSON.stringify([]),
        '',
        'pending'
      ]
    );

    logger.info('Reminder scheduled', { taskId, reminderType, reminderDate });

  } catch (err) {
    logger.error('Failed to schedule reminder', { taskId, error: err.message });
    throw err;
  }
}

/**
 * 获取提醒日期
 */
function getReminderDate(reminderType, deadline) {
  const date = new Date(deadline);
  
  switch (reminderType) {
    case 'approaching':
      date.setDate(date.getDate() - 2);
      break;
    case 'overdue':
      date.setDate(date.getDate() + 1);
      break;
    case 'escalation':
      date.setDate(date.getDate() + 3);
      break;
  }
  
  return date.toISOString();
}

/**
 * 检查并发送提醒（定时任务调用）
 */
async function checkAndSendReminders() {
  try {
    logger.info('Checking for pending reminders...');

    const now = new Date();

    // 获取需要发送的临期提醒
    const approachingResult = await pool.query(
      `SELECT tr.*, t.title, t.responsible_person, t.deadline
       FROM hse_task_reminders tr
       JOIN hse_tasks t ON tr.task_id = t.id
       WHERE tr.reminder_type = 'approaching'
         AND tr.status = 'pending'
         AND tr.sent_at <= $1
         AND t.status NOT IN ('completed', 'canceled')`,
      [now.toISOString()]
    );

    // 获取需要发送的逾期提醒
    const overdueResult = await pool.query(
      `SELECT t.id, t.task_code, t.title, t.responsible_person, t.deadline, t.escalation_level
       FROM hse_tasks t
       WHERE t.status NOT IN ('completed', 'canceled')
         AND t.is_overdue = FALSE
         AND t.deadline < $1`,
      [now.toISOString().split('T')[0]]
    );

    // 发送临期提醒
    for (const reminder of approachingResult.rows) {
      await sendReminder(reminder);
    }

    // 处理逾期任务
    for (const task of overdueResult.rows) {
      await handleOverdue(task);
    }

    logger.info('Reminder check completed', {
      approachingCount: approachingResult.rows.length,
      overdueCount: overdueResult.rows.length
    });

  } catch (err) {
    logger.error('Failed to check reminders', { error: err.message });
    throw err;
  }
}

/**
 * 发送提醒
 */
async function sendReminder(reminder) {
  try {
    const content = generateReminderContent(reminder);
    
    logger.info(`Sending ${reminder.reminder_type} reminder for task ${reminder.task_id}: ${content}`);

    // 更新提醒状态
    await pool.query(
      `UPDATE hse_task_reminders 
       SET status = 'sent', content = $1, updated_at = NOW()
       WHERE id = $2`,
      [content, reminder.id]
    );

    // 更新任务提醒标记
    await pool.query(
      `UPDATE hse_tasks SET reminder_sent = TRUE, updated_at = NOW() WHERE id = $1`,
      [reminder.task_id]
    );

    // 发送通知（可扩展到邮件、短信、钉钉等）
    // sendNotification(reminder, content);

    return content;

  } catch (err) {
    logger.error('Failed to send reminder', { reminderId: reminder.id, error: err.message });
    throw err;
  }
}

/**
 * 生成提醒内容
 */
function generateReminderContent(reminder) {
  const { reminder_type, title, responsible_person, deadline } = reminder;
  const deadlineStr = new Date(deadline).toLocaleDateString('zh-CN');
  
  switch (reminder_type) {
    case 'approaching':
      return `【临期提醒】任务 "${title}" 即将到期（截止日期：${deadlineStr}），请${responsible_person || '相关负责人'}及时处理。`;
    case 'overdue':
      return `【逾期提醒】任务 "${title}" 已逾期，请${responsible_person || '相关负责人'}立即处理。`;
    case 'escalation':
      return `【升级提醒】任务 "${title}" 逾期时间较长，已升级处理，请领导关注。`;
    default:
      return `【任务提醒】任务 "${title}" 需要处理。`;
  }
}

/**
 * 处理逾期任务
 */
async function handleOverdue(task) {
  try {
    const now = new Date();
    const deadline = new Date(task.deadline);
    const overdueDays = Math.floor((now - deadline) / (1000 * 60 * 60 * 24));

    // 更新逾期状态
    await pool.query(
      `UPDATE hse_tasks 
       SET is_overdue = TRUE, overdue_days = $1, status = 'overdue', updated_at = NOW()
       WHERE id = $2`,
      [overdueDays, task.id]
    );

    // 发送逾期提醒
    await pool.query(
      `INSERT INTO hse_task_reminders (
        task_id, reminder_type, sent_at, channel, recipients, content, status
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6)`,
      [
        task.id,
        'overdue',
        'system',
        JSON.stringify([]),
        `【逾期提醒】任务 "${task.title}" 已逾期 ${overdueDays} 天，请及时处理。`,
        'sent'
      ]
    );

    // 检查是否需要升级
    await checkEscalation(task.id, overdueDays, task.escalation_level);

    logger.info('Task marked as overdue', { taskId: task.id, overdueDays });

  } catch (err) {
    logger.error('Failed to handle overdue task', { taskId: task.id, error: err.message });
    throw err;
  }
}

/**
 * 检查升级
 */
async function checkEscalation(taskId, overdueDays, currentLevel) {
  try {
    let newLevel = currentLevel;

    // 逾期3天：一级升级
    if (overdueDays >= 3 && currentLevel === 0) {
      newLevel = 1;
      await sendEscalationReminder(taskId, newLevel);
    }

    // 逾期7天：二级升级
    if (overdueDays >= 7 && currentLevel < 2) {
      newLevel = 2;
      await sendEscalationReminder(taskId, newLevel);
    }

    // 逾期15天：三级升级
    if (overdueDays >= 15 && currentLevel < 3) {
      newLevel = 3;
      await sendEscalationReminder(taskId, newLevel);
    }

    if (newLevel > currentLevel) {
      await pool.query(
        `UPDATE hse_tasks SET escalation_level = $1, updated_at = NOW() WHERE id = $2`,
        [newLevel, taskId]
      );
    }

  } catch (err) {
    logger.error('Failed to check escalation', { taskId, error: err.message });
    throw err;
  }
}

/**
 * 发送升级提醒
 */
async function sendEscalationReminder(taskId, level) {
  try {
    const taskResult = await pool.query(
      `SELECT title, responsible_person, overdue_days FROM hse_tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) return;

    const task = taskResult.rows[0];
    const levelNames = ['', '一级', '二级', '三级'];

    const content = `【${levelNames[level]}升级提醒】任务 "${task.title}" 已逾期 ${task.overdue_days} 天，已升级至${levelNames[level]}处理，请相关领导关注。`;

    await pool.query(
      `INSERT INTO hse_task_reminders (
        task_id, reminder_type, sent_at, channel, recipients, content, status
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6)`,
      [
        taskId,
        'escalation',
        'system',
        JSON.stringify([]),
        content,
        'sent'
      ]
    );

    logger.info(`Escalation reminder sent (level ${level})`, { taskId });

  } catch (err) {
    logger.error('Failed to send escalation reminder', { taskId, level, error: err.message });
    throw err;
  }
}

/**
 * 获取任务提醒统计
 */
async function getReminderStats() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE reminder_type = 'approaching' AND status = 'pending') AS approaching_pending,
        COUNT(*) FILTER (WHERE reminder_type = 'overdue') AS overdue_count,
        COUNT(*) FILTER (WHERE reminder_type = 'escalation') AS escalation_count,
        COUNT(*) FILTER (WHERE status = 'sent') AS sent_count
      FROM hse_task_reminders
    `);

    return result.rows[0];

  } catch (err) {
    logger.error('Failed to get reminder stats', { error: err.message });
    throw err;
  }
}

/**
 * 获取任务的所有提醒记录
 */
async function getTaskReminders(taskId) {
  try {
    const result = await pool.query(
      `SELECT * FROM hse_task_reminders WHERE task_id = $1 ORDER BY sent_at DESC`,
      [taskId]
    );

    return result.rows;

  } catch (err) {
    logger.error('Failed to get task reminders', { taskId, error: err.message });
    throw err;
  }
}

module.exports = {
  scheduleReminder,
  checkAndSendReminders,
  sendReminder,
  handleOverdue,
  getReminderStats,
  getTaskReminders
};