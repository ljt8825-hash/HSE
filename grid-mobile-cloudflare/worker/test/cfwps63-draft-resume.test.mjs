/* CF-WPS-63 拍照断点续传 + 历史栈防护 —— 离线逻辑验证（纯 Node，无网络/无浏览器）
 * 针对「拍完点确定被弹回首页」的修复，逐条验证判定逻辑：
 *   A 空草稿（还没拍照）也能落盘 —— 兜住每次检查的第一张照片（原实现的结构性漏洞）
 *   B 续传落点：photo/classify/vio/patrol 原样恢复，更深的异步级联页退回 photo
 *   C parked（用户主动离开流程）后不再被自动续传硬拽回去
 *   D 配额满：先腾空间，仍失败必须可见（不再静默吞掉）
 *   E 自动续传窗口 30 分钟 / 草稿 TTL 2 小时的边界
 *   F 历史栈：陈旧条目（上次页面加载遗留）绝不渲染；本次加载的条目正常回放
 *   G 启动期续传接线：enterHome → loadDraft → resumeCheck（空草稿也续回拍照页 = D1 落点）
 * Run: node test/cfwps63-draft-resume.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECK = path.join(HERE, '..', '..', 'frontend', 'check.html');
const src = fs.readFileSync(CHECK, 'utf8');

let bad = 0;
const ck = (c, m, x) => c ? console.log('  ok  ' + m + (x !== undefined ? ' :: ' + x : '')) : (bad++, console.log('  NG  ' + m + (x !== undefined ? ' :: ' + x : '')));

function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error('切片失败: ' + from);
  return src.slice(a, b);
}

/* ---------- 通用桩 ---------- */
function makeLocalStorage(quotaBytes) {
  const m = new Map();
  const used = () => [...m.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    _map: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      v = String(v);
      const delta = k.length + v.length - (m.has(k) ? k.length + m.get(k).length : 0);
      if (quotaBytes && used() + delta > quotaBytes) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      m.set(k, v);
    },
    removeItem: k => m.delete(k),
  };
}
function stubEl() {
  const el = { _src: null, src: '', style: {}, textContent: '', _shown: false };
  el.removeAttribute = (a) => { if (a === 'src') el._src = null; };
  return el;
}

/* ================= 区段 2：草稿层 ================= */
const R_DRAFT = slice('/* ================= CF-WPS-42 / CF-WPS-63', '/* ================= 检查流程 ================= */');

function buildDraftApi(opts) {
  const o = opts || {};
  const EMPTY = { scenePhoto: null, behavior: null, person: null, patrolResult: null, afterPhoto: null,
                  coTown: null, coTeamDept: null, coTeamMgr: "", coTeamAdmins: [] };
  const ctx = {
    localStorage: o.ls || makeLocalStorage(),
    initialDraft: o.initialDraft || Object.assign({}, EMPTY),   // 与 startCheck() 的初始形状一致
    initialView: o.initialView,
    saveDB: () => { ctx._saveDBCalls++; },
    flashMsg: (t) => { ctx._flashed.push(t); },
    els: { '#resume-card': stubEl(), '#resume-thumb': stubEl(), '#resume-step': stubEl(), '#patrol-photo': stubEl() },
    _saveDBCalls: 0, _flashed: [], rendered: [], vioGridCalls: 0, setPhotoCalls: [], resetCalls: 0, patrolChoiceCalls: 0,
  };
  const fn = new Function('ctx', `
    const { localStorage, saveDB, flashMsg } = ctx;
    const $ = (s) => ctx.els[s] || null;
    const resetScenePhotoUI = () => { ctx.resetCalls++; };
    const renderPatrolChoice = () => { ctx.patrolChoiceCalls++; };
    const setScenePhoto = (d) => { ctx.setPhotoCalls.push(d); };
    const renderVioGrid = () => { ctx.vioGridCalls++; };
    const showView = (v) => { currentView = v; ctx.rendered.push(v); };
    let draft = ctx.initialDraft || ctx.EMPTY_DRAFT;
    let currentView = ctx.initialView || "boot";
    ${R_DRAFT}
    return {
      saveDraft, loadDraft, clearDraft, parkDraft, resumeTargetView, draftStepText, isCheckFlowView, resumeCheck, renderResumeCard,
      RESUME_VIEWS, DRAFT_TTL_MS, DRAFT_AUTO_RESUME_MS, DRAFT_KEY,
      getDraft: () => draft, setDraft: d => { draft = d; }, setView: v => { currentView = v; }, getView: () => currentView,
    };
  `);
  return { api: fn(ctx), ctx };
}
const RAW = () => JSON.parse(makeLocalStorage().getItem('hse_draft_v1') || 'null');

console.log('═══ A. 空草稿也能落盘（兜住第一张照片） ═══');
{
  const { api, ctx } = buildDraftApi();
  // 模拟 startCheck()：draft 全空 → 原实现这里 saveDraft() 直接 return，什么都不会写
  api.setView('photo');
  const ok = api.saveDraft({ allowEmpty: true });
  ck(ok === true, 'A1 空草稿 + allowEmpty → 落盘成功', ok);
  const raw = JSON.parse(ctx.localStorage.getItem('hse_draft_v1'));
  ck(raw && raw.draft && raw.draft.scenePhoto === null, 'A2 落盘内容含空 scenePhoto', JSON.stringify(raw && raw.draft));
  ck(raw.lastView === 'photo', 'A3 同时记录 lastView = 用户离开时那一屏', raw.lastView);
  ck(api.loadDraft() !== null, 'A4 空草稿可被 loadDraft 读回（旧实现要求 scenePhoto，会返回 null）');

  // 不带 allowEmpty 时仍受原门槛约束（避免别处误写空草稿）
  const { api: api2, ctx: ctx2 } = buildDraftApi();
  ck(api2.saveDraft() === false, 'A5 不带 allowEmpty + 无照片 → 拒绝落盘（保持原语义）');
  ck(ctx2.localStorage.getItem('hse_draft_v1') === null, 'A6 A5 场景确实没写盘');
}

console.log('\n═══ B. 续传落点 ═══');
{
  const cases = [
    ['photo', 'photo'], ['classify', 'classify'], ['vio', 'vio'],
    ['pick-person', 'photo'], ['co-search', 'photo'], ['confirm', 'photo'],
    ['transfer', 'photo'], ['home', 'photo'], ['', 'photo'], [null, 'photo'], [undefined, 'photo'],
  ];
  const { api } = buildDraftApi({ initialDraft: { scenePhoto: 'data:image/jpeg;base64,AAA' } });
  for (const [last, want] of cases) {
    ck(api.resumeTargetView(last) === want, `B lastView=${JSON.stringify(last)} → ${want}`, api.resumeTargetView(last));
  }
  // patrol 需要照片
  const withPhoto = buildDraftApi({ initialDraft: { scenePhoto: 'x' } }).api;
  const noPhoto = buildDraftApi({ initialDraft: { scenePhoto: null } }).api;
  ck(withPhoto.resumeTargetView('patrol') === 'patrol', 'B patrol + 有照片 → patrol');
  ck(noPhoto.resumeTargetView('patrol') === 'photo', 'B patrol + 无照片 → 退回 photo');
}

console.log('\n═══ C. resumeCheck 行为 ═══');
{
  const d = { scenePhoto: null, behavior: '未戴安全帽', person: null };
  const { api, ctx } = buildDraftApi({ initialDraft: d, initialView: 'home' });
  api.resumeCheck(d, 'classify');
  ck(ctx.rendered[0] === 'classify', 'C1 落到草稿记录的 classify，而不是死板回 photo', ctx.rendered.join(','));
  ck(ctx.resetCalls === 1 && ctx.patrolChoiceCalls === 1, 'C2 恢复时重置了照片区 UI 与选中态');
  ck(ctx.setPhotoCalls.length === 0, 'C3 无照片 → 不调用 setScenePhoto（不会写出 src="null"）');
  ck(ctx.vioGridCalls === 0, 'C4 落点是 classify → 不白渲染三违宫格');
  const raw = JSON.parse(ctx.localStorage.getItem('hse_draft_v1'));
  ck(raw.lastView === 'classify', 'C5 落盘 lastView 被修正为续传后的真实落点', raw.lastView);
  ck(!raw.parked, 'C6 续传后清除 parked（用户已在流程中）');

  const withPhoto = buildDraftApi({ initialDraft: { scenePhoto: 'data:x' } });
  withPhoto.api.resumeCheck({ scenePhoto: 'data:x' }, 'vio');
  ck(withPhoto.ctx.vioGridCalls === 1, 'C7 落点 vio → 渲染三违宫格');
  ck(withPhoto.ctx.setPhotoCalls.length === 1, 'C8 有照片 → 重新展示照片');

  const patrol = buildDraftApi({ initialDraft: { scenePhoto: 'data:x' } });
  patrol.api.resumeCheck({ scenePhoto: 'data:x' }, 'patrol');
  ck(patrol.ctx.els['#patrol-photo'].src === 'data:x', 'C9 落点 patrol → 回填巡查结果页照片');
}

console.log('\n═══ D. parked（主动离开后不被硬拽回） ═══');
{
  const { api, ctx } = buildDraftApi({ initialDraft: { scenePhoto: 'data:x' }, initialView: 'photo' });
  api.saveDraft({ allowEmpty: true });          // 用户在流程中存了一次
  ck(!api.loadDraft().parked, 'D1 流程中落盘 → 未 parked');
  api.parkDraft();                              // 用户点返回箭头回首页
  ck(api.loadDraft().parked === true, 'D2 主动离开 → parked = true');
  api.parkDraft();                              // 幂等
  ck(api.loadDraft().parked === true, 'D3 parkDraft 幂等');
  api.saveDraft({ allowEmpty: true });          // 重新进入流程
  ck(!api.loadDraft().parked, 'D4 重新开始活动 → parked 被清掉');
  ck(api.isCheckFlowView('photo') && api.isCheckFlowView('confirm'), 'D5 检查流程视图识别正确');
  ck(!api.isCheckFlowView('home') && !api.isCheckFlowView('me'), 'D6 首页/我的不算检查流程');
}

console.log('\n═══ E. 配额与时间窗口 ═══');
{
  // 配额极小 → 第一次写失败 → 调 saveDB 腾空间 → 仍失败 → 必须 flashMsg
  const ls = makeLocalStorage(50);
  const { api, ctx } = buildDraftApi({ ls });
  ls._map.set('hse_check_v1_x', 'y'.repeat(200));   // 绕过 mock 配额直接塞满，模拟真机配额耗尽
  const ok = api.saveDraft({ allowEmpty: true });
  ck(ok === false, 'E1 配额满且腾不出空间 → 返回 false（不抛异常）', ok);
  ck(ctx._saveDBCalls >= 1, 'E2 先调用 saveDB 尝试腾空间', ctx._saveDBCalls);
  ck(ctx._flashed.length === 1 && /存储已满/.test(ctx._flashed[0]), 'E3 失败必须给出可见提示（不再静默）', ctx._flashed[0]);

  // 配额够 → 正常写入，不触发 saveDB
  const { api: api2, ctx: ctx2 } = buildDraftApi();
  ck(api2.saveDraft({ allowEmpty: true }) === true && ctx2._saveDBCalls === 0, 'E4 配额充足 → 直接写成功，不白跑 saveDB');

  // 时间窗口
  const { api: api3, ctx: ctx3 } = buildDraftApi();
  const now = Date.now();
  const put = (at, extra) => ctx3.localStorage.setItem('hse_draft_v1', JSON.stringify(Object.assign({ at, draft: { scenePhoto: 'x' } }, extra || {})));
  put(now - 60 * 1000); ck(api3.loadDraft() !== null, 'E5 1 分钟前的草稿 → 可续');
  put(now - 29 * 60 * 1000); ck(api3.loadDraft() !== null, 'E6 29 分钟前 → 仍可续（旧实现 5 分钟就放弃了）');
  put(now - 3 * 3600 * 1000); ck(api3.loadDraft() === null, 'E7 3 小时前 → 超过 TTL，视为放弃');
  ck(api3.DRAFT_AUTO_RESUME_MS === 30 * 60 * 1000, 'E8 自动续传窗口 = 30 分钟', api3.DRAFT_AUTO_RESUME_MS);
  ck(api3.DRAFT_TTL_MS === 2 * 3600 * 1000, 'E9 草稿 TTL 仍为 2 小时', api3.DRAFT_TTL_MS);
  // 损坏数据不抛异常
  ctx3.localStorage.setItem('hse_draft_v1', '{坏 JSON');
  ck(api3.loadDraft() === null, 'E10 损坏 JSON → 返回 null，不抛异常');
}

console.log('\n═══ F. 历史栈：陈旧条目防护 ═══');
{
  const R_NAV = slice('let viewStack = [];', '/* ================= 启动：复用网格长巡查登录会话');
  const build = (initialView) => {
    const ctx = { rendered: [], enteredHome: 0, captured: {}, coBackStep: () => true };
    ctx.history = {
      _back: 0, _go: [], push: [], replace: [],
      back: () => { ctx.history._back++; },
      go: (n) => { ctx.history._go.push(n); },
      pushState: (st) => { ctx.history.push.push(st); },
      replaceState: (st) => { ctx.history.replace.push(st); },
    };
    ctx.window = { addEventListener: (t, fn) => { ctx.captured[t] = fn; } };
    // contains() 恒真 → showView 里「history.go 兜底重渲染」的 setTimeout 不会误触发
    ctx.document = { getElementById: () => ({ classList: { contains: () => true } }) };
    ctx.location = { href: 'https://x/check' };
    const fn = new Function('ctx', `
      const { history, location, document, coBackStep } = ctx;
      const window = ctx.window;
      let mustChangePwd = false;
      const showChangePassword = () => { ctx.rendered.push('changepwd'); };
      const parkDraft = () => { ctx.parked = (ctx.parked || 0) + 1; };
      const isCheckFlowView = (v) => ctx.flowViews.indexOf(v) >= 0;
      const enterHome = () => { ctx.enteredHome++; currentView = "home"; ctx.rendered.push("home"); };
      let currentView = ctx.initialView || "boot";
      // CF-WPS-95：showView 入口的隐患排查权限门依赖这两个模块级符号，
      // slice 抽不出它们 → 在此注入（语义与线上一致：HAZARD_VIEWS 名单 +
      // isHazardUser 返回 false = 非安环账号，hazard 视图一律被拦回首页）。
      const HAZARD_VIEWS = ['hazard-list', 'hazard-form', 'hazard-detail'];
      const isHazardUser = () => false;
      const flashMsg = (m) => { ctx.flash = (ctx.flash || []).concat(m); };
      const renderView = (name) => { currentView = name; ctx.rendered.push(name); };
      const syncTabbar = () => {};
      ${R_NAV}
      return { showView, getStack: () => viewStack, nav: H5_NAV_ID, setView: v => { currentView = v; },
               getView: () => currentView, pop: (st) => ctx.captured.popstate({ state: st }) };
    `);
    ctx.flowViews = ['photo', 'classify', 'vio', 'patrol', 'pick-admin', 'pick-person', 'co-search', 'handle', 'transfer', 'confirm'];
    return { api: fn(ctx), ctx };
  };

  // F1：陈旧条目（上一次页面加载遗留）绝不渲染
  {
    const { api, ctx } = build('home');
    api.showView('home');                                   // 本次加载的首个落地视图
    const nav = api.nav;
    ck(typeof nav === 'string' && nav.length > 3, 'F1 navId 已生成', nav);
    const before = ctx.rendered.length;
    api.pop({ h5view: 'classify', nav: 'STALE-OLD-LOAD' });  // 陈旧条目
    ck(ctx.rendered.length === before, 'F2 陈旧条目 → 不渲染任何视图（旧实现会渲染出未选中的分类页）', ctx.rendered.slice(before).join(',') || '(none)');
    ck(ctx.enteredHome === 0 && ctx.history._back === 1, 'F3 已在首页 → 交还浏览器继续后退，不重复进首页', 'back=' + ctx.history._back);
  }
  // F2：不在首页时遇到陈旧条目 → 回首页（而不是渲染陈旧视图）
  {
    const { api, ctx } = build('photo');
    api.showView('home'); api.showView('photo');
    ctx.rendered.length = 0;
    api.pop({ h5view: 'classify', nav: 'STALE' });
    ck(ctx.enteredHome === 1, 'F4 不在首页 + 陈旧条目 → 回首页', ctx.enteredHome);
    ck(ctx.rendered.join(',') === 'home', 'F5 渲染的是首页，不是陈旧的 classify', ctx.rendered.join(','));
  }
  // F3：本次加载的条目 → 正常回放
  {
    const { api, ctx } = build('home');
    api.showView('home'); api.showView('photo');
    ctx.rendered.length = 0;
    api.pop({ h5view: 'home', nav: api.nav });
    ck(ctx.rendered.join(',') === 'home', 'F6 本次加载的 home 条目 → 正常回放', ctx.rendered.join(','));
    ck(api.getStack().join(',') === 'home', 'F7 页内栈收敛到 home', api.getStack().join(','));
  }
  // F4：主动离开检查流程 → parkDraft
  {
    const { api, ctx } = build('photo');
    api.showView('home'); api.showView('photo');
    ctx.parked = 0;
    api.showView('home');
    ck(ctx.parked === 1, 'F8 从检查流程回首页 → parkDraft 被调用', ctx.parked);
  }
  // F5：从 boot 首屏进首页 → 不应 park
  {
    const { api, ctx } = build('boot');
    ctx.parked = 0;
    api.showView('home');
    ck(!ctx.parked, 'F9 boot → home（启动路径）不 park', ctx.parked);
  }
  // F6：state 都带上了 nav
  {
    const { api, ctx } = build('home');
    api.showView('home'); api.showView('photo');
    ck(ctx.history.replace.length === 1 && ctx.history.replace[0].nav === api.nav, 'F10 replaceState 带 nav', JSON.stringify(ctx.history.replace[0]));
    ck(ctx.history.push.length === 1 && ctx.history.push[0].nav === api.nav, 'F11 pushState 带 nav', JSON.stringify(ctx.history.push[0]));
  }
}

console.log('\n═══ G. 启动期续传接线（enterHome → loadDraft → resumeCheck）═══');
{
  // 复刻 check.html 第 1790 / 1809-1810 行的落地逻辑：
  //   const d0 = loadDraft();
  //   if(d0 && !d0.parked && Date.now() - d0.at < DRAFT_AUTO_RESUME_MS) resumeCheck(d0.draft, d0.lastView);
  // 这是「整页重载后从草稿续回原屏」的总开关；原 bug「第一张照片被弹回首页」的根因，
  // 就是这条接线在「还没拍照」时没有可用的草稿可续。用离线方式跑，不依赖浏览器/网络。
  const boot = (ls, seed) => {
    if (seed) ls.setItem('hse_draft_v1', JSON.stringify(seed));
    const { api, ctx } = buildDraftApi({ ls });
    const enterHome = () => {
      ctx.rendered.push('home');                          // enterHome 先落首页骨架
      const d0 = api.loadDraft();
      if (d0 && !d0.parked && Date.now() - d0.at < api.DRAFT_AUTO_RESUME_MS) {
        api.resumeCheck(d0.draft, d0.lastView);           // 启动期续传接线（1790/1809）
      }
      return d0;
    };
    return { enterHome, api, ctx };
  };
  const now = Date.now();
  const seedDraft = (over) => Object.assign({ at: now, draft: { scenePhoto: null }, lastView: 'photo', parked: false }, over);

  // G1（D1 精确落点）：刚进拍照页、未拍照即被回收 → 重载后落拍照页
  {
    const { enterHome, ctx } = boot(makeLocalStorage(), seedDraft({ draft: { scenePhoto: null } }));
    enterHome();
    ck(ctx.rendered.join(',') === 'home,photo', 'G1 空草稿(lastView=photo) → 启动落拍照页（不是首页）', ctx.rendered.join(','));
    ck(ctx.setPhotoCalls.length === 0, 'G1b 空草稿：未调用 setScenePhoto（不会写出 src="null"）', ctx.setPhotoCalls.length);
  }
  // G2：有照片、停在 classify → 落到 classify
  {
    const { enterHome, ctx } = boot(makeLocalStorage(), seedDraft({ draft: { scenePhoto: 'data:x' }, lastView: 'classify' }));
    enterHome();
    ck(ctx.rendered.join(',') === 'home,classify', 'G2 有照片 + classify → 落 classify', ctx.rendered.join(','));
  }
  // G3：parked 草稿 → 不续传，停首页（返回键仍有效）
  {
    const { enterHome, ctx } = boot(makeLocalStorage(), seedDraft({ parked: true }));
    enterHome();
    ck(ctx.rendered.join(',') === 'home', 'G3 parked 草稿 → 不续传，停首页', ctx.rendered.join(','));
  }
  // G4：草稿超 30 分钟窗口 → 不续传
  {
    const { enterHome, ctx } = boot(makeLocalStorage(), seedDraft({ at: now - 40 * 60 * 1000 }));
    enterHome();
    ck(ctx.rendered.join(',') === 'home', 'G4 草稿超 30 分钟 → 不续传', ctx.rendered.join(','));
  }
  // G5：无草稿 → 正常首次启动，停首页
  {
    const { enterHome, ctx } = boot(makeLocalStorage(), null);
    enterHome();
    ck(ctx.rendered.join(',') === 'home', 'G5 无草稿 → 停首页（正常启动）', ctx.rendered.join(','));
  }
}

console.log('\n' + (bad ? `❌ ${bad} 项失败` : '✅ 全部通过'));
process.exit(bad ? 1 : 0);
