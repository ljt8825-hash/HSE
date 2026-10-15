/* CF-WPS-87 —— 「原记录没上报时，整改后照片不能丢」回归（纯 Node，无网络）
 *
 * 用户现象（原话）：「整改后的照片未上传到飞书多维表格的测试台账中，请检查问题」
 * 根因：整改时**原记录还没上报成功**（patrol/submit 失败 / 未完成）⇒ 记录没有 serverRecordId，
 *       而 submitRectify 的两个上传分支都要求 serverRecordId ⇒ 整改后照片无处可挂，
 *       只能烂在 localStorage 里（实测：原记录没进飞书，整改照片也一起没了）。
 *
 * 修复（.86，纯前端）：
 *   ① submitRectify：没有 serverRecordId 时不再「什么都不做」，改标记 rec.rectifyPhotoPending=true 暂存；
 *   ② syncRecordOnce：原记录补传成功（拿到 serverRecordId）后，立刻把暂存的整改照片补挂回这条记录；
 *   ③ retryPendingSyncOnce：补挂成功即摘掉 rectifyPhotoPending（兜底那遍同样收敛状态）；
 *   ④ showDone：终屏明确告诉用户「照片已暂存本机、补传成功后会一并上传」，不再让人以为白干。
 *
 * 本测试分两层：
 *   A. 行为层 —— 用花括号配对从 check.html 精确抠出三个真函数，注入桩后在 Node 里**真跑**，
 *      断言分支选择与状态流转（不是只看字符串在不在）。
 *   B. 静态层 —— 断言版本自洽 + 关键接线仍在（防后续改动悄悄回退）。
 *
 * Run: node test/cfwps87-pending-rectify-photo.test.mjs
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
const tick = (n = 6) => new Promise((r) => { let i = 0; const s = () => (++i >= n ? r() : setTimeout(s, 0)); s(); });

/* 花括号配对精确抽取一个具名函数（从 `function NAME(` 起，扫到配对的 `}` 止）。
   跳过 ' " ` 字符串、// 行注释、/* 块注释；这三个函数里没有正则字面量，无需区分除法。 */
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

/* ───────────────────────── A. 行为层 ───────────────────────── */
console.log('═══ A1. submitRectify 的三条分支（真跑抽出来的函数）═══');
{
  const src = extractFn('submitRectify');
  ck(!!src, '从 check.html 抽出 submitRectify');

  function make(stubs) {
    const f = new Function(
      'session', 'saveDB', 'uploadPhotoToken', 'mobileApi', 'loadInbox', 'refreshHomeStats',
      'attachPhotoToRecord', 'showDone',
      'let rectifying = null;\n' + src +
      '\nreturn { run: (r)=>{ rectifying = r; submitRectify(); return rectifying; }, peek: ()=>rectifying };'
    );
    return f(
      stubs.session || { id: 'me', name: '我' },
      stubs.saveDB || (() => {}),
      stubs.uploadPhotoToken || (async () => 'TOKEN'),
      stubs.mobileApi || (async () => ({ status: 200, body: { success: true } })),
      stubs.loadInbox || (async () => {}),
      stubs.refreshHomeStats || (async () => {}),
      stubs.attachPhotoToRecord || (async () => true),
      stubs.showDone || (() => {})
    );
  }

  // A1-① 派发待办（fromServer + serverRecordId）→ 走 assign/complete（照片随请求一起带）
  {
    const calls = [];
    const h = make({
      mobileApi: async (url, body) => { calls.push({ url, body }); return { status: 200, body: { success: true } }; },
      attachPhotoToRecord: async () => { calls.push({ url: 'ATTACH' }); return true; },
      uploadPhotoToken: async () => { calls.push({ url: 'UPLOAD' }); return 'TK'; },
    });
    const rec = { fromServer: true, serverRecordId: 'REC_A', afterPhoto: 'data:img', _rectifyConfirmed: true, personName: '张三' };
    h.run(rec);
    await tick();
    ck(calls.some((c) => c.url === '/api/mobile/assign/complete'), '① 走 assign/complete 回写');
    ck(!calls.some((c) => c.url === 'ATTACH'), '① 不再单独补挂（照片随 complete 带上）');
    ck(rec.completedToServer === true, '① completedToServer=true');
    ck(!rec.rectifyPhotoPending, '① 不置 pending');
  }

  // A1-② 本人自建且**已上报**（有 serverRecordId）→ 上传 + 补挂
  {
    const calls = [];
    const h = make({
      mobileApi: async (url) => { calls.push({ url }); return { status: 200, body: { success: true } }; },
      uploadPhotoToken: async (dataUrl, kind, cid) => { calls.push({ url: 'UPLOAD', kind, cid }); return 'TK2'; },
      attachPhotoToRecord: async (r, kind) => { calls.push({ url: 'ATTACH', kind, rec: r }); return true; },
    });
    const rec = { fromServer: false, serverRecordId: 'REC_B', afterPhoto: 'data:img', clientRequestId: 'cid-b' };
    h.run(rec);
    await tick();
    ck(calls.some((c) => c.url === 'UPLOAD' && c.kind === 'after'), '② 上传整改后照片（kind=after）');
    ck(calls.some((c) => c.url === 'ATTACH' && c.kind === 'rectify'), '② 补挂回同一条记录');
    ck(rec.rectifyPhotoToken === 'TK2', '② 记录上留下 rectifyPhotoToken');
    ck(!rec.rectifyPhotoPending, '② 不置 pending');
  }

  // A1-③ 【本次核心】本人自建但**原记录没上报**（无 serverRecordId）→ 置 pending 暂存，绝不丢
  {
    const calls = [];
    const h = make({
      mobileApi: async (url) => { calls.push({ url }); return { status: 200, body: { success: true } }; },
      uploadPhotoToken: async () => { calls.push({ url: 'UPLOAD' }); return 'TK3'; },
      attachPhotoToRecord: async () => { calls.push({ url: 'ATTACH' }); return true; },
    });
    const rec = { fromServer: false, afterPhoto: 'data:img', clientRequestId: 'cid-c' };
    h.run(rec);
    await tick();
    ck(rec.rectifyPhotoPending === true, '③ 置 rectifyPhotoPending=true（照片暂存本机）');
    ck(!calls.some((c) => c.url === 'UPLOAD' || c.url === 'ATTACH'), '③ 没有 serverRecordId 时不去瞎传（不报错也不丢图）');
    ck(rec.status === 'done' && rec.rectifyTime > 0, '③ 整改进度照常标记完成（不因照片断掉）');
  }
}

console.log('\n═══ A2. syncRecordOnce：原记录补传成功后自动补挂暂存的整改照片 ═══');
{
  const src = extractFn('syncRecordOnce');
  ck(!!src, '从 check.html 抽出 syncRecordOnce');

  function make(stubs) {
    const f = new Function(
      'resolveGridForSubmit', 'loadPatrolMeta', 'photoFp', 'uploadPhotoToken',
      'submitRecordToBackend', 'patrolSubmitHint', 'attachPhotoToRecord', 'saveDB',
      src + '\nreturn syncRecordOnce;'
    );
    return f(
      stubs.resolveGridForSubmit || (() => true),
      stubs.loadPatrolMeta || (async () => {}),
      stubs.photoFp || (() => ''),
      stubs.uploadPhotoToken || (async () => 'TK'),
      stubs.submitRecordToBackend || (async () => ({ ok: true, recordId: 'REC_OK' })),
      stubs.patrolSubmitHint || (() => ''),
      stubs.attachPhotoToRecord || (async () => true),
      stubs.saveDB || (() => {})
    );
  }

  // A2-① 补传成功 + 有暂存照片 ⇒ 建单后立即补挂，并摘掉 pending
  {
    const calls = [];
    const syncRecordOnce = make({
      uploadPhotoToken: async (d, kind) => { calls.push({ url: 'UPLOAD', kind }); return 'TK_NEW'; },
      attachPhotoToRecord: async (r, kind) => { calls.push({ url: 'ATTACH', kind }); return true; },
    });
    const rec = { syncState: 'failed', type: '三违', behavior: '逆行', afterPhoto: 'data:img', rectifyPhotoPending: true, clientRequestId: 'c1' };
    const out = await syncRecordOnce(rec);
    ck(out.syncState === 'synced', '① 记录已同步（synced）');
    ck(out.serverRecordId === 'REC_OK', '① serverRecordId 已拿到');
    ck(calls.some((c) => c.url === 'UPLOAD' && c.kind === 'after'), '① 上传暂存的整改后照片');
    ck(calls.some((c) => c.url === 'ATTACH' && c.kind === 'rectify'), '① 补挂回这条记录');
    ck(out.rectifyPhotoPending === false, '① 补挂成功 → 摘掉 rectifyPhotoPending');
  }

  // A2-② 没有 pending 标记（普通建单）⇒ 不误触补挂
  {
    const calls = [];
    const syncRecordOnce = make({
      uploadPhotoToken: async () => { calls.push('UPLOAD'); return 'X'; },
      attachPhotoToRecord: async () => { calls.push('ATTACH'); return true; },
    });
    const rec = { syncState: 'pending', type: '三违', behavior: '逆行', clientRequestId: 'c2' };
    await syncRecordOnce(rec);
    ck(!calls.includes('UPLOAD') && !calls.includes('ATTACH'), '② 无 pending / 无照片时不补挂（不误伤普通建单）');
  }

  // A2-③ 补挂失败 ⇒ 保留 pending（交给 retryPendingSync 第二遍继续兜底）
  {
    const syncRecordOnce = make({
      uploadPhotoToken: async () => 'TK_X',
      attachPhotoToRecord: async () => false,
    });
    const rec = { syncState: 'failed', type: '三违', behavior: '逆行', afterPhoto: 'data:img', rectifyPhotoPending: true, clientRequestId: 'c3' };
    const out = await syncRecordOnce(rec);
    ck(out.rectifyPhotoPending === true, '③ 补挂失败 → 保留 pending（下次重试继续补）');
  }
}

console.log('\n═══ A3. retryPendingSyncOnce：兜底那遍也收敛 pending 状态 ═══');
{
  const src = extractFn('retryPendingSyncOnce');
  ck(!!src, '从 check.html 抽出 retryPendingSyncOnce');

  function make(stubs) {
    const f = new Function(
      'db', 'syncRecord', 'uploadPhotoToken', 'attachPhotoToRecord', 'saveDB',
      'renderSyncBar', 'viewStack', 'renderMyChecks', 'renderListInto', 'myChecks',
      src + '\nreturn retryPendingSyncOnce;'
    );
    return f(
      stubs.db, stubs.syncRecord || (async (r) => r),
      stubs.uploadPhotoToken || (async () => 'TK'),
      stubs.attachPhotoToRecord || (async () => true),
      stubs.saveDB || (() => {}), stubs.renderSyncBar || (() => {}),
      stubs.viewStack || [], stubs.renderMyChecks || (() => {}),
      stubs.renderListInto || (() => {}), stubs.myChecks || (() => [])
    );
  }

  // A3-① 已同步但照片没挂上（pending）⇒ 兜底补挂并摘标记
  {
    const calls = [];
    const db = { records: [{ syncState: 'synced', serverRecordId: 'R1', afterPhoto: 'data', rectifyPhotoPending: true, clientRequestId: 'c' }] };
    const retry = make({
      db,
      uploadPhotoToken: async () => { calls.push('UPLOAD'); return 'TKR'; },
      attachPhotoToRecord: async () => { calls.push('ATTACH'); return true; },
    });
    await retry();
    ck(calls.includes('UPLOAD') && calls.includes('ATTACH'), '① 兜底那遍真的补挂');
    ck(db.records[0].rectifyPhotoPending === false, '① 补挂成功 → 摘掉 pending');
  }

  // A3-② 兜底补挂失败 ⇒ 不摘 pending
  {
    const db = { records: [{ syncState: 'synced', serverRecordId: 'R2', afterPhoto: 'data', rectifyPhotoPending: true, clientRequestId: 'c' }] };
    const retry = make({ db, attachPhotoToRecord: async () => false });
    await retry();
    ck(db.records[0].rectifyPhotoPending === true, '② 补挂失败 → 保留 pending（不假装成功）');
  }

  // A3-③ 关键回归：**没有**未上报记录、但有「已同步+照片没挂上」⇒ 不能被提前 return 挡掉
  {
    const db = { records: [{ syncState: 'synced', serverRecordId: 'R3', afterPhoto: 'data', clientRequestId: 'c' }] };
    const calls = [];
    const retry = make({
      db,
      uploadPhotoToken: async () => { calls.push('UPLOAD'); return 'TKR3'; },
      attachPhotoToRecord: async () => { calls.push('ATTACH'); return true; },
    });
    await retry();
    ck(calls.includes('UPLOAD') && calls.includes('ATTACH'),
      '③ pend 为空时仍会为「照片没挂上」的记录补挂（修掉提前 return 的坑）');
  }

  // A3-④ 真·无事可做 ⇒ 直接返回，不打任何接口
  {
    const db = { records: [{ syncState: 'synced', serverRecordId: 'R4', rectifyPhotoToken: 'DONE' }] };
    const calls = [];
    const retry = make({
      db,
      uploadPhotoToken: async () => { calls.push('UPLOAD'); return 'X'; },
      attachPhotoToRecord: async () => { calls.push('ATTACH'); return true; },
    });
    await retry();
    ck(!calls.length, '④ 无任何待办 → 直接返回（不空跑）');
  }
}

/* ───────────────────────── B. 静态层 ───────────────────────── */
console.log('\n═══ B1. 版本自洽（≥ .86，引入本修复的基线）═══');
{
  const build = (html.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  const cfg = (html.match(/config\.js\?v=([^"]+)"/) || [])[1];
  const app = (html.match(/app\.js\?v=([^"]+)"/) || [])[1];
  ck(!!build, 'hse-build meta 存在', build);
  ck(build === cfg && build === app, '三处版本一致', `${build} / ${cfg} / ${app}`);
  ck(!!build && build >= '2026-10-14.86', '版本 ≥ .86', build);
  const pagesBuild = (pagesHtml.match(/<meta name="hse-build" content="([^"]+)">/) || [])[1];
  ck(pagesBuild === build, '_pages_deploy 副本版本已同步', pagesBuild);
}

console.log('\n═══ B2. 关键接线仍在（防回退）═══');
{
  const sub = extractFn('submitRectify') || '';
  ck(/done\.afterPhoto\s*&&\s*!done\.serverRecordId/.test(sub), 'submitRectify 有「无 serverRecordId」分支');
  ck(/done\.rectifyPhotoPending\s*=\s*true/.test(sub), 'submitRectify 置 rectifyPhotoPending');

  const sync = extractFn('syncRecordOnce') || '';
  ck(/rec\.rectifyPhotoPending\s*&&\s*rec\.afterPhoto\s*&&\s*!rec\.rectifyPhotoToken/.test(sync),
    'syncRecordOnce 建单成功后检查 pending 照片');
  ck(/attachPhotoToRecord\(rec,\s*["']rectify["']\)/.test(sync), 'syncRecordOnce 补挂 rectify 照片');
  ck(/rec\.rectifyPhotoPending\s*=\s*false/.test(sync), 'syncRecordOnce 补挂成功摘 pending');

  const retry = extractFn('retryPendingSyncOnce') || '';
  ck(/r\.rectifyPhotoPending\s*=\s*false/.test(retry), 'retryPendingSyncOnce 兜底那遍也摘 pending');

  const done = extractFn('showDone') || '';
  ck(/整改照片已暂存本机/.test(done), 'showDone 明确告知「照片已暂存、补传后一并上传」');
}

console.log(`\n--- ${bad === 0 ? '全部通过' : bad + ' 项失败'} ---`);
process.exit(bad === 0 ? 0 : 1);
