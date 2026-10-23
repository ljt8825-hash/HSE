// 一次性脚本（不提交）：最小复现 —— CDP evaluate 里 async IIFE + File 构造 + pickHazardPhoto。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const BASE = 'http://127.0.0.1:5899';
const PORT = 9254;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'].find((p) => p && fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hse-hz2-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--window-size=390,844', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws; const pending = new Map(); let seq = 0;
const S = (m, p = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); j(new Error('timeout ' + m)); } }, 40000); });
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
const RAW = (x) => S('Runtime.evaluate', { expression: '(async()=>{' + x + '})()', awaitPromise: true, returnByValue: true });
(async () => {
  if (!await connect()) { console.error('cdp fail'); process.exit(1); }
  await S('Page.enable'); await S('Runtime.enable');
  await S('Page.navigate', { url: BASE + '/check.html' }); await sleep(1200);
  await RAW(`localStorage.clear();const j=await fetch('/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13800000003',password:'123456'})}).then(r=>r.json());localStorage.setItem('h5_session_token',j.token);localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 'login='+j.success;`).then(r => console.log('login:', JSON.stringify(r).slice(0, 200)));
  await S('Page.navigate', { url: BASE + '/check.html' });
  await sleep(6000);
  // 1) 简单 async 对象返回
  console.log('simple:', JSON.stringify(await RAW(`return {a:1,b:'x'};`)).slice(0, 200));
  // 2) 不带 await 的同步构造
  console.log('sync :', JSON.stringify(await RAW(`return typeof hazardForm !== 'undefined' ? {cat: hazardForm.category, photos: hazardForm.photos.length} : 'NO hazardForm';`)).slice(0, 200));
  // 3) 完整照片链路，打印原始 result
  const raw = await RAW(`
    const bin = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='), c=>c.charCodeAt(0));
    const f = new File([bin],'t.png',{type:'image/png'});
    const inp = document.querySelector('#hz-file-album');
    const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,2500));
    return {photos: hazardForm.photos.length, imgs: document.querySelectorAll('#hz-photos .hz-photo').length};
  `);
  console.log('photo RAW:', JSON.stringify(raw).slice(0, 600));
  // 4) 看 compressImage 是否报错：直接调用
  const raw2 = await RAW(`
    const bin = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='), c=>c.charCodeAt(0));
    const f = new File([bin],'t.png',{type:'image/png'});
    const out = await new Promise(res => compressImage(f, d => res(d ? d.length : null)));
    return 'compress=' + out;
  `);
  console.log('compress RAW:', JSON.stringify(raw2).slice(0, 300));
})().catch(e => console.error('EXC', e.message)).finally(() => { chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); });
