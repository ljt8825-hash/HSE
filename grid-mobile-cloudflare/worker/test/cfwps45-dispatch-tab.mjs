/* CF-WPS-45 浏览器 E2E：「派发记录」页（底部导航新增第 2 个页签）
 *
 * 需求（2026-09-19 用户原话）：「增加：派发的记录」
 *   → 形态 = 底部导航新增一页；口径 = **只列我派出去、对方还没整改完的**（跨月一直显示）。
 *
 * 关键设计：夹具不是手写的，而是**离线跑真实 Worker 处理器产出的那份 JSON**
 *   （见 cfwps45-dispatch-fixture.mjs）⇒ 后端字段名/过滤口径一改，本测试立刻红。
 *   手写夹具的最大风险是「两边字段名不一致时两个测试都绿、线上空白」，这里从根上避免。
 *
 * 覆盖断言：
 *   ① 真实账号：页签可见性与该账号角色一致（公司管理/经理可见，其余隐藏）
 *   ② 经理：页签可见 → 点击 → 视图切换 + 页签高亮
 *   ③ 顶部汇总 = 「未整改完成 2 条（另有 2 条已整改完成）」
 *   ④ 列表 2 条、顺序 = 本月派发的在前、跨月挂着的在后
 *   ⑤ ★ 跨月未整改的那条**确实在列表里**（本需求核心），且显示「挂账 N 天」
 *   ⑥ 卡片含派发对象姓名 + 责任单位
 *   ⑦ 页签角标 = 未整改完成条数
 *   ⑧ 管理员：页签隐藏
 *   ⑨ 空列表 → 空态文案；接口失败 → 降级文案（不白屏、不抛异常）
 *   ⑩ 5 个页签在 360/375/390 宽度下不换行、不横向溢出、标签不被裁切
 *
 * 只读纪律（硬约束）：
 *   - 除登录 POST 外，任何非 GET 的 /api/mobile/* 一律 abort，收尾断言 blocked === 0
 *   - /api/mobile/dispatched 用夹具注入，绝不打真实网络（该接口生产尚未部署）
 *   - 不点任何写路径按钮（本页本就只读，无写入口）
 *
 * 前置：另开终端启动本地「Pages 等价」服务
 *   cd grid-mobile-cloudflare
 *   HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 \
 *   NO_PROXY=127.0.0.1,localhost NODE_USE_ENV_PROXY=1 node tools/local-pages-server.mjs
 * Run: node worker/test/cfwps45-dispatch-tab.mjs
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { e2eAccount } from './e2e-account.mjs';
import { buildDispatchedAfterLogin, ME_NAME, SUB_NAME, PREV_YM } from './cfwps45-dispatch-fixture.mjs';

const BASE = process.env.LOCAL_PAGES || 'http://127.0.0.1:5899';
const { phone: PHONE, password: PASSWORD } = e2eAccount();   // 无凭据时 fail loud

const PW_DIR = 'G:/hse-dashboard/安全看板vben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { createRequire } = await import('node:module');
const pwMod = createRequire(import.meta.url)(PW_DIR);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
if (!chromium) throw new Error('playwright-core chromium 未加载: ' + Object.keys(pwMod).join(','));

const SHOTS = path.resolve(import.meta.dirname, '_cfwps45_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

/* ---------- 先用真实处理器产出夹具（此时还没起浏览器，fetch 覆盖不干扰 Playwright） ---------- */
const FIX = await buildDispatchedAfterLogin();
const FIXTURE = FIX.body;
console.log(`\n[夹具] 由离线 Worker 真实产出：pending=${FIXTURE.pending_count} done=${FIXTURE.done_count} records=${(FIXTURE.records || []).length}\n`);
if (!FIXTURE || !FIXTURE.success) { console.error('夹具构建失败：' + JSON.stringify(FIXTURE).slice(0, 200)); process.exit(1); }

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
page.on('response', (r) => {
  if (r.status() < 400 || benign(r.url())) return;
  // 本测试自己注入的失败用例（503）不算页面异常 —— 它正是用来验证降级文案的
  if (/\/api\/mobile\/dispatched/.test(r.url()) && dispatchMode === 'fail') return;
  consoleErrors.push(`http ${r.status()}: ${r.url()}`);
});

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

/* ---------- 夹具注入：/api/mobile/dispatched 全部走本地夹具，不打真实网络 ---------- */
let dispatchMode = 'ok';        // ok | empty | fail
let dispatchHits = 0;
await page.route('**/api/mobile/dispatched**', (route) => {
  dispatchHits++;
  if (dispatchMode === 'fail') {
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'WPS_UPSTREAM_ERROR', message: '派发记录暂不可用' }) });
  }
  if (dispatchMode === 'empty') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', me: { id: 'x', name: 'x', role: '经理' }, pending_count: 0, done_count: 3, total: 3, records: [] }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) });
});

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
const visible = (sel) => page.locator(sel).isVisible().catch(() => false);
const txt = (sel) => page.$eval(sel, (e) => String(e.textContent).trim()).catch(() => '');
// 列表卡片文本（逐张）
const cardTexts = () => page.$$eval('#dispatch-list .record-card', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));

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
  await page.waitForTimeout(2500);

  const realRole = await page.evaluate(() => session.role);
  console.log(`\n[真实账号] role=${realRole}\n`);

  /* ================= ① 真实角色下的页签可见性契约 ================= */
  const expectTab = realRole === '公司管理' || realRole === '经理';
  const tabShown = await visible('#tab-dispatch');
  assert(tabShown === expectTab, `① 真实账号页签可见性与角色一致（role=${realRole}）`, `shown=${tabShown} expect=${expectTab}`);
  assert((await txt('#tab-dispatch-label')) === '派发记录', '① 页签文案 = 派发记录', await txt('#tab-dispatch-label'));
  await shot('01-real-role-home');

  /* ================= ② 经理：点开页面 ================= */
  await page.evaluate(() => { session.role = '经理'; applyDispatchTabGate(); });
  assert(await visible('#tab-dispatch'), '② 经理 → 页签可见');
  await page.click('#tab-dispatch');
  await page.waitForSelector('#view-dispatch.active', { timeout: 10000 });
  await page.waitForTimeout(700);
  assert(dispatchHits > 0, '② 打开页面即拉取 /api/mobile/dispatched', `hits=${dispatchHits}`);
  const activeTab = await page.$eval('#tabbar .tab-item.active', (e) => e.dataset.tab).catch(() => '');
  assert(activeTab === 'dispatch', '② 页签高亮同步到「派发记录」', activeTab);

  /* ================= ③④⑤⑥ 列表内容 ================= */
  const head = await txt('#dispatch-list .section-label');
  assert(head === '未整改完成 2 条（另有 2 条已整改完成）', '③ 顶部汇总量与后端口径一致', head);

  const cards = await cardTexts();
  assert(cards.length === 2, '④ 列表只列未整改完成的 2 条（已完成的只计数、不占列表）', `n=${cards.length}`);
  assert(/2026-\d\d-\d\d/.test(cards[0] || ''), '④ 第 1 张卡带派发时间（刚派完的排最前）', String(cards[0]).slice(0, 60));

  // ⑤ 核心：跨月未整改的那条必须在列表里，且标出挂账天数。
  //    按「派发月份 = 上月」定位那张卡（不能只看第一张：第一张是本月派的）。
  const crossCard = cards.find((c) => new RegExp(PREV_YM + '-\\d\\d').test(c)) || '';
  assert(!!crossCard, `⑤ ★ 跨月（${PREV_YM}）未整改的记录**仍在列表**（跨月不清零）`, cards.map((c) => c.slice(0, 40)).join(' ‖ '));
  const days = Number((crossCard.match(/挂账 (\d+) 天/) || [])[1] || 0);
  assert(days >= 28, `⑤ 挂账天数按派发当天起算（${PREV_YM}-01 派出 → ≥28 天）`, `days=${days}`);
  assert((FIXTURE.records || []).every((r) => r.assigner_name === ME_NAME), '夹具自检：列表内每条记录的派发人都是本人', (FIXTURE.records || []).map((r) => r.assigner_name).join(','));
  assert(crossCard.includes(SUB_NAME), '⑥ 卡片显示派发对象姓名（派给了谁）', crossCard.slice(0, 80));
  assert(/甲片区/.test(crossCard), '⑥ 卡片显示整改责任单位', crossCard.slice(0, 80));

  /* ================= ⑦ 页签角标 ================= */
  const badge = await page.$eval('#badge-dispatch', (e) => e.classList.contains('hidden') ? '' : e.textContent).catch(() => '');
  assert(badge === '2', '⑦ 页签角标 = 未整改完成条数', `badge='${badge}'`);
  await shot('02-manager-dispatch-page');

  /* ================= ⑨ 空列表 / 失败降级 ================= */
  dispatchMode = 'empty';
  await page.evaluate(() => { dispatchRecs = null; dispatchAt = 0; });
  await page.evaluate(() => renderDispatch());
  await page.waitForTimeout(400);
  const emptyTxt = await txt('#dispatch-list');
  assert(/派出去的都整改完成了/.test(emptyTxt), '⑨ 空列表 → 空态文案（不白屏）', emptyTxt.slice(0, 60));
  assert(/另有 3 条已整改完成/.test(emptyTxt), '⑨ 空态仍显示已完成条数（上下文不丢）', emptyTxt.slice(0, 60));

  dispatchMode = 'fail';
  await page.evaluate(() => { dispatchRecs = null; dispatchAt = 0; });
  await page.evaluate(() => renderDispatch());
  await page.waitForTimeout(400);
  const failTxt = await txt('#dispatch-list');
  assert(/派发记录暂时拉不到/.test(failTxt), '⑨ 接口失败 → 降级文案（不抛异常、不白屏）', failTxt.slice(0, 60));
  const failBadge = await page.$eval('#badge-dispatch', (e) => e.classList.contains('hidden') ? '' : e.textContent).catch(() => '');
  assert(failBadge === '', '⑨ 失败时不亮角标（不拿旧值骗人）', `badge='${failBadge}'`);

  dispatchMode = 'ok';
  await page.evaluate(() => { dispatchRecs = null; dispatchAt = 0; });
  await page.evaluate(() => renderDispatch());
  await page.waitForTimeout(500);
  assert((await cardTexts()).length === 2, '⑨ 恢复后列表重新正确渲染', `${(await cardTexts()).length}`);

  /* ================= ⑧ 管理员：页签隐藏 ================= */
  await page.evaluate(() => { session.role = '管理员'; applyDispatchTabGate(); });
  assert(!(await visible('#tab-dispatch')), '⑧ 管理员（不转派）→ 页签隐藏');
  await shot('03-admin-tab-hidden');
  await page.evaluate(() => { session.role = '经理'; applyDispatchTabGate(); });

  /* ================= ⑩ 5 页签几何（3 视口） ================= */
  await page.evaluate(() => { showView('home'); });
  await page.waitForTimeout(300);
  for (const vp of [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    await page.evaluate(() => { session.role = '经理'; applyDispatchTabGate(); });
    await page.waitForTimeout(350);
    const geo = await page.evaluate(() => {
      const bar = document.querySelector('#tabbar');
      const items = [...bar.querySelectorAll('.tab-item')].filter((e) => getComputedStyle(e).display !== 'none');
      const boxes = items.map((e) => e.getBoundingClientRect());
      const lab = items.map((e) => {
        // 标签文本必须剔除角标 span 与图标：首页/我的 的标签是裸文本节点（无 span），
        // 巡查台账/整改任务的第一个 <span> 是**角标** —— 直接取 querySelector('span')
        // 会读成 '' 或 '0'（本轮踩过，不是产品缺陷）。
        const c = e.cloneNode(true);
        [...c.querySelectorAll('.tab-badge, svg')].forEach((x) => x.remove());
        return c.textContent.trim();
      });
      // 用探针量每个标签的**自然宽度**，再与**它自己那个页签**的可用宽度比 ——
      // 这才是「会不会被裁切」的实证。不能拿「最窄页签」去比「最宽标签」：
      // 「首页 / 我的」只有 2 字（页签宽 22px）本来就窄，那不算裁切。
      const cs = getComputedStyle(items[0]);
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:' + cs.fontSize
        + ';font-family:' + cs.fontFamily + ';font-weight:' + cs.fontWeight;
      bar.appendChild(probe);
      const fit = items.map((e, i) => {
        probe.textContent = lab[i];
        const labW = probe.getBoundingClientRect().width;
        return { t: lab[i], itemW: boxes[i].width, itemH: boxes[i].height, labW, fits: boxes[i].width + 1 >= labW };
      });
      probe.remove();
      return {
        n: items.length,
        barOver: bar.scrollWidth - bar.clientWidth,
        sameRow: boxes.every((b) => Math.abs(b.top - boxes[0].top) < 1.5),
        asc: boxes.every((b, i) => i === 0 || b.left > boxes[i - 1].left),
        labels: lab,
        minItemW: Math.min(...fit.map((f) => f.itemW)),
        maxLabW: Math.max(...fit.map((f) => f.labW)),
        minRatio: Math.min(...fit.map((f) => f.itemW / f.labW)),
        notFit: fit.filter((f) => !f.fits).map((f) => `${f.t}(${f.itemW.toFixed(0)}px<${f.labW.toFixed(0)}px)`).join(','),
        // 换行会让页签高度超出导航栏高度（.tab-item 是 stretch 到 64px 的 flex 列）
        wrapped: fit.filter((f) => f.itemH > 66).map((f) => f.t).join(','),
      };
    });
    const tag = `${vp.width}x${vp.height}`;
    assert(geo.n === 5, `⑩ [${tag}] 可见 5 个页签`, `n=${geo.n}`);
    assert(geo.labels.join('|') === '首页|派发记录|整改任务|巡查台账|我的', `⑩ [${tag}] 顺序与文案正确`, geo.labels.join('|'));
    assert(geo.sameRow, `⑩ [${tag}] 5 个页签同一行（不换行）`);
    assert(geo.asc, `⑩ [${tag}] 左→右顺序排列`);
    assert(geo.barOver <= 1, `⑩ [${tag}] 导航栏无横向溢出`, `overflow=${geo.barOver}`);
    assert(geo.notFit === '', `⑩ [${tag}] 每个页签都放得下自己的标签（逐项实测，无裁切）`, geo.notFit);
    assert(geo.wrapped === '', `⑩ [${tag}] 标签未换行（页签高度未超导航栏）`, geo.wrapped);
    assert(geo.minRatio >= 1.0, `⑩ [${tag}] 页签宽度 / 标签宽度 最小值 ≥1.0`, `minRatio=${geo.minRatio.toFixed(2)}`);
    assert(geo.maxLabW >= 34 && geo.maxLabW <= 48, `⑩ [${tag}] 最宽标签宽度合理（4 字 ×11px ≈34–48px）`, `maxLabW=${geo.maxLabW.toFixed(1)}`);
    if (vp.width === 360) await shot('04-tabbar-360-5tabs');
  }

  /* ================= 收尾 ================= */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((r) => { session.role = r; applyDispatchTabGate(); }, realRole);
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
