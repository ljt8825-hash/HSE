/**
 * HSE 智能报告中心测试验证脚本
 * 
 * 测试内容：
 * 1. 数据库表结构验证
 * 2. 报告模板验证
 * 3. 月报生成测试
 * 4. 历史报告查询
 * 5. 报告详情查询
 */

const { pool } = require('../config/db');
const reportService = require('../services/reportService');

async function runTests() {
  console.log('');
  console.log('=======================================');
  console.log('  HSE 智能报告中心测试验证');
  console.log('=======================================');
  console.log('');

  const results = [];

  // 测试1：数据库表结构
  console.log('【测试1】数据库表结构');
  await testTableStructure(results);
  console.log('');

  // 测试2：报告模板
  console.log('【测试2】报告模板');
  await testReportTemplates(results);
  console.log('');

  // 测试3：月报生成
  console.log('【测试3】月报生成');
  await testMonthlyReportGeneration(results);
  console.log('');

  // 测试4：年报生成
  console.log('【测试4】年报生成');
  await testYearlyReportGeneration(results);
  console.log('');

  // 测试5：历史报告查询
  console.log('【测试5】历史报告查询');
  await testReportHistory(results);
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

  results.forEach(r => {
    if (r.passed) {
      console.log(`✓ ${r.name}`);
    } else {
      console.log(`✗ ${r.name}`);
    }
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

async function testTableStructure(results) {
  try {
    const tables = [
      'hse_report_templates',
      'hse_reports',
    ];

    for (const table of tables) {
      const result = await pool.query(`SELECT to_regclass($1) AS exists`, [table]);
      const exists = result.rows[0].exists !== null;
      results.push({
        name: `${table} 表存在`,
        passed: exists,
        error: exists ? null : `${table} 表不存在`
      });
    }

    const views = [
      'v_hse_monthly_report_summary',
      'v_hse_yearly_report_summary',
    ];

    for (const view of views) {
      const result = await pool.query(`SELECT to_regclass($1) AS exists`, [view]);
      const exists = result.rows[0].exists !== null;
      results.push({
        name: `${view} 视图存在`,
        passed: exists,
        error: exists ? null : `${view} 视图不存在`
      });
    }

  } catch (err) {
    results.push({
      name: '数据库表结构验证',
      passed: false,
      error: err.message
    });
  }
}

async function testReportTemplates(results) {
  try {
    const result = await pool.query(`SELECT * FROM hse_report_templates`);
    
    results.push({
      name: '报告模板查询',
      passed: result.rows.length > 0,
      error: result.rows.length > 0 ? null : '无模板数据'
    });

    console.log(`   模板总数: ${result.rows.length}`);
    result.rows.forEach(row => {
      console.log(`     - ${row.template_name} (${row.report_type})`);
    });

    // 验证月报模板存在
    const monthlyResult = await pool.query(
      `SELECT * FROM hse_report_templates WHERE report_type = 'monthly' AND status = 'active'`
    );
    results.push({
      name: '月报模板存在',
      passed: monthlyResult.rows.length > 0,
      error: monthlyResult.rows.length > 0 ? null : '月报模板不存在'
    });

  } catch (err) {
    results.push({
      name: '报告模板验证',
      passed: false,
      error: err.message
    });
    console.log(`   错误: ${err.message}`);
  }
}

async function testMonthlyReportGeneration(results) {
  try {
    const today = new Date();
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    const result = await reportService.generateReport({
      reportType: 'monthly',
      reportPeriod: period,
      generatedBy: 1
    });

    const isValid = result && result.id && result.reportHtml;

    results.push({
      name: '月报生成',
      passed: isValid,
      error: isValid ? null : '月报生成失败'
    });

    console.log(`   报告ID: ${result.id}`);
    console.log(`   报告名称: ${result.reportName}`);
    console.log(`   报告周期: ${result.reportPeriod}`);
    console.log(`   HTML长度: ${result.reportHtml.length} 字符`);

  } catch (err) {
    results.push({
      name: '月报生成',
      passed: false,
      error: err.message
    });
    console.log(`   错误: ${err.message}`);
  }
}

async function testYearlyReportGeneration(results) {
  try {
    const today = new Date();
    const period = `${today.getFullYear()}`;
    
    const result = await reportService.generateReport({
      reportType: 'yearly',
      reportPeriod: period,
      generatedBy: 1
    });

    const isValid = result && result.id && result.reportHtml;

    results.push({
      name: '年报生成',
      passed: isValid,
      error: isValid ? null : '年报生成失败'
    });

    console.log(`   报告ID: ${result.id}`);
    console.log(`   报告名称: ${result.reportName}`);
    console.log(`   报告周期: ${result.reportPeriod}`);

  } catch (err) {
    results.push({
      name: '年报生成',
      passed: false,
      error: err.message
    });
    console.log(`   错误: ${err.message}`);
  }
}

async function testReportHistory(results) {
  try {
    const result = await reportService.getReportHistory({
      page: 1,
      pageSize: 10
    });

    const isValid = result && Array.isArray(result.list);

    results.push({
      name: '历史报告查询',
      passed: isValid,
      error: isValid ? null : '历史报告查询失败'
    });

    console.log(`   报告总数: ${result.total}`);
    console.log(`   当前页记录数: ${result.list.length}`);

    if (result.list.length > 0) {
      console.log(`   最近报告: ${result.list[0].report_name}`);
    }

    // 测试获取报告详情
    if (result.list.length > 0) {
      const detail = await reportService.getReportById(result.list[0].id);
      results.push({
        name: '报告详情查询',
        passed: detail !== null,
        error: detail !== null ? null : '报告详情查询失败'
      });
    } else {
      results.push({
        name: '报告详情查询',
        passed: true,
        error: '暂无数据'
      });
    }

  } catch (err) {
    results.push({
      name: '历史报告查询',
      passed: false,
      error: err.message
    });
    console.log(`   错误: ${err.message}`);
  }
}

// 运行测试
runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});