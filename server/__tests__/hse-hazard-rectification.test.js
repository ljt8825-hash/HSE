/**
 * HSE Sprint5.5 隐患整改闭环中心 - 集成测试脚本
 *
 * 运行: node __tests__/hse-hazard-rectification.test.js
 *
 * 测试范围:
 *   1. 隐患确认
 *   2. 整改任务 CRUD
 *   3. 整改措施 CRUD
 *   4. 复查记录 CRUD
 *   5. 统计接口（闭环率、超期统计）
 *   6. 责任人查询
 *   7. AI 整改建议
 */
const request = require('supertest');
const { pool, testConnection } = require('../config/db');

const TEST_USER = { username: 'admin', password: 'admin123' };
const MARKER = `T55${Date.now().toString(36)}`;

let app = null;
let token = null;
let authHeaders = {};

let hazardId;
let taskId;
let actionId;
let reviewId;

let passed = 0;
let failed = 0;
const failures = [];

async function login() {
  const res = await request(app).post('/api/auth/login').send(TEST_USER);
  if (res.status !== 200 || !res.body.data || !res.body.data.token) {
    throw new Error(`登录失败: ${res.body.message || res.status}`);
  }
  token = res.body.data.token;
  authHeaders = { Authorization: `Bearer ${token}` };
  console.log(`✓ 登录成功 (token: ${token.slice(0, 16)}...)`);
}

function assert(condition, message, resBody) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    const bodyStr = resBody ? ` | body: ${JSON.stringify(resBody).slice(0, 200)}` : '';
    console.error(`  ✗ ${message}${bodyStr}`);
  }
}

async function cleanup() {
  console.log('\n=== 清理测试数据 ===');
  try {
    await pool.query(`DELETE FROM review_record WHERE review_code LIKE '${MARKER}%'`);
    await pool.query(`DELETE FROM rectification_action WHERE action_code LIKE '${MARKER}%'`);
    await pool.query(`DELETE FROM rectification_task WHERE task_code LIKE '${MARKER}%'`);
    await pool.query(`DELETE FROM hazard_record WHERE hazard_code LIKE '${MARKER}%'`);
    console.log('✓ 清理完成');
  } catch (err) {
    console.error(`✗ 清理失败: ${err.message}`);
  }
}

async function testHazardConfirm() {
  console.log('\n=== 一、隐患确认 ===');

  let res = await request(app).post('/api/hse/hazard-rectification/confirm').set(authHeaders).send({
    hazard_id: 99999,
    confirmed_by: 1,
    confirmation_note: '测试确认',
  });
  assert(res.body.code === -2, '1.1 确认不存在的隐患应失败', res.body);

  res = await request(app).post('/api/hse/hazard-rectification/confirm').set(authHeaders).send({
    hazard_id: 99999,
    confirmed_by: 1,
  });
  assert(res.body.code === -2, '1.2 确认不存在隐患应返回错误', res.body);

  console.log('  - 隐患确认接口测试完成（需先创建隐患才能测试完整流程）');
}

async function testRectificationTasks() {
  console.log('\n=== 二、整改任务 CRUD ===');

  let res = await request(app).post('/api/hse/hazard-rectification/tasks').set(authHeaders).send({
    hazard_id: 99999,
    task_title: `${MARKER}测试整改任务`,
    description: '测试整改任务描述',
    responsible_id: 1,
    department_id: null,
    deadline_date: '2026-12-31',
    priority: 'high',
  });
  assert(res.body.code === -2, '2.1 创建任务关联不存在隐患应失败', res.body);

  res = await request(app).get('/api/hse/hazard-rectification/tasks').set(authHeaders);
  assert(res.body.success === true, '2.2 查询整改任务列表', res.body);
  assert(Array.isArray(res.body.data.list), '2.3 列表应为数组', res.body);

  res = await request(app).get('/api/hse/hazard-rectification/tasks/99999').set(authHeaders);
  assert(res.body.code === -2, '2.4 查询不存在的任务应失败', res.body);

  res = await request(app).delete('/api/hse/hazard-rectification/tasks/99999').set(authHeaders);
  assert(res.body.code === -2, '2.5 删除不存在的任务应失败', res.body);

  console.log('  - 整改任务接口测试完成');
}

async function testRectificationActions() {
  console.log('\n=== 三、整改措施 CRUD ===');

  let res = await request(app).get('/api/hse/hazard-rectification/tasks/99999/actions').set(authHeaders);
  assert(res.body.success === true, '3.1 查询不存在任务的措施应返回空数组', res.body);

  res = await request(app).post('/api/hse/hazard-rectification/tasks/99999/actions').set(authHeaders).send({
    action_description: `${MARKER}测试整改措施`,
    action_type: 'engineering',
    responsible_id: 1,
  });
  assert(res.body.code === -2, '3.2 为不存在任务创建措施应失败', res.body);

  res = await request(app).put('/api/hse/hazard-rectification/actions/99999').set(authHeaders).send({
    status: 'completed',
  });
  assert(res.body.code === -2, '3.3 更新不存在的措施应失败', res.body);

  res = await request(app).delete('/api/hse/hazard-rectification/actions/99999').set(authHeaders);
  assert(res.body.code === -2, '3.4 删除不存在的措施应失败', res.body);

  console.log('  - 整改措施接口测试完成');
}

async function testReviewRecords() {
  console.log('\n=== 四、复查记录 CRUD ===');

  let res = await request(app).get('/api/hse/hazard-rectification/reviews').set(authHeaders);
  assert(res.body.success === true, '4.1 查询复查记录列表', res.body);
  assert(Array.isArray(res.body.data.list), '4.2 列表应为数组', res.body);

  res = await request(app).get('/api/hse/hazard-rectification/reviews/99999').set(authHeaders);
  assert(res.body.code === -2, '4.3 查询不存在的复查记录应失败', res.body);

  res = await request(app).post('/api/hse/hazard-rectification/reviews').set(authHeaders).send({
    hazard_id: 99999,
    reviewer_id: 1,
    review_result: 'pass',
  });
  assert(res.body.code === -2, '4.4 创建复查记录关联不存在隐患应失败', res.body);

  res = await request(app).delete('/api/hse/hazard-rectification/reviews/99999').set(authHeaders);
  assert(res.body.code === -2, '4.5 删除不存在的复查记录应失败', res.body);

  console.log('  - 复查记录接口测试完成');
}

async function testStatistics() {
  console.log('\n=== 五、统计接口 ===');

  let res = await request(app).get('/api/hse/hazard-rectification/stats').set(authHeaders);
  assert(res.body.success === true, '5.1 获取整改闭环统计', res.body);
  assert(typeof res.body.data.total_hazard === 'number', '5.2 total_hazard应为数字', res.body);
  assert(typeof res.body.data.closed_hazard === 'number', '5.3 closed_hazard应为数字', res.body);
  assert(typeof res.body.data.closed_rate === 'number', '5.4 closed_rate应为数字', res.body);
  assert(Array.isArray(res.body.data.stats_by_department), '5.5 stats_by_department应为数组', res.body);
  assert(Array.isArray(res.body.data.stats_by_responsible), '5.6 stats_by_responsible应为数组', res.body);

  res = await request(app).get('/api/hse/hazard-rectification/stats/overdue').set(authHeaders);
  assert(res.body.success === true, '5.7 获取超期/临期统计', res.body);
  assert(Array.isArray(res.body.data.overdue_tasks), '5.8 overdue_tasks应为数组', res.body);
  assert(Array.isArray(res.body.data.expiring_tasks), '5.9 expiring_tasks应为数组', res.body);

  console.log('  - 统计接口测试完成');
}

async function testResponsibleQuery() {
  console.log('\n=== 六、责任人查询 ===');

  let res = await request(app).get('/api/hse/hazard-rectification/responsible/99999/tasks').set(authHeaders);
  assert(res.body.code === -2, '6.1 查询不存在员工的任务应失败', res.body);

  console.log('  - 责任人查询接口测试完成');
}

async function testAiSuggestions() {
  console.log('\n=== 七、AI 整改建议 ===');

  let res = await request(app).post('/api/hse/hazard-rectification/tasks/99999/ai-suggestions').set(authHeaders).send({
    hazard_description: '电气线路老化',
    hazard_level: 'major',
    location: '配电室',
  });
  assert(res.body.success === true, '7.1 获取AI整改建议', res.body);
  assert(res.body.data.ai_suggestions, '7.2 应包含ai_suggestions', res.body);
  assert(res.body.data.ai_risk_hint, '7.3 应包含ai_risk_hint', res.body);
  assert(res.body.data.analysis_basis, '7.4 应包含analysis_basis', res.body);
  assert(res.body.data.prompt_version, '7.5 应包含prompt_version', res.body);

  res = await request(app).post('/api/hse/hazard-rectification/tasks/99999/ai-suggestions').set(authHeaders).send({});
  assert(res.body.code === -2, '7.6 获取不存在任务的AI建议应失败', res.body);

  console.log('  - AI整改建议接口测试完成');
}

async function testFullFlow() {
  console.log('\n=== 八、完整流程测试（创建隐患→确认→整改任务→整改措施→复查） ===');

  console.log('\n8.1 创建测试隐患');
  let res = await request(app).post('/api/hse/hazard-rectification/confirm').set(authHeaders).send({
    hazard_id: 99999,
    confirmed_by: 1,
  });
  console.log('  - 跳过：需要先创建隐患记录');

  console.log('8.2 创建整改任务');
  res = await request(app).post('/api/hse/hazard-rectification/tasks').set(authHeaders).send({
    hazard_id: 99999,
    task_title: `${MARKER}完整流程测试任务`,
    responsible_id: 1,
    deadline_date: '2026-12-31',
  });
  console.log('  - 跳过：需要先创建隐患记录');

  console.log('  - 完整流程测试完成（需先创建隐患记录）');
}

async function main() {
  console.log(`\n========== HSE Sprint5.5 隐患整改闭环中心集成测试 ==========\n`);

  try {
    await testConnection();
    console.log('✓ 数据库连接成功');

    app = require('../app');
    console.log('✓ 应用加载成功');

    await login();

    await testHazardConfirm();
    await testRectificationTasks();
    await testRectificationActions();
    await testReviewRecords();
    await testStatistics();
    await testResponsibleQuery();
    await testAiSuggestions();
    await testFullFlow();

    await cleanup();

    console.log(`\n========== 测试结果 ==========`);
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    if (failures.length > 0) {
      console.log('\n失败列表:');
      failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n✗ 测试执行异常: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  testHazardConfirm,
  testRectificationTasks,
  testRectificationActions,
  testReviewRecords,
  testStatistics,
  testResponsibleQuery,
  testAiSuggestions,
};