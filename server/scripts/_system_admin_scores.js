const { pool, testConnection } = require('../config/db');
async function q(sql, ...a) { const r = await pool.query(sql, a); return r.rows; }

// 类别 → 规则名映射（复制路由逻辑 resolveRuleForDeductionRows）
let ruleMapCache = null;
async function ruleCategoryMap() {
  if (ruleMapCache) return ruleMapCache;
  const rows = await q(`SELECT id, rule_name, category FROM hse_assessment_rule WHERE is_deleted = FALSE`);
  ruleMapCache = new Map(rows.map((r) => [r.rule_name, r.category]));
  return ruleMapCache;
}

(async () => {
  await testConnection();
  const ruleMap = await ruleCategoryMap();

  const CYCLES = [44,45,46,47,48,49,50,51,52,53]; // 2025-08..2026-07 实际
  // 但 id 顺序: 8,9,10,11,12,1,2,3,4,5
  const monthForId = {44:'2025-08',45:'2025-09',46:'2025-10',47:'2025-11',48:'2025-12',49:'2026-01',50:'2026-02',51:'2026-03',52:'2026-04',53:'2026-05'};

  // 预取各周期培训台账分(trainer_id→score)
  const ledgerRows = await q(`SELECT month, trainer_id, COALESCE(missing_count,0)+COALESCE(incomplete_count,0) AS score FROM hse_training_ledger_monthly`);

  for (const cid of CYCLES) {
    const m = monthForId[cid];
    const targets = await q(`SELECT id, employee_id, employee_name, position, township, score_total FROM hse_assessment_target WHERE cycle_id=$1 AND position='管理员' AND is_deleted=FALSE ORDER BY township, employee_name`, cid);
    if (!targets.length) { console.log('\n== ' + m + ' (cycle ' + cid + ') 管理员对象=0'); continue; }
    const ids = targets.map(t=>t.id);
    const ded = ids.length ? await q(`SELECT target_id, deduction_item, source_detail, suggested_score, confirmed_score, review_status
      FROM hse_assessment_deduction WHERE cycle_id=$1 AND target_id IN (${ids.join(',')}) AND is_deleted=FALSE
      AND review_status <> 'rejected' AND deduction_type IN ('auto','chain_transmission','auto_deduction')`, cid) : [];

    // 复制分类聚合
    const agg = {};
    for (const d of ded) {
      let ruleName = (d.source_detail && d.source_detail.ruleHit && d.source_detail.ruleHit.ruleName) || d.deduction_item;
      let category = ruleName ? ruleMap.get(ruleName) : null;
      if (!category && d.source_detail && d.source_detail.category) category = String(d.source_detail.category);
      if (!category) continue;
      const eff = (d.review_status==='approved'||d.review_status==='adjusted') ? (d.confirmed_score!=null?Number(d.confirmed_score):Number(d.suggested_score)) : Number(d.suggested_score);
      const rec = agg[d.target_id] || (agg[d.target_id]={});
      rec[category] = (rec[category]||0) + (eff||0);
    }
    // 培训台账覆盖 HSE教育培训
    const ledgerByMonth = ledgerRows.filter(r=>r.month===m);
    const scoreByEmp = new Map(ledgerByMonth.map(r=>[String(r.trainer_id), Number(r.score)]));

    console.log('\n== ' + m + ' (cycle ' + cid + ') 管理员对象=' + targets.length + ' ==');
    console.log('  姓名 | 乡镇 | 目标职责 | HSE教培 | 三违 | 否决项 | score_total');
    for (const t of targets) {
      const c = agg[t.id] || {};
      let hse = c['HSE教育培训'] != null ? c['HSE教育培训'] : null;
      const lv = scoreByEmp.get(String(t.employee_id));
      if (lv != null) hse = lv;
      console.log('  '+t.employee_name+' | '+t.township+' | '+(c['目标职责']??0)+' | '+(hse??'-')+' | '+(c['三违管理']??c['“三违”管理']??0)+' | '+(c['否决项']??0)+' | '+t.score_total);
    }
  }
  process.exit(0);
})().catch((e)=>{console.log('ERR',e.message);process.exit(1);});