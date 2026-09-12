const { pool, testConnection } = require('../config/db');
async function main() {
  await testConnection();
  const cycleId = 28;
  const targetIds = [605,621,626,630,638,642];
  // 复制 getRuleCategoryMap
  const mapRows = await pool.query(
    `SELECT id, rule_name, category FROM hse_assessment_rule WHERE is_deleted = FALSE`
  );
  const catMap = {};
  for (const r of mapRows.rows) catMap[r.rule_name] = { category: r.category, ruleId: r.id };

  const ded = await pool.query(
    `SELECT id, target_id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
     FROM hse_assessment_deduction
     WHERE cycle_id = $1 AND target_id = ANY($2::bigint[]) AND is_deleted = FALSE
       AND review_status <> 'rejected'
       AND deduction_type IN ('auto','chain_transmission','auto_deduction')`,
    [cycleId, targetIds]
  );
  console.log('命中扣分行数:', ded.rows.length);
  const agg = {};
  for (const d of ded.rows) {
    let ruleName = null;
    if (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) ruleName = String(d.source_detail.ruleHit.ruleName);
    if (!ruleName && d.deduction_item) ruleName = String(d.deduction_item);
    let category = null;
    if (ruleName && catMap[ruleName]) category = catMap[ruleName].category;
    const eff = (d.review_status === 'approved' || d.review_status === 'adjusted')
      ? (d.confirmed_score != null ? Number(d.confirmed_score) : Number(d.suggested_score))
      : Number(d.suggested_score);
    console.log(`  target=${d.target_id} item=${d.deduction_item} resolvedRuleName=${ruleName} category=${category} eff=${eff}`);
    if (!category) continue;
    const key = d.target_id;
    if (!agg[key]) agg[key] = {};
    agg[key][category] = (agg[key][category] || 0) + (eff || 0);
  }
  console.log('\nagg =', JSON.stringify(agg));
  await pool.end();
}
main().catch((e)=>{console.error(e.message);process.exit(1);});