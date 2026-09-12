/**
 * HSE Sprint5.1.1 权限测试 - 独立脚本
 *
 * 用途: 验证 admin / safety_manager / 普通用户(viewer) 三种角色的权限边界
 * 运行: node __tests__/hse-employee.permissions.test.js
 *
 * 测试范围:
 *   1. admin 角色: 可执行所有写操作 (POST/PUT/DELETE/import)
 *   2. safety_manager 角色: 可执行所有写操作
 *   3. 普通用户(viewer) 角色: 写操作应返回 403，读操作应返回 200
 *   4. 未登录用户: 所有受保护接口应返回 401
 *
 * 测试用户准备:
 *   - admin: 系统默认管理员 (admin/admin123)
 *   - safety_manager: 临时创建 (safety_manager_test / Test@123456)
 *   - viewer: 临时创建 (viewer_test / Test@123456)
 *   - 测试结束自动清理临时用户及关联数据
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { pool, testConnection } = require('../config/db');

const MARKER = `P5${Date.now().toString(36)}`; // 约8-10字符
const TEST_USERS = [
  {
    username: `${MARKER}_sm`,
    password: 'Test@123456',
    real_name: `${MARKER} 安全管理员`,
    role: 'safety_manager',
    department: '安全部',
  },
  {
    username: `${MARKER}_viewer`,
    password: 'Test@123456',
    real_name: `${MARKER} 普通用户`,
    role: 'viewer',
    department: '运营部',
  },
];

let app = null;
let adminToken = null;
let smToken = null;
let viewerToken = null;
let adminHeaders = {};
let smHeaders = {};
let viewerHeaders = {};
let adminUserId = null;

// 测试中创建的资源ID，用于权限验证后清理
let testDeptId = null;
let testPositionId = null;
let testEmployeeId = null;
let testOrgId = null;

// 测试统计
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message, extra) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    const ext = extra ? ` | ${JSON.stringify(extra).slice(0, 200)}` : '';
    console.error(`  ✗ ${message}${ext}`);
  }
}

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200 || !res.body.data || !res.body.data.token) {
    throw new Error(`登录失败 ${username}: ${res.body.message || res.status}`);
  }
  return res.body.data.token;
}

async function setupTestUsers() {
  console.log('\n--- 准备测试用户 ---');
  for (const u of TEST_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, real_name, role, department, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [u.username, passwordHash, u.real_name, u.role, u.department]
    );
    console.log(`  + 创建用户 ${u.username} (role=${u.role})`);
  }
}

async function cleanupTestUsers() {
  console.log('\n--- 清理测试用户 ---');
  for (const u of TEST_USERS) {
    await pool.query(`DELETE FROM users WHERE username = $1`, [u.username]);
    console.log(`  - 删除用户 ${u.username}`);
  }
}

async function testAdminPermissions() {
  console.log('\n=== 一、admin 角色权限测试 ===');

  // 1.1 admin 创建部门
  let res = await request(app).post('/api/hse/employee/departments').set(adminHeaders).send({
    dept_code: `${MARKER}-PERM-DEPT`,
    name: `${MARKER} 权限测试部门`,
    level: 3,
  });
  assert(res.body.success === true, '1.1 admin 可创建部门', res.body);
  testDeptId = res.body.data?.id;

  // 1.2 admin 创建岗位
  res = await request(app).post('/api/hse/employee/positions').set(adminHeaders).send({
    position_code: `${MARKER}-PERM-POS`,
    name: `${MARKER} 权限测试岗位`,
  });
  assert(res.body.success === true, '1.2 admin 可创建岗位', res.body);
  testPositionId = res.body.data?.id;

  // 1.3 admin 创建员工
  res = await request(app).post('/api/hse/employee/employees').set(adminHeaders).send({
    employee_code: `${MARKER}-PERM-EMP`,
    id_card: '370123198501011111',
    name: `${MARKER} 权限测试员工`,
    gender: '男',
    birth_date: '1985-01-01',
    phone: '13800138011',
    person_type: '管理人员',
  });
  assert(res.body.success === true, '1.3 admin 可创建员工', res.body);
  testEmployeeId = res.body.data?.id;

  // 1.4 admin 调岗
  res = await request(app).post('/api/hse/employee/org/assign').set(adminHeaders).send({
    employee_id: testEmployeeId,
    enterprise_id: testDeptId,
    position_id: testPositionId,
    start_date: '2026-01-01',
    change_reason: 'admin 入职',
  });
  assert(res.body.success === true, '1.4 admin 可执行调岗', res.body);
  testOrgId = res.body.data?.id;

  // 1.5 admin 更新员工
  res = await request(app).put(`/api/hse/employee/employees/${testEmployeeId}`).set(adminHeaders).send({
    person_type: '技术人员',
  });
  assert(res.body.success === true, '1.5 admin 可更新员工', res.body);

  // 1.6 admin 状态变更
  res = await request(app).put(`/api/hse/employee/org/${testOrgId}/status`).set(adminHeaders).send({
    status: '待岗',
    event_date: '2026-02-01',
  });
  assert(res.body.success === true, '1.6 admin 可变更状态', res.body);

  // 1.7 admin 导入
  res = await request(app).post('/api/hse/employee/employees/import').set(adminHeaders).send({
    employees: [
      { employee_code: `${MARKER}-IMP-ADMIN`, name: `${MARKER} admin导入员工` },
    ],
  });
  assert(res.body.success === true && res.body.data.success === 1, '1.7 admin 可批量导入', res.body);

  // 1.8 admin 读操作
  res = await request(app).get('/api/hse/employee/employees').set(adminHeaders);
  assert(res.body.success === true, '1.8 admin 可读取员工列表');

  res = await request(app).get('/api/hse/employee/departments/tree').set(adminHeaders);
  assert(res.body.success === true, '1.9 admin 可读取部门树');

  res = await request(app).get(`/api/hse/employee/history/employee/${testEmployeeId}`).set(adminHeaders);
  assert(res.body.success === true, '1.10 admin 可查询历史');
}

async function testSafetyManagerPermissions() {
  console.log('\n=== 二、safety_manager 角色权限测试 ===');

  // 2.1 创建部门
  let res = await request(app).post('/api/hse/employee/departments').set(smHeaders).send({
    dept_code: `${MARKER}-SM-DEPT`,
    name: `${MARKER} 安全经理部门`,
    level: 3,
  });
  assert(res.body.success === true, '2.1 safety_manager 可创建部门', res.body);

  // 2.2 创建岗位
  res = await request(app).post('/api/hse/employee/positions').set(smHeaders).send({
    position_code: `${MARKER}-SM-POS`,
    name: `${MARKER} 安全经理岗位`,
  });
  assert(res.body.success === true, '2.2 safety_manager 可创建岗位', res.body);

  // 2.3 创建员工
  res = await request(app).post('/api/hse/employee/employees').set(smHeaders).send({
    employee_code: `${MARKER}-SM-EMP`,
    id_card: '370123198702022222',
    name: `${MARKER} 安全经理创建员工`,
    gender: '女',
    birth_date: '1987-02-02',
    phone: '13800138022',
    person_type: '生产人员',
  });
  assert(res.body.success === true, '2.3 safety_manager 可创建员工', res.body);

  // 2.4 更新员工（admin创建的员工）
  res = await request(app).put(`/api/hse/employee/employees/${testEmployeeId}`).set(smHeaders).send({
    phone: '13900139033',
  });
  assert(res.body.success === true, '2.4 safety_manager 可更新员工', res.body);

  // 2.5 调岗
  res = await request(app).post('/api/hse/employee/org/assign').set(smHeaders).send({
    employee_id: testEmployeeId,
    enterprise_id: testDeptId,
    position_id: testPositionId,
    start_date: '2026-03-01',
    change_reason: 'safety_manager 调岗',
  });
  assert(res.body.success === true, '2.5 safety_manager 可调岗', res.body);
  testOrgId = res.body.data?.id; // 更新 orgId 用于后续测试

  // 2.6 状态变更
  res = await request(app).put(`/api/hse/employee/org/${testOrgId}/status`).set(smHeaders).send({
    status: '待岗',
    event_date: '2026-04-01',
  });
  assert(res.body.success === true, '2.6 safety_manager 可变更状态', res.body);

  // 2.7 批量导入
  res = await request(app).post('/api/hse/employee/employees/import').set(smHeaders).send({
    employees: [
      { employee_code: `${MARKER}-IMP-SM`, name: `${MARKER} sm导入员工` },
    ],
  });
  assert(res.body.success === true && res.body.data.success === 1, '2.7 safety_manager 可批量导入', res.body);

  // 2.8 读操作
  res = await request(app).get('/api/hse/employee/employees').set(smHeaders);
  assert(res.body.success === true, '2.8 safety_manager 可读取员工列表');

  res = await request(app).get(`/api/hse/employee/history/employee/${testEmployeeId}`).set(smHeaders);
  assert(res.body.success === true, '2.9 safety_manager 可查询历史');
}

async function testViewerPermissions() {
  console.log('\n=== 三、普通用户(viewer) 角色权限测试 ===');

  // 3.1 viewer 创建部门 → 应 403
  let res = await request(app).post('/api/hse/employee/departments').set(viewerHeaders).send({
    dept_code: `${MARKER}-V-DEPT`,
    name: `${MARKER} viewer部门`,
    level: 3,
  });
  assert(res.status === 403, '3.1 viewer 创建部门被拒绝 (403)', { status: res.status, body: res.body });

  // 3.2 viewer 创建岗位 → 应 403
  res = await request(app).post('/api/hse/employee/positions').set(viewerHeaders).send({
    position_code: `${MARKER}-V-POS`,
    name: `${MARKER} viewer岗位`,
  });
  assert(res.status === 403, '3.2 viewer 创建岗位被拒绝 (403)', { status: res.status });

  // 3.3 viewer 创建员工 → 应 403
  res = await request(app).post('/api/hse/employee/employees').set(viewerHeaders).send({
    name: `${MARKER} viewer创建员工`,
  });
  assert(res.status === 403, '3.3 viewer 创建员工被拒绝 (403)', { status: res.status });

  // 3.4 viewer 更新员工 → 应 403
  res = await request(app).put(`/api/hse/employee/employees/${testEmployeeId}`).set(viewerHeaders).send({
    person_type: '辅助人员',
  });
  assert(res.status === 403, '3.4 viewer 更新员工被拒绝 (403)', { status: res.status });

  // 3.5 viewer 删除员工 → 应 403
  res = await request(app).delete(`/api/hse/employee/employees/${testEmployeeId}`).set(viewerHeaders);
  assert(res.status === 403, '3.5 viewer 删除员工被拒绝 (403)', { status: res.status });

  // 3.6 viewer 调岗 → 应 403
  res = await request(app).post('/api/hse/employee/org/assign').set(viewerHeaders).send({
    employee_id: testEmployeeId,
    start_date: '2026-05-01',
  });
  assert(res.status === 403, '3.6 viewer 调岗被拒绝 (403)', { status: res.status });

  // 3.7 viewer 状态变更 → 应 403
  res = await request(app).put(`/api/hse/employee/org/${testOrgId}/status`).set(viewerHeaders).send({
    status: '待岗',
    event_date: '2026-05-02',
  });
  assert(res.status === 403, '3.7 viewer 状态变更被拒绝 (403)', { status: res.status });

  // 3.8 viewer 批量导入 → 应 403
  res = await request(app).post('/api/hse/employee/employees/import').set(viewerHeaders).send({
    employees: [{ name: `${MARKER} viewer导入` }],
  });
  assert(res.status === 403, '3.8 viewer 批量导入被拒绝 (403)', { status: res.status });

  // 3.9 viewer Excel 导入 → 应 403
  res = await request(app).post('/api/hse/employee/employees/import/excel').set(viewerHeaders);
  assert(res.status === 403, '3.9 viewer Excel导入被拒绝 (403)', { status: res.status });

  // 3.10 viewer Excel 模板下载 → 应 403
  res = await request(app).get('/api/hse/employee/employees/import/template').set(viewerHeaders);
  assert(res.status === 403, '3.10 viewer 下载模板被拒绝 (403)', { status: res.status });

  // 3.11 viewer 读操作 → 应 200 (读不受限)
  res = await request(app).get('/api/hse/employee/employees').set(viewerHeaders);
  assert(res.body.success === true, '3.11 viewer 可读取员工列表', res.body);

  res = await request(app).get('/api/hse/employee/departments/tree').set(viewerHeaders);
  assert(res.body.success === true, '3.12 viewer 可读取部门树', res.body);

  res = await request(app).get(`/api/hse/employee/history/employee/${testEmployeeId}`).set(viewerHeaders);
  assert(res.body.success === true, '3.13 viewer 可查询历史', res.body);
}

async function testUnauthenticatedAccess() {
  console.log('\n=== 四、未登录访问测试 ===');

  // 4.1 无Token访问写接口
  let res = await request(app).post('/api/hse/employee/employees').send({ name: '无token' });
  assert(res.status === 401, '4.1 未登录创建员工被拒绝 (401)', { status: res.status });

  res = await request(app).delete('/api/hse/employee/employees/1');
  assert(res.status === 401, '4.2 未登录删除员工被拒绝 (401)', { status: res.status });

  res = await request(app).post('/api/hse/employee/employees/import').send({ employees: [] });
  assert(res.status === 401, '4.3 未登录批量导入被拒绝 (401)', { status: res.status });

  // 4.2 无效Token
  res = await request(app)
    .get('/api/hse/employee/employees')
    .set({ Authorization: 'Bearer invalid_token_xyz' });
  assert(res.status === 401, '4.4 无效Token被拒绝 (401)', { status: res.status });
}

async function testOperatorIdRecorded() {
  console.log('\n=== 五、operator_id 记录验证（Sprint5.1.1） ===');

  // 查询 admin 创建的员工的历史，验证 operator_id 等于 admin 用户ID
  const res = await request(app).get(`/api/hse/employee/history/employee/${testEmployeeId}`).set(adminHeaders);
  assert(res.body.success === true, '5.1 查询历史成功');

  // 找到 admin 操作的事件
  // 注意: PostgreSQL BIGINT 通过 pg driver 默认返回字符串，需统一为字符串比较
  const adminEvents = res.body.data.filter((h) => String(h.operator_id) === String(adminUserId));
  assert(adminEvents.length > 0, `5.2 admin操作事件被记录 (operator_id=${adminUserId})`, {
    totalEvents: res.body.data.length,
    adminEvents: adminEvents.length,
    operatorIds: res.body.data.map((h) => h.operator_id),
  });

  // 验证 operator_name 字段
  const eventWithOperatorName = res.body.data.find((h) => h.operator_name);
  assert(eventWithOperatorName !== undefined, '5.3 历史记录含 operator_name 字段');
}

async function testHashUniqueness() {
  console.log('\n=== 六、哈希唯一性校验（Sprint5.1.1） ===');

  // 6.1 重复身份证号应被拒绝（之前因加密随机IV无法检测）
  let res = await request(app).post('/api/hse/employee/employees').set(adminHeaders).send({
    id_card: '370123198501011111', // 与 1.3 创建的员工身份证号相同
    name: `${MARKER} 重复身份证测试`,
  });
  assert(res.body.success === false && res.body.code === -4, '6.1 重复身份证号被拒绝 (哈希校验生效)', res.body);
  assert(res.body.message.includes('身份证'), '6.2 错误消息含"身份证"', res.body);

  // 6.2 重复手机号应被拒绝
  // 注: 1.3 创建的员工初始 phone=13800138011，但 2.4 safety_manager 已更新为 13900139033，
  //     因此此处需使用当前实际存在的手机号 13900139033 才能验证重复检测
  res = await request(app).post('/api/hse/employee/employees').set(adminHeaders).send({
    phone: '13900139033', // 与 2.4 更新后的员工手机号相同
    name: `${MARKER} 重复手机号测试`,
  });
  assert(res.body.success === false && res.body.code === -4, '6.3 重复手机号被拒绝 (哈希校验生效)', res.body);
  assert(res.body.message.includes('手机'), '6.4 错误消息含"手机"', res.body);
}

async function testExcelEndpoints() {
  console.log('\n=== 七、Excel 导入端点测试（Sprint5.1.1） ===');

  // 7.1 模板下载
  let res = await request(app).get('/api/hse/employee/employees/import/template').set(adminHeaders);
  assert(res.status === 200, '7.1 模板下载成功', { status: res.status });
  assert(
    res.headers['content-type']?.includes('spreadsheet'),
    '7.2 Content-Type 含 spreadsheet',
    { ct: res.headers['content-type'] }
  );

  // 7.2 预览空文件
  const XLSX = require('xlsx');
  // 构造一个最小有效的 xlsx 文件（含表头 + 1 行数据）
  const ws = XLSX.utils.json_to_sheet([
    { '工号': `${MARKER}-XLSX-1`, '姓名': `${MARKER} Excel测试员工1`, '性别': '男', '出生日期': '1990-01-01', '手机号': '13700137001', '人员分类': '适龄人员', '人员类型': '生产人员' },
    { '工号': `${MARKER}-XLSX-2`, '姓名': `${MARKER} Excel测试员工2`, '性别': '女', '出生日期': '1995-02-02' },
    { '工号': '', '姓名': '', '性别': '无效' }, // 第3行：姓名为空 + 性别无效，应失败
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '员工');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 7.3 预览接口
  res = await request(app)
    .post('/api/hse/employee/employees/import/excel/preview')
    .set(adminHeaders)
    .attach('file', buffer, { filename: 'test_preview.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert(res.body.success === true, '7.3 Excel预览接口成功', res.body);
  assert(res.body.data.totalRows === 3, `7.4 解析总行数=3 (实际=${res.body.data.totalRows})`);
  assert(res.body.data.invalidRows >= 1, `7.5 检测到校验错误 (实际=${res.body.data.invalidRows})`);

  // 7.4 直接导入接口
  res = await request(app)
    .post('/api/hse/employee/employees/import/excel')
    .set(adminHeaders)
    .attach('file', buffer, { filename: 'test_import.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert(res.body.success === true, '7.6 Excel导入接口成功', res.body);
  assert(res.body.data.success >= 2, `7.7 成功导入>=2条 (实际=${res.body.data.success})`);
  assert(res.body.data.failed >= 1, `7.8 失败>=1条 (实际=${res.body.data.failed})`);
}

async function cleanupTestData() {
  console.log('\n--- 清理测试数据 ---');
  try {
    await pool.query(`DELETE FROM employee_history WHERE remark LIKE $1 OR remark LIKE $2`, [`%${MARKER}%`, `%${testEmployeeId}%`]);
    await pool.query(`DELETE FROM employee_history WHERE operator_id IS NOT NULL AND remark LIKE $1`, [`%${MARKER}%`]);
    // 删除本测试创建的所有员工（按工号前缀）
    await pool.query(`DELETE FROM hse_employee_org WHERE change_reason LIKE $1`, [`%${MARKER}%`]);
    await pool.query(`DELETE FROM employee WHERE employee_code LIKE $1 OR name LIKE $2`, [`${MARKER}%`, `%${MARKER}%`]);
    await pool.query(`DELETE FROM position WHERE position_code LIKE $1`, [`${MARKER}%`]);
    await pool.query(`DELETE FROM department WHERE dept_code LIKE $1`, [`${MARKER}%`]);
    // 兜底：删除与测试员工ID相关的所有数据
    if (testEmployeeId) {
      await pool.query(`DELETE FROM hse_employee_org WHERE employee_id = $1`, [testEmployeeId]);
      await pool.query(`DELETE FROM employee_history WHERE employee_id = $1`, [testEmployeeId]);
      await pool.query(`DELETE FROM employee WHERE id = $1`, [testEmployeeId]);
    }
    console.log('  测试数据清理完成');
  } catch (e) {
    console.error('  清理失败:', e.message);
  }
}

async function main() {
  console.log('====================================');
  console.log('HSE Sprint5.1.1 权限加固测试');
  console.log(`测试标记: ${MARKER}`);
  console.log('====================================');

  try {
    process.env.NODE_ENV = 'test';
    app = require('../app');
    await testConnection();

    await setupTestUsers();

    // 登录三种角色
    adminToken = await login('admin', 'admin123');
    adminHeaders = { Authorization: `Bearer ${adminToken}` };
    // 获取 admin 用户 ID
    const adminInfo = await request(app).get('/api/auth/current-user').set(adminHeaders);
    adminUserId = adminInfo.body.data?.id;
    console.log(`  admin 用户ID: ${adminUserId}`);

    smToken = await login(TEST_USERS[0].username, TEST_USERS[0].password);
    smHeaders = { Authorization: `Bearer ${smToken}` };

    viewerToken = await login(TEST_USERS[1].username, TEST_USERS[1].password);
    viewerHeaders = { Authorization: `Bearer ${viewerToken}` };

    console.log('  三种角色登录成功');

    await testAdminPermissions();
    await testSafetyManagerPermissions();
    await testViewerPermissions();
    await testUnauthenticatedAccess();
    await testOperatorIdRecorded();
    await testHashUniqueness();
    await testExcelEndpoints();

    console.log('\n====================================');
    console.log('测试结果汇总');
    console.log('====================================');
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    if (failures.length > 0) {
      console.log('\n失败项:');
      failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }
    console.log('====================================');
  } catch (e) {
    console.error('\n测试执行异常:', e.message);
    console.error(e.stack);
    failed++;
    failures.push(`执行异常: ${e.message}`);
  } finally {
    await cleanupTestData();
    await cleanupTestUsers();
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
