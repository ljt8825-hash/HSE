/**
 * 修复position_id=1398的岗位映射
 */

const { pool } = require('./config/db');

const fix = async () => {
  try {
    // 检查1398是否已有映射
    const exists = await pool.query('SELECT id FROM position_risk_mapping WHERE position_id = 1398');
    if (exists.rows.length === 0) {
      await pool.query(
        "INSERT INTO position_risk_mapping (position_id, position_name, risk_category, is_active) VALUES (1398, '垃圾收运车驾驶员', 'driver', true)"
      );
      console.log('✓ 新增映射: position_id=1398, 垃圾收运车驾驶员 -> driver');
    } else {
      console.log('✗ 已存在映射: position_id=1398');
    }

    // 验证结果
    const result = await pool.query(
      "SELECT position_id, position_name, risk_category FROM position_risk_mapping WHERE position_name = '垃圾收运车驾驶员'"
    );
    console.log('\n垃圾收运车驾驶员的所有映射:');
    result.rows.forEach(row => {
      console.log(`  position_id=${row.position_id}, category=${row.risk_category}`);
    });

    pool.end();
  } catch (e) {
    console.error('修复失败:', e.message);
    pool.end();
    process.exit(1);
  }
};

fix();
