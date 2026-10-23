// 一次性脚本（不提交）：复现用户报告——用刘金涛账号打开库里已有的隐患记录，照片是否显示。
// 全新 Chrome profile + 全量加载 .99，排除「旧标签页跑旧代码」因素。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5899';
const PORT = 9261;
const OUT = path.resolve('G:/hse-dashboard/grid-mobile-cloudflare/worker/test/_cfwps95_shots');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('no chrome'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hse-repro-'));
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
    } catch {}
    await sleep(500);
  }
  return false;
}
const E = (x) => S('Runtime.evaluate', { expression: '(async()=>{' + x + '})()', awaitPromise: true, returnByValue: true })
  .then((r) => (r.exceptionDetails ? { __err: (r.exceptionDetails.exception || {}).description } : r.result && r.result.value));
const shot = async (n) => { const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); console.log('  -> ' + n); };
const poll = async (fnExpr, timeout = 20000) => {
  const t0 = Date.now();
  for (;;) { const v = await E(fnExpr); if (v && !v.__err) return v; if (Date.now() - t0 > timeout) return v; await sleep(400); }
};
let pass = 0, fail = 0;
const ck = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + JSON.stringify(extra) : '')); };

(async () => {
  if (!await connect()) { console.error('CDP 连接失败'); process.exit(1); }
  await S('Page.enable'); await S('Runtime.enable');
  await S('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });

  await S('Page.navigate', { url: BASE + '/check.html' }); await sleep(1200);
  const login = await E(`localStorage.clear();sessionStorage.clear();
    const j = await fetch('/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13385340822',password:'123456'})}).then(r=>r.json());
    if(!j.success) return 'LOGIN_FAIL '+JSON.stringify(j);
    localStorage.setItem('h5_session_token',j.token);localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return j.employee.name;`);
  ck('刘金涛登录', login === '刘金涛', login);

  await S('Page.navigate', { url: BASE + '/check.html' });
  const homeOk = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('进入首页', homeOk === 1);
  const build = await E(`return document.querySelector('meta[name="hse-build"]')?.content`);
  ck('页面构建版本 = .100', build === '2026-10-16.100', build);

  // 进隐患列表（用户已有记录，不清库）
  await E(`document.querySelector('#hazard-entry-card').click();return 1`);
  const cards = await poll(`return document.querySelectorAll('#hazard-list .card').length`, 25000);
  ck('列表有条目（用户已提交的隐患）', cards >= 1, { cards });

  // 点开第一条（= 用户「点开这一项」）
  await E(`document.querySelector('#hazard-list .card').click();return 1`);
  const detOk = await poll(`const t=document.querySelector('#hazard-detail')?.textContent||'';return /现场照片|隐患位置|隐患描述/.test(t) ? 1 : 0`, 20000);
  ck('进入隐患详情', detOk === 1);

  const photoState = await poll(`
    const imgs = [...document.querySelectorAll('#hazard-detail .hz-photo img')];
    const ok = imgs.filter(i => /^blob:/.test(i.src) && i.naturalWidth > 0).length;
    return {total: imgs.length, ok: ok, label: (document.querySelector('#hazard-detail')?.textContent||'').match(/现场照片（(\\d)）/)?.[1]};
  `, 20000);
  console.log('  照片状态 =', JSON.stringify(photoState));
  ck('详情照片全部真实显示（blob: 且解码成功）', photoState && photoState.total === photoState.ok && photoState.total >= 1, photoState);
  await shot('hz-9-repro-user-record.png');

  // 附带：列表缩略图
  await E(`document.querySelector('#view-hazard-detail [data-back]').click();return 1`);
  await sleep(800);
  const thumbOk = await poll(`
    const t = document.querySelector('#hazard-list .card img[data-ft]');
    return (t && /^blob:/.test(t.src) && t.naturalWidth > 0) ? 1 : 0;
  `, 15000);
  ck('列表缩略图也显示', thumbOk === 1, { thumbOk });
  await shot('hz-10-repro-list.png');

  console.log('\n===== ' + pass + ' passed, ' + fail + ' failed =====');
  chrome.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); chrome.kill(); process.exit(1); });
