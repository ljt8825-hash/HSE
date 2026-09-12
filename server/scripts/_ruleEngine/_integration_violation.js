// 回归集成测试：在隔离临时周期(2099-01)内验证三违规则库引擎通路（真实 DB，结束自动清理）。
// 归属：server/scripts/_ruleEngine/（阶段2 收尾 A4 归档，require 路径已按新层级修正）
// A3 防污染：启动前快照 R000001/VIOLATION003 的规则观测列，cleanup 阶段原样恢复；
//            任何退出路径（正常/异常/中断）都会执行快照恢复，避免污染生产观测值。
// 用法：node server/scripts/_ruleEngine/_integration_violation.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool, testConnection, isConnected } = require('../../config/db');
const engine = require('../../services/ruleEngine/engine');

let tempCycleId = null, tempTargetId = null, tempViolIds = [];

// ===== A3 观测列快照/恢复 =====
// 覆盖 hse_assessment_rule 全部 9 个可观测/配置列：
//   adapter_key, integration_status, integration_note,
//   last_run_at, last_run_cycle_id, last_scanned_count, last_assessed_count,
//   last_deducted_count, last_run_summary
const SNAPSHOT_RULE_CODES = ['R000001', 'VIOLATION003'];
// 注：last_run_at 以 ::text 取出，避免经 node-postgres 的 JS Date 往返丢失微秒精度
const SNAPSHOT_COLS = 'rule_code, adapter_key, integration_status, integration_note, ' +
  'last_run_at::text AS last_run_at, last_run_cycle_id, last_scanned_count, ' +
  'last_assessed_count, last_deducted_count, last_run_summary';
let ruleSnapshot = [];

async function snapshotRules() {
  const r = await pool.query(
    `SELECT ${SNAPSHOT_COLS} FROM hse_assessment_rule WHERE rule_code = ANY($1::text[])`,
    [SNAPSHOT_RULE_CODES]
  );
  ruleSnapshot = r.rows;
  console.log('SNAPSHOT 已保存规则观测列(9列): ' + ruleSnapshot.map((x) => x.rule_code).join(', '));
}

async function restoreRules() {
  if (!ruleSnapshot.length) return;
  for (const row of ruleSnapshot) {
    await pool.query(
      `UPDATE hse_assessment_rule
          SET adapter_key=$2, integration_status=$3, integration_note=$4,
              last_run_at=$5::timestamptz, last_run_cycle_id=$6, last_scanned_count=$7,
              last_assessed_count=$8, last_deducted_count=$9, last_run_summary=$10
        WHERE rule_code=$1`,
      [row.rule_code, row.adapter_key, row.integration_status, row.integration_note,
        row.last_run_at, row.last_run_cycle_id, row.last_scanned_count,
        row.last_assessed_count, row.last_deducted_count, row.last_run_summary]
    );
  }
  console.log('RESTORE 已还原规则观测列(9列): ' + ruleSnapshot.map((x) => x.rule_code).join(', '));
}

async function cleanup() {
  try {
    if (tempViolIds.length) await pool.query('DELETE FROM violation_records WHERE id = ANY($1)', [tempViolIds]);
    if (tempTargetId) await pool.query('DELETE FROM hse_assessment_target WHERE id=$1', [tempTargetId]);
    if (tempCycleId) await pool.query('DELETE FROM hse_assessment_deduction WHERE cycle_id=$1', [tempCycleId]);
    if (tempCycleId) await pool.query('DELETE FROM hse_assessment_cycle WHERE id=$1', [tempCycleId]);
    console.log('CLEANUP OK (temp cycle/target/violations removed)');
  } catch (e) {
    console.error('CLEANUP FAIL', e.message);
  } finally {
    // 无论数据清理是否成功，都必须还原规则观测列
    try { await restoreRules(); } catch (e) { console.error('RESTORE FAIL', e.message); }
  }
}

// 任何退出路径（含未捕获异常 / 中断）都执行 cleanup → 快照恢复
process.on('uncaughtException', async (e) => {
  console.error('UNCAUGHT', e && e.stack ? e.stack : e);
  await cleanup();
  process.exit(3);
});
process.on('unhandledRejection', async (e) => {
  console.error('UNHANDLED', e && e.stack ? e.stack : e);
  await cleanup();
  process.exit(4);
});
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

const results = [];
function check(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' :: ' + name + (extra != null ? '  [' + extra + ']' : ''));
}

(async () => {
  await testConnection();
  if (!isConnected()) { console.error('DB 未连接'); process.exit(1); }
  engine.ensureAdaptersRegistered();
  await snapshotRules();

  // 取一个真实考核对象（来自 cycle24 的现有 target，确保 employee 真实存在）
  const src = (await pool.query(
    `SELECT employee_id, employee_code, employee_name FROM hse_assessment_target WHERE cycle_id=24 AND is_deleted=FALSE LIMIT 1`
  )).rows[0];
  if (!src) { console.error('无可用考核对象'); await cleanup(); process.exit(1); }
  const empId = src.employee_id, empCode = src.employee_code, empName = src.employee_name;
  console.log('TEST EMPLOYEE:', empId, empCode, empName);

  // 临时周期 2099-01（窗口内无任何真实记录，保证隔离）
  const cyc = await pool.query(
    `INSERT INTO hse_assessment_cycle (cycle_code, cycle_name, cycle_type, assessment_year, assessment_month, start_time, end_time, status)
     VALUES ('TEST-ENGINE-209901','集成测试临时周期-三违','monthly',2099,1,'2099-01-01','2099-01-31','pending_review') RETURNING id`
  );
  tempCycleId = cyc.rows[0].id;

  const tgt = await pool.query(
    `INSERT INTO hse_assessment_target (cycle_id, employee_id, employee_code, employee_name, position, status)
     VALUES ($1,$2,$3,$4,'集成测试岗位','active') RETURNING id`,
    [tempCycleId, empId, empCode, empName]
  );
  tempTargetId = tgt.rows[0].id;

  // 插入 2 条违规：公司查处(5) + 乡镇查处(1)
  const v1 = await pool.query(
    `INSERT INTO violation_records (violator_id, violator_name, violation_date, check_source, is_deleted)
     VALUES ($1,$2,'2099-01-10','company',FALSE) RETURNING id`, [empId, empName]);
  const v2 = await pool.query(
    `INSERT INTO violation_records (violator_id, violator_name, violation_date, check_source, is_deleted)
     VALUES ($1,$2,'2099-01-12','township',FALSE) RETURNING id`, [empId, empName]);
  tempViolIds.push(v1.rows[0].id, v2.rows[0].id);
  const v1Id = v1.rows[0].id, v2Id = v2.rows[0].id;

  // ① 首次运行：功能闭环 company=5 / township=1
  const res1 = await engine.runCycleAutoDeductions(tempCycleId);
  check('engine.ok', res1.ok === true, 'adapters=' + JSON.stringify((res1.adapters || []).map(a => a.key + ':' + a.ok)));
  check('两个适配器均参与', res1.adapters && res1.adapters.length === 2);
  const ded1 = await pool.query(
    `SELECT source_id, suggested_score, source_detail FROM hse_assessment_deduction
     WHERE cycle_id=$1 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE`, [tempCycleId]);
  check('生成 2 条三违扣分', ded1.rows.length === 2, 'got=' + ded1.rows.length);
  const comp = ded1.rows.find(r => r.source_detail.checkSource === 'company');
  const town = ded1.rows.find(r => r.source_detail.checkSource === 'township');
  check('公司查处=5分', comp && parseFloat(comp.suggested_score) === 5, comp && ('score=' + comp.suggested_score));
  check('乡镇查处=1分', town && parseFloat(town.suggested_score) === 1, town && ('score=' + town.suggested_score));
  check('写入真实 source_id', comp && String(comp.source_id) === String(v1Id), 'src=' + (comp && comp.source_id));
  check('source_detail 落 employeeId/targetId',
    comp && String(comp.source_detail.employeeId) === String(empId) && comp.source_detail.targetId != null,
    comp && ('employeeId=' + comp.source_detail.employeeId + ' targetId=' + comp.source_detail.targetId));

  // ② 幂等：再次运行不应产生变更（affected=0）
  const res2 = await engine.runCycleAutoDeductions(tempCycleId);
  check('幂等重跑 affected=0', res2.affected === 0, 'affected=' + res2.affected);
  const ded2 = await pool.query(
    `SELECT COUNT(*) AS n FROM hse_assessment_deduction WHERE cycle_id=$1 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE`, [tempCycleId]);
  check('幂等后仍为 2 条', parseInt(ded2.rows[0].n) === 2);

  // ③ 软删 v1 → 对应扣分应被撤销(revoked)
  await pool.query('UPDATE violation_records SET is_deleted=TRUE WHERE id=$1', [v1Id]);
  const res3 = await engine.runCycleAutoDeductions(tempCycleId);
  const revoked = await pool.query(
    `SELECT COUNT(*) AS n FROM hse_assessment_deduction WHERE cycle_id=$1 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE AND source_id=$2`, [tempCycleId, v1Id]);
  check('软删后公司查处扣分被撤销', parseInt(revoked.rows[0].n) === 0, 'res3.affected=' + res3.affected);

  // ④ 恢复 v1 → 复活(revived) 重新计 5 分
  await pool.query('UPDATE violation_records SET is_deleted=FALSE WHERE id=$1', [v1Id]);
  await engine.runCycleAutoDeductions(tempCycleId);
  const revived = await pool.query(
    `SELECT suggested_score FROM hse_assessment_deduction WHERE cycle_id=$1 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE AND source_id=$2`, [tempCycleId, v1Id]);
  check('恢复后公司查处扣分复活=5', revived.rows.length === 1 && parseFloat(revived.rows[0].suggested_score) === 5);

  // ⑤ 上限钳制：再插入 20 条公司查处 → 三违管理上限 15，合计应被钳制为 15
  const extra = [];
  for (let i = 0; i < 20; i++) {
    const v = await pool.query(
      `INSERT INTO violation_records (violator_id, violator_name, violation_date, check_source, is_deleted)
       VALUES ($1,$2,'2099-01-15','company',FALSE) RETURNING id`, [empId, empName]);
    tempViolIds.push(v.rows[0].id); extra.push(v.rows[0].id);
  }
  await engine.runCycleAutoDeductions(tempCycleId);
  const cap = await pool.query(
    `SELECT COALESCE(SUM(suggested_score),0) AS s, COUNT(*) AS n FROM hse_assessment_deduction
     WHERE cycle_id=$1 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE`, [tempCycleId]);
  check('类别上限钳制→合计=15', parseFloat(cap.rows[0].s) === 15, 'sum=' + cap.rows[0].s + ' activeRows=' + cap.rows[0].n);

  // ⑥ 人工锁定：取一条激活扣分置 approved，重跑不应被覆盖/撤销
  const lockId = await pool.query(
    `SELECT id, suggested_score FROM hse_assessment_deduction WHERE cycle_id=$1 AND source_detail->>'kind'='violation_event' AND is_deleted=FALSE LIMIT 1`, [tempCycleId]);
  if (lockId.rows.length) {
    const lid = lockId.rows[0].id, lscore = lockId.rows[0].suggested_score;
    await pool.query("UPDATE hse_assessment_deduction SET review_status='approved' WHERE id=$1", [lid]);
    await engine.runCycleAutoDeductions(tempCycleId);
    const after = await pool.query(
      `SELECT suggested_score, review_status, is_deleted FROM hse_assessment_deduction WHERE id=$1`, [lid]);
    check('approved 锁定不被覆盖/撤销', after.rows.length === 1 && after.rows[0].is_deleted === false && after.rows[0].suggested_score === lscore && after.rows[0].review_status === 'approved',
      'score=' + (after.rows[0] && after.rows[0].suggested_score) + ' status=' + (after.rows[0] && after.rows[0].review_status));
  } else {
    check('approved 锁定测试(无条件跳过)', true);
  }

  // 输出统一门面返回样例
  console.log('\n=== 统一门面 runCycleAutoDeductions 返回样例 ===');
  console.log(JSON.stringify(await engine.runCycleAutoDeductions(tempCycleId), null, 2));

  const failed = results.filter(r => !r.ok);
  console.log('\n=== 集成测试汇总: ' + (results.length - failed.length) + '/' + results.length + ' PASS ===');
  if (failed.length) console.log('FAILED: ' + failed.map(f => f.name).join('; '));

  await cleanup();
  process.exit(failed.length ? 1 : 0);
})().catch(async (e) => {
  console.error('INTEGRATION ERROR', e && e.stack || e);
  await cleanup();
  process.exit(2);
});
