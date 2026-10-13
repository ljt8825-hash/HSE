#!/usr/bin/env node
'use strict';
/*
 * 指标取数配置表 · 受控执行脚本（参数化一键运行）
 * ----------------------------------------------------------------------------
 * 配套：server/sql/assessment_metric_source_config.sql
 *        server/sql/assessment_metric_source_PROD_runbook.md
 *
 * 护栏（红线第 1 条：DML/DDL 只准 safety_dashboard_dev，硬拒生产库）：
 *   - 仅允许白名单库 safety_dashboard_dev 执行 DDL。
 *   - --db 传入非白名单值（含生产库 safety_dashboard）一律 exit 拒绝。
 *   - require('../config/db') 之前硬设 process.env.DB_NAME，覆盖 .env 默认生产库。
 *   - 连接建立后断言 current_database() === 目标库，二次保险。
 *
 * 生产库建表：本脚本拒绝执行。请按 runbook 第 2 节用 psql/PGAdmin 直连
 *             safety_dashboard 执行 assessment_metric_source_config.sql。
 *
 * 用法：
 *   node scripts/run_metric_source_ddl.cjs                       # 默认 dev：snapshot→apply→verify
 *   node scripts/run_metric_source_ddl.cjs --action=snapshot
 *   node scripts/run_metric_source_ddl.cjs --action=apply [--no-seed]
 *   node scripts/run_metric_source_ddl.cjs --action=verify
 *   node scripts/run_metric_source_ddl.cjs --action=rollback     # 危险：删除配置表
 *   node scripts/run_metric_source_ddl.cjs --db=safety_dashboard # 拒绝并 exit 2
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_DBS = ['safety_dashboard_dev'];
const SQL_FILE = path.join(__dirname, '..', 'sql', 'assessment_metric_source_config.sql');

function parseArgs() {
  const opts = { action: 'all', db: 'safety_dashboard_dev', seed: true, help: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--action=')) opts.action = a.split('=')[1];
    else if (a.startsWith('--db=')) opts.db = a.split('=')[1];
    else if (a === '--no-seed') opts.seed = false;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function usage() {
  console.log(`用法:
  node scripts/run_metric_source_ddl.cjs [--action=all|snapshot|apply|verify|rollback] [--db=safety_dashboard_dev] [--no-seed]
  --action  all(默认)=snapshot+apply+verify | snapshot | apply | verify | rollback
  --db      仅允许: ${ALLOWED_DBS.join(', ')}（生产库会被拒绝）
  --no-seed apply 时跳过 seed 两段 INSERT
  --help    显示本帮助`);
}

// 行级剥离 -- 注释（不碰字符串内内容；本文件无字符串内 '--'），再按 ; 分割
function stripComments(sql) {
  return sql.replace(/--[^\n]*\n/g, '\n');
}
function splitStmts(sql) {
  return stripComments(sql).split(';').map((s) => s.trim()).filter(Boolean);
}

// ---- 内置快照 / 校验 / 回滚 SQL ----
const SNAPSHOT_SQL = `
SELECT current_database() AS db;
SELECT to_regclass('public.hse_assessment_metric_source') AS tbl_exists;
SELECT metric_code FROM hse_assessment_metric
WHERE metric_code IN ('HSE-KPI-TRN-002','HSE-KPI-NEG-001','HSE-KPI-NEG-002','HSE-KPI-NEG-003')
  AND is_deleted = FALSE ORDER BY metric_code;
SELECT to_regclass('public.training_records'), to_regclass('public.accidents');
SELECT count(*) AS target_count FROM hse_assessment_target WHERE is_deleted = FALSE;
`;

const VERIFY_SQL = `
SELECT to_regclass('public.hse_assessment_metric_source') AS tbl_exists;
SELECT indexname FROM pg_indexes WHERE tablename = 'hse_assessment_metric_source';
SELECT source_name, source_table, agg_type, fixed_score, is_veto, enabled
FROM hse_assessment_metric_source WHERE is_deleted = FALSE ORDER BY sort_order;
SELECT source_name, veto_metric_map FROM hse_assessment_metric_source WHERE source_name = 'accident';
`;

async function runMulti(pool, sql, label) {
  console.log(`\n--- ${label} ---`);
  const stmts = splitStmts(sql);
  for (const st of stmts) {
    const r = await pool.query(st);
    if (r.rows && r.rows.length) {
      for (const row of r.rows) console.log('  ', JSON.stringify(row));
    } else if (r.rowCount !== null && r.rowCount !== undefined) {
      console.log(`  [DDL] rowCount=${r.rowCount}`);
    }
  }
}

async function applySql(pool) {
  console.log('\n--- apply (执行 assessment_metric_source_config.sql) ---');
  let sql = fs.readFileSync(SQL_FILE, 'utf8');
  if (!global.__SEED__) {
    // 移除两段 seed INSERT（含 WHERE NOT EXISTS 块），只跑建表 + 索引
    sql = sql.replace(/INSERT INTO hse_assessment_metric_source[\s\S]*?WHERE NOT EXISTS \([\s\S]*?\);\n?/g, '');
    console.log('  [--no-seed] 已跳过两段 seed INSERT');
  }
  const stmts = splitStmts(sql);
  for (const st of stmts) {
    await pool.query(st);
    console.log('  ✓', st.replace(/\s+/g, ' ').slice(0, 70));
  }
}

async function rollback(pool) {
  console.log('\n--- rollback (危险：删除配置表，引擎将回退 legacy) ---');
  console.log('  ⚠ 警告：DROP TABLE 后已生成的 backfill 扣分明细不会被自动删除，需另删。');
  await pool.query('DROP TABLE IF EXISTS hse_assessment_metric_source CASCADE;');
  console.log('  ✓ DROP TABLE IF EXISTS hse_assessment_metric_source CASCADE 已执行');
}

async function main() {
  const opts = parseArgs();
  if (opts.help) { usage(); return; }

  // 护栏 1：白名单硬拒
  if (!ALLOWED_DBS.includes(opts.db)) {
    console.error(`[GUARDRAIL] 拒绝执行：--db=${opts.db} 不在白名单 ${ALLOWED_DBS.join(', ')} 内。`);
    console.error('[GUARDRAIL] 生产库 safety_dashboard 必须在受控环境用 psql/PGAdmin 人工直连执行（见 runbook 第 2 节）。');
    process.exit(2);
  }

  // 护栏 2：require 前硬设 DB_NAME，覆盖 .env 默认生产库
  process.env.DB_NAME = opts.db;
  global.__SEED__ = opts.seed;

  const db = require('../config/db');
  const pool = db.pool;

  // 护栏 3：断言真连目标库
  const cur = await pool.query('SELECT current_database()');
  const dbName = cur.rows[0].current_database;
  if (dbName !== opts.db) {
    console.error(`[GUARDRAIL] current_database()=${dbName} ≠ 期望 ${opts.db}，已中断。`);
    await pool.end();
    process.exit(3);
  }
  console.log(`[OK] 已连接并确认数据库: ${dbName}（动作=${opts.action}）`);

  try {
    if (opts.action === 'snapshot' || opts.action === 'all') await runMulti(pool, SNAPSHOT_SQL, 'snapshot 执行前快照');
    if (opts.action === 'apply') await applySql(pool);
    if (opts.action === 'all') await applySql(pool);
    if (opts.action === 'verify' || opts.action === 'all') await runMulti(pool, VERIFY_SQL, 'verify 执行后校验');
    if (opts.action === 'rollback') await rollback(pool);
    if (!['snapshot', 'apply', 'verify', 'rollback', 'all'].includes(opts.action)) {
      console.error(`[ERR] 未知 --action=${opts.action}`);
      usage();
      process.exit(1);
    }
    console.log('\n[完成] 未捕获异常，流程结束。');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
