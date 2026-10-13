/* CF-WPS-79 · 前端侧 —— 「别人派给我的任务」在列表里到底写成什么？
 *
 * 背景（用户实测发现，探针复现）：
 *   首页 →「待整改」/「已整改」明细是**接收方视角**（这些任务是上级派给我的），
 *   但 renderStatDetail 的这两个分支复用了 dispatchCard —— 那是**派发方视角**的卡片：
 *       who = rec.assigneeName ? "派给 " + rec.assigneeName : "未指定接收人"
 *   而 todoToRec（收件箱条目 → 卡片形状）**没有 assigneeName 字段**（只有 assignerName）
 *   ⇒ 每条指派给我的任务都显示「未指定接收人」，派发人反而完全不显示。
 *   同一批记录在「我的整改」tab 走的是 recordCard（有「来自 XXX · 单位」标签），
 *   于是同一个 App 里两个页面自相矛盾。
 *
 * 另一处同源问题：syncChip(rec) 对 fromServer 记录会落到最后一行显示「上报中」——
 *   上级指派来的待办本来就在飞书台账里（是别人建的单），根本没有「本机上报」这回事。
 *
 * 修法：① renderStatDetail 的 pending/rectified 改用 recordCard（接收方视角）；
 *       ② syncChip 对 fromServer 直接返回空；
 *       ③ openRecord 对「fromServer 且已整改完成」的走服务端权威详情
 *          （本机没有它的形状，走本机详情页会显示「等待整改」）。
 *
 * 覆盖用例：
 *   T0  页面启动进首页（注入假会话，**零真实后端**）
 *   T1  首页「待整改」明细：写「来自 公司管理甲 · 安环管理部」，不再写「未指定接收人」
 *   T2  「我的整改」tab：同一批记录文案与 T1 一致，且**没有假徽标「上报中」**
 *   T3  对照·派发记录页（我派出去的）：仍然写「派给 作业中心乙 · 保店镇」（不能误伤派发方视角）
 *   T4  首页「已整改」明细：同样带「来自 …」，并保留「完成于 …」
 *   T5  点「待整改」明细的卡片 → 直接进整改流程（view-rectify），接收方能马上干活
 *   T6  点「已整改」明细的卡片 → 打开服务端权威详情（有「完成时间」，不是「等待整改」）
 *
 * 跑法：node worker/test/cfwps79-inbox-card.e2e.mjs
 * 依赖：本机 Chrome（headless）+ worker/node_modules 的 ws。
 * 注意：本用例用桩替换了 window.fetch（不碰任何真实后端 / 真实飞书台账）。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import http from 'node:http';
import { WebSocket } from 'ws';

// T79_ROOT 可指向 frontend/ 的副本，用于「反向验证」（把功能改坏，确认用例真的会失败）
const ROOT = path.resolve(process.env.T79_ROOT || path.resolve(import.meta.dirname, '../../frontend'));
const HTTP_PORT = 9259, CDP_PORT = 9260;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond, extra || '']); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  | ' + extra : '')); };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'check.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

const UD = fs.mkdtempSync(path.join(os.tmpdir(), 't79-'));
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
/* poll：fn 会被**字符串化后在页面里执行** —— 里面只能写页面能见到的东西（不能引用本文件常量/函数）。
   pollNode：fn 在 Node 侧执行（内部一般再调 evalJs），可以自由引用本文件常量与助手函数。 */
const pollNode = async (fn, timeout = 15000, gap = 200) => {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > timeout) return null; await sleep(gap); }
};
const poll = async (fn, timeout = 15000, gap = 200) => {
  const t0 = Date.now();
  let lastErr = '';
  for (;;) { try { const v = await evalJs('(' + fn + ')()'); if (v) return v; } catch (e) { lastErr = String(e.message || e).slice(0, 160); }
    if (Date.now() - t0 > timeout) { if (lastErr) console.log('  (poll 末次异常: ' + lastErr + ')'); return null; } await sleep(gap); }
};

await send('Page.enable'); await send('Runtime.enable');

const INIT = `
(function(){
  try{
    localStorage.setItem('h5_session_token','FAKE_TOKEN_T79');
    localStorage.setItem('h5_session_exp', String(Date.now()+7200*1000));
  }catch(e){}
  const pad = n => String(n).padStart(2,'0');
  const d = new Date();
  const ym = d.getFullYear() + '-' + pad(d.getMonth()+1);
  // 派给我的·待整改
  const PENDING = { record_id: 'recPendingT79', is_violation: '是', violation_desc: '逆行', violation_people: '王五',
    inspection_time: ym + '-13 09:00', todo_status: '待整改',
    assigner_id: '1001', assigner_name: '公司管理甲', assigner_dept: '安环管理部',
    assigned_at: ym + '-13 09:05', todo_town: '保店镇' };
  // 派给我的·已整改完成（本自然月，否则「已整改」明细会按月过滤掉）
  const DONE = { record_id: 'recDoneT79', is_violation: '是', violation_desc: '闯红灯', violation_people: '赵六',
    inspection_time: ym + '-10 08:00', todo_status: '已完成',
    assigner_id: '1001', assigner_name: '公司管理甲', assigner_dept: '安环管理部',
    assigned_at: ym + '-10 08:10', done_at: ym + '-11 15:30', note: '已清理完毕', todo_town: '保店镇' };
  // 我派出去的（对照：派发方视角，assigneeName 有值）
  const DISP = { record_id: 'recDispatchedT79', is_violation: '是', violation_desc: '闯红灯', violation_people: '赵六',
    inspection_time: ym + '-13 08:00', todo_status: '待整改',
    assignee_name: '作业中心乙', town: '保店镇', assigned_at: ym + '-13 08:10' };
  const realFetch = window.fetch;
  window.fetch = function(input, opt){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const m = /^\\/api\\/mobile(.*)$/.exec(url);
    if(!m) return realFetch.apply(this, arguments);
    const p = m[1];
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
    if(p === '/me') return Promise.resolve(reply({ success: true, must_change_password: false,
      employee: { employee_code: '13800000079', name: '接收人测试', department: '保店镇', position: '管理员', grid_level: '一级', role: '管理员', superior: '公司管理甲' } }));
    if(p === '/patrol/meta') return Promise.resolve(reply({ success: true, employee: {}, grids: ['测试网格'], violation_types: ['逆行'], problem_types: [] }));
    if(p === '/inbox') return Promise.resolve(reply({ success: true, todos: [PENDING, DONE], pending_count: 1, monthly_done_count: 1 }));
    if(p === '/dispatched') return Promise.resolve(reply({ success: true, records: [DISP], count: 1, pending_count: 1, done_count: 0, total: 1, monthly_dispatch_count: 1, done_records: [] }));
    if(p === '/summary') return Promise.resolve(reply({ success: true, stats: { pending: 1 } }));
    if(p === '/patrol/records') return Promise.resolve(reply({ success: true, records: [] }));
    return Promise.resolve(reply({ success: true }));
  };
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/check.html` });
const booted = await poll(() => typeof session !== 'undefined' && !!session && session.id === '13800000079'
  && document.querySelector('#view-home') && !document.querySelector('#view-home').classList.contains('hidden'), 20000);
ok('T0 页面启动进首页（fake 会话）', !!booted);
if (!booted) { console.log('启动失败，后续用例无意义，提前退出'); ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(1); }

const cardText = (sel) => evalJs(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return '';return Array.from(b.querySelectorAll('.record-card')).map(c=>c.textContent.replace(/\\s+/g,' ').trim()).join(' ⏐ ');})()`);
const activeView = () => evalJs(`(()=>{const v=document.querySelector('.view.active');return v?v.id:'';})()`);
const clickCard = (sel, i) => evalJs(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return false;const c=b.querySelectorAll('.record-card')[${i || 0}];if(!c)return false;c.click();return true;})()`);

/* ---------- T1：首页「待整改」明细（接收方视角） ---------- */
console.log('\n── T1 首页「待整改」明细 ──');
await evalJs(`openStatDetail('pending')`);
const t1 = await pollNode(() => cardText('#stat-detail-body').then(t => t.includes('逆行') ? t : null));
ok('T1a 「待整改」明细渲染出卡片', !!t1, (t1 || '').slice(0, 90));
ok('T1b 卡片带「来自 公司管理甲 · 安环管理部」来源标签', /来自 公司管理甲 · 安环管理部/.test(t1 || ''), t1 || '');
ok('T1c **不再**写「未指定接收人」（以前每条都这么写）', !/未指定接收人/.test(t1 || ''), t1 || '');
ok('T1d 不再用派发方口吻「派给 …」', !/派给 /.test(t1 || ''), t1 || '');

/* ---------- T2：「我的整改」tab 文案一致 + 无假徽标 ---------- */
console.log('\n── T2 「我的整改」tab ──');
await evalJs(`showView('my-rectify'); renderMyRectify()`);
const t2 = await pollNode(() => cardText('#my-rectify-list').then(t => t.includes('逆行') ? t : null));
ok('T2a 「我的整改」渲染出同一条', !!t2, (t2 || '').slice(0, 90));
ok('T2b 带「来自 公司管理甲」来源标签', /来自 公司管理甲/.test(t2 || ''), t2 || '');
ok('T2c **没有假徽标「上报中」**（fromServer 记录不该有本机上报状态）', !/上报中/.test(t2 || ''), t2 || '');
ok('T2d 与「待整改」明细文案一致（同一个 App 不自相矛盾）', (t1 || '').replace(/点击开始整改/g, '') === (t2 || '').replace(/点击开始整改/g, ''),
  'pending=' + (t1 || '').slice(0, 70) + ' / rectify=' + (t2 || '').slice(0, 70));

/* ---------- T3：对照 · 派发记录页仍是派发方口吻（不能误伤） ---------- */
console.log('\n── T3 对照：派发记录页（我派出去的）──');
await evalJs(`showView('dispatch'); renderDispatch()`);
const t3 = await pollNode(() => evalJs(`(()=>{const b=document.querySelector('#dispatch-list');if(!b)return '';const s=Array.from(b.querySelectorAll('.record-card')).map(c=>c.textContent.replace(/\\s+/g,' ').trim()).join(' ⏐ ');return s.includes('闯红灯')?s:'';})()`));
ok('T3a 派发记录页仍写「派给 作业中心乙 · 保店镇」', /派给 作业中心乙 · 保店镇/.test(t3 || ''), t3 || '');
ok('T3b 派发记录页仍保留「派发于 …」', /派发于 /.test(t3 || ''), t3 || '');

/* ---------- T4：首页「已整改」明细 ---------- */
console.log('\n── T4 首页「已整改」明细 ──');
await evalJs(`openStatDetail('rectified')`);
const t4 = await pollNode(() => cardText('#stat-detail-body').then(t => t.includes('闯红灯') ? t : null));
ok('T4a 「已整改」明细渲染出卡片', !!t4, (t4 || '').slice(0, 90));
ok('T4b 带「来自 公司管理甲」来源标签', /来自 公司管理甲/.test(t4 || ''), t4 || '');
ok('T4c 保留「完成于 …」（原来是 dispatchCard 的 doneAt 行）', /完成于 /.test(t4 || ''), t4 || '');
ok('T4d 不写「未指定接收人」', !/未指定接收人/.test(t4 || ''), t4 || '');

/* ---------- T5：点「待整改」明细的卡片 → 直接进整改流程 ---------- */
console.log('\n── T5 待整改明细卡片可点进整改 ──');
await evalJs(`openStatDetail('pending')`);
await pollNode(() => cardText('#stat-detail-body').then(t => t.includes('逆行') ? t : null));
await clickCard('#stat-detail-body', 0);
const t5view = await pollNode(() => activeView().then(v => v === 'view-rectify' ? v : null), 6000);
ok('T5 点卡片进入整改页（接收方能马上干活）', !!t5view, await activeView());

/* ---------- T6：点「已整改」明细的卡片 → 服务端权威详情 ---------- */
console.log('\n── T6 已整改明细卡片进服务端详情 ──');
await evalJs(`openStatDetail('rectified')`);
await pollNode(() => cardText('#stat-detail-body').then(t => t.includes('闯红灯') ? t : null));
await clickCard('#stat-detail-body', 0);
const t6view = await pollNode(() => activeView().then(v => v === 'view-detail' ? v : null), 6000);
const t6txt = await evalJs(`(document.querySelector('#detail-body')||{}).textContent||''`);
ok('T6a 点卡片进入详情页', !!t6view, await activeView());
ok('T6b 显示服务端权威字段（完成时间）', /完成时间：/.test(t6txt), t6txt.replace(/\s+/g, ' ').slice(0, 110));
ok('T6c **不是**本机形状的「等待整改」', !/等待整改/.test(t6txt), t6txt.replace(/\s+/g, ' ').slice(0, 110));

/* ---------- 收尾 ---------- */
ws.close(); chrome.kill('SIGKILL'); server.close();
fs.rmSync(UD, { recursive: true, force: true });
const bad = results.filter(r => !r[1]);
console.log(`\n===== CF-WPS-79 收件箱卡片 E2E: ${results.length - bad.length}/${results.length} PASS =====`);
if (bad.length) console.log('失败项：\n  - ' + bad.map(r => r[0] + (r[2] ? ' :: ' + r[2] : '')).join('\n  - '));
process.exit(bad.length ? 1 : 0);
