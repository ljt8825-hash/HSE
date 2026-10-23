process.env.NODE_ENV = 'development';
const { pool } = require('./config/db');
async function main() {
  // grid_areas id=46 的责任管理员
  try {
    const g = await pool.query(`SELECT * FROM grid_areas WHERE id=46`);
    console.log('== grid_areas id=46 ==');
    console.log(JSON.stringify(g.rows[0], null, 2));
  } catch(e){ console.log('grid_areas 查询失败:', e.message); }

  // 该地区是否有责任管理员 employee 关联字段
  try {
    const col = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='grid_areas' ORDER BY ordinal_position`);
    console.log('\ngrid_areas 列:', col.rows.map(r=>r.column_name).join(', '));
  } catch(e){ console.log('列查询失败:', e.message); }

  // 占先洪在 c43 目标的 employee_id & 网格关联
  const z = await pool.query(
    `SELECT t.id AS target_id, t.employee_id, t.employee_name, t.position, t.township
       FROM hse_assessment_target t WHERE t.cycle_id=43 AND t.employee_name='占先洪' AND t.is_deleted=FALSE`);
  console.log('\n== 占先洪 c43 考核目标 ==');
  console.log(JSON.stringify(z.rows, null, 2));
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});