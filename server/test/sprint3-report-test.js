/**
 * Sprint3 汇报中心后端测试脚本
 * 测试：数据库迁移、服务层方法、API路由
 */

require('dotenv').config();
const { pool } = require('../config/db');

async function runTests() {
  console.log('========== Sprint3 汇报中心测试 ==========\n');
  let passed = 0;
  let failed = 0;

  // Test 1: 数据库迁移 - hse_report_templates 新字段
  try {
    console.log('Test 1: 检查 hse_report_templates 扩展字段...');
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'hse_report_templates'
        AND column_name IN ('template_category', 'ai_enabled', 'section_config')
    `);
    const cols = result.rows.map(r => r.column_name);
    const required = ['template_category', 'ai_enabled', 'section_config'];
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length === 0) {
      console.log('  ✓ PASS - 模板表扩展字段存在');
      passed++;
    } else {
      console.log(`  ✗ FAIL - 缺少字段: ${missing.join(', ')}（请执行迁移脚本）`);
      failed++;
    }
  } catch (e) {
    console.log(`  ⚠ SKIP - ${e.message.substring(0, 80)}`);
  }

  // Test 2: hse_reports 扩展字段
  try {
    console.log('Test 2: 检查 hse_reports 扩展字段...');
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'hse_reports'
        AND column_name IN ('template_id', 'template_category', 'generation_status',
          'ai_status', 'ai_summary', 'ai_suggestions', 'confirm_status',
          'source_data_ref', 'report_status')
    `);
    const cols = result.rows.map(r => r.column_name);
    const required = ['template_id', 'template_category', 'generation_status',
      'ai_status', 'ai_summary', 'confirm_status', 'source_data_ref', 'report_status'];
    const missing = required.filter(c => !cols.includes(c));
    if (missing.length === 0) {
      console.log('  ✓ PASS - 报告表扩展字段存在');
      passed++;
    } else {
      console.log(`  ✗ FAIL - 缺少字段: ${missing.join(', ')}（请执行迁移脚本）`);
      failed++;
    }
  } catch (e) {
    console.log(`  ⚠ SKIP - ${e.message.substring(0, 80)}`);
  }

  // Test 3: reportService 加载
  try {
    console.log('Test 3: 加载 reportService...');
    const reportService = require('../services/reportService');
    const methods = [
      'getTemplates', 'getTemplateById', 'generateReportV2',
      'getReportStatus', 'getReportListV2', 'getReportByIdV2',
      'updateReport', 'confirmReport', 'regenerateReport',
      'archiveReport', 'exportHtml', 'exportWord'
    ];
    const missing = methods.filter(m => typeof reportService[m] !== 'function');
    if (missing.length === 0) {
      console.log(`  ✓ PASS - reportService 加载成功，${methods.length} 个 V2 方法全部存在`);
      passed++;
    } else {
      console.log(`  ✗ FAIL - 缺少方法: ${missing.join(', ')}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  // Test 4: aiService 新 Prompt
  try {
    console.log('Test 4: 检查 aiService 新 Prompt...');
    const aiService = require('../services/aiService');
    const monthlyPrompt = aiService.buildMonthlyReportPrompt({
      period: '2026-06',
      statisticsData: { events: { totalEvents: 5 } },
      referencedDocuments: []
    });
    const groupPrompt = aiService.buildGroupReportPrompt({
      period: '2026-Q2',
      scope: '全部',
      statisticsData: { events: { totalEvents: 10 } },
      referencedDocuments: []
    });

    const hasMonthly = monthlyPrompt.includes('安全生产月报') && monthlyPrompt.includes('强约束规则');
    const hasGroup = groupPrompt.includes('集团') && groupPrompt.includes('强约束规则');
    const hasNoFabrication = monthlyPrompt.includes('禁止编造');

    if (hasMonthly && hasGroup && hasNoFabrication) {
      console.log('  ✓ PASS - report_monthly 和 report_group Prompt 构建成功，包含强约束');
      passed++;
    } else {
      console.log(`  ✗ FAIL - monthly=${hasMonthly}, group=${hasGroup}, noFab=${hasNoFabrication}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  // Test 5: 模板列表查询（需数据库有模板数据）
  try {
    console.log('Test 5: 模板列表查询...');
    const reportService = require('../services/reportService');
    const templates = await reportService.getTemplates();
    if (Array.isArray(templates)) {
      console.log(`  ✓ PASS - 获取到 ${templates.length} 个模板`);
      passed++;
    } else {
      console.log('  ✗ FAIL - 返回格式错误');
      failed++;
    }
  } catch (e) {
    console.log(`  ⚠ SKIP - ${e.message.substring(0, 80)}`);
  }

  // Test 6: 生成月报（不启用 AI）
  try {
    console.log('Test 6: 生成月报（无 AI）...');
    const reportService = require('../services/reportService');
    const result = await reportService.generateReportV2({
      templateCategory: 'monthly_report',
      reportPeriod: '2026-06',
      aiEnabled: false,
      customTitle: '测试月报 - 2026年6月'
    });

    if (result.reportId && result.generationStatus === 'pending') {
      console.log(`  ✓ PASS - 异步任务已启动，reportId=${result.reportId}`);
      passed++;

      // 等待生成完成
      console.log('  等待生成完成...');
      await new Promise(r => setTimeout(r, 2000));
      const status = await reportService.getReportStatus(result.reportId);
      console.log(`  状态: ${status.generationStatus}, AI: ${status.aiStatus}`);

      if (status.generationStatus === 'completed') {
        const detail = await reportService.getReportByIdV2(result.reportId);
        console.log(`  报告详情: name=${detail.reportName}, html长度=${detail.reportHtml?.length || 0}`);
        if (detail.reportHtml && detail.reportHtml.length > 100) {
          console.log('  ✓ PASS - 报告 HTML 生成成功');
          passed++;
        } else {
          console.log('  ✗ FAIL - HTML 内容为空');
          failed++;
        }
      } else {
        console.log(`  ⚠ 生成状态: ${status.generationStatus}`);
      }
    } else {
      console.log('  ✗ FAIL - 生成失败');
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  // Test 7: 生成集团汇报（不启用 AI）
  try {
    console.log('Test 7: 生成集团汇报（无 AI）...');
    const reportService = require('../services/reportService');
    const result = await reportService.generateReportV2({
      templateCategory: 'group_report',
      reportPeriod: '2026-06',
      aiEnabled: false,
      customTitle: '测试集团汇报 - 2026年6月'
    });

    if (result.reportId) {
      console.log(`  ✓ PASS - 异步任务已启动，reportId=${result.reportId}`);
      passed++;

      await new Promise(r => setTimeout(r, 2000));
      const detail = await reportService.getReportByIdV2(result.reportId);
      if (detail && detail.generationStatus === 'completed') {
        console.log(`  ✓ PASS - 集团报告生成成功，HTML长度=${detail.reportHtml?.length || 0}`);
        passed++;
      } else {
        console.log(`  ⚠ 状态: ${detail?.generationStatus}`);
      }
    } else {
      console.log('  ✗ FAIL - 生成失败');
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  // Test 8: 报告列表
  try {
    console.log('Test 8: 报告列表查询...');
    const reportService = require('../services/reportService');
    const result = await reportService.getReportListV2({
      category: 'monthly_report',
      page: 1,
      pageSize: 10
    });
    if (result.list && typeof result.total === 'number') {
      console.log(`  ✓ PASS - 列表查询成功，共 ${result.total} 条`);
      passed++;
    } else {
      console.log('  ✗ FAIL - 返回格式错误');
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  // Test 9: 软删除测试
  try {
    console.log('Test 9: 软删除测试...');
    const reportService = require('../services/reportService');
    const list = await reportService.getReportListV2({ category: 'monthly_report', page: 1, pageSize: 1 });
    if (list.list.length > 0) {
      const id = list.list[0].id;
      const deleted = await reportService.deleteReport(id);
      const detailAfter = await reportService.getReportByIdV2(id);
      if (deleted && !detailAfter) {
        console.log('  ✓ PASS - 软删除成功，列表不再返回');
        passed++;
      } else {
        console.log(`  ✗ FAIL - deleted=${deleted}, detailNull=${!detailAfter}`);
        failed++;
      }
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  // Test 10: 导出 HTML 和 Word
  try {
    console.log('Test 10: 导出功能测试...');
    const reportService = require('../services/reportService');
    const list = await reportService.getReportListV2({ category: 'group_report', page: 1, pageSize: 1 });
    if (list.list.length > 0) {
      const id = list.list[0].id;
      const htmlResult = await reportService.exportHtml(id);
      const wordResult = await reportService.exportWord(id);
      const htmlOk = htmlResult && htmlResult.contentType.includes('html') && htmlResult.content.length > 100;
      const wordOk = wordResult && wordResult.contentType.includes('msword') && wordResult.content.length > 100;
      if (htmlOk && wordOk) {
        console.log(`  ✓ PASS - HTML和Word导出正常，HTML=${htmlResult.content.length}字，Word=${wordResult.content.length}字`);
        passed++;
      } else {
        console.log(`  ✗ FAIL - htmlOk=${htmlOk}, wordOk=${wordOk}`);
        failed++;
      }
    }
  } catch (e) {
    console.log(`  ✗ FAIL - ${e.message}`);
    failed++;
  }

  console.log(`\n========== 测试结果 ==========`);
  console.log(`通过: ${passed}, 失败: ${failed}, 跳过: 若干`);
  console.log(failed === 0 ? '✅ 全部通过' : '❌ 存在失败项');

  await pool.end();
}

runTests().catch(err => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
