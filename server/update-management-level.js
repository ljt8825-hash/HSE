/**
 * 更新岗位风险映射表的management_level字段
 */

const { pool } = require('./config/db');

const updateManagementLevels = async () => {
  try {
    await pool.query("UPDATE position_risk_mapping SET management_level = 'high' WHERE position_name = '总经理'");
    await pool.query("UPDATE position_risk_mapping SET management_level = 'middle' WHERE position_name IN ('部门经理', '乡镇作业中心经理')");
    await pool.query("UPDATE position_risk_mapping SET management_level = 'frontline' WHERE position_name IN ('环卫作业中心片区长', '管理员', '网格长', '片区长')");
    await pool.query("UPDATE position_risk_mapping SET management_level = NULL WHERE risk_category != 'management'");
    
    const result = await pool.query('SELECT id, position_name, risk_category, management_level FROM position_risk_mapping WHERE is_active = true ORDER BY risk_category, management_level');
    console.log('更新结果:');
    result.rows.forEach(row => {
      console.log(`  ${row.position_name}: ${row.risk_category} - ${row.management_level || 'N/A'}`);
    });
    
    console.log('\n更新成功！');
    pool.end();
  } catch (e) {
    console.error('更新失败:', e.message);
    pool.end();
    process.exit(1);
  }
};

updateManagementLevels();
