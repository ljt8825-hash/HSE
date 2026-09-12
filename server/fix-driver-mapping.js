/**
 * 修复驾驶员岗位映射
 */

const { pool } = require('./config/db');

const fixDriverMapping = async () => {
  try {
    const drivers = await pool.query("SELECT id, name FROM position WHERE name LIKE '%驾驶员%' OR name LIKE '%司机%'");
    
    console.log('找到的驾驶员岗位:');
    drivers.rows.forEach(p => console.log(`  ID: ${p.id}, 名称: ${p.name}`));

    for (const pos of drivers.rows) {
      const existsById = await pool.query(
        "SELECT id FROM position_risk_mapping WHERE position_id = $1",
        [pos.id]
      );

      if (existsById.rows.length > 0) {
        console.log(`  ✗ 已存在映射(position_id): ${pos.name}`);
        continue;
      }

      const existsByName = await pool.query(
        "SELECT id FROM position_risk_mapping WHERE position_name = $1 AND risk_category = 'driver'",
        [pos.name]
      );

      if (existsByName.rows.length > 0) {
        console.log(`  ✗ 已存在映射(position_name): ${pos.name}`);
        continue;
      }

      await pool.query(
        "INSERT INTO position_risk_mapping (position_id, position_name, risk_category, is_active) VALUES ($1, $2, 'driver', true)",
        [pos.id, pos.name]
      );
      console.log(`  ✓ 新增映射: ${pos.name} -> driver`);
    }

    const result = await pool.query(
      "SELECT position_id, position_name, risk_category FROM position_risk_mapping WHERE risk_category = 'driver' ORDER BY position_name"
    );

    console.log('\n当前驾驶员映射:');
    result.rows.forEach(row => {
      console.log(`  ${row.position_name}: position_id=${row.position_id}`);
    });

    console.log('\n修复完成！');
    pool.end();
  } catch (e) {
    console.error('修复失败:', e.message);
    pool.end();
    process.exit(1);
  }
};

fixDriverMapping();
