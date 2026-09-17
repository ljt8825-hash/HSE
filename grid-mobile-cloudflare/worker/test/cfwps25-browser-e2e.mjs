/* CF-WPS-25 浏览器 E2E：「普通巡查」结果二选一必须看得出点了哪一个
 *
 * 用户诉求（原话）：「在点击"一般问题"或"现场正常"时，没有标记到底是点的哪个」
 *
 * 真根因（check.html 旧代码，改动前 1371 行）：
 *     $$("[data-patrol]").forEach(el => el.onclick = () => {
 *       draft.patrolResult = el.dataset.patrol;
 *       $("#btn-patrol-done").disabled = false;
 *     });
 *   —— 只写了「草稿值」与按钮可用性，**卡片本身没有任何视觉变化**：
 *      没换边框、没换底色、没有勾选标记，也没有互斥单选。用户点完无法确认点的是哪个，
 *      更无法在点错后换成另一个（两个都点过也不知最终生效的是谁）。
 *
 * 修法：新增唯一渲染函数 renderPatrolChoice()，把「草稿值」与「可见选中态」绑成一件事；
 *      卡片加 .selectable + .opt-mark（勾选标记），CSS 用 box-shadow 画外圈（不加粗 border，避免尺寸跳动）。
 *
 * 断言分两层：
 *   一、静态层（源码）：单选卡结构 / 唯一渲染函数 / 三处调用点 / 旧的「无视觉反馈」写法已消失 / CSS 规则齐备
 *   二、浏览器层（决定性）：
 *     B1 进入即「都未选中 + 完成检查禁用」
 *     B2 点「一般问题」→ 它选中、另一个未选中、按钮可用（含 aria-checked）
 *     B3 **可见性硬证据**：选中卡与未选中卡的 computedStyle（边框色/底色/勾选标记透明度）必须不同
 *        —— 这条是「用户看得出来」的机器判据，只看 class 会漏掉「加了 class 但没写 CSS」的假绿
 *     B4 改点「现场正常」→ 状态互换（直接对应「到底点的哪个」）
 *     B5 任意时刻选中卡数量恒为 1（互斥）
 *     B6 回到分类页重进 → 高亮清空、按钮回到禁用
 *     B7 首页重新发起检查（startCheck）后重进 → 无上一次残留
 *     B8 截图 4 张供肉眼比对
 *
 * 纪律：**不提交任何巡查记录**（走到 view-patrol 即止，绝不点「完成检查」）；只读 + 本地静态。
 * 前置：cd grid-mobile-cloudflare && HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 \
 *         node tools/local-pages-server.mjs
 * Run:   node test/cfwps25-browser-e2e.mjs
 *        对生产跑：LOCAL_PAGES=https://grid-mobile-cloudflare.pages.dev node test/cfwps25-browser-e2e.mjs
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

const SHOTS = path.resolve(import.meta.dirname, '_cfwps25_shots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS  ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL  ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

// 1×1 JPEG（够 compressImage 解码即可）—— 与 cfwps23 同款夹具
const IMG = path.join(SHOTS, '_tiny.jpg');
writeFileSync(IMG, Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'));

/* ---------------- 一、静态层：源码结构（本地源文件，不依赖服务） ---------------- */
console.log('===== 一、静态层（源码） =====');
const SRC = readFileSync(path.resolve(import.meta.dirname, '../../frontend/check.html'), 'utf8');
{
  const cards = [...SRC.matchAll(/<div class="([^"]*)" data-patrol="([^"]+)"([^>]*)>/g)];
  assert(cards.length === 2, '① 巡查结果卡共 2 张', `找到 ${cards.length}`);
  const allSelectable = cards.every(m => /\bselectable\b/.test(m[1]) && /role="radio"/.test(m[3]) && /aria-checked="false"/.test(m[3]));
  assert(allSelectable, '① 两张卡均为单选卡（selectable + role=radio + aria-checked）',
    cards.map(m => m[2] + ':' + m[1]).join(' / '));
  const marks = (SRC.match(/class="opt-mark"/g) || []).length;
  assert(marks === 2, '① 两张卡各带一个勾选标记 .opt-mark', `${marks} 个`);
  assert(/class="opt-group"[^>]*role="radiogroup"/.test(SRC), '① 两卡包在 role=radiogroup 容器内');
}
{
  const fn = SRC.match(/function renderPatrolChoice\(\)\{([\s\S]*?)\n\}/);
  assert(!!fn, '② 存在唯一渲染函数 renderPatrolChoice()');
  const body = fn ? fn[1] : '';
  assert(/classList\.toggle\("selected"/.test(body), '② 渲染函数负责切换 .selected（可见高亮）');
  assert(/aria-checked/.test(body), '② 渲染函数负责同步 aria-checked（无障碍）');
  assert(/\$\("#btn-patrol-done"\)\.disabled\s*=/.test(body), '② 渲染函数负责按钮可用性（三件事同一处）');
}
{
  const calls = (SRC.match(/renderPatrolChoice\(\)/g) || []).length;
  assert(calls >= 4, '③ renderPatrolChoice 被复用（定义 1 + 调用 ≥3：点选 / opt-no 入口 / startCheck 复位）', `${calls} 次`);
  const startCheck = SRC.match(/function startCheck\(\)\{([\s\S]*?)\n\}/);
  assert(!!startCheck && /renderPatrolChoice\(\)/.test(startCheck[1]), '③ 新一次检查（startCheck）会复位选中态');
  assert(/\$\("#opt-no"\)\.onclick[\s\S]{0,200}?renderPatrolChoice\(\)/.test(SRC), '③ 再次进入普通巡查会复位选中态');
}
{
  // 旧写法（只有草稿 + disabled，没有任何视觉反馈）必须彻底消失
  const legacy = /\$\("#btn-patrol-done"\)\.disabled = false;/.test(SRC);
  assert(!legacy, '④ 旧的「只改 disabled、无视觉反馈」写法已移除');
  assert(/\.opt-card\.selectable\.selected\{[^}]*border-color:var\(--primary\)/.test(SRC), '④ 选中态 CSS 存在（主色边框）');
  assert(/\.opt-card\.selectable\{[^}]*box-shadow/.test(SRC) || /\.opt-card\.selectable\.selected\{[^}]*box-shadow/.test(SRC),
    '④ 选中外圈用 box-shadow 而非加粗 border（避免选中瞬间卡片尺寸跳动）');
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

const at = () => page.url().replace(BASE, '') || '/';
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });

async function login() {
  await page.waitForSelector('#phone', { state: 'visible', timeout: 20000 });
  await page.fill('#phone', PHONE);
  await page.fill('#password', PASSWORD);
  await page.click('#btn');
  await page.waitForSelector('#view-home.active', { timeout: 30000 });
}

// 走一遍「开始检查 → 拍照 → 不是三违」到普通巡查页（**不点完成检查**）
async function gotoPatrol() {
  await page.click('#btn-start');
  await page.waitForSelector('#view-photo.active', { timeout: 15000 });
  await page.setInputFiles('#file-camera', IMG);
  await page.waitForSelector('#btn-photo-next:not(.hidden)', { timeout: 15000 });
  await page.click('#btn-photo-next');
  await page.waitForSelector('#view-classify.active', { timeout: 15000 });
  await page.click('#opt-no');
  await page.waitForSelector('#view-patrol.active', { timeout: 15000 });
  await page.waitForTimeout(320);   // 让 .15s 过渡跑完，读到的 computedStyle 才是稳定值
}

// 读「肉眼可见」的真实样式，而不是只读 class
const styleOf = (val) => page.evaluate((v) => {
  const el = document.querySelector(`#view-patrol [data-patrol="${v}"]`);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const mark = el.querySelector('.opt-mark');
  const ms = mark ? getComputedStyle(mark) : null;
  const svg = mark ? mark.querySelector('svg') : null;
  return {
    cls: el.className,
    aria: el.getAttribute('aria-checked'),
    border: cs.borderTopColor,
    bg: cs.backgroundColor,
    ring: cs.boxShadow,
    title: getComputedStyle(el.querySelector('.opt-title')).color,
    markBg: ms ? ms.backgroundColor : '(no-mark)',
    markBorder: ms ? ms.borderTopColor : '',
    svgOpacity: svg ? getComputedStyle(svg).opacity : '',
    disabled: document.querySelector('#btn-patrol-done').disabled,
  };
}, val);
const selectedCount = () => page.locator('#view-patrol .opt-card.selected').count();
const isSelected = async (v) => /(^|\s)selected(\s|$)/.test((await styleOf(v)).cls);

// 登录 → 到普通巡查
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await login();
await gotoPatrol();
assert(at().startsWith('/check') && await page.locator('#view-patrol.active').count() === 1,
  'B0 已进入普通巡查页（未点完成检查，不落任何记录）', at());

/* B1 初始：都没选中，按钮禁用 */
{
  const a = await styleOf('一般问题'), b = await styleOf('现场正常');
  assert(!(await isSelected('一般问题')) && !(await isSelected('现场正常')), 'B1 初始两张卡均未选中');
  assert(a.aria === 'false' && b.aria === 'false', 'B1 初始 aria-checked 均为 false', `${a.aria}/${b.aria}`);
  assert(a.disabled === true, 'B1 未选任何一项时「完成检查」保持禁用');
  assert(await selectedCount() === 0, 'B1 初始选中数为 0');
  await shot('01-none-selected');
}

/* B2/B3 点「一般问题」——决定性：可见差异必须存在 */
let s1 = null, s2 = null;
{
  await page.click('#view-patrol [data-patrol="一般问题"]');
  await page.waitForTimeout(320);
  s1 = await styleOf('一般问题'); s2 = await styleOf('现场正常');

  assert(await isSelected('一般问题'), 'B2 点「一般问题」→ 该卡获得选中态');
  assert(!(await isSelected('现场正常')), 'B2 同时「现场正常」不得被选中');
  assert(s1.aria === 'true' && s2.aria === 'false', 'B2 aria-checked 正确反映选择', `${s1.aria}/${s2.aria}`);
  assert(s1.disabled === false, 'B2 选择后「完成检查」变为可用');

  // ★ 可见性硬证据：三处肉眼可辨的差异
  assert(s1.border !== s2.border, 'B3 选中卡边框色与未选中卡不同（肉眼可见）', `${s1.border} vs ${s2.border}`);
  assert(s1.bg !== s2.bg, 'B3 选中卡底色与未选中卡不同（肉眼可见）', `${s1.bg} vs ${s2.bg}`);
  assert(s1.title !== s2.title, 'B3 选中卡标题颜色与未选中卡不同', `${s1.title} vs ${s2.title}`);
  assert(parseFloat(s1.svgOpacity) === 1 && parseFloat(s2.svgOpacity) === 0,
    'B3 勾选标记：选中卡显示、未选中卡隐藏', `${s1.svgOpacity} vs ${s2.svgOpacity}`);
  assert(s1.markBg !== s2.markBg, 'B3 勾选标记底色不同（实心 vs 空心）', `${s1.markBg} vs ${s2.markBg}`);
  assert(await selectedCount() === 1, 'B5 任意时刻选中数恒为 1（互斥单选）');
  await shot('02-selected-general');
}

/* B4 改点「现场正常」→ 状态互换（诉求核心：看得出最终点的是哪个） */
{
  await page.click('#view-patrol [data-patrol="现场正常"]');
  await page.waitForTimeout(320);
  const a = await styleOf('一般问题'), b = await styleOf('现场正常');
  assert(!(await isSelected('一般问题')), 'B4 改点「现场正常」后，原选中卡取消高亮');
  assert(await isSelected('现场正常'), 'B4 新点卡获得选中态');
  assert(a.aria === 'false' && b.aria === 'true', 'B4 aria-checked 随之互换', `${a.aria}/${b.aria}`);
  assert(b.border === s1.border && b.bg === s1.bg, 'B4 高亮样式与前一选择完全一致（同一个选中视觉）');
  assert(await selectedCount() === 1, 'B5 换选后选中数仍为 1');
  const draft = await page.evaluate(() => document.querySelector('#btn-patrol-done').disabled);
  assert(draft === false, 'B4 换选后「完成检查」仍可用');
  await shot('03-selected-normal');

  // 再点回「一般问题」：反复切换不得出现「两个都高亮」
  await page.click('#view-patrol [data-patrol="一般问题"]');
  await page.waitForTimeout(320);
  assert(await selectedCount() === 1 && await isSelected('一般问题'), 'B5 反复切换后仍恰好 1 个选中', `${await selectedCount()} 个`);
}

/* B6 返回分类页再重进 → 复位 */
{
  await page.click('#view-patrol [data-back="classify"]');
  await page.waitForSelector('#view-classify.active', { timeout: 10000 });
  await page.click('#opt-no');
  await page.waitForSelector('#view-patrol.active', { timeout: 10000 });
  await page.waitForTimeout(320);
  assert(await selectedCount() === 0, 'B6 重进普通巡查 → 高亮已清空', `${await selectedCount()} 个`);
  assert((await styleOf('一般问题')).disabled === true, 'B6 重进普通巡查 → 「完成检查」回到禁用');
  await shot('04-reenter-cleared');
}

/* B7 首页重新发起检查（startCheck）→ 无残留 */
{
  await page.click('#view-patrol [data-back="classify"]');
  await page.waitForSelector('#view-classify.active', { timeout: 10000 });
  await page.click('#view-classify [data-back="photo"]');
  await page.waitForSelector('#view-photo.active', { timeout: 10000 });
  await page.click('#view-photo [data-back="home"]');
  await page.waitForSelector('#view-home.active', { timeout: 10000 });
  await page.click('#btn-start');
  await page.waitForSelector('#view-photo.active', { timeout: 15000 });
  await page.setInputFiles('#file-camera', IMG);
  await page.waitForSelector('#btn-photo-next:not(.hidden)', { timeout: 15000 });
  await page.click('#btn-photo-next');
  await page.waitForSelector('#view-classify.active', { timeout: 15000 });
  await page.click('#opt-no');
  await page.waitForSelector('#view-patrol.active', { timeout: 15000 });
  await page.waitForTimeout(320);
  assert(await selectedCount() === 0, 'B7 新一次检查（startCheck 复位）→ 无上一次残留高亮', `${await selectedCount()} 个`);
  assert((await styleOf('现场正常')).disabled === true, 'B7 新一次检查 → 「完成检查」回到禁用');
  await shot('05-new-check-clean');
}

/* B8 矮屏（≤700px 高）实测：本次新增的 padding-right 覆盖必须让勾选标记不压到文字
 * —— 媒体查询里的规则是「同一属性、更高特异性」，容易写成被 .opt-card{padding:18px} 反压，
 *    只跑 390×844 是测不到的。这里用 3 个真实机型高度实测几何关系。 */
for (const [w, h, label] of [[360, 640, '安卓小屏 360×640'], [375, 667, 'iPhone SE 375×667'], [390, 844, '常规 390×844']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(260);
  const geo = await page.evaluate(() => {
    const card = document.querySelector('#view-patrol [data-patrol="现场正常"]');
    const title = card.querySelector('.opt-title'), sub = card.querySelector('.opt-sub'), mark = card.querySelector('.opt-mark');
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
    return {
      card: r(card), title: r(title), sub: r(sub), mark: r(mark), markBox: mark.getBoundingClientRect().width,
      padRight: parseFloat(getComputedStyle(card).paddingRight),
      overflowX: card.scrollWidth - card.clientWidth,
    };
  });
  const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0;
  const short = h <= 700;
  assert(overlap(geo.title, geo.mark) === false, `B8 ${label}：勾选标记不压标题`,
    `title.right=${geo.title.r.toFixed(1)} mark.left=${geo.mark.l.toFixed(1)}`);
  assert(overlap(geo.sub, geo.mark) === false, `B8 ${label}：勾选标记不压副标题`,
    `sub.right=${geo.sub.r.toFixed(1)} mark.left=${geo.mark.l.toFixed(1)}`);
  assert(geo.mark.l >= geo.card.l && geo.mark.r <= geo.card.r,
    `B8 ${label}：勾选标记完整落在卡片内`);
  assert(geo.overflowX <= 0, `B8 ${label}：卡片无横向溢出`, `溢出 ${geo.overflowX}px`);
  assert(geo.padRight === (short ? 68 : 76), `B8 ${label}：右侧留白取到预期分支（矮屏 68 / 常规 76）`, `实测 ${geo.padRight}px`);
  // 文字仍要有可用宽度（矮屏下有 360px 宽，留白 68 + 内左 18 后仍应 > 200px）
  assert(geo.card.w - geo.padRight >= 200, `B8 ${label}：文字可用宽度足够`, `${(geo.card.w - geo.padRight).toFixed(0)}px`);
}
await page.setViewportSize({ width: 390, height: 640 });
await page.waitForTimeout(260);
await page.click('#view-patrol [data-patrol="一般问题"]');
await page.waitForTimeout(320);
assert(await selectedCount() === 1, 'B8 矮屏下点选仍生效（选中数 1）');
await shot('06-shortscreen-selected');

assert(errors.length === 0, '无 JS 运行时错误 / 无 4xx 资源', errors.slice(0, 3).join(' | '));

await ctx.close();
await browser.close();

console.log(`\n===== 汇总：${pass} PASS / ${fail} FAIL =====`);
console.log(`截图目录：${SHOTS}`);
process.exit(fail ? 1 : 0);
