// 一次性脚本（不提交）：CF-WPS-100 UI 冒烟 —— 真浏览器跑完「指派 → 整改人待办 → 提交整改 → 安环部验收」整条闭环。
// 前置：页面在 127.0.0.1:5899（_pages_deploy），Worker 在 127.0.0.1:8787（wrangler dev 已热重载）。
// 账号：刘金涛(安环部) / 马金华(整改人)。token 用与 Worker 相同的 HS256 现签（绕开密码，只验 UI 链路）。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { signJwtHs256 } from '../index.js';

const BASE = 'http://127.0.0.1:5899';
const PORT = 9262;
const OUT = path.resolve('test/_cfwps100_shots');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('no chrome'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hse-hz100-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--window-size=390,844', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws; const pending = new Map(); let seq = 0;
const S = (m, p = {}) => new Promise((r, j) => {
  const id = ++seq; pending.set(id, { r, j });
  ws.send(JSON.stringify({ id, method: m, params: p }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); j(new Error('timeout ' + m)); } }, 40000);
});
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const pg = l.find((t) => t.type === 'page');
      if (pg && pg.webSocketDebuggerUrl) {
        ws = new WebSocket(pg.webSocketDebuggerUrl);
        ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.id && pending.has(m.id)) { pending.get(m.id).r(m.result); pending.delete(m.id); } };
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; setTimeout(j, 5000); });
        return true;
      }
    } catch { }
    await sleep(500);
  }
  return false;
}
const E = (x) => S('Runtime.evaluate', { expression: '(async()=>{' + x + '})()', awaitPromise: true, returnByValue: true })
  .then((r) => (r.exceptionDetails ? { __err: (r.exceptionDetails.exception || {}).description } : r.result && r.result.value));
const shot = async (n) => { const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); console.log('  -> ' + n); };
const poll = async (fnExpr, timeout = 20000) => {
  const t0 = Date.now();
  for (; ;) { const v = await E(fnExpr); if (v && !v.__err && v !== 0 && v !== false && v !== null) return v; if (Date.now() - t0 > timeout) return v; await sleep(400); }
};
let pass = 0, fail = 0;
const ck = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + JSON.stringify(extra) : '')); };

// 现签 token（secret 与本地 wrangler dev 的 .dev.vars 一致）
const devTxt = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const dev = Object.fromEntries(devTxt.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); let v = l.slice(i + 1).trim().replace(/\s*#.*$/, '').trim().replace(/^"(.*)"$/, '$1'); return [l.slice(0, i).trim(), v]; }));
const tok = (sub, name, department, role) => signJwtHs256({
  iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub, name, department,
  position: role === '公司管理' ? '公司管理' : '管理员', role,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  jti: crypto.randomUUID(), pwd: 1,
}, dev.WORKER_SESSION_SECRET);
const A_TOKEN = await tok('13385340822', '刘金涛', '安环管理部', '公司管理');
const R_TOKEN = await tok('13774955144', '马金华', '宁城街道一班', '管理员');

const created = [];
(async () => {
  if (!await connect()) { console.error('CDP 连接失败'); process.exit(1); }
  await S('Page.enable'); await S('Runtime.enable');
  await S('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });

  // 0) 先用 API 造一条「待指派」隐患（指派 UI 的输入）
  const now = new Date(), pad = (n) => String(n).padStart(2, '0');
  const findTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const mk = await (await fetch('http://127.0.0.1:8787/api/mobile/hazard/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A_TOKEN },
    body: JSON.stringify({ category: '设备设施', level: '一般隐患', location: 'CF-WPS-100 UI 测试位', description: 'CF-WPS-100 UI 闭环测试（可删）', find_time: findTime, client_request_id: 'ui100a' + Date.now().toString(36) }),
  })).json();
  const recId = (mk.recordIds || [])[0] || '';
  ck('API 预造隐患', !!recId, mk);
  if (recId) created.push(recId);

  // 1) 刘金涛（安环部）登录进隐患列表
  await S('Page.navigate', { url: BASE + '/check.html' }); await sleep(1000);
  await E(`localStorage.clear();sessionStorage.clear();
    localStorage.setItem('h5_session_token',${JSON.stringify(A_TOKEN)});
    localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 1`);
  await S('Page.navigate', { url: BASE + '/check.html' });
  const home = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('安环部进入首页', home === 1);
  await E(`document.querySelector('#hazard-entry-card').click();return 1`);
  const listOk = await poll(`return document.querySelectorAll('#hazard-list .card').length`, 25000);
  ck('隐患列表有记录', listOk >= 1, { listOk });
  const build = await E(`return document.querySelector('meta[name="hse-build"]')?.content`);
  ck('页面版本 = .101', build === '2026-10-16.101', build);
  const hasSeg = await E(`return document.querySelectorAll('#view-hazard-list .seg-item').length`);
  ck('列表有「我登记的/全部隐患」切换', hasSeg === 2, { hasSeg });
  await shot('hz100-1-list.png');

  // 2) 点开刚造的那条 → 指派整改
  const opened = await poll(`
    const cards=[...document.querySelectorAll('#hazard-list .card')];
    const hit=cards.find(c=>/CF-WPS-100 UI 闭环测试/.test(c.textContent));
    if(hit){hit.click();return 1;} return 0;
  `, 15000);
  ck('点开测试隐患进详情', opened === 1);
  const detail = await poll(`const t=document.querySelector('#hazard-detail')?.textContent||'';return /整改进展/.test(t)?1:0`, 15000);
  ck('详情有「整改进展」卡', detail === 1);
  const unassigned = await E(`return /尚未指派整改人/.test(document.querySelector('#hazard-detail').textContent)?1:0`);
  ck('未指派时显示「尚未指派整改人」', unassigned === 1);
  const assignBtn = await E(`const b=document.querySelector('#btn-hz-detail-assign');if(b){b.click();return 1}return 0`);
  ck('详情有「指派整改」按钮并可点', assignBtn === 1);
  const assignView = await poll(`return document.querySelector('#view-hazard-assign')?.classList.contains('active')?1:0`, 10000);
  ck('进入指派页', assignView === 1);
  await shot('hz100-2-assign.png');

  // 3) 搜索并选马金华 → 确认指派
  const searched = await poll(`
    const q=document.querySelector('#hz-assign-q');
    q.value='马金华';q.dispatchEvent(new Event('input',{bubbles:true}));return 1;
  `, 8000);
  const cands = await poll(`return document.querySelectorAll('#hz-assign-cands .hz-cand').length`, 15000);
  ck('候选人列表有结果', cands >= 1, { cands });
  const picked = await E(`
    const c=[...document.querySelectorAll('#hz-assign-cands .hz-cand')].find(x=>/马金华/.test(x.textContent));
    if(c){c.click();return document.querySelector('#btn-hz-assign-ok').disabled?0:1} return 0;
  `);
  ck('选中马金华后「确认指派」可点', picked === 1);
  const ddl = await E(`return document.querySelector('#hz-assign-deadline').value`);
  ck('期限默认一周内', /^\d{4}-\d{2}-\d{2}$/.test(ddl || ''), ddl);
  await shot('hz100-3-assign-picked.png');
  await E(`document.querySelector('#btn-hz-assign-ok').click();return 1`);
  const assigned = await poll(`
    const t=document.querySelector('#hazard-detail')?.textContent||'';
    return /整改人：马金华/.test(t)?1:0;
  `, 20000);
  ck('指派后详情显示整改人马金华', assigned === 1);
  await shot('hz100-4-assigned-detail.png');

  // 4) 切到马金华（整改人）→ 我的页 → 派给我的隐患
  await E(`localStorage.setItem('h5_session_token',${JSON.stringify(R_TOKEN)});
    localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 1`);
  await S('Page.navigate', { url: BASE + '/check.html' });
  const home2 = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('整改人进入首页', home2 === 1);
  await E(`document.querySelector('[data-tab="me"]').click();return 1`);
  const todoCard = await poll(`return document.querySelector('#btn-me-hazard-todo') && document.querySelector('#btn-me-hazard-todo').style.display!=='none' ? 1 : 0`, 15000);
  ck('「我的」页出现「派给我的隐患」入口', todoCard === 1);
  const hint = await E(`return document.querySelector('#me-hazard-todo-hint')?.textContent`);
  ck('入口条数提示', /1 条待处理/.test(hint || ''), hint);
  await E(`document.querySelector('#btn-me-hazard-todo').click();return 1`);
  const todoView = await poll(`return document.querySelector('#view-hazard-todos')?.classList.contains('active')?1:0`, 10000);
  ck('进入待办列表', todoView === 1);
  const todoCardOk = await poll(`return document.querySelectorAll('#hazard-todo-list .card').length`, 15000);
  ck('待办列表有 1 条', todoCardOk === 1, { todoCardOk });
  await shot('hz100-5-todos.png');
  await E(`document.querySelector('#hazard-todo-list .card').click();return 1`);
  const rectifyView = await poll(`return document.querySelector('#view-hazard-rectify')?.classList.contains('active')?1:0`, 10000);
  ck('进入提交整改页', rectifyView === 1);
  const brief = await E(`return /CF-WPS-100 UI 闭环测试/.test(document.querySelector('#hz-rectify-brief').textContent)?1:0`);
  ck('提交页展示隐患内容', brief === 1);
  await shot('hz100-6-rectify.png');

  // 5) 填说明 → 提交（不拍照片也允许；UI 上先验证空说明可交）
  await E(`const n=document.querySelector('#hz-rectify-note');n.value='已加装防护罩并清理通道';n.dispatchEvent(new Event('input',{bubbles:true}));return 1`);
  await E(`document.querySelector('#btn-hz-rectify-ok').click();return 1`);
  const reviewed = await poll(`
    const t=document.querySelector('#view-hazard-todos')?.textContent||'';
    if(/整改已提交|等待安环部验收/.test(t)) return 1;
    return document.querySelectorAll('#hazard-todo-list .card').length===0?1:0;
  `, 25000);
  ck('提交后回待办列表（待整改清空）', reviewed === 1);
  await shot('hz100-7-after-submit.png');

  // 6) 马金华的「派给我的隐患」入口应隐藏（待验收不算待处理）
  await E(`document.querySelector('[data-tab="me"]').click();return 1`);
  const hidden = await poll(`const c=document.querySelector('#btn-me-hazard-todo');return (c&&c.style.display==='none')?1:0`, 15000);
  ck('提交后入口自动隐藏', hidden === 1);

  // 7) 切回刘金涛 → 隐患验收 → 待验收 1 条 → 详情 → 验收通过
  await E(`localStorage.setItem('h5_session_token',${JSON.stringify(A_TOKEN)});
    localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 1`);
  await S('Page.navigate', { url: BASE + '/check.html' });
  const home3 = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('安环部重新进入首页', home3 === 1);
  await E(`document.querySelector('#hazard-entry-card').click();return 1`);
  await poll(`return document.querySelectorAll('#hazard-list .card').length`, 20000);
  await E(`document.querySelector('#btn-hazard-review').click();return 1`);
  const reviewView = await poll(`return document.querySelector('#view-hazard-review')?.classList.contains('active')?1:0`, 10000);
  ck('进入隐患验收页', reviewView === 1);
  const reviewCount = await poll(`return document.querySelectorAll('#hazard-review-list .card').length`, 15000);
  ck('待验收列表有我们的记录', reviewCount >= 1, { reviewCount });
  await shot('hz100-8-review-list.png');
  await E(`
    const c=[...document.querySelectorAll('#hazard-review-list .card')].find(x=>/CF-WPS-100 UI 闭环测试/.test(x.textContent));
    if(c){c.click();return 1}return 0;
  `);
  const reviewDetail = await poll(`
    const t=document.querySelector('#hazard-detail')?.textContent||'';
    return /整改说明：已加装防护罩/.test(t)&&/待验收/.test(t)?1:0;
  `, 20000);
  ck('验收详情展示整改说明 + 待验收', reviewDetail === 1);
  await shot('hz100-9-review-detail.png');
  await E(`document.querySelector('#btn-hz-detail-pass').click();return 1`);
  const closed = await poll(`
    const t=document.querySelector('#hazard-detail')?.textContent||'';
    return /已闭环/.test(t)&&/闭环时间/.test(t)?1:0;
  `, 20000);
  ck('验收通过 → 详情显示已闭环 + 闭环时间', closed === 1);
  await shot('hz100-10-closed.png');

  // 8) 打回分支另开一条：指派 → 提交 → 打回（带意见）→ 状态回待整改
  const mk2 = await (await fetch('http://127.0.0.1:8787/api/mobile/hazard/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A_TOKEN },
    body: JSON.stringify({ category: '消防安全', level: '重大隐患', location: 'CF-WPS-100 UI 打回位', description: 'CF-WPS-100 UI 打回测试（可删）', find_time: findTime, client_request_id: 'ui100b' + Date.now().toString(36) }),
  })).json();
  const rec2 = (mk2.recordIds || [])[0] || '';
  if (rec2) created.push(rec2);
  const tm = new Date(Date.now() + 86400000);
  const deadline = `${tm.getFullYear()}-${pad(tm.getMonth() + 1)}-${pad(tm.getDate())}`;
  await (await fetch('http://127.0.0.1:8787/api/mobile/hazard/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A_TOKEN },
    body: JSON.stringify({ record_id: rec2, assignee_id: '13774955144', deadline }),
  })).json();
  await (await fetch('http://127.0.0.1:8787/api/mobile/hazard/rectify', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + R_TOKEN },
    body: JSON.stringify({ record_id: rec2, note: '已更换灭火器' }),
  })).json();
  // 安环部在验收页打回
  await E(`document.querySelector('#btn-hazard-review').click();return 1`);
  await poll(`return document.querySelectorAll('#hazard-review-list .card').length`, 15000);
  await E(`
    const c=[...document.querySelectorAll('#hazard-review-list .card')].find(x=>/CF-WPS-100 UI 打回测试/.test(x.textContent));
    if(c){c.click();return 1}return 0;
  `);
  const rDetail = await poll(`return /待验收/.test(document.querySelector('#hazard-detail')?.textContent||'')?1:0`, 15000);
  ck('打回用例：进入待验收详情', rDetail === 1);
  await E(`document.querySelector('#btn-hz-detail-reject').click();return 1`);
  const commentShown = await poll(`return document.querySelector('#hz-reject-comment') && document.querySelector('#hz-reject-comment').style.display==='' ?1:0`, 8000);
  ck('点「打回」展开意见输入', commentShown === 1);
  await E(`const c=document.querySelector('#hz-reject-comment');c.value='照片未拍到阀门处';c.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#btn-hz-reject-ok').click();return 1`);
  const rejected = await poll(`
    const t=document.querySelector('#hazard-detail')?.textContent||'';
    return /待整改/.test(t)&&/被打回 1 次/.test(t)&&/照片未拍到阀门处/.test(t)?1:0;
  `, 20000);
  ck('打回后：待整改 + 打回 1 次 + 意见可见', rejected === 1);
  await shot('hz100-11-rejected.png');

  console.log('\n===== ' + pass + ' passed, ' + fail + ' failed =====');
  // 收尾：删 UI 造的记录（测试库）
  try {
    const { getAdapter, storageConfig } = await import('../storage/index.js');
    const env = { ...dev, HTTPS_PROXY: 'http://127.0.0.1:7890', NO_PROXY: '127.0.0.1,localhost' };
    const adapter = getAdapter(env);
    const cfg = await storageConfig(env);
    if (created.length) { await adapter.batchDelete(env, cfg.fileId, cfg.hazardSheetId, created); console.log('CLEAN 删除 ' + created.length + ' 条'); }
  } catch (e) { console.log('WARN 清理失败：' + created.join(',') + ' :: ' + e.message); }
  chrome.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); chrome.kill(); process.exit(1); });
