/* CF-WPS-22 只读审计：花名册「职位」全量分布（用于设计「姓名+职位」消歧白名单）
 *
 * 目的：用户口径「职位是乡镇作业中心经理、管理员及以上的才是网格长」。
 * 实测发现在花名册里「职位」是人事职位枚举（人工班长/人工片区长/乡镇保洁员…），
 * 与台账「分级」（管理员/乡镇作业中心经理/公司管理）**不是同一套词**，直接按字面过滤会把 62/68 人打挂。
 * 因此需要先拿到花名册全量职位清单，才能确定哪些职位属于「网格长」。
 *
 * 枚举手段（同 cfwps21-dupname-audit）：/api/mobile/roster?q= 为包含匹配、limit≤200，
 * 员工编码 8 位全以 00 开头 ⇒ 编码前缀 BFS 逐位展开，无损拉全，用 rosterSize 校验覆盖率。
 * 全只读、零写入。
 *
 * 产物：artifacts/cf-wps-22/roster-job-distribution.json
 * Run: node test/cfwps22-roster-job-dist.mjs
 */
import fs from 'node:fs';
import { e2eAccount } from './e2e-account.mjs';

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';
const OUT = process.env.OUT_JSON || 'G:/hse-dashboard/artifacts/cf-wps-22/roster-job-distribution.json';
const _acct = e2eAccount();
const ACCOUNT = [_acct.phone, _acct.password];
const MAX_REQUESTS = 700;

async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(PAGES + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
  const t = await r.text(); let json = {}; try { json = JSON.parse(t); } catch { /* noop */ }
  return { status: r.status, json, text: t };
}

const lg = await j('POST', '/api/mobile/auth/login', { phone: ACCOUNT[0], password: ACCOUNT[1] });
const token = lg.json.token || '';
if (!token) { console.log(`登录失败 status=${lg.status} ${lg.text.slice(0, 200)}`); process.exit(1); }

let reqs = 0;
const rows = new Map();
async function fetchQ(q) {
  reqs++;
  const r = await j('GET', `/api/mobile/roster?limit=200&q=${encodeURIComponent(q)}`, null, token);
  return { total: r.json.total ?? -1, items: r.json.items || [], rosterSize: r.json.rosterSize ?? -1 };
}
const { rosterSize } = await fetchQ('0');
console.log(`花名册 rosterSize=${rosterSize}`);

let frontier = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
let overflow = 0;
while (frontier.length && reqs < MAX_REQUESTS) {
  const next = [];
  for (const q of frontier) {
    if (reqs >= MAX_REQUESTS) break;
    const { total, items } = await fetchQ(q);
    if (total <= 200 || q.length >= 8) {
      if (total > 200) overflow++;
      for (const it of items) rows.set(it.recordId, it);
      continue;
    }
    for (const d of '0123456789') next.push(q + d);
  }
  frontier = next;
}
const all = [...rows.values()];
console.log(`请求数 ${reqs}；取回 ${all.length} 行（覆盖 ${(all.length / rosterSize * 100).toFixed(1)}%）；未能细分分支 ${overflow}`);

const count = (key) => {
  const m = new Map();
  for (const r of all) { const k = (r[key] || '(空)').trim() || '(空)'; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const jobs = count('job');
console.log(`\n--- 花名册「职位」全量分布（${jobs.length} 种）---`);
for (const [k, v] of jobs) console.log(`  ${String(v).padStart(4)}  ${k}`);

const byName = new Map();
for (const r of all) { const n = (r.name || '').trim(); if (!n) continue; if (!byName.has(n)) byName.set(n, []); byName.get(n).push(r); }
const dups = [...byName.entries()].filter(([, v]) => v.length > 1);
const dupJobVaries = dups.filter(([, v]) => new Set(v.map((r) => (r.job || '').trim())).size === v.length);
const dupSameDept = dups.filter(([, v]) => { const d = v.map((r) => (r.dept || '').trim()); return new Set(d).size < d.length; });
console.log(`\n重名 ${dups.length} 组 / ${dups.reduce((s, [, v]) => s + v.length, 0)} 人`);
console.log(`  「职位」互不相同（可单独靠职位消歧）：${dupJobVaries.length} 组`);
console.log(`  「所属部门」相同（同班组同名，最顽固）：${dupSameDept.length} 组`);
for (const [n, v] of dups) console.log(`    ${n} ×${v.length}: ${v.map((r) => `${r.dept}/${r.job}`).join('  |  ')}`);

fs.mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(), pages: PAGES, rosterSize, fetchedRows: all.length, requests: reqs,
  jobs: jobs.map(([job, n]) => ({ job, n })), duplicates: dups.map(([name, v]) => ({ name, rows: v.map((r) => ({ code: r.code, dept: r.dept, job: r.job, area: r.area })) })),
  rows: all,
}, null, 2), 'utf8');
console.log(`\n已写入 ${OUT}`);
