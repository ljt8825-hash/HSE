/**
 * 迁移：安全文化建设台账 —— 动态活动项支持
 *
 * 背景：每个月的「专项活动台帐」表头/活动项都不同（2025 为年度专项行动，
 *      2026 各月为三违/轮值/交通安全/电动三轮车/垃圾桶点位/消防月/每日报送/安全生产月…），
 *      旧的固定三列(act_three_violation/act_duty_safety/act_traffic_risk)无法表达。
 * 变更：
 *  1) 新增列 activities JSONB（{ "活动名": 0|1 }，1=√已开展），存当月全部活动项
 *  2) 对已有行，按旧三列回填 activities（旧行即三列齐全的标准月，如 2026-07）
 * 说明：旧三列保留不删（兼容/兜底），但新导入与适配器以 activities 为准。
 * 幂等：IF NOT EXISTS AFTER ADD，可重复执行
 * 执行：node migrate-safety-culture-dynamic-activities.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');

(async () => {
  // 1) 新增 activities 列（幂等）
  await pool.query(`
    ALTER TABLE hse_safety_culture_monthly
      ADD COLUMN IF NOT EXISTS activities JSONB NOT NULL DEFAULT '{}'::jsonb`);

  // 2) 回填旧三列 → activities（仅处理 activities 为空且旧三列有内容的行）
  await pool.query(`
    UPDATE hse_safety_culture_monthly
       SET activities =
         ('{"三违专项活动":' || act_three_violation ||
          ',"轮值安全员":' || act_duty_safety ||
          ',"交通安全危险因素识别清单":' || act_traffic_risk || '}')::jsonb
     WHERE is_deleted = FALSE
       AND activities = '{}'::jsonb
       AND (act_three_violation + act_duty_safety + act_traffic_risk) > 0`);

  console.log('安全文化建设台账 activities 列就绪并完成回填');
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });