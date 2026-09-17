/**
 * P2-B1-E-08-04-R4-FIX-SCOPE · DEV 配置迁移 v2（幂等 / 可回滚 / 可验证）
 *
 * 唯一数据变更：system_settings 一行确认责任【关系】配置（R4-FIX-SCOPE 收敛）：
 *   setting_key   = assessment.confirmed_responsibility_targets
 *   setting_value = confirmed_relations 结构：
 *     { responsible_employee_id: 6702, subordinate_employee_ids: [16 名已确认保洁员],
 *       mode: "sole_target" }
 *   （6702 = 于鑫宁；津城街道作业中心 16 名保洁员实际责任人，业务确认 2026-09-14。
 *     16 名下属 id 事实来源 = R4 迁移组C（e0804r4/supervisor-correction-migrate
 *     组C 6705→6702），与 DEV 库现状双重核对一致。）
 *
 * 语义变化（相对 R4-FIX v1）：确认的是「责任关系事实」（具体下属→具体责任人），
 * 不是「人员全局资格」——任何不在 subordinate_employee_ids 内的人员即使
 * supervisor=6702 也不得继承确认语义，一律回默认责任解析规则。
 *
 * 用法：
 *   node scripts/p2b1e0804r4fix_dev_migration.cjs            # 执行（幂等）
 *   node scripts/p2b1e0804r4fix_dev_migration.cjs --verify   # 只验证（预检/后检）
 *   node scripts/p2b1e0804r4fix_dev_migration.cjs --rollback # 回滚（删除配置行）
 *
 * 边界：仅 DEV（safety_dashboard_dev）；零生产触碰；不修改任何 employee/assignment 数据。
 */
process.env.DB_NAME = process.env.DB_NAME || 'safety_dashboard_dev';
const db = require('../config/db');
const { pool } = db;
const { CONFIRMED_SETTING_KEY } = require('../services/assessmentTargetEligibility');

// 组C：津城街道 16 名保洁员（R4 supervisor 修正 6705→6702，业务确认 2026-09-14）
const JINCHENG_CONFIRMED_SUBORDINATES = [
  6825, 6827, 6828, 6829, 6831, 6833, 6834, 6835, 6836, 6837, 6838, 6839, 6840, 9292, 9465, 9556,
];

const SETTING_VALUE = JSON.stringify({
  confirmed_relations: [
    {
      responsible_employee_id: 6702,
      subordinate_employee_ids: JINCHENG_CONFIRMED_SUBORDINATES,
      mode: 'sole_target',
    },
  ],
  remark: '津城街道作业中心 16 名保洁员实际责任人=于鑫宁(6702)；业务确认 2026-09-14（E-08-04-R4-FIX）；R4-FIX-SCOPE 收敛为责任关系事实（confirmed_relations），非人员全局资格；employee_id 配置，禁止姓名/组织硬编码',
});
const DESCRIPTION = '三违责任解析·确认责任关系（R4-FIX-SCOPE）：confirmed_relations 表达「已确认的具体下属→具体实际责任人」事实；sole_target 模式下该责任人即唯一责任目标并具备考核责任目标资格；不在下属范围内的人员不继承确认语义';

const EXPECTED_RESPONSIBLE = 6702;
const EXPECTED_SUBORDINATES = JINCHENG_CONFIRMED_SUBORDINATES;

async function verify(expectPresent) {
  const r = await pool.query(`SELECT setting_key, setting_value, description FROM system_settings WHERE setting_key=$1`, [CONFIRMED_SETTING_KEY]);
  if (!expectPresent) {
    if (r.rows.length) { console.error('VERIFY-FAIL: 配置行存在（预期缺失）'); process.exit(1); }
    console.log('VERIFY-OK: 配置行不存在（预期缺失）');
    return;
  }
  if (r.rows.length !== 1) { console.error('VERIFY-FAIL: 配置行缺失'); process.exit(1); }
  let cfg;
  try { cfg = JSON.parse(r.rows[0].setting_value); } catch (e) { console.error('VERIFY-FAIL: JSON 非法:', e.message); process.exit(1); }
  const rels = Array.isArray(cfg.confirmed_relations) ? cfg.confirmed_relations : [];
  const rel = rels[0] || {};
  const subs = Array.isArray(rel.subordinate_employee_ids) ? rel.subordinate_employee_ids : [];
  const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).join(',') === [...b].sort((x, y) => x - y).join(',');
  const checks = [
    ['confirmed_relations 恰 1 条', rels.length === 1],
    [`responsible_employee_id=${EXPECTED_RESPONSIBLE}`, Number(rel.responsible_employee_id) === EXPECTED_RESPONSIBLE],
    ['mode=sole_target', String(rel.mode || 'sole_target') === 'sole_target'],
    ['subordinate_employee_ids 与 R4 组C 16 人完全一致', sameSet(subs, EXPECTED_SUBORDINATES)],
    ['16 名下属全部为在职正式员工', (async () => {
      const q = await pool.query(
        `SELECT COUNT(*)::int n FROM employee e WHERE e.id = ANY($1::bigint[])
          AND e.employment_relation='正式员工' AND e.is_deleted=FALSE`, [subs]);
      return q.rows[0].n === subs.length;
    })()],
    ['16 名下属当前 supervisor 全部=6702（关系事实成立）', (async () => {
      const q = await pool.query(
        `SELECT COUNT(*)::int n FROM v_employee_org_full v
          WHERE v.employee_id = ANY($1::bigint[]) AND v.supervisor_id=6702
            AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE`, [subs]);
      return q.rows[0].n === subs.length;
    })()],
    ['6702 为当前有效人员（正式员工）', (await pool.query(
      `SELECT 1 FROM v_employee_org_full v JOIN employee e ON e.id=v.employee_id
        WHERE v.employee_id=6702 AND v.is_current=TRUE AND v.relation_status='active' AND v.is_deleted=FALSE
          AND e.employment_relation='正式员工' LIMIT 1`)).rowCount === 1],
    ['6702 原始人员数据未被修改（岗位=作业质量管理主管@生产管理部）', (await pool.query(
      `SELECT 1 FROM v_employee_org_full WHERE employee_id=6702 AND position_name='作业质量管理主管' AND org_name='生产管理部'
        AND is_current=TRUE AND relation_status='active' AND is_deleted=FALSE LIMIT 1`)).rowCount === 1],
  ];
  let fail = 0;
  for (const item of checks) {
    const [name, val] = item;
    const ok = val instanceof Promise ? await val : val;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) fail++;
  }
  if (fail) process.exit(1);
  console.log('VERIFY-OK: 配置行就绪且全部校验通过');
}

(async () => {
  await db.testConnection();
  const mode = process.argv[2] || '';
  if (mode === '--verify') { await verify(true); await pool.end(); return; }
  if (mode === '--rollback') {
    const r = await pool.query(`DELETE FROM system_settings WHERE setting_key=$1`, [CONFIRMED_SETTING_KEY]);
    console.log(`ROLLBACK: 已删除 ${r.rowCount} 行配置`);
    await verify(false);
    await pool.end();
    return;
  }
  // 执行（幂等 upsert 语义：存在则更新为标准值 v2）
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (setting_key) DO UPDATE
       SET setting_value = EXCLUDED.setting_value, description = EXCLUDED.description, updated_at = NOW()`,
    [CONFIRMED_SETTING_KEY, SETTING_VALUE, DESCRIPTION]
  );
  console.log('MIGRATE-OK: 配置行已写入 v2（confirmed_relations，幂等）');
  await verify(true);
  await pool.end();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
