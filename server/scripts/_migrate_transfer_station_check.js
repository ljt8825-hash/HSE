/**
 * 迁移 transfer_station_check：
 *  - check_date: date -> varchar(7) 存储 'YYYY-MM'（月度考核口径）
 *  - 新增 5 个数值计数考核列（台账管理/标识牌管理/用电安全/消防管理/物品摆放）
 * 旧列（patrol_person / check_result / sign 系列 / fire 系列）保留不删，仅从前端与配置中隐藏。
 */
const { pool } = require('../config/db');

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) check_date -> YYYY-MM 文本
    await client.query(
      "ALTER TABLE transfer_station_check ALTER COLUMN check_date TYPE varchar(7) USING to_char(check_date, 'YYYY-MM')",
    );

    // 2) 新增 5 列（若已存在则忽略）
    const adds = [
      'ledger_management integer NOT NULL DEFAULT 0',
      'sign_management integer NOT NULL DEFAULT 0',
      'electricity_safety integer NOT NULL DEFAULT 0',
      'fire_management integer NOT NULL DEFAULT 0',
      'item_placement integer NOT NULL DEFAULT 0',
    ];
    for (const col of adds) {
      const name = col.split(' ')[0];
      await client.query(
        `DO $$ BEGIN
           IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transfer_station_check' AND column_name='${name}') THEN
             ALTER TABLE transfer_station_check ADD COLUMN ${col};
           END IF;
         END $$`,
      );
    }

    await client.query('COMMIT');
    console.log('MIGRATION OK');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('MIGRATION FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
