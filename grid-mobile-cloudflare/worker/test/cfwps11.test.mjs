/* CF-WPS-11: OFFLINE mock tests — mobile identity login closed loop.
 * 2026-09 改版：登录人员唯一来源 = 飞书「网格长信息台账」。
 *   账号 = 台账手机号；密码 = 姓名拼音首字母(小写) + 手机号后4位；角色 = 分级映射。
 * GUARDS:
 *  - global fetch fully mocked: NO real network (any unmocked URL = hard fail)
 *  - all credentials are fixture values, never real ones
 *  - asserts uniform auth-failure messages (no account enumeration)
 *  - asserts no derived password / full phone / secret in ANY response
 * Run: node test/cfwps11.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const { signJwtHs256, mapLedgerRecord, pinyinInitials } = workerMod;

// ---- fixture data (all fake) ----
const SESSION_SECRET = 'mock-session-secret-0123456789abcdef';
const FS_APP_TOKEN = 'mock-fs-app-token-xyz';
const FS_APP_ID = 'mock-fs-app-id';
const FS_APP_SECRET = 'mock-fs-app-secret';
const LEDGER_TABLE_ID = 'tblMockLedger';

// 密码按派生规则预计算（与 Worker 同规则；pinyinInitials 亦从 worker 导出以交叉断言）
// 张三->zs 李四->ls 王五->ww 赵六->zl
const PW = (ini, phone) => ini + phone.slice(-4);
const P1 = '13911112222', P2 = '13911113333', P3 = '13911114444', P4 = '13911115555', P5 = '13911116666', P6 = '13911117777';
const LEDGER_ROWS = [
  { record_id: 'L1', fields: { '序号': '1', '姓名': '张三', '直接上级': '领导甲', '所属部门': '测试一班', '职位': '管理员', '网格长等级': '三级网格长', '手机号': P1, '分级': '管理员' } },
  { record_id: 'L2', fields: { '姓名': '李四', '直接上级': '领导甲', '所属部门': '测试片区', '职位': '乡镇作业中心经理', '网格长等级': '二级网格长', '手机号': P2, '分级': '乡镇作业中心经理' } },
  { record_id: 'L3', fields: { '姓名': '王五', '直接上级': '领导乙', '所属部门': '安环管理部', '职位': '经理', '网格长等级': '一级网格长', '手机号': P3, '分级': '公司管理' } },
  { record_id: 'L4', fields: { '姓名': '赵六', '所属部门': '重复组', '职位': '管理员', '手机号': P4, '分级': '管理员' } },
  { record_id: 'L5', fields: { '姓名': '赵六', '所属部门': '重复组', '职位': '管理员', '手机号': P4, '分级': '管理员' } },
  { record_id: 'L6', fields: { '姓名': '孙七', '所属部门': '临时组', '职位': '临时工', '手机号': P5, '分级': '临时工' } },
  { record_id: 'L7', fields: { '姓名': '周八', '所属部门': '空手机号组', '职位': '管理员', '手机号': '', '分级': '管理员' } },
];

// ---- mock fetch: intercept feishu upstream; unmocked URL = hard fail ----
let mockCalls = [];
// 表名解析契约（同 worker/storage/index.js ROLE_TABLE_NAMES）。模块级缓存按 appToken 生效，
// 因此「身份表缺失」用例需换一个全新 appToken 以强制重新解析。
let mockTableNames = ['H5移动端身份表', 'H5花名册表', 'H5员工日常不安全行为台账'];
globalThis.fetch = async (url, init) => {
  const u = String(url instanceof URL ? url : url);
  mockCalls.push(u);
  if (u.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ code: 0, tenant_access_token: 'mock-fs-tenant-token', expire: 7200 }), { status: 200 });
  }
  if (/\/bitable\/v1\/apps\/[^/]+\/tables(\?|$)/.test(u)) {
    // listTables（按名解析）：返回当前 mockTableNames
    const items = mockTableNames.map((n, i) => ({ table_id: `tblMockName_${i}`, name: n }));
    return new Response(JSON.stringify({ code: 0, data: { items, has_more: false } }), { status: 200 });
  }
  if (u.includes(`/bitable/v1/apps/${FS_APP_TOKEN}/tables/${LEDGER_TABLE_ID}/records`)) {
    return new Response(JSON.stringify({ code: 0, data: { items: LEDGER_ROWS, has_more: false } }), { status: 200 });
  }
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

function workerEnv(overrides = {}) {
  return {
    STORAGE_BACKEND: 'feishu',
    FS_APP_TOKEN,
    FS_APP_ID,
    FS_APP_SECRET,
    FS_LEDGER_TABLE_ID: LEDGER_TABLE_ID,
    MOBILE_LOGIN_ENABLED: 'true',
    WORKER_SESSION_SECRET: SESSION_SECRET,
    MOBILE_SESSION_TTL_SECONDS: '7200',
    ...overrides,
  };
}

const allBodies = []; // {owner: 该响应对应的登录手机号|null, text}（登录者本人的手机号允许出现在自己的响应里）
let pass = 0, failn = 0;
function ok(name, extra = '') { pass++; console.log(`PASS_MOCK ${name}${extra ? ' :: ' + extra : ''}`); }
function fail(name, detail) { failn++; console.log(`FAIL ${name} :: ${detail}`); }
function assert(cond, name, detail) { cond ? ok(name, typeof detail === 'string' ? detail : '') : fail(name, detail); }

async function callLogin(body, env, headers = {}) {
  const req = new Request('https://worker.local/api/mobile/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.0.0.1', ...headers },
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  allBodies.push({ owner: body && body.phone, text });
  return { status: res.status, json: JSON.parse(text), text };
}
async function callMe(token, env, owner = null) {
  const req = new Request('https://worker.local/api/mobile/me', {
    method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  allBodies.push({ owner, text });
  return { status: res.status, json: JSON.parse(text), text };
}
async function callLogout(token, env) {
  const req = new Request('https://worker.local/api/mobile/auth/logout', {
    method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const res = await worker.fetch(req, env);
  const text = await res.text();
  allBodies.push({ owner: null, text });
  return { status: res.status, json: JSON.parse(text), text };
}

console.log('===== pinyinInitials units =====');
{
  assert(pinyinInitials('张三') === 'zs', 'pinyin: 张三 -> zs', pinyinInitials('张三'));
  assert(pinyinInitials('翟中坡') === 'zzp', 'pinyin: 翟(surname) -> z', pinyinInitials('翟中坡'));
  assert(pinyinInitials('曾宪生') === 'zxs', 'pinyin: 曾(surname) -> z', pinyinInitials('曾宪生'));
  assert(pinyinInitials('刘金涛') === 'ljt', 'pinyin: 刘金涛 -> ljt', pinyinInitials('刘金涛'));
  assert(pinyinInitials('盖广勇') === 'ggy', 'pinyin: 盖 -> g', pinyinInitials('盖广勇'));
  assert(pinyinInitials('Oscar2') === 'oscar2', 'pinyin: latin/digits passthrough', pinyinInitials('Oscar2'));
  assert(pinyinInitials('') === null, 'pinyin: empty -> null', '');
  assert(pinyinInitials('測') === null || /^[a-z]$/.test(pinyinInitials('測') || ''), 'pinyin: unknown char either resolved or null', String(pinyinInitials('測')));
}

console.log('===== gates =====');
// login disabled by default
{
  const env = workerEnv(); delete env.MOBILE_LOGIN_ENABLED;
  const r = await callLogin({ phone: P1, password: PW('zs', P1) }, env);
  assert(r.status === 403 && r.json.code === 'LOGIN_DISABLED', 'login disabled by default', JSON.stringify(r.json));
}
// session secret missing
{
  const env = workerEnv(); delete env.WORKER_SESSION_SECRET;
  const r = await callLogin({ phone: P1, password: PW('zs', P1) }, env);
  assert(r.status === 503 && r.json.code === 'SESSION_NOT_CONFIGURED', 'session secret missing -> 503', JSON.stringify(r.json));
}
// ledger table not configured（新体系：表 ID 按名解析；身份表缺失 → IDENTITY_NOT_CONFIGURED）
{
  const prevNames = mockTableNames;
  const env = workerEnv({ FS_APP_TOKEN: 'mock-fs-base-identity-missing', FS_LEDGER_TABLE_ID: undefined });
  mockTableNames = ['H5花名册表', 'H5员工日常不安全行为台账']; // 身份表缺失
  try {
    const r = await callLogin({ phone: P1, password: PW('zs', P1) }, env);
    assert(r.status === 503 && r.json.code === 'IDENTITY_NOT_CONFIGURED', 'identity table missing -> 503', JSON.stringify(r.json));
  } finally { mockTableNames = prevNames; }
}

console.log('===== matrix =====');
// A normal login (管理员)
let TOKEN_A = '';
{
  const r = await callLogin({ phone: P1, password: PW('zs', P1) }, workerEnv());
  const good = r.status === 200 && r.json.success && r.json.token && r.json.employee?.employee_code === P1 && r.json.employee?.role === '管理员';
  TOKEN_A = r.json.token || '';
  assert(good, 'A normal login (管理员)', `status=${r.status} body=${r.text.slice(0, 200)}`);
  assert(r.json.employee && !('phone' in r.json.employee), 'A response minimal & clean', '');
}
// A2 经理 role mapping
let TOKEN_B = '';
{
  const r = await callLogin({ phone: P2, password: PW('ls', P2) }, workerEnv());
  TOKEN_B = r.json.token || '';
  assert(r.status === 200 && r.json.employee?.role === '经理' && r.json.employee?.superior === '领导甲', 'A2 分级=乡镇作业中心经理 -> role=经理 + superior', `status=${r.status} body=${r.text.slice(0, 200)}`);
}
// A3 公司管理 role mapping
{
  const r = await callLogin({ phone: P3, password: PW('ww', P3) }, workerEnv());
  assert(r.status === 200 && r.json.employee?.role === '公司管理', 'A3 分级=公司管理 -> role=公司管理', `status=${r.status}`);
}
// A4 uppercase password input tolerated (case-insensitive)
{
  const r = await callLogin({ phone: P1, password: PW('zs', P1).toUpperCase() }, workerEnv());
  assert(r.status === 200, 'A4 uppercase password input -> 200', `status=${r.status}`);
}
// B unknown phone
{
  const r = await callLogin({ phone: '13999990000', password: 'whatever1' }, workerEnv());
  assert(r.status === 401 && r.json.message === '手机号或密码错误', 'B unknown phone -> uniform 401', JSON.stringify(r.json));
}
// C wrong password
{
  const r = await callLogin({ phone: P1, password: 'zs2223' }, workerEnv());
  assert(r.status === 401 && r.json.message === '手机号或密码错误', 'C wrong password -> uniform 401', JSON.stringify(r.json));
}
// D 分级 not in whitelist
{
  const r = await callLogin({ phone: P5, password: PW('sq', P5) }, workerEnv());
  assert(r.status === 401 && r.json.message === '手机号或密码错误', 'D unknown 分级 -> uniform 401', JSON.stringify(r.json));
}
// E duplicate phone in ledger
{
  const r = await callLogin({ phone: P4, password: PW('zl', P4) }, workerEnv());
  assert(r.status === 401, 'E duplicate phone -> 401', JSON.stringify(r.json));
}
// F empty phone in ledger is unmatchable (input must be 11 digits anyway)
{
  const r = await callLogin({ phone: '13911110000', password: 'zb0000' }, workerEnv());
  assert(r.status === 401, 'F empty-phone ledger row never matches -> 401', JSON.stringify(r.json));
}
// H empty phone / I empty password
{
  const r1 = await callLogin({ phone: '', password: 'x' }, workerEnv());
  const r2 = await callLogin({ phone: P1, password: '' }, workerEnv());
  const r3 = await callLogin({}, workerEnv());
  assert(r1.status === 400 && r2.status === 400 && r3.status === 400, 'H/I empty phone/password -> 400', `${r1.status}/${r2.status}/${r3.status}`);
}
// J overlong input
{
  const r1 = await callLogin({ phone: '13911112222123456789012', password: 'x' }, workerEnv());
  const r2 = await callLogin({ phone: P1, password: 'x'.repeat(100) }, workerEnv());
  assert(r1.status === 400 && r2.status === 400, 'J overlong input -> 400', `${r1.status}/${r2.status}`);
}
// K injection / unicode / special chars
{
  const r1 = await callLogin({ phone: "1' OR '1'='1", password: 'x' }, workerEnv());
  const r2 = await callLogin({ phone: '１３９１１１１２２２２', password: 'x' }, workerEnv()); // fullwidth digits
  const r3 = await callLogin({ phone: `${P1}"; DROP TABLE x;--`, password: PW('zs', P1) }, workerEnv());
  assert(r1.status === 400 && r2.status === 400 && r3.status === 400, 'K injection/unicode -> 400 fail-closed', `${r1.status}/${r2.status}/${r3.status}`);
}

console.log('===== session =====');
// L expiry
{
  const nowSec = Math.floor(Date.now() / 1000);
  const expired = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: 'X', iat: nowSec - 100, exp: nowSec - 10, jti: 't' }, SESSION_SECRET);
  const r = await callMe(expired, workerEnv());
  assert(r.status === 401, 'L expired session -> 401', `status=${r.status}`);
}
// M logout with valid session
{
  const r = await callLogout(TOKEN_A, workerEnv());
  assert(r.status === 200 && r.json.success, 'M logout -> 200', `status=${r.status}`);
}
// N after logout: client discards token -> access without token -> 401
{
  const r = await callMe('', workerEnv());
  assert(r.status === 401, 'N access after logout (no token) -> 401', `status=${r.status}`);
  // caveat: stateless JWT — same token still passes until exp (documented limitation)
  const r2 = await callMe(TOKEN_A, workerEnv(), P1);
  assert(r2.status === 200, 'N-caveat stolen-token-until-exp (documented stateless limitation)', `status=${r2.status}`);
}
// O tamper
{
  const parts = TOKEN_A.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  payload.sub = 'ATTACKER-PHONE';
  const forged = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${parts[2]}`;
  const r = await callMe(forged, workerEnv());
  assert(r.status === 401, 'O tampered sub -> 401', `status=${r.status}`);
  const r2 = await callMe(TOKEN_A.slice(0, -3) + 'aaa', workerEnv());
  assert(r2.status === 401, 'O2 tampered signature -> 401', `status=${r2.status}`);
}
// /me returns role + superior
{
  const r = await callMe(TOKEN_A, workerEnv(), P1);
  assert(r.status === 200 && r.json.employee?.role === '管理员' && r.json.employee?.superior === '领导甲', '/me returns role & superior', JSON.stringify(r.json.employee));
  const r2 = await callMe(TOKEN_B, workerEnv(), P2);
  assert(r2.status === 200 && r2.json.employee?.role === '经理', '/me (经理) returns role', JSON.stringify(r2.json.employee));
}
// backend-issued JWT (different secret) must not pass session check
{
  const nowSec = Math.floor(Date.now() / 1000);
  const backendToken = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: 'X', iat: nowSec, exp: nowSec + 600, jti: 'b' }, 'backend-jwt-secret-should-not-work');
  const r = await callMe(backendToken, workerEnv());
  assert(r.status === 401, 'backend-secret token rejected by session check', `status=${r.status}`);
}
// wrong iss/aud
{
  const nowSec = Math.floor(Date.now() / 1000);
  const t = await signJwtHs256({ iss: 'other', aud: 'hse-mobile-h5', sub: 'X', iat: nowSec, exp: nowSec + 600, jti: 'c' }, SESSION_SECRET);
  const r = await callMe(t, workerEnv());
  assert(r.status === 401, 'wrong iss rejected', `status=${r.status}`);
}

console.log('===== mapLedgerRecord units =====');
{
  const m = mapLedgerRecord(LEDGER_ROWS[0]);
  assert(m.name === '张三' && m.phone === P1 && m.grade === '管理员' && m.superior === '领导甲', 'mapLedgerRecord maps ledger fields', JSON.stringify(m));
}

console.log('===== leak scan (all response bodies) =====');
{
  // 新体系：employee_code = 登录者本人手机号（返回给本人不算泄漏）。
  // 规则：任何响应里出现「别人的」台账手机号 = 泄漏。
  const fixturePhones = [P1, P2, P3, P4, P5, P6];
  let leak = '';
  for (const { owner, text } of allBodies) {
    for (const ph of fixturePhones) {
      if (ph !== owner && text.includes(ph)) { leak = `phone ${ph} in response of owner=${owner}`; break; }
    }
    if (leak) break;
  }
  assert(!leak, 'leak-scan: no other-user phone in any response', leak);
  const joined = allBodies.map((b) => b.text).join('\n');
  const checks = [
    ['session secret', !joined.includes(SESSION_SECRET)],
    ['fs app token', !joined.includes(FS_APP_TOKEN)],
    ['fs app secret', !joined.includes(FS_APP_SECRET)],
    ['derived password zs2222', !joined.includes(PW('zs', P1))],
    ['ID-card-like 18-digit', !/\d{17}[\dXx]/.test(joined)],
  ];
  for (const [name, condOk] of checks) assert(condOk, `leak-scan: ${name}`, condOk ? '' : 'LEAK DETECTED');
}

// unmocked-URL guard check: only feishu token + tables-list + ledger records endpoints allowed
{
  const allowed = (u) => u.includes('/auth/v3/tenant_access_token/internal')
    || /\/bitable\/v1\/apps\/[^/]+\/tables(\?|$)/.test(u)
    || u.includes(`/tables/${LEDGER_TABLE_ID}/records`);
  const bad = mockCalls.filter((u) => !allowed(u));
  assert(bad.length === 0, 'network guard: only mocked feishu endpoints touched', bad.slice(0, 3).join(' | '));
}

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
