/**
 * HSE 安全数据分析中心测试脚本
 */

const { pool } = require('../config/db');
const statisticsService = require('../services/statisticsService');

async function runTests() {
  console.log('=======================================');
  console.log('  HSE 安全数据分析中心测试验证');
  console.log('=======================================');
  console.log('');

  const results = [];

  // 测试1：验证表结构
  console.log('【测试1】验证数据库表结构');
  await testTableExists('hse_statistics_daily', results);
  await testTableExists('hse_statistics_monthly', results);
  await testTableExists('hse_statistics_yearly', results);
  await testTableExists('hse_statistics_dept', results);
  await testTableExists('hse_statistics_person', results);
  console.log('');

  // 测试2：验证统计服务
  console.log('【测试2】验证统计服务');
  await testDailyStatsGeneration(results);
  console.log('');

  // 测试3：验证趋势数据
  console.log('【测试3】验证趋势数据');
  await testTrendData(results);
  console.log('');

  // 测试4：验证排名数据
  console.log('【测试4】验证排名数据');
  await testDepartmentRanking(results);
  await testPersonRanking(results);
  console.log('');

  // 测试5：验证安全概览
  console.log('【测试5】验证安全概览');
  await testOverview(results);
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

async function testDailyStatsGeneration(results) {
  try {
    const today = new Date();
    const stats = await statisticsService.generateDailyStats(today);
    
    const isValid = stats !== null && 
      stats.event_count !== undefined &&
      stats.hazard_count !== undefined &&
      stats.completion_rate !== undefined;
    
    results.push({
      name: '每日统计生成',
      passed: isValid,
      error: null
    });
    
    console.log(`   事件数: ${stats.event_count}`);
    console.log(`   隐患数: ${stats.hazard_count}`);
    console.log(`   完成率: ${stats.completion_rate}%`);

  } catch (err) {
    results.push({
      name: '每日统计生成',
      passed: false,
      error: err.message
    });
  }
}

async function testTrendData(results) {
  try {
    const weekly = await statisticsService.getTrendData('weekly', 7);
    const monthly = await statisticsService.getTrendData('monthly', 12);
    
    const isValid = Array.isArray(weekly) && Array.isArray(monthly);
    
    results.push({
      name: '趋势数据查询',
      passed: isValid,
      error: null
    });
    
    console.log(`   周趋势数据点: ${weekly.length}`);
    console.log(`   月趋势数据点: ${monthly.length}`);

  } catch (err) {
    results.push({
      name: '趋势数据查询',
      passed: false,
      error: err.message
    });
  }
}

async function testDepartmentRanking(results) {
  try {
    const ranking = await statisticsService.getDepartmentRanking('monthly');
    
    const isValid = Array.isArray(ranking);
    
    results.push({
      name: '部门排名查询',
      passed: isValid,
      error: null
    });
    
    console.log(`   排名部门数: ${ranking.length}`);
    if (ranking.length > 0) {
      console.log(`   第一名: ${ranking[0].department_name}`);
    }

  } catch (err) {
    results.push({
      name: '部门排名查询',
      passed: false,
      error: err.message
    });
  }
}

async function testPersonRanking(results) {
  try {
    const ranking = await statisticsService.getPersonRanking('monthly');
    
    const isValid = Array.isArray(ranking);
    
    results.push({
      name: '责任人排名查询',
      passed: isValid,
      error: null
    });
    
    console.log(`   排名人数: ${ranking.length}`);

  } catch (err) {
    results.push({
      name: '责任人排名查询',
      passed: false,
      error: err.message
    });
  }
}

async function testOverview(results) {
  try {
    const eventResult = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_events
      FROM hse_events
    `);
    const taskResult = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_tasks
      FROM hse_tasks
    `);
    const riskResult = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE is_deleted = FALSE) AS total_risks
      FROM risk_sources
    `);
    
    const isValid = eventResult.rows.length > 0 && taskResult.rows.length > 0 && riskResult.rows.length > 0;
    
    results.push({
      name: '安全概览统计',
      passed: isValid,
      error: null
    });
    
    console.log(`   事件总数: ${eventResult.rows[0].total_events}`);
    console.log(`   任务总数: ${taskResult.rows[0].total_tasks}`);
    console.log(`   风险总数: ${riskResult.rows[0].total_risks}`);

  } catch (err) {
    results.push({
      name: '安全概览统计',
      passed: false,
      error: err.message
    });
  }
}

runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});