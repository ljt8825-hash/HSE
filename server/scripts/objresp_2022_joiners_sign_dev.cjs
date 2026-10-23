/**
 * 目标责任书签订台账 · 2022 入职人员「未签订 → 已签订」批量修正（仅 safety_dashboard_dev）
 *
 * 护栏：DML 只允许作用于 safety_dashboard_dev；脚本硬编码该库并断言 current_database()，
 *       任何情况下都不会触碰生产库（safety_dashboard）。
 *
 * 口径：与 objectiveService.buildRosterFrom / buildRosterWhere 完全一致——
 *   员工签订状态 = 该员工「最新一份」合同（ORDER BY sign_date DESC NULLS LAST, id DESC）的 status：
 *     'signed' → 已签订；其余（含 NULL / 'unsigned' / 无合同）→ 未签订。
 *
 * 目标集：v_employee_current 中 employee_deleted=false、assignment_status='active'、
 *         EXTRACT(YEAR FROM start_date)=2022，且最新合同状态 != 'signed'（含无合同）的员工。
 *
 * 变更：
 *   1) 已有合同（最新一份未签订）→ 将该最新合同 status 置 'signed'，sign_date 缺失则补 CURRENT_DATE。
 *   2) 无合同 → 插入一条 status='signed' 的合同（title=`姓名 目标责任书`，contract_type='目标责任书'）。
 *
 * 运行：
 *   node scripts/objresp_2022_joiners_sign_dev.cjs            # 默认 dry-run（只读预览，不改库）
 *   node scripts/objresp_2022_joiners_sign_dev.cjs --apply    # 实际执行
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DRY_RUN = !process.argv.includes('--apply');
const DEV_DB = 'safety_dashboard_dev';

// 手动读取 .env（与既有 dev 迁移脚本一致），但强制覆盖 DB_NAME 为 dev，杜绝误连生产
const env = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

const cfg = {
  host: env.DB_HOST || '127.0.0.1',
  port: +(env.DB_PORT || 5432),
  user: env.DB_USER || 'postgres',
  password: env.DB_PASSWORD || '',
  database: DEV_DB, // 硬设 dev，永不使用 .env 里的 DB_NAME
  connectionTimeoutMillis: 15000,
};

const ANALYSIS_SQL = `
WITH base AS (
  SELECT e.employee_id, e.name, e.employee_code, e.org_name AS department,
         to_char(e.start_date, 'YYYY-MM-DD') AS hire_date,
         (SELECT c.status FROM hse_target_contracts c
          WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
          ORDER BY c.sign_date DESC NULLS LAST, c.id DESC LIMIT 1) AS latest_status,
         (SELECT c.id FROM hse_target_contracts c
          WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
          ORDER BY c.sign_date DESC NULLS LAST, c.id DESC LIMIT 1) AS latest_id
  FROM v_employee_current e
  WHERE e.employee_deleted = false
    AND e.assignment_status = 'active'
    AND EXTRACT(YEAR FROM e.start_date) = 2022
)
SELECT
  COUNT(*) AS total_2022_joiners,
  COUNT(*) FILTER (WHERE latest_status = 'signed') AS already_signed,
  COUNT(*) FILTER (WHERE latest_status IS DISTINCT FROM 'signed' AND latest_id IS NOT NULL) AS unsigned_has_contract,
  COUNT(*) FILTER (WHERE latest_id IS NULL) AS no_contract,
  COUNT(*) FILTER (WHERE latest_status IS DISTINCT FROM 'signed') AS target_total
FROM base;
`;

const SAMPLE_SQL = `
WITH base AS (
  SELECT e.employee_id, e.name, e.employee_code, e.org_name AS department,
         to_char(e.start_date, 'YYYY-MM-DD') AS hire_date,
         (SELECT c.status FROM hse_target_contracts c
          WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
          ORDER BY c.sign_date DESC NULLS LAST, c.id DESC LIMIT 1) AS latest_status,
         (SELECT c.id FROM hse_target_contracts c
          WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
          ORDER BY c.sign_date DESC NULLS LAST, c.id DESC LIMIT 1) AS latest_id
  FROM v_employee_current e
  WHERE e.employee_deleted = false
    AND e.assignment_status = 'active'
    AND EXTRACT(YEAR FROM e.start_date) = 2022
)
SELECT employee_code, name, department, hire_date, latest_status, latest_id
FROM base
WHERE latest_status IS DISTINCT FROM 'signed'
ORDER BY department, employee_code
LIMIT 50;
`;

// 1) 已有合同（最新一份未签订）→ 置为已签订
const UPDATE_SQL = `
WITH base AS (
  SELECT e.employee_id,
         (SELECT c.id FROM hse_target_contracts c
          WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
          ORDER BY c.sign_date DESC NULLS LAST, c.id DESC LIMIT 1) AS latest_id,
         (SELECT c.status FROM hse_target_contracts c
          WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
          ORDER BY c.sign_date DESC NULLS LAST, c.id DESC LIMIT 1) AS latest_status
  FROM v_employee_current e
  WHERE e.employee_deleted = false
    AND e.assignment_status = 'active'
    AND EXTRACT(YEAR FROM e.start_date) = 2022
)
UPDATE hse_target_contracts c
SET status = 'signed',
    sign_date = COALESCE(c.sign_date, CURRENT_DATE),
    updated_at = NOW()
FROM base b
WHERE c.id = b.latest_id
  AND b.latest_status IS DISTINCT FROM 'signed';
`;

// 2) 无合同 → 插入已签订记录
const INSERT_SQL = `
INSERT INTO hse_target_contracts
  (title, contract_type, status, signee_employee_id, signee_person_name, sign_date, org_unit_id, department)
SELECT e.name || ' 目标责任书', '目标责任书', 'signed', e.employee_id, e.name, CURRENT_DATE, e.org_unit_id, e.org_name
FROM v_employee_current e
WHERE e.employee_deleted = false
  AND e.assignment_status = 'active'
  AND EXTRACT(YEAR FROM e.start_date) = 2022
  AND NOT EXISTS (
    SELECT 1 FROM hse_target_contracts c
    WHERE c.signee_employee_id = e.employee_id AND c.is_deleted = false
  );
`;

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    const cur = await c.query('SELECT current_database() AS db');
    const db = cur.rows[0].db;
    if (db !== DEV_DB) {
      console.error(`[护栏拒绝] current_database()= ${db}，并非 ${DEV_DB}，已终止（绝不触碰非 dev 库）`);
      process.exit(2);
    }
    console.log(`[护栏 OK] 已连接数据库：${db}`);

    const a = await c.query(ANALYSIS_SQL);
    const m = a.rows[0];
    console.log('=== 2022 入职 · 目标责任书签订状态分析（dev）===');
    console.log('2022 入职（在职、未删除）总人数 :', m.total_2022_joiners);
    console.log('  其中已签订                  :', m.already_signed);
    console.log('  其中未签订（已有合同待改）    :', m.unsigned_has_contract);
    console.log('  其中未签订（无合同需新增）    :', m.no_contract);
    console.log('  >>> 本次目标（未签订，合计）  :', m.target_total);

    const s = await c.query(SAMPLE_SQL);
    if (s.rows.length) {
      console.log('\n--- 目标人员样本（最多 50 条）---');
      for (const r of s.rows) {
        console.log(
          `${r.employee_code || '(无编码)'}\t${r.name}\t${r.department || ''}\t入职 ${r.hire_date}\t当前状态=${r.latest_status || '无合同'}\t合同id=${r.latest_id ?? '无'}`
        );
      }
    }

    if (DRY_RUN) {
      console.log('\n[DRY-RUN] 未执行任何写入。加 --apply 才会实际修改 dev 库。');
      await c.end();
      return;
    }

    // === APPLY ===
    await c.query('BEGIN');
    const up = await c.query(UPDATE_SQL);
    const ins = await c.query(INSERT_SQL);
    console.log(`\n[APPLY] UPDATE 已签合同数: ${up.rowCount}  | INSERT 新增合同数: ${ins.rowCount}`);

    const a2 = await c.query(ANALYSIS_SQL);
    const m2 = a2.rows[0];
    console.log('=== 变更后复核 ===');
    console.log('2022 入职总人数              :', m2.total_2022_joiners);
    console.log('  已签订                    :', m2.already_signed);
    console.log('  未签订（剩余）             :', m2.target_total);

    if (parseInt(m2.target_total, 10) !== 0) {
      console.error('[校验失败] 变更后仍有未签订人员，回滚。');
      await c.query('ROLLBACK');
      await c.end();
      process.exit(3);
    }
    await c.query('COMMIT');
    console.log(`[APPLY OK] 已全部置为已签订（UPDATE ${up.rowCount} + INSERT ${ins.rowCount}）。已提交。`);
    await c.end();
  } catch (e) {
    console.error('[失败]', e.message);
    try { await c.query('ROLLBACK'); } catch (_) {}
    await c.end();
    process.exit(1);
  }
})();
