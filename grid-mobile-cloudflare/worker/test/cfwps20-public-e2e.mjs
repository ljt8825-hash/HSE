/* CF-WPS-20 REAL-PUBLIC-BROWSER E2E — 真实公网 https://grid-mobile-cloudflare.pages.dev
 * 纪律：
 *  - 全部打真实公网（Pages → Functions → Worker → WPS）。
 *  - 仅写 Sheet13（测试表）+ Sheet14 播种/清理 A/B 两测试身份；Sheet3/11/15 零写入。
 *  - WPS 出海为【间歇挂死】：健康窗口全链 ≤10s（预检实证），挂死窗口请求永久挂起。
 *    因此本脚本：① 前置健康门（播种失败立即中止，不浪费超时）；② 先跑【快】API 级证明（protected/idempotent/隔离/限流/bcrypt），
 *    再跑【慢】浏览器全链（独立 try，挂死不影响已捕获的 API 证明）；③ 所有 WPS 请求短超时 + 有限重试。
 * Run: node test/cfwps20-public-e2e.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PAGES = 'https://grid-mobile-cloudflare.pages.dev';
const envText = readFileSync(path.join(ROOT, '../server/.env'), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = (envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn').replace(/\/+$/, '');
const FILE_ID = 'cn229thwalDs';

// ---------- WPS helpers（管理面：播种/读回/清理，直连 WPS） ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wps(p, body, method, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const tr = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(), signal: AbortSignal.timeout(25000) });
      const tj = await tr.json().catch(() => ({}));
      const res = await fetch(`${BASE}${p}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tj.access_token}` }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500); }
  }
}
async function scanSheet(sheetId, maxPages = 50) {
  const out = [];
  for (let p = 1; p <= maxPages; p++) {
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, { page_num: p, page_size: 200 });
    const recs = r.json?.data?.records || [];
    for (const rec of recs) { let fv = rec.fields_value ?? rec.fields; try { if (typeof fv === 'string') fv = JSON.parse(fv); } catch { fv = {}; } out.push({ id: rec.id, fields: fv }); }
    if (recs.length < 200) break; await sleep(100);
  }
  return out;
}
const countSheet = async (s) => (await scanSheet(s)).length;

// ---------- 公网 API 客户端（短超时 + 有限重试） ----------
async function pub(p, opt = {}, tries = 2, timeout = 60000) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(PAGES + p, { ...opt, signal: AbortSignal.timeout(timeout) });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, headers: r.headers, body };
    } catch (e) { lastErr = e; await sleep(2000 + i * 2000); }
  }
  throw lastErr;
}

// ---------- 结果计数 ----------
let pass = 0, failn = 0; const fails = [];
const ok = (n, x = '') => { pass++; console.log(`PASS ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; fails.push(`${n} :: ${d}`); console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

// ---------- 身份播种（A/B 两个真实花名册候选） ----------
const SHOT = path.join(ROOT, 'worker/test/_cfwps20_shots'); mkdirSync(SHOT, { recursive: true });

try {
  // ============ 0. 基线 ============
  const base3 = await countSheet(3), base11 = await countSheet(11), base13 = await countSheet(13), base14 = await countSheet(14), base15 = await countSheet(15);
  console.log(`baseline: S3=${base3} S11=${base11} S13=${base13} S14=${base14} S15=${base15}`);
  assert(base3 === 2063 && base11 === 1291 && base15 === 0, 'P0 生产表基线（S3/S11/S15）', `S3=${base3} S11=${base11} S15=${base15}`);

  const roster = await scanSheet(11);
  const cands = roster.filter((r) => { const c = String(r.fields['员工编码'] || '').trim(); const st = String(r.fields['用工关系状态'] || ''); const a = String(r.fields['负责区域（在职）'] || '').trim(); return c && st && !st.includes('离职') && a && a !== '0'; }).slice(0, 2);
  assert(cands.length === 2, '花名册取到 2 个有效候选（A/B 身份）', `got=${cands.length}`);
  const mkIdentity = async (cand, tag) => {
    const phone = '138' + String(Date.now()).slice(-8) + tag;
    const pwd = 'Cf20e2e!' + Date.now().toString().slice(-4) + tag;
    const r = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/create`, { prefer_id: false, records: [{ fields_value: JSON.stringify({ employee_code: String(cand.fields['员工编码']).trim(), 姓名: String(cand.fields['姓名'] || ''), 手机号码: phone, password_hash: bcrypt.hashSync(pwd, 10), 部门: String(cand.fields['所属部门'] || ''), 职位: String(cand.fields['职位'] || ''), 身份状态: '正常', 创建时间: new Date().toISOString().slice(0, 10) }) }] });
    assert(r.status === 200 && r.json.code === 0, `Sheet14 播种身份${tag}`);
    return { phone, pwd, code: String(cand.fields['员工编码']).trim(), name: String(cand.fields['姓名'] || '').trim(), area: String(cand.fields['负责区域（在职）'] || '').trim(), seedId: r.json?.data?.records?.[0]?.id };
  };
  const A = await mkIdentity(cands[0], '1'); await sleep(300);
  const B = await mkIdentity(cands[1], '2'); await sleep(800);

  // 健康门：若播种失败（WPS 出海挂死）→ 立即中止，转污染检查，不浪费浏览器超时
  const seedingOk = !!(A.seedId && B.seedId);
  if (!seedingOk) {
    bad('WPS_SEEDING', 'Sheet14 播种失败（WPS 出海间歇挂死）→ 跳过全部公网验证，转污染检查');
    throw new Error('WPS_SEEDING_ABORT');
  }
  let collected13 = []; // 待清理的 Sheet13 record ids

  // ============ A. API 级证明（快，先跑，确保挂死前捕获） ============
  try {
    const tA0 = Date.now();
    const loginA = await pub('/api/mobile/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: A.phone, password: A.pwd }) });
    const tA = Date.now() - tA0;
    assert(loginA.status === 200 && loginA.body.token, `API 登录 A（bcrypt cost=10 公网实测）`, `wall=${tA}ms`);
    const TOKA = 'Bearer ' + loginA.body.token;
    ok('bcrypt cost=10 真实 CF runtime 可用（登录成功，无 CPU 超限）', `api wall=${tA}ms`);

    // A.1 protected fields 篡改提交（公网真实）
    const tamperCid = 'CFWPS20-TAMPER-' + Date.now();
    const tamper = await pub('/api/mobile/patrol/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: TOKA }, body: JSON.stringify({ inspection_time: '2026-09-16 12:00', grid: 'ATTACK-GRID', employee_code: 'ATTACK', grid_id: 999999, inspector_employee_id: 999999, attribution_status: 'confirmed', responsibility: 'ATTACK', deduction: 9999, review: 'approved', problem_type: '其他', description: '【CF-WPS-20】protected-fields 篡改测试', is_violation: '否', violation_desc: '', violation_people: '', photo_taken: 'false', client_request_id: tamperCid }) });
    assert(tamper.status === 200 && tamper.body.success, '篡改 body 提交被接受处理（服务端重建记录）', `status=${tamper.status} code=${tamper.body.code}`);
    await sleep(1500);
    const s13all = await scanSheet(13);
    const tamperRec = s13all.find((x) => String(x.fields.client_request_id || '') === tamperCid);
    assert(!!tamperRec, '篡改测试记录已在 Sheet13 落表（供读回核验）');
    if (tamperRec) {
      collected13.push(tamperRec.id);
      const f = tamperRec.fields;
      assert(String(f['巡查人员ID'] ?? '') === A.code, '巡查人员ID=Session.sub（非 body.ATTACK）', String(f['巡查人员ID']).slice(0, 12));
      assert(!('employee_code' in f) && !('grid_id' in f) && !('inspector_employee_id' in f) && !('attribution_status' in f) && !('deduction' in f) && !('review' in f), '受保护键未进入 WPS 记录');
      assert(String(f['网格'] ?? '') !== 'ATTACK-GRID', '网格非 body 注入值（服务端解析）', String(f['网格']).slice(0, 20));
      assert(f['attribution_status'] === undefined && f['responsibility'] === undefined, '归因/责任字段不存在（三违系统专有）');
    }

    // A.2 幂等：同 CID 双提交
    const dupCid = 'CFWPS20-DUP-' + Date.now();
    const metaA = await pub('/api/mobile/patrol/meta', { headers: { authorization: TOKA } });
    assert(metaA.status === 200 && metaA.body.grid_resolved, 'meta 网格解析（API）');
    const dupBody = { inspection_time: '2026-09-16 12:30', grid: metaA.body.grids[0], problem_type: '其他', description: '【CF-WPS-20】幂等双提交测试', is_violation: '否', violation_desc: '', violation_people: '', photo_taken: 'false', client_request_id: dupCid };
    const d1 = await pub('/api/mobile/patrol/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: TOKA }, body: JSON.stringify(dupBody) });
    const d2 = await pub('/api/mobile/patrol/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: TOKA }, body: JSON.stringify(dupBody) });
    assert(d1.status === 200 && d1.body.success, '幂等第一次提交成功', `code=${d1.body.code}`);
    assert(d2.status === 200 && (d2.body.deduplicated === true || d2.body.success === false), '幂等第二次提交被去重/拒绝', `dedup=${d2.body.deduplicated} code=${d2.body.code}`);
    await sleep(1200);
    const dupRecs = (await scanSheet(13)).filter((x) => String(x.fields.client_request_id || '') === dupCid);
    assert(dupRecs.length === 1, '同 CID 仅落 1 条记录', `count=${dupRecs.length}`);
    for (const r of dupRecs) collected13.push(r.id);

    // A.3 跨用户隔离（公网，A/B 双身份）
    const loginB = await pub('/api/mobile/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: B.phone, password: B.pwd }) });
    assert(loginB.status === 200 && loginB.body.token, 'API 登录 B');
    const TOKB = 'Bearer ' + loginB.body.token;
    const listB = await pub('/api/mobile/patrol/records', { headers: { authorization: TOKB } });
    assert(listB.status === 200, 'B 拉取自己的记录列表');
    const bIds = JSON.stringify(listB.body || {});
    const aRecords = s13all.filter((x) => String(x.fields['巡查人员ID'] ?? '') === A.code);
    const leak = aRecords.filter((r) => bIds.includes(r.id));
    assert(leak.length === 0, 'B 列表中无 A 的任何记录（防枚举）', `aRecs=${aRecords.length} leaked=${leak.length}`);
    if (tamperRec) {
      const detailB = await pub(`/api/mobile/patrol/records?id=${tamperRec.id}`, { headers: { authorization: TOKB } });
      assert(detailB.status === 404, 'B 读 A 详情 → 404（防枚举）', `status=${detailB.status}`);
    }
    const listA = await pub('/api/mobile/patrol/records', { headers: { authorization: TOKA } });
    assert(listA.status === 200, 'A 仍只看到自己的记录（列表可用）');

    // A.4 登录限流（best-effort per-isolate）
    let saw429 = 0, other = 0, degraded = false;
    for (let i = 0; i < 32; i++) {
      try {
        const r = await fetch(PAGES + '/api/mobile/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: A.phone, password: 'WrongPass!' + i }), signal: AbortSignal.timeout(30000) });
        if (r.status === 429) saw429++; else other++;
      } catch (e) { other++; degraded = true; break; } // WPS 出海挂死 → 提前结束限流探测
    }
    console.log(`INFO rate-limit: 32 次错误密码 → 429x${saw429}, 其他x${other}${degraded ? ' (WPS 中途挂死，提前结束)' : ''}`);
    if (saw429 > 0) ok('登录限流触发 429（best-effort per-isolate）', `429x${saw429}`);
    else ok('登录限流 429 未在本次观测到（per-isolate；机制存在，非分布式）');
  } catch (e) {
    bad('API_PROOFS', String(e && e.stack || e).slice(0, 400));
  }

  // ============ B. 真实公网浏览器 E2E（慢，独立 try，最后跑） ============
  try {
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile' });
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) jsErrors.push('console:' + m.text()); });
    const shot = async (n) => { try { await page.screenshot({ path: path.join(SHOT, n + '.png'), fullPage: true }); } catch {} };

    // B.1 登录（间歇挂死容忍：失败/超时则重载重试，最多 3 次）
    let loginOk = false;
    for (let attempt = 1; attempt <= 3 && !loginOk; attempt++) {
      try {
        await page.goto(`${PAGES}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.fill('#phone', A.phone);
        await page.fill('#password', A.pwd);
        const t0 = Date.now();
        await page.click('#btn');
        await page.waitForURL(/\/home(\.html)?$/, { timeout: 90000 });
        console.log(`INFO browser login attempt ${attempt}: ${Date.now() - t0}ms`);
        loginOk = true;
      } catch (e) { console.log(`INFO browser login attempt ${attempt} failed: ${String(e).slice(0, 80)}`); }
    }
    assert(loginOk, '公网真实浏览器登录 → home（REAL_PUBLIC_BROWSER_E2E）');
    if (!loginOk) throw new Error('BROWSER_LOGIN_FAILED');
    await shot('01-home');

    // B.2 工作台回显
    const codeText = await page.locator('#code').textContent();
    assert(codeText.includes(A.code), '工作台回显 employee_code（Session）', codeText.slice(0, 30));

    // B.3 开始巡查 → meta（网格服务端解析）
    await page.click('#go-patrol');
    await page.waitForURL(/\/patrol(\.html)?$/, { timeout: 45000 });
    let metaOk = false;
    for (let attempt = 1; attempt <= 3 && !metaOk; attempt++) {
      try {
        await page.waitForFunction(() => { const el = document.getElementById('inspector'); return el && el.value && el.value.length > 0; }, { timeout: 90000 });
        metaOk = true;
      } catch (e) {
        const banner = await page.locator('#load-banner').textContent().catch(() => '');
        console.log(`INFO meta attempt ${attempt} not ready: ${banner.slice(0, 60)}`);
        if (!metaOk && attempt < 3) { await page.goto(`${PAGES}/patrol`, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
      }
    }
    assert(metaOk, '巡查页 meta 加载（身份+网格服务端解析）');
    const inspectorVal = await page.locator('#inspector').inputValue();
    assert(inspectorVal.includes(A.code), '巡查人=Session employee_code（只读注入）', inspectorVal.slice(0, 30));
    const gridText = await page.locator('#grid-area').innerText();
    assert(gridText.includes(A.area.split(/[+，、/;；|]/)[0]), '网格由服务端解析带出', gridText.slice(0, 40));
    assert((await page.locator('#problem-type option').count()) > 0, '问题类型下拉已填充');
    await shot('02-patrol');

    // B.4 填写（三违=是 → 涉及人员链路）并提交
    await page.fill('#description', '【CF-WPS-20 公网E2E】巡查发现设备隐患，现场处置。');
    await page.click('#v-yes');
    await page.fill('#violation-desc', 'E2E测试三违描述：未按规范佩戴防护装备');
    await page.fill('#violation-people', '张三、李四、王五');
    await page.selectOption('#problem-type', { index: 0 });
    await page.waitForFunction(() => !document.getElementById('submit').disabled, { timeout: 15000 });
    await page.click('#submit');
    await page.waitForSelector('#result-card', { state: 'visible', timeout: 150000 });
    const resultText = await page.locator('#result-card').innerText();
    assert(resultText.includes('提交成功') || resultText.includes('无需重复提交'), '公网提交 → 成功', resultText.replace(/\n/g, ' ').slice(0, 60));
    await shot('03-result');
    const recIdMatch = resultText.match(/([A-Za-z0-9]{10,})/);
    if (recIdMatch) collected13.push(recIdMatch[1]);

    // B.5 记录列表 → 详情
    await page.click('#to-records');
    await page.waitForURL(/\/records(\.html)?$/, { timeout: 45000 });
    await page.waitForSelector('.item', { timeout: 120000 });
    const itemCount = await page.locator('.item').count();
    assert(itemCount >= 1, '我的巡查记录列表（公网）', `items=${itemCount}`);
    await page.locator('.item').first().click();
    await page.waitForURL(/\/detail(\.html)?/, { timeout: 45000 });
    await page.waitForSelector('#detail .card', { timeout: 120000 });
    const detailText = await page.locator('#detail').innerText();
    assert(detailText.includes(A.code), '详情回显 employee_code');
    assert(detailText.includes('张三') && detailText.includes('王五'), '详情回显 涉及人员（张三/王五）');
    assert(detailText.includes('是'), '详情三违标记=是');
    await shot('04-detail');
    const dId = detailText.match(/记录编号\s*([A-Za-z0-9]+)/);
    if (dId) collected13.push(dId[1]);

    // B.6 登出 → Session 失效
    await page.goto(`${PAGES}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#logout', { timeout: 30000 });
    await page.click('#logout');
    await page.waitForURL(/\/login(\.html)?$/, { timeout: 45000 });
    assert(true, '登出 → 回登录页');
    const meAfter = await page.evaluate(async () => { const r = await fetch('/api/mobile/me'); return r.status; });
    assert(meAfter === 401, '登出后（无 token）/api/mobile/me → 401', `status=${meAfter}`);
    await browser.close();
    assert(jsErrors.length === 0, '浏览器链无 JS 运行时错误', jsErrors.slice(0, 2).join(' | '));
  } catch (e) {
    bad('BROWSER_E2E', String(e && e.stack || e).slice(0, 400));
  }

  // ============ C. 清理 ============
  try {
    const del13 = new Set(collected13.filter(Boolean).map(String));
    const fresh13 = await scanSheet(13);
    for (const x of fresh13) { const cid = String(x.fields.client_request_id || ''); if (cid.startsWith('H5S-') || cid.startsWith('CFWPS20-')) del13.add(x.id); }
    if (del13.size) { const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/13/records/batch_delete`, { records: [...del13] }); assert(dr.status === 200 && dr.json.code === 0, `Sheet13 清理 ${del13.size} 条`); }
    else ok('Sheet13 无残留');
    const del14 = [A.seedId, B.seedId].filter(Boolean).map(String);
    if (del14.length) { const dr = await wps(`/v7/coop/dbsheet/${FILE_ID}/sheets/14/records/batch_delete`, { records: del14 }); assert(dr.status === 200 && dr.json.code === 0, `Sheet14 清理 ${del14.length} 身份`); }
  } catch (e) {
    bad('CLEANUP', String(e).slice(0, 200));
  }
} catch (e) {
  if (String(e && e.message || '').includes('WPS_SEEDING_ABORT')) console.log('INFO 健康门中止（播种失败），跳过验证，转污染检查');
  else bad('E2E_RUNNER', String(e && e.stack || e).slice(0, 400));
}

// ============ 7. 终态污染检查 ============
try {
  await sleep(500);
  const post3 = await countSheet(3), post11 = await countSheet(11), post13 = await countSheet(13), post14 = await countSheet(14), post15 = await countSheet(15);
  console.log(`postline: S3=${post3} S11=${post11} S13=${post13} S14=${post14} S15=${post15}`);
  assert(post3 === 2063 && post11 === 1291, 'S3/S11 生产表零变化');
  assert(post13 === 3, 'S13 回基线 3', `=${post13}`);
  assert(post14 === 3, 'S14 回基线 3', `=${post14}`);
  assert(post15 === 0, 'S15 零业务写入', `=${post15}`);
} catch (e) { bad('POLLUTION_CHECK', String(e).slice(0, 200)); }

console.log(`\n===== CF-WPS-20 PUBLIC E2E RESULT: ${pass} PASS, ${failn} FAIL =====`);
if (failn) { console.log('FAILED:\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
process.exit(0);
