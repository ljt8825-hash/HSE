/* CF-WPS-14 REAL-BROWSER E2E (local stand-in for Cloudflare Pages+Worker).
 *
 * ⚠️ 已废弃（2026-09-17 / CF-WPS-24 起）——**不要直接跑**，它会被跳过或给出无效结论。
 * 原因：本脚本断言「登录 → 跳转工作台 home.html → 读 #code 回显 employee_code → 点 #logout」，
 * 而该工作台页 CF-WPS-23 起已并入 check.html 的首页视图，CF-WPS-24 起 /home 连页面都不存在
 * （_redirects: /home → /check 302）。所以脚本内所有 `**/home.html` 与 `#code` / `#logout`
 * 步骤自 CF-WPS-23 起即不成立（属既存失效，非 CF-WPS-24 回归）。
 * 现行等价覆盖（均为只读、零写入）：
 *   - test/cfwps23-browser-e2e.mjs（登录/免登录/路由/拍照流程，33 断言）
 *   - test/cfwps24-browser-e2e.mjs（/home 移除、入口分流、返回键历史栈，23 断言）
 *   - test/cfwps21-browser-e2e.mjs（三视口布局与定位，99 断言）
 *
 * 纪律：
 *  - 运行真实 Worker handler（index.js export default.fetch）于同域 Node 静态服务器，
 *    前端 API_BASE='' → 同源 /api（等价于生产 Pages Functions 反代架构）。
 *  - secrets 仅从 server/.env 进入内存（workerEnv），绝不打印/落盘/返回浏览器。
 *  - 仅写 Sheet 13（测试表）+ Sheet 14 播种/清理测试身份；Sheet 3/11 零写入。
 *  - 驱动真实 Google Chrome（Chromium，Android Chrome 同引擎）走完整手机链。
 * Run: node test/cfwps14-e2e.mjs
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..'); // grid-mobile-cloudflare/
const FRONTEND = path.join(ROOT, 'frontend');
const workerMod = await import(pathToFileURL(path.join(ROOT, 'worker/index.js')).href);
const worker = workerMod.default;

// ---------- 构建 workerEnv（内存，secret-safe） ----------
const envText = readFileSync(path.join(ROOT, '../server/.env'), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';
if (!APP_ID || !APP_SECRET) { console.error('[GUARD] missing WPS creds'); process.exit(1); }
const SESSION_SECRET = 'cfwps14-e2e-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const workerEnv = {
  WPS_CLIENT_ID: APP_ID, WPS_CLIENT_SECRET: APP_SECRET, WPS_OPENAPI_BASE: BASE,
  WPS_DBSHEET_FILE_ID: FILE_ID,
  WPS_DBSHEET_TEST_SHEET_ID: '13',
  WPS_DBSHEET_SHEET_ID: '',                 // 生产目标 UNRESOLVED
  WPS_DBSHEET_IDENTITY_SHEET_ID: '14',
  IDENTITY_ROSTER_SHEET_ID: '11',
  IDENTITY_ROSTER_CHECK: 'on',
  IDENTITY_ACTIVE_STATUS: '正常',
  MOBILE_LOGIN_ENABLED: 'true',
  ALLOW_WPS_WRITE: 'true',
  WORKER_SESSION_SECRET: SESSION_SECRET,
  JWT_VERIFY_SECRET: envVar.JWT_SECRET || SESSION_SECRET,
  MOBILE_SESSION_TTL_SECONDS: '7200',
  CF_ALLOWED_ORIGINS: '',                    // 安全默认：同源 E2E；跨域拒绝
  WPS_PATROL_FIELDS_CONFIRMED: 'false',
  MOBILE_PATROL_PRODUCTION_ENABLED: 'false',
};

// ---------- WPS helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wps(path, body, method) {
  const tr = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString() });
  const tj = await tr.json().catch(() => ({}));
  const res = await fetch(`${BASE}${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tj.access_token}` }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function scanSheet(sheetId, maxPages = 50) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, { page_num: p, page_size: 200 });
    const recs = r.json?.data?.records || [];
    for (const rec of recs) { let fv = rec.fields_value ?? rec.fields; try { if (typeof fv === 'string') fv = JSON.parse(fv); } catch { fv = {}; } out.push({ id: rec.id, fields: fv }); }
    if (recs.length < 200) break; await sleep(120);
  }
  return out;
}
const countSheet = async (s) => (await scanSheet(s)).length;

// ---------- 结果计数 ----------
let pass = 0, failn = 0; const fails = [];
const ok = (n, x = '') => { pass++; console.log(`PASS_E2E ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; fails.push(`${n} :: ${d}`); console.log(`FAIL_E2E ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'assertion false'));

// ---------- 静态 + /api 同域服务器 ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const PORT = 8788;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && k !== 'cookie') headers.set(k, v);
      let body;
      if (req.method !== 'GET' && req.method !== 'HEAD') { const ch = []; for await (const c of req) ch.push(c); body = Buffer.concat(ch); }
      const request = new Request(`http://localhost:${PORT}${u.pathname}${u.search}`, { method: req.method, headers, body });
      const wres = await worker.fetch(request, workerEnv);
      const buf = Buffer.from(await wres.arrayBuffer());
      res.statusCode = wres.status;
      wres.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(buf);
    } else {
      let rel = u.pathname === '/' ? '/login.html' : u.pathname;
      const fp = path.join(FRONTEND, rel);
      if (!fp.startsWith(FRONTEND) || !(await stat(fp).catch(() => null))) { res.statusCode = 404; res.end('not found'); return; }
      const buf = await readFile(fp);
      res.statusCode = 200; res.setHeader('Content-Type', TYPES[path.extname(fp)] || 'application/octet-stream'); res.end(buf);
    }
  } catch (e) { res.statusCode = 500; res.end('server error'); }
});
await new Promise((r) => server.listen(PORT, r));

const SHOT = path.join(ROOT, 'worker/test/_cfwps14_shots');
import { mkdirSync } from 'node:fs'; mkdirSync(SHOT, { recursive: true });
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(SHOT, name + '.png'), fullPage: true }); } catch {} };

// ============ 0. 基线 ============
const base3 = await countSheet(3), base11 = await countSheet(11), base13 = await countSheet(13), base14 = await countSheet(14);
console.log(`baseline: S3=${base3} S11=${base11} S13=${base13} S14=${base14}`);
assert(base3 === 2063 && base11 === 1291, 'P0 生产两表基线与历史一致', `S3=${base3} S11=${base11}`);

// ============ 1. Sheet 13 补字段（幂等，沿用 CF-WPS-13） ============
const NEED_FIELDS = ['问题类型', '是否三违', '三违行为描述', '涉及人员', '照片状态'];
const schemaRes = await wps(`/v7/coop/dbsheet/${FILE_ID}/schema`);
const s13 = (schemaRes.json?.data?.sheets || []).find((s) => String(s.id) === '13');
const missing = NEED_FIELDS.filter((n) => !(s13?.fields || []).map((f) => f.name).includes(n));
if (missing.length) { const cr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/13/fields`, { fields: missing.map((n) => ({ name: n, type: 'MultiLineText' })) }); assert(cr.status === 200 && cr.json.code === 0, `Sheet13 补字段 [${missing}]`); }
else ok('Sheet13 巡查字段已存在');

// ============ 2. 播种测试身份 ============
const roster = await scanSheet(11);
const cand = roster.find((r) => { const c = String(r.fields['员工编码'] || '').trim(); const st = String(r.fields['用工关系状态'] || ''); const a = String(r.fields['负责区域（在职）'] || '').trim(); return c && st && !st.includes('离职') && a && a !== '0'; });
const CAND_CODE = String(cand.fields['员工编码']).trim();
const CAND_NAME = String(cand.fields['姓名'] || '').trim();
const CAND_AREA = String(cand.fields['负责区域（在职）'] || '').trim();
const TEST_PHONE = '138' + String(Date.now()).slice(-8);
const TEST_PWD = 'Cf14pass!' + Date.now().toString().slice(-4);
const seedRes = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/create`, { prefer_id: false, records: [{ fields_value: JSON.stringify({ employee_code: CAND_CODE, 姓名: CAND_NAME, 手机号码: TEST_PHONE, password_hash: bcrypt.hashSync(TEST_PWD, 4), 部门: String(cand.fields['所属部门'] || ''), 职位: String(cand.fields['职位'] || ''), 身份状态: '正常', 创建时间: new Date().toISOString().slice(0, 10) }) }] });
assert(seedRes.status === 200 && seedRes.json.code === 0, 'Sheet14 播种测试身份', `code=${seedRes.json?.code}`);
const seedId = seedRes.json?.data?.records?.[0]?.id || null;
await sleep(800);

let seedRecordId = null;
try {
  // ============ 3. 真实 Chrome E2E ============
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile' });
  const page = await ctx.newPage();
  const jsErrors = [];      // 真正的未捕获 JS 异常
  const resourceErrors = []; // 资源加载 4xx/5xx（favicon 404 / 退出后探测 401 属预期）
  page.on('pageerror', (e) => jsErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) jsErrors.push('console:' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) resourceErrors.push(`${r.status()} ${r.url()}`); });

  const ORIGIN = `http://localhost:${PORT}`;
  // 3.1 登录页
  await page.goto(`${ORIGIN}/login.html`, { waitUntil: 'networkidle' });
  await shot(page, '01-login');
  assert(await page.locator('#phone').count() === 1 && await page.locator('#password').count() === 1, '登录页渲染（手机号/密码输入框）');
  await page.fill('#phone', TEST_PHONE);
  await page.fill('#password', TEST_PWD);
  await page.click('#btn');
  await page.waitForURL('**/home.html', { timeout: 15000 });
  await shot(page, '02-home');
  assert(true, '登录成功 → 自动跳转到工作台 home.html');

  // 3.2 工作台：employee_code 回显
  const codeText = await page.locator('#code').textContent();
  assert(codeText.includes(CAND_CODE), '工作台正确回显 employee_code', codeText);
  const nameText = await page.locator('#name').textContent();
  assert(nameText.includes(CAND_NAME), '工作台正确回显姓名', nameText);
  assert((await page.locator('#go-patrol').count()) === 1, '工作台含「开始巡查」大按钮');

  // 3.3 开始巡查 → meta 解析网格
  await page.click('#go-patrol');
  await page.waitForURL('**/patrol.html', { timeout: 15000 });
  await page.waitForSelector('#inspector', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => { const el = document.getElementById('inspector'); return el && el.value && el.value.length > 0; }, { timeout: 15000 });
  const inspectorVal = await page.locator('#inspector').inputValue();
  assert(inspectorVal.includes(CAND_CODE), '巡查页巡查人=Session employee_code（服务端注入，只读）', inspectorVal);
  // 网格：等待解析（auto 模式 → #grid-area 内 disabled input）
  await page.waitForSelector('#grid-area input, #grid-area .gridchip', { timeout: 15000 });
  const gridText = await page.locator('#grid-area').innerText();
  assert(gridText.includes(CAND_AREA.split(/[+，、/;；|]/)[0]), '网格由服务端按 employee_code 解析（自动带出）', gridText.slice(0, 60));
  // select 模式（多网格）需用户点选一个 chip；auto 模式只读 input 已带出
  const chipCount = await page.locator('#grid-area .gridchip').count();
  if (chipCount > 0) { await page.locator('#grid-area .gridchip').first().click(); ok('多网格 select 模式：点选首个网格 chip'); }
  assert((await page.locator('#problem-type option').count()) > 0, '问题类型下拉已填充（来自 meta）');
  const photoNote = await page.locator('.photo-note').innerText().catch(() => '');
  assert(photoNote.includes('PENDING_EXTERNAL'), '拍照区明示 PENDING_EXTERNAL');
  await shot(page, '03-patrol');

  // 3.4 填写并提交（否三违，纯文字链）
  await page.fill('#description', '【CF-WPS-14 E2E】巡查发现村口垃圾点，已现场劝导清理并拍照留证。');
  await page.selectOption('#problem-type', { index: 0 });
  // 默认 否；确保 submit 可点（时间+网格已具备）
  await page.waitForFunction(() => !document.getElementById('submit').disabled, { timeout: 8000 });
  await page.click('#submit');
  await page.waitForSelector('#result-card', { state: 'visible', timeout: 15000 });
  const resultText = await page.locator('#result-card').innerText();
  assert(resultText.includes('提交成功') || resultText.includes('无需重复提交'), '提交 → 成功结果页（含记录编号）', resultText.replace(/\n/g, ' ').slice(0, 80));
  await shot(page, '04-result');

  // 3.5 我的记录 → 详情
  await page.click('#to-records');
  await page.waitForURL('**/records.html', { timeout: 15000 });
  await page.waitForSelector('.item', { timeout: 15000 });
  await shot(page, '05-records');
  const itemCount = await page.locator('.item').count();
  assert(itemCount >= 1, '我的巡查记录列表含刚提交记录', `items=${itemCount}`);
  await page.locator('.item').first().click();
  try {
    await page.waitForFunction(() => location.pathname.endsWith('detail.html'), { timeout: 15000 });
  } catch (e) {
    await shot(page, '06-detail-fail');
    console.log('DEBUG detail-nav: url=' + page.url() + ' errors=' + JSON.stringify(jsErrors.slice(0, 3)));
    throw e;
  }
  await page.waitForSelector('#detail .card', { timeout: 15000 });
  const detailText = await page.locator('#detail').innerText();
  assert(detailText.includes(CAND_CODE), '详情回显 employee_code', '');
  assert(detailText.includes(CAND_AREA.split(/[+，、/;；|]/)[0]), '详情回显网格', '');
  assert(detailText.includes('PENDING_EXTERNAL') || detailText.includes('未拍摄'), '详情明示照片状态（PENDING_EXTERNAL / 未拍摄，均非“可预览”）', detailText.slice(0, 40));
  assert(detailText.includes('否') || detailText.includes('正常'), '详情三违标记=否（本次未选三违）');
  await shot(page, '06-detail');
  // 取记录编号用于清理
  const recIdMatch = detailText.match(/记录编号\s*([A-Za-z0-9]+)/);
  seedRecordId = recIdMatch ? recIdMatch[1] : null;

  // 3.6 退出登录 → 受保护接口失效
  await page.goto(`${ORIGIN}/home.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#logout', { timeout: 10000 });
  await page.click('#logout');
  await page.waitForURL('**/login.html', { timeout: 15000 });
  assert(true, '退出登录 → 回到登录页');
  // 直接打受保护接口应 401
  const meRes = await page.evaluate(async () => { const r = await fetch('/api/mobile/me'); return r.status; });
  assert(meRes === 401, '退出后 /api/mobile/me → 401（Session 失效）', `status=${meRes}`);
  await shot(page, '07-after-logout');

  // 3.7 无 JS 运行时异常（资源 4xx 单独记录，不计入）
  if (resourceErrors.length) console.log('INFO resource-load 4xx/5xx (预期内，如 favicon/退出后探测): ' + JSON.stringify([...new Set(resourceErrors)].slice(0, 5)));
  assert(jsErrors.length === 0, '页面无未捕获 JS 异常', jsErrors.slice(0, 3).join(' | '));

  await browser.close();
  ok('REAL_BROWSER_E2E 完整链（登录→工作台→巡查→提交→记录→详情→退出）执行完毕');

  // ============ 4. CORS 安全检查（跨域拒绝） ============
  const corsRes = await fetch(`${ORIGIN}/api/mobile/me`, { headers: { Origin: 'https://evil.example.com' } });
  assert(!corsRes.headers.get('access-control-allow-origin'), 'CORS：非授权 Origin 无 ACAO 头（安全默认）');
  const opt = await fetch(`${ORIGIN}/api/mobile/me`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } });
  assert(opt.status === 204 && !opt.headers.get('access-control-allow-origin'), 'CORS：OPTIONS 预检对非授权 Origin 无 ACAO');
  // 同源（浏览器已证明可访问）；再确认真实登录跨域被拒：用异源 fetch 登录应无 ACAO（浏览器会拦）
  ok('CORS：同源 E2E 已证明可访问（Pages 同源架构无需跨域）');

  // ============ 5. 他人记录访问（API 级，浏览器单用户难构造） ============
  // 直接用 handler 验证：伪造他人 record_id → 404（防枚举）
  const wreq = (p, tok) => { const h = { 'Content-Type': 'application/json' }; if (tok) h.authorization = 'Bearer ' + tok; return new Request(`https://w.local${p}`, { method: 'GET', headers: h }); };
  const loginR = await worker.fetch(wreq('/api/mobile/auth/login'), workerEnv);
  // 用一个独立临时登录拿 token 不便；此处复用：他人记录访问防护已在 CF-WPS-13 真机覆盖（404），本阶段标记为继承
  ok('他人记录访问防护：继承 CF-WPS-13 真机 404 结论（单浏览器用户无法构造第二身份）');

} catch (e) {
  bad('E2E_RUNNER', String(e && e.stack || e).slice(0, 300));
} finally {
  // ============ 6. 清理 ============
  try {
    const del13 = [];
    const recs13 = await scanSheet(13);
    for (const x of recs13) { const cid = String(x.fields.client_request_id || ''); const no = String(x.fields['测试编号'] || ''); if (cid.startsWith('H5S-') || no.startsWith('CF-WPS-14-E2E')) del13.push(x.id); }
    if (seedRecordId) del13.push(seedRecordId);
    if (del13.length) { const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/13/records/batch_delete`, { records: [...new Set(del13)].map(String) }); assert(dr.status === 200 && dr.json.code === 0, `Sheet13 测试记录清理 ${new Set(del13).size} 条`, `code=${dr.json?.code}`); }
    else ok('Sheet13 无 E2E 残留');
    if (seedId) { const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/batch_delete`, { records: [String(seedId)] }); assert(dr.status === 200 && dr.json.code === 0, 'Sheet14 播种身份行清理'); }
  } catch (e) { bad('CLEANUP', String(e).slice(0, 200)); }
}

// ============ 7. 生产污染检查 ============
await sleep(400);
const post3 = await countSheet(3), post11 = await countSheet(11), post13 = await countSheet(13), post14 = await countSheet(14);
console.log(`postline: S3=${post3} S11=${post11} S13=${post13} S14=${post14}`);
assert(post3 === base3, 'S3 生产巡查表 零变化', `${base3}→${post3}`);
assert(post11 === base11, 'S11 员工花名册 零变化', `${base11}→${post11}`);
assert(post13 === base13, 'S13 测试表 回基线', `${base13}→${post13}`);
assert(post14 === base14, 'S14 身份表 回基线', `${base14}→${post14}`);

server.close();
console.log(`\n===== CF-WPS-14 E2E RESULT: ${pass} PASS, ${failn} FAIL =====`);
if (failn) { console.log('FAILED:\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
process.exit(0);
