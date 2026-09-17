/* CF-WPS-11: REAL-MACHINE test — Worker login closed loop against real WPS identity Sheet 14.
 * GUARDS:
 *  - writes go to Sheet 14 ONLY, every created row carries employee_code CF-WPS-11-TEST-* prefix
 *  - production sheet 3 + roster sheet 11: READ-ONLY (count snapshots must be identical)
 *  - T1 uses a REAL roster employee_code (read from sheet 11) to prove the identity bridge
 *  - test passwords are synthetic; real employee passwords/ID numbers are NEVER used/printed
 *  - all test rows deleted via batch_delete at the end; pollution check after cleanup
 * Run: node test/cfwps11-realtest.mjs
 */
import { readFileSync } from 'node:fs';

// ---- load server/.env in memory ----
const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) envVar[m[1]] = m[2].trim();
}
const APP_ID = envVar.WPS_APP_ID;
const APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';
const IDENTITY_SHEET_ID = '14';
const ROSTER_SHEET_ID = '11';
const PROD_SHEET_ID = '3';
if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing credentials in server/.env'); process.exit(1); }

const bcrypt = (await import('bcryptjs')).default;
const workerMod = await import('../index.js');
const worker = workerMod.default;

// ---- WPS direct helpers (create/delete/list; reads+writes ONLY to sheet 14) ----
let appToken = '';
async function getAppToken() {
  if (appToken) return appToken;
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json();
  appToken = j.access_token;
  return appToken;
}
async function listRecords(sheetId, pageNum = 1, pageSize = 200) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAppToken()}` },
    body: JSON.stringify({ page_num: pageNum, page_size: pageSize, prefer_id: false, show_record_extra_info: false }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json();
  return ((j?.data?.records) || []).map((r) => ({ ...r, fields_value: r.fields_value ?? r.fields }));
}
async function countSheet(sheetId) {
  let n = 0;
  for (let p = 1; ; p++) {
    const recs = await listRecords(sheetId, p, 200);
    n += recs.length;
    if (recs.length < 200) break;
  }
  return n;
}
async function createRecords(sheetId, rows) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAppToken()}` },
    body: JSON.stringify({ prefer_id: false, records: rows.map((f) => ({ fields_value: JSON.stringify(f) })) }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => null);
  return { status: res.status, ids: ((j?.data?.records) || []).map((r) => String(r.id)).filter(Boolean) };
}
async function batchDelete(sheetId, ids) {
  const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/batch_delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAppToken()}` },
    body: JSON.stringify({ records: ids.map(String) }),
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---- worker env (real credentials) ----
const SESSION_SECRET = 'cfwps11-realtest-session-secret-0123456789'; // test-only; not production
function workerEnv(overrides = {}) {
  return {
    WPS_CLIENT_ID: APP_ID,
    WPS_CLIENT_SECRET: APP_SECRET,
    WPS_OPENAPI_BASE: BASE,
    WPS_DBSHEET_FILE_ID: FILE_ID,
    WPS_DBSHEET_IDENTITY_SHEET_ID: IDENTITY_SHEET_ID,
    IDENTITY_ROSTER_SHEET_ID: ROSTER_SHEET_ID,
    IDENTITY_ROSTER_CHECK: 'on',
    IDENTITY_ACTIVE_STATUS: '正常',
    MOBILE_LOGIN_ENABLED: 'true',
    WORKER_SESSION_SECRET: SESSION_SECRET,
    MOBILE_SESSION_TTL_SECONDS: '7200',
    ...overrides,
  };
}

const allBodies = [];
let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_REAL ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

async function callWorker(path, { body, token, method } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new Request(`https://worker.local${path}`, {
    method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined,
  });
  const res = await worker.fetch(req, workerEnv());
  const text = await res.text();
  allBodies.push(text);
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const TAG = 'CF-WPS-11-TEST';
const PW1 = 'Cfwps11@Test001', PW2 = 'Cfwps11@Test002', PW3 = 'Cfwps11@Test003', PW5 = 'Cfwps11@Test005';
const TODAY = new Date().toISOString().slice(0, 10);

console.log('===== baseline (read-only snapshots) =====');
const prodCountBefore = await countSheet(PROD_SHEET_ID);
const rosterCountBefore = await countSheet(ROSTER_SHEET_ID);
const identityCountBefore = await countSheet(IDENTITY_SHEET_ID);
console.log(`sheet3=${prodCountBefore} sheet11=${rosterCountBefore} sheet14=${identityCountBefore}`);

// pick a real, active roster employee_code (read-only) for the bridge-positive test
let realCode = '', realStatus = '';
for (const r of await listRecords(ROSTER_SHEET_ID)) {
  let fv = r.fields_value; if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { continue; } }
  const code = String(fv?.['员工编码'] ?? '').trim();
  const st = String(fv?.['用工关系状态'] ?? '').trim();
  if (code && st && !st.includes('离职')) { realCode = code; realStatus = st; break; }
}
if (!realCode) { console.error('[GUARD] no active roster employee_code found — cannot prove bridge'); process.exit(1); }
console.log(`[bridge] real roster code selected (status=${realStatus}, value not printed)`);

console.log('===== create test identity rows (sheet 14 only) =====');
// 逐条创建。行4故意与行3同手机号：WPS Phone 列平台级唯一约束会 500（首跑实证）→ 改为「预期拒绝」断言。
// 关键行（1/2/3/5）任一失败即中止；行4失败不算失败（正是平台唯一性证据）。
const testRows = [
  { 'employee_code': realCode, '姓名': `${TAG}-甲`, '手机号码': '13900001101', 'password_hash': bcrypt.hashSync(PW1, 10), '部门': '测试部门', '职位': '测试职位', '网格长等级': '三级', '身份状态': '正常', '创建时间': TODAY, '更新时间': TODAY },
  { 'employee_code': `${TAG}-002`, '姓名': `${TAG}-乙`, '手机号码': '13900001102', 'password_hash': bcrypt.hashSync(PW2, 10), '部门': '测试部门', '职位': '测试职位', '网格长等级': '', '身份状态': '停用', '创建时间': TODAY, '更新时间': TODAY },
  { 'employee_code': `${TAG}-003`, '姓名': `${TAG}-丙`, '手机号码': '13900001103', 'password_hash': bcrypt.hashSync(PW3, 10), '部门': '测试部门', '职位': '测试职位', '网格长等级': '', '身份状态': '正常', '创建时间': TODAY, '更新时间': TODAY },
  { 'employee_code': `${TAG}-004`, '姓名': `${TAG}-丁`, '手机号码': '13900001103', 'password_hash': bcrypt.hashSync(PW3, 10), '部门': '测试部门', '职位': '测试职位', '网格长等级': '', '身份状态': '正常', '创建时间': TODAY, '更新时间': TODAY },
  { 'employee_code': `${TAG}-005`, '姓名': `${TAG}-戊`, '手机号码': '13900001105', 'password_hash': bcrypt.hashSync(PW5, 10), '部门': '测试部门', '职位': '测试职位', '网格长等级': '', '身份状态': '正常', '创建时间': TODAY, '更新时间': TODAY },
];
const created = { status: 200, ids: [] };
let dupRejected = false;
for (let i = 0; i < testRows.length; i++) {
  let done = false, lastStatus = 0;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    const r = await createRecords(IDENTITY_SHEET_ID, [testRows[i]]);
    lastStatus = r.status;
    if (r.status === 200 && r.ids.length === 1) { created.ids.push(r.ids[0]); done = true; }
    else { await new Promise((res) => setTimeout(res, 1200 * attempt)); }
  }
  if (!done) {
    if (i === 3 && lastStatus === 500) { dupRejected = true; console.log('  seed row 4 (duplicate phone) rejected with 500 — platform phone-uniqueness evidence'); continue; }
    created.status = 500; break;
  }
}
assert(dupRejected, 'G-seed WPS Phone column rejects duplicate phone (platform-level uniqueness)', dupRejected ? 'HTTP 500 on duplicate' : 'duplicate was accepted!');
assert(created.status === 200 && created.ids.length === 4, 'seed 4 unique test rows into sheet 14 (per-row + retry)', `ids=${created.ids.length}`);

console.log('===== matrix (real) =====');
// A: normal login through the real bridge (roster check ON, real roster employee_code)
let TOKEN = '';
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: '13900001101', password: PW1 } });
  TOKEN = r.json?.token || '';
  assert(r.status === 200 && r.json?.success && TOKEN && r.json?.employee?.employee_code === realCode,
    'A normal login (roster bridge ON, real employee_code)', `status=${r.status}`);
}
// E: TEST-prefix employee_code not in roster -> bridge rejects
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: '13900001105', password: PW5 } });
  assert(r.status === 401 && r.json?.message === '手机号或密码错误', 'E employee_code not in roster -> uniform 401', `status=${r.status}`);
  // roster check off -> config semantics
  const req2 = new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13900001105', password: PW5 }),
  });
  const r2 = await worker.fetch(req2, workerEnv({ IDENTITY_ROSTER_CHECK: 'off' }));
  const t2 = await r2.text(); allBodies.push(t2);
  assert(r2.status === 200, 'E2 roster check off -> login OK', `status=${r2.status}`);
}
// B unknown phone
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: '13999990000', password: 'Whatever@1' } });
  assert(r.status === 401 && r.json?.message === '手机号或密码错误', 'B unknown phone -> uniform 401', `status=${r.status}`);
}
// C wrong password
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: '13900001101', password: 'WrongPass@9' } });
  assert(r.status === 401 && r.json?.message === '手机号或密码错误', 'C wrong password -> uniform 401', `status=${r.status}`);
}
// D disabled identity
{
  const r = await callWorker('/api/mobile/auth/login', { body: { phone: '13900001102', password: PW2 } });
  assert(r.status === 401 && r.json?.message === '手机号或密码错误', 'D disabled identity -> uniform 401', `status=${r.status}`);
}
// G: duplicate phone cannot exist (WPS Phone column platform-uniqueness, asserted at seed time).
// Worker 侧「多命中→统一401」防御已在 mock 套件覆盖；此处关断花名册校验（单变量），
// 验证唯一手机号 + 正确密码 + TEST 编码可正常登录（TEST 编码不在花名册，roster on 时由 E 覆盖）。
{
  const req = new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '13900001103', password: PW3 }),
  });
  const res = await worker.fetch(req, workerEnv({ IDENTITY_ROSTER_CHECK: 'off' }));
  const text = await res.text(); allBodies.push(text);
  assert(res.status === 200, 'G platform-unique phone -> single match login OK (multi-match defense in mock)', `status=${res.status}`);
}
// H/I/J/K input validation
{
  const r1 = await callWorker('/api/mobile/auth/login', { body: { phone: '', password: 'x' } });
  const r2 = await callWorker('/api/mobile/auth/login', { body: { phone: '13900001101', password: '' } });
  const r3 = await callWorker('/api/mobile/auth/login', { body: { phone: '139000011011234567890123', password: 'x' } });
  const r4 = await callWorker('/api/mobile/auth/login', { body: { phone: "1' OR '1'='1", password: 'x' } });
  assert(r1.status === 400 && r2.status === 400 && r3.status === 400 && r4.status === 400,
    'H/I/J/K invalid inputs -> 400 fail-closed', `${r1.status}/${r2.status}/${r3.status}/${r4.status}`);
}

console.log('===== session (real) =====');
// /me with real token
{
  const r = await callWorker('/api/mobile/me', { token: TOKEN });
  assert(r.status === 200 && r.json?.employee?.employee_code === realCode, 'me returns session identity', `status=${r.status}`);
}
// M logout / N after logout
{
  const r = await callWorker('/api/mobile/auth/logout', { token: TOKEN });
  assert(r.status === 200, 'M logout -> 200', `status=${r.status}`);
  const r2 = await callWorker('/api/mobile/me', {});
  assert(r2.status === 401, 'N access without token after logout -> 401', `status=${r2.status}`);
}
// O tamper
{
  const r = await callWorker('/api/mobile/me', { token: TOKEN.slice(0, -4) + 'AAAA' });
  assert(r.status === 401, 'O tampered token -> 401', `status=${r.status}`);
}
// L expiry (self-crafted expired session token signed with the same test secret)
{
  const { signJwtHs256 } = workerMod;
  const now = Math.floor(Date.now() / 1000);
  const expired = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: 'X', iat: now - 100, exp: now - 5, jti: 'exp' }, SESSION_SECRET);
  const r = await callWorker('/api/mobile/me', { token: expired });
  assert(r.status === 401, 'L expired session -> 401', `status=${r.status}`);
}

console.log('===== leak scan (all real responses) =====');
{
  const joined = allBodies.join('\n');
  const checks = [
    ['bcrypt hash pattern', !/\$2[aby]\$/.test(joined)],
    ['session secret', !joined.includes(SESSION_SECRET)],
    ['wps app secret', !joined.includes(APP_SECRET)],
    ['wps app token', !joined.includes(await (async () => appToken)())],
    ['test password literals', !joined.includes(PW1) && !joined.includes(PW2) && !joined.includes(PW3) && !joined.includes(PW5)],
    ['test full phones', !joined.includes('13900001101') && !joined.includes('13900001102') && !joined.includes('13900001103') && !joined.includes('13900001105')],
    ['ID-card-like 18-digit', !/\d{17}[\dXx]/.test(joined)],
  ];
  for (const [n, c] of checks) assert(c, `leak-scan: ${n}`, c ? '' : 'LEAK DETECTED');
}

console.log('===== cleanup + pollution check =====');
{
  const del = await batchDelete(IDENTITY_SHEET_ID, created.ids);
  assert(del.status === 200, 'batch_delete created test rows', `status=${del.status} n=${created.ids.length}`);
}
await new Promise((r) => setTimeout(r, 1500)); // eventual consistency grace
{
  let residue = 0;
  for (const r of await listRecords(IDENTITY_SHEET_ID)) {
    let fv = r.fields_value; if (typeof fv === 'string') { try { fv = JSON.parse(fv); } catch { continue; } }
    const code = String(fv?.['employee_code'] ?? '');
    const name = String(fv?.['姓名'] ?? '');
    if (code.includes(TAG) || name.includes(TAG)) residue++;
  }
  assert(residue === 0, 'identity sheet residue = 0', `residue=${residue}`);
}
{
  const identityCountAfter = await countSheet(IDENTITY_SHEET_ID);
  assert(identityCountAfter === identityCountBefore, 'sheet 14 count restored to baseline', `${identityCountBefore} -> ${identityCountAfter}`);
  const prodCountAfter = await countSheet(PROD_SHEET_ID);
  assert(prodCountAfter === prodCountBefore, 'sheet 3 (production) untouched', `${prodCountBefore} -> ${prodCountAfter}`);
  const rosterCountAfter = await countSheet(ROSTER_SHEET_ID);
  assert(rosterCountAfter === rosterCountBefore, 'sheet 11 (roster) untouched (read-only)', `${rosterCountBefore} -> ${rosterCountAfter}`);
}

console.log(`\n===== RESULT: ${pass} PASS_REAL, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
