/**
 * 月度安全履职自动考核 —— 定时任务调度器
 *
 * 调度策略：
 *   1. 每月1日 00:30  自动确保考核周期存在（当月 + 上月兜底）+ 同步考核对象（经理/管理员/网格长）
 *   2. 每日 02:00    全量校验：重算所有进行中周期对象分数 + 重放失败事件
 *   3. 每日 01:00    网格巡查频次校验：对考核对象中网格负责人昨日缺次扣分
 *      （窗口含今天的周期 + 刚结束 3 天内的周期，月初补跑上月收尾，upsert 幂等）
 *
 * 遵循现有 employeeHealthCheckScheduler.js 风格：ENABLED 开关 + init/trigger/stop。
 */

const cron = require('node-cron');
const { pool, isConnected } = require('../config/db');
const engine = require('./assessmentScoringEngine');
const eventService = require('./assessmentEventService');
const gridUncheckedDeduction = require('./gridUncheckedDeductionService');
const { CONFIRMED_TARGET_ELIGIBILITY_SQL, FORMAL_EMPLOYEE_ELIGIBILITY_SQL } = require('./assessmentTargetEligibility');

// ============================================================
// 配置
// ============================================================

// 调度总开关：默认启用；显式设置环境变量 SCHEDULER_ENABLED='false' 才停用。
// 便于运维在不需要自动考核时临时关闭，无需改代码重发。
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false';

const CRON_CREATE_CYCLE = '30 0 1 * *'; // 每月1日00:30
const CRON_DAILY_CHECK = '0 2 * * *';   // 每日02:00
const CRON_GRID_CHECK = '0 1 * * *';    // 每日01:00
const CRON_TZ = 'Asia/Shanghai';

// ============================================================
// 一、自动创建上月考核周期 + 同步对象
// ============================================================

/**
 * 计算调度"应保障"的考核周期月份列表（纯函数，便于单测）：
 *   - 第一项：当月（如 2026-09-01 任意时刻 → {year:2026, month:9}）
 *   - 第二项：上月（兜底，防漏建；如 {year:2026, month:8}）
 * 跨年正确：2026-01-15 → 当月 {2026,1}、上月 {2025,12}
 * 注：原 lastMonthDate() 仅算上月且为死代码，已由本函数取代。
 */
function getScheduledTargetMonths(now = new Date()) {
  const curr = { year: now.getFullYear(), month: now.getMonth() + 1 };
  // 上月 = 当月1号减1天 → 上月最后一天（Date 自动借位跨年）
  const prevDate = new Date(now.getFullYear(), now.getMonth(), 1);
  prevDate.setDate(prevDate.getDate() - 1);
  const prev = { year: prevDate.getFullYear(), month: prevDate.getMonth() + 1 };
  return [curr, prev];
}

/**
 * 自动确保"当月 + 上月兜底"两个考核周期存在（幂等），供每月1日 00:30 调度调用。
 * 已存在的周期由 autoCreateAndSyncCycle 内部跳过（返回 skipped:'cycle-exists'）。
 */
async function createScheduledCycles(now = new Date()) {
  console.log('[assessment-scheduler] 自动确保考核周期存在（当月+上月兜底）');
  const months = getScheduledTargetMonths(now);
  for (const { year, month } of months) {
    try {
      const r = await autoCreateAndSyncCycle(year, month);
      console.log(`[assessment-scheduler] 周期创建结果 ${year}-${String(month).padStart(2, '0')}:`, JSON.stringify(r));
    } catch (e) {
      console.error(`[assessment-scheduler] 周期创建失败 ${year}-${String(month).padStart(2, '0')}:`, e.message);
    }
  }
}

function cycleBoundary(year, month) {
  // month: 1-12
  // ⚠️ 服务器时区固定 Asia/Shanghai，业务日边界必须用「本地午夜」构造。
  // 禁止 Date.UTC：Date.UTC 构造的 instant 落库为 UTC 0 点 = 北京 08:00，
  // 会让周期窗口偏 8 小时（9/1 01:00 网格校验 start_time<=NOW() 不成立、月末跨入下月早 8）。
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0); // 当月1日 00:00:00.000（本地）
  const end = new Date(year, month, 0, 23, 59, 59, 999);  // 当月最后一天 23:59:59.999（本地；month+1 的第 0 天 = 上月末，自动借位跨年）
  return { start, end };
}

/**
 * 自动创建某年/月考核周期（幂等），并同步对象
 */
async function autoCreateAndSyncCycle(year, month, { operatorName = 'system' } = {}) {
  if (!isConnected()) return { ok: false, reason: 'memory-mode' };
  const cycleCode = `HSE-CYCLE-${year}${String(month).padStart(2, '0')}`;

  const exists = await pool.query(
    `SELECT * FROM hse_assessment_cycle WHERE cycle_code=$1 AND is_deleted=FALSE`,
    [cycleCode]
  );
  if (exists.rows.length) {
    return { ok: true, skipped: 'cycle-exists', cycleId: exists.rows[0].id };
  }

  const { start, end } = cycleBoundary(year, month);
  const ins = await pool.query(
    `INSERT INTO hse_assessment_cycle
      (cycle_code, cycle_name, cycle_type, assessment_year, assessment_month,
       start_time, end_time, status, created_by_name, remark)
     VALUES ($1, $2, 'monthly', $3, $4, $5, $6, 'in_progress', $7, '按月自动生成')
     RETURNING *`,
    [
      cycleCode, `${year}年${month}月月度考核`, year, month,
      start, end, operatorName,
    ]
  );
  const cycle = ins.rows[0];

  const synced = await syncAssessmentTargets(cycle.id);
  await engine.logAudit({
    operatorId: null, operationType: 'CYCLE_AUTO_CREATED',
    targetType: 'cycle', targetId: cycle.id, targetDesc: cycleCode,
    detail: { synced },
  });
  return { ok: true, cycleId: cycle.id, synced };
}

/**
 * 同步考核对象到周期（含网格长）
 * 与 /cycles/:id/targets/sync 一致的白名单过滤 + 网格长扩展
 */
async function syncAssessmentTargets(cycleId) {
  if (!isConnected()) return { inserted: 0, removed: 0 };

  // 1) 反向清理不再符合白名单的对象
  // 日期拟合：指派期 [start_date,end_date] 须与周期 [start_time,end_time] 相交，
  // 避免把已离任人员纳入其离任之后的周期（end_date 为 NULL 视为仍在职）。
  const removed = await pool.query(
    `DELETE FROM hse_assessment_target t
     WHERE t.cycle_id=$1 AND t.is_deleted=FALSE
       AND NOT EXISTS (
         SELECT 1 FROM v_employee_org_full v
         WHERE v.employee_id=t.employee_id AND v.relation_status='active'
           AND (
             v.position_name='乡镇作业中心经理'
             OR (v.position_name='管理员' AND v.org_type='town_center')
             OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE)=FALSE)
             OR ${CONFIRMED_TARGET_ELIGIBILITY_SQL}
           )
           AND (v.start_date IS NULL OR v.start_date <= (SELECT end_time FROM hse_assessment_cycle WHERE id=$1))
           AND (v.end_date IS NULL OR v.end_date >= (SELECT start_time FROM hse_assessment_cycle WHERE id=$1))
       )`,
    [cycleId]
  );

  // 2) 正向插入符合白名单的新对象
  const inserted = await pool.query(
    `INSERT INTO hse_assessment_target
      (cycle_id, employee_id, employee_code, employee_name, position, township, department)
     SELECT $1, v.employee_id, v.employee_code, v.name, v.position_name,
       COALESCE(
         (SELECT t.org_name FROM hse_org_unit t
          WHERE t.org_type='town_center' AND t.is_deleted=false
            AND (v.org_path=t.org_path OR v.org_path LIKE t.org_path||'/%')
          ORDER BY length(t.org_path) DESC LIMIT 1), v.org_name) as township,
       COALESCE(v.org_name,'')
     FROM v_employee_org_full v
     WHERE v.relation_status='active'
       AND ${FORMAL_EMPLOYEE_ELIGIBILITY_SQL}
       AND (
         v.position_name='乡镇作业中心经理'
         OR (v.position_name='管理员' AND v.org_type='town_center')
         OR v.employee_id IN (SELECT ga.personnel_id FROM grid_areas ga WHERE ga.personnel_id IS NOT NULL AND COALESCE(ga.is_deleted, FALSE)=FALSE)
         OR ${CONFIRMED_TARGET_ELIGIBILITY_SQL}
       )
       AND (v.start_date IS NULL OR v.start_date <= (SELECT end_time FROM hse_assessment_cycle WHERE id=$1))
       AND (v.end_date IS NULL OR v.end_date >= (SELECT start_time FROM hse_assessment_cycle WHERE id=$1))
       AND v.employee_id NOT IN (
         SELECT employee_id FROM hse_assessment_target WHERE cycle_id=$1
       )
     RETURNING id`,
    [cycleId]
  );

  // 同步目标数
  await pool.query(
    `UPDATE hse_assessment_cycle SET target_count=$1, updated_at=NOW() WHERE id=$2`,
    [removed.rowCount + inserted.rowCount, cycleId]
  );

  return { inserted: inserted.rowCount, removed: removed.rowCount };
}

// ============================================================
// 二、每日全量校验 + 失败事件重放
// ============================================================

async function runDailyCheck() {
  if (!isConnected()) return { skipped: 'memory-mode' };

  const cycles = await pool.query(
    `SELECT id, cycle_code, status FROM hse_assessment_cycle
     WHERE status IN ('in_progress','pending_review','reviewed') AND is_deleted=FALSE`
  );

  const result = { cycles: 0, targets: 0, failures: 0 };

  for (const c of cycles.rows) {
    const targets = await pool.query(
      `SELECT id, score_total FROM hse_assessment_target
       WHERE cycle_id=$1 AND is_deleted=FALSE`,
      [c.id]
    );
    for (const t of targets.rows) {
      const before = Number(t.score_total ?? 0);
      try {
        const r = await engine.recalculateTarget(c.id, t.id);
        if (r.ok) {
          result.targets++;
          if (Math.abs(Number(r.scoreTotal) - before) > 0.01) {
            result.failures++;
            await engine.logAudit({
              operationType: 'DAILY_RECONCILIATION_FIXED',
              targetType: 'target', targetId: t.id, targetDesc: `${c.cycle_code} 对象重算`,
              detail: { before, after: r.scoreTotal },
            });
          }
        }
      } catch (e) {
        result.failures++;
        console.error(`[assessment-scheduler] 周期${c.id} 对象${t.id} 重算失败:`, e.message);
      }
    }
    result.cycles++;
  }

  // 重放失败事件（status='failed'）；pending 且超过10分钟也视为失败重放
  const failed = await pool.query(
    `SELECT id, event_type, event_key, payload FROM hse_assessment_event_log
     WHERE status = 'failed'
        OR (status = 'processing' AND processed_at IS NULL AND created_at < NOW() - INTERVAL '10 minutes')
     LIMIT 100`
  );
  for (const ev of failed.rows) {
    // 重新申请：先置回 pending，再直接消费（consume 内会因唯一键冲突而跳过已成功的）
    try {
      await pool.query(`UPDATE hse_assessment_event_log SET status='pending' WHERE id=$1`, [ev.id]);
      await eventService.consume(ev.event_type, ev.payload || {});
    } catch (e) {
      console.error(`[assessment-scheduler] 事件重放失败 ${ev.event_type}:${ev.event_key}`, e.message);
    }
  }

  // 时间依赖扣分扫描（超期整改 / 三违未处理 / 任务逾期）——幂等，仅生成一次扣分
  const scanned = await scanOverdueDeductions();

  console.log(`[assessment-scheduler] 每日校验完成: cycles=${result.cycles} targets=${result.targets} diffs=${result.failures} retried=${failed.rowCount} scanned=${JSON.stringify(scanned)}`);
  return { ...result, scanned };
}

/**
 * 扫描时间敏感性扣分项并生成扣分明细（幂等，由事件日志去重）：
 *   1. 隐患整改任务超期未闭环  → HZD-002 责任人扣3分
 *   2. 三违记录超7天未关闭     → SAF-003 违规人扣2分
 *   3. 上级任务逾期未完成      → RESP-003 负责人扣3分
 */
async function scanOverdueDeductions() {
  if (!isConnected()) return { rectOverdue: 0, violationUnclosed: 0, taskOverdue: 0, meetingAbsent: 0 };
  const stats = { rectOverdue: 0, violationUnclosed: 0, taskOverdue: 0, meetingAbsent: 0 };

  // 1) 隐患整改超期
  try {
    const rects = await pool.query(
      `SELECT r.id, r.hazard_id, r.responsible_person_id, r.deadline
       FROM hse_rectifications r
       WHERE r.deadline IS NOT NULL AND r.deadline < NOW()
         AND COALESCE(r.status,'') NOT IN ('resolved','closed')
       LIMIT 500`
    );
    for (const row of rects.rows) {
      try {
        await eventService.consume(eventService.EVENT_TYPES.HAZARD_OVERDUE, {
          rectificationId: row.id,
          hazardId: row.hazard_id,
          responsiblePersonId: row.responsible_person_id,
          deadline: row.deadline,
          eventDate: row.deadline,
        });
        stats.rectOverdue++;
      } catch (e) { }
    }
  } catch (e) {
    console.warn('[assessment-scheduler] 超期整改扫描不可用，跳过:', e.message);
  }

  // 2) 三违记录超7天未关闭
  try {
    const violations = await pool.query(
      `SELECT id, violator_id, violation_date
       FROM violation_records
       WHERE status IN ('待处理','整改中')
         AND violation_date < NOW() - INTERVAL '7 days'
         AND is_deleted = FALSE
       LIMIT 500`
    );
    for (const row of violations.rows) {
      try {
        await eventService.consume(eventService.EVENT_TYPES.VIOLATION_UNCLOSED, {
          violationId: row.id,
          violatorId: row.violator_id,
          violationDate: row.violation_date,
          violationType: '未及时处理',
        });
        stats.violationUnclosed++;
      } catch (e) { }
    }
  } catch (e) {
    console.warn('[assessment-scheduler] 三违未处理扫描不可用，跳过:', e.message);
  }

  // 3) 上级任务逾期未完成
  try {
    const tasks = await pool.query(
      `SELECT id, title, responsible_person_id AS assignee_id, deadline
       FROM hse_tasks
       WHERE deadline IS NOT NULL AND deadline < NOW()
         AND COALESCE(status,'') NOT IN ('done','completed','已完成')
       LIMIT 500`
    );
    for (const row of tasks.rows) {
      try {
        await eventService.consume(eventService.EVENT_TYPES.TASK_OVERDUE, {
          taskId: row.id,
          title: row.title,
          assigneeId: row.assignee_id,
          deadline: row.deadline,
          eventDate: row.deadline,
        });
        stats.taskOverdue++;
      } catch (e) { }
    }
  } catch (e) {
    console.warn('[assessment-scheduler] 任务逾期扫描不可用，跳过:', e.message);
  }

  // 4) 安全会议缺席（RESP-004）—— 由每日扫描兜底发布 MEETING_ABSENT
  //    meeting_records.attendance_status='absent' 视为缺席；幂等由事件日志去重，
  //    缺席记录标记已处理（processing_scope），避免在周期内重复计数
  try {
    const absentMeetings = await pool.query(
      `SELECT m.id AS record_id, m.meeting_code, m.meeting_name, m.meeting_date,
              m.employee_id
       FROM meeting_records m
       WHERE m.attendance_status = 'absent'
         AND m.is_deleted = FALSE
         AND NOT EXISTS (
           SELECT 1 FROM hse_assessment_event_log e
           WHERE e.event_type = 'MEETING_ABSENT'
             AND e.event_key = 'MEETING_ABSENT:' || m.meeting_code || ':' || m.employee_id
         )
       LIMIT 500`
    );
    for (const row of absentMeetings.rows) {
      try {
        await eventService.consume(eventService.EVENT_TYPES.MEETING_ABSENT, {
          employeeId: row.employee_id,
          recordId: row.record_id, // source_id（bigint）
          meetingKey: `${row.meeting_code}:${row.employee_id}`,
          code: row.meeting_code,
          subject: row.meeting_name,
          date: row.meeting_date,
          eventDate: row.meeting_date,
        });
        stats.meetingAbsent++;
      } catch (e) { }
    }
  } catch (e) {
    console.warn('[assessment-scheduler] 会议缺席扫描不可用，跳过:', e.message);
  }

  return stats;
}

// ============================================================
// 三、网格巡查频次校验
// ============================================================

/**
 * 每日 01:00 网格巡查兜底校验：
 * 仅对「当前在评周期」调用「月度缺巡同步」（幂等 upsert），
 * 口径与「执行评分」「台账上传」完全一致，天然不重复扣分。
 * 旧版按"滚动缺次"逐日发 GRID_MISS 事件已停用（见 assessmentEventService.dispatch）。
 */
async function runGridCheck() {
  if (!isConnected()) return { skipped: 'memory-mode' };

  let cycles;
  try {
    cycles = (
      await pool.query(
        `SELECT id, cycle_code, status FROM hse_assessment_cycle
         WHERE is_deleted=FALSE AND status IN ('in_progress','pending_review')
           AND start_time <= NOW()
           AND ( end_time >= NOW()
                 OR end_time >= NOW() - INTERVAL '3 days' )
         ORDER BY id DESC`
      )
    ).rows;
  } catch (e) {
    console.warn('[assessment-scheduler] 网格巡查校验不可用，降级跳过:', e.message);
    return { skipped: 'grid-check-unavailable' };
  }

  const result = { cycles: 0, scanned: 0, affected: 0 };
  for (const c of cycles) {
    try {
      const r = await gridUncheckedDeduction.syncGridUncheckedDeductions(c.id);
      if (r && r.ok) {
        result.cycles++;
        result.scanned += r.scanned || 0;
        result.affected += r.affected || 0;
      }
    } catch (e2) {
      console.error(`[assessment-scheduler] 周期#${c.id} 网格缺巡同步失败:`, e2.message);
    }
  }

  console.log(`[assessment-scheduler] 网格巡查校验完成: cycles=${result.cycles} scanned=${result.scanned} affected=${result.affected}`);
  return result;
}

// ============================================================
// 调度注册
// ============================================================

let tasks = { create: null, daily: null, grid: null };

function initAssessmentScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log('[assessment-scheduler] 定时调度已配置但未启用 (SCHEDULER_ENABLED=false)');
    return;
  }

  tasks.create = cron.schedule(CRON_CREATE_CYCLE, async () => {
    try {
      await createScheduledCycles(new Date());
    } catch (e) {
      console.error('[assessment-scheduler] 周期创建失败:', e.message);
    }
  }, { scheduled: true, timezone: CRON_TZ });

  tasks.daily = cron.schedule(CRON_DAILY_CHECK, async () => {
    console.log('[assessment-scheduler] 触发：每日全量校验');
    try { await runDailyCheck(); }
    catch (e) { console.error('[assessment-scheduler] 每日校验异常:', e.message); }
  }, { scheduled: true, timezone: CRON_TZ });

  tasks.grid = cron.schedule(CRON_GRID_CHECK, async () => {
    console.log('[assessment-scheduler] 触发：网格巡查校验');
    try { await runGridCheck(); }
    catch (e) { console.error('[assessment-scheduler] 网格校验异常:', e.message); }
  }, { scheduled: true, timezone: CRON_TZ });

  console.log(`[assessment-scheduler] ✅ 定时调度已启用:
    - 周期创建 ${CRON_CREATE_CYCLE} (${CRON_TZ})
    - 每日校验 ${CRON_DAILY_CHECK} (${CRON_TZ})
    - 网格校验 ${CRON_GRID_CHECK} (${CRON_TZ})`);
}

function stopAssessmentScheduler() {
  Object.values(tasks).forEach(t => { if (t) { try { t.stop(); } catch (e) {} } });
  console.log('[assessment-scheduler] 定时调度已停止');
}

module.exports = {
  SCHEDULER_ENABLED,
  cycleBoundary,
  getScheduledTargetMonths,
  createScheduledCycles,
  autoCreateAndSyncCycle,
  syncAssessmentTargets,
  runDailyCheck,
  scanOverdueDeductions,
  runGridCheck,
  initAssessmentScheduler,
  stopAssessmentScheduler,
};