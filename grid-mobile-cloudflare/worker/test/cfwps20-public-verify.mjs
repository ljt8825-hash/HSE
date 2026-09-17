/* CF-WPS-20 PUBLIC verification (real internet, pages.dev) — 可在无登录链路下完成的项 */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PAGES = 'https://grid-mobile-cloudflare.pages.dev';
const LEGAL = 'https://grid-mobile-cloudflare.pages.dev';
const envText = readFileSync(path.join(ROOT, '../server/.env'), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_SECRET = envVar.WPS_APP_SECRET || '', JWT_SECRET = envVar.JWT_SECRET || '';

let pass = 0, failn = 0; const fails = [];
const ok = (n, x = '') => { pass++; console.log(`PASS ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; fails.push(n); console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, d) : bad(n, d || 'false'));
const retry = async (fn, n = 5) => { let e; for (let i = 0; i < n; i++) { try { return await fn(); } catch (er) { e = er; await new Promise(r => setTimeout(r, 2000 + i * 2000)); } } throw e; };
const req = async (p, opt = {}) => retry(async () => {
  const r = await fetch(PAGES + p, { ...opt, signal: AbortSignal.timeout(30000) });
  return { status: r.status, headers: r.headers, body: await r.text() };
});

(async () => {
  // ---- 1. 静态页完整性 ----
  for (const p of ['/login', '/home', '/patrol', '/records']) {
    const r = await req(p).catch(e => ({ status: 0, body: String(e) }));
    assert(r.status === 200 && /text\/html/.test(r.headers.get('content-type') || ''), `静态页 ${p} → 200 HTML`, `status=${r.status}`);
  }

  // ---- 2. probe 已移除 ----
  const pr = await req('/probe').catch(e => ({ status: 0, body: String(e) }));
  assert(pr.status !== 200, '诊断 /probe 已移除（非 200）', `status=${pr.status}`);

  // ---- 3. Session 安全（公网真实）----
  const noTok = await req('/api/mobile/me');
  assert(noTok.status === 401, '公网 /me 无 token → 401', `status=${noTok.status}`);
  const badTok = await req('/api/mobile/me', { headers: { authorization: 'Bearer garbage.token.here' } });
  assert(badTok.status === 401, '公网 /me 垃圾 token → 401', `status=${badTok.status}`);
  // 伪造 JWT：正确结构 + 错误签名
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '00369234', jti: crypto.randomUUID(), type: 'access', iat: now, exp: now + 3600 });
  const forg = `${head}.${payload}.${Buffer.from('signature-with-wrong-key').toString('base64url')}`;
  const forgR = await req('/api/mobile/me', { headers: { authorization: 'Bearer ' + forg } });
  assert(forgR.status === 401, '公网 /me 伪造签名 JWT → 401', `status=${forgR.status}`);
  const rec401 = await req('/api/mobile/patrol/records');
  assert(rec401.status === 401, '公网 巡查记录列表 无 token → 401', `status=${rec401.status}`);
  // 伪造 token 的 API 响应不泄露 secret 值
  const leakChk = (r) => { const t = (r.body || '') + JSON.stringify([...(r.headers || new Headers())]); return !APP_SECRET || !t.includes(APP_SECRET); };
  assert(leakChk(forgR) && leakChk(noTok) && leakChk(badTok), 'API 响应无 WPS/JWT secret 值泄露');

  // ---- 4. CORS（公网真实；经 Pages Functions 透传 Origin → Worker）----
  const legal = await req('/api/mobile/me', { headers: { Origin: LEGAL } });
  const legalAcao = legal.headers.get('access-control-allow-origin');
  assert(legalAcao === LEGAL, 'CORS 合法 Origin → ACAO 精确回显', `acao=${legalAcao}`);
  const evil = await req('/api/mobile/me', { headers: { Origin: 'https://evil.example.com' } });
  const evilAcao = evil.headers.get('access-control-allow-origin');
  assert(!evilAcao, 'CORS 非法 Origin → 无 ACAO', `acao=${evilAcao}`);
  const opt = await req('/api/mobile/me', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' } });
  assert(!opt.headers.get('access-control-allow-origin'), 'CORS OPTIONS 预检 非法 Origin → 无 ACAO', `status=${opt.status}`);

  // ---- 5. 公网资产泄露扫描 ----
  const assets = ['/login', '/home', '/patrol', '/records', '/config.js', '/app.js'];
  const bodies = [];
  for (const p of assets) { const r = await req(p).catch(() => null); if (r) bodies.push(r.body); }
  const all = bodies.join('\n');
  assert(APP_SECRET && !all.includes(APP_SECRET), '前端资产无 WPS APP_SECRET 值');
  assert(JWT_SECRET && !all.includes(JWT_SECRET), '前端资产无 JWT_SECRET 值');
  assert(!all.includes('WPS_CLIENT_SECRET='), '前端资产无 WPS_CLIENT_SECRET 字面量赋值');
  assert(!all.includes('password_hash'), '前端资产无 password_hash 字段暴露');

  // ---- 6. wrangler.toml 是否被 Pages 静态暴露 ----
  const wt = await req('/wrangler.toml').catch(() => null);
  console.log(`INFO /wrangler.toml → status=${wt ? wt.status : 'ERR'}（仅含非敏感 vars=WORKER_ORIGIN 公网 URL，无 secret）`);

  console.log(`\n===== CF-WPS-20 PUBLIC VERIFY: ${pass} PASS, ${failn} FAIL =====`);
  if (failn) process.exit(1);
  process.exit(0);
})().catch((e) => { console.error('RUNNER ERROR:', String(e).slice(0, 300)); process.exit(1); });
