/**
 * 聚焦测试：验证「所属部门 + 职位」花名册格式（无组织路径）导入时能正确关联岗位
 * 运行: node __tests__/hse-employee.roster-position.test.js
 */
const request = require('supertest');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('../config/db');

const MARKER = `RP${Date.now().toString(36)}`;
const TEST_USER = { username: 'admin', password: 'admin123' };

let app = null;
let token = null;
let authHeaders = {};
let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg, body) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ✗ ${msg}${body ? ' | ' + JSON.stringify(body).slice(0, 300) : ''}`); }
}

async function login() {
  const res = await request(app).post('/api/auth/login').send(TEST_USER);
  if (res.status !== 200 || !res.body.data?.token) throw new Error(`登录失败: ${res.body.message || res.status}`);
  token = res.body.data.token;
  authHeaders = { Authorization: `Bearer ${token}` };
  console.log('✓ 登录成功');
}

function makeXlsx(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '员工信息维护');
  const tmp = path.join(__dirname, `_tmp_${MARKER}.xlsx`);
  XLSX.writeFile(wb, tmp);
  return tmp;
}

async function main() {
  console.log('====================================');
  console.log('花名册「所属部门+职位」导入岗位关联 聚焦测试');
  console.log(`标记: ${MARKER}`);
  console.log('====================================');
  try {
    process.env.NODE_ENV = 'test';
    app = require('../app');
    await testConnection();
    await login();

    // 测试员工（唯一编码，避免影响真实数据）
    const testCode = `TEST${MARKER}`;
    const testRows = [
      {
        '员工编码': testCode + 'A',
        '姓名': '测试甲',
        '所属部门': '人力综合部',
        '职位': '行政综合主管',
        '身份证号码': '370102199001011234',
        '性别': '女',
        '手机号码': '13800000001',
        '入职日期': '2024-01-15',
      },
      {
        '员工编码': testCode + 'B',
        '姓名': '测试乙',
        '所属部门': '宁城街道片区',
        '职位': '人工片区长',
        '身份证号码': '370102199508152345',
        '性别': '男',
        '手机号码': '13900000002',
        '入职日期': '2024-02-20',
      },
      {
        '员工编码': testCode + 'C',
        '姓名': '测试丙',
        '组织路径': '/宁津项目公司/人力综合部',
        '岗位名称': '测试电工',
        '身份证号': '370102199301013456',
        '性别': '男',
        '手机号': '13700000003',
        '入职日期': '2024-03-25',
      },
    ];
    const tmpFile = makeXlsx(testRows);

    // 1. 预览：验证 dept_name / position_name 被解析
    let res = await request(app)
      .post('/api/hse/employee/employees/import/excel/preview')
      .set(authHeaders)
      .attach('file', tmpFile);
    assert(res.body.success === true, '预览接口成功', res.body);
    const pv = res.body.data?.preview || [];
    const rowA = pv.find(r => (r.employee_code || r.employeeCode) === testCode + 'A');
    assert(rowA && (rowA.dept_name === '人力综合部' || rowA.deptName === '人力综合部'), '预览解析 dept_name=人力综合部', rowA);
    assert(rowA && (rowA.position_name === '行政综合主管' || rowA.positionName === '行政综合主管'), '预览解析 position_name=行政综合主管', rowA);

    // 2. 导入
    res = await request(app)
      .post('/api/hse/employee/employees/import/excel')
      .set(authHeaders)
      .attach('file', tmpFile);
    assert(res.body.success === true, '导入接口成功', res.body);
    assert(res.body.data?.success === 3, '导入成功 3 条', res.body.data);

    // 3. 查询数据库验证岗位关联
    const db = await pool.query(
      `SELECT e.employee_code, e.name, ea.org_unit_id, ou.org_name, p.name AS position_name
       FROM employee e
       LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
       LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id
       LEFT JOIN position p ON p.id = ea.position_id
       WHERE e.employee_code IN ($1, $2, $3) AND e.is_deleted = false`,
      [testCode + 'A', testCode + 'B', testCode + 'C']
    );
    const a = db.rows.find(r => r.employee_code === testCode + 'A');
    const b = db.rows.find(r => r.employee_code === testCode + 'B');
    const c = db.rows.find(r => r.employee_code === testCode + 'C');
    assert(a && a.position_name === '行政综合主管', `测试甲 岗位=行政综合主管 (实际: ${a?.position_name})`, a);
    assert(a && a.org_name === '人力综合部', `测试甲 部门=人力综合部 (实际: ${a?.org_name})`, a);
    assert(b && b.position_name === '人工片区长', `测试乙 岗位=人工片区长 (实际: ${b?.position_name})`, b);
    assert(b && b.org_name === '宁城街道作业中心', `测试乙 部门=宁城街道作业中心 (模糊匹配, 实际: ${b?.org_name})`, b);
    assert(c && c.position_name === '测试电工', `测试丙(组织路径) 岗位=测试电工 (实际: ${c?.position_name})`, c);
    assert(c && c.org_name === '人力综合部', `测试丙(组织路径) 部门=人力综合部 (实际: ${c?.org_name})`, c);

    // 4. 清理测试数据
    await pool.query(
      `UPDATE employee SET is_deleted = true WHERE employee_code IN ($1, $2, $3)`,
      [testCode + 'A', testCode + 'B', testCode + 'C']
    );
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    console.log('✓ 测试数据已清理');

    console.log('\n====================================');
    console.log(`通过: ${passed}  失败: ${failed}`);
    if (failures.length) { console.log('失败项:'); failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`)); }
    console.log('====================================');
  } catch (e) {
    console.error('测试执行异常:', e.message);
    console.error(e.stack);
    failed++;
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
