/* CF-WPS-91 —— 「待复查」数字无家可归（首页提醒点不动、台账里找不到那条记录）
 *
 * 用户现象（原话）：
 *   首页「待办提醒 · 有 1 条整改已提交，待复查」——「是哪一条，没有发现记录」。
 *
 * 根因（四层断链，一层比一层彻底）：
 *   ① 首页那行是**纯文本**（`lines.push("· 有 N 条…待复查")`），没有任何可点入口；
 *   ② 「我的复查」页（#view-my-review）渲染逻辑早就写好，但**没有任何元素指向它**
 *      —— 有页面、无入口，等于不存在；
 *   ③ 巡查台账只分两组：待上报（syncState !== synced）与未闭环（status === unfinished），
 *      而这条 status === "done" 且已同步 ⇒ **两组都进不去，在台账页彻底消失**
 *      （与 CF-WPS-82 修过的「未闭环」缺口同一类）；
 *   ④ 即便在「已上报台账」组里翻到服务端那张卡，详情页走 renderServerDetail，
 *      那里**没有**「复查通过·闭环」按钮（按钮只在 renderDetail，本机记录详情页）。
 *
 * 本次改动：
 *   A. 新增唯一口径函数 myToReviewRecords()（首页文案 / 我的复查页 / 台账分组三处共用）。
 *   B. 首页待办提醒改成 {t, go} 行结构 + renderTodoList() 统一渲染，可点行直接 openEntry。
 *   C. 我的页新增「待我复查」入口卡（无记录时隐藏，文案带条数）。
 *   D. 巡查台账新增「待复查（N）」本地分组（与「待上报」按 syncState 严格二分）。
 *   E. 页签角标口径 = 未闭环 + 待复查（两组标签各带数字，角标可当场核对）。
 *
 * Run: node worker/test/cfwps91-review-entry.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dir, '../../frontend/check.html');
const PAGES_PATH = resolve(__dir, '../../_pages_deploy/check.html');
const html = readFileSync(HTML_PATH, 'utf8');
const pagesHtml = readFileSync(PAGES_PATH, 'utf8');

let pass = 0, bad = 0;
const ok = (n, x = '') => { pass++; console.log('  ok  ' + n + (x ? ' :: ' + x : '')); };
const ng = (n, d) => { bad++; console.log('  NG  ' + n + ' :: ' + d); };
const ck = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : ng(n, d || 'assertion false'));

/* ─────────────── 花括号配对精确抽取具名函数 ─────────────── */
function extractFn(name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html);
  if (!m) return null;
  const braceStart = html.indexOf('{', m.index + m[0].length - 1);
  if (braceStart < 0) return null;
  let depth = 0, inS = null, inLC = false, inBC = false, i = braceStart;
  for (; i < html.length; i++) {
    const c = html[i], n = html[i + 1];
    if (inLC) { if (c === '\n') inLC = false; continue; }
    if (inBC) { if (c === '*' && n === '/') { inBC = false; i++; } continue; }
    if (inS) { if (c === '\\') { i++; continue; } if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { inLC = true; i++; continue; }
    if (c === '/' && n === '*') { inBC = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return html.slice(m.index, i);
}
const extractSpan = (from, to) => {
  const a = html.indexOf(from), b = html.indexOf(to);
  return (a >= 0 && b > a) ? html.slice(a, b) : null;
};

/* ══════════════════ §A 静态接线 ══════════════════ */
console.log('\n=== CF-WPS-91 · A. 静态接线：三处入口 + 台账分组 + 角标口径 ===\n');

console.log('═══ A1. 唯一口径函数 ═══');
{
  const f = extractFn('myToReviewRecords') || '';
  ck(!!f, 'A1 myToReviewRecords 已定义（唯一口径）');
  ck(/r\.status === "done"/.test(f), 'A1 判据 = status === "done"（已整改、未复查）');
  ck(/isMySubordinateRec\(r\)/.test(f) && /r\.checkerId === session\.id/.test(f),
    'A1 范围与 CF-WPS-40 一致：经理看下属报的，其余角色看自己巡查的');
  // 首页里不应再有就地写的重复 filter
  const hs = extractFn('refreshHomeStats') || '';
  ck(/const toReview = myToReviewRecords\(\)/.test(hs), 'A1 首页改调 myToReviewRecords()');
  ck(!/filter\(r => \(r\.status === "done"\)/.test(hs), 'A1 首页里那处就地 filter 已删除（不会两处各自演化）');
  const mr = extractFn('openEntry') || '';
  ck(/const toReview = myToReviewRecords\(\)/.test(mr), 'A1 我的复查页也走同一函数');
}

console.log('═══ A2. 首页待办提醒可点 ═══');
{
  const hs = extractFn('refreshHomeStats') || '';
  ck(/go: "my-review"/.test(hs), 'A2 「待复查」那行带 go: "my-review"');
  ck(/go: "my-checks"/.test(hs), 'A2 「待上报 / 尚未完成整改」那行指向台账');
  ck(/todoBaseLines = lines;/.test(hs) && /renderTodoList\(\)/.test(hs), 'A2 落基准行并交给统一渲染入口');
  ck(!/todo\.innerHTML = lines\.length/.test(hs), 'A2 首页不再自己拼 innerHTML（渲染收敛到 renderTodoList）');
  const rtl = extractFn('renderTodoList') || '';
  ck(!!rtl, 'A2 renderTodoList 已定义');
  ck(/todo-line/.test(rtl) && /todo-arrow/.test(rtl), 'A2 可点行有 class 与「查看 ›」箭头');
  ck(/el\.onclick = \(\) => \{/.test(rtl) && /openEntry\(l\.go\)/.test(rtl), 'A2 点击真的调 openEntry');
  const ib = extractFn('refreshInboxStats') || '';
  ck(/todoBaseLines\.slice\(\)/.test(ib), 'A2 refreshInboxStats 从基准行重建（不累积重复行）');
  ck(/go: "my-rectify"/.test(ib), 'A2 「收到指派」行也可点 → 整改任务');
  ck(!/baseLines/.test(ib), 'A2 旧的 baseLines 参数已摘掉');
  ck(/\.todo-line\.go\{cursor:pointer/.test(html), 'A2 CSS 里有 .todo-line.go 的可点样式');
}

console.log('═══ A3. 「我的复查」页终于有入口 ═══');
{
  ck(/id="btn-me-review"/.test(html), 'A3 我的页有「待我复查」入口卡');
  ck(/id="me-review-hint"/.test(html), 'A3 入口卡带条数文案位');
  const me = (extractFn('openEntry') || '');
  ck(/getElementById\("btn-me-review"\)/.test(me) && /rv\.length \? "" : "none"/.test(me),
    'A3 进「我的」页时按条数显隐（没有待复查就不占位）');
  ck(/\+ rv\.length \+ " 条"/.test(me), 'A3 入口卡文案带条数');
  ck(/bmr\.onclick = \(\) => openEntry\("my-review"\)/.test(html), 'A3 入口卡已绑定 openEntry("my-review")');
  // 返回键不能写死 home —— 从「我的」进来要能退回「我的」
  ck(/backBtn\.dataset\.back = viewStack\[viewStack\.length - 1\]/.test(me), 'A3 返回键回到进来时那一屏');
}

console.log('═══ A4. 巡查台账补「待复查」分组 ═══');
{
  const mc = extractFn('renderMyChecks') || '';
  ck(/const review = myToReviewRecords\(\)\.filter\(r => r\.syncState === "synced"\)/.test(mc),
    'A4 待复查组 = myToReviewRecords() 中已同步的那些');
  ck(/"待复查（" \+ review\.length \+ "）"/.test(mc), 'A4 分组标签写「待复查（N）」');
  ck(/review\.forEach\(r => el\.appendChild\(recordCard\(r/.test(mc), 'A4 用本机 recordCard（点开有复查按钮）');
  ck(/!review\.length &&/.test(mc), 'A4 空态判定把新分组算进去（否则会同时显示「暂无记录」）');
  const iOpen = mc.indexOf('"未闭环（"');
  const iRev = mc.indexOf('"待复查（"');
  ck(iOpen >= 0 && iRev > iOpen, 'A4 分组顺序：未闭环 在 待复查 之前');
}

console.log('═══ A5. 页签角标口径 ═══');
{
  const rb = extractFn('refreshLedgerBadge') || '';
  ck(/myOpenLoopedRecords\(\)\.length \+ myToReviewRecords\(\)\.length/.test(rb),
    'A5 角标 = 未闭环 + 待复查（两组标签都带数字，可当场核对）');
}

console.log('═══ A6. 版本自洽（≥ .90）与副本同步 ═══');
{
  const b = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!b, 'A6 hse-build 存在', b);
  ck(b === cfg && b === app, 'A6 三处版本一致', `${b} / ${cfg} / ${app}`);
  ck(!!b && b >= '2026-10-15.90', 'A6 版本 ≥ .90', b);
  const pb = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pb === b, 'A6 _pages_deploy 副本已同步', pb);
  ck(html === pagesHtml, 'A6 frontend 与 _pages_deploy 逐字节一致');
}

/* ══════════════════ §B 行为层真跑 ══════════════════ */
console.log('\n=== CF-WPS-91 · B. 真跑（口径函数 / 角标 / 待办渲染 / 台账分组） ===\n');

const FN_UNSYNCED = extractFn('myUnsyncedRecords');
const FN_OPEN = extractFn('myOpenLoopedRecords');
const FN_REVIEW = extractFn('myToReviewRecords');
const FN_BADGE = extractFn('refreshLedgerBadge');
const FN_RENDERCHECKS = extractFn('renderMyChecks');
const FN_ESC = extractFn('esc');
const SRC_TODO = extractSpan('let todoBaseLines', 'async function refreshInboxStats');
const FN_TODOLIST = extractFn('renderTodoList');

ck(!!FN_UNSYNCED && !!FN_OPEN && !!FN_REVIEW && !!FN_BADGE && !!FN_RENDERCHECKS && !!FN_ESC && !!SRC_TODO && !!FN_TODOLIST,
  'B0 全部源码片段抽取成功',
  [FN_UNSYNCED, FN_OPEN, FN_REVIEW, FN_BADGE, FN_RENDERCHECKS, FN_ESC, SRC_TODO, FN_TODOLIST].map((x) => (x ? 1 : 0)).join(''));

/* ── 最小 DOM 桩 ── */
function mkEl(tag) {
  const el = {
    tagName: tag, className: '', id: '', style: {}, dataset: {}, children: [],
    textContent: '', onclick: null, _html: '', _goEls: [],
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) {
      el._html = String(v);
      el.children = [];
      // 从 HTML 里认出可点行（data-todo="i"），合成对应节点供 querySelectorAll 返回 —— 
      // 这样「点击真的调 openEntry」是可真跑验证的，而不是只看字符串在不在。
      el._goEls = Array.from(String(v).matchAll(/data-todo="(\d+)"/g)).map((m) => {
        const e = mkEl('div'); e.dataset.todo = m[1]; e.className = 'todo-line go'; return e;
      });
    },
  });
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.querySelectorAll = (sel) => (sel === '.todo-line.go' ? el._goEls : []);
  return el;
}
const buildDoc = (els) => ({
  createElement: (t) => mkEl(t),
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => [],
});

/* ── B1. myToReviewRecords 真值表 ── */
console.log('\n═══ B1. myToReviewRecords 真值表（真跑）═══');
{
  const f = new Function('session', 'db', 'isMySubordinateRec',
    FN_REVIEW + '\nreturn myToReviewRecords;');
  const run = (role, records, subs) => f(
    { id: 'me', role: role },
    { records: records },
    (r) => (subs || []).includes(String(r.checkerName || '')),
  )().map((r) => r.id);

  const RECS = [
    { id: 'a', status: 'done', checkerId: 'me' },                          // ✅ 待复查
    { id: 'b', status: 'reviewed', checkerId: 'me' },                      // ❌ 已复查
    { id: 'c', status: 'unfinished', checkerId: 'me', type: '三违' },       // ❌ 未整改
    { id: 'd', status: 'done', checkerId: 'other' },                       // ❌ 别人的
    { id: 'e', status: 'done', checkerId: 'other', checkerName: '小王' },   // 经理：✅
    { id: 'f', status: 'done', checkerId: 'me', type: '三违', syncState: 'synced' },
  ];
  ck(JSON.stringify(run('公司管理', RECS)) === JSON.stringify(['a', 'f']),
    'B1 公司管理：只看自己巡查的 done（含已同步的 f）', JSON.stringify(run('公司管理', RECS)));
  ck(JSON.stringify(run('管理员', RECS)) === JSON.stringify(['a', 'f']),
    'B1 管理员：同口径（不看下属）', JSON.stringify(run('管理员', RECS)));
  ck(JSON.stringify(run('经理', RECS, ['小王'])) === JSON.stringify(['e']),
    'B1 经理：看**下属**报的 done（自己报的反而不算）', JSON.stringify(run('经理', RECS, ['小王'])));
  ck(run('公司管理', []).length === 0, 'B1 空记录不抛错');
  const f2 = new Function('session', 'db', 'isMySubordinateRec', FN_REVIEW + '\nreturn myToReviewRecords;');
  ck(f2(null, { records: [] }, () => false)().length === 0, 'B1 session 为空 → 空数组（不抛）');
  ck(f2({ id: 'me', role: '公司管理' }, null, () => false)().length === 0, 'B1 db 为空 → 空数组（不抛）');
}

/* ── B2. 角标 = 未闭环 + 待复查 ── */
console.log('\n═══ B2. refreshLedgerBadge 真跑 ═══');
{
  const badge = { n: null };
  const f = new Function('session', 'db', 'isMySubordinateRec', 'setBadge',
    FN_UNSYNCED + '\n' + FN_OPEN + '\n' + FN_REVIEW + '\n' + FN_BADGE +
    '\nreturn { refreshLedgerBadge, myOpenLoopedRecords, myToReviewRecords };');
  const h = f({ id: 'me', role: '管理员' }, { records: [
    { id: 'p1', status: 'unfinished', checkerId: 'me', type: '三违', syncState: 'synced' },   // 未闭环
    { id: 'p2', status: 'unfinished', checkerId: 'me', type: '三违', syncState: 'synced' },   // 未闭环
    { id: 'r1', status: 'done', checkerId: 'me', syncState: 'synced' },                       // 待复查
    { id: 'n1', status: 'unfinished', checkerId: 'me', type: '三违', syncState: 'unsynced' }, // 待上报（不算）
  ] }, () => false, (id, n) => { badge.id = id; badge.n = n; });
  h.refreshLedgerBadge();
  ck(badge.id === 'badge-checks', 'B2 写到 badge-checks');
  ck(badge.n === 3, 'B2 角标 = 未闭环 2 + 待复查 1 = 3（待上报的不算）', 'n=' + badge.n);
  ck(badge.n === h.myOpenLoopedRecords().length + h.myToReviewRecords().length,
    'B2 角标恒等于两个分组之和（页面上两组标签可核对）');
}

/* ── B3. renderTodoList：可点行真的能进「我的复查」 ── */
console.log('\n═══ B3. renderTodoList 真跑（含点击回调）═══');
{
  const todoEl = mkEl('div');
  const doc = buildDoc({ 'todo-list': todoEl });
  const calls = [];
  const f = new Function('document', 'openEntry', 'esc',
    SRC_TODO + '\nreturn { renderTodoList, set: (l) => { todoLines = l; }, get: () => todoLines };');
  const h = f(doc, (go) => calls.push(go), (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

  h.set([
    { t: '· 张三 骑车不戴头盔，尚未完成整改', go: 'my-checks' },
    { t: '· 有 1 条整改已提交，待复查', go: 'my-review' },
    { t: '· 纯文本行（无 go）' },
  ]);
  h.renderTodoList();
  ck(todoEl._goEls.length === 2, 'B3 只有带 go 的两行是可点节点', 'go=' + todoEl._goEls.length);
  ck(/待复查/.test(todoEl.innerHTML), 'B3 文案渲染出来了');
  ck(/查看 ›/.test(todoEl.innerHTML), 'B3 可点行带「查看 ›」提示');
  ck((todoEl.innerHTML.match(/todo-line go/g) || []).length === 2, 'B3 两行带 go class');

  todoEl._goEls[1].onclick();
  ck(JSON.stringify(calls) === JSON.stringify(['my-review']),
    'B3 点「待复查」那行 → openEntry("my-review")（本次修复的核心）', JSON.stringify(calls));
  todoEl._goEls[0].onclick();
  ck(calls[1] === 'my-checks', 'B3 点「尚未完成整改」那行 → 台账', calls[1]);

  h.set([]);
  h.renderTodoList();
  ck(/暂无待办，一切正常/.test(todoEl.innerHTML), 'B3 空列表回落「暂无待办」');
  ck(todoEl._goEls.length === 0, 'B3 空列表没有可点节点');
}

/* ── B4. renderMyChecks 三组分法（待复查组真的被渲染出来）── */
console.log('\n═══ B4. renderMyChecks 分组真跑 ═══');
{
  const run = async (records) => {
    const listEl = mkEl('div');
    const doc = buildDoc({ 'my-checks-list': listEl });
    const f = new Function(
      'document', 'session', 'db', 'isMySubordinateRec', 'setBadge', 'resetThumbObserver',
      'loadServerRecs', 'recordCard', 'serverRecCard', 'esc', 'serverRecsErr',
      // CF-WPS-92：renderMyChecks 新增了这两个调用（派发记录自动闭环 + 「已闭环」分组），
      // 用 new Function 真跑时必须注入，否则 ReferenceError。本用例只关心「待复查」分组，
      // 注入空实现即可（无 server 记录 ⇒ 已闭环组恒为空，不影响本用例断言）。
      'reconcileDispatchedClosures', 'myClosedDispatchedRecords',
      FN_UNSYNCED + '\n' + FN_OPEN + '\n' + FN_REVIEW + '\n' + FN_BADGE + '\n' + FN_RENDERCHECKS +
      '\nreturn renderMyChecks;');
    const render = f(doc, { id: 'me', role: '管理员' }, { records }, () => false, () => { },
      () => { }, async () => [], (r) => { const e = mkEl('div'); e.textContent = 'CARD:' + r.id; return e; },
      () => mkEl('div'), (s) => String(s), '', () => 0, () => []);
    await render();
    return listEl.children.filter((c) => c.className === 'section-label').map((c) => c.textContent);
  };

  const labels1 = await run([
    { id: 'p1', status: 'unfinished', checkerId: 'me', type: '三违', syncState: 'synced' },
    { id: 'r1', status: 'done', checkerId: 'me', syncState: 'synced' },
    { id: 'r2', status: 'done', checkerId: 'me', syncState: 'synced' },
  ]);
  ck(labels1.includes('未闭环（1）'), 'B4 渲染出「未闭环（1）」', JSON.stringify(labels1));
  ck(labels1.includes('待复查（2）'), 'B4 渲染出「待复查（2）」—— 修复前这一组根本不存在', JSON.stringify(labels1));
  ck(labels1.indexOf('未闭环（1）') < labels1.indexOf('待复查（2）'), 'B4 顺序：未闭环 在前');

  const labels2 = await run([
    { id: 'u1', status: 'done', checkerId: 'me', syncState: 'unsynced' },   // 待上报 + 待复查 边界
  ]);
  ck(labels2.includes('待上报（1）'), 'B4 未同步的 done 记录进「待上报」组', JSON.stringify(labels2));
  ck(!labels2.includes('待复查（1）'),
    'B4 **不重复列**：未同步的那条已在「待上报」组（两组按 syncState 严格二分）', JSON.stringify(labels2));

  const labels3 = await run([{ id: 'r3', status: 'done', checkerId: 'me', syncState: 'synced' }]);
  ck(labels3.length === 1 && labels3[0] === '待复查（1）',
    'B4 只有待复查时不会同时出现「暂无记录」', JSON.stringify(labels3));

  const labels4 = await run([]);
  ck(labels4.length === 0, 'B4 完全没记录 → 无分组标签（走空态）', JSON.stringify(labels4));
}

console.log(`\n--- ${pass} 通过 / ${bad} 失败 ---`);
process.exit(bad === 0 ? 0 : 1);
