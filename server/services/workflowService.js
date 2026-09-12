/**
 * HSE 智能闭环工作流服务
 * 
 * 自动流程：
 * 1. 隐患产生 → 自动生成整改任务
 * 2. 整改完成 → 自动生成复查任务
 * 3. 复查通过 → 更新事件闭环状态
 */

const { pool } = require('../config/db');
const { logger } = require('../middleware/requestLogger');
const reminderService = require('./reminderService');

/**
 * 生成任务编号
 */
function generateTaskCode(type) {
  const prefixMap = {
    rectification: 'RT',
    training: 'TR',
    review: 'RV',
    inspection: 'IT'
  };
  const prefix = prefixMap[type] || 'TS';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
}

/**
 * 隐患产生时自动生成整改任务
 * @param {Object} hazard - 隐患事件数据
 */
async function onHazardCreated(hazard) {
  try {
    logger.info('Auto-generating rectification task for hazard', { hazardId: hazard.id, eventCode: hazard.event_code });

    const severityDays = {
      critical: 1,
      major: 3,
      minor: 7,
      info: 15
    };

    const daysToFix = severityDays[hazard.severity] || 7;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysToFix);

    // 创建整改任务
    const taskResult = await pool.query(
      `INSERT INTO hse_tasks (
        task_code, task_type, source_event_id, source_table, source_id,
        title, description, responsible_person_id, responsible_person,
        department_id, priority, deadline, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        generateTaskCode('rectification'),
        'rectification',
        hazard.id,
        'hse_events',
        hazard.source_id,
        `整改：${hazard.title}`,
        hazard.description || '根据隐患排查结果，需进行整改',
        hazard.created_by,
        null,
        hazard.department_id,
        hazard.severity === 'critical' ? 'urgent' : hazard.severity === 'major' ? 'high' : 'normal',
        deadline.toISOString().split('T')[0],
        'pending',
        hazard.created_by
      ]
    );

    const task = taskResult.rows[0];

    // 创建整改记录
    await pool.query(
      `INSERT INTO hse_rectifications (
        rect_code, hazard_id, measure, status, deadline,
        responsible_person_id, department_id, task_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `RECT-${task.task_code}`,
        hazard.source_id,
        '待制定整改措施',
        'pending',
        deadline.toISOString().split('T')[0],
        hazard.created_by,
        hazard.department_id,
        task.id,
        hazard.created_by
      ]
    );

    // 更新事件关联任务
    await pool.query(
      `UPDATE hse_events SET task_id = $1, updated_at = NOW() WHERE id = $2`,
      [task.id, hazard.id]
    );

    logger.info('Rectification task created successfully', { taskId: task.id, taskCode: task.task_code });

    // 发送临期提醒（创建时就设置提醒）
    await reminderService.scheduleReminder(task.id, 'approaching', deadline);

    return task;

  } catch (err) {
    logger.error('Failed to auto-generate rectification task', { hazardId: hazard.id, error: err.message });
    throw err;
  }
}

/**
 * 整改完成时自动生成复查任务
 * @param {Object} rectification - 整改记录数据
 */
async function onRectificationCompleted(rectification) {
  try {
    logger.info('Auto-generating review task for completed rectification', { rectificationId: rectification.id });

    // 获取关联的隐患事件
    const eventResult = await pool.query(
      `SELECT id, event_code, title, department_id, created_by
       FROM hse_events 
       WHERE source_table = 'hazards' AND source_id = $1 AND is_deleted = FALSE`,
      [rectification.hazard_id]
    );

    if (eventResult.rows.length === 0) {
      logger.warn('No hazard event found for rectification', { hazardId: rectification.hazard_id });
      return;
    }

    const hazardEvent = eventResult.rows[0];

    // 创建复查任务（复查期限为整改完成后3天）
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);

    const taskResult = await pool.query(
      `INSERT INTO hse_tasks (
        task_code, task_type, source_event_id, source_table, source_id,
        title, description, responsible_person_id, responsible_person,
        department_id, priority, deadline, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        generateTaskCode('review'),
        'review',
        hazardEvent.id,
        'hse_rectifications',
        rectification.id,
        `复查：${hazardEvent.title}`,
        `整改已完成，需对整改结果进行复查验证`,
        rectification.responsible_person_id,
        rectification.responsible_person_name,
        rectification.department_id,
        'high',
        deadline.toISOString().split('T')[0],
        'pending',
        rectification.created_by
      ]
    );

    const task = taskResult.rows[0];

    // 创建复查记录
    await pool.query(
      `INSERT INTO hse_reviews (
        review_code, rectification_id, result, score,
        reviewer_id, reviewer_name, risk_source_id, task_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        `REV-${task.task_code}`,
        rectification.id,
        'pending',
        null,
        rectification.responsible_person_id || rectification.created_by || null,
        rectification.responsible_person_name || '待指派',
        null,
        task.id,
        rectification.created_by
      ]
    );

    // 更新整改记录关联任务
    await pool.query(
      `UPDATE hse_rectifications SET task_id = $1, updated_at = NOW() WHERE id = $2`,
      [task.id, rectification.id]
    );

    logger.info('Review task created successfully', { taskId: task.id, taskCode: task.task_code });

    // 发送临期提醒
    await reminderService.scheduleReminder(task.id, 'approaching', deadline);

    return task;

  } catch (err) {
    logger.error('Failed to auto-generate review task', { rectificationId: rectification.id, error: err.message });
    throw err;
  }
}

/**
 * 复查通过时更新事件闭环状态
 * @param {Object} review - 复查记录数据
 */
async function onReviewPassed(review) {
  try {
    logger.info('Closing event after review passed', { reviewId: review.id });

    // 获取关联的整改记录
    const rectResult = await pool.query(
      `SELECT hazard_id FROM hse_rectifications WHERE id = $1 AND is_deleted = FALSE`,
      [review.rectification_id]
    );

    if (rectResult.rows.length === 0) {
      logger.warn('No rectification found for review', { rectificationId: review.rectification_id });
      return;
    }

    const rectification = rectResult.rows[0];

    // 获取关联的隐患事件
    const eventResult = await pool.query(
      `SELECT id, event_code FROM hse_events 
       WHERE source_table = 'hazards' AND source_id = $1 AND is_deleted = FALSE`,
      [rectification.hazard_id]
    );

    if (eventResult.rows.length === 0) {
      logger.warn('No hazard event found for rectification', { hazardId: rectification.hazard_id });
      return;
    }

    const event = eventResult.rows[0];

    // 更新事件状态为已闭环
    await pool.query(
      `UPDATE hse_events SET status = 'closed', updated_at = NOW() WHERE id = $1`,
      [event.id]
    );

    // 更新所有关联任务状态为已完成
    await pool.query(
      `UPDATE hse_tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE source_event_id = $1`,
      [event.id]
    );

    logger.info('Event closed successfully', { eventId: event.id, eventCode: event.event_code });

    return event;

  } catch (err) {
    logger.error('Failed to close event after review passed', { reviewId: review.id, error: err.message });
    throw err;
  }
}

/**
 * 复查未通过时重新生成整改任务
 * @param {Object} review - 复查记录数据
 */
async function onReviewFailed(review) {
  try {
    logger.info('Regenerating rectification task after review failed', { reviewId: review.id });

    // 获取关联的整改记录
    const rectResult = await pool.query(
      `SELECT hazard_id, department_id, responsible_person_id, responsible_person_name, created_by
       FROM hse_rectifications WHERE id = $1 AND is_deleted = FALSE`,
      [review.rectification_id]
    );

    if (rectResult.rows.length === 0) {
      logger.warn('No rectification found for review', { rectificationId: review.rectification_id });
      return;
    }

    const rectification = rectResult.rows[0];

    // 获取关联的隐患事件
    const eventResult = await pool.query(
      `SELECT id, event_code, title, description 
       FROM hse_events 
       WHERE source_table = 'hazards' AND source_id = $1 AND is_deleted = FALSE`,
      [rectification.hazard_id]
    );

    if (eventResult.rows.length === 0) {
      logger.warn('No hazard event found for rectification', { hazardId: rectification.hazard_id });
      return;
    }

    const event = eventResult.rows[0];

    // 重新创建整改任务
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 3);

    const taskResult = await pool.query(
      `INSERT INTO hse_tasks (
        task_code, task_type, source_event_id, source_table, source_id,
        title, description, responsible_person_id, responsible_person,
        department_id, priority, deadline, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        generateTaskCode('rectification'),
        'rectification',
        event.id,
        'hse_events',
        event.source_id,
        `整改(复查未通过)：${event.title}`,
        `复查未通过，需重新整改。复查意见：${review.comment}`,
        rectification.responsible_person_id,
        rectification.responsible_person_name,
        rectification.department_id,
        'high',
        deadline.toISOString().split('T')[0],
        'pending',
        rectification.created_by
      ]
    );

    const task = taskResult.rows[0];

    // 更新事件状态为处理中
    await pool.query(
      `UPDATE hse_events SET status = 'processing', task_id = $1, updated_at = NOW() WHERE id = $2`,
      [task.id, event.id]
    );

    logger.info('Rectification task regenerated after review failed', { taskId: task.id, taskCode: task.task_code });

    return task;

  } catch (err) {
    logger.error('Failed to regenerate rectification task', { reviewId: review.id, error: err.message });
    throw err;
  }
}

/**
 * 根据检查计划生成检查任务
 * @param {Object} plan - 检查计划数据
 */
async function generateInspectionTasks(plan) {
  try {
    logger.info('Generating inspection tasks for plan', { planId: plan.id, planCode: plan.plan_code });

    const tasks = [];
    const today = new Date();

    // 根据周期类型生成任务
    const cycleDays = {
      daily: 1,
      weekly: 7,
      monthly: 30,
      quarterly: 90,
      annual: 365
    };

    const days = cycleDays[plan.cycle_type] || 30;

    // 生成未来一周的任务
    for (let i = 0; i < 7; i += days) {
      const scheduledDate = new Date(today);
      scheduledDate.setDate(scheduledDate.getDate() + i);

      if (plan.end_date && scheduledDate > new Date(plan.end_date)) {
        break;
      }

      const taskResult = await pool.query(
        `INSERT INTO hse_inspection_tasks (
          plan_id, task_code, executor_id, executor_name,
          department_id, scheduled_date, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          plan.id,
          `IT-${plan.plan_code}-${scheduledDate.toISOString().split('T')[0].replace(/-/g, '')}`,
          null,
          null,
          plan.department_id,
          scheduledDate.toISOString().split('T')[0],
          'pending',
          plan.created_by || 1
        ]
      );

      tasks.push(taskResult.rows[0]);
    }

    logger.info('Inspection tasks generated', { planId: plan.id, taskCount: tasks.length });

    return tasks;

  } catch (err) {
    logger.error('Failed to generate inspection tasks', { planId: plan.id, error: err.message });
    throw err;
  }
}

/**
 * 执行检查任务（发现隐患）
 * @param {Object} task - 检查任务数据
 * @param {Array} findings - 发现的隐患列表
 */
async function executeInspectionTask(task, findings) {
  try {
    logger.info('Executing inspection task', { taskId: task.id, taskCode: task.task_code });

    // 更新任务状态
    await pool.query(
      `UPDATE hse_inspection_tasks 
       SET status = 'completed', completed_date = NOW(), 
           result = $1, findings_count = $2, updated_at = NOW()
       WHERE id = $3`,
      [
        findings.length > 0 ? 'failed' : 'passed',
        findings.length,
        task.id
      ]
    );

    // 创建执行记录
    await pool.query(
      `INSERT INTO hse_inspection_executions (
        task_id, executed_at, executor_id, executor_name, items, findings
      ) VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [
        task.id,
        task.executor_id,
        task.executor_name,
        null,
        JSON.stringify(findings)
      ]
    );

    // 如果发现隐患，创建隐患事件和整改任务
    for (const finding of findings) {
      // 创建隐患事件
      const eventCode = `HAZARD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      const eventResult = await pool.query(
        `INSERT INTO hse_events (
          event_code, event_type, title, description, severity, status,
          occurred_at, source_table, source_id, risk_source_id,
          department_id, personnel_id, created_by, auto_generated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          eventCode,
          'hazard',
          finding.title || '检查发现隐患',
          finding.description,
          finding.severity || 'minor',
          'open',
          new Date().toISOString(),
          'hse_inspection_tasks',
          task.id,
          finding.risk_source_id || null,
          task.department_id,
          task.executor_id || null,
          task.executor_id || 1,
          true
        ]
      );

      const event = eventResult.rows[0];

      // 自动生成整改任务
      await onHazardCreated(event);
    }

    logger.info('Inspection task executed successfully', { taskId: task.id, findingsCount: findings.length });

    return findings.length;

  } catch (err) {
    logger.error('Failed to execute inspection task', { taskId: task.id, error: err.message });
    throw err;
  }
}

module.exports = {
  onHazardCreated,
  onRectificationCompleted,
  onReviewPassed,
  onReviewFailed,
  generateInspectionTasks,
  executeInspectionTask,
  generateTaskCode
};