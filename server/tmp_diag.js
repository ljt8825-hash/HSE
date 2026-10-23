const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const jwt = require('jsonwebtoken');
const { pool } = require('./config/db');

const BASE = 'http://127.0.0.1:5876';
async function main() {
  const u = (await pool.query(
    `SELECT id, username, role, real_name FROM users WHERE role='admin' AND is_active=TRUE LIMIT 1`,
  )).rows[0];
  const token = jwt.sign(
    { id: u.id, username: u.username, role: u.role, realName: u.real_name, type: 'access' },
    process.env.JWT_SECRET, { expiresIn: '1h', jwtid: `t${Date.now()}` },
  );
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const cyc = (await pool.query(
    `SELECT id, assessment_year, assessment_month FROM hse_assessment_cycle WHERE is_deleted=FALSE ORDER BY assessment_year DESC, assessment_month DESC LIMIT 1`,
  )).rows[0];
  const cycleId = cyc.id;
  console.log(`cycle=${cycleId} month=${cyc.assessment_year}-${String(cyc.assessment_month).padStart(2,'0')}`);

  const enc = encodeURIComponent;
  const r = await (await fetch(`${BASE}/api/hse/violation-assessment/list?cycleId=${cycleId}&position=${enc('管理员')}`, { headers: H })).json();
  const rows = r.data.rows;

  console.log('\n=== 管理员 tab 逐管理员各列扣分 ===');
  console.log('城镇\t姓名\t网格\t三违巡查\t填报\t未整改(rect)\t公司查处\t驾驶员');
  let byTown = {};
  for (const row of rows) {
    const t = row.township || '';
    if (!byTown[t]) byTown[t] = [];
    byTown[t].push(row);
    console.log(
      `${t}\t${row.name}\t${row.gridDeduct}\t${row.violationDeduct}\t${row.unrectifiedDeduct}` +
      `\t${row.rectifiedDeduct}\t${row.companyDeduct?.score ?? row.companyDeduct}\t${row.driverDeduct}`
    );
  }

  console.log('\n=== 告警：乡镇内 rectifiedDeduct 各异值 与 全乡镇同值(vviolationDeduct/company)检查 ===');
  for (const t of Object.keys(byTown)) {
    const arr = byTown[t];
    const rectSet = [...new Set(arr.map(x => `${x.name}=${x.rectifiedDeduct}`))];
    const violSet = [...new Set(arr.map(x => `${x.name}=${x.violationDeduct}`))];
    const compSet = [...new Set(arr.map(x => `${x.name}=${x.companyDeduct?.score ?? 0}`))];
    if (rectSet.length > 1) console.log(`  [rect逐人不同] ${t}: ${rectSet.join(', ')}`);
    if (violSet.every(v => v.endsWith('=1') || v.endsWith('=2')) ) { /* noisy skip */ }
  }

  // 单独列出 rectifiedDeduct > 0 的管理员及其值，核对是否与「直接上级」一一对应
  console.log('\n=== rectifiedDeduct>0 的管理员 ===');
  for (const row of rows) if (row.rectifiedDeduct > 0)
    console.log(`  ${row.township} | ${row.name} | rect=${row.rectifiedDeduct}`);

  await pool.end();
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });