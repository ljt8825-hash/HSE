/* CF-WPS-21 浏览器 E2E（公网真机，只读）
 * 覆盖用户本轮 4 项前端诉求：
 *   ① 底部导航（首页/任务反馈/巡查台账/我的）像微信一样常驻于各主屏
 *   ② 每屏自动适配手机高度（无页面级滚动条 / 内部滚动 / 安全区）
 *   ③ 定位不再是「开始检查」的前置门槛（拒绝定位也能开始检查）
 *   ④ 身份卡显示「网格长等级」（不再显示员工编号）；首页统计为「本月上报」
 * 纪律：只做读取与页面交互；不提交任何巡查记录。
 * Run: node test/cfwps21-browser-e2e.mjs
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';
const PHONE = '13905440679', PASSWORD = 'zwh0679';
// 柴胡店镇政府（WGS-84，手机 GPS 原始值）
const GEO = { latitude: 37.6303258, longitude: 116.9219013 };
const SHOTS = path.resolve(import.meta.dirname, '_cfwps21_shots');
mkdirSync(SHOTS, { recursive: true });

const PW_DIR = 'G:/hse-dashboard/安全看板vben/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { createRequire } = await import('node:module');
const pwMod = createRequire(import.meta.url)(PW_DIR);
const chromium = pwMod.chromium || (pwMod.default && pwMod.default.chromium);
if (!chromium) throw new Error('playwright-core chromium 未加载: ' + Object.keys(pwMod).join(','));

let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_UI ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { fail++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

const TMP = 'G:/hse-dashboard/grid-mobile-cloudflare/worker/test/_cfwps21_tmp';
mkdirSync(TMP, { recursive: true });

const VIEWPORTS = [
  { name: 'iPhone14', width: 390, height: 844 },
  { name: '基础小屏', width: 360, height: 640 },
  { name: '大屏', width: 430, height: 932 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--disable-crashpad', '--disable-dev-shm-usage',
    `--disk-cache-dir=${TMP}/cache`, '--disable-features=Translate,BackForwardCache'],
  env: { ...process.env, TMP, TEMP: TMP },
});

async function newPage({ geo = GEO, denyGeo = false, viewport }) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    geolocation: denyGeo ? undefined : geo,
    permissions: denyGeo ? [] : ['geolocation'],
  });
  if (denyGeo) {
    // 显式拒绝定位权限（模拟乡镇信号差/用户拒绝）
    await ctx.grantPermissions([]);
    await ctx.clearPermissions();
  }
  return { ctx, page: await ctx.newPage() };
}

async function login(page) {
  await page.goto(`${PAGES}/login.html`, { waitUntil: 'domcontentloaded' });
  // CF-WPS-23 起：登录页若已有「记住我」凭据会直接免登录跳走，此时无需再填表单
  if (/\/check(\.html)?$/.test(new URL(page.url()).pathname)) return true;
  if (await page.$('#phone')) {
    await page.fill('#phone', PHONE);
    await page.fill('#password', PASSWORD);
    await page.click('#btn');
  }
  // CF-WPS-24 起：/home 已彻底移除（_redirects: /home → /check 302）；登录成功直达 /check；
  // Pages 启用 pretty URL：/check.html → 308 → /check
  await page.waitForURL(/\/check(\.html)?(\?|$)/, { timeout: 45000 });
  return true;
}

async function openCheck(page) {
  await page.goto(`${PAGES}/check.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-home.active', { timeout: 45000 });
}

const tabInfo = (page) => page.evaluate(() => {
  const w = document.querySelector('#tabbar-wrap');
  const t = document.querySelector('#tabbar');
  if (!w || !t) return null;
  const wr = w.getBoundingClientRect(), tr = t.getBoundingClientRect();
  const active = [...document.querySelectorAll('#tabbar .tab-item')]
    .filter(x => x.classList.contains('active')).map(x => x.dataset.tab);
  return {
    wrapDisplay: getComputedStyle(w).display,
    labels: [...document.querySelectorAll('#tabbar .tab-item')].map(x => x.textContent.trim()),
    top: Math.round(tr.top), bottom: Math.round(tr.bottom), height: Math.round(tr.height),
    wrapTop: Math.round(wr.top), wrapBottom: Math.round(wr.bottom),
    vh: window.innerHeight, active,
  };
});

const layoutInfo = (page) => page.evaluate(() => {
  const app = document.querySelector('#app');
  const view = document.querySelector('.view.active');
  const pageEl = view && view.querySelector('.page');
  return {
    docScrollH: document.documentElement.scrollHeight,
    bodyScrollH: document.body.scrollHeight,
    innerH: window.innerHeight,
    appH: Math.round(app.getBoundingClientRect().height),
    pageScrollable: pageEl ? getComputedStyle(pageEl).overflowY : null,
    pageOverflow: pageEl ? Math.round(pageEl.scrollHeight - pageEl.clientHeight) : 0,
    viewId: view ? view.id : null,
    cs: pageEl ? getComputedStyle(pageEl).paddingBottom : null,
  };
});

// ============================================================================
for (const vp of VIEWPORTS) {
  console.log(`\n===== 视口 ${vp.name} ${vp.width}x${vp.height} =====`);
  const { ctx, page } = await newPage({ viewport: vp });
  try {
    await login(page);
    await openCheck(page);

    // ---------- 布局：无页面级滚动、应用撑满视口 ----------
    const L = await layoutInfo(page);
    assert(L.appH === L.innerH || Math.abs(L.appH - L.innerH) <= 2,
      `${vp.name} #app 高度 == 视口高度（每屏自适应）`, `appH=${L.appH} innerH=${L.innerH}`);
    assert(L.docScrollH <= L.innerH + 2 && L.bodyScrollH <= L.innerH + 2,
      `${vp.name} 无页面级纵向滚动条（滚动收敛到内部 .page）`, `doc=${L.docScrollH} body=${L.bodyScrollH} innerH=${L.innerH}`);
    assert(L.pageScrollable === 'auto', `${vp.name} 内部 .page 是唯一滚动容器`, String(L.pageScrollable));

    // ---------- 底部导航：首页可见 ----------
    const T = await tabInfo(page);
    assert(!!T && T.wrapDisplay !== 'none', `${vp.name} 首页底部导航可见`, T ? T.wrapDisplay : 'null');
    assert(!!T && T.bottom <= T.vh + 1 && T.top >= 0,
      `${vp.name} 底部导航完整落在视口内（不被安全区裁掉）`, T ? `top=${T.top} bottom=${T.bottom} vh=${T.vh}` : 'null');
    // 第二项为角色化文案：公司管理=「任务反馈」，其余角色=「整改任务」（既有业务口径，本次未改）
    const labOk = !!T && T.labels.length === 4
      && T.labels[0] === '首页' && /^(整改任务|任务反馈)$/.test(T.labels[1])
      && T.labels[2] === '巡查台账' && T.labels[3] === '我的';
    assert(labOk, `${vp.name} 四项文案正确（首页/整改任务|任务反馈/巡查台账/我的）`, T ? T.labels.join('/') : 'null');
    assert(!!T && T.active.join(',') === 'home', `${vp.name} 首页时高亮=首页`, T ? T.active.join(',') : 'null');
    // --tabbar-h(88px) + 8px 间距 → 计算值 96px（无安全区时）
    const padPx = parseInt(String(L.cs || ''), 10);
    assert(Number.isFinite(padPx) && padPx >= 88 && padPx <= 120,
      `${vp.name} 主屏 .page 为底部导航预留 padding-bottom（≈96px）`, String(L.cs));

    // ---------- 定位：后台解析出真实乡镇（非占位文案） ----------
    let addr = '';
    for (let i = 0; i < 40; i++) {
      addr = (await page.textContent('#gps-addr')) || '';
      if (addr.includes('柴胡店镇')) break;
      await page.waitForTimeout(700);
    }
    assert(addr.includes('宁津县柴胡店镇'), `${vp.name} 自动定位文案 = 「宁津县柴胡店镇」（经纬度反查，非「当前网格辖区」）`, addr);
    assert(!addr.includes('当前网格辖区'), `${vp.name} 占位文案已消失`, addr);
    await page.screenshot({ path: path.join(SHOTS, `${vp.name}-01-home.png`) });

    // ---------- 身份卡：网格长等级，无员工编号 ----------
    const meta = (await page.textContent('#idc-meta')) || '';
    assert(meta.includes('网格长等级') && /网格长/.test(meta), `${vp.name} 身份卡显示网格长等级`, meta.replace(/\s+/g, ' '));
    assert(!/工号|员工编号/.test(meta), `${vp.name} 身份卡不再显示员工编号`, meta.replace(/\s+/g, ' '));
    const statLab = await page.textContent('.stat-row .stat-card:first-child .lab');
    assert(statLab.trim() === '本月上报', `${vp.name} 首页统计 = 本月上报`, statLab.trim());

    // ---------- 四个主屏来回切：底部导航常驻 ----------
    const TABS = [['my-rectify', 'view-my-rectify'], ['my-checks', 'view-my-checks'], ['me', 'view-me'], ['home', 'view-home']];
    for (const [tab, viewId] of TABS) {
      await page.click(`#tabbar .tab-item[data-tab="${tab}"]`);
      await page.waitForTimeout(350);
      const activeView = await page.evaluate(() => document.querySelector('.view.active')?.id);
      assert(activeView === viewId, `${vp.name} 点击「${tab}」→ ${viewId}`, String(activeView));
      const t2 = await tabInfo(page);
      assert(!!t2 && t2.wrapDisplay !== 'none' && t2.bottom <= t2.vh + 1,
        `${vp.name} ${viewId} 底部导航仍常驻可见`, t2 ? `disp=${t2.wrapDisplay} bottom=${t2.bottom}/${t2.vh}` : 'null');
      assert(!!t2 && t2.active.join(',') === tab, `${vp.name} ${viewId} 高亮跟随当前主屏`, t2 ? t2.active.join(',') : 'null');
      const l2 = await layoutInfo(page);
      assert(l2.docScrollH <= l2.innerH + 2, `${vp.name} ${viewId} 无页面级滚动`, `doc=${l2.docScrollH} innerH=${l2.innerH}`);
      if (tab !== 'home') await page.screenshot({ path: path.join(SHOTS, `${vp.name}-tab-${tab}.png`) });
    }

    // ---------- 二级页：像微信一样收起底部导航（避免遮挡拍照/选人流程） ----------
    await page.click('#btn-start');
    await page.waitForSelector('#view-photo.active', { timeout: 15000 });
    const t3 = await tabInfo(page);
    assert(!!t3 && t3.wrapDisplay === 'none', `${vp.name} 二级页（拍照）底部导航收起（微信式）`, t3 ? t3.wrapDisplay : 'null');
    await page.click('#view-photo [data-back="home"]');
    await page.waitForSelector('#view-home.active', { timeout: 15000 });
    const t4 = await tabInfo(page);
    assert(!!t4 && t4.wrapDisplay !== 'none', `${vp.name} 返回首页后底部导航恢复`, t4 ? t4.wrapDisplay : 'null');
  } catch (e) {
    bad(`${vp.name} 用例异常`, String(e).slice(0, 300));
    try { await page.screenshot({ path: path.join(SHOTS, `${vp.name}-ERROR.png`) }); } catch { /* noop */ }
  } finally {
    await ctx.close();
  }
}

// ============================================================================
console.log('\n===== 无定位权限场景（乡镇信号差/用户拒绝） =====');
{
  const { ctx, page } = await newPage({ denyGeo: true, viewport: { width: 390, height: 844 } });
  try {
    await login(page);
    await openCheck(page);

    // 关键：开始检查 不再要求定位成功
    const disabled = await page.getAttribute('#btn-start', 'disabled');
    assert(disabled === null, '「开始检查」无 disabled 属性（定位不再是前置门槛）', String(disabled));
    // CF-WPS-23 起：#cta-sub 元素已按需求删除，改为断言其不存在（含「定位成功」门槛文案）
    const ctaSubCount = await page.evaluate(() => document.querySelectorAll('#cta-sub').length);
    assert(ctaSubCount === 0, 'CTA 副文案元素已移除（#cta-sub 数 = 0）', String(ctaSubCount));
    const homeText = (await page.textContent('#view-home')) || '';
    assert(!/定位成功后才能开始|定位成功后/.test(homeText), '首页无「定位成功才能开始检查」类门槛文案',
      (homeText.match(/.{0,20}定位成功.{0,20}/) || ['(无)'])[0]);

    const addr = (await page.textContent('#gps-addr')) || '';
    assert(!addr.includes('柴胡店镇') && (addr.includes('定位') || addr.includes('不支持')),
      '未授权定位 → 明确提示且不臆造地址', addr);

    // 直接开始检查 → 应能进入拍照页
    await page.click('#btn-start');
    await page.waitForSelector('#view-photo.active', { timeout: 15000 });
    assert(true, '无定位权限也能进入检查流程（拍照页）');
    await page.screenshot({ path: path.join(SHOTS, 'no-geo-01-photo.png') });

    // 继续往下走：分类 → 无问题 → 巡查结果页（全链路不因定位缺失中断）
    await page.click('#view-photo [data-back="home"]');
    await page.waitForSelector('#view-home.active', { timeout: 15000 });
    // 底部导航在无定位时同样常驻
    const t = await tabInfo(page);
    assert(!!t && t.wrapDisplay !== 'none', '无定位时底部导航同样常驻', t ? t.wrapDisplay : 'null');
  } catch (e) {
    bad('无定位场景异常', String(e).slice(0, 300));
    try { await page.screenshot({ path: path.join(SHOTS, 'no-geo-ERROR.png') }); } catch { /* noop */ }
  } finally {
    await ctx.close();
  }
}

await browser.close();
console.log(`\n===== RESULT: ${pass} PASS_UI, ${fail} FAIL =====`);
console.log(`截图目录: ${SHOTS}`);
process.exit(fail ? 1 : 0);
