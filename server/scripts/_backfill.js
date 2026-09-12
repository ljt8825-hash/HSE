const { pool, testConnection } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }
// 补录清单: {targetId, cycleId, category, score, metricCode, item}
const BACKFILL = [
  { targetId: 769, cycleId: 44, category: '目标职责', score: 30, metricCode: 'HSE-KPI-OBJ-001', item: '目标职责考核不达标补录（Excel月度考核对齐）', ruleName: '专项活动', month: '2025-08' },
  { targetId: 770, cycleId: 44, category: '目标职责', score: 30, metricCode: 'HSE-KPI-OBJ-001', item: '目标职责考核不达标补录（Excel月度考核对齐）', ruleName: '专项活动', month: '2025-08' },
  { targetId: 771, cycleId: 44, category: '目标职责', score: 30, metricCode: 'HSE-KPI-OBJ-001', item: '目标职责考核不达标补录（Excel月度考核对齐）', ruleName: '专项活动', month: '2025-08' },
  { targetId: 845, cycleId: 45, category: '否决项', score: 100, metricCode: 'HSE-KPI-NEG-004', item: '发生生产安全责任事故/次责及以上交通事故（Excel对齐）', ruleName: '发生1起生产安全责任事故，或1起次责及以上交通事故', month: '2025-09' },
  { targetId: 904, cycleId: 46, category: '否决项', score: 100, metricCode: 'HSE-KPI-NEG-004', item: '发生生产安全责任事故/次责及以上交通事故（Excel对齐）', ruleName: '发生1起生产安全责任事故，或1起次责及以上交通事故', month: '2025-10' },
];

(async () => {
  await testConnection();
  // 周期状态
  const cycles = await q(`SELECT id, cycle_name, status FROM hse_assessment_cycle WHERE id IN (44,45,46)`);
  for (const c of cycles) console.log('周期', c.id, c.cycle_name, '状态=', c.status);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const b of BACKFILL) {
      // 幂等：同 target+cycle+category 已存在则跳过
      const dup = await client.query(
        `SELECT id FROM hse_assessment_deduction WHERE target_id=$1 AND cycle_id=$2 AND deduction_source='auto'
         AND is_deleted=FALSE AND source_table='excel_monthly_backfill' AND source_detail->>'category'=$3 LIMIT 1`,
        [b.targetId, b.cycleId, b.category]
      );
      if (dup.rows.length) { console.log('跳过(已存在) target='+b.targetId+' '+b.category); continue; }

      const scoreId = await engine.ensureTargetScoreRecord(b.targetId, b.cycleId);
      const detail = { kind:'excel_backfill', deductKey:`excel-backfill:${b.cycleId}:${b.targetId}:${b.category}`, category:b.category, ruleHit:{ruleName:b.ruleName}, source:'excel月度考核结果补录', month:b.month };
      const r = await client.query(
        `INSERT INTO hse_assessment_deduction
           (score_id, target_id, cycle_id, metric_id, metric_code, deduction_item, deduction_type, deduction_source,
            source_table, source_id, source_detail, suggested_score, current_version, review_status, is_transmission, is_deleted, remark)
         VALUES ($1,$2,$3,$4,$5,$6,'auto_deduction','auto',$7,NULL,$8,$9,1,'pending',FALSE,FALSE,$10) RETURNING id`,
        [scoreId, b.targetId, b.cycleId, null, b.metricCode, b.item, 'excel_monthly_backfill', JSON.stringify(detail), b.score, '【补录】历史Excel月度考核对齐']
      );
      console.log('插入 id='+r.rows[0].id+' target='+b.targetId+' cycle='+b.cycleId+' ['+b.category+'] '+b.score+'分');
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); console.log('ERR', e.message); process.exit(1); }
  finally { client.release(); }

  // 重算 5 个 target 的 score_auto/score_total
  for (const b of BACKFILL) {
    const res = await engine.recalculateTarget(b.cycleId, b.targetId);
    console.log('recalc target='+b.targetId+' →', JSON.stringify(res && { ok:res.ok, reason:res.reason, scoreAuto:res.scoreAuto, scoreTotal:res.scoreTotal, totalDeduction:res.totalDeduction }));
  }

  // 验证
  console.log('\n===== 验证：补录行 + 得分 =====');
  const v = await q(`SELECT d.target_id, t.employee_name, t.score_total, t.score_auto,
     d.source_detail->>'category' AS cat, d.suggested_score, d.review_status, d.is_deleted
     FROM hse_assessment_deduction d JOIN hse_assessment_target t ON t.id=d.target_id
     WHERE d.source_table='excel_monthly_backfill' ORDER BY d.target_id`);
  for (const x of v) console.log(' '+x.employee_name+' ['+x.cat+'] 扣'+x.suggested_score+' 现总分='+x.score_total+' score_auto='+x.score_auto);
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});