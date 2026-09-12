/**
 * Sprint4 Phase6 测试脚本
 * 验证:
 * 1. 报告不能读取 AI 未确认结果（compliance_status='pending' 不进入报告）
 * 2. pending 不会进入报告
 * 3. self_assessment 正常生成
 * 4. hse_reports 正常保存
 *
 * 运行: node test/sprint4-phase6-test.js
 */

const { pool } = require('../config/db');
const reportService = require('../services/reportService');

let passCount = 0;
let failCount = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passCount++;
  } else {
    console.log(`  ❌ ${msg}`);
    failCount++;
  }
}

async function test() {
  console.log('\n========================================');
  console.log('Sprint4 Phase6 测试开始');
  console.log('========================================\n');

  // --------------------------------------------------
  // 测试 1: 数据库迁移验证
  // --------------------------------------------------
  console.log('【测试 1】数据库迁移验证 - template_category 含 self_assessment');

  const tcRes = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'hse_report_templates_template_category_check'
    ) as constraint_exists
  `);
  assert(tcRes.rows[0].constraint_exists, 'hse_report_templates CHECK 约束存在');

  // 验证可以插入 self_assessment
  try {
    await pool.query(`
      INSERT INTO hse_report_templates
        (template_name, report_type, template_category, content_config, status)
      VALUES
        ('_test_self_assessment_template', 'monthly', 'self_assessment', '{}'::jsonb, 'inactive')
      ON CONFLICT DO NOTHING
    `);
    const verifyRes = await pool.query(`
      SELECT template_category FROM hse_report_templates
      WHERE template_name = '_test_self_assessment_template'
    `);
    assert(
      verifyRes.rows.length > 0 && verifyRes.rows[0].template_category === 'self_assessment',
      '可插入 template_category=self_assessment 记录'
    );
    // 清理
    await pool.query(`DELETE FROM hse_report_templates WHERE template_name = '_test_self_assessment_template'`);
  } catch (err) {
    assert(false, `插入 self_assessment 模板失败: ${err.message}`);
  }

  // 验证预置模板存在
  const templateRes = await pool.query(`
    SELECT id FROM hse_report_templates
    WHERE template_category = 'self_assessment' AND status = 'active'
  `);
  assert(templateRes.rows.length > 0, '预置自评报告模板已存在');

  // --------------------------------------------------
  // 测试 2: hse_reports 可保存 self_assessment 类型
  // --------------------------------------------------
  console.log('\n【测试 2】hse_reports 可保存 self_assessment 类型');

  let testReportId = null;
  try {
    const insertRes = await pool.query(`
      INSERT INTO hse_reports
        (report_name, report_type, report_period, report_date, report_data, report_html,
         template_category, generation_status, ai_status, confirm_status, report_status)
      VALUES
        ('_test_self_assessment_report', 'monthly', 'self-test-0001', NOW(), '{}'::jsonb, '',
         'self_assessment', 'completed', 'none', 'unconfirmed', 'active')
      RETURNING id
    `);
    testReportId = insertRes.rows[0].id;
    assert(true, 'hse_reports 可保存 template_category=self_assessment 记录');

    const verifyRes = await pool.query(`
      SELECT template_category, generation_status FROM hse_reports WHERE id = $1
    `, [testReportId]);
    assert(
      verifyRes.rows[0].template_category === 'self_assessment' &&
      verifyRes.rows[0].generation_status === 'completed',
      '保存后字段正确：template_category=self_assessment, generation_status=completed'
    );
  } catch (err) {
    assert(false, `保存 self_assessment 报告失败: ${err.message}`);
  }

  // --------------------------------------------------
  // 测试 3: _collectSelfAssessmentData 只读取 compliance_status != 'pending'
  // --------------------------------------------------
  console.log('\n【测试 3】_collectSelfAssessmentData 数据源约束验证');

  // 找一个真实存在的评价任务，如果没有则跳过
  const taskRes = await pool.query(`
    SELECT id, task_name FROM standard_evaluation_tasks
    WHERE is_deleted = FALSE ORDER BY id DESC LIMIT 1
  `);

  if (taskRes.rows.length === 0) {
    console.log('  ⚠️ 没有找到评价任务，跳过此测试（需要先创建评价任务）');
  } else {
    const taskId = taskRes.rows[0].id;
    console.log(`  使用任务 ID=${taskId}（${taskRes.rows[0].task_name}）`);

    const data = await reportService._collectSelfAssessmentData(taskId);

    // 验证: 返回的数据中不包含 pending 状态的条款
    const allItems = [
      ...data.compliantItems,
      ...data.partialItems,
      ...data.nonCompliantItems,
      ...data.missingItems,
    ];
    const hasPending = allItems.some(item => item.complianceStatus === 'pending');
    assert(!hasPending, '返回的条款明细中不包含 compliance_status=pending 的记录');

    // 验证: 统计 pending 数量正确
    const stats = data.statistics;
    console.log(`  统计: total=${stats.total}, confirmed=${stats.confirmed}, pending=${stats.pending}`);
    assert(stats.total === stats.confirmed + stats.pending, '统计一致性: total = confirmed + pending');

    // 验证: 返回对象不包含 ai_verdict 字段
    const hasAiVerdict = allItems.some(item => 'aiVerdict' in item || 'ai_verdict' in item);
    assert(!hasAiVerdict, '返回对象不包含 ai_verdict 字段（禁止读取 AI 判定）');

    // 验证: 人工确认记录也不包含 ai_verdict
    const confirmHasAi = data.confirmationRecords.some(r => 'aiVerdict' in r || 'ai_verdict' in r);
    assert(!confirmHasAi, '人工确认记录不包含 ai_verdict 字段');
  }

  // --------------------------------------------------
  // 测试 4: 生成 HTML 不包含达标结论
  // --------------------------------------------------
  console.log('\n【测试 4】生成的 HTML 不包含达标/不达标结论');

  const mockReportData = {
    templateCategory: 'self_assessment',
    enterprise: { enterpriseName: '测试企业', creditCode: '91110000XXXX', industryType: '环卫服务' },
    task: {
      id: 1,
      taskName: '2026年度自评',
      evaluationPeriod: '2026',
      currentRound: 1,
      totalClauses: 10,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    },
    statistics: { total: 10, confirmed: 8, pending: 2, compliant: 5, partial: 2, nonCompliant: 1, missing: 0 },
    compliantItems: [],
    partialItems: [],
    nonCompliantItems: [],
    missingItems: [],
    confirmationRecords: [],
    ai: { summary: null, suggestions: [] }
  };

  const html = reportService._generateSelfAssessmentHtml(mockReportData);

  assert(html.includes('安全生产标准化自评报告'), 'HTML 包含报告标题');
  assert(html.includes('企业安全管理基本信息'), 'HTML 包含企业信息章节');
  assert(html.includes('人工确认记录'), 'HTML 包含人工确认记录章节');
  assert(html.includes('不构成达标/不达标最终结论'), 'HTML 包含免责声明');
  assert(!html.includes('达标') || html.includes('不构成达标'), 'HTML 不直接给出"达标"结论');
  assert(!html.includes('不达标') || html.includes('不构成达标/不达标'), 'HTML 不直接给出"不达标"结论');
  assert(!html.includes('最终等级'), 'HTML 不包含"最终等级"字段');
  assert(html.includes('compliance_status'), 'HTML 声明数据来源为 compliance_status');
  assert(!html.includes('ai_verdict'), 'HTML 不引用 ai_verdict');

  // --------------------------------------------------
  // 测试 5: _complianceStatusLabel 标签正确
  // --------------------------------------------------
  console.log('\n【测试 5】_complianceStatusLabel 中文标签');

  assert(reportService._complianceStatusLabel('compliant') === '合规', 'compliant → 合规');
  assert(reportService._complianceStatusLabel('partial') === '部分合规', 'partial → 部分合规');
  assert(reportService._complianceStatusLabel('non_compliant') === '不合规', 'non_compliant → 不合规');
  assert(reportService._complianceStatusLabel('missing') === '资料缺失', 'missing → 资料缺失');
  assert(reportService._complianceStatusLabel('pending') === '待确认', 'pending → 待确认');

  // --------------------------------------------------
  // 测试 6: 路由映射扩展正确
  // --------------------------------------------------
  console.log('\n【测试 6】分类映射扩展正确');

  assert(
    reportService._categoryToReportType('self_assessment') === 'monthly',
    'self_assessment → monthly report_type'
  );
  assert(
    reportService._getDefaultReportName('self_assessment', '2026') === '安全生产标准化自评报告 - 2026',
    'self_assessment 默认报告名正确'
  );
  assert(
    Array.isArray(reportService._categoryToKeywords('self_assessment')) &&
      reportService._categoryToKeywords('self_assessment').length === 0,
    'self_assessment 关键词为空数组（不基于关键词检索）'
  );

  // --------------------------------------------------
  // 清理测试数据
  // --------------------------------------------------
  console.log('\n【清理】删除测试报告记录');
  if (testReportId) {
    await pool.query(`DELETE FROM hse_reports WHERE id = $1`, [testReportId]);
    console.log(`  已删除测试报告 ID=${testReportId}`);
  }

  // --------------------------------------------------
  // 汇总
  // --------------------------------------------------
  console.log('\n========================================');
  console.log(`测试完成: ✅ 通过 ${passCount} 项, ❌ 失败 ${failCount} 项`);
  console.log('========================================\n');

  await pool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

test().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
