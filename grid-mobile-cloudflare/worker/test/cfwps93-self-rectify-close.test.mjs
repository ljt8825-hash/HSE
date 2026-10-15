/* CF-WPS-93 —— 自己巡查开单、自己整改的记录，提交即闭环（不再要求自己复查自己）
 *
 * 用户原话：「自己整改，自己提交的，为什么要待复查」（附首页截图：
 *   「待办提醒 · 有 1 条整改已提交，待复查」）。
 *
 * 事实：建单确认页的「现在整改 / 稍后整改」两个按钮（btn-now / btn-later）
 *   都把 rectifierId 设成**建单人自己** ⇒ 「自建自改」是**默认主路径**，转派才是例外。
 *   而 submitRectify 一律置 status="done" ⇒ 自建自改的记录必然落进「待复查」，
 *   要本人再点一次「复查通过 · 闭环」—— 等于自己确认自己，纯多余。
 *   全文件只有 3 处写 status：reconcileDispatchedClosures / 复查按钮 / submitRectify。
 *
 * 本次改动：
 *   A. submitRectify：checkerId === session.id（我既是检查人又是整改人）→ 直接置 reviewed
 *      + closedAuto + closedAt，跳过 done ⇒ 不进「待复查」。
 *   B. 新增 reconcileSelfRectifiedClosures()：把**历史遗留**的「自建自改 done」也自动闭环
 *      （用户手上那条就是改动前产生的，不改就永远挂着）。
 *   C. statusChip：reviewed 只要带 closedAuto 就显示「已闭环」（我没点过复查，不写「已复查」）。
 *   D. myClosedDispatchedRecords 判据收紧到 rectifyMode === "transfer" —— 自建自改也带
 *      closedAuto 了，不能再拿它当判据，否则台账「已闭环（N）」组会混进自建记录。
 *
 * 保留的口径：checkerId ≠ 我的 done 记录**不**自动闭环（别人建的单、我整改的），
 *   该由检查人复查 —— 这是「复查」唯一还有意义的场景。
 *
 * Run: node worker/test/cfwps93-self-rectify-close.test.mjs
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
console.log('\n=== CF-WPS-93 · A. 静态接线：自建自改提交即闭环 ===\n');

console.log('═══ A1. submitRectify 的闭环判定 ═══');
{
  const f = extractFn('submitRectify') || '';
  ck(!!f, 'A1 submitRectify 已定义');
  ck(/const selfRectified = rectifying\.checkerId === session\.id/.test(f),
    'A1 判据 = checkerId === session.id（我既是检查人又是整改人）');
  ck(/rectifying\.status = selfRectified \? "reviewed" : "done"/.test(f),
    'A1 自建自改 → reviewed；其余仍走 done（保留复查场景）');
  ck(/if\(selfRectified\)\{ rectifying\.closedAuto = true/.test(f),
    'A1 自动闭环打 closedAuto 标记');
  ck(/rectifying\.rectifyTime = Date\.now\(\)/.test(f), 'A1 整改完成时间照记（不能因为闭环就丢）');
  ck(!/^\s*rectifying\.status = "done";\s*$/m.test(f),
    'A1 不再无条件置 done（原实现的第一行就是它）');
}

console.log('═══ A2. 历史遗留对账 ═══');
{
  const f = extractFn('reconcileSelfRectifiedClosures') || '';
  ck(!!f, 'A2 reconcileSelfRectifiedClosures 已定义');
  ck(/r\.status === "done" && r\.checkerId === session\.id/.test(f),
    'A2 只推进「done + 我建的」——别人建的单我整改的**不动**（该由检查人复查）');
  ck(/r\.status = "reviewed"/.test(f), 'A2 推进到 reviewed');
  ck(/r\.closedAuto = true/.test(f), 'A2 打来源标记');
  ck(/saveDB\(\)/.test(f) && /return pend\.length/.test(f), 'A2 有推进才写盘、返回条数');
  const hs = extractFn('refreshHomeStats') || '';
  ck(/reconcileSelfRectifiedClosures\(\)/.test(hs), 'A2 首页刷新时对账');
  const mc = extractFn('renderMyChecks') || '';
  const iRecon = mc.indexOf('reconcileSelfRectifiedClosures()');
  const iReview = mc.indexOf('myToReviewRecords()');
  ck(iRecon >= 0, 'A2 台账页也对账');
  ck(iRecon >= 0 && iReview > iRecon,
    'A2 ⚠️ 对账必须在算「待复查」分组**之前**（否则这一次渲染还会把它列出来）');
}

console.log('═══ A3. statusChip 文案 ═══');
{
  const f = extractFn('statusChip') || '';
  ck(/rec\.closedAuto === true \|\| rec\.rectifyMode === "transfer"/.test(f),
    'A3 带 closedAuto 的 reviewed → 「已闭环」（我没点过复查，不写「已复查」）');
  ck(/已闭环/.test(f) && /已复查/.test(f), 'A3 两种文案都在');
}

console.log('═══ A4. 台账「已闭环」组判据收紧 ═══');
{
  const f = extractFn('myClosedDispatchedRecords') || '';
  ck(/r\.rectifyMode === "transfer"/.test(f) && !/closedAuto/.test(f),
    'A4 只认 rectifyMode === "transfer"（自建自改也带 closedAuto，不能当判据）');
}

console.log('═══ A5. 版本自洽（≥ .92）与副本同步 ═══');
{
  const b = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!b, 'A5 hse-build 存在', b);
  ck(b === cfg && b === app, 'A5 三处版本一致', `${b} / ${cfg} / ${app}`);
  ck(!!b && b >= '2026-10-15.92', 'A5 版本 ≥ .92', b);
  const pb = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pb === b, 'A5 _pages_deploy 副本已同步', pb);
  ck(html === pagesHtml, 'A5 frontend 与 _pages_deploy 逐字节一致');
}

/* ══════════════════ §B 行为层真跑 ══════════════════ */
console.log('\n=== CF-WPS-93 · B. 真跑（submitRectify / 对账 / 口径互斥） ===\n');

const FN_SUBMIT = extractFn('submitRectify');
const FN_SELF = extractFn('reconcileSelfRectifiedClosures');
const FN_CHIP = extractFn('statusChip');
const FN_REVIEW = extractFn('myToReviewRecords');
const FN_CLOSED = extractFn('myClosedDispatchedRecords');
const FN_OPEN = extractFn('myOpenLoopedRecords');
const FN_UNSYNCED = extractFn('myUnsyncedRecords');

ck(!!FN_SUBMIT && !!FN_SELF && !!FN_CHIP && !!FN_REVIEW && !!FN_CLOSED,
  'B0 全部源码片段抽取成功',
  [FN_SUBMIT, FN_SELF, FN_CHIP, FN_REVIEW, FN_CLOSED].map((x) => (x ? 1 : 0)).join(''));

/* ── B1. submitRectify 真跑：自建自改 → reviewed ── */
console.log('\n═══ B1. submitRectify 真跑 ═══');
{
  // 让三个「照片/服务端」分支都不进：没有 fromServer、没有 afterPhoto、没有 serverRecordId
  const runSubmit = (rec, session) => {
    let saved = 0, doneView = null;
    const f = new Function('session', 'db', 'saveDB', 'showDone', 'rectifying',
      FN_SUBMIT + '\nreturn submitRectify;');
    // rectifying 是模块级变量，作为参数传入（函数内 rectifying = null 只改局部）
    f(session, { records: [] }, () => { saved++; }, (r, t) => { doneView = { no: r.no, title: t }; }, rec)();
    return { rec, saved, doneView };
  };

  const r1 = runSubmit({ id: 'a', no: 'SW001', type: '三违', checkerId: 'me', status: 'unfinished', rectifyMode: 'now' },
    { id: 'me', name: '测试人' });
  ck(r1.rec.status === 'reviewed', 'B1 自己建的单、自己整改 → 提交即 reviewed（不再待复查）', r1.rec.status);
  ck(r1.rec.closedAuto === true, 'B1 带 closedAuto 标记');
  ck(typeof r1.rec.closedAt === 'number' && r1.rec.closedAt > 0, 'B1 记了 closedAt');
  ck(typeof r1.rec.rectifyTime === 'number', 'B1 rectifyTime 照记（整改完成时间不能丢）');
  ck(r1.rec.rectifierId === 'me', 'B1 rectifierId 仍是整改人');
  ck(r1.saved === 1, 'B1 落盘一次', 'saved=' + r1.saved);
  ck(!!r1.doneView, 'B1 仍然走「整改完成」终屏', JSON.stringify(r1.doneView));

  // 别人建的单（转派给我整改）：不该自动闭环 —— 该由检查人复查
  const r2 = runSubmit({ id: 'b', no: 'SW002', type: '三违', checkerId: 'other', transferAdminId: 'me', status: 'unfinished' },
    { id: 'me', name: '测试人' });
  ck(r2.rec.status === 'done', 'B1 别人建的单我整改 → 仍是 done（保留「待复查」给检查人）', r2.rec.status);
  ck(r2.rec.closedAuto === undefined, 'B1 不打 closedAuto 标记');
}

/* ── B2. reconcileSelfRectifiedClosures 真跑 ── */
console.log('\n═══ B2. 历史遗留对账真跑 ═══');
{
  let saved = 0;
  const f = new Function('session', 'db', 'saveDB',
    FN_SELF + '\nreturn reconcileSelfRectifiedClosures;');
  const db = { records: [
    { id: 'a', status: 'done', checkerId: 'me' },                 // ✅ 自建自改 → 闭环
    { id: 'b', status: 'done', checkerId: 'other' },              // ❌ 别人建的单 → 留给检查人
    { id: 'c', status: 'done', checkerId: 'me', type: '三违' },    // ✅
    { id: 'd', status: 'unfinished', checkerId: 'me' },           // ❌ 还没整改
    { id: 'e', status: 'reviewed', checkerId: 'me' },             // ❌ 已闭环
    { id: 'f', status: 'transferred', checkerId: 'me' },          // ❌ 派发出去的（归 CF-WPS-92 管）
  ] };
  const rec = f({ id: 'me', role: '公司管理' }, db, () => { saved++; });

  const n1 = rec();
  ck(n1 === 2, 'B2 只推进 2 条（a / c：我建的 done）', 'n=' + n1);
  ck(db.records[0].status === 'reviewed' && db.records[0].closedAuto === true, 'B2 a → reviewed + closedAuto');
  ck(db.records[1].status === 'done', 'B2 b（别人建的单）**不动** —— 复查唯一还有意义的场景');
  ck(db.records[2].status === 'reviewed', 'B2 c → reviewed');
  ck(db.records[3].status === 'unfinished', 'B2 d 未整改 → 不动');
  ck(db.records[4].status === 'reviewed', 'B2 e 已闭环 → 不动');
  ck(db.records[5].status === 'transferred', 'B2 f 派发中的 → 不归本函数管');
  ck(saved === 1, 'B2 有推进才写盘一次', 'saved=' + saved);

  ck(rec() === 0 && saved === 1, 'B2 幂等：第二次返回 0、不再写盘');
  ck(f(null, { records: [] }, () => { })() === 0, 'B2 session 为空 → 0（不抛）');
  ck(f({ id: 'me' }, null, () => { })() === 0, 'B2 db 为空 → 0（不抛）');
  ck(f({ id: 'me' }, { records: [] }, () => { })() === 0, 'B2 无 done 记录 → 0（不抛）');
}

/* ── B3. 端到端：自建自改闭环后，不再出现在「待复查」── */
console.log('\n═══ B3. 端到端：闭环后不进「待复查」═══');
{
  const db = { records: [
    { id: 'a', status: 'done', checkerId: 'me', type: '三违', syncState: 'synced' },
    { id: 'b', status: 'done', checkerId: 'other', type: '三违', syncState: 'synced' },
  ] };
  const fReview = new Function('session', 'db', 'isMySubordinateRec', FN_REVIEW + '\nreturn myToReviewRecords;');
  const fSelf = new Function('session', 'db', 'saveDB', FN_SELF + '\nreturn reconcileSelfRectifiedClosures;');

  const before = fReview({ id: 'me', role: '公司管理' }, db, () => false)().map((r) => r.id);
  ck(JSON.stringify(before) === JSON.stringify(['a']),
    'B3 闭环前：自建的 a 在「待复查」里（用户截图里那条）', JSON.stringify(before));

  const n = fSelf({ id: 'me', role: '公司管理' }, db, () => { })();
  const after = fReview({ id: 'me', role: '公司管理' }, db, () => false)().map((r) => r.id);
  ck(n === 1, 'B3 对账推进 1 条', 'n=' + n);
  ck(after.length === 0,
    'B3 闭环后：首页「有 N 条整改已提交，待复查」不再出现（用户诉求达成）', JSON.stringify(after));

  // 且它要计入首页「已闭环」口径
  const settled = db.records.filter((r) => r.status === 'done' || r.status === 'reviewed').length;
  ck(settled === 2, 'B3 两条都算进首页「已闭环」卡', 'settled=' + settled);

  // 不该被挪进台账「已闭环（N）」组（那是派发闭环专用）
  const fClosed = new Function('session', 'db', FN_CLOSED + '\nreturn myClosedDispatchedRecords;');
  ck(fClosed({ id: 'me' }, db)().length === 0,
    'B3 自建自改的闭环记录**不**进台账「已闭环（N）」组（留在「已上报台账」里）');

  // 徽标文案
  const fChip = new Function(FN_CHIP + '\nreturn statusChip;');
  const chip = fChip();
  ck(/已闭环/.test(chip(db.records[0])), 'B3 徽标 = 「已闭环」');
  ck(!/已复查/.test(chip(db.records[0])), 'B3 **不写**「已复查」（我没点过复查）');
}

console.log(`\n--- ${pass} 通过 / ${bad} 失败 ---`);
process.exit(bad === 0 ? 0 : 1);
