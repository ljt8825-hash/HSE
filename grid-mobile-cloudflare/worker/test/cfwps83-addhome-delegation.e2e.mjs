/* CF-WPS-83 · 「添加到手机桌面」卡片只有最外圈几像素能点 —— 委托用错了命中判断
 *
 * 缺陷（实测，不是读码推测）：
 *   document 级点击委托用 `e.target.id === 'btn-add-home'` 判断命中，
 *   但 #btn-add-home 是张**多子元素卡片**：
 *       <div id="btn-add-home">
 *         <div>  ← flex 行
 *           <div>添加到手机桌面</div>          ← 标题
 *           <div><svg id="add-home-arrow"/></div>  ← 箭头
 *         </div>
 *         <div id="add-home-hint">点桌面图标…</div>   ← 提示行
 *       </div>
 *   手指点上去 e.target 永远是**某个子元素**，id 是空串 ⇒ 老代码 `if(!t || !t.id) return`
 *   直接把事件吞掉。于是卡片上几乎处处都是死区，只有子元素没铺满的 padding 缝隙好使。
 *
 *   修复前实测（本用例 T1~T4 复现）：
 *     点卡片空白处        → 浮层开   ✅
 *     点标题「添加到手机桌面」→ 浮层**不开** ❌
 *     点右侧箭头 svg      → 浮层**不开** ❌
 *     点底部提示行        → 浮层**不开** ❌
 *   修复后 6/6 → 现在 15 项全绿。
 *
 * 为什么浮层里那两个按钮没暴露同样的问题：
 *   #add-home-do / #add-home-close 是 <button>，只包一层文本，
 *   e.target 就是 button 自己 ⇒ 旧写法在它们身上**碰巧**是对的。
 *   换句话说这个 bug 只在「多子元素卡片」上显形，改完必须顺手把三处一起收口成 closest()。
 *
 * 同类排查（本用例 T12/T13 钉死，防止回潮）：
 *   全文件只有 3 处 click 监听；另两处是元素级绑定（#btn-refresh 用 addEventListener、
 *   .seg-item 用 closest）—— 都天然免疫。同级的三张 cursor:pointer 卡片
 *   （#resume-card / #btn-me-sub / #btn-logout）都用 `el.onclick`，子元素点击会冒泡到元素本身，
 *   所以只有 #btn-add-home 这一处坏了。
 *
 * 跑法：node worker/test/cfwps83-addhome-delegation.e2e.mjs
 * 依赖：本机 Chrome（headless）+ worker/node_modules 的 ws。
 * 注意：本用例用桩替换了 window.fetch（不碰任何真实后端 / 真实飞书台账）。
 * 反向验证：T83_ROOT 可指向 frontend/ 的副本（把 closest 改回 e.target.id 应回到 3/6 起步）。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import http from 'node:http';
import { WebSocket } from 'ws';

const ROOT = path.resolve(process.env.T83_ROOT || path.resolve(import.meta.dirname, '../../frontend'));
const HTTP_PORT = 9291, CDP_PORT = 9292;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ME = '13800000083';

const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond, extra || '']); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  | ' + extra : '')); };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'check.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

const UD = fs.mkdtempSync(path.join(os.tmpdir(), 't83a-'));
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

const INIT = `
(function(){
  try{
    localStorage.setItem('h5_session_token','FAKE_TOKEN_T83A');
    localStorage.setItem('h5_session_exp', String(Date.now()+7200*1000));
    localStorage.setItem('hse_check_v1_${ME}', JSON.stringify({ seq: 1, records: [] }));
  }catch(e){}
  const realFetch = window.fetch;
  window.fetch = function(input, opt){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const m = /^\\/api\\/mobile(.*)$/.exec(url);
    if(!m) return realFetch.apply(this, arguments);
    const p = m[1];
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
    if(p === '/me') return Promise.resolve(reply({ success: true, must_change_password: false,
      employee: { employee_code: '${ME}', name: '桌面测试乙', department: '测试片区', position: '经理', grid_level: '一级', role: '经理', superior: '测试上级' } }));
    if(p === '/patrol/meta') return Promise.resolve(reply({ success: true, employee: {}, grids: ['测试网格'], violation_types: [], problem_types: [] }));
    if(p === '/summary') return Promise.resolve(reply({ success: true, stats: {}, month: '2026-10', month_post: 0, month_dispatch: 0, pending: 0, rectified: 0, dispatch_pending: 0, dispatch_done: 0 }));
    if(p === '/inbox') return Promise.resolve(reply({ success: true, todos: [], pending_count: 0, monthly_done_count: 0, done_count: 0, done_more: false, total: 0 }));
    if(p.indexOf('/dispatched') === 0) return Promise.resolve(reply({ success: true, records: [], done_records: [], pending_count: 0, done_count: 0, total: 0, monthly_dispatch_count: 0, done_more: false }));
    if(p.indexOf('/patrol/records') === 0) return Promise.resolve(reply({ success: true, scope: 'SELF', records: [], total: 0, has_more: false }));
    return Promise.resolve(reply({ success: true }));
  };
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/check.html` });
const booted = await pollNode(() => evalJs(`typeof session !== 'undefined' && !!session && session.id === '${ME}'
  && document.querySelector('#view-home') && document.querySelector('#view-home').classList.contains('active')`), 20000);
if (!booted) { console.log('启动失败'); ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(1); }
await sleep(1500);

/* 进「我的」页（#btn-add-home 在 view-me 里）。
   注意不能用 openTab()——它是 boot() IIFE 内的闭包，外面取不到；
   直接点底部页签，走真实交互路径。 */
await evalJs(`(()=>{const t=document.querySelector('#tabbar .tab-item[data-tab="me"]');
  if(t) t.click(); return !!t;})()`);
await sleep(800);
const onMe = await evalJs(`document.querySelector('#view-me') && document.querySelector('#view-me').classList.contains('active')`);
if (!onMe) { console.log('未能进入「我的」页'); ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(1); }

const modalOpen = () => evalJs(`(()=>{const m=document.getElementById('add-home-modal');return !!m && getComputedStyle(m).display !== 'none';})()`);
const reset = () => evalJs(`(()=>{const m=document.getElementById('add-home-modal'); if(m) m.style.display='none';
  const c=document.getElementById('btn-add-home'); if(c) c.classList.remove('loading');
  const h=document.getElementById('add-home-hint'); if(h) h.textContent='点桌面图标直接进入，下次打开自动登录';
  const b=document.getElementById('add-home-do'); if(b){ b.disabled=false; b.textContent='添加到桌面'; }
  deferredPWAInstall = null; addHomeBusy=false; window.__t83prompt = false; return true;})()`);

// 模拟手指点在某个子元素上：SVG 元素没有 .click()，统一走 dispatchEvent 冒泡
const tap = (expr) => evalJs(`(()=>{const el=${expr}; if(!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window })); return true;})()`);
const who = (expr) => evalJs(`(()=>{const el=${expr}; if(!el) return null;
  return { tag: el.tagName.toLowerCase(), id: el.id||'', text:(el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,20) };})()`);

console.log('\n========== 「我的」→「添加到手机桌面」卡片：逐个子元素点位 ==========');
console.log('（浮层打开 = 有反应；不打开 = 点了没反应）\n');

const POS = [
  ['P1', '点卡片本身（空白处）', `document.getElementById('btn-add-home')`],
  ['P2', '点标题文字「添加到手机桌面」', `document.querySelector('#btn-add-home > div:first-child > div:first-child')`],
  ['P3', '点右侧箭头 svg', `document.getElementById('add-home-arrow')`],
  ['P4', '点底部提示行', `document.getElementById('add-home-hint')`],
];
const got = {};
for (const [tag, label, expr] of POS) {
  await reset();
  const w = await who(expr);
  await tap(expr);
  await sleep(700);
  const open = await modalOpen();
  got[tag] = { open, who: w };
  console.log(`  · [${tag}] ${label}\n        e.target = <${w ? w.tag + (w.id ? ' #' + w.id : '') : '?'}> "${w ? w.text : ''}"   浮层打开=${open}`);
}
console.log('');

ok('T1 点卡片空白处 → 浮层打开（对照组，修前也是对的）', got.P1.open === true);
ok('T2 点标题文字「添加到手机桌面」→ 浮层打开', got.P2.open === true, 'target=' + JSON.stringify(got.P2.who));
ok('T3 点右侧箭头 svg → 浮层打开', got.P3.open === true, 'target=' + JSON.stringify(got.P3.who));
ok('T4 点底部提示行 → 浮层打开', got.P4.open === true, 'target=' + JSON.stringify(got.P4.who));

/* T5：loading 态必须落在**卡片本身**上。
   这条是「closest 返回的是不是卡片」的硬证据：
   若误把子元素传进 pressAddHome，card.classList.add('loading') 会加到子元素上，
   CSS `#btn-add-home.loading #add-home-spin{display:block}` 选不中 ⇒ 转圈不会出现。 */
await reset();
await tap(POS[1][2]);                                    // 点标题文字
await sleep(60);                                          // 260ms 定时器还没到，正在 loading
const loadingState = await evalJs(`(()=>{
  const c = document.getElementById('btn-add-home');
  const spin = document.getElementById('add-home-spin');
  const arrow = document.getElementById('add-home-arrow');
  const hint = document.getElementById('add-home-hint');
  return {
    cardLoading: !!c && c.classList.contains('loading'),
    spinShown: !!spin && getComputedStyle(spin).display !== 'none',
    arrowHidden: !!arrow && getComputedStyle(arrow).display === 'none',
    hintText: hint ? hint.textContent : ''
  };})()`);
ok('T5 点标题文字 → loading 态加在**卡片本身**（转圈可见、箭头隐藏）',
  loadingState.cardLoading && loadingState.spinShown && loadingState.arrowHidden,
  JSON.stringify(loadingState));
ok('T6 点标题文字 → 提示文案变「正在打开…」', loadingState.hintText === '正在打开…', 'hint=' + JSON.stringify(loadingState.hintText));

/* T7/T8：浮层内两个 <button>（旧写法碰巧对，但不能被 closest 改坏） */
await sleep(700);
ok('T7 对照：浮层已打开', (await modalOpen()) === true);
await tap(`document.getElementById('add-home-close')`);
await sleep(300);
ok('T8 对照：点「我知道了」→ 浮层关闭', (await modalOpen()) === false);

/* T9：点浮层里的「添加到桌面」→ doAddHome 真的被调到。
   桩 deferredPWAInstall：userChoice 用永不 resolve 的 Promise，好让按钮停在 loading 态便于断言。 */
await reset();
await evalJs(`deferredPWAInstall = { prompt(){ window.__t83prompt = true; }, userChoice: new Promise(function(){}) };`);
await tap(`document.getElementById('btn-add-home')`);
await sleep(700);
const doVisible = await evalJs(`(()=>{const b=document.getElementById('add-home-do');return !!b && getComputedStyle(b).display !== 'none';})()`);
ok('T9 桩 deferredPWAInstall 后浮层露出「添加到桌面」按钮', doVisible === true);
await tap(`document.getElementById('add-home-do')`);
await sleep(300);
const doState = await evalJs(`(()=>{const b=document.getElementById('add-home-do');
  return { prompted: window.__t83prompt === true, disabled: !!b && b.disabled, text: b ? b.textContent : '' };})()`);
ok('T10 点「添加到桌面」→ 唤起系统安装框（prompt 被调、按钮进 loading）',
  doState.prompted && doState.disabled && doState.text === '正在唤起…', JSON.stringify(doState));

/* T11：浮层开着时点浮层空白区（非按钮）→ 不应误触发卡片、浮层也不该被关掉。
   这是 closest('#btn-add-home') 不会把浮层算进去的反向证据。 */
await reset();
await evalJs(`deferredPWAInstall = null;`);
await tap(`document.getElementById('btn-add-home')`);
await sleep(700);
await tap(`document.getElementById('add-home-body')`);
await sleep(300);
const afterBodyTap = await evalJs(`(()=>{
  const c = document.getElementById('btn-add-home'); const m = document.getElementById('add-home-modal');
  return { stillOpen: !!m && getComputedStyle(m).display !== 'none', cardLoading: !!c && c.classList.contains('loading') };})()`);
ok('T11 浮层开着点浮层正文 → 浮层不被误关、卡片不被误触发',
  afterBodyTap.stillOpen && !afterBodyTap.cardLoading, JSON.stringify(afterBodyTap));

/* T12~T15：静态护栏，防回潮 —— 这四条是本用例真正的价值所在（改代码时最容易再犯） */
const src = fs.readFileSync(path.join(ROOT, 'check.html'), 'utf8');

ok('T12 委托命中改用 closest("#btn-add-home")，不再看 e.target.id',
  /t\.closest\('#btn-add-home'\)/.test(src) && /if\(!t \|\| !t\.closest\) return;/.test(src),
  'closest=' + /t\.closest\('#btn-add-home'\)/.test(src));

/* T13 是本用例的**防回潮核心**：每一处 document 级 click 委托都必须靠 closest() 命中，
   且不得再去读 target 的 .id。
   （写成「检查委托块内容」而不是「全文搜 e.target.id」，是因为旧代码写的是
     `const t = e.target; ... t.id === 'btn-add-home'` —— 搜 e.target.id 搜不到，
     反向验证时会假绿。实测：旧写法下这条必须红。） */
const clickBlocks = src.split(/document\.addEventListener\(\s*['"]click/).slice(1).map(s => s.slice(0, 600));
const idBased = clickBlocks.filter(b => !/\.closest\(/.test(b) || /\.id\b/.test(b));
ok('T13 每处 document 级 click 委托都用 closest() 命中、不读 target.id',
  clickBlocks.length === 2 && idBased.length === 0,
  '委托块=' + clickBlocks.length + ' 违规=' + idBased.length +
  (idBased.length ? ' 首块片段=' + JSON.stringify(idBased[0].replace(/\s+/g, ' ').slice(0, 90)) : ''));

const clickListeners = src.match(/addEventListener\(\s*['"]click/g) || [];
ok('T14 全文件仍只有 3 处 click 监听（新增委托需同步复核 closest）',
  clickListeners.length === 3, '出现次数=' + clickListeners.length);

/* T15：同级三张 cursor:pointer 卡片必须是**元素级绑定**（子元素冒泡即生效），
   将来若有人把它们改成 document 委托 + e.target.id，这里会先红。 */
ok('T15 同级可点卡片（#resume-card/#btn-me-sub/#btn-logout）仍是元素级绑定',
  /card\.onclick\s*=/.test(src) && /\$\("#btn-me-sub"\)\.onclick\s*=/.test(src) && /\$\("#btn-logout"\)\.onclick\s*=/.test(src));

ws.close(); chrome.kill('SIGKILL'); server.close();
try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
const bad = results.filter(r => !r[1]);
console.log(`\n===== CF-WPS-83 添加到桌面卡片委托 E2E: ${results.length - bad.length}/${results.length} PASS =====`);
if (bad.length) console.log('失败项：\n  - ' + bad.map(r => r[0] + (r[2] ? ' :: ' + r[2] : '')).join('\n  - '));
process.exit(bad.length ? 1 : 0);
