/**
 * P2-B1-E-08-04 · DEV 规则配置迁移（safety_dashboard_dev）
 *
 * 只更新 4 条规则的配置字段（transmission_config / scope_config / deduct_score），
 * 零 DDL、零历史数据改动。执行前打印原值，执行后回读校验。
 *
 * 运行：node scripts/p2b1e0804_dev_migration.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const TRANSMISSION = JSON.stringify({
  only_check_source: 'company',
  by_violator_position: {
    保洁员: ['管理员', '乡镇作业中心经理'],
    管理员: ['管理员', '乡镇作业中心经理'],
    乡镇作业中心经理: ['乡镇作业中心经理'],
  },
  fallback: 'skip',
});

(async () => {
  const env = {};
  for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const c = new Client({
    host: env.DB_HOST,
    port: +env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: 'safety_dashboard_dev',
  });
  await c.connect();

  const codes = ['GRIDVIOL001', 'VIOLATION003', 'SAFE_AUTO', 'TRANSFER001'];
  const before = await c.query(
    `SELECT rule_code, deduct_score, scope_config, transmission_config FROM hse_assessment_rule
      WHERE rule_code = ANY($1) AND is_deleted = FALSE ORDER BY id`,
    [codes]
  );
  console.log('=== BEFORE ===');
  for (const r of before.rows) {
    console.log(r.rule_code, '| score:', r.deduct_score, '| scope:', JSON.stringify(r.scope_config), '| transmission:', JSON.stringify(r.transmission_config));
  }
  fs.writeFileSync(
    path.join(__dirname, `p2b1e0804_dev_before_${Date.now()}.json`),
    JSON.stringify(before.rows, null, 2)
  );

  await c.query('BEGIN');
  // 1) GRIDVIOL001：岗位传递配置
  await c.query(
    `UPDATE hse_assessment_rule SET transmission_config = $1::jsonb, updated_at = NOW()
      WHERE rule_code = 'GRIDVIOL001' AND is_deleted = FALSE`,
    [TRANSMISSION]
  );
  // 2) VIOLATION003：岗位传递配置 + company 分值入配置（消除 COMPANY_SCORE 双源）
  await c.query(
    `UPDATE hse_assessment_rule
        SET transmission_config = $1::jsonb,
            scope_config = COALESCE(scope_config, '{}'::jsonb) || '{"company_score":5}'::jsonb,
            updated_at = NOW()
      WHERE rule_code = 'VIOLATION003' AND is_deleted = FALSE`,
    [TRANSMISSION]
  );
  // 3) SAFE_AUTO：按岗位解析类别（乡镇作业中心经理→安全文化建设；管理员→目标职责）
  await c.query(
    `UPDATE hse_assessment_rule
        SET scope_config = COALESCE(scope_config, '{}'::jsonb) ||
            '{"category_by_position":{"乡镇作业中心经理":"安全文化建设","管理员":"目标职责"}}'::jsonb,
            updated_at = NOW()
      WHERE rule_code = 'SAFE_AUTO' AND is_deleted = FALSE`
  );
  // 4) TRANSFER001：固定分值退出计算语义（置 NULL），登记实际计算方式
  await c.query(
    `UPDATE hse_assessment_rule
        SET deduct_score = NULL,
            scope_config = COALESCE(scope_config, '{}'::jsonb) || '{"calc_mode":"ledger_five_columns_sum"}'::jsonb,
            updated_at = NOW()
      WHERE rule_code = 'TRANSFER001' AND is_deleted = FALSE`
  );
  await c.query('COMMIT');

  const after = await c.query(
    `SELECT rule_code, deduct_score, scope_config, transmission_config FROM hse_assessment_rule
      WHERE rule_code = ANY($1) AND is_deleted = FALSE ORDER BY id`,
    [codes]
  );
  console.log('=== AFTER ===');
  for (const r of after.rows) {
    console.log(r.rule_code, '| score:', r.deduct_score, '| scope:', JSON.stringify(r.scope_config), '| transmission:', JSON.stringify(r.transmission_config));
  }

  // 校验（jsonb 键序不稳定 → 语义比较：递归排序键后再比对）
  const semEq = (a, b) => {
    const s = (x) => JSON.stringify(x, (k, v2) => (v2 && typeof v2 === 'object' && !Array.isArray(v2) ? sortObj(v2) : v2));
    function sortObj(o) {
      return Object.keys(o).sort().reduce((acc, k) => ((acc[k] = o[k]), acc), {});
    }
    return s(a) === s(b);
  };
  const get = (rows, code) => rows.find((r) => r.rule_code === code);
  const a = after.rows;
  const assert = (cond, msg) => {
    if (!cond) {
      console.error('VERIFY FAIL:', msg);
      process.exitCode = 1;
    } else console.log('VERIFY OK:', msg);
  };
  assert(semEq(get(a, 'GRIDVIOL001').transmission_config, JSON.parse(TRANSMISSION)), 'GRIDVIOL001 transmission_config（语义一致）');
  assert(semEq(get(a, 'VIOLATION003').transmission_config, JSON.parse(TRANSMISSION)), 'VIOLATION003 transmission_config（语义一致）');
  assert(get(a, 'VIOLATION003').scope_config.company_score === 5, 'VIOLATION003 company_score=5');
  assert(get(a, 'SAFE_AUTO').scope_config.category_by_position['乡镇作业中心经理'] === '安全文化建设', 'SAFE_AUTO 经理→安全文化建设');
  assert(get(a, 'SAFE_AUTO').scope_config.category_by_position['管理员'] === '目标职责', 'SAFE_AUTO 管理员→目标职责');
  assert(get(a, 'TRANSFER001').deduct_score === null, 'TRANSFER001 deduct_score=NULL');
  assert(get(a, 'TRANSFER001').scope_config.calc_mode === 'ledger_five_columns_sum', 'TRANSFER001 calc_mode');

  await c.end();
})().catch((e) => {
  console.error('MIGRATION FAILED:', e.message);
  process.exit(1);
});
