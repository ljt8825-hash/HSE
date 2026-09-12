/**
 * 月度台账自动导入 —— 定时任务调度器
 *
 * 调度策略：
 *   每月1日 01:30  自动导入「上月」《乡镇作业中心经理月度考核》Excel 台账：
 *     - 安全文化建设（hse_safety_culture_monthly）
 *     - 三违分析（hse_sanwei_score_monthly）
 *
 * 对齐现有 assessmentScheduler.js 范式：ENABLED 开关 + init/stop + 手动 trigger。
 * 仅写台账表、不改 score_total（符合项目「干跑台账」纪律）；按同月重跑幂等（内部先软删旧月再 upsert）。
 */

const cron = require('node-cron');
const { isConnected, pool } = require('../config/db');
const safetyCultureImport = require('./safetyCultureImport');
const sanweiImport = require('./sanweiAnalysisImport');

// ============================================================
// 配置
// ============================================================

// 调度总开关：与现有调度器同开关；显式设置 SCHEDULER_ENABLED='false' 才停用。
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false';

// 每月1日 01:30（与 00:30 考核周期创建错开 1 小时，避免月初争用连接池/扫描）
const CRON_MONTHLY_LEDGER = process.env.MONTHLY_LEDGER_CRON || '30 1 1 * *';
const CRON_TZ = 'Asia/Shanghai';

/**
 * 计算「上月」YYYY-MM 字符串（纯函数，便于单测）。
 * 与 assessmentScheduler.getScheduledTargetMonths 口径一致：当月1号减1天 → 上月最后一天（Date 自动借位跨年）。
 * @param {Date} [now]
 * @returns {string} 如 '2026-08'
 */
function getPreviousMonthStr(now = new Date()) {
  const prevDate = new Date(now.getFullYear(), now.getMonth(), 1); // 当月1号
  prevDate.setDate(prevDate.getDate() - 1); // 减1天 → 上月最后一天
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

// 幂等重入锁：上一轮未跑完则本轮直接跳过
let running = false;

/**
 * 导入「上月」台账。两个数据源各自 try/catch，一处失败不阻断另一处；
 * 失败仅记日志，下月1号重跑同月会因「软删+upsert」幂等自愈。
 * @param {Date} [now]
 * @returns {Promise<{month:string;safetyCulture:object;sanwei:object;skipped?:boolean;reason?:string}>}
 */
async function runMonthlyLedgerImport(now = new Date()) {
  if (running) return { skipped: true, reason: 'already-running' };
  running = true;
  try {
    if (!isConnected()) {
      console.log('[monthly-ledger-import] 未连接数据库(memory-mode)，跳过月度台账导入');
      return { skipped: true, reason: 'memory-mode' };
    }
    const month = getPreviousMonthStr(now);
    console.log(`[monthly-ledger-import] 开始导入上月台账 ${month}`);
    const results = { month };
    try {
      const r = await safetyCultureImport.runImport(month);
      results.safetyCulture = { imported: r.imported, unmatched: r.unmatched };
      console.log(`[monthly-ledger-import] 安全文化建设 ${month}: imported=${r.imported} unmatched=${r.unmatched}`);
    } catch (e) {
      results.safetyCulture = { error: e.message };
      console.error(`[monthly-ledger-import] 安全文化建设导入失败 ${month}:`, e.message);
    }
    try {
      const r = await sanweiImport.runImport(month);
      results.sanwei = { imported: r.imported, unmatched: r.unmatched };
      console.log(`[monthly-ledger-import] 三违分析 ${month}: imported=${r.imported} unmatched=${r.unmatched}`);
    } catch (e) {
      results.sanwei = { error: e.message };
      console.error(`[monthly-ledger-import] 三违分析导入失败 ${month}:`, e.message);
    }
    console.log(`[monthly-ledger-import] 完成：上月 ${month} 台账导入（单项失败不影响另一项）`);
    return results;
  } finally {
    running = false;
  }
}

/**
 * 手动补跑入口（对齐 wpsGridSyncScheduler 风格），便于验证 / 临时补跑某月。
 * @param {Date} [now]
 */
async function triggerMonthlyLedgerImport(now = new Date()) {
  return runMonthlyLedgerImport(now);
}

// ============================================================
// 调度注册
// ============================================================

let task = null;

function initMonthlyLedgerImportScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log('[monthly-ledger-import] 定时调度已配置但未启用 (SCHEDULER_ENABLED=false)');
    return;
  }
  task = cron.schedule(
    CRON_MONTHLY_LEDGER,
    async () => {
      console.log(`[monthly-ledger-import] 触发：每月台账导入 (${CRON_MONTHLY_LEDGER})`);
      try {
        await runMonthlyLedgerImport(new Date());
      } catch (e) {
        console.error('[monthly-ledger-import] 月度台账导入异常:', e.message);
      }
    },
    { scheduled: true, timezone: CRON_TZ }
  );
  console.log(`[monthly-ledger-import] ✅ 定时调度已启用: ${CRON_MONTHLY_LEDGER} (${CRON_TZ})`);
}

function stopMonthlyLedgerImportScheduler() {
  if (task) {
    try { task.stop(); } catch (e) { /* ignore */ }
    task = null;
  }
  console.log('[monthly-ledger-import] 定时调度已停止');
}

module.exports = {
  SCHEDULER_ENABLED,
  CRON_MONTHLY_LEDGER,
  CRON_TZ,
  getPreviousMonthStr,
  runMonthlyLedgerImport,
  triggerMonthlyLedgerImport,
  initMonthlyLedgerImportScheduler,
  stopMonthlyLedgerImportScheduler,
};