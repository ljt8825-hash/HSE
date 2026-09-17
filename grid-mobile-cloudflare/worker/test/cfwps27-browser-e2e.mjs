/* CF-WPS-27 浏览器 E2E：系统返回键（上一步）= 页内左上角返回箭头
 *
 * 用户诉求（原话）：「现在使用系统的上一步或者返回键时，直接退出H5页面。但是点击左上角的
 * 返回键，就会到上一页。我现在就要系统的返回/上一步和点击左上角的功能一样」
 *
 * 修法：showView 接入历史栈 —— 每次前进视图 pushState({h5view})，系统返回触发
 * popstate → 切回上一视图；页内返回箭头与系统返回共用同一条栈（相邻返回走
 * history.back()），两条入口行为永远一致。首页（无返回箭头）按返回 = 自然退出。
 *
 * 断言分两层：
 *   一、静态层：showView 包装 + popstate 接线存在；boot 瞬态视图不入栈；「view-」前缀容错
 *   二、浏览器层（决定性）：
 *     B1 落地首页后 history.state 记录 h5view=home（占用当前条目，不新增）
 *     B2 前进（开始检查 → 拍照）pushState
 *     B3 ★系统返回（history.back）→ 回首页，等同左上角箭头
 *     B4 左上角箭头返回仍正常（回归）
 *     B5 二级（分类页）系统返回 → 回拍照页（= 该页箭头的 data-back 目标）
 *     B6 连续系统返回逐级走回首页
 *     B7 底部 Tab 前进 → 系统返回回首页
 *     B8 回首页收拢：非相邻回首页（模拟检查完成后）→ 整条页内历史收拢，
 *        之后系统返回 = 直接离开 H5（不再重走已完成流程）
 *     B9 无 JS 运行时错误 / 无 4xx 资源
 *
 * 纪律：只在视图层走查，**绝不提交任何巡查记录**（不点完成/提交类按钮）。
 * 前置：cd grid-mobile-cloudflare && node tools/local-pages-server.mjs
 * Run:   node test/cfwps27-browser-e2e.mjs
 *        对生产跑：LOCAL_PAGES=https://grid-mobile-cloudflare.pages.dev node test/cfwps27-browser-e2e.mjs
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { e2eAccount } from './e2e-account.mjs';

const BASE = process.env.LOCAL_PAGES || 'http://127.0.0.1:5899';
// 账号只从环境变量 / 本机未跟踪的 _e2e-creds.local.json 解析（源码内不落真实凭据）
const { phone: PHONE, password: PASSWORD } = e2eAccount();

const PW_DIR = 'G:/hse-dashboard/安全看板vben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { createRequire } = await import('node:module');
const pwMod = createRequire(import.meta.url)(PW_DIR);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
if (!chromium) throw new Error('playwright-core chromium 未加载');

const SHOTS = path.resolve(import.meta.dirname, '_cfwps27_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

/* ---------------- 一、静态层：源码结构 ---------------- */
console.log('===== 一、静态层（源码） =====');
const SRC = (await import('node:fs')).readFileSync(path.resolve(import.meta.dirname, '../../frontend/check.html'), 'utf8');
{
  assert(/function showView\(name\)\{[\s\S]*?history\.pushState\(\{ h5view: name \}/.test(SRC),
    'S1 showView 包装：前进视图写入历史栈（pushState h5view）');
  assert(/window\.addEventListener\("popstate"[\s\S]{0,600}?h5view/.test(SRC),
    'S1 popstate 接线：系统返回 → 切回 h5view 对应视图');
  assert(/replaceState\(\{ h5view: name \}/.test(SRC),
    'S1 首个落地视图占用当前历史条目（replaceState，不新增）');
  assert(/history\.back\(\);\s*\/\/ 页内返回/.test(SRC),
    'S1 页内相邻返回与系统返回共用同一条栈（history.back）');
  assert(/history\.go\(1 - viewStack\.length\)/.test(SRC),
    'S1 非相邻回首页：整条页内历史收拢（history.go）');
  assert(!/showView\("boot"\)/.test(SRC) && (SRC.match(/renderView\("boot"\)/g) || []).length === 2,
    'S2 boot 瞬态视图不入历史栈（两处错误分支改 renderView）');
  assert(/name = String\(name \|\| ""\)\.replace\(\^?\/\^view-\//.test(SRC.replace('replace(/^view-/', 'replace(/^view-/')),
    'S3 showView 对「view-」前缀调用容错（顺带修复 dt-back/rf-back 潜在取错元素）');
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

const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const h5state = () => page.evaluate(() => (history.state && history.state.h5view) || null);
const stackLen = () => page.evaluate(() => viewStack.length); // 顶层 let 词法绑定，evaluate 新脚本能直接看到
const activeView = () => page.evaluate(() => {
  const el = document.querySelector('.view.active');
  return el ? el.id.replace(/^view-/, '') : null;
});
// 模拟系统返回键：history.back() + 等待目标视图可见（同文档 popstate，不用 page.goBack 以免等跨文档导航超时）
async function sysBack(expectView, timeout = 8000) {
  await page.evaluate(() => history.back());
  await page.waitForSelector(`#view-${expectView}.active`, { state: 'visible', timeout });
}
async function forward(view) { await page.waitForSelector(`#view-${view}.active`, { state: 'visible', timeout: 8000 }); }

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
await page.fill('#phone', PHONE);
await page.fill('#password', PASSWORD);
await page.click('#btn');
await page.waitForSelector('#view-home.active', { timeout: 30000 });

/* B1 落地首页：历史栈初始化 */
assert((await h5state()) === 'home', 'B1 首页落地：history.state.h5view = home（占用当前条目）');
assert((await stackLen()) === 1, 'B1 页内视图栈长度 = 1');
await shot('01-home');

/* B2 前进：开始检查 → 拍照页 */
await page.click('#btn-start');
await forward('photo');
assert((await h5state()) === 'photo', 'B2 前进到拍照页：pushState 记录 h5view=photo');
assert((await stackLen()) === 2, 'B2 页内视图栈长度 = 2');
await shot('02-photo');

/* B3 ★核心：系统返回 → 回首页（等同左上角箭头） */
await sysBack('home');
assert((await h5state()) === 'home', 'B3 系统返回键 → 回到首页（不再直接退出 H5）');
assert((await activeView()) === 'home', 'B3 活动视图 = home');
await shot('03-back-to-home');

/* B4 左上角箭头回归：拍照页箭头 → 首页 */
await page.click('#btn-start');
await forward('photo');
await page.click('#view-photo .icon-btn[data-back="home"]');
await forward('home');
assert((await h5state()) === 'home', 'B4 左上角箭头返回正常（相邻返回共用历史栈）');
assert((await stackLen()) === 1, 'B4 箭头返回后视图栈同步回 1');

/* B5 二级系统返回：分类页 → 拍照页（= 分类页箭头的 data-back 目标） */
// 拍照页必须先出片「下一步」才可见：经相册 input 设一张 1×1 JPEG（与 cfwps23/26 同款夹具）
const IMG = path.join(SHOTS, '_tiny.jpg');
(await import('node:fs')).writeFileSync(IMG, Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'));
await page.click('#btn-start');
await forward('photo');
await page.setInputFiles('#file-album', IMG);
await page.waitForSelector('#btn-photo-next:not(.hidden)', { state: 'visible', timeout: 15000 });
await page.click('#btn-photo-next');
await forward('classify');
assert((await h5state()) === 'classify', 'B5 前进到分类页');
await sysBack('photo');
assert((await h5state()) === 'photo', 'B5 分类页按系统返回 → 回拍照页（等同箭头 data-back=photo）');
await shot('04-back-to-photo');

/* B6 连续系统返回逐级走回首页 */
await sysBack('home');
assert((await h5state()) === 'home', 'B6 连续返回：拍照页 → 首页');
assert((await stackLen()) === 1, 'B6 视图栈收敛为 1');

/* B7 底部 Tab 前进 → 系统返回回首页 */
await page.click('#tabbar .tab-item[data-tab="my-checks"]');
await forward('my-checks');
assert((await h5state()) === 'my-checks', 'B7 Tab 前进到「我的巡查」');
await sysBack('home');
assert((await h5state()) === 'home', 'B7 系统返回 → 回首页（Tab 视图同样入栈）');

/* B8 ★收拢：非相邻回首页 → 整条页内历史收拢；再按返回 = 离开 H5 */
await page.evaluate(() => showView('photo'));     // 造一个非相邻路径：home → photo → my-checks
await forward('photo');
await page.evaluate(() => showView('my-checks'));
await forward('my-checks');
assert((await stackLen()) === 3, 'B8 造路径完成：栈长 = 3（home/photo/my-checks）');
await page.evaluate(() => showView('home'));      // 非相邻回首页 → history.go 收拢
await forward('home');
assert((await h5state()) === 'home', 'B8 收拢后落在首页');
assert((await stackLen()) === 1, 'B8 收拢后视图栈长度 = 1（已完成流程不再留在栈里）');
await shot('05-collapsed-home');
// 收拢后系统返回：应直接离开 H5（本页没有更早的页内条目了）
await page.evaluate(() => history.back());
await page.waitForURL('about:blank', { timeout: 8000 }).catch(() => {});
assert(page.url() === 'about:blank', 'B8 收拢后按系统返回 = 直接退出 H5（无残留页内条目）', page.url());

/* B9 干净收尾 */
assert(errors.length === 0, 'B9 无 JS 运行时错误 / 无 4xx 资源', errors.slice(0, 3).join(' | '));

console.log(`\n===== 汇总：${pass} PASS / ${fail} FAIL =====`);
console.log(`截图目录：${SHOTS}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
