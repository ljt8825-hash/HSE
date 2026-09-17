// ============================================================================
// CF-WPS-08 —— Worker v2 业务代理离线测试（Node，无需 Cloudflare / 真实 WPS）
// ----------------------------------------------------------------------------
// 通过覆盖 globalThis.fetch 模拟 WPS /oauth2/token 与 /records/create 响应，
// 真实驱动 Worker 的 fetch 处理函数，验证最小落地边界：
//   T1  无/坏 JWT → 401 UNAUTHORIZED（错误归一化结构）
//   T2  JWT 有效但 ALLOW_WPS_WRITE 未开 → 403 WPS_WRITE_DISABLED（fail-closed）
//   T3  全门通过 → 200 recordIds；上游请求体为 prefer_id+fields_value 且
//       白名单外字段（inspector_employee_id / grid_id 等）被剥离
//   T4  上游 429 → 429 WPS_RATE_LIMITED；上游 500/坏体 → 502 WPS_UPSTREAM_ERROR（不回传上游 body）
//   T5  /wps/upload/image → 501 PHOTO_UPLOAD_UNAVAILABLE（显式语义，禁止假实现）
//   T6  CORS：白名单外 origin 无 ACAO 头；白名单内 origin 有 ACAO；OPTIONS 204
//   T7  安全检查：client_secret / access_token / JWT_VERIFY_SECRET 绝不出现在任何响应
//   T8  未知路由 → 404 NOT_FOUND
//
// ⚠️ 本测试为「代码层离线验证」。真实 WPS 写入联调需业务授权（§十七.3 禁止生产 WPS
//    测试写；文件/工作表创建端点 404 无隔离容器）→ 标记 CONDITIONAL，见报告。
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto, createHmac } from 'node:crypto';
import { default as worker, handleUploadImage } from '../index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const JWT_SECRET = 'jwt_verify_secret_test_do_not_leak';
const WPS_SECRET = 'app_secret_test_xyz';
const MOCK_TOKEN = 'wps_app_token_mock_123';

// ---- 基础 env（每测试可覆盖）----
function baseEnv(extra = {}) {
  return {
    WPS_CLIENT_ID: 'app_id_test_abc',
    WPS_CLIENT_SECRET: WPS_SECRET,
    WPS_OPENAPI_BASE: 'https://mock-wps.example',
    WPS_DBSHEET_FILE_ID: 'file123',
    WPS_DBSHEET_SHEET_ID: '7',
    JWT_VERIFY_SECRET: JWT_SECRET,
    ALLOW_WPS_WRITE: 'true',
    CF_ALLOWED_ORIGINS: 'https://pages.example.com',
    ...extra,
  };
}

// ---- HS256 JWT 签发（与本地 HSE 后端同算法）----
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signJwt(payload) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest();
  return `${h}.${p}.${b64url(sig)}`;
}
const VALID_JWT = signJwt({ id: 249, username: '13900000001', role: 'grid_inspector', type: 'access', jti: 't1', exp: Math.floor(Date.now() / 1000) + 300 });

// ---- fetch mock：模拟 WPS upstream，记录调用 ----
let upstreamCalls = [];
function installFetchMock({ tokenOk = true, createStatus = 200, createBody = { code: 0, data: { records: [{ id: 'R1' }, { id: 'R2' }] } } } = {}) {
  upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    upstreamCalls.push({ url: u, init });
    if (u.includes('/oauth2/token')) {
      if (!tokenOk) return new Response(JSON.stringify({ error: 'bad' }), { status: 401 });
      return new Response(JSON.stringify({ access_token: MOCK_TOKEN, expires_in: 7200, token_type: 'Bearer' }), { status: 200 });
    }
    if (u.includes('/records/create')) {
      return new Response(createStatus === 200 ? JSON.stringify(createBody) : 'upstream boom', { status: createStatus });
    }
    return new Response('not found', { status: 404 });
  };
}

function req(path, { method = 'POST', body, origin, auth } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (auth) headers.authorization = `Bearer ${auth}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://worker.example${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

const RECORDS_BODY = {
  records: [
    {
      '巡查人员ID': '00307234',        // sheet 3 身份快照列（CF-WPS-09 实测存在）
      '员工编码': '00307234',           // sheet 3 不存在该列（属 sheet 11）→ 必须被剥离
      '姓名': '曹周平',
      '日期': '2026-09-15',
      '三违行为': '无三违行为',
      '是否需要整改': '否',
      '三违照片链接': 'https://ksc-bj.ag.wps.cn/api/object/x/compatible',
      'inspector_employee_id': '6697', // 保护字段 → 必须被剥离
      'grid_id': '133',                // 保护字段 → 必须被剥离
    },
  ],
};

let pass = 0;
function ok(name) { pass++; console.log(`PASS ${name}`); }

// T1 无/坏 JWT → 401
{
  installFetchMock();
  let r = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY }), baseEnv());
  assert.equal(r.status, 401);
  let j = await r.json();
  assert.equal(j.code, 'UNAUTHORIZED');
  r = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, auth: 'bad.token.sig' }), baseEnv());
  assert.equal(r.status, 401);
  ok('T1 401 未认证 + 错误归一化');
}

// T2 JWT 有效但写开关关闭 → 403
{
  installFetchMock();
  const r = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, auth: VALID_JWT }), baseEnv({ ALLOW_WPS_WRITE: '' }));
  assert.equal(r.status, 403);
  const j = await r.json();
  assert.equal(j.code, 'WPS_WRITE_DISABLED');
  ok('T2 403 写开关 fail-closed');
}

// T3 全门通过 → 200；白名单剥离；上游格式正确
{
  installFetchMock();
  const r = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, auth: VALID_JWT }), baseEnv());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.recordIds, ['R1', 'R2']);
  // 上游调用断言
  const createCall = upstreamCalls.find((c) => c.url.includes('/records/create'));
  assert.ok(createCall, 'must call upstream create');
  assert.ok(createCall.url.includes('/v7/coop/dbsheet/file123/sheets/7/records/create'), 'upstream path');
  assert.equal(createCall.init.headers.Authorization, `Bearer ${MOCK_TOKEN}`);
  const upstreamBody = JSON.parse(createCall.init.body);
  assert.equal(upstreamBody.prefer_id, false);
  const fieldsValue = JSON.parse(upstreamBody.records[0].fields_value);
  assert.equal(fieldsValue['巡查人员ID'], '00307234');
  assert.ok(!('员工编码' in fieldsValue), 'sheet3 不存在的列必须被剥离');
  assert.ok(!('inspector_employee_id' in fieldsValue), 'PG 权威列必须被剥离');
  assert.ok(!('grid_id' in fieldsValue), 'PG 权威列必须被剥离');
  ok('T3 200 创建成功 + 白名单 + 上游格式');
}

// T4 上游异常归一化
{
  installFetchMock({ createStatus: 429 });
  let r = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, auth: VALID_JWT }), baseEnv());
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, 'WPS_RATE_LIMITED');

  installFetchMock({ createStatus: 500 });
  r = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, auth: VALID_JWT }), baseEnv());
  assert.equal(r.status, 502);
  const j = await r.json();
  assert.equal(j.code, 'WPS_UPSTREAM_ERROR');
  assert.ok(!JSON.stringify(j).includes('upstream boom'), '不得回传上游原始 body');
  ok('T4 上游异常归一化（429→429 / 5xx→502）');
}

// T5 照片上传端点（CF-WPS-12 已升级为真实实现；本回归断言其 fail-closed 门控：
// 未配置 WORKER_SESSION_SECRET → 503 SESSION_NOT_CONFIGURED，不再允许 501 占位假实现）
{
  installFetchMock();
  const r = await worker.fetch(req('/wps/upload/image', { body: { fileName: 'x.jpg' }, auth: VALID_JWT }), baseEnv());
  assert.equal(r.status, 503);
  const j = await r.json();
  assert.equal(j.code, 'SESSION_NOT_CONFIGURED');
  // 直接 handler 调用（GET 场景同样 503 fail-closed）
  const r2 = await handleUploadImage(req('/wps/upload/image', { method: 'GET' }), baseEnv());
  assert.equal(r2.status, 503);
  ok('T5 照片上传 fail-closed 门控（CF-WPS-12 升级后语义）');
}

// T6 CORS
{
  installFetchMock();
  const rOut = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, origin: 'https://evil.example' }), baseEnv());
  assert.ok(!rOut.headers.get('access-control-allow-origin'), '白名单外 origin 不得有 ACAO');
  const rIn = await worker.fetch(req('/wps/records/create', { body: RECORDS_BODY, origin: 'https://pages.example.com', auth: VALID_JWT }), baseEnv());
  assert.equal(rIn.headers.get('access-control-allow-origin'), 'https://pages.example.com');
  const pre = await worker.fetch(new Request('https://worker.example/wps/records/create', { method: 'OPTIONS', headers: { origin: 'https://pages.example.com' } }), baseEnv());
  assert.equal(pre.status, 204);
  ok('T6 CORS 白名单 + 预检');
}

// T7 secret 不泄露（全路由扫描）
{
  installFetchMock();
  const paths = ['/wps/records/create', '/wps/upload/image', '/wps/nope'];
  for (const p of paths) {
    const r = await worker.fetch(req(p, { body: RECORDS_BODY, auth: VALID_JWT, origin: 'https://pages.example.com' }), baseEnv());
    const text = await r.text();
    assert.ok(!text.includes(WPS_SECRET), `secret 泄露于 ${p}`);
    assert.ok(!text.includes(JWT_SECRET), `jwt secret 泄露于 ${p}`);
    assert.ok(!text.includes(MOCK_TOKEN), `wps token 泄露于 ${p}`);
  }
  ok('T7 secret/token 不出现在任何响应');
}

// T8 未知路由
{
  installFetchMock();
  const r = await worker.fetch(req('/wps/nope', { method: 'GET' }), baseEnv());
  assert.equal(r.status, 404);
  assert.equal((await r.json()).code, 'NOT_FOUND');
  ok('T8 404 归一化');
}

console.log(`\n=== CF-WPS-08 worker tests: ${pass}/8 passed ===`);
