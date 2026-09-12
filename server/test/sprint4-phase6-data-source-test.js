/**
 * Sprint4 Phase6 测试 - 数据源约束验证
 * 验证 _collectSelfAssessmentData 只读取 compliance_status != 'pending' 的记录
 *
 * 此脚本会:
 * 1. 创建一个测试评价任务
 * 2. 插入混合状态的明细（pending/compliant/non_compliant/missing）
 * 3. 调用 _collectSelfAssessmentData 验证返回结果
 * 4. 清理测试数据
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
  console.log('Phase6 数据源约束验证测试');
  console.log('========================================\n');

  let taskId = null;
  let clauseIds = [];

  try {
    // 1. 创建测试任务
    const taskRes = await pool.query(`
      INSERT INTO standard_evaluation_tasks
        (task_name, evaluation_period, total_clauses, task_status, ai_status, current_round, is_deleted)
      VALUES
        ('_test_phase6_数据源验证任务', '2026', 5, 'completed', 'completed', 1, FALSE)
      RETURNING id
    `);
    taskId = taskRes.rows[0].id;
    console.log(`创建测试任务 ID=${taskId}`);

    // 2. 创建测试条款
    for (let i = 1; i <= 5; i++) {
      const cRes = await pool.query(`
        INSERT INTO safety_standard_clauses
          (code, level, clause_title, clause_content, status, sort_order, is_deleted)
        VALUES
          ('_TEST_${i}', 3, '_测试条款_${i}', '_测试内容', 'active', ${i}, FALSE)
        RETURNING id
      `);
      clauseIds.push(cRes.rows[0].id);
    }

    // 3. 插入评价明细 - 混合状态
    //    2 条 pending, 1 条 compliant, 1 条 non_compliant, 1 条 missing
    const statuses = ['pending', 'pending', 'compliant', 'non_compliant', 'missing'];
    for (let i = 0; i < clauseIds.length; i++) {
      await pool.query(`
        INSERT INTO standard_evaluation_items
          (task_id, clause_id, evaluation_round, clause_code, clause_title,
           clause_content, compliance_status, ai_verdict, manual_remark, checked_by, checked_at, is_deleted)
        VALUES
          ($1, $2, 1, '_TEST_${i + 1}', '_测试条款', '_测试内容', $3, 'compliant',
           '人工备注_${i}', 1, NOW(), FALSE)
      `, [taskId, clauseIds[i], statuses[i]]);
    }

    console.log(`插入 5 条明细: 2 pending, 1 compliant, 1 non_compliant, 1 missing\n`);

    // 4. 调用 _collectSelfAssessmentData
    console.log('【验证 1】_collectSelfAssessmentData 数据源约束');
    const data = await reportService._collectSelfAssessmentData(taskId);

    // 统计验证
    const stats = data.statistics;
    console.log(`  统计: total=${stats.total}, confirmed=${stats.confirmed}, pending=${stats.pending}`);
    assert(stats.total === 5, '总条款数为 5');
    assert(stats.pending === 2, 'pending 条款数为 2');
    assert(stats.confirmed === 3, '已确认条款数为 3（5-2）');
    assert(stats.compliant === 1, 'compliant 条款数为 1');
    assert(stats.nonCompliant === 1, 'non_compliant 条款数为 1');
    assert(stats.missing === 1, 'missing 条款数为 1');

    // 验证: 返回的明细中不包含 pending
    const allItems = [
      ...data.compliantItems,
      ...data.partialItems,
      ...data.nonCompliantItems,
      ...data.missingItems,
    ];
    console.log(`  返回条款数: ${allItems.length}（应为 3，排除 2 条 pending）`);
    assert(allItems.length === 3, '返回条款数为 3（排除 pending）');

    const hasPending = allItems.some(item => item.complianceStatus === 'pending');
    assert(!hasPending, '返回明细中不包含 pending 状态');

    // 验证: 返回对象不包含 ai_verdict 字段
    const hasAiVerdict = allItems.some(item =>
      'aiVerdict' in item || 'ai_verdict' in item || 'ai_check_result' in item
    );
    assert(!hasAiVerdict, '返回对象不包含 ai_verdict 等 AI 字段');

    // 验证: 人工确认记录也不包含 ai_verdict
    const confirmHasAi = data.confirmationRecords.some(r =>
      'aiVerdict' in r || 'ai_verdict' in r
    );
    assert(!confirmHasAi, '人工确认记录不包含 ai_verdict');

    // 验证: 人工确认记录数量等于已确认条款数
    assert(
      data.confirmationRecords.length === 3,
      '人工确认记录数为 3（等于已确认条款数）'
    );

    // 5. 测试 HTML 生成
    console.log('\n【验证 2】生成 HTML 不读取 AI 结果');
    const html = reportService._generateSelfAssessmentHtml({
      templateCategory: 'self_assessment',
      enterprise: {},
      task: data.task,
      statistics: data.statistics,
      compliantItems: data.compliantItems,
      partialItems: data.partialItems,
      nonCompliantItems: data.nonCompliantItems,
      missingItems: data.missingItems,
      confirmationRecords: data.confirmationRecords,
      ai: { summary: null, suggestions: [] }
    });

    assert(html.includes('不合规'), 'HTML 包含不合规条款');
    assert(html.includes('资料缺失'), 'HTML 包含资料缺项');
    assert(!html.includes('ai_verdict'), 'HTML 不包含 ai_verdict 字段名');
    assert(html.includes('compliance_status'), 'HTML 声明数据来源为 compliance_status');
    assert(html.includes('不构成达标'), 'HTML 包含免责声明');

  } finally {
    // 清理
    console.log('\n【清理】删除测试数据');
    if (taskId) {
      await pool.query(`DELETE FROM standard_evaluation_items WHERE task_id = $1`, [taskId]);
      await pool.query(`DELETE FROM standard_evaluation_tasks WHERE id = $1`, [taskId]);
      console.log(`  已删除任务 ID=${taskId} 及其明细`);
    }
    for (const cid of clauseIds) {
      await pool.query(`DELETE FROM safety_standard_clauses WHERE id = $1`, [cid]);
    }
    console.log(`  已删除 ${clauseIds.length} 条测试条款`);
  }

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
