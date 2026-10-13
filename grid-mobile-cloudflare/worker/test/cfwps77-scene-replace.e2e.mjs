/* CF-WPS-换图 · 前端侧 —— 详情页「换一张现场照片」真浏览器 E2E
 *
 * 用户诉求：「现场照片拍错了要能换」。链路（见 check.html 的 sceneReplaceBox）：
 *   选图（拍照 / 相册）→ compressImage 压缩降采样 → 本地预览 → 确认更换
 *     · 已上报（有 serverRecordId）：POST /upload 拿新 token → POST /patrol/attach
 *       { record_id, kind:'scene', photo_tokens:[新 token] } → 覆盖台账「违章照片」列
 *     · 未上报：只换本机图 + 作废旧 token，下次补传随记录一起上新图
 *
 * 本文件负责**前端契约**：到底有没有发出那次 attach、带的是不是新 token、
 *   token 是不是**只含新图**（覆盖而非追加）、失败时会不会把本机状态改坏。
 * 「台账附件列真的被覆盖了」由后端侧保证，见 test/cfwps77-attach-overwrite.test.mjs。
 * 两者合起来才是完整的「详情页换图 → 台账附件列确实被覆盖」。
 *
 * 覆盖用例：
 *   T0  页面启动进首页（注入假会话，**零真实后端**）
 *   T1  本人已上报记录：详情页出现换图入口（相机 / 相册两个入口）
 *   T2  选图 → 预览 → 确认更换：发出 upload + attach，attach 的 record_id / kind /
 *       photo_tokens 正确，且**不含旧 token**；本机记录与详情页照片同步更新；有成功提示
 *   T3  未上报记录：只换本机图、旧 token 作废，**不发** upload / attach
 *   T4  换图后的待补传记录：补传时旧 token 作废、新图重传且提交 body 用新 token
 *   T5  取消（保留原照片）：不发任何请求、本机状态不变
 *   T6  上传失败：提示失败、本机图与 token 都不变（不能出现「本机新图 + 台账旧图」错配）
 *   T7  补挂失败：同上，且按钮复位可重试
 *   T8  别人的记录：**不显示**换图入口（防换掉别人的照片）
 *   T9  服务端记录详情页（台账 / 派发详情）也能换图 —— 派发出去后本机记录在 UI 里
 *       没有入口，靠 serverRecordId 找回本机照片；换图后服务端视图 token 同步更新
 *   T10 服务端详情的边界：本机无对应记录 / 本机记录不是我的 → 都不给换图入口
 *
 * 跑法：node worker/test/cfwps77-scene-replace.e2e.mjs
 * 依赖：本机 Chrome（headless）+ worker/node_modules 的 ws + test/_assets/big-camera.jpg。
 * 注意：本用例用桩替换了 window.fetch（不碰任何真实后端/真实飞书台账），
 *       所以它不校验真实网络与鉴权 —— 那部分在 worker 侧单测里覆盖。
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import http from 'node:http';
import { WebSocket } from 'ws';

// T77_ROOT 可指向 frontend/ 的副本，用于「反向验证」（把功能改坏，确认用例真的会失败）
const ROOT = path.resolve(process.env.T77_ROOT || path.resolve(import.meta.dirname, '../../frontend'));
const HTTP_PORT = 9257, CDP_PORT = 9258;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REAL_ASSET = process.env.T77_ASSET || path.join(import.meta.dirname, '_assets/big-camera.jpg');
const FAKE_ID = '13800000077';
const OLD_PHOTO = 'data:image/jpeg;base64,OLDOLDOLD';
const OLD_TOKEN = 'OLDTOKEN_T77';
const NEW_TOKEN_1 = 'FTNEWT770001';      // 桩里按调用序号发新 token
// （桩按调用序号发 token：FTNEWT770001、0002…，所以断言里不写死序号）

const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond, extra || '']); console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  | ' + extra : '')); };

/* ---------- 测试图片：优先用 test/_assets/big-camera.jpg；没有就现场生成一张 PNG ----------
   test/_assets/ 在仓库里是**未跟踪**目录，干净克隆下不存在。为了让本用例不依赖它，
   缺图时用 zlib 现写一张 800×1200 的 PNG（浏览器能解码，compressImage 会正常压缩降采样）。 */
import zlib from 'node:zlib';
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC_T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const makePng = (w, h) => {
  const raw = Buffer.alloc(h * (1 + w * 3));
  let p = 0;
  for (let y = 0; y < h; y++) { raw[p++] = 0; for (let x = 0; x < w; x++) { raw[p++] = (x * 7 + y * 3) & 0xff; raw[p++] = (x * 3) & 0xff; raw[p++] = (y * 5) & 0xff; } }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
};
let ASSET = REAL_ASSET;
if (!fs.existsSync(REAL_ASSET)) {
  ASSET = path.join(os.tmpdir(), 't77-generated.png');
  fs.writeFileSync(ASSET, makePng(800, 1200));
  console.log('（未找到 ' + REAL_ASSET + '，已现场生成测试图 ' + ASSET + '）');
}

/* ---------- 静态服务器（只发 frontend/ 下的文件） ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'check.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(HTTP_PORT, '127.0.0.1', r));

/* ---------- Chrome + CDP ---------- */
const UD = fs.mkdtempSync(path.join(os.tmpdir(), 't77-'));
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
  else if (m.method === 'Runtime.consoleAPICalled') console.log('PAGE:', m.params.type, JSON.stringify(m.params.args.map(a => a.value || a.description || a.type)).slice(0, 300));
  else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; console.log('PAGE-EXC:', d.url, d.lineNumber + ':' + d.columnNumber, (d.exception && d.exception.description || '').split('\n').slice(0, 3).join(' | ')); }
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
/* poll：fn 会被**字符串化后在页面里执行** —— 里面只能写页面能见到的东西（不能引用本文件常量）。
   pollNode：fn 在 Node 侧执行（内部一般再调 evalJs），可以自由引用本文件常量与助手函数。 */
const pollNode = async (fn, timeout = 8000, gap = 200) => {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* 继续轮询 */ }
    if (Date.now() - t0 > timeout) return null;
    await sleep(gap);
  }
};
const poll = async (fn, timeout = 8000, gap = 150) => {
  const t0 = Date.now();
  let lastErr = '';
  for (;;) { try { const v = await evalJs('(' + fn + ')()'); if (v) return v; } catch (e) { lastErr = String(e.message || e).slice(0, 200); }
    if (Date.now() - t0 > timeout) { if (lastErr) console.log('  (poll 末次异常: ' + lastErr + ')'); return null; } await sleep(gap); }
};

/* ---------- 注入桩：假会话 + 假 API（不碰任何真实后端） ----------
   失败开关 window.__t77.fail.{upload,attach} 用来演练 T6/T7 的失败分支。 */
await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');
const INIT_SRC = `
(function(){
  try{
    localStorage.setItem('h5_session_token','FAKE_TOKEN_T77');
    localStorage.setItem('h5_session_exp', String(Date.now()+7200*1000));
  }catch(e){}
  window.__api = [];
  window.__t77 = { fail: { upload:false, attach:false }, seq: 0, newToken: function(){ return 'FTNEWT77' + String(++this.seq).padStart(4,'0'); } };
  const realFetch = window.fetch;
  window.fetch = function(input, opt){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const m = /^\\/api\\/mobile(.*)$/.exec(url);
    if(!m) return realFetch.apply(this, arguments);
    const path = m[1];
    let body = null;
    try{ if(opt && opt.body && typeof opt.body === 'string') body = JSON.parse(opt.body); }catch(e){}
    window.__api.push({ path: path, body: body, form: !!(opt && opt.body && typeof opt.body !== 'string') });
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
    if(path === '/me') return Promise.resolve(reply({ success: true, must_change_password: false,
      employee: { employee_code: '${FAKE_ID}', name: '换图测试员', department: '宁城街道', position: '网格长', grid_level: '一级', role: '管理员', superior: '测试上级' } }));
    if(path === '/patrol/meta') return Promise.resolve(reply({ success: true, employee: {}, grids: ['测试网格'], violation_types: ['闯红灯'], problem_types: [] }));
    if(path === '/upload'){
      if(window.__t77.fail.upload) return Promise.resolve(reply({ success: false, code: 'MOCK_UPLOAD_FAIL', message: 'mock 上传失败' }, 500));
      return Promise.resolve(reply({ success: true, file_token: window.__t77.newToken() }));
    }
    if(path === '/patrol/attach'){
      if(window.__t77.fail.attach) return Promise.resolve(reply({ success: false, code: 'MOCK_ATTACH_FAIL', message: 'mock 补挂失败' }, 502));
      return Promise.resolve(reply({ success: true, code: 'OK' }));
    }
    if(path === '/patrol/submit') return Promise.resolve(reply({ success: true, code: 'OK', recordIds: ['recT77srv'] }));
    if(path === '/inbox') return Promise.resolve(reply({ success: true, todos: [], pending_count: 0, monthly_done_count: 0 }));
    if(path === '/dispatched') return Promise.resolve(reply({ success: true, records: [], count: 0 }));
    if(path === '/summary') return Promise.resolve(reply({ success: true, stats: {} }));
    return Promise.resolve(reply({ success: true }));
  };
})();
`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT_SRC });
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/check.html` });
const booted = await poll(() => typeof session !== 'undefined' && !!session && session.id === '13800000077' && document.querySelector('#view-home') && !document.querySelector('#view-home').classList.contains('hidden'), 20000);
ok('T0 页面启动进首页（fake 会话）', !!booted);
if (!booted) { console.log('启动失败，后续用例无意义，提前退出'); ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(1); }

/* ---------- 公共：造记录 + 打开详情 ---------- */
// ⚠️ 必须包在 IIFE 里：Runtime.evaluate 的顶层 const/let 会留在全局词法环境，
//    连续调用第二次就会 `Identifier 'rec' has already been declared`。
const seedRecord = (rec) => evalJs(`(() => {
  window.__api.length = 0;
  db.records = db.records.filter(x => x.id !== ${JSON.stringify(rec.id)});
  const r = ${JSON.stringify(rec)};
  r.checkerId = r.checkerId || session.id;
  r.checkerName = session.name;
  r.time = r.time || Date.now();
  r.inspectTime = r.inspectTime || '2026-10-13 12:00';
  db.records.unshift(r); saveDB();
  renderDetail(db.records.find(x => x.id === ${JSON.stringify(rec.id)}), 'my-checks');
  return true;
})()`);
const detailText = () => evalJs(`(document.querySelector('#detail-body')||{}).textContent || ''`);
const tipText = () => evalJs(`(()=>{const b=document.querySelector('#detail-body');if(!b)return '';const t=Array.from(b.querySelectorAll('div')).map(d=>d.textContent||'').filter(s=>/照片|上传|更换|保留|已选|同步/.test(s));return t.join(' ~~ ').slice(0,400);})()`);
const clickBtn = (label) => evalJs(`(()=>{const b=Array.from(document.querySelectorAll('#detail-body button')).find(x=>x.textContent.indexOf(${JSON.stringify(label)})>=0);if(!b)return false;b.click();return true;})()`);
const setPhoto = async (which) => {
  const doc = await send('DOM.getDocument', { depth: 1 });
  const all = await send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: '#detail-body input[type=file]' });
  if (!all.nodeIds || all.nodeIds.length < 2) return false;
  await send('DOM.setFileInputFiles', { nodeId: all.nodeIds[which], files: [ASSET] });
  return true;
};
const pickPhoto = async () => {                       // 走「从相册上传」→ 塞文件 → 等预览
  await clickBtn('从相册上传');
  await setPhoto(1);
  return !!(await poll(() => Array.from(document.querySelectorAll('#detail-body div')).some(d => d.textContent.indexOf('已选新照片') >= 0), 15000));
};
const apiCalls = (p) => evalJs(`window.__api.filter(x=>x.path===${JSON.stringify(p)}).map(x=>x.body)`);
const recOf = (id) => evalJs(`(()=>{const r=db.records.find(x=>x.id===${JSON.stringify(id)});return r?{token:r.photoToken,fp:r.photoTokenFp,photo:r.scenePhoto,synced:r.syncState,srv:r.serverRecordId}:null;})()`);

/* ---------- T1/T2：本人已上报记录换图（核心用例） ---------- */
console.log('\n── T1/T2 已上报记录换图 ──');
await seedRecord({ id: 't77a', no: 'T77-A', type: '三违', behavior: '闯红灯', personName: '张三', personJob: '保洁员',
  status: 'unfinished', syncState: 'synced', serverRecordId: 'recT77a', clientRequestId: 'reqT77a',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
const t1 = await pollNode(() => detailText().then(t => t.includes('换一张现场照片')));
ok('T1 详情页有「换一张现场照片」入口', !!t1);
ok('T1b 入口带相机 / 相册两个 file input', (await evalJs(`document.querySelectorAll('#detail-body input[type=file]').length`)) === 2);
ok('T1c 卡片标明「已上报」', (await detailText()).includes('已上报'));

ok('T2a 选图后出现新图预览 + 确认/取消按钮', await pickPhoto());
await clickBtn('确认更换');
const calls = await pollNode(async () => {
  const a = await apiCalls('/patrol/attach'), u = await apiCalls('/upload');
  return (a.length && u.length) ? { a: a[a.length - 1], u: u.length } : null;
}, 10000);
ok('T2b 已发起 upload + attach', !!calls);
ok('T2c attach.record_id = 本条记录的 serverRecordId', !!calls && calls.a.record_id === 'recT77a', calls ? String(calls.a.record_id) : '');
ok('T2d attach.kind = scene', !!calls && calls.a.kind === 'scene', calls ? String(calls.a.kind) : '');
ok('T2e attach.photo_tokens = [新 token]（长度 1）', !!calls && Array.isArray(calls.a.photo_tokens) && calls.a.photo_tokens.length === 1 && calls.a.photo_tokens[0] === NEW_TOKEN_1,
  calls ? JSON.stringify(calls.a.photo_tokens) : '');
ok('T2f **覆盖**语义：photo_tokens 不含旧 token（不是追加）', !!calls && !JSON.stringify(calls.a.photo_tokens).includes(OLD_TOKEN),
  calls ? JSON.stringify(calls.a.photo_tokens) : '');
const afterT2 = await pollNode(() => recOf('t77a').then(r => (r && r.token === NEW_TOKEN_1 && r.photo !== OLD_PHOTO) ? r : null), 5000);
ok('T2g 本机记录已更新（新 token + 新图）', !!afterT2, afterT2 ? 'token=' + afterT2.token : '');
const imgSrc = await evalJs(`(()=>{const i=document.querySelector('#detail-body img[alt="现场照片"]');return i?i.src.slice(0,40):'';})()`);
ok('T2h 详情页展示的已是新照片', !!imgSrc && imgSrc.indexOf('OLDOLDOLD') < 0, imgSrc);
ok('T2i 出现成功提示「已更换」', /已更换/.test(await evalJs(`(document.querySelector('#hse-flash')||{}).textContent||''`)));

/* ---------- T5：取消（保留原照片）---------- */
console.log('\n── T5 取消路径 ──');
await seedRecord({ id: 't77c', no: 'T77-C', type: '三违', behavior: '闯红灯', personName: '张三',
  status: 'unfinished', syncState: 'synced', serverRecordId: 'recT77c', clientRequestId: 'reqT77c',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
ok('T5a 选图后出现取消按钮', await pickPhoto());
await clickBtn('取消，保留原照片');
await sleep(600);
const t5 = await evalJs(`(()=>{const r=db.records.find(x=>x.id==='t77c');return {token:r.photoToken,photo:r.scenePhoto,up:window.__api.filter(x=>x.path==='/upload').length,at:window.__api.filter(x=>x.path==='/patrol/attach').length};})()`);
ok('T5b 取消：不发 upload / attach', t5.up === 0 && t5.at === 0, JSON.stringify(t5));
ok('T5c 取消：本机图与 token 都不变', t5.token === OLD_TOKEN && t5.photo === OLD_PHOTO, JSON.stringify(t5));
ok('T5d 取消后有明确提示', /取消/.test(await tipText()), await tipText());

/* ---------- T6：上传失败不能改坏本机状态 ---------- */
console.log('\n── T6 上传失败 ──');
await seedRecord({ id: 't77d', no: 'T77-D', type: '三违', behavior: '闯红灯', personName: '张三',
  status: 'unfinished', syncState: 'synced', serverRecordId: 'recT77d', clientRequestId: 'reqT77d',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
ok('T6a 选图成功', await pickPhoto());
await evalJs(`window.__t77.fail.upload = true; true;`);
await clickBtn('确认更换');
await pollNode(() => tipText().then(t => /上传失败/.test(t)), 8000);
const t6 = await evalJs(`(()=>{const r=db.records.find(x=>x.id==='t77d');const b=Array.from(document.querySelectorAll('#detail-body button')).find(x=>x.textContent.indexOf('确认更换')>=0);return {token:r.photoToken,photo:r.scenePhoto,at:window.__api.filter(x=>x.path==='/patrol/attach').length,disabled:b?b.disabled:null};})()`);
ok('T6b 上传失败：不发 attach', t6.at === 0, 'attach=' + t6.at);
ok('T6c 上传失败：本机图与 token 都不变（不能出现本机新图 + 台账旧图）', t6.token === OLD_TOKEN && t6.photo === OLD_PHOTO, JSON.stringify(t6));
ok('T6d 上传失败有提示且按钮复位可重试', /上传失败/.test(await tipText()) && t6.disabled === false, await tipText());

/* ---------- T7：补挂失败不能改坏本机状态 ---------- */
console.log('\n── T7 补挂失败 ──');
await seedRecord({ id: 't77e', no: 'T77-E', type: '三违', behavior: '闯红灯', personName: '张三',
  status: 'unfinished', syncState: 'synced', serverRecordId: 'recT77e', clientRequestId: 'reqT77e',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
ok('T7a 选图成功', await pickPhoto());
await evalJs(`window.__t77.fail.upload = false; window.__t77.fail.attach = true; true;`);
await clickBtn('确认更换');
await pollNode(() => tipText().then(t => /台账更新失败/.test(t)), 8000);
const t7 = await evalJs(`(()=>{const r=db.records.find(x=>x.id==='t77e');const b=Array.from(document.querySelectorAll('#detail-body button')).find(x=>x.textContent.indexOf('确认更换')>=0);return {token:r.photoToken,photo:r.scenePhoto,at:window.__api.filter(x=>x.path==='/patrol/attach').length,disabled:b?b.disabled:null};})()`);
ok('T7b 补挂失败：attach 确实发出过（1 次）', t7.at === 1, 'attach=' + t7.at);
ok('T7c 补挂失败：本机图与 token 都不变', t7.token === OLD_TOKEN && t7.photo === OLD_PHOTO, JSON.stringify(t7));
ok('T7d 补挂失败有提示且按钮复位可重试', /台账更新失败/.test(await tipText()) && t7.disabled === false, await tipText());
await evalJs(`window.__t77.fail.attach = false; true;`);

/* ---------- T3：未上报记录换图（不发 attach）---------- */
console.log('\n── T3 未上报记录换图 ──');
await seedRecord({ id: 't77b', no: 'T77-B', type: '巡查', patrolResult: '现场正常',
  status: 'unfinished', syncState: 'failed', syncError: '网络异常', serverRecordId: '', clientRequestId: 'reqT77b',
  scenePhoto: 'data:image/jpeg;base64,BBBBBBBB', photoToken: 'OLDTOKEN_B', photoTokenFp: 'OLD_FP_B' });
ok('T3a 未上报记录也有换图入口', await pollNode(() => detailText().then(t => t.includes('换一张现场照片'))));
ok('T3a2 卡片标明「未上报」', (await detailText()).includes('未上报'));
ok('T3a3 选图成功', await pickPhoto());
await clickBtn('确认更换');
await sleep(1200);
const t3 = await evalJs(`(()=>{const r=db.records.find(x=>x.id==='t77b');return {token:r.photoToken,fp:r.photoTokenFp,changed:r.scenePhoto!=='data:image/jpeg;base64,BBBBBBBB',attach:window.__api.filter(x=>x.path==='/patrol/attach').length,upload:window.__api.filter(x=>x.path==='/upload').length};})()`);
ok('T3b 未上报：只换本机图、旧 token 作废，不发 upload / attach',
  !!t3 && t3.changed && t3.token === '' && t3.fp === '' && t3.attach === 0 && t3.upload === 0, JSON.stringify(t3));

/* ---------- T4：换图后补传必须用新图 ---------- */
console.log('\n── T4 换图后补传 ──');
const t4 = await evalJs(`(async () => {
  window.__api.length = 0;
  const rec = db.records.find(x=>x.id==='t77b');
  rec.syncState = 'failed';
  saveDB();
  await syncRecord(rec);
  const up = window.__api.filter(x=>x.path==='/upload');
  const sub = window.__api.filter(x=>x.path==='/patrol/submit');
  return { uploads: up.length, submitPhotos: sub.length ? (sub[sub.length-1].body.photo_tokens||[]) : null, token: rec.photoToken, state: rec.syncState };
})()`);
// 不写死 token 序号（前面的用例也会消耗桩的序号），只断言「拿到的是本次新发的 token」且不是旧 token
ok('T4 补传时旧 token 作废、新图重传且提交用新 token',
  !!t4 && t4.uploads === 1 && t4.submitPhotos && t4.submitPhotos.length === 1
    && t4.submitPhotos[0] === t4.token && /^FTNEWT77/.test(String(t4.token))
    && t4.token !== 'OLDTOKEN_B' && t4.state === 'synced', JSON.stringify(t4));

/* ---------- T8：别人的记录没有换图入口 ---------- */
console.log('\n── T8 越权边界 ──');
await seedRecord({ id: 't77f', no: 'T77-F', type: '三违', behavior: '闯红灯', personName: '李四',
  checkerId: '13800000999', status: 'unfinished', syncState: 'synced', serverRecordId: 'recT77f', clientRequestId: 'reqT77f',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
await sleep(400);
const t8txt = await detailText();
ok('T8 别人的记录不显示换图入口', !t8txt.includes('换一张现场照片'), t8txt.includes('现场照片') ? '有现场照片但无换图卡' : '');
ok('T8b 别人的记录连 file input 都没有', (await evalJs(`document.querySelectorAll('#detail-body input[type=file]').length`)) === 0);

/* ---------- T9：服务端记录详情页（台账 / 派发）也能换图 ----------
   背景（用户实测缺口）：公司管理派发出去的记录，在本机 db.records 里是
   status="transferred" + syncState="synced"，而首页各明细只列**未同步**的本机记录
   ⇒ 那条本机记录在 UI 里没有任何入口；台账 / 派发详情走的是 renderServerDetail
   （服务端视图，没有本机照片），于是「换一张现场照片」这张卡根本够不着。
   修法：renderServerDetail 里按 serverRecordId 找回本机记录，把换图卡补上。 */
console.log('\n── T9 服务端详情页（派发后）换图入口 ──');
await seedRecord({ id: 't77g', no: 'T77-G', type: '三违', behavior: '闯红灯', personName: '张三',
  status: 'transferred', syncState: 'synced', serverRecordId: 'recT77g', clientRequestId: 'reqT77g',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
const t9open = await evalJs(`(() => {
  window.__api.length = 0;
  window.__srvG = { record_id: 'recT77g', is_violation: '是', violation_desc: '闯红灯', violation_people: '张三',
    inspection_time: '2026-10-13 12:00', checker_name: '换图测试员', todo_status: '待整改',
    assigner_name: '换图测试员', assignee_name: '李四', assigned_at: '2026-10-13 12:05',
    scene_photo_tokens: ['OLDTOKEN_SRV'], photo_count: 1 };
  openServerDetail(window.__srvG, { title: '派发详情', from: 'dispatch' });
  return true;
})()`);
ok('T9a 打开服务端记录详情成功', !!t9open);
const t9entry = await pollNode(() => detailText().then(t => t.includes('换一张现场照片')));
ok('T9b 派发后的服务端详情页出现换图入口（修复前够不着）', !!t9entry);
ok('T9c 仍显示服务端权威字段（记录号）', (await detailText()).includes('recT77g'));
ok('T9d 卡片标明「已上报」', (await detailText()).includes('已上报'));
ok('T9e 选图成功', await pickPhoto());
await clickBtn('确认更换');
const t9calls = await pollNode(async () => {
  const a = await apiCalls('/patrol/attach'), u = await apiCalls('/upload');
  return (a.length && u.length) ? a[a.length - 1] : null;
}, 10000);
ok('T9f attach.record_id = 本机记录的 serverRecordId', !!t9calls && t9calls.record_id === 'recT77g', t9calls ? String(t9calls.record_id) : '');
ok('T9g attach.kind = scene 且 photo_tokens 只含新 token',
  !!t9calls && t9calls.kind === 'scene' && t9calls.photo_tokens.length === 1 && t9calls.photo_tokens[0] !== OLD_TOKEN,
  t9calls ? JSON.stringify(t9calls.photo_tokens) : '');
const t9state = await pollNode(() => evalJs(`(() => {
  const r = db.records.find(x => x.id === 't77g');
  return { token: r.photoToken, srvTok: window.__srvG.scene_photo_tokens,
           view: (document.querySelector('#view-detail') || {}).className || '' };
})()`), 6000);
ok('T9h 本机记录 token 已更新', !!t9state && /^FTNEWT77/.test(String(t9state.token)), t9state ? String(t9state.token) : '');
ok('T9i **重绘后服务端视图的 token 也换了**（否则换完还显示原图）',
  !!t9state && Array.isArray(t9state.srvTok) && t9state.srvTok.length === 1 && t9state.srvTok[0] === t9state.token,
  t9state ? JSON.stringify(t9state.srvTok) : '');
ok('T9j 换图后仍停在详情页（不跳回列表）', !!t9state && !/hidden/.test(t9state.view), t9state ? t9state.view : '');

/* ---------- T10：服务端记录无本机对应 / 不是我的 → 不给换图入口 ---------- */
console.log('\n── T10 服务端详情的越权 / 无本机图边界 ──');
await evalJs(`(() => {
  window.__srvH = { record_id: 'recNoLocalT77', is_violation: '是', violation_desc: '闯红灯',
    inspection_time: '2026-10-13 12:00', checker_name: '别人', todo_status: '待整改' };
  openServerDetail(window.__srvH, { title: '台账详情', from: 'my-checks' });
  return true;
})()`);
await sleep(500);
ok('T10a 服务端记录在本机没有对应记录 → 不显示换图入口', !(await detailText()).includes('换一张现场照片'));

await seedRecord({ id: 't77h', no: 'T77-H', type: '三违', behavior: '闯红灯', personName: '李四',
  checkerId: '13800000999', status: 'transferred', syncState: 'synced', serverRecordId: 'recT77h', clientRequestId: 'reqT77h',
  scenePhoto: OLD_PHOTO, photoToken: OLD_TOKEN, photoTokenFp: 'OLD_FP' });
await evalJs(`(() => {
  window.__srvI = { record_id: 'recT77h', is_violation: '是', violation_desc: '闯红灯',
    inspection_time: '2026-10-13 12:00', checker_name: '别人', todo_status: '待整改' };
  openServerDetail(window.__srvI, { title: '台账详情', from: 'my-checks' });
  return true;
})()`);
await sleep(500);
ok('T10b 本机记录不是我的 → 不显示换图入口', !(await detailText()).includes('换一张现场照片'));

/* ---------- 收尾 ---------- */
ws.close(); chrome.kill('SIGKILL'); server.close();
fs.rmSync(UD, { recursive: true, force: true });
const bad = results.filter(r => !r[1]);
console.log(`\n===== CF-WPS-换图 前端 E2E: ${results.length - bad.length}/${results.length} PASS =====`);
if (bad.length) console.log('失败项：\n  - ' + bad.map(r => r[0] + (r[2] ? ' :: ' + r[2] : '')).join('\n  - '));
process.exit(bad.length ? 1 : 0);
