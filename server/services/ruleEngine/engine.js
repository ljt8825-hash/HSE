/**
 * 规则引擎 · 主编排
 *
 * 阶段1 只挂载 grid_unchecked 一个适配器；阶段2 新增 violation_record（三违自身行为，
 * 事件级幂等）。严格复用迁移前的口径：
 *   周期状态守卫 → 年月解析 → 逐适配器扫描产出意图 → 类别上限钳制 → 幂等落库
 *   → 变更对象重算 → 可观测落库
 *
 * 对外入口：
 *   - runCycleAdapters(cycleId, { adapterKeys, dryRun })：执行指定（或全量）适配器
 *   - runCycleAutoDeductions(cycleId, { dryRun })：统一门面，执行全部自动扣分适配器
 *     （grid_unchecked + violation_record），返回含每适配器明细的结果，供调用点零感知复用。
 * 结果表仍为 hse_assessment_deduction（不启用 hse_assessment_score_detail）。
 */

const { pool, isConnected } = require('../../config/db');
const engine = require('../assessmentScoringEngine');
const { getRuleByAdapterKey, getRuleByCode } = require('./ruleLoader');
const { getAdapter, listActiveAdapterKeys, registerAdapter } = require('./adapterRegistry');
const { createDeductionWriter } = require('./deductionWriter');
const { applyCap, roleFromPosition } = require('./categoryCap');
const { recordRuleRun } = require('./runLogger');

// 参与 affected 统计的写入动作（locked / noop 不计入变更）
const CHANGED_ACTIONS = new Set(['inserted', 'revived', 'updated']);
// 判定「当期存在有效扣分行」的动作
const EFFECTIVE_ACTIONS = new Set(['inserted', 'revived', 'updated', 'noop', 'locked']);

// 统一门面默认执行的适配器（顺序即执行顺序）
const AUTO_DEDUCTION_ADAPTERS = [
  'grid_unchecked',
  'violation_record',
  'training_ledger',
  'driver_monthly',
  'driver_three_violation',
  'transfer_check',
  'safety_culture',
  'sanwei_excel',
  'accident_veto',
];

// 阶段1/2 注册适配器
let _initialized = false;
function ensureAdaptersRegistered() {
  if (_initialized) return;
  registerAdapter('grid_unchecked', require('./adapters/gridUncheckedAdapter'));
  registerAdapter('violation_record', require('./adapters/violationAdapter'));
  // 提示词-07 任务 B：VIOLATION002 备建注册（暂不进 AUTO 门面，激活前零影响）
  registerAdapter('violation_unrectified', require('./adapters/violationUnrectifiedAdapter'));
  // 2026-09-04：驾驶/转运站/培训台账三块接入自动评分（分值默认1、页面可自定义）
  registerAdapter('training_ledger', require('./adapters/trainingLedgerAdapter'));
  registerAdapter('driver_monthly', require('./adapters/driverMonthlyAdapter'));
  // 2026-09-12：驾驶员日常三违事件级扣分，每起1分传导到乡镇作业中心经理（计入三违管理）
  registerAdapter('driver_three_violation', require('./adapters/driverThreeViolationAdapter'));
  registerAdapter('transfer_check', require('./adapters/transferCheckAdapter'));
  // 2026-09-04：安全文化建设专项活动台帐（主管版）接入自动评分（未开展10分/项/次）
  registerAdapter('safety_culture', require('./adapters/safetyCultureAdapter'));
  // 2026-09-06：三违统计「扣分」列（Excel月度考核对齐）接入自动评分
  registerAdapter('sanwei_excel', require('./adapters/sanweiExcelAdapter'));
  // 2026-09-05：事故否决项（交通/生产安全责任，一票否决100分）接入自动评分
  registerAdapter('accident_veto', require('./adapters/accidentVetoAdapter'));
  _initialized = true;
}

/**
 * 观测写入守卫（提示词-14 修复）：判断当前时刻 now 是否处于周期窗口 [start_time, end_time] 内。
 * 仅当 now 落在区间内才允许刷新规则行的 last_run_* 三数，避免「宽限期补跑上月周期」时
 * 把当月观测覆写成上月数字（规则库页误读为"新月份已大量扣分"）。
 *   - 窗口内每日运行（now ∈ [start, end]）→ 写观测（现状不变）
 *   - 宽限期（now > end_time，调度 3 天窗口仍选中上月）→ 不写观测（扣分/撤销/钳制/锁定照常）
 *   - dryRun → 上层已拦截，本函数不参与
 *   - 人工重跑历史周期 → start/end 均过去 → 不写观测（观测语义=进行中周期最近一次运行）
 *   - 月末 end_time 当秒（now === end_time）→ 写
 * @param {object} cycle 周期行，含 start_time/end_time（Date 或可被 new Date 解析）
 * @param {Date} now 当前时刻
 * @returns {boolean}
 */
function shouldWriteObservability(cycle, now) {
  if (!cycle || !cycle.start_time || !cycle.end_time) return false;
  const start = cycle.start_time instanceof Date ? cycle.start_time : new Date(cycle.start_time);
  const end = cycle.end_time instanceof Date ? cycle.end_time : new Date(cycle.end_time);
  return now >= start && now <= end;
}

/**
 * 解析「适配器 + 规则」配对
 */
async function resolveTasks(adapterKeys) {
  ensureAdaptersRegistered();
  const keys = adapterKeys && adapterKeys.length ? adapterKeys : listActiveAdapterKeys();
  const tasks = [];
  for (const key of keys) {
    const adapter = getAdapter(key);
    if (!adapter) continue;
    let rule = await getRuleByAdapterKey(key);
    if (!rule && adapter.ruleCode) rule = await getRuleByCode(adapter.ruleCode);
    if (!rule) continue;
    tasks.push({ key, adapter, rule });
  }
  return tasks;
}

/**
 * 执行指定周期的全部（或指定）自动扣分适配器
 *
 * @param {number} cycleId 考核周期 id
 * @param {object} [opts]
 * @param {string[]} [opts.adapterKeys] 限定适配器；缺省为全部已注册
 * @param {boolean} [opts.dryRun] 只算不写库
 * @returns {Promise<object>}
 *   { ok, cycleId, dryRun, scanned, assessed, affected, details, skipped,
 *     adapters: [{ key, ok, reason, scanned, assessed, affected, deducted }] }
 */
async function runCycleAdapters(cycleId, { adapterKeys, dryRun = false } = {}) {
  if (!isConnected()) return { ok: false, reason: 'memory-mode', adapters: [] };

  // 1) 周期加载与状态守卫
  const cycR = await pool.query(
    `SELECT * FROM hse_assessment_cycle WHERE id = $1 AND is_deleted = FALSE`,
    [cycleId]
  );
  if (!cycR.rows.length) return { ok: false, reason: 'cycle-not-found', cycleId, dryRun, scanned: 0, assessed: 0, affected: 0, details: [], skipped: [], adapters: [] };
  const cycle = cycR.rows[0];
  if (cycle.status === 'frozen' || cycle.status === 'not_started') {
    return { ok: false, reason: `cycle-status-${cycle.status}`, cycleId, dryRun, scanned: 0, assessed: 0, affected: 0, details: [], skipped: [], adapters: [] };
  }

  // 2) 年月（优先 assessment_year/assessment_month，回退 start_time）
  const year = cycle.assessment_year ?? new Date(cycle.start_time).getFullYear();
  const month = cycle.assessment_month ?? new Date(cycle.start_time).getMonth() + 1;

  // 3) 适配器 + 规则
  const tasks = await resolveTasks(adapterKeys);
  if (!tasks.length) return { ok: false, reason: 'no-adapter', cycleId, dryRun, scanned: 0, assessed: 0, affected: 0, details: [], skipped: [], adapters: [] };

  // 3.5) 预载考核对象岗位 → 类别上限岗位套（管理员=admin，其余=manager）。
  //      类别扣分上限按岗位分设两套（hse_assessment_category_limit.target_role），
  //      同一类别在经理/管理员各自的上限下分别钳制。
  let targetRoleMap = new Map();
  try {
    const posR = await pool.query(
      `SELECT id, position FROM hse_assessment_target WHERE cycle_id = $1 AND is_deleted = FALSE`,
      [cycleId]
    );
    for (const row of posR.rows) targetRoleMap.set(Number(row.id), roleFromPosition(row.position));
  } catch (e) {
    // 岗位表读取失败不阻断：退回全 manager（历史语义）
    console.warn('[rule-engine] 预载考核对象岗位失败，类别上限按 manager 套处理:', e.message);
    targetRoleMap = new Map();
  }

  const details = [];
  const skipped = [];
  const changedTargets = new Set();
  const adapters = [];      // 每适配器结果明细
  let scanned = 0;
  let assessed = 0;
  let affected = 0;

  for (const { key, adapter, rule } of tasks) {
    // 4) 扫描（适配器内部保留「当月无台账 → noLedger」守卫）
    const res = await adapter.scan({ cycle, year, month, rule, dryRun });

    // noLedger 改为「按适配器跳过」：该适配器记失败明细并继续后续适配器，不再整轮中止
    if (res.noLedger) {
      adapters.push({ key, ok: false, reason: 'no-ledger-data', scanned: 0, assessed: 0, affected: 0, deducted: 0 });
      continue;
    }

    scanned += res.scanned || 0;
    assessed += res.assessed != null ? res.assessed : 0;
    skipped.push(...(res.skipped || []));

    const writer = createDeductionWriter({
      sourceTable: adapter.sourceTable,
      kind: adapter.kind,
      deductKeyFn: adapter.buildDeductKey,
      idempotency: adapter.idempotency || 'monthly',
    });

    // 按扫描顺序合并「扣分意图」与「撤销意图」，保持与迁移前一致的处理次序
    const items = [
      ...(res.intents || []).map((x) => ({ ...x, _type: 'intent' })),
      ...(res.revocations || []).map((x) => ({ ...x, _type: 'revoke' })),
    ].sort((a, b) => (a._seq || 0) - (b._seq || 0));

    let adapterAffected = 0;
    let adapterDeducted = 0;

    for (const item of items) {
      // 5a) 缺次归零：撤销已有扣分（事件模式按 source_id 定位）
      if (item._type === 'revoke') {
        const action = await writer.revoke(
          { cycleId, targetId: item.targetId, employeeId: item.employeeId, sourceId: item.sourceId },
          { dryRun }
        );
        if (action === 'removed') {
          adapterAffected++;
          changedTargets.add(item.targetId);
        }
        details.push(adapter.buildReportDetail(item, { type: 'revoke', action }));
        continue;
      }

      // 5b) 类别上限钳制（仅自动扣分通路）
      //     先按幂等键定位当前行，按「行」排除（excludeId）而非按「kind」排除，
      //     使同一 kind 的多次扣分（如一人多次三违）也能正确累加到类别上限（三违管理 15 分）。
      const existing = await writer.findExisting(cycleId, item.targetId, item.employeeId, item.sourceId);
      const capRes = await applyCap({
        cycleId,
        targetId: item.targetId,
        category: rule.category,
        excludeId: existing ? existing.id : null,
        rawScore: item.rawScore,
        role: targetRoleMap.get(Number(item.targetId)) || 'manager',
      });

      // 5c) 被钳制为 0：撤销已有扣分
      if (capRes.cappedScore <= 0) {
        const revAction = await writer.revoke(
          { cycleId, targetId: item.targetId, employeeId: item.employeeId, sourceId: item.sourceId },
          { dryRun }
        );
        if (revAction === 'removed') {
          adapterAffected++;
          changedTargets.add(item.targetId);
        }
        const action = revAction === 'removed' ? 'removed' : revAction === 'locked' ? 'locked' : 'capped-out';
        details.push(adapter.buildReportDetail(item, { type: 'capped-out', action }));
        continue;
      }

      // 5d) 幂等落库（事件模式写入真实 source_id）
      const action = await writer.upsert(
        {
          cycleId,
          targetId: item.targetId,
          employeeId: item.employeeId,
          metricId: res.metric ? res.metric.id : null,
          metricCode: res.metric ? res.metric.code : null,
          score: capRes.cappedScore,
          item: adapter.buildItem(item, rule),
          detail: adapter.buildDetail(item, capRes),
          sourceId: item.sourceId,
        },
        { dryRun }
      );
      if (CHANGED_ACTIONS.has(action)) {
        adapterAffected++;
        changedTargets.add(item.targetId);
      }
      if (capRes.cappedScore > 0 && EFFECTIVE_ACTIONS.has(action)) adapterDeducted++;
      details.push(adapter.buildReportDetail(item, { type: 'deduct', action, cappedScore: capRes.cappedScore }));
    }

    // 7) 可观测落库（dryRun 不写；宽限期补跑上月不覆写当月观测，见 shouldWriteObservability）
    if (!dryRun && shouldWriteObservability(cycle, new Date())) {
      await recordRuleRun({
        ruleId: rule.ruleId,
        cycleId,
        scanned: res.scanned || 0,
        assessed: res.assessed != null ? res.assessed : (res.intents || []).length + (res.revocations || []).length,
        deducted: adapterDeducted,
        // 计量单位：事件级适配器（violation_record）按条/人次，其余默认按月度聚合按人
        deductedUnit: adapter.deductedUnit || 'people',
      });
    }

    adapters.push({
      key,
      ok: true,
      reason: null,
      scanned: res.scanned || 0,
      assessed: res.assessed != null ? res.assessed : (res.intents || []).length + (res.revocations || []).length,
      affected: adapterAffected,
      deducted: adapterDeducted,
    });
    affected += adapterAffected;
  }

  // 6) 对发生增/改/删的对象刷新分数（单个失败不阻断）
  if (!dryRun) {
    for (const tid of changedTargets) {
      try {
        await engine.recalculateTarget(cycleId, tid);
      } catch (e) {
        console.warn(`[rule-engine] 对象${tid} 重算失败:`, e.message);
      }
    }
  }

  return { ok: true, cycleId, dryRun, scanned, assessed, affected, details, skipped, adapters };
}

/**
 * 统一门面：执行全部自动扣分适配器（网格未巡查 + 三违自身行为）
 *
 * 供 server/services/gridUncheckedDeductionService.syncGridUncheckedDeductions 转调，
 * 4 个调用点（import / monthly-scoring ×2 / scheduler）零改动复用其导出名与返回字段。
 *
 * @param {number} cycleId
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<object>} 同 runCycleAdapters 返回形状（含 adapters 明细）
 */
async function runCycleAutoDeductions(cycleId, { dryRun = false } = {}) {
  return runCycleAdapters(cycleId, { adapterKeys: [...AUTO_DEDUCTION_ADAPTERS], dryRun });
}

module.exports = {
  runCycleAdapters,
  runCycleAutoDeductions,
  shouldWriteObservability,
  resolveTasks,
  ensureAdaptersRegistered,
};
