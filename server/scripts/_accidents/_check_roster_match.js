// 快速查事故关联人 → 花名册映射
const { pool } = require('../../config/db');
(async () => {
  const names = ['李春冬', '田青槐', '孙万龙', '李万林', '张万通', '苏盼建', '刘保祥', '孙建永', '王朋齐', '杜东明', '王春艳', '李士珍', '张保法', '王丙海', '杨玉川'];
  for (const n of names) {
    const r = await pool.query(
      `SELECT v.name, v.position_name, v.unit_name, v.org_name, ea.dept_name
       FROM v_employee_current v
       LEFT JOIN employee_assignment ea ON ea.id = v.assignment_id
       WHERE v.name = $1 AND v.is_current = true
         AND (v.employee_deleted = false OR v.employee_deleted IS NULL)`,
      [n],
    );
    if (r.rows[0]) {
      const u = r.rows[0];
      console.log(`${n} → ${u.position_name || '-'} | dept=${u.dept_name || '-'} | unit=${u.unit_name || '-'} | org=${u.org_name || '-'}`);
    } else {
      console.log(`${n} → NOT IN ROSTER`);
    }
  }

  // 再统计 48 行里仍 party_dept 为空的，按当事人姓名查花名册命中情况
  const empties = await pool.query(`
    SELECT id, involved_person, location
    FROM accidents
    WHERE is_deleted = false
      AND (party_dept IS NULL OR party_dept = '')
    ORDER BY id`);
  console.log('--- 空 party_dept 的 38 行 ---');
  let hit = 0, miss = 0;
  for (const r of empties.rows) {
    const m = await pool.query(
      `SELECT v.position_name, ea.dept_name
       FROM v_employee_current v
       LEFT JOIN employee_assignment ea ON ea.id = v.assignment_id
       WHERE v.name = $1 AND v.is_current = true
         AND (v.employee_deleted = false OR v.employee_deleted IS NULL)
       LIMIT 1`,
      [r.involved_person],
    );
    const ok = m.rows.length > 0;
    if (ok) hit++; else miss++;
    if (!ok) console.log(`  id=${r.id} ${r.involved_person} → NOT IN ROSTER`);
  }
  console.log(`命中花名册=${hit} 未命中=${miss}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
