/* CF-WPS-82 · 角标 / 红点计数 —— 数字必须能在点进去的页面上找到
 *
 * 本文件钉三件事（都是实测出来的，不是读码推测）：
 *
 * ① 台账页「待上报（N）」必须与页顶同步条的「有 N 条记录待上报」**同数**。
 *    原来「待上报」分组走 myChecks()（type === "三违"），同步条走全量 db.records
 *    ⇒ 同一个概念两个数。实测（本机 1 条三违 + 1 条普通巡查未上报）：
 *    同步条写 2、点进去只有 1，而那条普通巡查在台账页**完全看不到**
 *    （既不进「待上报」，也不在服务端「已上报台账」里）——只能靠同步条盲点重试。
 *
 * ② 「巡查台账」页签角标 badge-checks 的数字必须等于台账页「未闭环（N）」分组的条数。
 *    原来角标数的是「本机未完成三违（不分是否上报）」，可台账页只分两组
 *    ⇒ 实测角标 2、页面上找不到任何一组是 2（待上报 1、服务端台账 3）。
 *    现在按 syncState 严格二分：未上报 → 待上报；已上报未完成 → 未闭环（= 角标）。
 *
 * ③ 整改完成路径的「即时回显」必须真的即时。
 *    原注释写「强制回源跳过缓存」，但 refreshInboxStats 里写死 loadSummary(false)，
 *    而 loadSummary 全文件**没有任何一处**传过 true ⇒ SUMMARY_TTL(20s) 缓存永远命中。
 *    实测：把 summary.pending 2→0 后走完成路径，「待整改」卡与角标**仍是 2**，
 *    要等 21s 越过 TTL 才归零 —— 被指派人整改完，红点最长 20 秒不灭。
 *
 * 跑法：node worker/test/cfwps82-ledger-badge.e2e.mjs
 * 依赖：本机 Chrome（headless）+ worker/node_modules 的 ws。
 * 注意：本用例用桩替换了 window.fetch（不碰任何真实后端 / 真实飞书台账）。
 * 反向验证：T82_ROOT 可指向 frontend/ 的副本。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import http from 'node:http';
import { WebSocket } from 'ws';

const ROOT = path.resolve(process.env.T82_ROOT || path.resolve(import.meta.dirname, '../../frontend'));
const HTTP_PORT = 9271, CDP_PORT = 9272;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ME = '13800000082';

const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond, extra || '']); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  | ' + extra : '')); };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'check.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

const UD = fs.mkdtempSync(path.join(os.tmpdir(), 't82-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${UD}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
await sleep(3000);
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });

let mid = 0; const waits = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; console.log('PAGE-EXC:', (d.exception && d.exception.description || '').split('\n').slice(0, 3).join(' | ')); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid; waits.set(id, (m) => m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
  return r.result.value;
};
const pollNode = async (fn, timeout = 15000, gap = 200) => {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > timeout) return null; await sleep(gap); }
};

await send('Page.enable'); await send('Runtime.enable');

/* 本机种子（自洽）：
   L1 三违 未完成 **已上报**   → 进「未闭环」，进角标
   L2 三违 未完成 **未上报**   → 进「待上报」，**不进**角标、不进未闭环
   L3 三违 已完成 已上报       → 两组都不进
   L4 三违 未完成 已上报 但 checker 是别人（派给我的）→ 不进角标（不是我的巡查）
   L5 普通巡查 未完成 **未上报** → 进「待上报」（以前被 myChecks() 滤掉，台账页看不到）
   服务端台账 3 条；inbox 待整改 2 条；summary.pending=2 */
const seedRec = (i, o) => Object.assign({
  id: 'L' + i, no: 'HSE-L' + i, type: '三违', behavior: '逆行',
  personName: '王五', personTel: '13900000001',
  checkerId: ME, checkerName: '对账测试乙', checkerRole: '经理',
  source: '上报', time: Date.now(), status: 'unfinished',
  rectifyMode: null, rectifyTime: null,
  transferTown: null, transferAdminId: null, transferAdminName: null,
  clientRequestId: 'crL' + i, inspectTime: '2026-10-13 08:00',
  syncState: 'pending', syncError: null, serverRecordId: null,
  scenePhoto: '', afterPhoto: null, location: null,
}, o || {});
const SEED = [
  seedRec(1, { status: 'unfinished', syncState: 'synced', serverRecordId: 'recS1' }),
  seedRec(2, { status: 'unfinished', syncState: 'pending', serverRecordId: null }),
  seedRec(3, { status: 'done', syncState: 'synced', serverRecordId: 'recS3', rectifyTime: Date.now() }),
  seedRec(4, { checkerId: '99999999999', status: 'unfinished', syncState: 'synced', serverRecordId: 'recS4', rectifierId: ME, rectifyMode: 'transfer', transferAdminName: '对账测试乙' }),
  seedRec(5, { type: '普通巡查', status: 'unfinished', syncState: 'pending', serverRecordId: null }),
];

const INIT = `
(function(){
  try{
    localStorage.setItem('h5_session_token','FAKE_TOKEN_T82');
    localStorage.setItem('h5_session_exp', String(Date.now()+7200*1000));
    localStorage.setItem('hse_check_v1_${ME}', JSON.stringify({ seq: 9, records: ${JSON.stringify(SEED)} }));
  }catch(e){}
  const pad = n => String(n).padStart(2,'0');
  const d = new Date();
  const ym = d.getFullYear() + '-' + pad(d.getMonth()+1);
  window.__t82 = {
    ym: ym,
    summary: { month_post: 3, month_dispatch: 4, pending: 2, rectified: 1, dispatch_pending: 4, dispatch_done: 1 },
    inboxPending: 2, inboxMonthlyDone: 1,
    dispatched: { pending_count: 4, done_count: 1, total: 5, monthly_dispatch_count: 4 },
  };
  const srvRows = () => ([
    { record_id: 'recS1', is_violation: '是', violation_desc: '逆行', violation_people: '王五',
      inspection_time: ym + '-13 08:00', checker_name: '对账测试乙', photo_count: 1 },
    { record_id: 'recS3', is_violation: '是', violation_desc: '逆行', violation_people: '王五',
      inspection_time: ym + '-13 08:00', checker_name: '对账测试乙', photo_count: 1,
      todo_status: '已完成', done_at: ym + '-12 15:00' },
    { record_id: 'recS4', is_violation: '是', violation_desc: '逆行', violation_people: '王五',
      inspection_time: ym + '-13 08:00', checker_name: '别人', photo_count: 1,
      todo_status: '待整改', assigner_name: '对账上级', assigner_dept: '安环管理部',
      assigned_at: ym + '-13 09:00', assignee_name: '对账测试乙', town: '保店镇' },
  ]);
  const inboxRows = () => ([
    { record_id: 'recS4', is_violation: '是', violation_desc: '逆行', violation_people: '王五',
      inspection_time: ym + '-13 08:00', todo_status: '待整改',
      assigner_name: '对账上级', assigner_dept: '安环管理部', assigned_at: ym + '-13 09:00',
      assignee_name: '对账测试乙', town: '保店镇', photo_count: 1 },
    { record_id: 'recIP1', is_violation: '是', violation_desc: '逆行', violation_people: '赵六',
      inspection_time: ym + '-13 08:00', todo_status: '待整改',
      assigner_name: '对账上级', assigner_dept: '安环管理部', assigned_at: ym + '-13 08:30',
      assignee_name: '对账测试乙', town: '保店镇', photo_count: 1 },
  ]);
  const dpRows = (n, pre) => { const a = []; for(let i=0;i<n;i++) a.push({
    record_id: pre + i, is_violation: '是', violation_desc: '逆行', violation_people: '王五',
    inspection_time: ym + '-13 08:00', todo_status: '待整改', assigner_name: '对账测试乙',
    assigned_at: ym + '-13 09:00', assignee_name: '作业中心丙', town: '保店镇', photo_count: 1 }); return a; };
  const realFetch = window.fetch;
  window.fetch = function(input, opt){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const m = /^\\/api\\/mobile(.*)$/.exec(url);
    if(!m) return realFetch.apply(this, arguments);
    const p = m[1];
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
    if(p === '/me') return Promise.resolve(reply({ success: true, must_change_password: false,
      employee: { employee_code: '${ME}', name: '对账测试乙', department: '对账片区', position: '经理', grid_level: '一级', role: '经理', superior: '对账上级' } }));
    if(p === '/patrol/meta') return Promise.resolve(reply({ success: true, employee: {}, grids: ['测试网格'], violation_types: ['逆行'], problem_types: [] }));
    if(p === '/upload') return Promise.resolve(reply({ success: true, file_token: 'tokT82' + Math.random().toString(36).slice(2, 10) }));
    // 建单固定失败 → L2 / L5 保持「未上报」，正好覆盖「待上报」两组
    if(p === '/patrol/submit') return Promise.resolve(reply({ success: false, code: 'UPSTREAM', message: '桩：建单失败' }, 502));
    if(p === '/summary') { const s = window.__t82.summary;
      return Promise.resolve(reply(Object.assign({ success: true, stats: {}, month: ym }, s))); }
    if(p.indexOf('/patrol/records') === 0){
      const arr = srvRows();
      return Promise.resolve(reply({ success: true, scope: 'SELF', month: ym, total: arr.length, has_more: false, records: arr }));
    }
    if(p === '/inbox'){
      const arr = inboxRows();
      return Promise.resolve(reply({ success: true, todos: arr,
        pending_count: window.__t82.inboxPending, monthly_done_count: window.__t82.inboxMonthlyDone,
        done_count: window.__t82.inboxMonthlyDone, done_more: false, total: arr.length }));
    }
    if(p.indexOf('/dispatched') === 0){
      const c = window.__t82.dispatched;
      return Promise.resolve(reply({ success: true, records: dpRows(c.pending_count, 'recDP'),
        done_records: dpRows(c.done_count, 'recDD'), pending_count: c.pending_count, done_count: c.done_count,
        total: c.total, monthly_dispatch_count: c.monthly_dispatch_count, done_more: false }));
    }
    return Promise.resolve(reply({ success: true }));
  };
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/check.html` });
const booted = await pollNode(() => evalJs(`typeof session !== 'undefined' && !!session && session.id === '${ME}'
  && !!document.querySelector('#view-home') && document.querySelector('#view-home').classList.contains('active')`), 20000);
ok('T0 页面启动进首页（fake 会话，role=经理）', !!booted);
if (!booted) { console.log('启动失败，后续用例无意义，提前退出'); ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(1); }
await sleep(3000);

/* ---- 取数助手 ---- */
const badge = (id) => evalJs(`(()=>{const e=document.getElementById(${JSON.stringify(id)});
  return e ? { n: e.textContent.trim(), hidden: e.classList.contains('hidden') } : null;})()`);
const cardPending = () => evalJs(`document.getElementById('stat-pending').textContent.trim()`);
const syncBarText = () => evalJs(`(()=>{const b=document.getElementById('sync-bar');
  return b && !b.classList.contains('hidden') ? b.textContent.replace(/\\s+/g,' ').trim() : '';})()`);
// 按 section-label 把台账页的卡片分组，并抽出每张卡上的记录编号（本机卡才有 HSE- 编号）
const ledger = () => evalJs(`(()=>{
  const el = document.getElementById('my-checks-list');
  if(!el) return { sections: [] };
  const out = []; let cur = null;
  for(const ch of el.children){
    if(ch.classList.contains('section-label')){
      cur = { label: ch.textContent.replace(/\\s+/g,' ').trim(), nos: [] }; out.push(cur);
    } else if(ch.classList.contains('record-card')){
      const txt = [...ch.querySelectorAll('.r-sub')].map(e=>e.textContent).join(' ');
      const m = /HSE-[A-Z0-9]+/.exec(txt);
      if(!cur){ cur = { label: '(无分组)', nos: [] }; out.push(cur); }
      cur.nos.push(m ? m[0] : '?');
    }
  }
  return { sections: out };
})()`);
const openLedger = async () => {
  await evalJs(`(()=>{const b=document.querySelector('#tabbar .tab-item[data-tab="my-checks"]');if(b)b.click();return !!b;})()`);
  return pollNode(async () => {
    const l = await ledger();
    return (l.sections.length && l.sections.some(s => /待上报/.test(s.label))) ? l : null;
  });
};
const num = (s) => { const m = /（(\d+)）/.exec(s || ''); return m ? Number(m[1]) : null; };

/* ---------- T1/T2：角标数字 == 台账页分组条数 ---------- */
console.log('\n── 不变式 1：角标 == 页面上的分组 ──');
const led = await openLedger();
const secUpload = (led.sections.find(s => /待上报/.test(s.label)) || {});
const secOpen = (led.sections.find(s => /未闭环/.test(s.label)) || {});
const bChecks = await badge('badge-checks');
console.log('  台账页分组:', JSON.stringify(led.sections.map(s => s.label)));
ok('T1a 台账页出现「未闭环（N）」分组（角标数字的归属）', !!secOpen.label, secOpen.label || '');
ok('T1b 角标 badge-checks == 「未闭环（N）」的 N', bChecks && num(secOpen.label) !== null && bChecks.n === String(num(secOpen.label)),
  'badge=' + (bChecks && bChecks.n) + ' section=' + secOpen.label);
ok('T1c 角标数字 > 0（有已上报未闭环的三违，不是空跑）', bChecks && Number(bChecks.n) > 0, bChecks && bChecks.n);

/* ---------- T2：同步条数字 == 「待上报（N）」 ---------- */
console.log('\n── 不变式 2：同步条 == 「待上报」分组 ──');
const bar = await syncBarText();
const barN = (() => { const m = /有 (\d+) 条记录待上报/.exec(bar || ''); return m ? Number(m[1]) : null; })();
ok('T2a 「待上报（N）」分组存在', !!secUpload.label, secUpload.label || '');
ok('T2b 同步条「有 N 条记录待上报」的 N == 「待上报（N）」的 N',
  barN !== null && num(secUpload.label) !== null && barN === num(secUpload.label),
  'syncBar=' + barN + ' section=' + secUpload.label + ' ｜ ' + bar);

/* ---------- T3/T4/T5：分组归属正确 ---------- */
console.log('\n── 分组归属 ──');
ok('T3 「待上报」分组包含普通巡查记录（以前被 myChecks() 滤掉，台账页看不到）',
  secUpload.nos.includes('HSE-L5'), JSON.stringify(secUpload.nos));
ok('T4 未上报的未完成三违（L2）**不进**「未闭环」（按 syncState 二分，不重复列）',
  !secOpen.nos.includes('HSE-L2'), JSON.stringify(secOpen.nos));
ok('T5 已上报的未完成三违（L1）**进**「未闭环」', secOpen.nos.includes('HSE-L1'), JSON.stringify(secOpen.nos));
ok('T6 不是我的巡查（L4，checker 是别人）不进角标那一组', !secOpen.nos.includes('HSE-L4'), JSON.stringify(secOpen.nos));
const dup = secOpen.nos.filter(n => secUpload.nos.includes(n));
ok('T7 「待上报」与「未闭环」两组卡片无重复', dup.length === 0, '重复=' + JSON.stringify(dup));

/* ---------- T8：补传成功后角标当场跟着变（不等 25s 轮询） ---------- */
console.log('\n── 补传成功 ⇒ 记录从「待上报」挪进「未闭环」，角标当场变 ──');
const before = (await badge('badge-checks')).n;
await evalJs(`(()=>{ const r=db.records.find(x=>x.id==='L2'); r.syncState='synced'; r.serverRecordId='recNewL2';
  const q=db.records.find(x=>x.id==='L5'); q.syncState='synced'; q.serverRecordId='recNewL5';
  saveDB(); renderSyncBar(); return true; })()`);
const after = (await badge('badge-checks')).n;
ok('T8a 补传成功后角标立刻 +1（L2 从待上报挪进未闭环）', Number(after) === Number(before) + 1,
  before + ' → ' + after);
const bar2 = await syncBarText();
ok('T8b 补传成功后同步条消失（没有待上报了）', bar2 === '', JSON.stringify(bar2));

/* ---------- T9：整改完成路径必须真的「强制回源」 ---------- */
console.log('\n── 不变式 3：整改完成路径的即时回显 ──');
await evalJs(`(async()=>{ await loadSummary(true); })()`);   // 先把 summary 缓存刷成新鲜的
await evalJs(`window.__t82.summary.pending = 0; window.__t82.inboxPending = 0; true;`);
await evalJs(`(async()=>{ await loadInbox(true); refreshHomeStats(false); })()`);
await sleep(1200);
const ctrlCard = await cardPending();
const ctrlBadge = await badge('badge-rectify');
ok('T9a 对照：TTL 内 refreshHomeStats(false) **不**回源（卡片仍是旧值 2）',
  ctrlCard === '2' && !ctrlBadge.hidden, 'card=' + ctrlCard + ' badge=' + ctrlBadge.n);
await evalJs(`(async()=>{ await loadInbox(true); refreshHomeStats(true); })()`);
await sleep(1200);
const fixedCard = await cardPending();
const fixedBadge = await badge('badge-rectify');
ok('T9b refreshHomeStats(true) 立刻回源（卡片归零）', fixedCard === '0', 'card=' + fixedCard);
ok('T9c refreshHomeStats(true) 立刻把「整改任务」角标熄灭', fixedBadge.hidden === true, 'badge=' + JSON.stringify(fixedBadge));

/* ---------- T10：静态接线（防以后有人把 force 又写死成 false） ---------- */
console.log('\n── 静态接线 ──');
const src = fs.readFileSync(path.join(ROOT, 'check.html'), 'utf8');
ok('T10a refreshInboxStats 把 force 透传给 loadSummary', /loadSummary\(\s*!!force\s*\)/.test(src));
ok('T10b 整改完成路径调用 refreshHomeStats(true)', /loadInbox\(true\);\s*refreshHomeStats\(true\)/.test(src));
ok('T10c 台账页「待上报」与同步条共用 myUnsyncedRecords()',
  (src.match(/myUnsyncedRecords\(\)/g) || []).length >= 2);
ok('T10d 角标只有一个写入口（setBadge("badge-checks") 全文件只出现一次）',
  (src.match(/setBadge\("badge-checks"/g) || []).length === 1 &&
  /function refreshLedgerBadge\(\)\{\s*setBadge\("badge-checks"/.test(src),
  '出现次数=' + (src.match(/setBadge\("badge-checks"/g) || []).length);

/* ---------- 收尾 ---------- */
ws.close(); chrome.kill('SIGKILL'); server.close();
try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
const bad = results.filter(r => !r[1]);
console.log(`\n===== CF-WPS-82 角标/红点计数 E2E: ${results.length - bad.length}/${results.length} PASS =====`);
if (bad.length) console.log('失败项：\n  - ' + bad.map(r => r[0] + (r[2] ? ' :: ' + r[2] : '')).join('\n  - '));
process.exit(bad.length ? 1 : 0);
