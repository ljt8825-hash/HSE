/**
 * P3-04-00.3 / W14：封闭数据库层隐患状态默认值写入口
 *
 * 目标：ALTER TABLE public.hazards ALTER COLUMN status SET DEFAULT 'discovered'
 *
 * 硬性护栏（任一不满足即 exit(1)，绝不下发 DDL）：
 *  1. 进程启动即硬设 DB_NAME=safety_dashboard_dev（在 require config/db 之前）；
 *  2. 断言 current_database() 必须是 safety_dashboard_dev；
 *  3. 断言全库只有 public.hazards 一张同名表（防止误改其它 schema）；
 *  4. 断言当前 default 必须是 '未完成'（已是 'discovered' 则幂等跳过）；
 *  5. 不触碰任何既有行：仅改列默认值，不 UPDATE / 不 DELETE。
 *
 * 运行：cd server && node scripts/p3-04-00.3-w14-default.ddl.js
 */
'use strict';

// ① 必须在 require config/db 之前硬设，防止 .env 把 DB_NAME 带回生产库
process.env.DB_NAME = 'safety_dashboard_dev';

const TARGET_DB = 'safety_dashboard_dev';
const EXPECTED_OLD_DEFAULT = "'未完成'::character varying";
const TARGET_DEFAULT_VALUE = 'discovered';

const { pool } = require('../config/db');

function fail(msg) {
  console.error(`\n[BLOCKED] ${msg}`);
  console.error('[BLOCKED] 未执行任何 DDL。');
  process.exit(1);
}

(async () => {
  // ② 库名断言
  const db = (await pool.query('SELECT current_database() AS d')).rows[0].d;
  if (db !== TARGET_DB) fail(`当前库为 "${db}"，不是 ${TARGET_DB}`);

  // ③ 同名表唯一性断言
  const sameName = (await pool.query(
    `SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'hazards' ORDER BY 1`
  )).rows;
  if (sameName.length !== 1 || sameName[0].table_schema !== 'public') {
    fail(`全库同名 hazards 表不唯一或不在 public：${JSON.stringify(sameName)}`);
  }

  // ④ 当前默认值断言
  const before = (await pool.query(
    `SELECT column_name, data_type, column_default, is_nullable, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hazards' AND column_name = 'status'`
  )).rows[0];
  if (!before) fail('public.hazards.status 列不存在');

  console.log('[BEFORE]', JSON.stringify(before));

  if (before.column_default === `'${TARGET_DEFAULT_VALUE}'::character varying`) {
    console.log(`[SKIP] 默认值已是 ${TARGET_DEFAULT_VALUE}，幂等跳过 DDL。`);
    await pool.end();
    return;
  }
  if (before.column_default !== EXPECTED_OLD_DEFAULT) {
    fail(`当前 default 为 "${before.column_default}"，与预期 "${EXPECTED_OLD_DEFAULT}" 不符，拒绝盲改`);
  }

  // 迁移前数据指纹（证明后续只改 schema，不改数据）
  const fpBefore = (await pool.query(
    `SELECT COALESCE(status,'<NULL>') AS s, COUNT(*)::int AS c
       FROM hazards WHERE is_deleted = false GROUP BY 1 ORDER BY 2 DESC`
  )).rows;
  const rowsBefore = (await pool.query('SELECT COUNT(*)::int AS c FROM hazards')).rows[0].c;
  console.log('[BEFORE] dist =', JSON.stringify(fpBefore), '| rows =', rowsBefore);

  // ⑤ 执行 DDL（仅列默认值，不涉及任何既有行）
  await pool.query(
    `ALTER TABLE public.hazards ALTER COLUMN status SET DEFAULT '${TARGET_DEFAULT_VALUE}'`
  );

  const after = (await pool.query(
    `SELECT column_name, data_type, column_default, is_nullable, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hazards' AND column_name = 'status'`
  )).rows[0];
  console.log('[AFTER ]', JSON.stringify(after));

  const fpAfter = (await pool.query(
    `SELECT COALESCE(status,'<NULL>') AS s, COUNT(*)::int AS c
       FROM hazards WHERE is_deleted = false GROUP BY 1 ORDER BY 2 DESC`
  )).rows;
  const rowsAfter = (await pool.query('SELECT COUNT(*)::int AS c FROM hazards')).rows[0].c;
  console.log('[AFTER ] dist =', JSON.stringify(fpAfter), '| rows =', rowsAfter);

  const okDefault = after.column_default === `'${TARGET_DEFAULT_VALUE}'::character varying`;
  const okData = JSON.stringify(fpBefore) === JSON.stringify(fpAfter) && rowsBefore === rowsAfter;

  console.log('\nDDL_DEFAULT_OK =', okDefault);
  console.log('DATA_UNCHANGED =', okData);

  await pool.end();
  if (!okDefault || !okData) {
    console.error('[FAIL] DDL 结果不符合预期或数据被改动');
    process.exit(1);
  }
  console.log('[PASS] W14 已封闭：hazards.status DEFAULT = discovered');
})().catch(async (e) => {
  console.error('[ERROR]', e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
