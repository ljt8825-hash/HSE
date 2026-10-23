import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = 9269;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'].find(p => p && fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hse-sh2-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws; const pending = new Map(); let seq = 0; let navCount = 0;
const S = (m, p = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); j(new Error('timeout ' + m)); } }, 40000); });
(async () => {
  for (let i = 0; i < 40; i++) { try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); const pg = l.find(t => t.type === 'page'); if (pg && pg.webSocketDebuggerUrl) { ws = new WebSocket(pg.webSocketDebuggerUrl); ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.id && pending.has(m.id)) { pending.get(m.id).r(m.result); pending.delete(m.id); } if (m.method === 'Page.frameNavigated' && m.params && m.params.frame && !m.params.frame.parentId) navCount++; }; await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; setTimeout(j, 5000); }); break; } } catch {} await sleep(500); }
  await S('Page.enable'); await S('Runtime.enable');
  const E = (x) => S('Runtime.evaluate', { expression: '(async()=>{' + x + '})()', awaitPromise: true, returnByValue: true }).then(r => (r.exceptionDetails ? { __err: (r.exceptionDetails.exception || {}).description } : r.result && r.result.value));
  let pass = 0, fail = 0; const ck = (n, c, e) => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' | ' + JSON.stringify(e) : '')); };

  // A：旧版页面（meta=.98）加载 → 3s 定时检查 → 应自动重载一次，且不再循环
  navCount = 0;
  await S('Page.navigate', { url: 'http://127.0.0.1:5899/_stale-sim.html' });
  await sleep(500);
  const metaA0 = await E(`return document.querySelector('meta[name="hse-build"]')?.content`);
  ck('模拟旧标签页（meta=2026-10-16.98）', metaA0 === '2026-10-16.98', metaA0);
  await sleep(6500);
  const stA = await E(`return {meta: document.querySelector('meta[name="hse-build"]')?.content, flag: sessionStorage.getItem('hse_build_reloaded_for')}`);
  ck('A 定时检查发现过期 → 自动整页重载', navCount >= 2 && stA.meta === '2026-10-16.98' && stA.flag === '2026-10-16.100', { nav: navCount, ...stA });
  await sleep(5000);
  const stA2 = await E(`return sessionStorage.getItem('hse_build_reloaded_for')`);
  ck('A 重载后不再循环（导航次数稳定）', navCount === 2, { nav: navCount, flag: stA2 });

  // B：切回标签页触发（visibilitychange，页面加载后立即派发，不等定时器）
  await E(`sessionStorage.clear(); return 1`);
  navCount = 0;
  await S('Page.navigate', { url: 'http://127.0.0.1:5899/_stale-sim.html' });
  await sleep(400);
  await E(`document.dispatchEvent(new Event('visibilitychange')); return 1`);
  await sleep(2500);
  const stB = await E(`return {flag: sessionStorage.getItem('hse_build_reloaded_for')}`);
  ck('B 切回标签页发现过期 → 触发重载（flag=2026-10-16.100）', navCount >= 2 && stB.flag === '2026-10-16.100', { nav: navCount, ...stB });

  // C：版本一致的真实页面 → 绝不重载（先注入登录态，否则 check.html 会跳 login.html）
  await S('Page.navigate', { url: 'http://127.0.0.1:5899/check.html' }); await sleep(1200);
  await E(`sessionStorage.clear();
    const j = await fetch('/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13800000003',password:'123456'})}).then(r=>r.json());
    if(!j.success) return 'LOGIN_FAIL';
    localStorage.setItem('h5_session_token',j.token);localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 1;`);
  navCount = 0;
  await S('Page.navigate', { url: 'http://127.0.0.1:5899/check.html' });
  await sleep(6500);
  const stC = await E(`return {url: location.href, meta: document.querySelector('meta[name="hse-build"]')?.content}`);
  ck('C 真实 .100 页面 + 版本一致 → 不重载', navCount <= 1 && stC.meta === '2026-10-16.100' && /check\.html$/.test(stC.url), { nav: navCount, ...stC });

  console.log('\n===== ' + pass + ' passed, ' + fail + ' failed =====');
  chrome.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); chrome.kill(); process.exit(1); });
