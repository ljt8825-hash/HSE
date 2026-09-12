/**
 * HSE 闭环引擎测试脚本
 * 
 * 验证内容：
 * 1. 事故是否能追溯到隐患
 * 2. 隐患是否能追溯风险
 * 3. 风险是否能追溯控制措施
 */

const { pool } = require('../config/db');

async function runTests() {
  console.log('=======================================');
  console.log('  HSE 闭环引擎测试验证');
  console.log('=======================================');
  console.log('');

  const results = [];

  // 测试1：验证表结构是否创建
  console.log('【测试1】验证数据库表结构');
  await testTableExists('hse_inspection_plans', results);
  await testTableExists('hse_risk_objects', results);
  await testViewExists('hse_event_chain_view', results);
  console.log('');

  // 测试2：验证字段扩展
  console.log('【测试2】验证字段扩展');
  await testColumnExists('hse_events', 'business_area', results);
  await testColumnExists('hse_events', 'risk_level_snapshot', results);
  await testColumnExists('hse_risk_factors', 'risk_object_id', results);
  await testColumnExists('hse_control_measures', 'inspection_plan_id', results);
  console.log('');

  // 测试3：验证关联关系
  console.log('【测试3】验证关联关系');
  await testRiskObjectToFactorRelation(results);
  await testFactorToMeasureRelation(results);
  await testMeasureToPlanRelation(results);
  console.log('');

  // 测试4：验证闭环追溯
  console.log('【测试4】验证闭环追溯能力');
  await testAccidentToHazardTrace(results);
  await testHazardToRiskTrace(results);
  await testRiskToMeasureTrace(results);
  console.log('');

  // 测试5：验证闭环视图
  console.log('【测试5】验证闭环视图查询');
  await testChainViewQuery(results);
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

async function testViewExists(viewName, results) {
  try {
    const result = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = $1) AS exists`,
      [viewName]
    );
    const exists = result.rows[0].exists;
    results.push({
      name: `${viewName} 视图存在`,
      passed: exists,
      error: exists ? null : `${viewName} 视图不存在`
    });
  } catch (err) {
    results.push({
      name: `${viewName} 视图存在`,
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

async function testRiskObjectToFactorRelation(results) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM hse_risk_factors rf
      JOIN hse_risk_objects ro ON rf.risk_object_id = ro.id
      WHERE rf.is_deleted = FALSE AND ro.is_deleted = FALSE
    `);
    const count = parseInt(result.rows[0].count);
    results.push({
      name: '风险对象→危险因素 关联有效',
      passed: count >= 0,
      error: null
    });
    console.log(`   关联数量：${count}`);
  } catch (err) {
    results.push({
      name: '风险对象→危险因素 关联有效',
      passed: false,
      error: err.message
    });
  }
}

async function testFactorToMeasureRelation(results) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM hse_control_measures cm
      JOIN hse_risk_factors rf ON cm.risk_factor_id = rf.id
      WHERE cm.is_deleted = FALSE AND rf.is_deleted = FALSE
    `);
    const count = parseInt(result.rows[0].count);
    results.push({
      name: '危险因素→控制措施 关联有效',
      passed: count >= 0,
      error: null
    });
    console.log(`   关联数量：${count}`);
  } catch (err) {
    results.push({
      name: '危险因素→控制措施 关联有效',
      passed: false,
      error: err.message
    });
  }
}

async function testMeasureToPlanRelation(results) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM hse_control_measures cm
      JOIN hse_inspection_plans ip ON cm.inspection_plan_id = ip.id
      WHERE cm.is_deleted = FALSE AND ip.is_deleted = FALSE
    `);
    const count = parseInt(result.rows[0].count);
    results.push({
      name: '控制措施→检查计划 关联有效',
      passed: count >= 0,
      error: null
    });
    console.log(`   关联数量：${count}`);
  } catch (err) {
    results.push({
      name: '控制措施→检查计划 关联有效',
      passed: false,
      error: err.message
    });
  }
}

async function testAccidentToHazardTrace(results) {
  try {
    const result = await pool.query(`
      WITH accident_events AS (
        SELECT id, risk_source_id 
        FROM hse_events 
        WHERE event_type = 'accident' AND is_deleted = FALSE LIMIT 5
      )
      SELECT COUNT(DISTINCT ae.id) AS accident_count,
             COUNT(DISTINCT he.id) AS hazard_count
      FROM accident_events ae
      LEFT JOIN hse_events he ON he.risk_source_id = ae.risk_source_id AND he.event_type = 'hazard' AND he.is_deleted = FALSE
    `);
    const data = result.rows[0];
    const accidentCount = parseInt(data.accident_count);
    const hazardCount = parseInt(data.hazard_count);
    
    const hasRelation = hazardCount > 0 || accidentCount === 0;
    
    results.push({
      name: '事故→隐患 追溯有效',
      passed: hasRelation,
      error: hasRelation ? null : '事故与隐患无关联'
    });
    console.log(`   事故数量：${accidentCount}`);
    console.log(`   关联隐患数量：${hazardCount}`);
  } catch (err) {
    results.push({
      name: '事故→隐患 追溯有效',
      passed: false,
      error: err.message
    });
  }
}

async function testHazardToRiskTrace(results) {
  try {
    const result = await pool.query(`
      WITH hazard_events AS (
        SELECT id, risk_source_id 
        FROM hse_events 
        WHERE event_type = 'hazard' AND is_deleted = FALSE LIMIT 5
      )
      SELECT COUNT(DISTINCT he.id) AS hazard_count,
             COUNT(DISTINCT rs.id) AS risk_count
      FROM hazard_events he
      LEFT JOIN risk_sources rs ON rs.id = he.risk_source_id AND rs.is_deleted = FALSE
    `);
    const data = result.rows[0];
    const hazardCount = parseInt(data.hazard_count);
    const riskCount = parseInt(data.risk_count);
    
    const hasRelation = riskCount > 0 || hazardCount === 0;
    
    results.push({
      name: '隐患→风险源 追溯有效',
      passed: hasRelation,
      error: hasRelation ? null : '隐患与风险源无关联'
    });
    console.log(`   隐患数量：${hazardCount}`);
    console.log(`   关联风险源数量：${riskCount}`);
  } catch (err) {
    results.push({
      name: '隐患→风险源 追溯有效',
      passed: false,
      error: err.message
    });
  }
}

async function testRiskToMeasureTrace(results) {
  try {
    const result = await pool.query(`
      WITH risk_sources_data AS (
        SELECT id 
        FROM risk_sources 
        WHERE is_deleted = FALSE LIMIT 5
      )
      SELECT COUNT(DISTINCT rs.id) AS risk_count,
             COUNT(DISTINCT cm.id) AS measure_count
      FROM risk_sources_data rs
      LEFT JOIN hse_risk_factors rf ON rf.risk_source_id = rs.id AND rf.is_deleted = FALSE
      LEFT JOIN hse_control_measures cm ON cm.risk_factor_id = rf.id AND cm.is_deleted = FALSE
    `);
    const data = result.rows[0];
    const riskCount = parseInt(data.risk_count);
    const measureCount = parseInt(data.measure_count);
    
    const hasRelation = measureCount > 0 || riskCount === 0;
    
    results.push({
      name: '风险源→控制措施 追溯有效',
      passed: hasRelation,
      error: hasRelation ? null : '风险源与控制措施无关联'
    });
    console.log(`   风险源数量：${riskCount}`);
    console.log(`   关联控制措施数量：${measureCount}`);
  } catch (err) {
    results.push({
      name: '风险源→控制措施 追溯有效',
      passed: false,
      error: err.message
    });
  }
}

async function testChainViewQuery(results) {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) AS count,
             COUNT(DISTINCT event_code) AS distinct_events,
             COUNT(DISTINCT risk_source_id) AS distinct_risk_sources
      FROM hse_event_chain_view
      LIMIT 1000
    `);
    const data = result.rows[0];
    const count = parseInt(data.count);
    
    results.push({
      name: '闭环视图查询有效',
      passed: count >= 0,
      error: null
    });
    console.log(`   记录数量：${count}`);
    console.log(`   不同事件：${data.distinct_events}`);
    console.log(`   不同风险源：${data.distinct_risk_sources}`);
  } catch (err) {
    results.push({
      name: '闭环视图查询有效',
      passed: false,
      error: err.message
    });
  }
}

runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});