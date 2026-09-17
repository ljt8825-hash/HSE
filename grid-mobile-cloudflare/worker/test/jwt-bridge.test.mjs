// ============================================================================
// CF-WPS-08 —— JWT 验签桥接交叉验证（dev 后端真实令牌 × Worker verifyJwt）
// ----------------------------------------------------------------------------
// 目的：证明 Worker 的 /wps/records/create JWT 门能原样接受「现有 HSE 后端」
//       签发的令牌（HS256 + exp），即「复用现有 JWT 体系、只验签不签发」为实证而非设计。
//
// 流程（全程不触 WPS、不触生产、不写任何库）：
//   1. 向 dev 后端 127.0.0.1:5882 POST /api/auth/login（UI-01 dev 夹具账号）→ 真实 JWT
//   2. 从 server/.env 读 JWT_SECRET（仅内存使用，绝不打印/落盘/入响应断言文本）
//   3. Worker verifyJwt(真实令牌, devSecret) → 必须 true；篡改签名 → 必须 false
//   4. 完整桥接：worker.fetch /wps/records/create（mock WPS upstream）+ Bearer 真实令牌
//      + ALLOW_WPS_WRITE=true → 200 recordIds（证明 门1(JWT)→门2(写开关)→上游 全链）
//
// 运行：node test/jwt-bridge.test.mjs   （需 dev 后端 5882 存活）
// ============================================================================

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { verifyJwt } from '../index.js';

// ---- 0. 环境（护栏：只在 dev 后端上做）----
const BACKEND = 'http://127.0.0.1:5882';
const health = await fetch(`${BACKEND}/api/health`);
assert.ok(health.ok, 'dev backend 5882 must be alive');

// 读 .env 中的 JWT_SECRET（不打印）
const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const jwtSecret = envText.split(/\r?\n/).find((l) => l.startsWith('JWT_SECRET='))?.slice('JWT_SECRET='.length).trim();
assert.ok(jwtSecret, 'JWT_SECRET must exist in server/.env');

// ---- 1. 真实登录 → JWT ----
const loginRes = await fetch(`${BACKEND}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: '13900000001', password: 'H5grid@2026' }),
});
assert.equal(loginRes.status, 200, 'PC login on dev fixture must succeed');
const loginJson = await loginRes.json();
const realToken = loginJson?.data?.accessToken || loginJson?.accessToken;
assert.ok(realToken && realToken.split('.').length === 3, 'real JWT obtained');
console.log('PASS 1 真实 JWT 获取（dev 后端 /api/auth/login）');

// ---- 2. Worker verifyJwt × 真实令牌 ----
assert.equal(await verifyJwt(realToken, jwtSecret), true, 'real token must verify with dev JWT_SECRET');
const parts = realToken.split('.');
const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}aa`;
assert.equal(await verifyJwt(tampered, jwtSecret), false, 'tampered token must fail');
assert.equal(await verifyJwt(realToken, 'wrong-secret'), false, 'wrong secret must fail');
console.log('PASS 2 verifyJwt：真实令牌通过 / 篡改拒绝 / 错误密钥拒绝');

// ---- 3. 完整桥接（mock WPS upstream）----
let upstreamBody = null;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/oauth2/token')) {
    return new Response(JSON.stringify({ access_token: 'mock_wps_token', expires_in: 7200 }), { status: 200 });
  }
  if (u.includes('/records/create')) {
    upstreamBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ code: 0, data: { records: [{ id: 'BRIDGE1' }] } }), { status: 200 });
  }
  return new Response('not found', { status: 404 });
};

const ENV = {
  WPS_CLIENT_ID: 'bridge_app_id',
  WPS_CLIENT_SECRET: 'bridge_app_secret',
  WPS_OPENAPI_BASE: 'https://mock-wps.example',
  WPS_DBSHEET_FILE_ID: 'fileBridge',
  WPS_DBSHEET_SHEET_ID: '7',
  JWT_VERIFY_SECRET: jwtSecret, // 与 dev 后端同源密钥
  ALLOW_WPS_WRITE: 'true',
  CF_ALLOWED_ORIGINS: '',
};

const res = await worker.fetch(
  new Request('https://worker.example/wps/records/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${realToken}` },
    body: JSON.stringify({ records: [{ '巡查人员ID': '00307234', '姓名': '曹周平', '三违行为': '无三违行为' }] }),
  }),
  ENV,
);
assert.equal(res.status, 200, 'bridge request must pass all gates');
const j = await res.json();
assert.deepEqual(j.recordIds, ['BRIDGE1']);
assert.equal(JSON.parse(upstreamBody.records[0].fields_value)['巡查人员ID'], '00307234');
assert.ok(!JSON.stringify(j).includes(jwtSecret), 'secret must not leak');
console.log('PASS 3 桥接全链：真实 JWT → 门1 → 门2 → WPS record create（mock）200');

console.log('\n=== JWT bridge cross-validation: 3/3 passed ===');
