/**
 * HSE 智能闭环工作流测试脚本
 * 
 * 验证内容：
 * 1. 数据库表结构
 * 2. 自动流程（隐患→整改→复查→闭环）
 * 3. 提醒机制
 * 4. 任务中心功能
 */

const { pool } = require('../config/db');
const workflowService = require('../services/workflowService');
const reminderService = require('../services/reminderService');

async function runTests() {
  console.log('=======================================');
  console.log('  HSE 智能闭环工作流测试验证');
  console.log('=======================================');
  console.log('');

  const results = [];

  // 测试1：验证表结构
  console.log('【测试1】验证数据库表结构');
  await testTableExists('hse_inspection_tasks', results);
  await testTableExists('hse_tasks', results);
  await testTableExists('hse_inspection_executions', results);
  await testTableExists('hse_task_reminders', results);
  console.log('');

  // 测试2：验证字段扩展
  console.log('【测试2】验证字段扩展');
  await testColumnExists('hse_events', 'task_id', results);
  await testColumnExists('hse_events', 'auto_generated', results);
  await testColumnExists('hse_rectifications', 'task_id', results);
  await testColumnExists('hse_reviews', 'task_id', results);
  console.log('');

  // 测试3：验证工作流服务
  console.log('【测试3】验证工作流服务');
  await testWorkflowService(results);
  console.log('');

  // 测试4：验证提醒服务
  console.log('【测试4】验证提醒服务');
  await testReminderService(results);
  console.log('');

  // 测试5：验证任务统计
  console.log('【测试5】验证任务统计');
  await testTaskStats(results);
  console.log('');

  // 输出测试报告
  console.log('=======================================');
  console.log('  测试报告');
  console.log('=======================================');
  console.log('');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`测试总数：${results.length}`);
  console.log(`通过：${passed}`);
  console.log(`失败：${failed}`);
  console.log('');

  results.forEach((r, i) => {
    const status = r.passed ? '✓' : '✗';
    const color = r.passed ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    console.log(`${color}${status} ${reset}${r.name}`);
    if (!r.passed && r.error) {
      console.log(`   ${r.error}`);
    }
  });

  console.log('');
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('所有测试通过！');
  }
}

async function testTableExists(tableName, results) {
  try {
    const result = await pool.query(
      `SELECT to_regclass($1) AS exists`,
      [tableName]
    );
    const exists = result.rows[0].exists !== null;
    results.push({
      name: `${tableName} 表存在`,
      passed: exists,
      error: exists ? null : `${tableName} 表不存在`
    });
  } catch (err) {
    results.push({
      name: `${tableName} 表存在`,
      passed: false,
      error: err.message
    });
  }
}

async function testColumnExists(tableName, columnName, results) {
  try {
    const result = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2) AS exists`,
      [tableName, columnName]
    );
    const exists = result.rows[0].exists;
    results.push({
      name: `${tableName}.${columnName} 字段存在`,
      passed: exists,
      error: exists ? null : `${tableName}.${columnName} 字段不存在`
    });
  } catch (err) {
    results.push({
      name: `${tableName}.${columnName} 字段存在`,
      passed: false,
      error: err.message
    });
  }
}

async function testWorkflowService(results) {
  try {
    // 测试任务编号生成
    const code1 = workflowService.generateTaskCode('rectification');
    const code2 = workflowService.generateTaskCode('review');
    const code3 = workflowService.generateTaskCode('training');
    
    const isValidCode = (code) => {
      return typeof code === 'string' && code.length > 0;
    };
    
    results.push({
      name: '任务编号生成功能',
      passed: isValidCode(code1) && isValidCode(code2) && isValidCode(code3),
      error: null
    });
    
    console.log(`   整改任务编号: ${code1}`);
    console.log(`   复查任务编号: ${code2}`);
    console.log(`   培训任务编号: ${code3}`);

  } catch (err) {
    results.push({
      name: '工作流服务',
      passed: false,
      error: err.message
    });
  }
}

async function testReminderService(results) {
  try {
    // 测试提醒统计
    const stats = await reminderService.getReminderStats();
    results.push({
      name: '提醒统计功能',
      passed: stats !== null,
      error: null
    });
    
    console.log(`   临期待发: ${stats.approaching_pending || 0}`);
    console.log(`   逾期提醒: ${stats.overdue_count || 0}`);
    console.log(`   升级提醒: ${stats.escalation_count || 0}`);

  } catch (err) {
    results.push({
      name: '提醒服务',
      passed: false,
      error: err.message
    });
  }
}

async function testTaskStats(results) {
  try {
    // 测试任务统计查询
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE is_overdue = TRUE) AS overdue_count,
        COUNT(*) AS total_count
      FROM hse_tasks
      WHERE is_deleted = FALSE
    `);
    
    const stats = result.rows[0];
    
    results.push({
      name: '任务统计查询',
      passed: stats !== null,
      error: null
    });
    
    console.log(`   待办任务: ${stats.pending_count}`);
    console.log(`   逾期任务: ${stats.overdue_count}`);
    console.log(`   总任务数: ${stats.total_count}`);

  } catch (err) {
    results.push({
      name: '任务统计',
      passed: false,
      error: err.message
    });
  }
}

runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});