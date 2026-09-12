/**
 * 2026-04(cyc52) 定向回补 · 安全文化建设（方案B）
 *
 * 背景：台账 hse_safety_culture_monthly 2026-04 已有数据，但孙建栋/王臣祥/杨清华
 *            的「并桶更换点位=0」(未开展)，按 10分/项 应各扣 10 分，系统却从未生成文化扣分。
 * 根因：SAFE_AUTO 规则配置被改动（category='目标职责'/deduct_score=1），整周期引擎重跑会污染，
 *           故采用定向人工回补，record 结构严格对齐 safetyCultureAdapter 产出（source_table=
 *           hse_safety_culture_monthly, source_detail.kind=safety_culture_monthly）。
 * 幂等：同 target+cycle + deduction_source='auto' + source_table='hse_safety_culture_monthly'
 *           + 未删除 已存在 → 跳过。
 * 每处改动：独立插入一条，并 recalculateTarget 重算该对象 score_total。
 */
const { pool, testConnection } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');

const CYCLE_ID = 52;
// {targetId, name, dept}  来自 hse_assessment_target cyc52 + 台账 dept
const ROWS = [
  { targetId: 1276, name: '孙建栋', dept: '大曹镇' },
  { targetId: 1239, name: '王臣祥', dept: '柴胡店镇' },
  { targetId: 1280, name: '杨清华', dept: '保店镇' },
];
const CAT = '安全文化建设';
const METRIC_ID = 25;
const METRIC_CODE = 'HSE-KPI-ACT-001';
const ITEM = '安全文化建设专项活动未开展';
const SOURCE_TABLE = 'hse_safety_culture_monthly';
const MISSING = ['并桶更换点位'];
const SCORE = 10;
const UNIT = 10;
const CAP = 20;

function makeDetail(tid){
  return {
    kind: 'safety_culture_monthly',
    deductKey: `safety-culture:${CYCLE_ID}:${tid}`,
    ruleName: '安全文化建设专项活动未开展',
    category: CAT,
    eventType: 'SAFETY_CULTURE',
    dept: null, // 下面按行填
    level: '乡镇主管',
    unit: UNIT,
    manual: 0,
    missingLabels: [...MISSING],
    rawScore: SCORE,
    cap: CAP,
    cappedScore: SCORE,
    otherCatScore: 0,
    year: 2026,
    month: 4,
    summary: `安全文化建设（${MISSING.join('、')}未开展）`,
  };
}

(async () => {
  await testConnection();

  console.log('===== 回补前 score_total =====');
  const before = (await pool.query(
    `SELECT id, employee_name, score_auto, score_total FROM hse_assessment_target WHERE id = ANY($1::int[])`,
    [ROWS.map(r => r.targetId)]
  )).rows;
  for (const t of before) console.log(`  ${t.employee_name}(id=${t.id}): auto=${t.score_auto} total=${t.score_total}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of ROWS) {
      // 幂等：已存在未删除的文化扣分 → 跳过
      const dup = await client.query(
        `SELECT id FROM hse_assessment_deduction
          WHERE target_id=$1 AND cycle_id=$2 AND deduction_source='auto' AND is_deleted=FALSE
            AND source_table=$3 AND source_detail->>'category'=$4 LIMIT 1`,
        [r.targetId, CYCLE_ID, SOURCE_TABLE, CAT]
      );
      if (dup.rows.length) { console.log(`跳过(已存在) ${r.name} id=${r.targetId}`); continue; }

      const scoreId = await engine.ensureTargetScoreRecord(r.targetId, CYCLE_ID);
      const detail = makeDetail(r.targetId);
      detail.dept = r.dept;
      const ins = await client.query(
        `INSERT INTO hse_assessment_deduction
           (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item, deduction_type, deduction_source,
            source_table, source_id, source_detail, suggested_score, current_version, review_status, is_transmission, is_deleted, remark)
         VALUES ($1,$2,$3,$4,$5,$6,'auto_deduction','auto',$7,NULL,$8,$9,1,'pending',FALSE,FALSE,$10) RETURNING id`,
        [scoreId, r.targetId, CYCLE_ID, METRIC_ID, METRIC_CODE, ITEM, SOURCE_TABLE, JSON.stringify(detail), SCORE,
         `【定向补录】${r.name} ${CAT} 未开展「${MISSING.join('、')}」扣 ${SCORE} 分（方案B）`]
      );
      console.log(`插入 id=${ins.rows[0].id} ${r.name}(id=${r.targetId}) [${CAT}] ${SCORE}分`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ERR', e.message);
    process.exit(1);
  } finally {
    client.release();
  }

  // 重算 3 个对象分数
  for (const r of ROWS) {
    const res = await engine.recalculateTarget(CYCLE_ID, r.targetId);
    console.log(`recalc ${r.name}(id=${r.targetId}) → ok=${res.ok} reason=${res.reason||''} scoreAuto=${res.scoreAuto} scoreTotal=${res.scoreTotal}`);
  }

  // 验证
  console.log('\n===== 验证 =====');
  const v = (await pool.query(
    `SELECT t.employee_name, t.score_auto, t.score_total, d.suggested_score AS sc,
            d.source_detail->>'category' AS cat, d.source_detail->>'summary' AS summary, d.is_deleted
       FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
      WHERE d.cycle_id=$1 AND d.target_id=ANY($2::int[]) AND d.source_detail->>'category'='安全文化建设'
      ORDER BY t.employee_name`,[CYCLE_ID, ROWS.map(r=>r.targetId)]
  )).rows;
  for (const x of v) console.log(`  ${x.employee_name} | 文化扣${x.sc}(summary=${x.summary}) | auto=${x.score_auto} total=${x.score_total} del=${x.is_deleted}`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });