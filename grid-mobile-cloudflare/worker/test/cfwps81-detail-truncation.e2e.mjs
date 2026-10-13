/* CF-WPS-81 · 前端侧 —— 首页下钻明细超过 50 条上限时，必须把差额讲清楚
 *
 * 背景：统计卡的数字是**全量口径**（服务端 scanRecords 全表扫描），
 * 而四个下钻明细各有 PATROL_LIST_LIMIT = 50 的截断。后端早就把真实总数
 * （patrol/records.total、inbox.pending_count、inbox.monthly_done_count、
 * dispatched.pending_count/done_count）一起下发了，**前端却一处都没消费**：
 *   · 卡片写 60
 *   · 明细标题写「本月上报 · 50 条」   ← 跟卡片当面打架
 *   · 而且没有任何解释
 * 后端「数字是对的」由 test/cfwps81-count-detail-parity.test.mjs 钉住（26 项）；
 * 本文件钉**前端有没有把差额说出来**。
 *
 * 覆盖用例：
 *   T0  页面启动进首页（注入假会话，**零真实后端**）
 *   T1  本月上报明细：标题写「60 条（仅列最近 50 条）」，且与卡片数字一致
 *   T2  待整改明细：同上
 *   T3  已整改明细：同上
 *   T4  本月派发明细：分段按钮写 60、标题写「60 条（仅列最近 50 条）」
 *   T5  对照：没被截断时（total == 列表长度）**不出现**「仅列最近」
 *   T6  四个明细的数字都与卡片数字一致（核心不变式）
 *
 * 跑法：node worker/test/cfwps81-detail-truncation.e2e.mjs
 * 依赖：本机 Chrome（headless）+ worker/node_modules 的 ws。
 * 注意：本用例用桩替换了 window.fetch（不碰任何真实后端 / 真实飞书台账）。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import http from 'node:http';
import { WebSocket } from 'ws';

// T81_ROOT 可指向 frontend/ 的副本，用于「反向验证」（把功能改坏，确认用例真的会失败）
const ROOT = path.resolve(process.env.T81_ROOT || path.resolve(import.meta.dirname, '../../frontend'));
const HTTP_PORT = 9261, CDP_PORT = 9262;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const LIMIT = 50, TOTAL = 60;

const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond, extra || '']); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  | ' + extra : '')); };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'check.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

const UD = fs.mkdtempSync(path.join(os.tmpdir(), 't81-'));
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

/* 桩：role=经理 → 「本月派发」口径 + 「已整改」卡可见（RECTIFIED_ROLES 含经理）。
   window.__t81.trunc = false 时返回「未被截断」的数据，用于 T5 对照。 */
const INIT = `
(function(){
  try{
    localStorage.setItem('h5_session_token','FAKE_TOKEN_T81');
    localStorage.setItem('h5_session_exp', String(Date.now()+7200*1000));
  }catch(e){}
  const pad = n => String(n).padStart(2,'0');
  const d = new Date();
  const ym = d.getFullYear() + '-' + pad(d.getMonth()+1);
  window.__t81 = { trunc: true, LIMIT: ${LIMIT}, TOTAL: ${TOTAL} };
  const mk = (i, extra) => Object.assign({ record_id: 'recT81' + String(i).padStart(5,'0'),
    is_violation: '是', violation_desc: '逆行', violation_people: '王五',
    inspection_time: ym + '-13 08:00', todo_status: '待整改',
    assigner_name: '公司管理甲', assigner_dept: '安环管理部', assigned_at: ym + '-13 09:00',
    assignee_name: '作业中心乙', town: '保店镇', checker_name: '对账员', photo_count: 1 }, extra || {});
  // 列表**始终**最多 50 条（PATROL_LIST_LIMIT）；只有「真实总数」随截断与否变化。
  const n = () => window.__t81.LIMIT;
  const total = () => window.__t81.trunc ? window.__t81.TOTAL : window.__t81.LIMIT;
  const realFetch = window.fetch;
  window.fetch = function(input, opt){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const m = /^\\/api\\/mobile(.*)$/.exec(url);
    if(!m) return realFetch.apply(this, arguments);
    const p = m[1];
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
    if(p === '/me') return Promise.resolve(reply({ success: true, must_change_password: false,
      employee: { employee_code: '13800000081', name: '对账测试甲', department: '对账片区', position: '经理', grid_level: '一级', role: '经理', superior: '对账上级' } }));
    if(p === '/patrol/meta') return Promise.resolve(reply({ success: true, employee: {}, grids: ['测试网格'], violation_types: ['逆行'], problem_types: [] }));
    if(p === '/summary') return Promise.resolve(reply({ success: true, stats: {}, month: ym,
      month_post: total(), month_dispatch: total(), pending: total(), rectified: total(),
      dispatch_pending: total(), dispatch_done: 0 }));
    if(p.indexOf('/patrol/records') === 0){
      const arr = []; for(let i=0;i<n();i++) arr.push(mk(i));
      return Promise.resolve(reply({ success: true, scope: 'SELF', month: ym,
        total: total(), has_more: window.__t81.trunc, records: arr }));
    }
    if(p === '/inbox'){
      const arr = [];
      for(let i=0;i<n();i++) arr.push(mk(i, { todo_status: '待整改' }));
      for(let i=0;i<n();i++) arr.push(mk(i, { record_id: 'recT81D' + String(i).padStart(4,'0'), todo_status: '已完成', done_at: ym + '-12 15:00' }));
      return Promise.resolve(reply({ success: true, todos: arr, pending_count: total(),
        monthly_done_count: total(), done_count: total(), done_more: window.__t81.trunc, total: arr.length }));
    }
    if(p.indexOf('/dispatched') === 0){
      const arr = []; for(let i=0;i<n();i++) arr.push(mk(i));
      return Promise.resolve(reply({ success: true, records: arr, done_records: [],
        pending_count: total(), done_count: 0, total: total(), monthly_dispatch_count: total(), done_more: false }));
    }
    return Promise.resolve(reply({ success: true }));
  };
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/check.html` });
const booted = await pollNode(() => evalJs(`typeof session !== 'undefined' && !!session && session.id === '13800000081'
  && !!document.querySelector('#view-home') && !document.querySelector('#view-home').classList.contains('hidden')`), 20000);
ok('T0 页面启动进首页（fake 会话，role=经理）', !!booted);
if (!booted) { console.log('启动失败，后续用例无意义，提前退出'); ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(1); }

// 明细页第一条 section-label（= 「标题 · N 条（仅列最近 M 条）」）
const headLabel = () => evalJs(`(()=>{const b=document.querySelector('#stat-detail-body');if(!b)return '';const l=b.querySelector('.section-label');return l?l.textContent.replace(/\\s+/g,' ').trim():'';})()`);
const segLabels = () => evalJs(`(()=>{const b=document.querySelector('#stat-detail-body');if(!b)return '';const s=b.querySelector('.sd-seg');return s?s.textContent.replace(/\\s+/g,' ').trim():'';})()`);
const cardNum = (id) => evalJs(`(()=>{const e=document.getElementById(${JSON.stringify(id)});return e?e.textContent.trim():'';})()`);
const openDrill = async (drill, expect) => {
  await evalJs(`openStatDetail(${JSON.stringify(drill)})`);
  return pollNode(() => headLabel().then(t => (t && (!expect || t.includes(expect))) ? t : null));
};

/* ---------- T1~T4：截断时必须说出「仅列最近 50 条」 ---------- */
console.log('\n── 截断场景（total=' + TOTAL + '，列表 ' + LIMIT + ' 条）──');
const t1 = await openDrill('month_post', '本月上报');
ok('T1 本月上报明细标题带「共 60 条（仅列最近 50 条）」',
  /60 条/.test(t1 || '') && /仅列最近 50 条/.test(t1 || ''), t1 || '');

const t2 = await openDrill('pending', '待整改');
ok('T2 待整改明细标题带「60 条（仅列最近 50 条）」',
  /60 条/.test(t2 || '') && /仅列最近 50 条/.test(t2 || ''), t2 || '');

const t3 = await openDrill('rectified', '已整改');
ok('T3 已整改明细标题带「60 条（仅列最近 50 条）」',
  /60 条/.test(t3 || '') && /仅列最近 50 条/.test(t3 || ''), t3 || '');

const t4 = await openDrill('month_dispatch', '未完成');
const t4seg = await segLabels();
ok('T4a 本月派发明细分段按钮显示真实总数 60（不是 50）',
  /未完成\s*60/.test(t4seg || '') && /已完成\s*0/.test(t4seg || ''), t4seg || '');
ok('T4b 本月派发明细标题带「60 条（仅列最近 50 条）」',
  /60 条/.test(t4 || '') && /仅列最近 50 条/.test(t4 || ''), t4 || '');

/* ---------- T6：卡片数字 == 明细数字（核心不变式） ---------- */
console.log('\n── 核心不变式：卡片数字 == 明细数字 ──');
const cPending = await cardNum('stat-pending');
const cRect = await cardNum('stat-rectified');
const cMonth = await cardNum('stat-month');
ok('T6a 待整改：卡片 ' + cPending + ' == 明细标题里的 60', cPending === String(TOTAL), 'card=' + cPending);
ok('T6b 已整改：卡片 ' + cRect + ' == 明细标题里的 60', cRect === String(TOTAL), 'card=' + cRect);
ok('T6c 本月派发：卡片 ' + cMonth + ' == 明细标题里的 60', cMonth === String(TOTAL), 'card=' + cMonth);
ok('T6d 本月上报明细标题数字 == 卡片同源总数 60', /60 条/.test(t1 || ''), t1 || '');

/* ---------- T5：对照 —— 没被截断时不该出现「仅列最近」 ---------- */
console.log('\n── 对照：未截断（total=50，列表 50 条）──');
await evalJs(`window.__t81.trunc = false; true;`);
const t5a = await openDrill('month_post', '本月上报');
ok('T5a 未截断时标题写「50 条」且**不出现**「仅列最近」',
  /50 条/.test(t5a || '') && !/仅列最近/.test(t5a || ''), t5a || '');
const t5b = await openDrill('pending', '待整改');
ok('T5b 未截断时待整改标题不出现「仅列最近」',
  !/仅列最近/.test(t5b || ''), t5b || '');
const t5c = await openDrill('month_dispatch', '未完成');
const t5seg = await segLabels();
ok('T5c 未截断时分段显示 50 / 0 且标题无「仅列最近」',
  /未完成\s*50/.test(t5seg || '') && !/仅列最近/.test(t5c || ''), (t5seg || '') + ' ｜ ' + (t5c || ''));

/* ---------- 收尾 ---------- */
ws.close(); chrome.kill('SIGKILL'); server.close();
fs.rmSync(UD, { recursive: true, force: true });
const bad = results.filter(r => !r[1]);
console.log(`\n===== CF-WPS-81 下钻截断提示 E2E: ${results.length - bad.length}/${results.length} PASS =====`);
if (bad.length) console.log('失败项：\n  - ' + bad.map(r => r[0] + (r[2] ? ' :: ' + r[2] : '')).join('\n  - '));
process.exit(bad.length ? 1 : 0);
