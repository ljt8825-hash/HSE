/**
 * 检查数据库表结构
 */

const { pool } = require('../config/db');

async function checkTables() {
  console.log('=======================================');
  console.log('  数据库表结构检查');
  console.log('=======================================');
  console.log('');

  try {
    // 检查所有表
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('已存在的表：');
    result.rows.forEach(row => {
      console.log(`  ${row.table_name}`);
    });

    console.log('');
    console.log(`共计：${result.rows.length} 张表`);

    // 检查特定表
    const targetTables = [
      'hse_events',
      'hse_event_links',
      'hse_event_timeline',
      'hse_risk_factors',
      'hse_control_measures',
      'hse_rectifications',
      'hse_reviews',
      'risk_sources',
      'departments'
    ];

    console.log('');
    console.log('目标表检查：');
    for (const table of targetTables) {
      const existsResult = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS exists`,
        [table]
      );
      const exists = existsResult.rows[0].exists;
      console.log(`  ${table}: ${exists ? '✓ 存在' : '✗ 不存在'}`);
    }

  } catch (err) {
    console.error('检查失败:', err.message);
  }
}

checkTables();