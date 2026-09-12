/**
 * 迁移：transfer_station_check 补列（2026-09-04 拍板，按用户 5 子项）
 *   - 补：ledger_management 台账管理 / electricity_safety 用电安全 / item_placement 物品摆放
 *   - 标识牌(sign_*)、消防(fire_*) 已有，直接复用
 * 说明：台账当前以 check_date 记日期；评分按月取 check_date 所在月（month 非独立列，无需新增）。
 * 执行：node migrate-transfer-5subitems.js
 */
require('dotenv').config({ path: 'g:/hse-dashboard/server/.env' });
const { pool } = require('g:/hse-dashboard/server/config/db');
(async () => {
  for (const col of ['ledger_management', 'electricity_safety', 'item_placement']) {
    await pool.query(
      `ALTER TABLE transfer_station_check ADD COLUMN IF NOT EXISTS ${col} INT NOT NULL DEFAULT 0`
    );
  }
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'transfer_station_check'`
  );
  const cols = r.rows.map((x) => x.column_name);
  console.log('补列完成：', ['ledger_management', 'electricity_safety', 'item_placement'].map((c) => `${c}=${cols.includes(c) ? '有' : '缺'}`).join(', '));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });