/* CF-WPS-93 —— 整改人提交整改 = 直接闭环，全流程取消「待复查」
 *
 * 用户两轮原话：
 *   ① 「自己整改，自己提交的，为什么要待复查」（附首页截图：
 *      「待办提醒 · 有 1 条整改已提交，待复查」）
 *   ② 「别人开单转派，只要整改人提交了整改照片，不需要待复查，直接闭环」
 *
 * 为什么提交就等于闭环：提交按钮（#btn-submit-after）**只有在拍完整改后照片之后**才可点
 *   （#btn-submit-rectify 是 disabled 占位）⇒「提交」本身就等于「现场已整改 + 照片已拍」。
 *   现场已经改完、照片就在整改人手机上，再让开单人点一次「复查通过」不产生任何新信息。
 *   所以**不再区分** checkerId 是不是我（自建自改 / 别人开单转派给我，一律闭环）。
 *
 * 本次改动：
 *   A. submitRectify：无条件置 reviewed + closedAuto + closedAt，跳过 done。
 *   B. reconcileDoneClosures()（原 reconcileSelfRectifiedClosures 改名并放宽）：
 *      把**历史遗留**的 done 记录一律自动闭环（提交不再产生 done ⇒ 任何 done 都是存量）。
 *   C. statusChip：reviewed 带 closedAuto / rectifyMode==="transfer" → 「已闭环」。
 *   D. myClosedDispatchedRecords 判据 = rectifyMode === "transfer" —— 台账「已闭环（N）」
 *      只认派发闭环，自建自改 / 转派整改的记录仍留在「已上报台账」。
 *
 * 连带后果（已在源码注释里写明）：`done` 不再产生 ⇒ 复查按钮不再有记录可显示；
 *   「待复查」入口 / 分组 / 首页待办行在无数据时全部自动隐藏（不占位、不留死 UI）。
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
console.log('\n=== CF-WPS-93 · A. 静态接线：提交一律闭环 ===\n');

console.log('═══ A1. submitRectify 的闭环判定 ═══');
{
  const f = extractFn('submitRectify') || '';
  ck(!!f, 'A1 submitRectify 已定义');
  ck(/rectifying\.status = "reviewed";/.test(f),
    'A1 提交一律置 reviewed（自建自改 / 别人转派，不再区分）');
  ck(!/selfRectified/.test(f),
    'A1 已移除 checkerId 分支（转派来的也直接闭环 —— 用户明确要求）');
  ck(/rectifying\.closedAuto = true/.test(f), 'A1 自动闭环打 closedAuto 标记');
  ck(/rectifying\.closedAt = Date\.now\(\)/.test(f), 'A1 记闭环时间');
  ck(/rectifying\.rectifyTime = Date\.now\(\)/.test(f), 'A1 整改完成时间照记（不能因为闭环就丢）');
  ck(!/rectifying\.status = "done"/.test(f), 'A1 不再有任何路径置 done（待复查这一步已取消）');
}

console.log('═══ A2. 历史遗留对账 ═══');
{
  const f = extractFn('reconcileDoneClosures') || '';
  ck(!!f, 'A2 reconcileDoneClosures 已定义');
  ck(/r\.status === "done"/.test(f) && !/checkerId === session\.id/.test(f),
    'A2 推进**所有** done（不再限定 checkerId —— 转派来的同样闭环）');
  ck(/r\.status = "reviewed"/.test(f), 'A2 推进到 reviewed');
  ck(/r\.closedAuto = true/.test(f), 'A2 打来源标记');
  ck(/saveDB\(\)/.test(f) && /return pend\.length/.test(f), 'A2 有推进才写盘、返回条数');
  const hs = extractFn('refreshHomeStats') || '';
  ck(/reconcileDoneClosures\(\)/.test(hs), 'A2 首页刷新时对账');
  const mc = extractFn('renderMyChecks') || '';
  const iRecon = mc.indexOf('reconcileDoneClosures()');
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
  ck(/已闭环/.test(f) && /已复查/.test(f), 'A3 两种文案都在（「已复查」只剩存量数据）');
}

console.log('═══ A4. 台账「已闭环」组判据收紧 ═══');
{
  const f = extractFn('myClosedDispatchedRecords') || '';
  ck(/r\.rectifyMode === "transfer"/.test(f) && !/closedAuto/.test(f),
    'A4 只认 rectifyMode === "transfer"（自建自改/转派整改也带 closedAuto，不能当判据）');
}

console.log('═══ A5. 版本自洽（≥ .93）与副本同步 ═══');
{
  const b = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!b, 'A5 hse-build 存在', b);
  ck(b === cfg && b === app, 'A5 三处版本一致', `${b} / ${cfg} / ${app}`);
  ck(!!b && b >= '2026-10-15.93', 'A5 版本 ≥ .93', b);
  const pb = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pb === b, 'A5 _pages_deploy 副本已同步', pb);
  ck(html === pagesHtml, 'A5 frontend 与 _pages_deploy 逐字节一致');
}

/* ══════════════════ §B 行为层真跑 ══════════════════ */
console.log('\n=== CF-WPS-93 · B. 真跑（submitRectify / 对账 / 口径互斥） ===\n');

const FN_SUBMIT = extractFn('submitRectify');
const FN_DONE = extractFn('reconcileDoneClosures');
const FN_CHIP = extractFn('statusChip');
const FN_REVIEW = extractFn('myToReviewRecords');
const FN_CLOSED = extractFn('myClosedDispatchedRecords');

ck(!!FN_SUBMIT && !!FN_DONE && !!FN_CHIP && !!FN_REVIEW && !!FN_CLOSED,
  'B0 全部源码片段抽取成功',
  [FN_SUBMIT, FN_DONE, FN_CHIP, FN_REVIEW, FN_CLOSED].map((x) => (x ? 1 : 0)).join(''));

/* ── B1. submitRectify 真跑 ── */
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
  ck(r1.rec.status === 'reviewed', 'B1 自己建的单、自己整改 → 提交即 reviewed', r1.rec.status);
  ck(r1.rec.closedAuto === true, 'B1 带 closedAuto 标记');
  ck(typeof r1.rec.closedAt === 'number' && r1.rec.closedAt > 0, 'B1 记了 closedAt');
  ck(typeof r1.rec.rectifyTime === 'number', 'B1 rectifyTime 照记（整改完成时间不能丢）');
  ck(r1.rec.rectifierId === 'me', 'B1 rectifierId 仍是整改人');
  ck(r1.saved === 1, 'B1 落盘一次', 'saved=' + r1.saved);
  ck(!!r1.doneView, 'B1 仍然走「整改完成」终屏', JSON.stringify(r1.doneView));

  // 别人开单转派给我整改（用户第二轮明确要求：也直接闭环）
  const r2 = runSubmit({ id: 'b', no: 'SW002', type: '三违', checkerId: 'other', transferAdminId: 'me', status: 'unfinished' },
    { id: 'me', name: '测试人' });
  ck(r2.rec.status === 'reviewed', 'B1 别人开单转派给我 → **也直接闭环**（不再待复查）', r2.rec.status);
  ck(r2.rec.closedAuto === true, 'B1 同样打 closedAuto 标记');
  ck(r2.rec.rectifierId === 'me', 'B1 整改人仍记成我（照片是我拍的）');

  // 服务端派发壳记录（fromServer）—— status 写入对本机统计无影响，但不能抛
  const r3 = runSubmit({ id: 'srv_x', no: 'SW003', type: '三违', fromServer: true,
    serverRecordId: 'recX', todoStatus: '待整改', status: 'transferred' }, { id: 'me', name: '测试人' });
  ck(r3.rec.status === 'reviewed', 'B1 服务端派发壳（fromServer）也不抛、照常置 reviewed', r3.rec.status);
}

/* ── B2. reconcileDoneClosures 真跑 ── */
console.log('\n═══ B2. 历史遗留对账真跑 ═══');
{
  let saved = 0;
  const f = new Function('session', 'db', 'saveDB',
    FN_DONE + '\nreturn reconcileDoneClosures;');
  const db = { records: [
    { id: 'a', status: 'done', checkerId: 'me' },                 // ✅ 我建的 → 闭环
    { id: 'b', status: 'done', checkerId: 'other' },              // ✅ 别人建的单 → **也闭环**（CF-WPS-93 第二轮）
    { id: 'c', status: 'done', checkerId: 'me', type: '三违' },    // ✅
    { id: 'd', status: 'unfinished', checkerId: 'me' },           // ❌ 还没整改
    { id: 'e', status: 'reviewed', checkerId: 'me' },             // ❌ 已闭环
    { id: 'f', status: 'transferred', checkerId: 'me' },          // ❌ 派发中的（归 CF-WPS-92 管）
  ] };
  const rec = f({ id: 'me', role: '公司管理' }, db, () => { saved++; });

  const n1 = rec();
  ck(n1 === 3, 'B2 推进 3 条（a / b / c：所有 done）', 'n=' + n1);
  ck(db.records[0].status === 'reviewed' && db.records[0].closedAuto === true, 'B2 a → reviewed + closedAuto');
  ck(db.records[1].status === 'reviewed' && db.records[1].closedAuto === true,
    'B2 b（别人建的单）**也**闭环 —— 待复查已取消');
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

/* ── B3. 端到端：闭环后不再出现在「待复查」── */
console.log('\n═══ B3. 端到端：闭环后不进「待复查」═══');
{
  const db = { records: [
    { id: 'a', status: 'done', checkerId: 'me', type: '三违', syncState: 'synced' },
    { id: 'b', status: 'done', checkerId: 'other', type: '三违', syncState: 'synced' },
  ] };
  const fReview = new Function('session', 'db', 'isMySubordinateRec', FN_REVIEW + '\nreturn myToReviewRecords;');
  const fDone = new Function('session', 'db', 'saveDB', FN_DONE + '\nreturn reconcileDoneClosures;');

  const before = fReview({ id: 'me', role: '公司管理' }, db, () => false)().map((r) => r.id);
  ck(JSON.stringify(before) === JSON.stringify(['a']),
    'B3 闭环前：自建的 a 在「待复查」里（用户截图里那条）', JSON.stringify(before));

  const n = fDone({ id: 'me', role: '公司管理' }, db, () => { })();
  const after = fReview({ id: 'me', role: '公司管理' }, db, () => false)().map((r) => r.id);
  ck(n === 2, 'B3 对账推进 2 条（a 和 b 都是 done）', 'n=' + n);
  ck(after.length === 0,
    'B3 闭环后：「有 N 条整改已提交，待复查」不再出现（用户诉求达成）', JSON.stringify(after));

  // 且两条都计入首页「已闭环」口径
  const settled = db.records.filter((r) => r.status === 'done' || r.status === 'reviewed').length;
  ck(settled === 2, 'B3 两条都算进首页「已闭环」卡', 'settled=' + settled);

  // 不该被挪进台账「已闭环（N）」组（那是派发闭环专用）
  const fClosed = new Function('session', 'db', FN_CLOSED + '\nreturn myClosedDispatchedRecords;');
  ck(fClosed({ id: 'me' }, db)().length === 0,
    'B3 闭环记录**不**进台账「已闭环（N）」组（留在「已上报台账」里）');

  // 徽标文案
  const fChip = new Function(FN_CHIP + '\nreturn statusChip;');
  const chip = fChip();
  ck(/已闭环/.test(chip(db.records[0])), 'B3 徽标 = 「已闭环」');
  ck(!/已复查/.test(chip(db.records[0])), 'B3 **不写**「已复查」（我没点过复查）');
}

console.log(`\n--- ${pass} 通过 / ${bad} 失败 ---`);
process.exit(bad === 0 ? 0 : 1);
