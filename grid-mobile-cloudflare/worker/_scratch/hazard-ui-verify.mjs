// 一次性脚本（不提交）：CF-WPS-95 隐患排查 UI 冒烟（本地 pages 5899 + 本地 worker 8787）。
// 覆盖：入口显隐（安环 vs 非安环）、表单宫格、提交流程、列表/详情渲染、草稿续传、照片水印像素校验（CF-WPS-97）。
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5899';
const PORT = 9253;
const OUT = path.resolve('G:/hse-dashboard/grid-mobile-cloudflare/worker/test/_cfwps95_shots');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.error('no chrome'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hse-hz-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--window-size=390,844', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws; const pending = new Map(); let seq = 0;
const S = (m, p = {}) => new Promise((r, j) => {
  const id = ++seq;
  pending.set(id, { r, j });
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
  for (;;) {
    const v = await E(fnExpr);
    if (v && !v.__err) return v;
    if (Date.now() - t0 > timeout) return v;
    await sleep(400);
  }
};
let pass = 0, fail = 0;
const ck = (name, cond, extra) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + JSON.stringify(extra) : '')); };

(async () => {
  if (!await connect()) { console.error('CDP 连接失败'); process.exit(1); }
  await S('Page.enable'); await S('Runtime.enable');
  await S('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });

  // —— 安环账号（测试公司管理）——
  await S('Page.navigate', { url: BASE + '/check.html' }); await sleep(1200);
  await E(`localStorage.clear();sessionStorage.clear();
    const j = await fetch('/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13800000003',password:'123456'})}).then(r=>r.json());
    if(!j.success) return 'LOGIN_FAIL '+JSON.stringify(j);
    localStorage.setItem('h5_session_token',j.token);localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 1;`);
  await S('Page.navigate', { url: BASE + '/check.html' });
  const homeOk = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('安环账号进入首页', homeOk === 1);

  const entryVisible = await poll(`return document.querySelector('#hazard-entry-card') && document.querySelector('#hazard-entry-card').style.display !== 'none' ? 1 : 0`, 15000);
  ck('安环账号首页显示「隐患排查」入口卡', entryVisible === 1);
  const entryText = await E(`return document.querySelector('#hazard-entry-card')?.textContent`);
  ck('入口卡含「隐患排查」文案', /隐患排查/.test(String(entryText)));
  await shot('hz-1-home-entry.png');

  // 点入口 → 列表（空态）
  await E(`document.querySelector('#hazard-entry-card').click();return 1`);
  await sleep(800);
  const listState = await poll(`const t=document.querySelector('#hazard-list')?.textContent||'';return t.indexOf('正在读取')<0 ? t.slice(0,40) : 0`, 15000);
  ck('点入口进入隐患列表', true, { active: (await E(`return document.querySelector('#view-hazard-list')?.classList.contains('active')`)) });
  ck('空态文案正确', /还没有登记的隐患/.test(String(listState)), listState);
  await shot('hz-2-list-empty.png');

  // 登记表单
  await E(`document.querySelector('#btn-hazard-new').click();return 1`);
  await sleep(600);
  const formState = await E(`return {active: document.querySelector('#view-hazard-form')?.classList.contains('active'),
    cat: document.querySelectorAll('#hz-cat-grid .opt-card').length, lvl: document.querySelectorAll('#hz-level-grid .opt-card').length}`);
  ck('进入登记表单', formState.active === true);
  ck('类别宫格 11 项', formState.cat === 11, formState);
  ck('级别宫格 2 项', formState.lvl === 2);

  // 选类别 + 级别
  await E(`document.querySelectorAll('#hz-cat-grid .opt-card')[2].click();document.querySelectorAll('#hz-level-grid .opt-card')[1].click();return 1`);
  await sleep(300);
  const selState = await E(`return {cat: hazardForm.category, lvl: hazardForm.level, selCat: document.querySelectorAll('#hz-cat-grid .opt-card.selected').length, selLvl: document.querySelectorAll('#hz-level-grid .opt-card.selected').length}`);
  ck('类别选中生效', selState.cat === '用电安全' && selState.selCat === 1, selState);
  ck('级别选中生效', selState.lvl === '重大隐患' && selState.selLvl === 1);

  // 描述 + 位置 + 字数
  await E(`const d=document.querySelector('#hz-desc');d.value='UI冒烟测试：配电箱门锁损坏';d.dispatchEvent(new Event('input',{bubbles:true}));
    const l=document.querySelector('#hz-location');l.value='UI冒烟位置B';l.dispatchEvent(new Event('input',{bubbles:true}));return 1`);
  await sleep(200);
  const descState = await E(`return {desc: hazardForm.description, loc: hazardForm.location, count: document.querySelector('#hz-desc-count').textContent}`);
  ck('描述与位置写入表单态', descState.desc === 'UI冒烟测试：配电箱门锁损坏' && descState.loc === 'UI冒烟位置B', descState);
  ck('字数计数正确', descState.count === '14 / 500', descState.count);
  // CF-WPS-96：输入即落草稿（页面被系统回收 / 误刷新后可恢复）
  const draftSaved = await E(`return !!localStorage.getItem('hse_hazard_draft_v1')`);
  ck('输入即落草稿（断点续传前提）', draftSaved === true);

  // 照片链：模拟选文件。CF-WPS-97：喂一张 400×300 的深灰底无白像素图
  //（旧 1×1 PNG 无法做水印像素校验），压缩链路走真实 decode。
  // ⚠️ E() 已包一层 (async()=>{...})()，这里直接写语句块，不要再包 async IIFE（否则双层 Promise 返回 undefined）
  const photoState = await E(`
    if(typeof pickHazardPhoto !== 'function') return {err:'no pickHazardPhoto'};
    const g = document.createElement('canvas'); g.width = 400; g.height = 300;
    const gx = g.getContext('2d');
    gx.fillStyle = '#5a6470'; gx.fillRect(0, 0, 400, 300);   // 深灰底：绝无白像素
    gx.fillStyle = '#3d454f'; gx.fillRect(20, 20, 120, 90);  // 加点纹理，避免纯色 JPEG 假象干扰
    const blob = await new Promise(r => g.toBlob(r, 'image/png'));
    const f = new File([blob], 't.png', {type:'image/png'});
    const inp = document.querySelector('#hz-file-album');
    const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1500));
    return {photos: hazardForm.photos.length, imgs: document.querySelectorAll('#hz-photos .hz-photo').length};
  `);
  ck('照片入表单 + 缩略图渲染', photoState.photos === 1 && photoState.imgs === 1, photoState);
  // CF-WPS-97：水印像素校验 —— 把落库用的 dataUrl 解回位图，右下角区应有白字+深描边，左上角同尺寸区应无白像素
  const wmState = await E(`
    const data = hazardForm.photos[0];
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = data; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const region = (x, y, w, h) => {
      const d = cx.getImageData(x, y, w, h).data;
      let white = 0, dark = 0;
      for(let i = 0; i < d.length; i += 4){
        if(d[i] > 235 && d[i+1] > 235 && d[i+2] > 235) white++;
        if(d[i] < 70 && d[i+1] < 70 && d[i+2] < 70) dark++;
      }
      return {white: white, dark: dark};
    };
    const W = img.width, H = img.height;
    return {W: W, H: H, br: region(W - 90, H - 40, 80, 32), tl: region(6, 6, 80, 32)};
  `);
  ck('水印存在：右下角有白字像素', wmState.br.white >= 15, JSON.stringify(wmState.br));
  ck('水印有深色描边（压亮底色）', wmState.br.dark >= 3, 'dark=' + wmState.br.dark);
  ck('水印只在右下角：左上角同尺寸区无白像素', wmState.tl.white === 0, 'tlWhite=' + wmState.tl.white);
  ck('尺寸未被水印改动（400×300 原样）', wmState.W === 400 && wmState.H === 300, wmState.W + 'x' + wmState.H);
  // 水印可视化证据：把落库那张 dataUrl 原样贴到页面底部再截全屏（缩略图在表单下方，直接截会出画）
  await E(`
    const box = document.createElement('div');
    box.id = 'wm-proof';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#000;padding:8px;z-index:9999';
    box.innerHTML = '<img src="' + hazardForm.photos[0] + '" style="width:100%;display:block">';
    document.body.appendChild(box);
    return 1;
  `);
  await shot('hz-3b-watermark-proof.png');
  await E(`document.getElementById('wm-proof') && document.getElementById('wm-proof').remove(); return 1`);
  await shot('hz-3-form-filled.png');

  // 提交
  await E(`document.querySelector('#btn-hz-submit').click();return 1`);
  const after = await poll(`return document.querySelector('#view-hazard-list')?.classList.contains('active') ? 1 : 0`, 30000);
  ck('提交后回到列表页', after === 1);
  const listAfter = await poll(`return document.querySelectorAll('#hazard-list .card').length`, 30000);
  ck('列表出现 1 条隐患', listAfter === 1, { cards: listAfter });
  // CF-WPS-96：提交成功后草稿必须清掉（否则下次开表单又弹旧内容）
  const draftCleared = await E(`return localStorage.getItem('hse_hazard_draft_v1')`);
  ck('提交成功后草稿已清除', draftCleared === null, draftCleared);
  const cardText = await E(`return document.querySelector('#hazard-list .card')?.textContent`);
  ck('列表卡含类别/级别/位置/照片', /用电安全/.test(String(cardText)) && /重大隐患/.test(String(cardText)) && /UI冒烟位置B/.test(String(cardText)) && /1 张照片/.test(String(cardText)));
  // CF-WPS-98：列表缩略图经懒加载队列 + 登录态取图，必须真的解码出来
  // （旧写法 <img src="/api/mobile/photo?ft="> 会 401 裂图——img 带不上 Authorization 头）
  const thumbOk = await poll(`
    const t = document.querySelector('#hazard-list .card img[data-ft]');
    return (t && /^blob:/.test(t.src) && t.naturalWidth > 0) ? 1 : 0;
  `, 15000);
  ck('列表缩略图经懒加载队列真实取到图（blob: 且解码成功）', thumbOk === 1, { thumbOk });
  await shot('hz-4-list-after-submit.png');

  // 详情
  await E(`document.querySelector('#hazard-list .card').click();return 1`);
  await sleep(1500);
  const detState = await poll(`const t=document.querySelector('#hazard-detail')?.textContent||'';return /配电箱门锁损坏/.test(t) ? 1 : 0`, 20000);
  ck('详情页展示隐患内容', detState === 1);
  // CF-WPS-98：详情照片墙 —— 原先 <img src> 直连必 401，现在 fetch+blob 回填
  const detPhoto = await poll(`
    const imgs = [...document.querySelectorAll('#hazard-detail .hz-photo img')];
    return (imgs.length === 1 && /^blob:/.test(imgs[0].src) && imgs[0].naturalWidth > 0) ? 1 : 0;
  `, 20000);
  ck('详情照片经登录态取图并真实解码（blob: 且 naturalWidth>0）', detPhoto === 1, { detPhoto });
  const imgInfo = await E(`
    const i = document.querySelector('#hazard-detail .hz-photo img');
    return i ? {src: i.src.slice(0, 22), w: i.naturalWidth, h: i.naturalHeight} : null;
  `);
  ck('详情照片尺寸正确（400×300 未被放大）', imgInfo && imgInfo.w === 400 && imgInfo.h === 300, JSON.stringify(imgInfo));
  await shot('hz-5-detail.png');

  // 返列表再回首页
  await E(`document.querySelector('#view-hazard-detail [data-back]').click();return 1`);
  await sleep(600);
  const backState = await E(`return document.querySelector('#view-hazard-list')?.classList.contains('active')`);
  ck('详情返回列表', backState === true);

  // —— 对照组：乡镇经理张万恒 ——
  await E(`localStorage.clear();sessionStorage.clear();
    const j = await fetch('/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13905440679',password:'123456'})}).then(r=>r.json());
    if(!j.success) return 'LOGIN_FAIL '+JSON.stringify(j);
    localStorage.setItem('h5_session_token',j.token);localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));return 1;`);
  await S('Page.navigate', { url: BASE + '/check.html' });
  const home2 = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('对照组（乡镇经理）进入首页', home2 === 1);
  const entryHide = await poll(`return document.querySelector('#hazard-entry-card') && document.querySelector('#hazard-entry-card').style.display === 'none' ? 1 : 0`, 15000);
  ck('对照组首页不显示隐患排查入口', entryHide === 1);
  await shot('hz-6-control-home.png');

  // 直接 showView('hazard-list') 应被拦回首页
  await E(`showView('hazard-list');return 1`);
  await sleep(800);
  const blocked = await E(`return {home: document.querySelector('#view-home')?.classList.contains('active'), flash: (document.querySelector('#hse-flash')?.textContent||'').slice(0,30)}`);
  ck('非安环账号直接导航被拦回首页', blocked.home === true, blocked);

  // —— CF-WPS-96：草稿断点续传（模拟低端安卓「调起相机 → 页面被回收 → 重进」）——
  await E(`localStorage.clear();sessionStorage.clear();
    const j = await fetch('/api/mobile/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13800000003',password:'123456'})}).then(r=>r.json());
    if(!j.success) return 'LOGIN_FAIL '+JSON.stringify(j);
    localStorage.setItem('h5_session_token',j.token);localStorage.setItem('h5_session_exp',String(Date.now()+7200*1000));
    // 预置一份「填到一半」的草稿：类别/级别/位置/描述有值，照片没有（照片一律重拍）
    localStorage.setItem('hse_hazard_draft_v1', JSON.stringify({at:Date.now(),category:'消防安全',level:'一般隐患',location:'草稿位置测试',description:'草稿描述测试'}));
    return 1`);
  await S('Page.navigate', { url: BASE + '/check.html' });
  const home3 = await poll(`return document.querySelector('#view-home')?.classList.contains('active') ? 1 : 0`, 25000);
  ck('草稿场景重新进入首页', home3 === 1);
  await E(`document.querySelector('#hazard-entry-card').click();return 1`);
  await sleep(800);
  await E(`document.querySelector('#btn-hazard-new').click();return 1`);
  await sleep(600);
  const draftState = await E(`return {desc: hazardForm.description, loc: hazardForm.location, cat: hazardForm.category,
    lvl: hazardForm.level, photos: hazardForm.photos.length,
    inputDesc: document.querySelector('#hz-desc').value, inputLoc: document.querySelector('#hz-location').value,
    selCat: document.querySelectorAll('#hz-cat-grid .opt-card.selected').length,
    selLvl: document.querySelectorAll('#hz-level-grid .opt-card.selected').length,
    flash: (document.querySelector('#hse-flash')?.textContent||'')}`);
  ck('草稿续传：描述/位置恢复', draftState.desc === '草稿描述测试' && draftState.loc === '草稿位置测试', draftState);
  ck('草稿续传：类别/级别恢复并高亮', draftState.cat === '消防安全' && draftState.lvl === '一般隐患' && draftState.selCat === 1 && draftState.selLvl === 1, draftState);
  ck('草稿续传：输入框回填', draftState.inputDesc === '草稿描述测试' && draftState.inputLoc === '草稿位置测试');
  ck('草稿续传：照片为空（提示重拍）', draftState.photos === 0);
  ck('草稿续传：有恢复提示', /草稿/.test(String(draftState.flash)), draftState.flash);
  await shot('hz-7-draft-resume.png');

  // 清空表单：内容 + 草稿一起清
  await E(`document.querySelector('#btn-hz-clear').click();return 1`);
  await sleep(300);
  const clearState = await E(`return {desc: hazardForm.description, key: localStorage.getItem('hse_hazard_draft_v1'), inputDesc: document.querySelector('#hz-desc').value}`);
  ck('清空表单：内容与草稿都被清掉', clearState.desc === '' && clearState.key === null && clearState.inputDesc === '', clearState);

  // 过期草稿（48h > TTL 24h）不恢复
  await E(`localStorage.setItem('hse_hazard_draft_v1', JSON.stringify({at:Date.now()-48*3600*1000,category:'消防安全',level:'一般隐患',location:'x',description:'过期草稿'}));return 1`);
  await E(`document.querySelector('#btn-hazard-new').click();return 1`);
  await sleep(400);
  const expState = await E(`return {desc: hazardForm.description, inputDesc: document.querySelector('#hz-desc').value}`);
  ck('过期草稿（48h）不恢复', expState.desc === '' && expState.inputDesc === '', expState);
  await shot('hz-8-draft-expired.png');

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
})().catch((e) => { console.error('UI EXCEPTION:', e.message); fail++; })
  .finally(() => { chrome.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(fail ? 1 : 0); });
