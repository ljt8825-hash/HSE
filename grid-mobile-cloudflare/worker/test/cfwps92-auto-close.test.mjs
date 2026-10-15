/* CF-WPS-92 —— 派发出去的本机记录，整改人提交后**自动闭环**
 *
 * 用户要求（原话）：
 *   「我不想要派发后确认闭环，我想要的是派发后，整改人整改后，自动闭环。」
 *
 * 缺口（两条链路被混在一起看，才显得"没闭环"）：
 *   ① 派发链路（服务端）：公司管理 → 经理 → 管理员，终点是接收人整改完成，
 *      `/api/mobile/assign/complete` 把台账「整改状态」写成「已完成」—— 这一步本来就自动；
 *   ② 本机记录状态机：转派路径 makeRecord({rectifyMode:"transfer", status:"transferred"})
 *      之后，**全文件对 status 的写入只有两处**（submitRectify 置 done、复查按钮置 reviewed），
 *      没有任何代码把 transferred 推进去 ⇒ 本机那条永远停在「已转整改」；
 *   ③ 后果：首页「已闭环」卡口径 = 我建的三违里 done/reviewed 的 ⇒ 派出去的活整改完了，数字不涨；
 *      台账页也没有任何分组显示它（待上报要未同步、未闭环要 unfinished、待复查要 done）。
 *
 * 本次改动：
 *   A. reconcileDispatchedClosures() —— 服务端「已完成」→ 本机 transferred 自动置 reviewed（闭环终态）。
 *   B. serverDoneIdSet() —— 合并两个**已到手**的数据源（dispatched.done_records + patrol/records），不发新请求。
 *   C. myClosedDispatchedRecords() —— 「已闭环」分组口径。
 *   D. statusChip：reviewed 按 rectifyMode 区分「已闭环 / 已复查」（我没复查过就不写「已复查」）。
 *   E. 台账页新增「已闭环（N）」组，并从「已上报台账」里排除同一条（避免同一条出现两次）。
 *   F. 三个触发点：refreshHomeStats 开头 / refreshDispatchBadge 末尾 / renderDispatch、renderMyChecks 拿到数据后。
 *
 * Run: node worker/test/cfwps92-auto-close.test.mjs
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

/* ══════════════════ §A 静态接线 ══════════════════ */
console.log('\n=== CF-WPS-92 · A. 静态接线：自动闭环 + 台账分组 + 触发点 ===\n');

console.log('═══ A1. 自动闭环核心 ═══');
{
  const f = extractFn('reconcileDispatchedClosures') || '';
  ck(!!f, 'A1 reconcileDispatchedClosures 已定义');
  ck(/r\.status === "transferred" && r\.serverRecordId/.test(f),
    'A1 只对「已转整改 + 有 serverRecordId」的本机记录动手');
  ck(/r\.status = "reviewed"/.test(f), 'A1 推进到 reviewed（闭环终态）');
  ck(/closedAuto = true/.test(f), 'A1 打来源标记 closedAuto（区分"自动"与"手动复查"）');
  ck(/if\(n\) saveDB\(\)/.test(f), 'A1 有推进才写盘（幂等，不反复写 localStorage）');
  ck(/return n/.test(f), 'A1 返回推进条数（调用方据此决定要不要重算首页）');
  ck(/serverDoneIdSet\(\)/.test(f), 'A1 判据来自服务端已完成集合');
}

console.log('═══ A2. 服务端已完成集合（两个来源合并，不发新请求）═══');
{
  const f = extractFn('serverDoneIdSet') || '';
  ck(!!f, 'A2 serverDoneIdSet 已定义');
  ck(/_srv && r\._srv\.record_id/.test(f), 'A2 来源①：dispatched 的 done_records（_srv.record_id）');
  ck(/x\.todo_status === "已完成"/.test(f), 'A2 来源②：patrol/records 台账列表（带 todo_status）');
  ck(/new Set\(\)/.test(f), 'A2 用 Set 去重（同一条可能两个来源都有）');
  ck(!/mobileApi|fetch\(/.test(f), 'A2 不额外发请求（只用已到手的数据）');
}

console.log('═══ A3. 「已闭环」分组口径 ═══');
{
  const f = extractFn('myClosedDispatchedRecords') || '';
  ck(!!f, 'A3 myClosedDispatchedRecords 已定义');
  ck(/r\.status === "reviewed"/.test(f), 'A3 判据 = reviewed');
  ck(/closedAuto === true \|\| r\.rectifyMode === "transfer"/.test(f),
    'A3 只认「自动闭环的」或「转派的」——自建记录手动复查不算派发闭环');
  // 与「待复查」严格互斥
  const rev = extractFn('myToReviewRecords') || '';
  ck(/r\.status === "done"/.test(rev) && /r\.status === "reviewed"/.test(f),
    'A3 与待复查互斥：待复查要 done、已闭环要 reviewed，同一条不可能两边都出现');
}

console.log('═══ A4. statusChip 文案区分 ═══');
{
  const f = extractFn('statusChip') || '';
  ck(/rec\.rectifyMode === "transfer"/.test(f), 'A4 reviewed 按 rectifyMode 分支');
  ck(/已闭环/.test(f) && /已复查/.test(f), 'A4 转派的显示「已闭环」，自建的显示「已复查」');
  ck(/transferred/.test(f) && /已转整改/.test(f), 'A4 transferred 仍是「已转整改」（未闭环时不该谎报闭环）');
}

console.log('═══ A5. 台账页新增「已闭环」组 + 去重 ═══');
{
  const mc = extractFn('renderMyChecks') || '';
  ck(/reconcileDispatchedClosures\(\)/.test(mc), 'A5 台账拿到服务端数据后先对账再渲染');
  ck(/const closed = myClosedDispatchedRecords\(\)/.test(mc), 'A5 计算「已闭环」分组');
  ck(/"已闭环（" \+ closed\.length \+ "）"/.test(mc), 'A5 分组标签写「已闭环（N）」');
  ck(/closed\.forEach\(r => el\.appendChild\(recordCard\(r/.test(mc), 'A5 用本机 recordCard 渲染');
  ck(/closedIds/.test(mc) && /srvList/.test(mc), 'A5 服务端列表按 closedIds 过滤（同一条不出现两次）');
  ck(/!closed\.length && !srvList\.length/.test(mc), 'A5 空态判定把新分组算进去');
  // 顺序：本机三组 → 已闭环 → 已上报台账
  const iRev = mc.indexOf('"待复查（"');
  const iClosed = mc.indexOf('"已闭环（"');
  const iSrv = mc.indexOf('"已上报台账（"');
  ck(iRev >= 0 && iClosed > iRev && iSrv > iClosed, 'A5 分组顺序：待复查 → 已闭环 → 已上报台账');
}

console.log('═══ A6. 三个触发点 ═══');
{
  const hs = extractFn('refreshHomeStats') || '';
  ck(/^\s*\/\*[\s\S]{0,400}?\*\/\s*reconcileDispatchedClosures\(\);/.test(hs) || /reconcileDispatchedClosures\(\);/.test(hs.split('\n').slice(0, 12).join('\n')),
    'A6 refreshHomeStats 开头对账（用缓存数据兜底）');
  const db2 = extractFn('refreshDispatchBadge') || '';
  ck(/await loadDispatched\(false\)/.test(db2), 'A6 refreshDispatchBadge 仍会拉派发数据');
  ck(/if\(reconcileDispatchedClosures\(\)\) refreshHomeStats\(\)/.test(db2),
    'A6 有推进才重算首页（第二次进来 n=0，不会递归）');
  ck(!/inboxDispatchPending\); return;/.test(db2), 'A6 缓存命中不再提前 return（否则永远不对账）');
  const rd = extractFn('renderDispatch') || '';
  ck(/await loadDispatched\(true\)[\s\S]{0,200}?reconcileDispatchedClosures\(\)/.test(rd),
    'A6 派发记录页拿到「已完成」后对账');
}

console.log('═══ A7. 版本自洽（≥ .91）与副本同步 ═══');
{
  const b = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!b, 'A7 hse-build 存在', b);
  ck(b === cfg && b === app, 'A7 三处版本一致', `${b} / ${cfg} / ${app}`);
  ck(!!b && b >= '2026-10-15.91', 'A7 版本 ≥ .91', b);
  const pb = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pb === b, 'A7 _pages_deploy 副本已同步', pb);
  ck(html === pagesHtml, 'A7 frontend 与 _pages_deploy 逐字节一致');
}

/* ══════════════════ §B 行为层真跑 ══════════════════ */
console.log('\n=== CF-WPS-92 · B. 真跑（已完成集合 / 对账 / 分组口径 / 状态文案） ===\n');

const FN_DONESET = extractFn('serverDoneIdSet');
const FN_RECON = extractFn('reconcileDispatchedClosures');
const FN_CLOSED = extractFn('myClosedDispatchedRecords');
const FN_CHIP = extractFn('statusChip');
const FN_UNSYNCED = extractFn('myUnsyncedRecords');
const FN_OPEN = extractFn('myOpenLoopedRecords');
const FN_REVIEW = extractFn('myToReviewRecords');
const FN_BADGE = extractFn('refreshLedgerBadge');
const FN_RENDERCHECKS = extractFn('renderMyChecks');

ck(!!FN_DONESET && !!FN_RECON && !!FN_CLOSED && !!FN_CHIP && !!FN_UNSYNCED && !!FN_OPEN && !!FN_REVIEW && !!FN_BADGE && !!FN_RENDERCHECKS,
  'B0 全部源码片段抽取成功',
  [FN_DONESET, FN_RECON, FN_CLOSED, FN_CHIP, FN_UNSYNCED, FN_OPEN, FN_REVIEW, FN_BADGE, FN_RENDERCHECKS].map((x) => (x ? 1 : 0)).join(''));

/* ── 最小 DOM 桩 ── */
function mkEl(tag) {
  const el = {
    tagName: tag, className: '', id: '', style: {}, dataset: {}, children: [],
    textContent: '', onclick: null, _html: '', _goEls: [],
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); el.children = []; el._goEls = []; },
  });
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.querySelectorAll = () => [];
  return el;
}
const buildDoc = (els) => ({
  createElement: (t) => mkEl(t),
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => [],
});

/* ── B1. serverDoneIdSet 真值表 ── */
console.log('\n═══ B1. serverDoneIdSet 真跑（两源合并 + 去重）═══');
{
  const f = new Function('dispatchDoneRecs', 'serverRecs', FN_DONESET + '\nreturn serverDoneIdSet;');
  const s1 = f(
    [{ _srv: { record_id: 'r1' } }, { _srv: { record_id: 'r2' } }, { _srv: {} }, null],
    [{ record_id: 'r3', todo_status: '已完成' }, { record_id: 'r4', todo_status: '待整改' }],
  )();
  ck(s1 instanceof Set, 'B1 返回 Set');
  ck(s1.has('r1') && s1.has('r2'), 'B1 来源① dispatched 的 done_records 全部计入');
  ck(s1.has('r3'), 'B1 来源② 台账里 todo_status === "已完成" 的计入');
  ck(!s1.has('r4'), 'B1 台账里「待整改」的**不**计入（绝不误关）');
  ck(s1.size === 3, 'B1 只收已完成的 3 条', 'size=' + s1.size);

  const s2 = f([{ _srv: { record_id: 'dup' } }], [{ record_id: 'dup', todo_status: '已完成' }])();
  ck(s2.size === 1, 'B1 两个来源都有同一条 → 去重（不会重复）', 'size=' + s2.size);

  const s3 = f(null, null)();
  ck(s3 instanceof Set && s3.size === 0, 'B1 两源都为空 → 空集合（不抛）');
}

/* ── B2. reconcileDispatchedClosures 真跑 ── */
console.log('\n═══ B2. reconcileDispatchedClosures 真跑（自动闭环 + 幂等 + 不误关）═══');
{
  const mkRecs = () => ([
    // ① 派出去、服务端已完成 → 应自动闭环
    { id: 'a', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r1', syncState: 'synced' },
    // ② 派出去、服务端**还没**完成 → 不动
    { id: 'b', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r2', syncState: 'synced' },
    // ③ 派出去但还没上报成功（无 serverRecordId）→ 不动
    { id: 'c', status: 'transferred', rectifyMode: 'transfer', serverRecordId: '', syncState: 'pending' },
    // ④ 自己建的单，还没派 → 不动
    { id: 'd', status: 'unfinished', serverRecordId: 'r4', syncState: 'synced' },
    // ⑤ 自己整改完待复查 → 不动（它归「待复查」组）
    { id: 'e', status: 'done', checkerId: 'me', serverRecordId: 'r5', syncState: 'synced' },
  ]);
  let saved = 0;
  const f = new Function('session', 'db', 'saveDB', 'dispatchDoneRecs', 'serverRecs',
    FN_DONESET + '\n' + FN_RECON + '\nreturn reconcileDispatchedClosures;');

  const db = { records: mkRecs() };
  const rec = f({ id: 'me', role: '经理' }, db, () => { saved++; },
    [{ _srv: { record_id: 'r1' } }], [{ record_id: 'r5', todo_status: '已完成' }]);

  const n1 = rec();
  ck(n1 === 1, 'B2 只推进 1 条（服务端已完成的 a）', 'n=' + n1);
  ck(db.records[0].status === 'reviewed', 'B2 a 自动变成 reviewed（闭环终态）');
  ck(db.records[0].closedAuto === true, 'B2 a 带 closedAuto 标记（来源可追溯）');
  ck(typeof db.records[0].closedAt === 'number' && db.records[0].closedAt > 0, 'B2 a 记了 closedAt 时间');
  ck(db.records[1].status === 'transferred', 'B2 b 服务端未完成 → **不误关**');
  ck(db.records[2].status === 'transferred', 'B2 c 没 serverRecordId → 不动（未上报的不能关）');
  ck(db.records[3].status === 'unfinished', 'B2 d 自己没派出去的单 → 不动');
  ck(db.records[4].status === 'done', 'B2 e 待复查的 done → 不动（不能被闭环吃掉）');
  ck(saved === 1, 'B2 有推进才写盘一次', 'saved=' + saved);

  const n2 = rec();
  ck(n2 === 0, 'B2 幂等：第二次跑返回 0（a 已不是 transferred）', 'n=' + n2);
  ck(saved === 1, 'B2 幂等：第二次不再写盘', 'saved=' + saved);

  // 服务端一条都没完成 → 一条都不动
  const db2 = { records: mkRecs() };
  const rec2 = f({ id: 'me', role: '经理' }, db2, () => { saved++; }, [], []);
  ck(rec2() === 0 && db2.records[0].status === 'transferred', 'B2 服务端无已完成数据 → 一条都不关');

  // 空输入不抛
  ck(f(null, { records: [] }, () => { }, [], [])() === 0, 'B2 session 为空 → 0（不抛）');
  ck(f({ id: 'me' }, null, () => { }, [], [])() === 0, 'B2 db 为空 → 0（不抛）');
}

/* ── B3. myClosedDispatchedRecords 真值表 ── */
console.log('\n═══ B3. myClosedDispatchedRecords 真跑 ═══');
{
  const f = new Function('session', 'db', FN_CLOSED + '\nreturn myClosedDispatchedRecords;');
  const run = (records) => f({ id: 'me', role: '经理' }, { records })().map((r) => r.id);
  const RECS = [
    { id: 'a', status: 'reviewed', rectifyMode: 'transfer', serverRecordId: 'r1', closedAuto: true }, // ✅ 自动闭环
    { id: 'b', status: 'reviewed', rectifyMode: 'transfer', serverRecordId: 'r2' },                   // ✅ 转派+已闭环
    { id: 'c', status: 'reviewed', serverRecordId: 'r3' },                                            // ❌ 自建手动复查
    { id: 'd', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r4' },                // ❌ 还没闭环
    { id: 'e', status: 'reviewed', rectifyMode: 'transfer', serverRecordId: '' },                     // ❌ 没 serverRecordId
  ];
  ck(JSON.stringify(run(RECS)) === JSON.stringify(['a', 'b']),
    'B3 只收「转派 + reviewed」，自建手动复查(c)与未闭环(d)都不算', JSON.stringify(run(RECS)));
  ck(run([]).length === 0, 'B3 空记录不抛错');
  ck(f(null, { records: [] })().length === 0, 'B3 session 为空 → 空数组（不抛）');
}

/* ── B4. statusChip 真跑 ── */
console.log('\n═══ B4. statusChip 真跑（文案不撒谎）═══');
{
  const f = new Function(FN_CHIP + '\nreturn statusChip;');
  const chip = f();
  ck(/已闭环/.test(chip({ status: 'reviewed', rectifyMode: 'transfer' })), 'B4 转派+reviewed → 「已闭环」');
  ck(/已复查/.test(chip({ status: 'reviewed' })), 'B4 自建+reviewed → 「已复查」');
  ck(!/已复查/.test(chip({ status: 'reviewed', rectifyMode: 'transfer' })),
    'B4 自动闭环的**不写**「已复查」（我没复查过，写它等于撒谎）');
  ck(/已转整改/.test(chip({ status: 'transferred', rectifyMode: 'transfer' })), 'B4 transferred → 「已转整改」');
  ck(/未完成/.test(chip({ status: 'unfinished' })), 'B4 unfinished → 「未完成」');
  ck(/已完成/.test(chip({ status: 'done' })), 'B4 done → 「已完成」');
}

/* ── B5. renderMyChecks 分组真跑（已闭环组 + 服务端去重）── */
console.log('\n═══ B5. renderMyChecks 分组真跑 ═══');
{
  const run = async (records, srvList, role = '管理员') => {
    const listEl = mkEl('div');
    const doc = buildDoc({ 'my-checks-list': listEl });
    const f = new Function(
      'document', 'session', 'db', 'isMySubordinateRec', 'setBadge', 'resetThumbObserver',
      'loadServerRecs', 'recordCard', 'serverRecCard', 'esc', 'serverRecsErr',
      'dispatchDoneRecs', 'serverRecs', 'saveDB',
      FN_DONESET + '\n' + FN_RECON + '\n' + FN_CLOSED + '\n' + FN_UNSYNCED + '\n' + FN_OPEN + '\n' + FN_REVIEW + '\n' + FN_BADGE + '\n' + FN_RENDERCHECKS +
      '\nreturn renderMyChecks;');
    const render = f(doc, { id: 'me', role }, { records }, () => false, () => { },
      () => { }, async () => srvList, (r) => { const e = mkEl('div'); e.textContent = 'CARD:' + r.id; return e; },
      (x) => { const e = mkEl('div'); e.textContent = 'SRV:' + x.record_id; return e; }, (s) => String(s), '',
      [], srvList, () => { });
    await render();
    return {
      labels: listEl.children.filter((c) => c.className === 'section-label').map((c) => c.textContent),
      cards: listEl.children.filter((c) => c.className !== 'section-label').map((c) => c.textContent),
    };
  };

  // ① 派发记录：本机 transferred + 服务端已完成 → 自动闭环，且服务端列表里的同一条被排除
  const r1 = await run(
    [{ id: 'a', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r1', syncState: 'synced' }],
    [{ record_id: 'r1', todo_status: '已完成' }],
  );
  ck(r1.labels.includes('已闭环（1）'), 'B5 渲染出「已闭环（1）」', JSON.stringify(r1.labels));
  ck(!r1.labels.some((l) => l.startsWith('已上报台账')),
    'B5 服务端列表里的同一条被排除（不出现「已上报台账（1）」）', JSON.stringify(r1.labels));
  ck(r1.cards.includes('CARD:a'), 'B5 已闭环组里就是那条本机记录');
  ck(!r1.cards.some((c) => c.startsWith('SRV:')), 'B5 没有重复的服务端卡片');

  // ② 服务端另有一条不相关的 → 只排除同一条，其余照旧
  const r2 = await run(
    [{ id: 'a', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r1', syncState: 'synced' }],
    [{ record_id: 'r1', todo_status: '已完成' }, { record_id: 'r9', todo_status: '待整改' }],
  );
  ck(r2.labels.includes('已闭环（1）'), 'B5 已闭环（1）', JSON.stringify(r2.labels));
  ck(r2.labels.includes('已上报台账（1）'), 'B5 只排除同一条，其余仍在已上报台账', JSON.stringify(r2.labels));
  ck(r2.cards.includes('SRV:r9') && !r2.cards.includes('SRV:r1'), 'B5 排除的只有 r1');

  // ③ 服务端还没完成 → 不闭环，台账里仍是「已上报台账」
  const r3 = await run(
    [{ id: 'a', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r1', syncState: 'synced' }],
    [{ record_id: 'r1', todo_status: '待整改' }],
  );
  ck(!r3.labels.some((l) => l.startsWith('已闭环')), 'B5 服务端未完成 → 不闭环', JSON.stringify(r3.labels));
  ck(r3.labels.includes('已上报台账（1）'), 'B5 仍在「已上报台账」里', JSON.stringify(r3.labels));

  // ④ 与 CF-WPS-91 的「待复查」共存，互不串组
  const r4 = await run(
    [
      { id: 'a', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r1', syncState: 'synced' },
      { id: 'e', status: 'done', checkerId: 'me', serverRecordId: 'r5', syncState: 'synced' },
    ],
    [{ record_id: 'r1', todo_status: '已完成' }],
  );
  ck(r4.labels.includes('已闭环（1）') && r4.labels.includes('待复查（1）'),
    'B5 已闭环 与 待复查 同时存在、各归各的组', JSON.stringify(r4.labels));
  ck(r4.labels.indexOf('待复查（1）') < r4.labels.indexOf('已闭环（1）'), 'B5 顺序：待复查 在前');

  // ⑤ 全空 → 空态
  const r5 = await run([], []);
  ck(r5.labels.length === 0, 'B5 完全没记录 → 无分组标签（走空态）', JSON.stringify(r5.labels));
}

/* ── B6. 端到端：自动闭环后，首页「已闭环」口径把它算进去 ── */
console.log('\n═══ B6. 端到端：自动闭环 → 首页「已闭环」+1 ═══');
{
  // 首页「已闭环」卡的口径 = myChecks() 里 status 是 done/reviewed 的（refreshHomeStats 内联）
  const hs = extractFn('refreshHomeStats') || '';
  ck(/const done = mine\.filter\(r => r\.status === "done" \|\| r\.status === "reviewed"\)/.test(hs),
    'B6 首页「已闭环」口径 = done | reviewed');

  const db = { records: [
    { id: 'a', status: 'transferred', rectifyMode: 'transfer', serverRecordId: 'r1', syncState: 'synced', checkerId: 'me', type: '三违' },
  ] };
  const f = new Function('session', 'db', 'saveDB', 'dispatchDoneRecs', 'serverRecs',
    FN_DONESET + '\n' + FN_RECON + '\nreturn reconcileDispatchedClosures;');
  const rec = f({ id: 'me', role: '经理' }, db, () => { }, [{ _srv: { record_id: 'r1' } }], []);

  const before = db.records.filter((r) => r.status === 'done' || r.status === 'reviewed').length;
  rec();
  const after = db.records.filter((r) => r.status === 'done' || r.status === 'reviewed').length;
  ck(before === 0, 'B6 闭环前：派发出去的记录不计入「已闭环」', 'before=' + before);
  ck(after === 1, 'B6 自动闭环后：「已闭环」+1（用户要的"自动闭环"）', 'after=' + after);

  // 且它不该跑进「待复查」（否则会反过来要求经理点确认 —— 与用户诉求相反）
  const fr = new Function('session', 'db', 'isMySubordinateRec', FN_REVIEW + '\nreturn myToReviewRecords;');
  const toReview = fr({ id: 'me', role: '经理' }, db, () => false)();
  ck(toReview.length === 0, 'B6 自动闭环的记录**不**进「待复查」（不会要求派发方点确认）', 'n=' + toReview.length);
}

console.log(`\n--- ${pass} 通过 / ${bad} 失败 ---`);
process.exit(bad === 0 ? 0 : 1);
