/**
 * 月度安全履职自动考核 —— 事件驱动服务
 *
 * 职责：
 *   1. 对外提供 fire-and-forget 的 publish(type, payload)，业务路由在数据变更后调用
 *   2. 消费事件：定位受影响考核对象 → 生成/撤销自动扣分明细 → 重算对象分数
 *   3. 幂等：通过 hse_assessment_event_log 唯一键去重，业务事件只消费一次
 *   4. 失败不阻塞主流程，由每日校验定时任务做最终补偿
 *
 * 已支持事件：
 *   VIOLATION_CREATED / VIOLATION_DELETED  —— 三违（个人+直属上级传导）
 *   HAZARD_OVERDUE / HAZARD_RESOLVED        —— 隐患整改超期 / 闭环撤销
 *   ACCIDENT_CREATED / ACCIDENT_DELETED     —— 事故否决项
 *   TRAINING_FAILED / TRAINING_DELETED      —— 本人培训不合格
 *   GRID_MISS                               —— 网格巡查缺次
 *   RESP_MISSING / RESP_SIGNED              —— 责任书缺签 / 补签撤销
 *   TASK_OVERDUE / TASK_DONE                —— 上级任务逾期 / 完成撤销
 *   MEETING_ABSENT / MEETING_ATTEND         —— 安全会议缺席 / 补参撤销
 */

const { pool } = require('../config/db');
const engine = require('./assessmentScoringEngine');
const ruleEngine = require('./ruleEngine/engine');

// 事件类型枚举
const EVENT_TYPES = {
  VIOLATION_CREATED: 'VIOLATION_CREATED',
  VIOLATION_DELETED: 'VIOLATION_DELETED',
  VIOLATION_UNCLOSED: 'VIOLATION_UNCLOSED',
  VIOLATION_CLOSED: 'VIOLATION_CLOSED',
  HAZARD_OVERDUE: 'HAZARD_OVERDUE',
  HAZARD_RESOLVED: 'HAZARD_RESOLVED',
  ACCIDENT_CREATED: 'ACCIDENT_CREATED',
  ACCIDENT_DELETED: 'ACCIDENT_DELETED',
  TRAINING_FAILED: 'TRAINING_FAILED',
  TRAINING_DELETED: 'TRAINING_DELETED',
  GRID_MISS: 'GRID_MISS',
  RESP_MISSING: 'RESP_MISSING',
  RESP_SIGNED: 'RESP_SIGNED',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_DONE: 'TASK_DONE',
  MEETING_ABSENT: 'MEETING_ABSENT',
  MEETING_ATTEND: 'MEETING_ATTEND',
};

// 三违「自身行为」个人扣分基准分（仅作直属上级传导比例基准使用）。
// 注：阶段2 起，违规人个人 HSE-KPI-SAF-001 扣分已移交规则引擎（violation_record 适配器）
// 按月度统一扫描落库，本文件不再对个人 applyDeduction，避免与引擎路径重复扣分。
const THREE_VIOLATION_PERSONAL_SCORE = 5;

/**
 * 对外发布事件（fire-and-forget，抛错不影响调用方）
 * @param {string} type - 事件类型
 * @param {object} payload - 事件载荷
 * @param {Object} opts - { silent: true } 表示静默（供测试/导入触发，不记日志）
 */
function publish(type, payload = {}, opts = {}) {
  // 一般场景：setImmediate 异步处理，不阻塞业务请求
  setImmediate(() => {
    consume(type, payload).catch((err) => {
      console.error(`[assessment-event] ${type} 处理失败:`, err.message);
    });
  });
  return true;
}

/**
 * 立即同步消费事件（供定时任务 / 测试直接调用）
 */
async function consume(type, payload = {}) {
  const eventKey = buildEventKey(type, payload);
  if (!eventKey) return { ok: false, reason: 'missing-key' };

  const metricSource = {
    [EVENT_TYPES.VIOLATION_CREATED]: ['violation_records', payload.violationId],
    [EVENT_TYPES.VIOLATION_DELETED]: ['violation_records', payload.violationId],
    [EVENT_TYPES.VIOLATION_UNCLOSED]: ['violation_records', payload.violationId],
    [EVENT_TYPES.VIOLATION_CLOSED]: ['violation_records', payload.violationId],
    [EVENT_TYPES.HAZARD_OVERDUE]: ['hse_rectifications', payload.rectificationId],
    [EVENT_TYPES.HAZARD_RESOLVED]: ['hse_rectifications', payload.rectificationId],
    [EVENT_TYPES.ACCIDENT_CREATED]: ['accidents', payload.accidentId],
    [EVENT_TYPES.ACCIDENT_DELETED]: ['accidents', payload.accidentId],
    [EVENT_TYPES.TRAINING_FAILED]: ['training_records', payload.trainingId],
    [EVENT_TYPES.TRAINING_DELETED]: ['training_records', payload.trainingId],
    [EVENT_TYPES.GRID_MISS]: ['grid_inspection_records', payload.gridInspectionKey],
    [EVENT_TYPES.RESP_MISSING]: ['safety_responsibility_forms', payload.formId],
    [EVENT_TYPES.RESP_SIGNED]: ['safety_responsibility_forms', payload.formId],
    [EVENT_TYPES.TASK_OVERDUE]: ['hse_tasks', payload.taskId],
    [EVENT_TYPES.TASK_DONE]: ['hse_tasks', payload.taskId],
    [EVENT_TYPES.MEETING_ABSENT]: ['meeting_records', payload.meetingKey],
    [EVENT_TYPES.MEETING_ATTEND]: ['meeting_records', payload.meetingKey],
  }[type] || [null, null];

  const [sourceTable, sourceId] = metricSource;

  // 幂等登记（唯一键冲突说明已处理过，直接跳过）
  let inserted;
  try {
    const ins = await pool.query(
      `INSERT INTO hse_assessment_event_log (event_type, event_key, payload, status, related_cycle_id)
       VALUES ($1, $2, $3, 'processing', $4)
       RETURNING *`,
      [type, eventKey, payload, getRelatedCycleIdFor(payload)]
    );
    inserted = ins.rows[0];
  } catch (e) {
    if (e.code === '23505') {
      return { ok: false, reason: 'duplicate-event', eventKey };
    }
    // 事件日志表可能尚未创建：降级为不记幂等直接处理一次
    console.warn('[assessment-event] 事件日志表不可用，降级处理:', e.message);
  }

  try {
    const result = await dispatch(type, payload, { sourceTable, sourceId });

    if (inserted) {
      await pool.query(
        `UPDATE hse_assessment_event_log SET status='success', processed_at=NOW(), error_message=NULL WHERE id=$1`,
        [inserted.id]
      );
    }
    return { ok: true, result };
  } catch (error) {
    if (inserted) {
      await pool.query(
        `UPDATE hse_assessment_event_log SET status='failed', error_message=$1, processed_at=NOW() WHERE id=$2`,
        [String(error.message).slice(0, 500), inserted.id]
      );
    }
    throw error;
  }
}

// ------------------------------------------
// 辅助
// ------------------------------------------

function buildEventKey(type, payload) {
  // 各事件唯一键：优先取业务主键
  const map = {
    VIOLATION_CREATED: payload.violationId,
    VIOLATION_DELETED: payload.violationId,
    VIOLATION_UNCLOSED: payload.violationId,
    VIOLATION_CLOSED: payload.violationId,
    HAZARD_OVERDUE: payload.rectificationId ?? payload.hazardId,
    HAZARD_RESOLVED: payload.rectificationId ?? payload.hazardId,
    ACCIDENT_CREATED: payload.accidentId,
    ACCIDENT_DELETED: payload.accidentId,
    TRAINING_FAILED: payload.trainingId,
    TRAINING_DELETED: payload.trainingId,
    GRID_MISS: payload.gridInspectionKey,
    RESP_MISSING: payload.formId,
    RESP_SIGNED: payload.formId,
    TASK_OVERDUE: payload.taskId,
    TASK_DONE: payload.taskId,
    MEETING_ABSENT: payload.meetingKey,
    MEETING_ATTEND: payload.meetingKey,
  };
  const key = map[type];
  return key != null ? `${type}:${key}` : null;
}

function getRelatedCycleIdFor(payload) {
  return payload.cycleId ?? null;
}

/**
 * 找到事件涉及人员的考核周期（容忍 payload 传 cycleId）
 */
async function resolveCycle(payload) {
  if (payload.cycleId) {
    const c = await pool.query('SELECT * FROM hse_assessment_cycle WHERE id=$1 AND is_deleted=false', [payload.cycleId]);
    if (c.rows.length) return c.rows[0];
  }
  const date = payload.eventDate || payload.occurredAt || payload.date || new Date();
  return engine.findCycleForDate(date);
}

/**
 * 为该 target 生成自动扣分明细并重算（幂等）
 */
async function applyDeduction(target, cycle, spec, eventType) {
  const { metricCode, sourceTable, sourceId, detail, item, score } = spec;
  const added = await engine.addAutoDeduction({
    targetId: target.id,
    cycleId: cycle.id,
    metricCode,
    deductionItem: item,
    sourceTable,
    sourceId,
    sourceDetail: {
      ...detail,
      eventType,
      sourceId,
    },
    suggestedScore: score,
  });
  if (added) {
    await engine.recalculateTarget(cycle.id, target.id);
    await engine.logAudit({
      operationType: 'AUTO_DEDUCTION_ADD',
      targetType: 'target', targetId: target.id,
      targetDesc: `${target.employee_name}: 自动扣分 ${score}（${item}）`,
      detail: { eventType, metricCode, sourceTable, sourceId, score },
    });
  }
  return added;
}

/**
 * 撤销该 target 的自动扣分明细并重算
 */
async function revokeDeduction(target, cycle, spec, eventType) {
  const { metricCode, sourceTable, sourceId } = spec;
  const removed = await engine.removeAutoDeduction({
    targetId: target.id, cycleId: cycle.id, metricCode, sourceTable, sourceId,
  });
  if (removed) {
    await engine.recalculateTarget(cycle.id, target.id);
    await engine.logAudit({
      operationType: 'AUTO_DEDUCTION_REVOKE',
      targetType: 'target', targetId: target.id,
      targetDesc: `${target.employee_name}: 撤销自动扣分（${eventType}）`,
      detail: { eventType, metricCode, sourceTable, sourceId },
    });
  }
  return removed;
}

/**
 * 事件分发：定位受影响对象 → 生成/撤销扣分 → 重算
 */
async function dispatch(type, payload, { sourceTable, sourceId }) {
  const cycle = await resolveCycle(payload);
  if (!cycle) return { skipped: 'no-cycle' }; // 当月无考核周期，跳过

  switch (type) {
    case EVENT_TYPES.VIOLATION_CREATED: return await onViolationCreated(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.VIOLATION_DELETED: return await onViolationDeleted(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.VIOLATION_UNCLOSED: return await onViolationUnclosed(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.VIOLATION_CLOSED: return await onViolationClosed(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.HAZARD_OVERDUE: return await onHazardOverdue(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.HAZARD_RESOLVED: return await onHazardResolved(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.ACCIDENT_CREATED: return await onAccidentChanged(payload, cycle);
    case EVENT_TYPES.ACCIDENT_DELETED: return await onAccidentChanged(payload, cycle);
    case EVENT_TYPES.TRAINING_FAILED: return await onTrainingFailed(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.TRAINING_DELETED: return await onTrainingDeleted(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.GRID_MISS: return { skipped: 'grid-miss-disabled', reason: '网格缺次已改由月度统一扫描（gridUncheckedDeductionService）扣分' };
    case EVENT_TYPES.RESP_MISSING: return await onRespMissing(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.RESP_SIGNED: return await onRespSigned(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.TASK_OVERDUE: return await onTaskOverdue(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.TASK_DONE: return await onTaskDone(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.MEETING_ABSENT: return await onMeetingAbsent(payload, cycle, sourceTable, sourceId);
    case EVENT_TYPES.MEETING_ATTEND: return await onMeetingAttend(payload, cycle, sourceTable, sourceId);
    default:
      return { skipped: `unsupported-type:${type}` };
  }
}

// ------------------------------------------
// 事件处理器
// ------------------------------------------

/**
 * 需要在 target 存在时才扣分（若员工不是考核对象，个人分跳过，上级传导仍执行）
 */
async function targetOrNull(cycle, employeeId) {
  if (!employeeId) return null;
  return engine.findAssessmentTarget(cycle.id, employeeId);
}

/**
 * 生成/撤销对直属上级的传导扣分（复用发动机，写入 chain_transmission 逻辑）
 */
async function applyTransmission(cycle, subordinate, originSpec, eventType) {
  if (!subordinate?.manager) return null;
  const managerTarget = await targetOrNull(cycle, subordinate.manager.id);
  if (!managerTarget) return null; // 上级不是考核对象

  // 传导分 = 个人扣分 × 传导比例（100%）
  const transmissionScore = Math.round((originSpec.score || 0) * engine.TRANSMISSION_RATIO * 100) / 100;
  const chainCode = originSpec.transmitMetricCode;

  return applyDeduction(managerTarget, cycle, {
    metricCode: chainCode || originSpec.metricCode,
    sourceTable: originSpec.sourceTable,
    sourceId: originSpec.sourceId,
    item: `（传导）下属${subordinate.name}：${originSpec.item}`,
    score: transmissionScore,
    detail: {
      isTransmission: true,
      subordinateId: subordinate.id,
      subordinateName: subordinate.name,
      managerId: subordinate.manager.id,
      transmissionRatio: engine.TRANSMISSION_RATIO,
      chainLevel: engine.CHAIN_LEVEL,
      ...originSpec.detail,
    },
  }, eventType);
}

// --- 三违 ---

async function onViolationUnclosed(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.violatorId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-SAF-003',
    sourceTable: 'violation_records',
    sourceId: payload.violationId,
    item: `三违超期未处理1条`,
    score: 2,
    detail: { violationDate: payload.violationDate, violationType: payload.violationType },
  };
  const added = await applyDeduction(target, cycle, spec, 'VIOLATION_UNCLOSED');
  return { affected: added ? 1 : 0, cycleId: cycle.id };
}

async function onViolationClosed(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.violatorId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-SAF-003',
    sourceTable: 'violation_records',
    sourceId: payload.violationId,
  };
  const removed = await revokeDeduction(target, cycle, spec, 'VIOLATION_CLOSED');
  return { affected: removed ? 1 : 0, cycleId: cycle.id };
}

async function onViolationCreated(payload, cycle, sourceTable, sourceId) {
  const violatorId = payload.violatorId;
  const spec = {
    metricCode: 'HSE-KPI-SAF-001', // 三违行为管控（仅作传导比例基准）
    sourceTable: 'violation_records',
    sourceId: payload.violationId,
    item: `三违1次`,
    score: THREE_VIOLATION_PERSONAL_SCORE,
    detail: {
      violationType: payload.violationType,
      violationDate: payload.violationDate,
      violatorName: payload.violatorName,
    },
  };

  const results = [];

  // 违规人个人 HSE-KPI-SAF-001 扣分已移交规则引擎（violation_record 适配器）按月度统一扫描落库，
  // 此处不再 applyDeduction 到违规人 target，避免与引擎路径重复扣分。
  // 仅保留「直属上级传导」（chain_transmission，引擎不覆盖）
  const violatorEmp = await engine.getEmployeeWithManager(violatorId);
  if (violatorEmp) {
    // 直属上级传导（若上级是考核对象）
    results.push(await applyTransmission(cycle, violatorEmp, spec, 'VIOLATION_CREATED'));
  }
  return { affected: results.length, cycleId: cycle.id };
}

async function onViolationDeleted(payload, cycle, sourceTable, sourceId) {
  const spec = {
    metricCode: 'HSE-KPI-SAF-001',
    sourceTable: 'violation_records',
    sourceId: payload.violationId,
  };
  const results = [];

  const violatorEmp = await engine.getEmployeeWithManager(payload.violatorId);
  if (violatorEmp) {
    // 个人扣分撤销：已移交规则引擎（软删违规记录后由引擎 scan 自动撤销），此处不再处理
    // 撤销上级传导（上级 target 上对应的明细也删）
    if (violatorEmp.manager) {
      const mTarget = await targetOrNull(cycle, violatorEmp.manager.id);
      if (mTarget) {
        const removed = await engine.removeAutoDeduction({
          targetId: mTarget.id, cycleId: cycle.id, metricCode: spec.metricCode,
          sourceTable: spec.sourceTable, sourceId: spec.sourceId,
        });
        if (removed) {
          await engine.recalculateTarget(cycle.id, mTarget.id);
          results.push(removed);
        }
      }
    }
  }
  return { affected: results.length, cycleId: cycle.id };
}

// --- 隐患整改超期 ---

async function onHazardOverdue(payload, cycle, sourceTable, sourceId) {
  const responsibleId = payload.responsiblePersonId;
  const spec = {
    metricCode: 'HSE-KPI-HZD-002',
    sourceTable: 'hse_rectifications',
    sourceId: payload.rectificationId ?? payload.hazardId,
    item: `隐患超期未整改1条`,
    score: 3,
    detail: { deadline: payload.deadline, hazardId: payload.hazardId },
  };
  const emp = await engine.getEmployeeWithManager(responsibleId);
  if (!emp) return { affected: 0, cycleId: cycle.id };
  const target = await targetOrNull(cycle, responsibleId);
  const results = [];
  if (target) results.push(await applyDeduction(target, cycle, spec, 'HAZARD_OVERDUE'));
  const t = await applyTransmission(cycle, emp, spec, 'HAZARD_OVERDUE');
  if (t) results.push(t);
  return { affected: results.length, cycleId: cycle.id };
}

async function onHazardResolved(payload, cycle, sourceTable, sourceId) {
  const spec = {
    metricCode: 'HSE-KPI-HZD-002',
    sourceTable: 'hse_rectifications',
    sourceId: payload.rectificationId ?? payload.hazardId,
  };
  const results = [];
  const emp = await engine.getEmployeeWithManager(payload.responsiblePersonId);
  if (emp) {
    const target = await targetOrNull(cycle, payload.responsiblePersonId);
    if (target) results.push(await revokeDeduction(target, cycle, spec, 'HAZARD_RESOLVED'));
    if (emp.manager) {
      const mTarget = await targetOrNull(cycle, emp.manager.id);
      if (mTarget) {
        const removed = await engine.removeAutoDeduction({
          targetId: mTarget.id, cycleId: cycle.id, metricCode: spec.metricCode,
          sourceTable: spec.sourceTable, sourceId: spec.sourceId,
        });
        if (removed) { await engine.recalculateTarget(cycle.id, mTarget.id); results.push(removed); }
      }
    }
  }
  return { affected: results.length, cycleId: cycle.id };
}

// --- 事故（否决项）：由「月度事故否决适配器」统一匹配扣分，事件只触发该周期重扫 ---
// 原实现对当事人本人 applyDeduction(100 否决) 已废（2026-09-05 改为按事故类别匹配直接上级+乡镇经理）。

async function onAccidentChanged(payload, cycle) {
  const res = await ruleEngine.runCycleAdapters(cycle.id, { adapterKeys: ['accident_veto'] });
  return {
    affected: res.affected || 0,
    ok: !!res.ok,
    reason: res.reason || 'adapter-rescanned',
    cycleId: cycle.id,
  };
}

// --- 培训不合格 ---

async function onTrainingFailed(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.employeeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-TRN-002',
    sourceTable: 'training_records',
    sourceId: payload.trainingId,
    item: `培训不合格1次`,
    score: 3,
    detail: { content: payload.content, trainingDate: payload.trainingDate },
  };
  const added = await applyDeduction(target, cycle, spec, 'TRAINING_FAILED');
  return { affected: added ? 1 : 0, cycleId: cycle.id };
}

async function onTrainingDeleted(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.employeeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-TRN-002',
    sourceTable: 'training_records',
    sourceId: payload.trainingId,
  };
  const removed = await revokeDeduction(target, cycle, spec, 'TRAINING_DELETED');
  return { affected: removed ? 1 : 0, cycleId: cycle.id };
}

// --- 网格巡查缺次 ---

async function onGridMiss(payload, cycle, sourceTable, sourceId) {
  const gridPersonId = payload.employeeId;
  const target = await targetOrNull(cycle, gridPersonId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-GRD-001',
    sourceTable: 'grid_inspection_records',
    // 用"人员+日期"拼唯一键，避免同一缺次多次计数
    sourceId: payload.gridInspectionKey,
    item: `网格巡查缺次（${payload.gridLevel || ''}）`,
    score: payload.deductScore || 1,
    detail: { date: payload.date, gridLevel: payload.gridLevel },
  };
  const added = await applyDeduction(target, cycle, spec, 'GRID_MISS');
  return { affected: added ? 1 : 0, cycleId: cycle.id };
}

// --- 责任书缺签 ---

async function onRespMissing(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.employeeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-RESP-002',
    sourceTable: 'safety_responsibility_forms',
    sourceId: payload.formId ?? `${payload.employeeId}-${payload.formType||'responsibility'}`,
    item: `责任书缺签1份`,
    score: 1,
    detail: { formType: payload.formType },
  };
  const added = await applyDeduction(target, cycle, spec, 'RESP_MISSING');
  return { affected: added ? 1 : 0, cycleId: cycle.id };
}

async function onRespSigned(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.employeeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-RESP-002',
    sourceTable: 'safety_responsibility_forms',
    sourceId: payload.formId ?? `${payload.employeeId}-${payload.formType||'responsibility'}`,
  };
  const removed = await revokeDeduction(target, cycle, spec, 'RESP_SIGNED');
  return { affected: removed ? 1 : 0, cycleId: cycle.id };
}

// --- 上级任务逾期 ---

async function onTaskOverdue(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.assigneeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-RESP-003',
    sourceTable: 'hse_tasks',
    sourceId: payload.taskId,
    item: `上级任务逾期未完成1项`,
    score: 3,
    detail: { title: payload.title, deadline: payload.deadline },
  };
  const added = await applyDeduction(target, cycle, spec, 'TASK_OVERDUE');
  return { affected: added ? 1 : 0, cycleId: cycle.id };
}

async function onTaskDone(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.assigneeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-RESP-003',
    sourceTable: 'hse_tasks',
    sourceId: payload.taskId,
  };
  const removed = await revokeDeduction(target, cycle, spec, 'TASK_DONE');
  return { affected: removed ? 1 : 0, cycleId: cycle.id };
}

// --- 安全会议缺席 ---

async function onMeetingAbsent(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.employeeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-RESP-004',
    sourceTable: 'meeting_records',
    // source_id 为 bigint 列，必须用数值型 id；meetingKey 仅作事件日志幂等键
    sourceId: payload.recordId ?? payload.meetingRecordId,
    item: `安全会议缺席1次`,
    score: 2,
    detail: { meetingDate: payload.date, meetingSubject: payload.subject },
  };
  const added = await applyDeduction(target, cycle, spec, 'MEETING_ABSENT');
  return { affected: added ? 1 : 0, cycleId: cycle.id };
}

async function onMeetingAttend(payload, cycle, sourceTable, sourceId) {
  const target = await targetOrNull(cycle, payload.employeeId);
  if (!target) return { affected: 0, cycleId: cycle.id };
  const spec = {
    metricCode: 'HSE-KPI-RESP-004',
    sourceTable: 'meeting_records',
    sourceId: payload.recordId ?? payload.meetingRecordId,
  };
  const removed = await revokeDeduction(target, cycle, spec, 'MEETING_ATTEND');
  return { affected: removed ? 1 : 0, cycleId: cycle.id };
}

module.exports = {
  EVENT_TYPES,
  publish,
  consume,
  // 暴露内部处理器便于定时任务触发单类补偿
  onGridMiss,
};