/**
 * WPS → PostgreSQL 单向 Pull 调度器（WPS-PG-SYNC-02）
 *
 * 策略：每 15 分钟执行一次**单向只读拉取** WPS → PG。
 *   - 双闸 + 引擎三重条件全部满足才注册 cron：
 *       1. `SCHEDULER_ENABLED === 'true'`（WPS-PG-SYNC-05-E-0 R1 显式双闸：未设置/'false'/''/其他值
 *          一律休眠；**仅控制 Scheduler 是否自动触发**，不改变 WPS_GRID_SYNC/Pull Engine/数据源开关语义）；
 *       2. `WPS_GRID_SYNC === 'true'` 且凭证齐备、DB 已连接（svc.isEnabled() → 引擎三重条件）；
 *     其余情况一律休眠，且 runPull 首行直接返回 skipped。
 *   - 只调用 engine.pullWpsToPg()。**不得**调用任何 PG→WPS 推送、不得删除 WPS、不得回收 PG 删除。
 *   - 复查承诺：`reconcile()` 的实现已等价于 `pullWpsToPg()`（见 wpsGridSyncService.js）；
 *     调度器已直接改用 pullWpsToPg，不再走历史双向语义。
 *   - 并发保护：本模块 running 标志 + Pull Engine 进程内互斥锁，双重保证同一时刻只有一个 Pull。
 */
const cron = require('node-cron');
const svc = require('./wpsGridSyncService');

// WPS-PG-SYNC-05-E-0 R1：显式双闸（fail-closed）——仅显式 'true' 才允许 Scheduler 注册；
// 未设置/'false'/''/'0'/其他任意值一律关闭（不得使用 `!== 'false'` 这类默认开启语义）。
// 职责边界：本开关只决定「Scheduler 是否自动触发 Pull」，不是 Pull Engine 或同步总开关。
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED === 'true';
const CRON_PULL = process.env.WPS_SYNC_CRON || '*/15 * * * *'; // 默认每 15 分钟
const CRON_TZ = 'Asia/Shanghai';

let task = null;
let running = false;

/** 单次执行（单向 WPS → PG）。未启用时**休眠返回**，绝不做任何上行/下行/删除动作。 */
async function runPull() {
  if (!svc.isEnabled()) return { skipped: true, reason: 'disabled' };
  if (running) return { skipped: true, reason: 'already-running' };
  running = true;
  const t0 = Date.now();
  try {
    const r = await svc.pullWpsToPg({});
    console.log(
      `[wps-pull] 单向同步完成(${Date.now() - t0}ms WPS→PG): pulled=${r.pulled} inserted=${r.inserted} ` +
      `updated=${r.updated} unchanged=${r.skippedUnchanged} excluded=${r.skippedExcluded} ` +
      `wpsDeleted=${r.wpsDeleted} pgDeleted=${r.pgDeleted} errors=${(r.errors || []).length}`
    );
    if (r.errors && r.errors.length) console.error('[wps-pull] 错误明细(前5条):', r.errors.slice(0, 5).join(' ; '));
    return r;
  } catch (e) {
    console.error('[wps-pull] 单向同步失败:', e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

function initWpsGridSyncScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log('[wps-pull] SCHEDULER_ENABLED 未显式设为 true，调度器未启动（显式双闸，fail-closed）');
    return;
  }
  if (!svc.isEnabled()) {
    console.log('[wps-pull] WPS 凭证未配置或 WPS_GRID_SYNC 非 true，调度器休眠（改为 true 并重启后生效）');
    return;
  }
  task = cron.schedule(CRON_PULL, () => { runPull(); }, { timezone: CRON_TZ });
  console.log(`[wps-pull] 调度器已启动（单向 WPS→PG）: ${CRON_PULL} (${CRON_TZ})`);
}

function stopWpsGridSyncScheduler() {
  if (task) { task.stop(); task = null; console.log('[wps-pull] 调度器已停止'); }
}

module.exports = {
  initWpsGridSyncScheduler,
  stopWpsGridSyncScheduler,
  runPull,
  // 兼容旧调用名（语义已单向化：等价于 runPull）
  triggerReconcile: runPull,
};
