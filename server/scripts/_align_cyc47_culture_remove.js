/**
 * B类修复：cyc47(2025-11) 乡镇作业中心经理 '安全文化建设' 扣分按项目约定"仅显示不计入总分"，
 * 但系统实际已计入导致总分比 Excel 低 10/20。软删这 5 条文化扣分记录使总分与 Excel 对齐。
 * （显示层从 hse_safety_culture_monthly 独立读取，不受软删影响。）
 */
const { pool, testConnection } = require('../config/db');
const engine = require('../services/assessmentScoringEngine');

const NAMES = ['张卫新', '王臣祥', '李振恒', '杨清华', '张华平'];
const CYCLE = 47; // 2025-11

(async () => {
  await testConnection();
  // 1) 定位 cyc47 这些人的有效 '安全文化建设' 扣分
  const rows = (await pool.query(`
    SELECT t.id AS target_id, t.employee_name, d.id AS ded_id, d.suggested_score
    FROM hse_assessment_deduction d
    JOIN hse_assessment_target t ON t.id = d.target_id
    WHERE t.cycle_id = $1 AND t.position = '乡镇作业中心经理'
      AND t.employee_name = ANY($2) AND d.source_detail->>'category' = '安全文化建设'
      AND d.is_deleted = FALSE
    ORDER BY t.employee_name, d.id
  `, [CYCLE, NAMES])).rows;
  console.log('待软删文化扣分:', rows.length);
  for (const r of rows) console.log(`  ${r.employee_name} ded${r.ded_id} 文化 ${r.suggested_score}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `UPDATE hse_assessment_deduction SET is_deleted = TRUE,
           remark = COALESCE(remark,'') || '【cyc47文化不计总分】扣除${r.suggested_score}分仅显示不计入(Excel对齐)',
           updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [r.ded_id]
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); console.error('ERR', e.message); process.exit(1); }
  finally { client.release(); }

  // 2) 重算
  for (const r of rows) {
    const res = await engine.recalculateTarget(CYCLE, r.target_id);
    console.log(`recalc ${r.employee_name} → scoreTotal=${res.scoreTotal}`);
  }

  // 3) 验证 vs Excel
  const EX = { 张卫新: 97, 王臣祥: 99, 李振恒: 67, 杨清华: 66, 张华平: 100 };
  for (const [n, e] of Object.entries(EX)) {
    const t = (await pool.query(`SELECT score_total FROM hse_assessment_target WHERE cycle_id=$1 AND employee_name=$2 AND position='乡镇作业中心经理'`,[CYCLE,n])).rows[0];
    const d = +(e - t.score_total).toFixed(2);
    console.log(`  ${n}: 系统${t.score_total} vs Excel${e} Δ${d} ${Math.abs(d)<=0.051?'✔':'✗'}`);
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });