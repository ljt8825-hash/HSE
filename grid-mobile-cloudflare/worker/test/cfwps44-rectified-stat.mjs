/* CF-WPS-44 浏览器 E2E：乡镇作业中心经理 / 管理员 首页「已整改」统计
 *
 * 诉求（用户原话）：
 *   「在乡镇作业中心经理、管理员两级账号的首页，在本月上报后增加『已整改』，
 *     显示这个月已整改的数量，若待整改数量到了次月，待整改数量继续显示，
 *     直到整改完成为止。」
 *
 * 覆盖断言：
 *   ① 经理 / 管理员：4 卡布局，顺序 = 本月派发|本月上报 → 已整改 → 待整改 → 已闭环
 *   ② 公司管理：不显示「已整改」，仍是 3 卡（不受影响）
 *   ③ 取值 = 服务端「本月已整改」+ 本机「本月已整改且未入库」；
 *      已入库（有 serverRecordId）的**不重复计数**；跨月的本机记录**不计**
 *   ④ 待整改**跨月不清零**：塞一条 3 个月前仍未完成的记录，计数照涨（直到整改完成为止）
 *   ⑤ 真实登录账号：卡片可见性与该账号真实角色一致
 *   ⑥ 3 个机型视口：4 卡不换行、不横向溢出、文字不被裁切
 *
 * 只读纪律（硬约束）：
 *   - 全程路由拦截：除登录 POST 外，任何非 GET 的 /api/mobile/* 请求一律 abort。
 *     跑完断言 blocked === 0 —— 用来**证明**本次 E2E 一个生产写请求都没发出去。
 *   - 注入进 db.records 的夹具一律 syncState:"synced" + 无 afterPhoto，
 *     否则 retryPendingSync() 会把夹具当未上报记录推给飞书（真实写库）。
 *   - 不点「整改完成」「提交」等任何写路径按钮，只在首页读 DOM。
 *
 * 前置：另开终端启动本地「Pages 等价」服务
 *   cd grid-mobile-cloudflare
 *   HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 \
 *   NO_PROXY=127.0.0.1,localhost NODE_USE_ENV_PROXY=1 node tools/local-pages-server.mjs
 * Run: node worker/test/cfwps44-rectified-stat.mjs
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { e2eAccount } from './e2e-account.mjs';

const BASE = process.env.LOCAL_PAGES || 'http://127.0.0.1:5899';
const { phone: PHONE, password: PASSWORD } = e2eAccount();   // 无凭据时 fail loud

const PW_DIR = 'G:/hse-dashboard/安全看板vben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { createRequire } = await import('node:module');
const pwMod = createRequire(import.meta.url)(PW_DIR);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
if (!chromium) throw new Error('playwright-core chromium 未加载: ' + Object.keys(pwMod).join(','));

const SHOTS = path.resolve(import.meta.dirname, '_cfwps44_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-proxy-server', '--disable-dev-shm-usage', '--no-first-run'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN',
});
const page = await ctx.newPage();

const consoleErrors = [];
const benign = (s) => /favicon\.ico/.test(s);
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/i.test(t)) return;   // 无 URL，交给 response 监听
  consoleErrors.push('console: ' + t);
});
page.on('response', (r) => { if (r.status() >= 400 && !benign(r.url())) consoleErrors.push(`http ${r.status()}: ${r.url()}`); });

/* ---------- 写操作护栏：除登录外，非 GET 的 /api/mobile/* 一律 abort ---------- */
const guard = { blocked: 0, allowed: [] };
await page.route('**/api/mobile/**', (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const isLogin = /\/api\/mobile\/auth\/login$/.test(p);
  if (req.method() !== 'GET' && !isLogin) {
    guard.blocked++;
    guard.allowed.push(`${req.method()} ${p}`);
    return route.abort();
  }
  return route.continue();
});

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
// 当前**可见**统计卡的标签顺序（可见性 + 顺序一次读出）
const visibleLabels = () => page.$$eval('.stat-row .stat-card',
  (els) => els.filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => (e.querySelector('.lab') || {}).textContent ? e.querySelector('.lab').textContent.trim() : '?'));
const num = (id) => page.$eval('#' + id, (e) => String(e.textContent).trim());
const visible = (sel) => page.locator(sel).isVisible().catch(() => false);

try {
  /* ================= 登录（真实生产账号，只读） ================= */
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
  await page.fill('#phone', PHONE);
  await page.fill('#password', PASSWORD);
  await page.click('#btn');
  await page.waitForURL((u) => u.pathname.startsWith('/check'), { timeout: 40000 });
  await page.waitForSelector('#view-home.active', { timeout: 25000 });
  await page.waitForFunction(() => typeof db !== 'undefined' && db && Array.isArray(db.records), null, { timeout: 15000 });
  await page.waitForTimeout(3200);   // 让启动后 2s 的那次 inbox 轮询先落地，后续读数才稳定

  const realRole = await page.evaluate(() => session.role);
  console.log(`\n[真实账号] role=${realRole}\n`);

  /* ================= ① / ⑤ 真实角色下的可见性契约 ================= */
  const expectShown = realRole === '经理' || realRole === '管理员';
  const cardShown = await visible('#stat-rectified-card');
  assert(cardShown === expectShown, `⑤ 真实账号卡片可见性与角色一致（role=${realRole}）`, `shown=${cardShown} expect=${expectShown}`);
  const realLabels = await visibleLabels();
  console.log('    可见卡片：' + realLabels.join(' | '));
  if (expectShown) {
    assert(realLabels.indexOf('已整改') === 1, '① 「已整改」紧跟在本月上报/派发之后（第 2 张）', realLabels.join('|'));
    assert(/^\d+$/.test(await num('stat-rectified')), '① 「已整改」是数字', await num('stat-rectified'));
  } else {
    assert(realLabels.indexOf('已整改') === -1 && realLabels.length === 3, '② 公司管理仍是 3 卡、无「已整改」', realLabels.join('|'));
  }
  await shot('01-real-role-home');

  /* ================= ③ 取值口径（注入夹具，确定性） ================= */
  const calc = await page.evaluate(() => {
    const now = Date.now();
    const seg = (id, o) => Object.assign({ id, type: '三违', checkerId: session.id, checkerName: session.name,
      syncState: 'synced', serverRecordId: null, afterPhoto: null, time: now, status: 'transferred' }, o);
    // 甲：本机整改完成、本月、未入库 → 应计入
    // 乙：本机整改完成、本月、**已入库** → 服务端口径已计，本机不得重复计
    // 丙：本机整改完成、**跨月**（2026-06）→ 不计本月
    // 丁：本机**未完成**、**跨月**（2026-06）→ 待整改应继续显示（跨月不清零）
    db.records.push(seg('t44_jia', { rectifierId: session.id, status: 'done',    rectifyTime: now,                        serverRecordId: null }));
    db.records.push(seg('t44_yi',  { rectifierId: session.id, status: 'done',    rectifyTime: now,                        serverRecordId: 'srv_dup_demo' }));
    db.records.push(seg('t44_bing',{ rectifierId: session.id, status: 'done',    rectifyTime: new Date(2026, 5, 10).getTime(), serverRecordId: null }));
    db.records.push(seg('t44_ding',{ rectifierId: session.id, status: 'transferred', time: new Date(2026, 5, 1).getTime() }));
    const pendingBefore = Number(document.getElementById('stat-pending').textContent);
    session.role = '管理员';
    inboxMonthlyDone = 7;                       // 服务端「本月已整改」夹具值
    updateRectifiedStat();
    return { text: document.getElementById('stat-rectified').textContent, pendingBefore };
  });
  // 本机应计入 = 甲 1 条 ⇒ 7 + 1 = 8（乙重复计数则 9；丙跨月计入则 9）
  assert(calc.text === '8', '③ 已整改 = 服务端 7 + 本机本月未入库 1（排除已入库重复计数与跨月记录）', `实际=${calc.text} 期望=8`);

  /* ================= ④ 待整改跨月不清零 ================= */
  await page.evaluate(() => refreshHomeStats());
  await page.waitForTimeout(600);   // 等异步 refreshInboxStats 落地
  const pendingAfter = Number(await num('stat-pending'));
  assert(pendingAfter === calc.pendingBefore + 1,
    '④ 待整改跨月继续显示（塞入 2026-06 未完成记录后 +1）',
    `${calc.pendingBefore} → ${pendingAfter}`);

  /* ================= ② 公司管理：3 卡布局不变 ================= */
  await page.evaluate(() => { session.role = '公司管理'; updateRectifiedStat(); });
  const labMgmt = await visibleLabels();
  assert(labMgmt.length === 3 && labMgmt.indexOf('已整改') === -1, '② 公司管理 3 卡、无「已整改」', labMgmt.join('|'));
  assert(!(await visible('#stat-rectified-card')), '② 公司管理卡片 display:none');
  await shot('02-company-3cards');

  /* ================= ① 经理：4 卡同行 + 几何（3 视口） ================= */
  for (const vp of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    // 必须走 refreshHomeStats()（而不是只调 updateRectifiedStat）：
    // 「本月派发/本月上报」文案也在 refreshHomeStats 里按角色改，只调前者会让文案滞后一轮。
    await page.evaluate(() => { session.role = '经理'; inboxMonthlyDone = 3; refreshHomeStats(); });
    await page.waitForTimeout(400);   // 等异步 refreshInboxStats + 布局/过渡稳定
    const geo = await page.evaluate(() => {
      const row = document.querySelector('.stat-row');
      const cards = [...row.querySelectorAll('.stat-card')].filter((e) => getComputedStyle(e).display !== 'none');
      const boxes = cards.map((e) => e.getBoundingClientRect());
      const txt = cards.map((e) => {
        const l = e.querySelector('.lab'), n = e.querySelector('.num');
        return { lab: l.textContent.trim(), labOver: l.scrollWidth - l.clientWidth, numOver: n.scrollWidth - n.clientWidth };
      });
      return {
        n: cards.length, rowOver: row.scrollWidth - row.clientWidth,
        sameRow: boxes.every((b) => Math.abs(b.top - boxes[0].top) < 1.5),
        minW: Math.min(...boxes.map((b) => b.width)),
        asc: boxes.every((b, i) => i === 0 || b.left > boxes[i - 1].left),
        labels: txt.map((t) => t.lab), over: txt.some((t) => t.labOver > 1 || t.numOver > 1),
      };
    });
    const tag = `${vp.width}x${vp.height}`;
    assert(geo.n === 4, `① [${tag}] 经理可见 4 张统计卡`, `n=${geo.n}`);
    assert(geo.sameRow, `① [${tag}] 4 卡同一行（不换行）`);
    assert(geo.asc, `① [${tag}] 左→右顺序正确`, geo.labels.join('|'));
    assert(geo.labels.join('') === '本月派发已整改待整改已闭环', `① [${tag}] 顺序=本月派发→已整改→待整改→已闭环`, geo.labels.join('|'));
    assert(geo.rowOver <= 1, `① [${tag}] 统计行无横向溢出`, `overflow=${geo.rowOver}`);
    assert(!geo.over, `① [${tag}] 数字/标签未被裁切`);
    assert(geo.minW >= 66, `① [${tag}] 单卡宽度可读（≥66px）`, `minW=${geo.minW.toFixed(1)}`);
    if (vp.width === 390) await shot('03-manager-390-4cards');
  }

  /* ================= 收尾：真实角色还原 + 控制台/写护栏 ================= */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((r) => { session.role = r; }, realRole);
  const realErrs = consoleErrors.filter((e) => !benign(e));
  assert(realErrs.length === 0, '控制台/网络无异常', realErrs.slice(0, 4).join(' ; '));
  assert(guard.blocked === 0, '只读纪律：本次 E2E 零非 GET 请求（零生产写入）', guard.allowed.join(' ; ') || 'blocked=0');
} catch (e) {
  bad('E2E 执行异常', e && e.message ? e.message : String(e));
} finally {
  console.log(`\n--- ${pass} passed, ${fail} failed ---`);
  console.log(`截图目录：${SHOTS}`);
  await ctx.close(); await browser.close();
  process.exit(fail ? 1 : 0);
}
