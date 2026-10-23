process.env.NODE_ENV = 'development';
const { pool } = require('./config/db');
async function main() {
  // 1) rec#7748 这条记录的归属字段
  const r = await pool.query(
    `SELECT id, personnel_name, inspector_employee_id, grid_id, area_team, grid_level,
            violator_name, violator_dept, inspection_date
       FROM grid_inspection_records WHERE id = 7748`,
  );
  console.log('== rec#7748 ==');
  console.log(JSON.stringify(r.rows[0], null, 2));

  // 2) 该条 inspector 是否落进 hse_assessment_target（c43 管理员 占先洪）——按 employee_id 权威链
  const insEmp = r.rows[0]?.inspector_employee_id;
  if (insEmp) {
    const em = await pool.query(`SELECT id, employee_id, name, direct_supervisor, roster_department FROM employee WHERE id=$1`,[insEmp]);
    console.log('\n== inspector 员工主数据(employee.id='+insEmp+') ==');
    console.log(JSON.stringify(em.rows[0], null, 2));
    const tgt = await pool.query(
      `SELECT id, employee_id, employee_name, township, position FROM hse_assessment_target
        WHERE cycle_id=43 AND is_deleted=FALSE AND employee_id=$1`,[insEmp]);
    console.log('\n== 该 inspector 在 c43 的考核目标 ==');
    console.log(JSON.stringify(tgt.rows, null, 2));
  }

  // 3) 2026-09 全月 杜集 未按时整改相关记录（含 inspector）看归属形态
  const duji = await pool.query(
    `SELECT id, personnel_name, inspector_employee_id, violator_name, area_team
       FROM grid_inspection_records
      WHERE to_char(inspection_date,'YYYY-MM')='2026-09'
        AND trim(violation_behavior)<>'无三违行为'
        AND (rectified_photo IS NULL OR trim(rectified_photo)='' OR trim(rectified_photo) IN ('--','-','无'))
        AND (area_team LIKE '%杜集%' OR violator_dept IS NOT NULL AND violator_dept='')`,
  );
  console.log('\n== 2026-09 杜集 未整改相关记录 ==');
  for (const x of duji.rows) console.log(`  #${x.id} person=${x.personnel_name} inspEmp=${x.inspector_employee_id} violator="${x.violator_name}" area=${x.area_team}`);
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});