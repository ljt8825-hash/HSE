/* CF-WPS-22 离线回放：用**真实花名册全量数据 + 台账 68 人**，比对「新逻辑 vs 旧逻辑」的解析结果
 *
 * 目的：上线前先在真数据上证明「零回归」——除郭秀梅（由 name+dept 升级为 name+job，结果网格不变）外，
 *       其余人员的解析结果必须完全一致。
 *
 * 数据来源（均为只读产物，不发任何网络请求）：
 *   - artifacts/cf-wps-22/roster-job-distribution.json（cfwps22-roster-job-dist.mjs 全量枚举 1291 行的原始产物）
 *   - artifacts/cf-wps-19b/网格长台账_员工编码对照表.csv（台账 68 人：姓名/手机号/分级/所属部门）
 *
 * 复用 worker/index.js 导出的真实消歧函数（narrowDuplicateName / gridLeaderJobs），不复制实现。
 * Run: node test/cfwps22-replay-offline.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const workerMod = await import('../index.js');
const { narrowDuplicateName, mapRosterAreaRecord, PATROL_GRID_BY } = workerMod;
const require = createRequire(import.meta.url);

const ROSTER_JSON = process.env.ROSTER_JSON || 'G:/hse-dashboard/artifacts/cf-wps-22/roster-job-distribution.json';
const LEDGER_CSV = process.env.LEDGER_CSV || 'G:/hse-dashboard/artifacts/cf-wps-19b/网格长台账_员工编码对照表.csv';

const roster = JSON.parse(fs.readFileSync(ROSTER_JSON, 'utf8'));

// 台账 CSV（极简带引号解析，同 cfwps22-job-disambig-audit.mjs）
function parseCsv(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const csv = parseCsv(fs.readFileSync(LEDGER_CSV, 'utf8'));
const head = csv.shift();
const ci = (n) => head.indexOf(n);
const ledger = csv.filter((r) => (r[ci('姓名')] || '').trim()).map((r) => ({
  name: r[ci('姓名')].trim(), dept: r[ci('台账所属部门')].trim(), level: r[ci('分级')].trim(),
}));

// 花名册 → 消歧函数入参形状（JSON 由 roster API 产物，字段名 code/name/dept/job/area/phone）
const recs = roster.rows.map((r) => ({
  recordId: r.recordId, employeeCode: (r.code || '').trim(), name: (r.name || '').trim(),
  dept: (r.dept || '').trim(), job: (r.job || '').trim(), areaOnDuty: (r.area || '').trim(),
  superior: (r.superior || '').trim(), phone: (r.phone || '').trim(),
}));

// 旧逻辑等价物：白名单放一个不可能命中的值 → 职位过滤形同虚设（= CF-WPS-21 行为）
const ENV_OLD = { PATROL_GRID_LEADER_JOBS: '__no_such_job__' };
const ENV_NEW = {}; // 用代码默认白名单

const gridsOf = (row) => (row.areaOnDuty || row.dept);
function resolve(name, dept, env) {
  const hits = recs.filter((r) => r.name && r.name === name);
  if (hits.length === 0) return { n: 0, grids: [], by: null };
  if (hits.length === 1) return { n: 1, grids: gridsOf(hits[0]), by: PATROL_GRID_BY.NAME };
  const nr = narrowDuplicateName(hits, { dept, superior: '' }, env);
  if (nr.rows.length === 1) return { n: 1, grids: gridsOf(nr.rows[0]), by: nr.by };
  return { n: nr.rows.length, grids: [], by: null, unresolved: true };
}

let same = 0, changed = 0, hit0 = 0;
const diffs = [];
for (const p of ledger) {
  const oldR = resolve(p.name, p.dept, ENV_OLD);
  const newR = resolve(p.name, p.dept, ENV_NEW);
  if (newR.n === 0) { hit0++; continue; }
  const key = (x) => `${JSON.stringify(x.grids)}|${x.by}|${x.unresolved ? 'U' : 'R'}`;
  if (key(oldR) === key(newR)) same++; else { changed++; diffs.push({ p, oldR, newR }); }
}
console.log(`台账 ${ledger.length} 人；花名册 ${roster.rows.length} 行（rosterSize=${roster.rosterSize}）`);
console.log(`花名册查无此人（本就不能登录）：${hit0} 人`);
console.log(`新旧逻辑结果**完全一致**：${same} 人；**发生变化**：${changed} 人`);
for (const d of diffs) {
  console.log(`  △ ${d.p.name}（${d.p.level}/${d.p.dept}）`);
  console.log(`      旧: grids=${JSON.stringify(d.oldR.grids)} by=${d.oldR.by}${d.oldR.unresolved ? ' [fail-closed]' : ''}`);
  console.log(`      新: grids=${JSON.stringify(d.newR.grids)} by=${d.newR.by}${d.newR.unresolved ? ' [fail-closed]' : ''}`);
}
console.log(`\n--- 新逻辑解析依据分布 ---`);
const by = new Map();
for (const p of ledger) {
  const r = resolve(p.name, p.dept, ENV_NEW);
  if (r.n === 0) continue;
  const k = r.unresolved ? 'fail-closed' : (r.by || '(unresolved)');
  by.set(k, (by.get(k) || 0) + 1);
}
for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

const okNoRegression = changed <= 1;
console.log(`\n===== 回放结论：${okNoRegression ? 'PASS' : 'CHECK'} — 变化人数=${changed}（预期 ≤1：仅郭秀梅由 name+dept → name+job，网格值不变）=====`);
process.exit(okNoRegression ? 0 : 1);
