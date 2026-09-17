/* CF-WPS-23 浏览器 E2E（本地「Pages 等价」服务 + 真实生产 Worker 后端，只读/零写入）
 *
 * 覆盖用户本轮 5 项前端诉求：
 *   ① 登录页「记住我」→ 关掉页面重进免登录（本地会话持久化 + 过期静默重登）
 *   ② 登录后直达 /check，不再经过 /home
 *   ③ 首页「开始检查」下方 cta-sub 文案已移除
 *   ④ 拍完照片：收起「拍现场照片 / 从相册上传」，露出「下一步」；点击照片预览可重拍
 *   ⑤ 「下一步」后分类页不再显示照片预览，仅「不是三违 / 是三违」两个按钮
 * 纪律：**不提交任何巡查记录**（走到分类页即止），不写任何生产数据。
 *
 * 前置：另开终端启动本地服务
 *   cd grid-mobile-cloudflare
 *   HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 node tools/local-pages-server.mjs
 * Run: node test/cfwps23-browser-e2e.mjs
 */
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { e2eAccount } from './e2e-account.mjs';

const BASE = process.env.LOCAL_PAGES || 'http://127.0.0.1:5899';
// 账号只从环境变量 / 本机未跟踪的 _e2e-creds.local.json 解析（源码内不落真实凭据）
const { phone: PHONE, password: PASSWORD } = e2eAccount();

const PW_DIR = 'G:/hse-dashboard/安全看板vben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { createRequire } = await import('node:module');
const pwMod = createRequire(import.meta.url)(PW_DIR);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
if (!chromium) throw new Error('playwright-core chromium 未加载: ' + Object.keys(pwMod).join(','));

const SHOTS = path.resolve(import.meta.dirname, '_cfwps23_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

// 1×1 JPEG（够 compressImage 解码即可）
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64');
const IMG = path.join(SHOTS, '_tiny.jpg');
writeFileSync(IMG, TINY_JPEG);

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-proxy-server', '--disable-dev-shm-usage', '--no-first-run'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const consoleErrors = [];
const benign = (s) => /favicon\.ico/.test(s)
  // detail.html?id=0 是刻意的「不存在的记录」探针，Worker 返回 NOT_FOUND 404 才是正确行为
  || /\/api\/mobile\/patrol\/records\?id=0$/.test(s);
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
// 「Failed to load resource」类控制台文案不带 URL，统一交给 response 监听记录真实 URL
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource/i.test(t)) return;
  consoleErrors.push('console: ' + t);
});
page.on('response', (r) => { if (r.status() >= 400 && !benign(r.url())) consoleErrors.push(`http ${r.status()}: ${r.url()}`); });

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
const at = () => page.url().replace(BASE, '');
const visible = (sel) => page.locator(sel).isVisible().catch(() => false);
const count = (sel) => page.locator(sel).count();

try {
  /* ---------- ① 登录：勾选「记住我」 ---------- */
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
  assert(await page.locator('#remember').isChecked(), '登录页默认勾选「记住我」');
  await page.fill('#phone', PHONE);
  await page.fill('#password', PASSWORD);
  await shot('01-login');
  await page.click('#btn');
  await page.waitForURL((u) => u.pathname.startsWith('/check'), { timeout: 40000 });
  await page.waitForSelector('#view-home.active', { timeout: 20000 });
  assert(at().startsWith('/check'), '② 登录成功直达 /check（不再经过 /home）', at());

  /* ---------- ③ 首页 cta-sub 文案已移除 ---------- */
  assert(await count('#cta-sub') === 0, '③ 首页 #cta-sub 元素已移除');
  const homeText = await page.locator('#view-home').innerText();
  assert(!homeText.includes('定位在后台持续进行'), '③ 首页不再出现「定位在后台持续进行…」文案');
  const credsStored = await page.evaluate(() => !!localStorage.getItem('hse_login_creds_v1'));
  const tokenStored = await page.evaluate(() => !!localStorage.getItem('h5_session_token'));
  assert(credsStored && tokenStored, '① 会话与「记住我」凭据均已持久化到 localStorage');
  await shot('02-home');

  /* ---------- ① 关掉页面重进 → 免登录 ---------- */
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((u) => u.pathname.startsWith('/check'), { timeout: 30000 });
  await page.waitForSelector('#view-home.active', { timeout: 20000 });
  assert(at().startsWith('/check'), '① 重进 /login 自动免登录直达 /check', at());

  // 再验证「新开标签页」也要免登录（同一浏览器 profile）
  const page2 = await ctx.newPage();
  await page2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page2.waitForURL((u) => u.pathname.startsWith('/check'), { timeout: 30000 });
  await page2.waitForSelector('#view-home.active', { timeout: 20000 });
  assert(page2.url().includes('/check'), '① 新开页面（模拟重开浏览器）免登录直达', page2.url().replace(BASE, ''));
  await page2.close();
  await page.bringToFront();

  /* ---------- ④ 拍照步骤 ---------- */
  await page.click('#btn-start');
  await page.waitForSelector('#view-photo.active', { timeout: 15000 });
  assert(await visible('#photo-actions') && await visible('#btn-capture') && await visible('#btn-album'),
    '④ 未拍摄时显示「拍现场照片 + 从相册上传」');
  assert(!(await visible('#btn-photo-next')), '④ 未拍摄时「下一步」隐藏');
  await shot('03-photo-empty');

  // 未拍摄时点照片区域不应触发文件选择
  let fcUnexpected = null;
  const fcEarly = page.waitForEvent('filechooser', { timeout: 1500 }).catch(() => null);
  await page.click('#scene-photo-box');
  fcUnexpected = await fcEarly;
  assert(!fcUnexpected, '④ 未拍摄时点击照片区不触发相机（避免误触）');
  if (fcUnexpected) { try { await fcUnexpected.setFiles([]); } catch { /* ignore */ } }

  // 拍照（注入文件 → onchange → compressImage → setScenePhoto）
  await page.setInputFiles('#file-camera', IMG);
  await page.waitForSelector('#btn-photo-next:not(.hidden)', { timeout: 15000 });
  assert(!(await visible('#photo-actions')), '④ 拍完后收起「拍现场照片 / 从相册上传」');
  assert(!(await visible('#btn-capture')) && !(await visible('#btn-album')), '④ 两个拍照入口均不可见');
  assert(await visible('#btn-photo-next'), '④ 拍完后直接显示「下一步」');
  const hasImg = await page.locator('#scene-photo-box img').count();
  assert(hasImg === 1, '④ 照片预览已显示');
  assert((await page.locator('#photo-tip').innerText()).includes('点击上方照片可重拍'), '④ 预览下方提示改为「点击可重拍/改从相册上传」');
  await shot('04-photo-done');

  // 点击照片预览 → 重新展开「拍现场照片 / 从相册上传」按钮组（CF-WPS-26 起的新契约：
  // 不再强制开相机 —— 相册通道必须始终可达，用户自定来源）
  await page.click('#scene-photo-box');
  const actionsBack = await page.evaluate(() => {
    const el = document.querySelector('#photo-actions');
    return !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  });
  assert(actionsBack, '④ 点击照片预览可重新展开拍照/相册按钮组（CF-WPS-26 新契约）');

  /* ---------- ⑤ 下一步 → 分类页无照片预览 ---------- */
  await page.click('#btn-photo-next');
  await page.waitForSelector('#view-classify.active', { timeout: 15000 });
  assert(await count('#classify-photo') === 0, '⑤ 分类页已移除 #classify-photo 照片预览');
  assert(await page.locator('#view-classify .photo-box').count() === 0, '⑤ 分类页无任何 photo-box');
  assert(await visible('#opt-no') && await visible('#opt-yes'), '⑤ 仅保留「不是三违 / 是三违」两个按钮');
  assert((await page.locator('#view-classify .opt-card').count()) === 2, '⑤ 分类页按钮数量为 2');
  await shot('05-classify');

  /* ---------- 回归：返回首页再进检查，拍照入口应复位 ---------- */
  await page.click('#view-classify .icon-btn[data-back="photo"]');
  await page.waitForSelector('#view-photo.active', { timeout: 10000 });
  await page.click('#view-photo .icon-btn[data-back="home"]');
  await page.waitForSelector('#view-home.active', { timeout: 10000 });
  await page.click('#btn-start');
  await page.waitForSelector('#view-photo.active', { timeout: 10000 });
  assert(await visible('#photo-actions'), '回归：重新开始检查时拍照入口已复位');
  assert(!(await visible('#btn-photo-next')), '回归：重新开始检查时「下一步」恢复隐藏');

  /* ---------- ⑥ 共享 app.js 的会话改造对「旧页」无回归 ----------
     patrol/records/detail.html 仍公网可达（虽已无入口引用），且都依赖 app.js 的
     sessionExpiredLocally()/clearSession()/mobileApi()，必须确认没被本次改造踢坏。 */
  const token = await page.evaluate(() => localStorage.getItem('h5_session_token'));
  const LEGACY = [
    {
      p: '/records.html', name: '旧-巡查记录页',
      probe: async () => (await page.locator('#list').innerText()).trim(),
      ok: (v) => !!v,
    },
    {
      p: '/patrol.html', name: '旧-巡查表单页',
      // meta 要全量扫台账，可能 >2.5s；成功时页面会把初始横幅 banner.remove() 掉，以此为准
      waitFor: async () => page.waitForFunction(() => !document.querySelector('#load-banner'), { timeout: 40000 }).catch(() => {}),
      probe: async () => `巡查人=${await page.inputValue('#inspector').catch(() => '')}`,
      ok: (v) => v !== '巡查人=',
    },
    {
      p: '/detail.html?id=0', name: '旧-记录详情页',
      probe: async () => await page.title(),
      ok: (v) => v === '巡查详情',
    },
  ];
  for (const l of LEGACY) {
    await page.goto(BASE + l.p, { waitUntil: 'domcontentloaded' });
    if (l.waitFor) await l.waitFor();
    await page.waitForTimeout(1500);
    assert(!page.url().includes('/login'), `⑥ ${l.name} 未被本次会话改造踢回登录页`, at());
    const v = await l.probe();
    assert(l.ok(v), `⑥ ${l.name} 正常渲染`, String(v).slice(0, 60));
  }

  // 兼容旧版未迁移用户：只有 sessionStorage 会话（无 localStorage）也应可用
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await p2.evaluate((tk) => {
    sessionStorage.setItem('h5_session_token', tk);
    sessionStorage.setItem('h5_session_exp', String(Date.now() + 3600000));
    localStorage.clear();
  }, token);
  await p2.goto(BASE + '/records.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  assert(!p2.url().includes('/login'), '⑥ 仅持旧 sessionStorage 会话的用户仍可访问（向下兼容）', p2.url().replace(BASE, ''));
  assert(await p2.evaluate(() => !!localStorage.getItem('h5_session_token')), '⑥ 旧会话已被自动迁移到 localStorage');
  await ctx2.close();
  await page.bringToFront();

  /* ---------- 退出登录 → 凭据清空，回登录页且不再自动登录 ---------- */
  // 上一步把浏览器停在旧页，先回到 check.html 主应用
  await page.goto(BASE + '/check', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-home.active', { timeout: 20000 });
  await page.click('#tabbar .tab-item[data-tab="me"]');
  await page.waitForSelector('#view-me.active', { timeout: 10000 });
  await page.click('#btn-logout');
  await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForSelector('#phone', { state: 'visible', timeout: 15000 });
  const cleared = await page.evaluate(() => ({
    creds: localStorage.getItem('hse_login_creds_v1'),
    token: localStorage.getItem('h5_session_token'),
  }));
  assert(!cleared.creds && !cleared.token, '① 退出登录后凭据与会话均已清空');
  await page.waitForTimeout(1500);
  assert(at().startsWith('/login'), '① 退出后停留登录页（不会立刻自动登录回去）', at());
  await shot('06-logged-out');

  assert(consoleErrors.length === 0, '无 JS 运行时错误', consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  bad('E2E 异常中断', String(e && e.message || e));
  try { await shot('99-crash'); } catch { /* ignore */ }
} finally {
  await browser.close();
}

console.log(`\n==== CF-WPS-23 浏览器 E2E：${pass} PASS / ${fail} FAIL ====`);
console.log(`截图目录：${SHOTS}`);
process.exit(fail ? 1 : 0);
