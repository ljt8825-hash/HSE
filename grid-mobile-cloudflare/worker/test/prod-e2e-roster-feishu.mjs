/* 生产真机 E2E：登录 → 组织关系 → 花名册（只读）。用完即删。
 * 需 node24 + NODE_USE_ENV_PROXY=1 + HTTPS_PROXY=7890（node22 fetch 不认代理 env）
 */
import { e2eAccount } from './e2e-account.mjs';

const BASE = process.env.WORKER_BASE || 'https://grid-mobile-cloudflare-worker.ljt8825.workers.dev';

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_PROD ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

async function j(method, path, body, token) {
  const t0 = Date.now();
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, ms: Date.now() - t0 };
}

async function login(phone, password) {
  const r = await j('POST', '/api/mobile/auth/login', { phone, password });
  return r.json.token || '';
}

console.log('===== 登录 =====');
const _acct = e2eAccount();
const _hyt = e2eAccount('huangyuantong');
const tokH = await login(_hyt.phone, _hyt.password); // 黄元同（一级网格长 / 公司管理）
const tokZ = await login(_acct.phone, _acct.password); // 张万恒（片区经理）
assert(!!tokH, 'P1 黄元同登录成功');
assert(!!tokZ, 'P2 张万恒登录成功');
if (!tokH) { console.log(`\nRESULT: ${pass} passed, ${failn} failed`); process.exit(1); }

console.log('===== 花名册（飞书「花名册」表，真实 1291 人） =====');
const r1 = await j('GET', '/api/mobile/roster?area=' + encodeURIComponent('宁城街道一班') + '&limit=200', null, tokH);
assert(r1.status === 200 && r1.json.source === 'feishu', 'P3 花名册接口 200 / source=feishu', `status=${r1.status} source=${r1.json.source} ms=${r1.ms}`);
assert(r1.json.rosterSize === 1291, 'P4 全量在职 1291 人', `rosterSize=${r1.json.rosterSize}`);
assert(r1.json.total === 21, 'P5 宁城街道一班 命中 21 人', `total=${r1.json.total}`);
assert(r1.json.items.every((x) => x.name && x.code), 'P6 每人都有姓名+员工编码');
assert(r1.json.items.every((x) => (x.dept || '').includes('宁城街道一班') || (x.area || '').includes('宁城街道一班')), 'P7 班组口径一致');
assert(!/\d{17}[\dXx]/.test(r1.text), 'P8 身份证号码未下发');
console.log('   样例:', JSON.stringify(r1.json.items.slice(0, 3).map((x) => `${x.name}/${x.job}/${x.dept}`)));

const r2 = await j('GET', '/api/mobile/roster?q=' + encodeURIComponent('马金'), null, tokH);
assert(r2.json.total >= 1, 'P9 姓名搜索可用', `total=${r2.json.total}`);

const r3 = await j('GET', '/api/mobile/roster', null, tokH);
assert(r3.json.filters.scopedToSelf === true, 'P10 无参收敛到本人部门（最小权限）', JSON.stringify(r3.json.filters));

console.log('===== 组织关系（台账「直接上级」） =====');
const o1 = await j('GET', '/api/mobile/org/subordinates', null, tokH);
assert(o1.status === 200 && o1.json.count === 20, 'P11 黄元同 20 个直接下级', `count=${o1.json.count}`);
assert(o1.json.managers.length === 11 && o1.json.admins.length === 9, 'P12 分层 11 片区经理 + 9 直属管理员',
  `managers=${o1.json.managers.length} admins=${o1.json.admins.length}`);

if (tokZ) {
  const o2 = await j('GET', '/api/mobile/org/subordinates', null, tokZ);
  assert(o2.status === 200 && o2.json.count === 1 && o2.json.admins[0].name === '马金华', 'P13 张万恒 → 马金华',
    JSON.stringify(o2.json.admins.map((a) => a.name + '/' + a.department)));
  const o3 = await j('GET', '/api/mobile/org/subordinates?under=' + encodeURIComponent('王臣祥'), null, tokZ);
  assert(o3.status === 403, 'P14 越权下钻 → 403', `status=${o3.status}`);
}

console.log('===== 花名册无手机号列的事实确认 =====');
const r4 = await j('GET', '/api/mobile/roster?area=' + encodeURIComponent('宁城街道一班'), null, tokH);
assert(r4.json.items.every((x) => x.phone === ''), 'P15 花名册无手机号列 → phone 恒空（拨号无数据，业务侧「暂不补」）');

console.log(`\n===== RESULT: ${pass} passed, ${failn} failed =====`);
if (failn) process.exit(1);
