/* CF-WPS-88 —— 台账详情「照片不显示」修复回归（纯 Node，无网络）
 *
 * 用户现象（原话）：「巡查台账中，是否可以增加照片？」
 *   截图：台账详情页对记录 reczz28NUINR3q3y（骑车不戴头盔 · 黄元同）显示
 *   「现场照片：未记录 / 整改后照片：无」，但飞书台账里**现场 1 张 + 整改后 1 张**都在。
 *
 * 根因：`patrolRecordView(rec, full)` 只在 full=true 时下发照片字段
 *   （photo_count / scene_photo_tokens / rectify_photo_tokens），而「已上报台账」卡片
 *   是 `serverRecCard(x)` 把**列表对象**（full=false）直接丢进详情渲染的 ⇒
 *   详情永远显示「未记录/无」。Worker 里早就有 `?id=`（单条 full 详情）分支，
 *   但从仓库首次入库起**前端从未调用过**，形同死代码。
 *
 * 修复（纯前端，所以只需发 Pages，老线上 Worker 也支持 ?id=）：
 *   openServerDetail：手上对象缺照片字段（= 来自列表）时，先即时渲染（照片区「读取中…」），
 *   再补拉 `?id=` full 详情**就地合并**并重绘；失败/无权/用户已切走 → 退回确定态。
 *
 * 两层：A 行为层（抠真函数 + 注入桩真跑）/ B 静态层（版本 + 接线防回退）。
 *
 * Run: node test/cfwps88-detail-photo-fetch.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dir, '../../frontend/check.html');
const PAGES_PATH = resolve(__dir, '../../_pages_deploy/check.html');
const html = readFileSync(HTML_PATH, 'utf8');
const pagesHtml = readFileSync(PAGES_PATH, 'utf8');

let bad = 0;
const ck = (c, m, x) => c
  ? console.log('  ok  ' + m + (x !== undefined && x !== '' ? ' :: ' + x : ''))
  : (bad++, console.log('  NG  ' + m + (x !== undefined && x !== '' ? ' :: ' + x : '')));

/* 花括号配对精确抽取具名函数（跳过 ' " ` 字符串、// 行注释、/ * * / 块注释） */
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

/* ─────────────── A. 行为层：真跑 openServerDetail ─────────────── */
const SRC = extractFn('openServerDetail');
function build(stubs) {
  const f = new Function(
    'mobileApi', 'renderServerDetail', 'viewStack', '__rid',
    'let srvDetailRid = __rid;\n' + SRC +
    '\nreturn { open: openServerDetail, getRid: ()=>srvDetailRid, setRid: (v)=>{ srvDetailRid = v; } };'
  );
  return f(stubs.mobileApi, stubs.renderServerDetail, stubs.viewStack, stubs.rid || '');
}

console.log('═══ A1. 列表对象缺照片字段 → 补拉 ?id= 后重绘出照片 ═══');
{
  ck(!!SRC, '从 check.html 抽出 openServerDetail');
  const calls = [];
  const apiCalls = [];
  const holder = {};
  const h = build({
    viewStack: ['my-checks', 'detail'],
    rid: '',
    mobileApi: async (url) => {
      apiCalls.push(url);
      return { status: 200, body: { success: true, record: {
        record_id: 'R1', photo_count: 1, rectify_photo_count: 1,
        scene_photo_tokens: ['TOK_SCENE'], rectify_photo_tokens: ['TOK_RECT'],
      } } };
    },
    renderServerDetail: (x, opts) => {
      calls.push({ x, opts });
      if (holder.h) holder.h.setRid(String(x.record_id || ''));
    },
  });
  holder.h = h;

  const x = { record_id: 'R1', violation_desc: '骑车不戴头盔' };   // 列表对象：无任何照片字段
  await h.open(x, { title: '台账详情', from: 'my-checks' });

  ck(apiCalls.length === 1 && apiCalls[0].indexOf('/api/mobile/patrol/records?id=R1') === 0,
    '补拉了单条 full 详情', apiCalls[0]);
  ck(calls.length === 2, '渲染两次（即时 + 补拉后重绘）', 'calls=' + calls.length);
  ck(calls[0] && calls[0].opts && calls[0].opts._photoPending === true,
    '第一次渲染带 _photoPending（照片区显示「读取中…」而非「未记录/无」）');
  ck(calls[1] && !calls[1].opts._photoPending, '第二次渲染不带 _photoPending（显示真实结果）');
  ck(calls[1] && calls[1].x.scene_photo_tokens && calls[1].x.scene_photo_tokens[0] === 'TOK_SCENE',
    '重绘对象带上 scene_photo_tokens（照片能显示了）');
  ck(calls[1] && calls[1].x.rectify_photo_tokens && calls[1].x.rectify_photo_tokens[0] === 'TOK_RECT',
    '重绘对象带上 rectify_photo_tokens');
  ck(x.scene_photo_tokens && x.scene_photo_tokens[0] === 'TOK_SCENE' && x.photo_count === 1,
    '**就地合并**（原对象引用也被补全）—— 详情页内「换图」重绘闭包才能拿到这些字段');
}

console.log('\n═══ A2. 已是 full 视图（自带 token）→ 不重复拉取，只渲染一次 ═══');
{
  const calls = [];
  const apiCalls = [];
  const h = build({
    viewStack: ['my-rectify', 'detail'],
    rid: '',
    mobileApi: async (url) => { apiCalls.push(url); return { status: 200, body: { success: true, record: {} } }; },
    renderServerDetail: (x, opts) => { calls.push({ x, opts }); h.setRid(String(x.record_id || '')); },
  });
  const x = { record_id: 'R2', scene_photo_tokens: ['T'], photo_count: 1 };
  await h.open(x, { title: '整改详情' });
  ck(apiCalls.length === 0, '没有多余的 ?id= 请求（待办/派发记录已带 token）');
  ck(calls.length === 1, '只渲染一次');
  ck(!calls[0].opts._photoPending, '不带 _photoPending（数据已齐，直接显示真值）');
}

console.log('\n═══ A3. 补拉失败（404/无权/网络错）→ 退回确定态，不抛错 ═══');
{
  const calls = [];
  const h = build({
    viewStack: ['my-checks', 'detail'],
    rid: '',
    mobileApi: async () => ({ status: 404, body: { success: false, code: 'NOT_FOUND' } }),
    renderServerDetail: (x, opts) => { calls.push({ x, opts }); h.setRid(String(x.record_id || '')); },
  });
  const x = { record_id: 'R3' };
  let threw = false;
  try { await h.open(x, { title: '台账详情' }); } catch (e) { threw = true; }
  ck(!threw, '不抛错（降级不报错）');
  ck(calls.length === 2, '仍然重绘一次，收束到确定态', 'calls=' + calls.length);
  ck(calls[1] && !calls[1].opts._photoPending, '第二次不带 _photoPending → 显示确定的「未记录/无」');
  ck(calls[1] && !('scene_photo_tokens' in calls[1].x), '失败时对象未被污染');
}

console.log('\n═══ A4. 用户已切走（不在 detail 视图）→ 不重绘（防串记录）═══');
{
  const calls = [];
  const viewStack = ['my-checks', 'detail'];
  const h = build({
    viewStack,
    rid: '',
    mobileApi: async () => {
      viewStack.length = 0; viewStack.push('my-checks');   // 模拟：补拉在途时用户点了返回
      return { status: 200, body: { success: true, record: { record_id: 'R4', photo_count: 2 } } };
    },
    renderServerDetail: (x, opts) => { calls.push({ x, opts }); h.setRid(String(x.record_id || '')); },
  });
  await h.open({ record_id: 'R4' }, {});
  ck(calls.length === 1, '用户已离开 → 不重绘（避免把旧记录糊到别的页面）', 'calls=' + calls.length);
}

console.log('\n═══ A5. 补拉在途时用户点开了**另一条**详情 → 不重绘 ═══');
{
  const calls = [];
  const h = build({
    viewStack: ['my-checks', 'detail'],
    rid: '',
    mobileApi: async () => {
      h.setRid('R_OTHER');   // 模拟：另一条详情已渲染，srvDetailRid 已被改写
      return { status: 200, body: { success: true, record: { record_id: 'R5', photo_count: 1 } } };
    },
    renderServerDetail: (x, opts) => { calls.push({ x, opts }); h.setRid(String(x.record_id || '')); },
  });
  await h.open({ record_id: 'R5' }, {});
  ck(calls.length === 1, '记录号对不上 → 不重绘（不会把 R5 的照片糊到 R_OTHER 上）', 'calls=' + calls.length);
}

/* ─────────────── B. 静态层 ─────────────── */
console.log('\n═══ B1. 版本自洽（≥ .87）═══');
{
  const build_ = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!build_, 'hse-build meta 存在', build_);
  ck(build_ === cfg && build_ === app, '三处版本一致', `${build_} / ${cfg} / ${app}`);
  ck(!!build_ && build_ >= '2026-10-14.87', '版本 ≥ .87', build_);
  const pagesBuild = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pagesBuild === build_, '_pages_deploy 副本版本已同步', pagesBuild);
}

console.log('\n═══ B2. 关键接线仍在（防回退）═══');
{
  ck(/^async\s+function\s+openServerDetail/m.test(SRC || '') || /async function openServerDetail/.test(SRC || ''),
    'openServerDetail 是 async（要 await 补拉）');
  ck(/\/api\/mobile\/patrol\/records\?id=/.test(SRC || ''), '调用了 ?id= 单条 full 详情');
  ck(/_photoPending/.test(SRC || ''), '首次渲染带 _photoPending');
  ck(/srvDetailRid\s*===\s*rid/.test(SRC || ''), '重绘前校验记录号（防串记录）');
  ck(/viewStack\[viewStack\.length\s*-\s*1\]\s*===\s*["']detail["']/.test(SRC || ''),
    '重绘前校验仍停在 detail 视图');
  ck(/Object\.assign\(x,\s*r\.body\.record\)/.test(SRC || ''), '就地合并（不改引用）');

  const rd = extractFn('renderServerDetail') || '';
  ck(/srvDetailRid\s*=\s*rid/.test(rd), 'renderServerDetail 记录当前展示的记录号');
  ck(/_photoPending/.test(rd), 'renderServerDetail 认识 _photoPending（照片区「读取中…」）');
  ck(/读取中…/.test(rd), '照片区有「读取中…」文案');
}

console.log(`\n--- ${bad === 0 ? '全部通过' : bad + ' 项失败'} ---`);
process.exit(bad === 0 ? 0 : 1);
