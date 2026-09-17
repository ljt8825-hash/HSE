/* CF-WPS-26 浏览器 E2E：「从相册上传」必须始终可达、且真实调起选图器
 *
 * 用户诉求（原话）：「点击"从相册上传"，默认显示照片/相册中图片。」
 *
 * 平台事实（先说清边界）：
 *   选图器落在哪个视图由宿主 App（微信 XWeb / 各浏览器）决定，网页侧唯一可控的是
 *   <input type="file" accept="image/*">（无 capture）——这正是上线配置，已是 Web 标准最优：
 *   · 安卓微信：accept="image/*" → 面板通常只有「从手机相册选择」→ 直达相册
 *   · iOS 微信 / iOS Safari：固定弹「照片图库 / 拍照」面板（系统行为，网页改不了）
 *   · 安卓 Chrome：弹「相机 / 文件」选择器（系统行为）
 *   唯一能强制直达相册的手段 = 微信 JS-SDK wx.chooseImage({sourceType:['album']})，
 *   但它要求已认证公众号 + JS 安全域名 —— pages.dev 无法配置，接入不了（如实说明，不是不做）。
 *
 * 本次修复的两个真实缺口（代码侧能做的全部）：
 *   R1 现场照片出片后，「拍现场照片 / 从相册上传」按钮被整体收起，且点照片区**只会再开相机**
 *      ⇒ 想换用相册照片时「从相册上传」彻底不可达。
 *      修法：点照片区重新展开按钮组（拍照/相册二选一，用户自定来源）。
 *   R2 四个 file input 用 display:none 隐藏 —— 老版 X5/部分安卓 WebView 会**拒绝调起**
 *      display:none 的 file input（点了没反应）。修法：换 .file-ghost（1px 视觉隐藏、保持渲染）。
 *
 * 断言分两层：
 *   一、静态层：相册 input 属性最优（accept=image/*、无 capture）/ file-ghost 就位 /
 *       照片区点击处理改为重展按钮组 / 整改照片步两按钮本就常驻
 *   二、浏览器层（决定性）：
 *     B1 进入拍照步按钮组可见
 *     B2 点「从相册上传」→ **真实触发 filechooser**，并经它 setFiles 设图成功（相册通道端到端）
 *     B3 出片后按钮组收起、预览出现、下一步可用
 *     B4 点照片区 → 按钮组重新展开（R1 的核心断言）
 *     B5 重拍（相机按钮）仍可用，且出片后按钮组再次收起
 *     B6 无 JS 运行时错误 / 无 4xx 资源
 *
 * 纪律：走到 view-photo 即止，**绝不点「下一步」** ⇒ 不产生任何巡查记录。
 * 前置：cd grid-mobile-cloudflare && node tools/local-pages-server.mjs
 * Run:   node test/cfwps26-browser-e2e.mjs
 *        对生产跑：LOCAL_PAGES=https://grid-mobile-cloudflare.pages.dev node test/cfwps26-browser-e2e.mjs
 */
import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

const SHOTS = path.resolve(import.meta.dirname, '_cfwps26_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

// 1×1 JPEG（够 compressImage 解码即可）—— 与 cfwps23/25 同款夹具
const IMG = path.join(SHOTS, '_tiny.jpg');
writeFileSync(IMG, Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'));

/* ---------------- 一、静态层：源码结构（本地源文件，不依赖服务） ---------------- */
console.log('===== 一、静态层（源码） =====');
const SRC = readFileSync(path.resolve(import.meta.dirname, '../../frontend/check.html'), 'utf8');
{
  const inputs = [...SRC.matchAll(/<input type="file"([^>]*)>/g)].map(m => m[1]);
  assert(inputs.length === 4, '① 页面共 4 个 file input', `找到 ${inputs.length}`);
  const byId = {};
  for (const attrs of inputs) {
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    byId[id] = attrs;
  }
  for (const id of ['file-album', 'file-album-2']) {
    const a = byId[id] || '';
    assert(/accept="image\/\*/.test(a), `① ${id} 带 accept="image/*"（选图器只出图片）`);
    assert(!/capture/.test(a), `① ${id} 无 capture（有 capture 会直接开相机，进不了相册）`);
  }
  for (const id of ['file-camera', 'file-camera-2']) {
    assert(/capture="environment"/.test(byId[id] || ''), `① ${id} 保留 capture="environment"（拍现场照片直达相机）`);
  }
}
{
  const ghosts = (SRC.match(/class="file-ghost" id="file-/g) || []).length;
  assert(ghosts === 4, '② 4 个 file input 全部改用 .file-ghost（视觉隐藏、保持渲染）', `${ghosts} 个`);
  assert(!/class="hidden"\s+id="file-/.test(SRC), '② file input 不再使用 display:none 的 .hidden（老 X5 拒绝调起）');
  assert(/\.file-ghost\{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none\}/.test(SRC),
    '② .file-ghost CSS 规则存在（1px + opacity:0 + pointer-events:none）');
}
{
  const handler = SRC.match(/\$\("#scene-photo-box"\)\.onclick[\s\S]{0,300}?\};/);
  assert(!!handler, '③ 照片区点击处理存在');
  const body = handler ? handler[0] : '';
  assert(/photo-actions"\)\.classList\.remove\("hidden"\)/.test(body),
    '③ 点照片区重新展开「拍现场照片 / 从相册上传」按钮组（相册通道始终可达）');
  assert(!/file-camera"\)\.click\(\)/.test(body),
    '③ 点照片区不再强制开相机（此前想换用相册照片无入口）');
}
{
  assert(/<button class="btn-ghost" id="btn-rf-album">/.test(SRC) &&
         !/btn-rf-album[^>]*class="[^"]*hidden/.test(SRC), '④ 整改照片步「从相册上传」按钮常驻（无同类缺口）');
  const setAfter = SRC.match(/function setAfterPhoto\(\w*\)\{([\s\S]*?)\n\}/);
  assert(!!setAfter && !/btn-rf-album|btn-rf-capture/.test(setAfter[1]),
    '④ setAfterPhoto 不隐藏整改步按钮组');
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
const actionsVisible = () => page.evaluate(() => {
  const el = document.querySelector('#photo-actions');
  return !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
});
const previewSrc = () => page.evaluate(() => {
  const img = document.querySelector('#scene-photo-box img');
  return img ? (img.src || '').slice(0, 30) : null;
});

// 通过点击按钮 → 捕获 filechooser → 经 chooser 设图（真实用户路径：按钮 → 系统选图器 → 设图）
async function pickViaButton(btn) {
  const chooser = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    page.click(btn),
  ]).then(([c]) => c);
  await chooser.setFiles(IMG);
  await page.waitForFunction(() => document.querySelector('#scene-photo-box img'), { timeout: 15000 });
}

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
await page.fill('#phone', PHONE);
await page.fill('#password', PASSWORD);
await page.click('#btn');
await page.waitForSelector('#view-home.active', { timeout: 30000 });

await page.click('#btn-start');
await page.waitForSelector('#view-photo.active', { timeout: 15000 });

/* B1 初始：按钮组可见 */
{
  assert(await actionsVisible(), 'B1 进入拍照步：「拍现场照片 / 从相册上传」按钮组可见');
  await shot('01-photo-step-initial');
}

/* B2 ★核心：点「从相册上传」→ 真实调起系统选图器 → 经它设图成功 */
{
  let fired = false;
  const chooserP = page.waitForEvent('filechooser', { timeout: 8000 }).then((c) => { fired = true; return c; });
  await page.click('#btn-album');
  const chooser = await chooserP;
  assert(fired, 'B2 点「从相册上传」→ 触发系统 filechooser（选图器被调起）');
  await chooser.setFiles(IMG);
  await page.waitForFunction(() => document.querySelector('#scene-photo-box img'), { timeout: 15000 });
  assert(!!(await previewSrc()), 'B2 经选图器设图成功：预览出现照片（相册通道端到端可用）');
  await shot('02-photo-from-album');
}

/* B3 出片后：按钮组收起、下一步可用 */
{
  assert(!(await actionsVisible()), 'B3 出片后按钮组收起（省出空间给「下一步」）');
  const nextVisible = await page.evaluate(() => {
    const el = document.querySelector('#btn-photo-next');
    return !!el && !el.classList.contains('hidden');
  });
  assert(nextVisible, 'B3 「下一步」按钮出现');
}

/* B4 ★核心：点照片区 → 按钮组重新展开（R1） */
{
  await page.click('#scene-photo-box');
  assert(await actionsVisible(), 'B4 点照片区 → 「拍现场照片 / 从相册上传」重新展开（想换相册照片有入口了）');
  await shot('03-actions-reexpanded');
}

/* B5 重拍（相机按钮）仍可用；出片后按钮组再次收起 */
{
  await pickViaButton('#btn-capture');
  assert(!(await actionsVisible()), 'B5 经「拍现场照片」重设后按钮组再次收起（交互闭环一致）');
  assert(!!(await previewSrc()), 'B5 相机按钮重拍可用');
}

/* B6 干净收尾 */
assert(errors.length === 0, 'B6 无 JS 运行时错误 / 无 4xx 资源', errors.slice(0, 3).join(' | '));

console.log(`\n===== 汇总：${pass} PASS / ${fail} FAIL =====`);
console.log(`截图目录：${SHOTS}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
