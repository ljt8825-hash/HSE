// ============================================================================
// WPS OAuth POC-03-A —— 离线流程测试（Node，无需 Cloudflare / 网络 / 真实凭据）
// ----------------------------------------------------------------------------
// 通过覆盖 globalThis.fetch 模拟 WPS /oauth2/token 与 /v7/users/current 响应，
// 真实驱动 Worker 的 fetch 处理函数，验证 POC-03-A 口径收敛：
//   T1  KSO-1 签名纯函数正确性（用 Node crypto 独立实现交叉校验，非假设）
//   T2  /wps/oauth/start 重定向 + state 下发，scope=kso.user_base.read，client_id（非 app_id）
//   T3  token 请求体使用 client_id/client_secret（非 app_id/app_key），且不加 KSO-1
//   T4  userinfo 请求始终包含 Authorization + X-Kso-Date + X-Kso-Authorization + Content-Type（Bearer+KSO-1 强制）
//   T5  userinfo 正常解析：data.id / data.user_name / data.company_id / data.avatar
//   T6  state 校验失败被拒
//   T7  token 错误码诊断且不泄露 token/secret
//   T8  userinfo 401/403/签名错误显式处理（保留真实 HTTP 状态与 WPS code）
//   T9  安全检查：access_token / refresh_token / client_secret / APPKEY 均不出现在浏览器响应与日志
//
// ⚠️ 本测试为「代码层离线验证」。真实 WPS 闭环（浏览器 OAuth + KSO-1 真机）需业务方
//    在 Cloudflare 配置 Secret 后联调，本环境无法代替。状态见报告：BLOCKED_EXTERNAL_VALIDATION。
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto, createHmac, createHash } from 'node:crypto';
import { default as worker, kso1Signature, parseTokenResponse, unwrapV7, normalizeUser } from '../index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ENV = {
  WPS_CLIENT_ID: 'app_id_test_abc',
  WPS_CLIENT_SECRET: 'app_secret_test_xyz',
  WPS_REDIRECT_URI: 'https://poc.example.com/wps/oauth/callback',
  WPS_SCOPE: 'kso.user_base.read', // POC-03-A 修正：kso.user_base.read
};

const AUTHORIZE_URL = 'https://openapi.wps.cn/oauth2/auth';
const TOKEN_URL = 'https://openapi.wps.cn/oauth2/token';
const USERINFO_URL = 'https://openapi.wps.cn/v7/users/current';

// 模拟 WPS 真实返回
const MOCK_TOKEN_FLAT = {
  access_token: 'at_123456',
  refresh_token: 'rt_abcdef',
  expires_in: 7200,
  token_type: 'Bearer',
};
const MOCK_USER_V7 = {
  code: 0,
  msg: 'success',
  data: { id: 'u_1001', user_name: '张三', company_id: 'c_2002', avatar: 'https://avatar.wps.cn/abc.png' },
};

// 记录所有 fetch 调用
function installFetch({ tokenBody, userBody, tokenStatus = 200, userStatus = 200 }) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const headers = {};
    for (const [k, v] of Object.entries(opts.headers || {})) headers[k.toLowerCase()] = v;
    calls.push({ url: u, method: opts.method, headers, body: opts.body });
    if (u.startsWith(TOKEN_URL)) {
      return new Response(JSON.stringify(tokenBody), { status: tokenStatus, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.startsWith(USERINFO_URL)) {
      return new Response(JSON.stringify(userBody), { status: userStatus, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
  return calls;
}

function parseCookies(setCookie) {
  const m = {};
  if (!setCookie) return m;
  for (const part of setCookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) m[k] = decodeURIComponent(v);
  }
  return m;
}

// 驱动 start → callback 全流程，返回调用记录与响应
async function runCallback(env, { code = 'test_code_001', userBody = MOCK_USER_V7, userStatus = 200, tokenBody = MOCK_TOKEN_FLAT } = {}) {
  const calls = installFetch({ tokenBody, userBody, userStatus });
  const startRes = await worker.fetch(new Request('https://poc.example.com/wps/oauth/start'), env, { waitUntil() {} });
  const sc = parseCookies(startRes.headers.get('Set-Cookie'));
  const stateFromLoc = new URL(startRes.headers.get('Location')).searchParams.get('state');
  const cbUrl = `https://poc.example.com/wps/oauth/callback?code=${code}&state=${stateFromLoc}`;
  const cbReq = new Request(cbUrl, { headers: { Cookie: `wps_oauth_state=${sc.wps_oauth_state}` } });
  const cbRes = await worker.fetch(cbReq, env, { waitUntil() {} });
  const body = await cbRes.json();
  return { calls, startRes, cbRes, body };
}

// 独立参考实现（Node crypto）用于交叉校验 KSO-1
function refKso1({ method, uri, contentType, ksoDate, bodyStr = '', secretKey }) {
  const bodyHash = bodyStr ? createHash('sha256').update(bodyStr, 'utf8').digest('hex') : '';
  const signStr = 'KSO-1' + method.toUpperCase() + uri + contentType + ksoDate + bodyHash;
  return createHmac('sha256', secretKey).update(signStr, 'utf8').digest('hex');
}

let passed = 0;
function ok(name) { console.log('  ✓', name); passed++; }

// ---------------------------------------------------------------------------
// T1: KSO-1 签名纯函数与独立参考实现一致（算法正确性，非假设）
// ---------------------------------------------------------------------------
async function testKso1Signature() {
  console.log('T1: KSO-1 签名算法正确性（Web Crypto vs Node crypto 交叉校验）');
  const args = {
    method: 'GET',
    uri: '/v7/users/current',
    contentType: 'application/json',
    ksoDate: 'Wed, 23 Jan 2013 06:43:08 GMT',
    bodyStr: '',
    secretKey: 'app_secret_test_xyz',
  };
  const got = await kso1Signature(args);
  const ref = refKso1(args);
  assert.equal(got, ref, 'Web Crypto 签名须等于 Node crypto 参考实现');
  assert.match(got, /^[0-9a-f]{64}$/, 'HMAC-SHA256 应为 64 位十六进制');
  // 输入变化 → 签名变化
  const changed = await kso1Signature({ ...args, bodyStr: 'x' });
  assert.notEqual(changed, got, 'body 不同应导致签名不同');
  const changedDate = await kso1Signature({ ...args, ksoDate: 'Thu, 24 Jan 2013 06:43:08 GMT' });
  assert.notEqual(changedDate, got, 'ksoDate 不同应导致签名不同');
  ok('KSO-1 签名与参考实现一致且对输入敏感');
}

// ---------------------------------------------------------------------------
// T2: /wps/oauth/start 重定向 + state 下发；scope=kso.user_base.read；client_id（非 app_id）
// ---------------------------------------------------------------------------
async function testStart() {
  console.log('T2: start 重定向与 state 下发（scope=kso.user_base.read）');
  installFetch({ tokenBody: MOCK_TOKEN_FLAT, userBody: MOCK_USER_V7 });
  const res = await worker.fetch(new Request('https://poc.example.com/wps/oauth/start'), ENV, { waitUntil() {} });
  assert.equal(res.status, 302, 'start 应 302');
  const loc = res.headers.get('Location');
  assert.ok(loc && loc.startsWith(AUTHORIZE_URL), '应重定向到 WPS 授权页 ' + AUTHORIZE_URL);
  assert.ok(loc.includes('client_id=' + ENV.WPS_CLIENT_ID), 'authorize URL 应含 client_id');
  assert.ok(!loc.includes('app_id='), 'authorize URL 不应使用 app_id（POC-02 错误已修正）');
  assert.ok(loc.includes('response_type=code'), '应含 response_type=code');
  assert.ok(loc.includes('redirect_uri='), '应含 redirect_uri');
  assert.ok(loc.includes('scope=' + encodeURIComponent('kso.user_base.read')), 'scope 应为 kso.user_base.read（POC-03-A 修正）');
  assert.ok(!loc.includes('kso.user_current.read'), '不应再出现旧 scope kso.user_current.read');
  assert.ok(loc.includes('state='), '应含 state');
  const sc = parseCookies(res.headers.get('Set-Cookie'));
  assert.ok(sc.wps_oauth_state, '应下发 wps_oauth_state cookie');
  ok('start 重定向与 state 下发正确（scope=kso.user_base.read）');
}

// ---------------------------------------------------------------------------
// T3: token 请求体校验 + 无 KSO-1；userinfo 解析（T5）
// ---------------------------------------------------------------------------
async function testTokenRequestBodyAndUserinfoParse() {
  console.log('T3: token 请求体校验（client_id/client_secret，无 KSO-1） + T5 userinfo 解析');
  const { calls, cbRes, body } = await runCallback(ENV);

  assert.equal(cbRes.status, 200, 'callback 应 200');
  assert.equal(body.success, true, 'success=true');
  assert.equal(body.stage, 'completed', 'stage=completed');
  assert.equal(body.token.received, true);
  assert.equal(body.token.tokenType, 'Bearer');
  assert.equal(body.token.expiresIn, 7200);
  assert.equal(body.token.refreshTokenReceived, true);
  // T5: userinfo 解析
  assert.equal(body.user.id, 'u_1001', '用户 id 应从 v7 data 层取出');
  assert.equal(body.user.userName, '张三');
  assert.equal(body.user.companyId, 'c_2002');
  assert.equal(body.user.avatarReceived, true);

  // token 请求体校验：client_id/client_secret，无 app_id/app_key，无 KSO-1
  const tokenCall = calls.find((c) => c.url.startsWith(TOKEN_URL));
  assert.ok(tokenCall, '应有 token 调用');
  const tb = new URLSearchParams(tokenCall.body);
  assert.equal(tb.get('client_id'), ENV.WPS_CLIENT_ID, 'token body 应含 client_id');
  assert.equal(tb.get('client_secret'), ENV.WPS_CLIENT_SECRET, 'token body 应含 client_secret');
  assert.equal(tb.get('grant_type'), 'authorization_code');
  assert.equal(tb.get('code'), 'test_code_001');
  assert.equal(tb.get('app_id'), null, 'token body 不应含 app_id（POC-02 错误已修正）');
  assert.equal(tb.get('app_key'), null, 'token body 不应含 app_key');
  assert.ok(!('x-kso-authorization' in tokenCall.headers), 'token 调用不应带 KSO-1（OAuth2 标准，不加签名）');
  assert.ok(!('x-kso-date' in tokenCall.headers), 'token 调用不应带 X-Kso-Date');

  ok('token 请求体校验 + userinfo 解析通过');
}

// ---------------------------------------------------------------------------
// T4: userinfo 请求始终包含 Bearer + KSO-1（Authorization / X-Kso-Date / X-Kso-Authorization / Content-Type）
// ---------------------------------------------------------------------------
async function testUserinfoHeadersAlwaysKso1() {
  console.log('T4: userinfo 始终含 Bearer + KSO-1 头（POC-03-A 强制）');
  const { calls, body } = await runCallback(ENV);

  const userCall = calls.find((c) => c.url.startsWith(USERINFO_URL));
  assert.ok(userCall, '应有 userinfo 调用');
  assert.ok(userCall.headers.authorization.startsWith('Bearer '), 'userinfo 应带 Bearer');
  assert.match(userCall.headers['x-kso-date'], /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/, 'X-Kso-Date 应为 RFC1123');
  assert.match(userCall.headers['x-kso-authorization'], /^KSO-1 [^:]+:[0-9a-f]{64}$/, 'X-Kso-Authorization 格式 KSO-1 <APPID>:<64hex>');
  // X-Kso-Authorization 中的 APPID 应为 client_id
  const appIdInHeader = userCall.headers['x-kso-authorization'].split(' ')[1].split(':')[0];
  assert.equal(appIdInHeader, ENV.WPS_CLIENT_ID, 'KSO-1 头 APPID 应为 client_id');
  assert.equal(userCall.headers['content-type'], 'application/json', 'userinfo Content-Type 应为 application/json');
  // 响应中 KSO-1 应用标记应为 true（不再有开关可置否）
  assert.equal(body.security.kso1Applied, true, 'kso1Applied 应为 true（强制）');
  // token 调用仍不带 KSO-1
  const tokenCall = calls.find((c) => c.url.startsWith(TOKEN_URL));
  assert.ok(!('x-kso-authorization' in tokenCall.headers), 'token 调用不应带 KSO-1');

  ok('userinfo 始终含 Bearer + KSO-1 头且格式正确');
}

// ---------------------------------------------------------------------------
// T6: state 校验失败被拒
// ---------------------------------------------------------------------------
async function testStateMismatch() {
  console.log('T6: state 校验失败应被拒');
  installFetch({ tokenBody: MOCK_TOKEN_FLAT, userBody: MOCK_USER_V7 });
  const cbUrl = 'https://poc.example.com/wps/oauth/callback?code=c3&state=attacker_state';
  const cbReq = new Request(cbUrl, { headers: { Cookie: 'wps_oauth_state=legit_state' } });
  const cbRes = await worker.fetch(cbReq, ENV, { waitUntil() {} });
  assert.equal(cbRes.status, 400, 'state 不匹配应 400');
  const body = await cbRes.json();
  assert.equal(body.stateVerified, false);
  ok('state 校验生效');
}

// ---------------------------------------------------------------------------
// T7: token 错误码诊断且不泄露 token/secret
// ---------------------------------------------------------------------------
async function testTokenErrorDiagnostic() {
  console.log('T7: token 返回错误码 → 诊断信息且不泄露 token');
  const { body } = await runCallback(ENV, { tokenBody: { code: 40001, msg: 'invalid authorization code' } });
  assert.equal(body.success, false, 'token 失败时 success=false');
  assert.equal(body.stage, 'token', 'stage=token');
  assert.equal(body.wpsCode, 40001, '应带回 WPS 错误码');
  assert.equal(body.tokenReceived, false);
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('access_token'), '诊断响应不得含 access_token');
  assert.ok(!raw.includes(ENV.WPS_CLIENT_SECRET), '诊断响应不得含 secret');
  ok('token 错误诊断正确且不泄露凭据');
}

// ---------------------------------------------------------------------------
// T8: userinfo 401/403/签名错误显式处理（保留真实 HTTP 状态与 WPS code）
// ---------------------------------------------------------------------------
async function testUserinfoError() {
  console.log('T8: userinfo 401/403/签名错误显式处理');

  // 401 签名/鉴权无效
  const r401 = await runCallback(ENV, { userStatus: 401, userBody: { code: 401, msg: 'InvalidToken' } });
  assert.equal(r401.cbRes.status, 502, '401 应返回 502 错误体');
  assert.equal(r401.body.success, false, 'success=false');
  assert.equal(r401.body.stage, 'current_user', 'stage=current_user');
  assert.equal(r401.body.httpStatus, 401, '应保留真实 HTTP 状态 401');
  assert.equal(r401.body.wpsCode, 401, '应带回 WPS code 401');
  assert.ok(/401/.test(r401.body.message), 'message 应说明 401 鉴权失败');
  assert.equal(r401.body.tokenReceived, true, '已拿到 token 但不回传');

  // 403 权限不足
  const r403 = await runCallback(ENV, { userStatus: 403, userBody: { code: 403, msg: 'InsufficientScope' } });
  assert.equal(r403.body.httpStatus, 403, '应保留真实 HTTP 状态 403');
  assert.equal(r403.body.wpsCode, 403, '应带回 WPS code 403');
  assert.ok(/403/.test(r403.body.message), 'message 应说明 403 权限不足');

  // 200 但业务 code 非 0（签名错误类业务码），data 缺 id
  const rBiz = await runCallback(ENV, { userStatus: 200, userBody: { code: 10003, msg: 'signature error', data: {} } });
  assert.equal(rBiz.body.success, false, '业务码非 0 应失败');
  assert.equal(rBiz.body.stage, 'current_user', 'stage=current_user');
  assert.equal(rBiz.body.wpsCode, 10003, '应带回 WPS 业务码');
  assert.ok(!JSON.stringify(rBiz.body).includes('access_token'), '错误响应不得含 access_token');

  ok('userinfo 401/403/签名错误均被显式处理且不泄露凭据');
}

// ---------------------------------------------------------------------------
// T9: 安全检查 —— 任何响应/日志不得出现 token / secret / APPKEY
// ---------------------------------------------------------------------------
async function testSecurityLeak() {
  console.log('T9: 安全检查（无 token / refresh_token / secret / APPKEY 泄露）');
  const forbidden = ['access_token', 'refresh_token', ENV.WPS_CLIENT_SECRET, 'at_123456', 'rt_abcdef'];

  // 成功路径
  const ok1 = await runCallback(ENV);
  const rawOk = JSON.stringify(ok1.body);
  for (const f of forbidden) assert.ok(!rawOk.includes(f), `成功响应不得含 ${f}`);

  // token 错误路径
  const errT = await runCallback(ENV, { tokenBody: { code: 40001, msg: 'invalid authorization code' } });
  const rawErrT = JSON.stringify(errT.body);
  for (const f of forbidden) assert.ok(!rawErrT.includes(f), `token 错误响应不得含 ${f}`);

  // userinfo 错误路径
  const errU = await runCallback(ENV, { userStatus: 401, userBody: { code: 401, msg: 'InvalidToken' } });
  const rawErrU = JSON.stringify(errU.body);
  for (const f of forbidden) assert.ok(!rawErrU.includes(f), `userinfo 错误响应不得含 ${f}`);

  // 响应中不得出现 Bearer <token> 明文
  assert.ok(!rawOk.includes('Bearer at_'), '响应不得含 Bearer <token> 明文');

  ok('所有响应均无 token / secret / APPKEY 泄露');
}

// ---------------------------------------------------------------------------
// T-UNIT: 解析函数单元（token 扁平 / 旧版嵌套 / userinfo v7 包裹 / normalizeUser 仅官方字段）
// ---------------------------------------------------------------------------
async function testUnit() {
  console.log('T-UNIT: parseTokenResponse / unwrapV7 / normalizeUser 单元');
  const t1 = parseTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 7200, token_type: 'Bearer' });
  assert.equal(t1.ok, true); assert.equal(t1.accessToken, 'a'); assert.equal(t1.expiresIn, 7200); assert.equal(t1.tokenType, 'Bearer');
  const t2 = parseTokenResponse({ result: 0, token: { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 } });
  assert.equal(t2.ok, true); assert.equal(t2.accessToken, 'a2'); assert.equal(t2.expiresIn, 3600);
  const t3 = parseTokenResponse({ code: 40001, msg: 'bad' });
  assert.equal(t3.ok, false); assert.equal(t3.wpsCode, 40001);
  assert.deepEqual(unwrapV7({ code: 0, data: { id: 'x' } }), { id: 'x' }, 'unwrapV7 取 data');
  assert.deepEqual(unwrapV7({ id: 'y' }), { id: 'y' }, 'unwrapV7 裸对象原样返回');
  // normalizeUser 仅以官方字段为正式身份字段，不以 openid/unionid/nickname/company_uid 替代
  const u = normalizeUser({ id: 'x', user_name: 'y', company_id: 'z', avatar: 'v' });
  assert.equal(u.id, 'x'); assert.equal(u.userName, 'y'); assert.equal(u.companyId, 'z'); assert.equal(u.avatar, 'v');
  const uFallback = normalizeUser({ user_id: 'x2', userName: 'y2', companyId: 'z2' });
  assert.equal(uFallback.id, 'x2', 'id 命名变体 user_id 可作为容错');
  assert.equal(uFallback.companyId, 'z2', 'companyId 命名变体可作为容错');
  const uAvoid = normalizeUser({ openid: 'o1', unionid: 'u1', nickname: 'n', company_uid: 'cu' });
  assert.equal(uAvoid.id, null, 'openid/unionid 不得作为正式 id 字段');
  assert.equal(uAvoid.userName, null, 'nickname 不得作为正式 userName 字段');
  assert.equal(uAvoid.companyId, null, 'company_uid 不得作为正式 companyId 字段');
  ok('解析函数单元通过（仅官方身份字段）');
}

(async () => {
  await testUnit();            // T-UNIT
  await testKso1Signature();   // T1
  await testStart();           // T2
  await testTokenRequestBodyAndUserinfoParse(); // T3 + T5
  await testUserinfoHeadersAlwaysKso1();        // T4
  await testStateMismatch();   // T6
  await testTokenErrorDiagnostic(); // T7
  await testUserinfoError();   // T8
  await testSecurityLeak();    // T9
  console.log(`\n离线测试全部通过：${passed} 项（T1–T9 + 单元）`);
  console.log('注意：此为代码层离线验证；真实 WPS OAuth + KSO-1 闭环需业务方 Cloudflare 部署后联调。');
})().catch((e) => {
  console.error('测试失败：', e);
  process.exit(1);
});
