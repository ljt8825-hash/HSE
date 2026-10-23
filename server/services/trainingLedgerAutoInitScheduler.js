/**
 * 月度培训台账自动生成 —— 定时任务调度器
 *
 * 需求：每月初自动生成月度培训记录，默认标记为「都完成」。
 * 口径（2026-09-26 冻结）：
 *   - 培训人名单：沿用现有培训记录（training_records）中出现过的 trainer_id 去重。
 *   - 默认值：应培训=实际=缺少=资料不完整=0（列表显示为全部完成状态）。
 *   - 写入表：hse_training_ledger_monthly（source='auto-init'），与人工 Excel 导入同表。
 *   - 幂等：同 trainer+month 已有记录（手工导入或本次生成）则跳过，不覆盖已有数据。
 *
 * 对齐现有 assessmentScheduler / monthlyLedgerImportScheduler 范式：
 * ENABLED 开关 + init/stop + 手动 trigger；仅写台账表，不改 score_total。
 */

const cron = require('node-cron');
const { isConnected, pool } = require('../config/db');

// ============================================================
// 配置
// ============================================================

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false';

// 每月1日 03:20（与 00:30 考核周期 / 01:00 网格 / 01:30 台账导入 / 02:00 每日校验错开）
const CRON_AUTO_LEDGER = process.env.TRAINING_LEDGER_AUTO_CRON || '20 3 1 * *';
const CRON_TZ = 'Asia/Shanghai';

/**
 * 计算「上月」YYYY-MM 字符串（纯函数）。
 * 口径与 monthlyLedgerImportScheduler.getPreviousMonthStr / assessmentScheduler 一致：
 * 当月1号减1天 → 上月最后一天（Date 自动借位跨年）。
 * @param {Date} [now]
 * @returns {string} 如 '2026-08'
 */
function getPreviousMonthStr(now = new Date()) {
  const prevDate = new Date(now.getFullYear(), now.getMonth(), 1);
  prevDate.setDate(prevDate.getDate() - 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

// 幂等重入锁
let running = false;

/**
 * 自动生成「上月」月度培训台账（培训人依次，默认都完成）。
 * @param {Date} [now]
 * @returns {Promise<{month:string;inserted:number;skipped:number;trainerCount:number;skippedRun?:boolean;reason?:string}>}
 */
async function runAutoInit(now = new Date()) {
  if (running) return { skippedRun: true, reason: 'already-running' };
  running = true;
  try {
    if (!isConnected()) {
      console.log('[training-ledger-auto] 未连接数据库(memory-mode)，跳过培训台账自动生成');
      return { skippedRun: true, reason: 'memory-mode' };
    }
    const month = getPreviousMonthStr(now);
    console.log(`[training-ledger-auto] 开始自动生成上月培训台账 ${month}`);

    // 培训人名单：沿用现有月度台账（hse_training_ledger_monthly）历史培训人去重
    // （training_records 表仅遗留演示数据且 trainer_id 为空，不作为名单来源；
    //   业务「培训记录」页面读的正是 hse_training_ledger_monthly，名单以其已有培训人为准）
    const listRes = await pool.query(
      `SELECT DISTINCT trainer_id, MIN(trainer_name) AS trainer_name
         FROM hse_training_ledger_monthly
        WHERE trainer_id IS NOT NULL
        GROUP BY trainer_id
        ORDER BY trainer_id`,
    );
    const trainers = listRes.rows;
    if (trainers.length === 0) {
      console.log(`[training-ledger-auto] ${month} 无可用培训人名单（台账无 trainer_id），跳过`);
      return { month, inserted: 0, skipped: 0, trainerCount: 0 };
    }

    const errors = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const t of trainers) {
        try {
          await client.query(
            `INSERT INTO hse_training_ledger_monthly
               (trainer_id, trainer_name, month, expected_count, actual_count, missing_count, incomplete_count, source)
             VALUES ($1, $2, $3, 0, 0, 0, 0, 'auto-init')
             ON CONFLICT (trainer_id, month) DO NOTHING`,
            [t.trainer_id, t.trainer_name, month],
          );
        } catch (e) {
          errors.push(`${t.trainer_id}:${e.message}`);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // 统计本次实际插入行数（已存在 = skipped）
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM hse_training_ledger_monthly
        WHERE month = $1
          AND (source = 'auto-init'
               OR expected_count = 0 AND actual_count = 0 AND missing_count = 0 AND incomplete_count = 0)
          AND trainer_id IS NOT NULL`,
      [month],
    );
    const trainerCount = trainers.length;
    const existing = (
      await pool.query(
        `SELECT COUNT(DISTINCT trainer_id)::int AS c FROM hse_training_ledger_monthly
          WHERE month = $1 AND trainer_id = ANY($2::int[])`,
        [month, trainers.map((t) => t.trainer_id)],
      )
    ).rows[0]?.c ?? 0;

    const result = {
      month,
      trainerCount,
      // 实际插入 = 名单数与「该月已存在 auto/零值 行数」之差（ON CONFLICT 忽略未返回行数）
      inserted: trainerCount - existing > 0 ? trainerCount - existing : 0,
      skipped: existing,
      errors,
    };
    console.log(`[training-ledger-auto] 完成 ${month}: trainerCount=${trainerCount} existing=${existing} errors=${errors.length}`);
    return result;
  } finally {
    running = false;
  }
}

/**
 * 手动补跑入口（对齐 wpsGridSyncScheduler 风格），便于验证 / 临时补跑某月。
 * @param {Date} [now] 默认当前时间（生成上月）；传特定日期即生成其对应上月。
 */
async function triggerAutoInit(now = new Date()) {
  return runAutoInit(now);
}

// ============================================================
// 调度注册
// ============================================================

let task = null;

function initTrainingLedgerAutoInitScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log('[training-ledger-auto] 定时调度已配置但未启用 (SCHEDULER_ENABLED=false)');
    return;
  }
  task = cron.schedule(
    CRON_AUTO_LEDGER,
    async () => {
      console.log(`[training-ledger-auto] 触发：月度培训台账自动生成 (${CRON_AUTO_LEDGER})`);
      try {
        await runAutoInit(new Date());
      } catch (e) {
        console.error('[training-ledger-auto] 培训台账自动生成异常:', e.message);
      }
    },
    { scheduled: true, timezone: CRON_TZ },
  );
  console.log(`[training-ledger-auto] ✅ 定时调度已启用: ${CRON_AUTO_LEDGER} (${CRON_TZ})`);
}

function stopTrainingLedgerAutoInitScheduler() {
  if (task) {
    try { task.stop(); } catch (e) { /* ignore */ }
    task = null;
  }
  console.log('[training-ledger-auto] 定时调度已停止');
}

module.exports = {
  SCHEDULER_ENABLED,
  CRON_AUTO_LEDGER,
  CRON_TZ,
  getPreviousMonthStr,
  runAutoInit,
  triggerAutoInit,
  initTrainingLedgerAutoInitScheduler,
  stopTrainingLedgerAutoInitScheduler,
};