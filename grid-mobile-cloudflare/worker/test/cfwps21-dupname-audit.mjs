/* CF-WPS-21 只读审计：花名册重名（真实数据）
 *
 * 背景（用户诉求第 7 条）：花名册 1291 人存在重名。巡查解析网格时用「登录人姓名」去花名册匹配，
 * 姓名不唯一时按新键优先级消歧：① 手机号 → ② 员工编码 → ③ 姓名唯一 → ④ 姓名+所属部门 → ⑤ 姓名+直接上级，
 * 都收敛不到唯一 → fail-closed（拿不到网格 → 无法巡查）。
 *
 * 本脚本回答三个业务问题（全部只读，走生产公开 API，零写入）：
 *   Q1 花名册到底有几组重名、涉及几人？（用户口径：24 个重名）
 *   Q2 这些重名行能否用「所属部门」收敛到唯一？
 *   Q3 重名者里有多少是「一线网格作业人员」（部门为 xx街道/乡镇 + 班），即真正会登 H5 的人？
 *
 * 枚举手段：/api/mobile/roster?q= 是「包含匹配」，limit 上限 200。
 *   员工编码形如 00347342（8 位，全部以 00 开头）→ 用编码前缀 BFS 逐位展开，
 *   直到单次命中 ≤200 取回，从而无损拉全 1291 行。收尾用 rosterSize 校验覆盖率。
 *
 * Run: node test/cfwps21-roster-dup-audit.mjs
 */
import { e2eAccount } from './e2e-account.mjs';

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';
const _acct = e2eAccount();
const ACCOUNT = [_acct.phone, _acct.password, '张万恒'];
const MAX_REQUESTS = 600;

async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await fetch(PAGES + path, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json, text };
}

const [phone, pw, who] = ACCOUNT;
const lg = await j('POST', '/api/mobile/auth/login', { phone, password: pw });
const token = lg.json.token || '';
if (!token) { console.log(`登录失败（${who}）status=${lg.status} ${lg.text.slice(0, 200)}`); process.exit(1); }
const me = (await j('GET', '/api/mobile/me', null, token)).json.employee || {};
console.log(`登录：${me.name}（${me.role} / ${me.grid_level} / ${me.department || '无部门'}）`);

// ---------- Q1 全量枚举 ----------
let reqs = 0, overflow = 0;
const rows = new Map(); // recordId -> item
async function fetchQ(q) {
  reqs++;
  const r = await j('GET', `/api/mobile/roster?limit=200&q=${encodeURIComponent(q)}`, null, token);
  return { total: r.json.total ?? -1, items: r.json.items || [], rosterSize: r.json.rosterSize ?? -1 };
}
const { rosterSize } = await fetchQ('0');
console.log(`花名册规模 rosterSize=${rosterSize}`);

console.log(`\n--- Q1 编码前缀 BFS 全量枚举 ---`);
let frontier = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
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
console.log(`请求数 ${reqs}，取回 ${rows.size} 行（覆盖 ${(rows.size / rosterSize * 100).toFixed(1)}%），未能细分的分支 ${overflow}`);

// ---------- Q2 重名分析 ----------
const byName = new Map();
for (const r of rows.values()) {
  if (!r.name) continue;
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}
const dups = [...byName.entries()].filter(([, v]) => v.length > 1);
const dupPeople = dups.reduce((s, [, v]) => s + v.length, 0);
console.log(`\n--- Q2 重名分析（姓名精确相同）---`);
console.log(`姓名总数 ${byName.size}；重名组数 ${dups.length}；涉及人数 ${dupPeople}（其余 ${byName.size - dups.length} 人姓名唯一）`);

const isFieldGrid = (d) => /街道|镇|乡/.test(d || '');
const contains = (a, b) => !!a && !!b && (a.includes(b) || b.includes(a));
let deptUnique = 0, deptAmbiguous = 0, noCode = 0, phoneRows = 0;
const ambiguousList = [];
for (const [name, list] of dups) {
  const depts = list.map((r) => r.dept || '');
  const uniqDept = new Set(depts.filter(Boolean));
  const hasPhone = list.some((r) => r.phone);
  const hasCode = list.every((r) => r.code);
  if (hasPhone) phoneRows++;
  if (!hasCode) noCode++;
  const resolvable = list.length === [...new Set(depts)].length && uniqDept.size === list.length;
  if (resolvable) deptUnique++; else { deptAmbiguous++; }
  const fieldCount = list.filter((r) => isFieldGrid(r.dept)).length;
  ambiguousList.push({ name, n: list.length, depts: [...new Set(depts)], resolvable, fieldCount, codes: list.map((r) => r.code) });
}
console.log(`部门唯一可收敛：${deptUnique} 组；部门不可收敛（同部门同名，需手机号/编码/上级）：${deptAmbiguous} 组`);
console.log(`其中含手机号的组：${phoneRows}；存在缺员工编码的组：${noCode}`);

// ---------- Q3 一线网格作业人员风险 ----------
const fieldRisk = ambiguousList.filter((d) => d.fieldCount > 0);
console.log(`\n--- Q3 一线网格作业人员（部门含 街道/镇/乡）重名清单 ---`);
if (!fieldRisk.length) console.log('（无：重名者均非一线网格作业人员）');
for (const d of fieldRisk) {
  console.log(`  ${d.name} ×${d.n} 部门=${JSON.stringify(d.depts)} ${d.resolvable ? '→ 部门可唯一收敛' : '⚠️ 部门不可收敛'}`);
  console.log(`     编码=${d.codes.join(' / ')}`);
}

console.log(`\n===== 审计结论 =====`);
console.log(`花名册 ${rosterSize} 人；实测重名组 ${dups.length} 组 / ${dupPeople} 人`);
console.log(`重名组中「部门可唯一收敛」${deptUnique} 组、「部门不可收敛」${deptAmbiguous} 组`);
console.log(`一线网格作业人员的重名风险组：${fieldRisk.length} 组（${fieldRisk.filter((d) => !d.resolvable).length} 组不可收敛）`);
console.log(`花名册手机号：${phoneRows ? '部分组有' : '全部为空（该键当前不生效，属预留）'}`);
