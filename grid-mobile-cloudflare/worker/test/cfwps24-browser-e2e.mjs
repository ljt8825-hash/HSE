/* CF-WPS-24 浏览器 E2E：/home 页彻底移除 + 入口分流 + 历史栈治理
 *
 * 用户诉求（原话）：登录后 /home 这一页去掉、直接到 /check；「已经是实现，但是从
 * 这个页面返回的时候，还是会到 /home。我怎么感觉这个页面是增加的？」
 *
 * 本脚本针对「返回键/返回箭头又回到 /home」这条真实链路，断言：
 *   ① /home、/home.html 均为 302 → /check（HTTP 重定向不产生历史记录）
 *   ② 全站源码再无 home.html 引用（尤其 patrol/records 的返回箭头）
 *   ③ 点旧页返回箭头时，**全程不产生任何 /home 请求**（这是旧代码必失败的断言）
 *   ④ 入口 / ：无会话→/login，有会话→/check；且不含 <meta refresh>（它会额外造历史记录）
 *   ⑤ 从 /check 按浏览器返回键，落点不是 /home
 *   ⑥ 退出登录用 replace，返回键不会退回已登出的页面
 *   ⑦ 旧页（patrol/records/detail）会话改造后仍可访问、正常渲染（回归）
 *
 * 纪律：**不提交任何巡查记录**，不写生产数据（只读 + 本地静态）。
 * 前置：cd grid-mobile-cloudflare && HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 node tools/local-pages-server.mjs
 * Run: node test/cfwps24-browser-e2e.mjs
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const BASE = process.env.LOCAL_PAGES || 'http://127.0.0.1:5899';
const PHONE = process.env.E2E_PHONE || '13905440679';
const PASSWORD = process.env.E2E_PASSWORD || 'zwh0679';

const PW_DIR = 'G:/hse-dashboard/安全看板vben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { createRequire } = await import('node:module');
const pwMod = createRequire(import.meta.url)(PW_DIR);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
if (!chromium) throw new Error('playwright-core chromium 未加载');

const SHOTS = path.resolve(import.meta.dirname, '_cfwps24_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

/* ---------------- 一、HTTP 层：重定向与静态可达性（不启浏览器） ---------------- */
console.log('===== 一、HTTP 层 =====');
async function head(p) {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  return { status: r.status, loc: r.headers.get('location') || '' };
}
for (const p of ['/home', '/home.html']) {
  const h = await head(p);
  assert(h.status === 302 && h.loc === '/check', `① ${p} → 302 /check`, `${h.status} ${h.loc}`);
}
{
  // 说明（实测 vs 文档不一致，只记录不判定）：官方文档称 _redirects「不会被当作静态资源提供」，
  // 但 2026-09-17 实测生产 `GET /_redirects` → 200（返回规则文本本身）。本地服务保持与**生产一致**。
  const h = await head('/_redirects');
  console.log(`INFO  ① GET /_redirects → ${h.status}（生产实测同为 200，与官方文档表述不一致，仅记录）`);
}
{
  const sources = ['check.html', 'login.html', 'index.html', 'patrol.html', 'records.html', 'detail.html', 'app.js'];
  const dirty = [];
  for (const f of sources) {
    const t = await (await fetch(BASE + '/' + f)).text();
    if (/home\.html/.test(t)) dirty.push(f);
  }
  assert(dirty.length === 0, '② 全站源码再无 home.html 引用', dirty.length ? dirty.join(',') : `${sources.length} 个文件干净`);
}
{
  const t = await (await fetch(BASE + '/index.html')).text();
  // 先剥掉 HTML 注释：本页注释里**故意**写了「不要用 meta refresh」这句反面说明，
  // 直接正则会把注释当成真的 meta 标签（第一版就是这么误报的）。
  const bare = t.replace(/<!--[\s\S]*?-->/g, '');
  assert(!/http-equiv=["']?refresh/i.test(bare), '④ 入口页不再用 meta refresh（它会额外造一条历史记录）');
}

/* ---------------- 二、浏览器层 ---------------- */
console.log('\n===== 二、浏览器层 =====');
const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-proxy-server', '--disable-dev-shm-usage', '--no-first-run'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN',
});
const page = await ctx.newPage();

const errors = [];
const benign = (s) => /favicon\.ico/.test(s);
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !benign(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
// 关键探针：记录任何对 /home 的请求（旧代码点返回箭头会打 /home.html，新代码应为 0 次）
const homeHits = [];
page.on('request', (r) => { if (/\/home(\.html)?(\?|$)/.test(r.url())) homeHits.push(r.url()); });

const at = () => page.url().replace(BASE, '') || '/';
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const visible = (sel) => page.locator(sel).isVisible().catch(() => false);

async function login() {
  await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
  await page.fill('#phone', PHONE);
  await page.fill('#password', PASSWORD);
  await page.click('#btn');
  await page.waitForSelector('#view-home.active', { timeout: 30000 });
}

// ④-a 无会话访问 / → 登录页
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
assert(at().startsWith('/login'), '④ 无会话访问 / → 登录页', at());
await shot('01-entry-login');

// ③/⑤ 登录 → 直达 /check 首页
await login();
assert(at().startsWith('/check'), '② 登录后直达 /check，不再经过 /home', at());
assert(await visible('#view-home.active'), '② 首页即 view-home（截图那一屏）');
await shot('02-check-home');

// ⑤ 从 /check 按浏览器返回键：落点不得是 /home
{
  const before = homeHits.length;
  await page.goBack({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  assert(!/\/home(\.html)?(\?|$)/.test(at()), '⑤ 从 /check 按返回键，落点不是 /home', at() || '(about:blank)');
  assert(homeHits.length === before, '⑤ 该过程中没有请求 /home', `新增 ${homeHits.length - before} 次`);
}

// ④-b 已登录后访问 / → 直达 /check（入口自动分流）
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#view-home.active', { timeout: 30000 });
assert(at().startsWith('/check'), '④ 已登录访问 / → 直达 /check', at());

// 旧书签路径：/home 直连 → 302 → 首页
await page.goto(BASE + '/home', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#view-home.active', { timeout: 30000 });
assert(at().startsWith('/check'), '① 旧书签 /home 打开后落在 /check', at());
await shot('03-home-bookmark');

/* ---- ③ 决定性用例：点旧页返回箭头，全程不得请求 /home ---- */
for (const [p, name, readySel] of [
  ['/patrol', '开始巡查页', '#form-body:not(.hidden)'],
  ['/records', '我的巡查记录页', '#list'],
]) {
  const before = homeHits.length;
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
  // patrol 要全量扫台账（>2.5s 很常见）：等页面自己的就绪信号，别猜毫秒
  await page.waitForSelector(readySel, { timeout: 45000 }).catch(() => {});
  assert(!at().includes('/login'), `⑦ ${name} 未被踢回登录页（app.js 会话改造回归）`, at());
  const href = await page.getAttribute('a.back', 'href').catch(() => null);
  assert(href === './check.html', `② ${name} 返回箭头指向 ./check.html`, String(href));
  await page.click('a.back');
  await page.waitForURL(/\/check/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  assert(at().startsWith('/check'), `③ ${name} 点返回 → 直接回首页 /check`, at());
  assert(homeHits.length === before, `③ ${name} 点返回过程中 0 次 /home 请求`, `新增 ${homeHits.length - before} 次`);
}

// ⑥ 退出登录用 replace：返回键不得退回已登出的页面
{
  await page.goto(BASE + '/check', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-home.active', { timeout: 30000 });
  await page.click('#tabbar .tab-item[data-tab="me"]');
  await page.waitForSelector('#view-me.active', { timeout: 10000 });
  await page.click('#btn-logout');
  await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
  assert(at().startsWith('/login'), '⑥ 退出登录 → 登录页', at());
  await shot('04-after-logout');
  await page.goBack({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  assert(!at().startsWith('/check'), '⑥ 退出后按返回键，不会退回 /check（replace 生效）', at() || '(about:blank)');
}

// 健康
assert(errors.length === 0, '无 JS 运行时错误 / 无 4xx 资源', errors.slice(0, 3).join(' | '));

await ctx.close();
await browser.close();

console.log(`\n===== 汇总：${pass} PASS / ${fail} FAIL =====`);
console.log(`截图目录：${SHOTS}`);
process.exit(fail ? 1 : 0);
