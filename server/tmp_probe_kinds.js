/* 只读核实：各扣分 kind 的 source_table 分布，判断能否定位到网格台账。运行后删 */
process.env.PORT = process.env.PORT || '5989';
const { pool } = require('./config/db');
async function main() {
  const kinds = ['grid_unchecked_monthly', 'violation_event', 'violation_unrectified'];
  const q = await pool.query(
    `SELECT source_detail->>'kind' kind, source_table, count(*) n
       FROM hse_assessment_deduction
      WHERE source_detail->>'kind' = ANY($1::text[]) AND is_deleted = FALSE
      GROUP BY 1,2 ORDER BY 1,2`, [kinds]
  );
  console.log('== hse_assessment_deduction 各 kind 的 source_table 分布 ==');
  for (const r of q.rows) console.log(`  ${r.kind.padEnd(26)} | source_table=${String(r.source_table).padEnd(22)} | ${r.n}`);

  // 采样：三违信息填报其中几条的 source_detail 与 source_id 具体形态
  const s = await pool.query(
    `SELECT id, deduction_item, source_table, source_id, source_detail
       FROM hse_assessment_deduction
      WHERE source_detail->>'kind' = 'violation_unrectified' AND is_deleted = FALSE
      ORDER BY id DESC LIMIT 3`
  );
  console.log('\n== 三违信息填报(violation_unrectified) 采样 ==');
  for (const r of s.rows) console.log(`  id=${r.id} item='${r.deduction_item}' srcTable='${r.source_table}' srcId='${r.source_id}' detail=${JSON.stringify(r.source_detail)}`);

  // 公司查处扣分来源表
  console.log('\n== 公司查处/驾驶员 相关表是否存在 ==');
  const t = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN
      ('hse_deduction_company','company_inspection_records','hse_company_deduction','driver_three_violation','driver_monthly')
     ORDER BY table_name`);
  console.log('  现存表:', t.rows.map(x=>x.table_name).join(', '));
  await pool.end();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });