/**
 * 干跑：预览整份花名册，评估数据质量（不写库）
 * 运行: node __tests__/hse-employee.roster-dryrun.js
 */
const request = require('supertest');
const { pool, testConnection } = require('../config/db');

const ROSTER = 'c:\\Users\\honey\\.trae-cn\\attachments\\6a8f8cc10055c0b36c67a696\\3d934bc2-c8be-49d8-8774-256a2da1aba4_c18d3dcf-3e69-4089-9824-3ff7fff84e9b_员工信息维护_20260730090323.xlsx';
const TEST_USER = { username: 'admin', password: 'admin123' };

async function main() {
  process.env.NODE_ENV = 'test';
  const app = require('../app');
  await testConnection();
  const login = await request(app).post('/api/auth/login').send(TEST_USER);
  const headers = { Authorization: `Bearer ${login.body.data.token}` };

  const res = await request(app)
    .post('/api/hse/employee/employees/import/excel/preview')
    .set(headers)
    .attach('file', ROSTER);

  const d = res.body.data || {};
  console.log('totalRows:', d.totalRows);
  console.log('validRows:', d.validRows);
  console.log('invalidRows:', d.invalidRows);
  console.log('errors count:', (d.errors || []).length);
  const errCounts = {};
  (d.errors || []).forEach(e => {
    const key = e.replace(/^第\d+行：/, '');
    errCounts[key] = (errCounts[key] || 0) + 1;
  });
  console.log('--- error types ---');
  Object.entries(errCounts).forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

  // 统计职位/部门解析
  const posSet = new Set();
  const deptSet = new Set();
  (d.preview || []).forEach(r => {
    if (r.positionName) posSet.add(r.positionName);
    if (r.deptName) deptSet.add(r.deptName);
  });
  console.log('preview unique positions:', posSet.size, 'unique depts:', deptSet.size);

  await pool.end();
}
main().catch(e => { console.error('异常:', e.message); process.exit(1); });
