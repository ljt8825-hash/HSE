/* CF-WPS-22 只读审计：用「姓名 + 职位」消歧的可行性（业务口径 2026-09-17）
 *
 * 用户口径：以后再出现重名，可用「姓名 + 职位」区分——因为**职位是乡镇作业中心经理、管理员及以上的才是网格长**。
 *
 * 本脚本回答（全部只读，零写入；走生产 Pages + 飞书数据源）：
 *   Q1 台账 68 人逐一去花名册按姓名检索，各自命中几行？花名册侧「职位」实际长什么样？
 *   Q2 若把命中行按「职位 ∈ 白名单」过滤，能否收敛到唯一？会不会把原本可解析的人打成 0 命中（fail-closed）？
 *   Q3 郭秀梅（台账 分级=管理员）在花名册的职位是「人工班长」——白名单口径下会怎样？
 *
 * 为什么必须先审计：花名册「职位」是人事职位（如 人工班长 / 乡镇保洁员），与台账「分级」
 * （管理员 / 乡镇作业中心经理 / 公司管理）**不是同一套枚举**，直接拿花名册职位当网格长判据可能把
 * 真实网格长过滤掉。
 *
 * Run: node test/cfwps22-job-disambig-audit.mjs
 */
import fs from 'node:fs';
import { e2eAccount } from './e2e-account.mjs';

const workerMod = await import('../index.js');
const { gridLeaderJobs, isGridLeaderJob, narrowDuplicateName, PATROL_GRID_BY } = workerMod;

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';
const CSV = process.env.LEDGER_CSV || 'G:/hse-dashboard/artifacts/cf-wps-19b/网格长台账_员工编码对照表.csv';
const _acct = e2eAccount();
const ACCOUNT = [_acct.phone, _acct.password];
// 反例：按用户口述字面（台账词表）直接匹配花名册「职位」——用于证明这条路走不通
const JOB_LITERAL = [/乡镇作业中心经理/, /管理员/];
const WL_DEFAULT = gridLeaderJobs({});

async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(PAGES + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let json = {}; try { json = JSON.parse(t); } catch { /* noop */ }
  return { status: r.status, json, text: t };
}

// --- 极简带引号 CSV 解析 ---
function parseCsv(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
const head = rows.shift();
const idx = (n) => head.indexOf(n);
const ledger = rows.filter((r) => (r[idx('姓名')] || '').trim()).map((r) => ({
  name: r[idx('姓名')].trim(), phone: r[idx('手机号')].trim(), level: r[idx('分级')].trim(), dept: r[idx('台账所属部门')].trim(),
}));
console.log(`台账读取 ${ledger.length} 人；表头=${head.join('|')}`);

const lg = await j('POST', '/api/mobile/auth/login', { phone: ACCOUNT[0], password: ACCOUNT[1] });
const token = lg.json.token || '';
if (!token) { console.log(`登录失败 status=${lg.status} ${lg.text.slice(0, 200)}`); process.exit(1); }

const results = [];
const inLiteral = (h) => JOB_LITERAL.some((re) => re.test(h.job || ''));         // 反例：字面正则
const inWhitelist = (h) => isGridLeaderJob(h.job, WL_DEFAULT);                    // 正解：代码默认白名单（精确等值）
for (const p of ledger) {
  const r = await j('GET', `/api/mobile/roster?q=${encodeURIComponent(p.name)}&limit=200`, null, token);
  const hits = (r.json.items || []).filter((it) => it.name === p.name);
  const wl = hits.filter(inWhitelist);
  const lit = hits.filter(inLiteral);
  const byDept = hits.filter((it) => it.dept && (it.dept === p.dept || it.dept.includes(p.dept) || p.dept.includes(it.dept)));
  results.push({ ...p, hits, wl, lit, byDept });
  if (hits.length !== 1) {
    console.log(`\n[同名/多命中] ${p.name}（台账 分级=${p.level} 部门=${p.dept}）命中 ${hits.length} 行：`);
    for (const h of hits) console.log(`    ${h.code}  ${h.dept}  职位=${h.job}  area=${h.area || '(空)'}  ${inWhitelist(h) ? '✅网格长' : '❌非网格长（白名单外）'}`);
  }
}

const dup = results.filter((r) => r.hits.length > 1);
console.log(`\n===== 统计 =====`);
console.log(`台账 ${results.length} 人；花名册命中 1 行 ${results.length - dup.length} 人；多行 ${dup.length} 人；0 行 ${results.filter((r) => r.hits.length === 0).length} 人`);

const jobDist = new Map();
for (const r of results) for (const h of r.hits) jobDist.set(h.job || '(空)', (jobDist.get(h.job || '(空)') || 0) + 1);
console.log(`\n台账 68 人对应花名册行的「职位」分布（Top 20）：`);
[...jobDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`    ${String(v).padStart(3)}  ${k}`));

console.log(`\n--- 反例：按字面正则 ${JOB_LITERAL.map(String).join(' | ')} 过滤花名册「职位」---`);
const litBroken = results.filter((r) => r.hits.length > 0 && r.lit.length === 0);
console.log(`会被打成 0 命中（fail-closed）：${litBroken.length} 人 ← 证明字面实现不可用（两套词表不同）`);
console.log(`    例：${litBroken.slice(0, 3).map((r) => `${r.name}(${r.hits.map((h) => h.job).join('/')})`).join('  ')}`);

console.log(`\n--- 正解：按代码默认「网格长职位」白名单（精确等值匹配）过滤 ---`);
console.log(`白名单 = ${[...WL_DEFAULT.exact].join(' , ')}`);
const broken = [], narrowed = [];
for (const r of results) {
  if (r.hits.length === 0) continue;
  if (r.hits.length > 1 && r.wl.length === 1) narrowed.push(r);
  else if (r.hits.length === 1 && r.wl.length === 0) broken.push(r); // 唯一命中却是非网格长 → 只记录，不误杀（唯一姓名路径不过滤）
}
console.log(`多命中且白名单收敛到唯一：${narrowed.length} 人`);
for (const r of narrowed) console.log(`    ${r.name}（${r.level} / ${r.dept}）→ ${r.wl[0].code} ${r.wl[0].job} ${r.wl[0].dept}`);
console.log(`姓名唯一但职位非白名单（姓名唯一路径不做职位过滤，仅提示）：${broken.length} 人`);
for (const r of broken) console.log(`    ${r.name}（${r.level} / ${r.dept}）职位=${r.hits[0].job}`);

console.log(`\n--- 重名组明细（职位白名单 vs 部门收敛）---`);
for (const r of dup) {
  console.log(`  ${r.name} ×${r.hits.length}  台账: ${r.level}/${r.dept}`);
  const nr = narrowDuplicateName(r.hits.map((h) => ({ dept: h.dept, job: h.job, areaOnDuty: h.area, superior: '', name: h.name })), { dept: r.dept, superior: '' }, {});
  const finalDesc = nr.rows.length === 1 ? `网格=${JSON.stringify(normalizeOne(nr.rows[0]))} by=${nr.by}` : `fail-closed（候选 ${nr.rows.length}）`;
  console.log(`     职位白名单命中 ${r.wl.length} 行；部门收敛命中 ${r.byDept.length} 行；**新逻辑判定：${finalDesc}**`);
  for (const h of r.hits) console.log(`     ${h.code}  ${h.dept}  职位=${h.job}  area=${h.area || '(空)'}  ${inWhitelist(h) ? '✅' : '❌'}`);
}
function normalizeOne(row) {
  const src = row.areaOnDuty || row.dept;
  return String(src || '').split(/[+＋,，、/;；|]+/).map((s) => s.trim()).filter((s) => s && s !== '0');
}
console.log(`\n（解析依据常量：${JSON.stringify(PATROL_GRID_BY)}）`);
