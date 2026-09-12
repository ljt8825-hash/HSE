/**
 * 重导整份花名册（使用修复后的导入逻辑）
 * 运行: node __tests__/hse-employee.roster-reimport.js
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

  console.log('开始导入花名册...');
  const t0 = Date.now();
  const res = await request(app)
    .post('/api/hse/employee/employees/import/excel')
    .set(headers)
    .attach('file', ROSTER);
  const cost = ((Date.now() - t0) / 1000).toFixed(1);

  const d = res.body.data || {};
  console.log(`导入完成，耗时 ${cost}s`);
  console.log('total:', d.total, 'success:', d.success, 'failed:', d.failed);
  if (d.errors && d.errors.length) {
    console.log('--- errors ---');
    d.errors.slice(0, 20).forEach(e => console.log(`  ${e.index}: ${e.message}`));
    console.log(`errors total: ${d.errors.length}`);
  }
  if (d.warnings && d.warnings.length) {
    console.log('--- warnings ---');
    const wCounts = {};
    d.warnings.forEach(w => { wCounts[w.message] = (wCounts[w.message] || 0) + 1; });
    Object.entries(wCounts).forEach(([k, v]) => console.log(`  ${v}x  ${k}`));
    console.log(`warnings total: ${d.warnings.length}`);
  }

  // 验证孙佳敏
  const v = await pool.query(
    `SELECT e.employee_code, e.name, ea.org_unit_id, ou.org_name, p.name AS position_name, ea.start_date
     FROM employee e
     LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_deleted = false
     LEFT JOIN hse_org_unit ou ON ou.id = ea.org_unit_id
     LEFT JOIN position p ON p.id = ea.position_id
     WHERE e.name = '孙佳敏' AND e.is_deleted = false`
  );
  console.log('--- 孙佳敏 当前状态 ---');
  console.log(JSON.stringify(v.rows, null, 2));

  // 汇总：花名册职位 vs 数据库职位 一致性
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(ROSTER);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const codes = rows.map(r => String(r['员工编码']).trim()).filter(Boolean);
  const ph = codes.map((_, i) => '$' + (i + 1)).join(',');
  const db = await pool.query(
    `SELECT e.employee_code, p.name AS position_name
     FROM employee e
     LEFT JOIN employee_assignment ea ON ea.employee_id = e.id AND ea.is_current = true AND ea.is_primary = true AND ea.is_deleted = false
     LEFT JOIN position p ON p.id = ea.position_id
     WHERE e.employee_code IN (${ph}) AND e.is_deleted = false`,
    codes
  );
  const byCode = new Map(db.rows.map(r => [r.employee_code, r.position_name]));
  let mismatch = 0, match = 0;
  for (const r of rows) {
    const code = String(r['员工编码'] || '').trim();
    const rosterPos = String(r['职位'] || '').trim();
    const dbPos = byCode.get(code) || '';
    if (rosterPos !== dbPos) mismatch++; else match++;
  }
  console.log(`--- 一致性汇总 ---`);
  console.log(`职位一致: ${match}  不一致: ${mismatch}`);

  await pool.end();
}
main().catch(e => { console.error('异常:', e.message); process.exit(1); });
