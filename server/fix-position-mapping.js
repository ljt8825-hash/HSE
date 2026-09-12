/**
 * 修复岗位风险映射表的position_id关联
 */

const { pool } = require('./config/db');

const fixMapping = async () => {
  try {
    const positions = await pool.query(
      "SELECT id, name FROM position WHERE name IN ('总经理', '部门经理', '乡镇作业中心经理', '网格长', '环卫作业中心片区长', '吸污车驾驶员', '勾臂车司机')"
    );

    console.log('找到的岗位:');
    positions.rows.forEach(p => console.log(`  ID: ${p.id}, 名称: ${p.name}`));

    const updates = [];
    positions.rows.forEach(p => {
      updates.push(pool.query(
        "UPDATE position_risk_mapping SET position_id = $1 WHERE position_name = $2 AND position_id IS NULL",
        [p.id, p.name]
      ));
    });

    await Promise.all(updates);

    const result = await pool.query(
      "SELECT id, position_id, position_name, risk_category FROM position_risk_mapping WHERE is_active = true ORDER BY risk_category"
    );

    console.log('\n更新后的映射表:');
    result.rows.forEach(row => {
      console.log(`  ${row.position_name}: position_id=${row.position_id}, category=${row.risk_category}`);
    });

    console.log('\n修复完成！');
    pool.end();
  } catch (e) {
    console.error('修复失败:', e.message);
    pool.end();
    process.exit(1);
  }
};

fixMapping();
