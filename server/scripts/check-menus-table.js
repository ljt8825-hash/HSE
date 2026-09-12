const { pool } = require('../config/db');

async function checkTable() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'menus'
      ORDER BY ordinal_position
    `);
    console.log('menus 表结构:');
    result.rows.forEach(col => console.log(`  ${col.column_name}: ${col.data_type}`));
    
    const sample = await pool.query('SELECT * FROM menus LIMIT 1');
    console.log('\n示例数据:');
    console.log(sample.rows[0]);
    
  } catch (err) {
    console.error('查询失败:', err.message);
    process.exit(1);
  }
}

checkTable();