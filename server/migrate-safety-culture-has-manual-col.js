/**
 * 迁移：安全文化建设台账 —— 记录是否存在「扣分」列
 * 背景：按「以表格扣分完成当月打分」口径，需区分「该表有扣分列(即便为0，以扣分列为准)」
 *      与「该表无扣分列(回退按未开展项×unit)」。
 * 幂等：ADD COLUMN IF NOT EXISTS，可重复执行
 * 执行：node migrate-safety-culture-has-manual-col.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');

(async () => {
  await pool.query(`
    ALTER TABLE hse_safety_culture_monthly
      ADD COLUMN IF NOT EXISTS has_manual_col BOOLEAN NOT NULL DEFAULT FALSE`);
  // 回填：旧数据（迁移前导入）无法确知扣分列是否存在，统一按「有扣分列」处理更符合新口径？——
  // 为稳妥，旧数据 default FALSE 即按无扣分列→未开展项计分；新导入会显式写 TRUE/FALSE。
  console.log('hse_safety_culture_monthly.has_manual_col 列就绪');
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });