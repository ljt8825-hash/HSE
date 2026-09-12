/**
 * Phase 0 —— 花名册历史重放飞前备份（只读导出，不改业务数据）
 * 把 employee / employee_assignment / employee_import_batch / employee_import_pending
 * 全量复制为备份表，供后续回滚使用。
 * 用法: node replay-phase0-backup.cjs [--force]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
const SUFFIX = `_bak_replay_${STAMP}`;
const TARGETS = ['employee', 'employee_assignment', 'employee_import_batch', 'employee_import_pending'];
const STATE_FILE = path.join(__dirname, '.roster_replay_state.json');

(async () => {
  // 幂等保护：已存在同后缀备份表则中止，除非 --force
  if (!process.argv.includes('--force')) {
    for (const t of TARGETS) {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [t + SUFFIX]
      );
      if (r.rows.length) {
        console.error(`备份表 ${t + SUFFIX} 已存在（可能已备份过）。如需覆盖请加 --force。`);
        process.exit(1);
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = { stamp: STAMP, suffix: SUFFIX, tables: {} };
    for (const t of TARGETS) {
      const bak = t + SUFFIX;
      // 覆盖时先删旧备份表
      await client.query(`DROP TABLE IF EXISTS ${bak}`);
      await client.query(`CREATE TABLE ${bak} AS SELECT * FROM ${t}`); // 含软删/全量
      const c = await client.query(`SELECT COUNT(*) c FROM ${bak}`);
      report.tables[t] = { backupTable: bak, rows: parseInt(c.rows[0].c, 10) };
      console.log(`[Phase0] ${t} -> ${bak}: ${c.rows[0].c} 行`);
    }
    await client.query('COMMIT');

    fs.writeFileSync(STATE_FILE, JSON.stringify(report, null, 2));
    console.log(`\n[Phase0] 完成。状态写至 ${STATE_FILE}`);
    console.log('后续重放/回滚以 suffix =', SUFFIX, '为准。');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[Phase0] 失败，已回滚:', e.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
})();