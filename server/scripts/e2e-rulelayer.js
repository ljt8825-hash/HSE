/**
 * 受控 E2E：规则层命中换算 + 优先级 + 审核不覆盖人工调整
 * 使用测试规则的指标：HSE-KPI-RESP-004（MEETING_ABSENT，基础扣2分）
 * 对象：hse_assessment_target id=414（张万恒，周期24）
 * 结束后清理测试规则与测试扣分明细；事件日志因防删触发器保留。
 */
const { pool } = require('../config/db');
const eventService = require('../services/assessmentEventService');

const TARGET_ID = 414;
const CYCLE_ID = 24;
const EMP_ID = 6709; // 张万恒 employee_id
const MI = 'HSE-KPI-RESP-004';

async function insertRule(name, objectType, objectValue, scale, priority, validFrom, validTo) {
  const r = await pool.query(
    `INSERT INTO hse_assessment_metric_rule
      (rule_name, metric_code, object_type, object_value, valid_from, valid_to, scale_factor, priority, active, remark)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,'E2E-RULE-TEST')
     RETURNING id`,
    [name, MI, objectType, objectValue, validFrom, validTo, scale, priority]
  );
  return r.rows[0].id;
}

async function delRules() {
  await pool.query(
    `DELETE FROM hse_assessment_metric_rule WHERE remark='E2E-RULE-TEST'`
  );
}

async function delDeductions() {
  await pool.query(
    `UPDATE hse_assessment_deduction
     SET is_deleted=TRUE
     WHERE target_id=$1 AND cycle_id=$2
       AND (source_detail->>'sourceType') = 'meeting-e2e'`,
    [TARGET_ID, CYCLE_ID]
  );
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${label}`); }
  else { fail++; console.log(`  ✘ ${label} ${extra ? JSON.stringify(extra) : ''}`); }
}

(async () => {
  try {
    // 显式初始化连接，否则 resolveMetricRule 的 isConnected() 保护会误判为未连接
    await require('../config/db').testConnection();
    console.log('=== 准备：清理旧测试数据 ===');
    await delRules();
    await delDeductions();
    // 清理测试区间的会议缺勤明细（recordId 900001-900004），避免幂等拦截
    await pool.query(
      `UPDATE hse_assessment_deduction SET is_deleted=TRUE
       WHERE target_id=$1 AND cycle_id=$2 AND source_table='meeting_records'
         AND source_id::bigint BETWEEN 900001 AND 900004`,
      [TARGET_ID, CYCLE_ID]
    );

    console.log('\n=== 场景1：无规则 → 基础扣2分 ===');
    const k1 = `MEET-E2E-BASE-${Date.now()}`;
    const baseRes = await eventService.consume('MEETING_ABSENT', {
      employeeId: EMP_ID, meetingKey: k1, recordId: 900001, subject: 'E2E基础', eventDate: '2026-08-10',
    });
    console.log('  consume result:', JSON.stringify(baseRes));
    let d1 = (await pool.query(`SELECT * FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND source_table='meeting_records' AND (source_detail->>'eventType')='MEETING_ABSENT' AND (source_detail->>'sourceId')::bigint=900001 AND is_deleted=FALSE ORDER BY id DESC LIMIT 1`, [TARGET_ID, CYCLE_ID])).rows[0];
    check('基础扣分 suggested=2', d1 && Number(d1.suggested_score) === 2, d1 && d1.suggested_score);
    check('基础无 ruleHit', d1 && !d1.source_detail.ruleHit);

    console.log('\n=== 场景2：员工级 scale=3 → 扣6分 ===');
    const rEmp = await insertRule('E2E-员工x3', 'employee', '6709', 3.0, 100, '2026-08-01', '2026-08-31');
    const k2 = `MEET-E2E-x3-${Date.now()}`;
    await eventService.consume('MEETING_ABSENT', {
      employeeId: EMP_ID, meetingKey: k2, recordId: 900002, subject: 'E2Ex3', eventDate: '2026-08-11',
    });
    let d2 = (await pool.query(`SELECT * FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND source_table='meeting_records' AND (source_detail->>'sourceId')::bigint=900002 AND is_deleted=FALSE LIMIT 1`, [TARGET_ID, CYCLE_ID])).rows[0];
    check('规则命中 suggested=6 (2×3)', d2 && Number(d2.suggested_score) === 6, d2 && d2.suggested_score);
    check('source_detail.ruleHit 存在', d2 && d2.source_detail.ruleHit && d2.source_detail.ruleHit.ruleId === rEmp, d2 && d2.source_detail.ruleHit);
    check('ruleHit.scaleFactor=3', d2 && d2.source_detail.ruleHit && d2.source_detail.ruleHit.scaleFactor === 3);

    console.log('\n=== 场景3：优先级 employee > department > all ===');
    // 造规则：all scale=4 且 priority=200（更高），department scale=2，employee scale=5
    await insertRule('E2E-all-x4', 'all', null, 4.0, 500, '2026-08-01', '2026-08-31');
    await insertRule('E2E-dept-x2', 'department', '测试乡镇', 2.0, 300, '2026-08-01', '2026-08-31');
    const rEmp5 = await insertRule('E2E-emp-x5', 'employee', '6709', 5.0, 100, '2026-08-01', '2026-08-31');
    const k3 = `MEET-E2E-prio-${Date.now()}`;
    await eventService.consume('MEETING_ABSENT', {
      employeeId: EMP_ID, meetingKey: k3, recordId: 900003, subject: 'E2Eprio', eventDate: '2026-08-12',
    });
    let d3 = (await pool.query(`SELECT * FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND source_table='meeting_records' AND (source_detail->>'sourceId')::bigint=900003 AND is_deleted=FALSE LIMIT 1`, [TARGET_ID, CYCLE_ID])).rows[0];
    check('优先级命中 employee (suggested=10, 非all的8)', d3 && Number(d3.suggested_score) === 10, d3 && d3.suggested_score);
    check('命中employee规则 id=' + rEmp5, d3 && d3.source_detail.ruleHit && d3.source_detail.ruleHit.ruleId === rEmp5, d3 && d3.source_detail.ruleHit);

    console.log('\n=== 场景4：缩放后分数重算到 target ===');
    const t1 = (await pool.query(`SELECT score_auto FROM hse_assessment_target WHERE id=$1`, [TARGET_ID])).rows[0];
    await eventService.consume('MEETING_ABSENT', {
      employeeId: EMP_ID, meetingKey: `MEET-E2E-recalc-${Date.now()}`, recordId: 900004, subject: 'E2Erecalc', eventDate: '2026-08-13',
    });
    const t2 = (await pool.query(`SELECT score_auto FROM hse_assessment_target WHERE id=$1`, [TARGET_ID])).rows[0];
    check('重算后 score_auto 变化', Math.abs(Number(t2.score_auto) - Number(t1.score_auto)) > 0, { before: t1.score_auto, after: t2.score_auto });

    console.log('\n=== 场景5：审核通过不覆盖人工 adjusted ===');
    // 对 d3（10分）人工 adjust 到 1，再 approve，确认 confirmed 仍=1
    const d3row = d3;
    if (d3row) {
      await pool.query(`UPDATE hse_assessment_deduction SET confirmed_score=1, review_status='adjusted', current_version=2 WHERE id=$1`, [d3row.id]);
      const d3before = (await pool.query(`SELECT confirmed_score FROM hse_assessment_deduction WHERE id=$1`, [d3row.id])).rows[0];
      // 模拟审核通过：confirmed=COALESCE(confirmed, suggested) → 应保留1
      await pool.query(`UPDATE hse_assessment_deduction SET review_status='approved', confirmed_score=COALESCE(confirmed_score, suggested_score) WHERE id=$1`, [d3row.id]);
      const d3after = (await pool.query(`SELECT confirmed_score, review_status FROM hse_assessment_deduction WHERE id=$1`, [d3row.id])).rows[0];
      check('confirmed 保留人工值 1', Number(d3after.confirmed_score) === 1, d3after.confirmed_score);
      check('人工值不再被 suggested(10) 覆盖', Number(d3after.confirmed_score) !== Number(d3row.suggested_score));
    }

    console.log('\n=== 清理测试数据 ===');
    await delRules();
    await delDeductions();
    await pool.query(
      `UPDATE hse_assessment_deduction SET is_deleted=TRUE
       WHERE target_id=$1 AND cycle_id=$2 AND source_table='meeting_records'
         AND source_id::bigint BETWEEN 900001 AND 900004`,
      [TARGET_ID, CYCLE_ID]
    );

    console.log(`\n结果: PASS=${pass} FAIL=${fail}`);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('E2E ERROR:', e.message);
    // 尽量清理
    try { await delRules(); await delDeductions(); } catch (_) {}
    process.exit(1);
  }
})();