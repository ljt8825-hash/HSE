// ============================================================================
// CF-WPS-08 —— Worker 真实 HTTP 冒烟（Node http server 包 worker.fetch）
// ----------------------------------------------------------------------------
// 在 cfwps08.test.mjs（直驱 handler）之上，补一层真实 socket/HTTP 语义验证：
//   S1  401（无 JWT）经真实 HTTP 返回，Content-Type/JSON 归一化正确
//   S2  501（照片上传）经真实 HTTP 返回
//   S3  404（未知路由）经真实 HTTP 返回
// 用后即弃：进程结束自动关闭服务器。mock upstream 不触真实 WPS。
// ============================================================================

import http from 'node:http';
import assert from 'node:assert/strict';
import worker from '../index.js';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
  let body;
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }
  const request = new Request(url, { method: req.method, headers, body });
  const response = await worker.fetch(request, ENV);
  res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json' });
  res.end(await response.text());
});

const ENV = {
  WPS_CLIENT_ID: 'smoke_app_id',
  WPS_CLIENT_SECRET: 'smoke_app_secret',
  JWT_VERIFY_SECRET: 'smoke_jwt_secret',
  ALLOW_WPS_WRITE: 'false',
  CF_ALLOWED_ORIGINS: '',
};

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  // S1
  let res = await fetch(`${base}/wps/records/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ records: [{ '员工编码': '00307234' }] }),
  });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  assert.equal((await res.json()).code, 'UNAUTHORIZED');
  console.log('PASS S1 401 via real HTTP');

  // S2（CF-WPS-12 升级：501 占位 → 真实实现；未配 Session 密钥时 503 fail-closed）
  res = await fetch(`${base}/wps/upload/image`, { method: 'POST', body: 'x' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'SESSION_NOT_CONFIGURED');
  console.log('PASS S2 503 fail-closed via real HTTP');

  // S3
  res = await fetch(`${base}/wps/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'NOT_FOUND');
  console.log('PASS S3 404 via real HTTP');

  console.log('\n=== CF-WPS-08 HTTP smoke: 3/3 passed ===');
} finally {
  server.close();
}
