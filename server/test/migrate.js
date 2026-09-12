/**
 * HSE 闭环引擎 SQL迁移脚本
 * 使用Node.js执行，避免psql命令行问题
 */

const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function executeMigration() {
  console.log('=======================================');
  console.log('  HSE 闭环引擎 SQL迁移');
  console.log('=======================================');
  console.log('');

  try {
    // 读取SQL文件
    const sqlPath = path.join(__dirname, '../sql/hse_chain_v42_migration.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // 分割SQL语句
    const statements = sqlContent.split(';').filter(s => s.trim().length > 0);

    // 逐个执行
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt.startsWith('--') && !stmt.startsWith('/*')) {
        try {
          await pool.query(stmt);
          console.log(`✓ 执行语句 ${i + 1}: OK`);
        } catch (err) {
          console.log(`✗ 执行语句 ${i + 1}: ${err.message}`);
        }
      }
    }

    console.log('');
    console.log('迁移完成！');
    
    // 执行测试
    await runTests();

  } catch (err) {
    console.error('迁移失败:', err.message);
    process.exit(1);
  }
}

async function runTests() {
  console.log('');
  console.log('=======================================');
  console.log('  验证测试');
  console.log('=======================================');
  console.log('');

  const tests = [
    { name: 'hse_inspection_plans 表', query: "SELECT to_regclass('hse_inspection_plans')" },
    { name: 'hse_risk_objects 表', query: "SELECT to_regclass('hse_risk_objects')" },
    { name: 'hse_event_chain_view 视图', query: "SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'hse_event_chain_view')" },
    { name: 'hse_events.business_area', query: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'business_area')" },
    { name: 'hse_events.risk_level_snapshot', query: "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hse_events' AND column_name = 'risk_level_snapshot')" },
  ];

  for (const test of tests) {
    try {
      const result = await pool.query(test.query);
      const exists = result.rows[0].exists !== null && result.rows[0].exists !== false;
      console.log(`${exists ? '✓' : '✗'} ${test.name}: ${exists ? '存在' : '不存在'}`);
    } catch (err) {
      console.log(`✗ ${test.name}: ${err.message}`);
    }
  }
}

executeMigration();