// sw.js —— 极简 Service Worker（只为满足 Android Chrome 「添加到主屏幕 / 安装应用」条件）
// ----------------------------------------------------------------------------
// 现场人员把 H5 加到手机桌面后，点图标直进系统（登录态在本机 localStorage）。
//
// ⚠️ 关键设计：**注册了 fetch 监听，但绝不拦截、绝不缓存任何请求**。
//    · 为什么必须要有 fetch 监听？
//      Chrome 的可安装性检查要求 SW 注册了 fetch handler；
//      只写 install/activate 的话 beforeinstallprompt **根本不会触发**，
//      表现就是点「添加到手机桌面」毫无反应（2026-09-18 安卓实测）。
//    · 为什么不 respondWith？
//      巡查数据必须与后端实时一致，任何缓存都可能让用户看到旧台账、旧组织树，
//      甚至让 retryPendingSync 把新提交误判成已上报。
//      不调用 respondWith → 浏览器走默认网络流程 = 完全透传，零副作用。
//
// ⚠️ check.html 的「强制刷新」按钮解绑 SW 时会**跳过本文件**（按 /sw.js 结尾判断），
//    否则用户一按强刷就会把已安装状态撤掉，桌面图标退化成普通浏览器打开。

self.addEventListener('install', (e) => {
  // 立即接管所有客户端：不等旧 tab 关闭，避免首次加桌面后还跑着老 SW
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// 纯透传：只登记监听，不 respondWith，让所有请求走浏览器默认网络流程。
self.addEventListener('fetch', () => {});

/* ================= 关页补传重放（CF-WPS-105，Background Sync 方案一） =================
   场景：乡镇弱网提交失败 → 用户关页走人 → 晚上回家连上 WiFi，Chrome 唤醒本 SW，
   从 IndexedDB 镜像队列重放「静默重登 → 照片上传 → 建单」，全程无需打开页面。
   · 数据源：check.html 镜像的待传队列（载荷已由页面 toPatrolBody 固化）+ 会话/凭据
     —— SW 读不到 localStorage，只能读 IndexedDB（库 hse-bg-sync / store kv）；
   · 幂等：与页面共用 client_request_id（服务端「先查后写」），页面与 SW 并发重放绝不建重单；
   · 兼容：仅 Chromium 系有 sync 事件（Firefox/iOS 没有，页面侧也不会注册，天然跳过）；
   · 方案二兜底：凭据缺失/登录被拒/弱网未传完 → 系统通知（仅已授权时），点击打开页面补传；
   · 仍然绝不拦截、绝不缓存任何请求 —— 本节只新增「主动外呼」，不碰上方 fetch 透传。 */
const BG_IDB_NAME = 'hse-bg-sync', BG_IDB_STORE = 'kv', BG_TAG = 'hse-patrol-sync';
const BG_TIMEOUT_MS = 60000;   // 与页面 H5_UPLOAD_TIMEOUT_MS/H5_API_TIMEOUT_MS 同量级：弱网宁可多等，不可悬挂

function bgIdbOpen(){
  return new Promise((resolve) => {
    try{
      const rq = indexedDB.open(BG_IDB_NAME, 1);
      rq.onupgradeneeded = () => { try{ rq.result.createObjectStore(BG_IDB_STORE); }catch(e){} };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
    }catch(e){ resolve(null); }
  });
}
async function bgIdbGet(key){
  const d = await bgIdbOpen(); if(!d) return undefined;
  try{
    return await new Promise((res, rej) => {
      const tx = d.transaction(BG_IDB_STORE, 'readonly');
      const rq = tx.objectStore(BG_IDB_STORE).get(key);
      rq.onsuccess = () => res(rq.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }catch(e){ return undefined; }
}
async function bgIdbSet(key, val){
  const d = await bgIdbOpen(); if(!d) return;
  try{
    await new Promise((res, rej) => {
      const tx = d.transaction(BG_IDB_STORE, 'readwrite');
      tx.objectStore(BG_IDB_STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }catch(e){ /* 静默 */ }
}
// 带超时的 fetch：弱网/假在线下绝不让重放悬挂（SW 被 Chrome 杀掉也只损失当前一条）
function bgFetch(url, opt){
  if(typeof AbortController === 'undefined') return fetch(url, opt);
  const ac = new AbortController();
  const t = setTimeout(() => { try{ ac.abort(); }catch(e){} }, BG_TIMEOUT_MS);
  return fetch(url, Object.assign({}, opt, { signal: ac.signal })).finally(() => clearTimeout(t));
}
// 与页面 dataUrlToFile 同构：镜像 dataURL → File（照片上传用）
function bgDataUrlToFile(dataUrl, name){
  const m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ''));
  if(!m) return null;
  try{
    const bin = atob(m[2]);
    const u8 = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const mime = m[1] || 'image/jpeg';
    const ext = mime.indexOf('png') >= 0 ? 'png' : 'jpg';
    return new File([u8], name + '.' + ext, { type: mime });
  }catch(e){ return null; }
}
// 会话保障：token 未过期直接用；缺失/过期/强制 → 用镜像凭据静默重登（页面「记住我」同源）
async function bgEnsureAuth(sess, force){
  try{
    if(sess && sess.token && !force && (!sess.exp || Date.now() < sess.exp - 30000)) return sess;
    if(!sess || !sess.creds || !sess.creds.phone || !sess.creds.password) return null;
    const r = await bgFetch('/api/mobile/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: sess.creds.phone, password: sess.creds.password }),
    });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(r.status === 200 && j && j.success && j.token){
      sess = { token: j.token, exp: Date.now() + (Number(j.expiresIn) > 0 ? Number(j.expiresIn) * 1000 : 7200000), creds: sess.creds };
      await bgIdbSet('session', sess);
      return sess;
    }
    return null;   // 凭据被拒（改密/停用）或网络不通 → 调用方按无会话处理
  }catch(e){ return null; }
}
// 建单：镜像载荷 + photo_tokens + 建单即指派 assign_to（与页面 toPatrolBody/submitRecordToBackend 同构）
async function bgSubmit(entry, sess, tokens){
  const body = Object.assign({}, entry.body);
  if(tokens && tokens.length) body.photo_tokens = tokens;
  if(entry.assign && entry.assign.assignee_id) body.assign_to = entry.assign;
  const r = await bgFetch('/api/mobile/patrol/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sess.token },
    body: JSON.stringify(body),
  });
  let j = null; try{ j = await r.json(); }catch(e){}
  const ok = r.status === 200 && j && j.success;
  return {
    ok,
    status: r.status,
    recordId: ok ? (j.record_id || (j.recordIds && j.recordIds[0]) || null) : null,   // 与页面 syncRecordOnce 同口径：body.record_id
    assigned: !!(j && j.assigned),
    message: (j && j.message) || '',
  };
}
async function bgSyncRetry(){
  const q = await bgIdbGet('queue');
  if(!Array.isArray(q) || !q.length) return;
  let sess = await bgIdbGet('session');
  let landed = 0, remain = 0;
  for(const e of q){
    if(!e || e.state === 'synced' || e.state === 'failed') continue;   // 终态不重放
    sess = await bgEnsureAuth(sess);
    if(!sess){ remain++; continue; }   // 无会话且无凭据：留给通知兜底 / Chrome 退避重试
    let tokens = (e.body && e.body.photo_tokens) || [];
    try{
      // 现场照片：镜像标了 needUpload（页面口径 photoFp 不匹配）才上传，已有有效 token 直接建单
      if(e.photo && e.photo.needUpload){
        const file = bgDataUrlToFile(e.photo.dataUrl, 'photo');
        if(!file){
          e.state = 'failed'; e.error = '照片数据损坏，请打开页面重新拍摄';
          await bgIdbSet('queue', q); continue;
        }
        const fd = new FormData();
        fd.append('file', file, file.name);
        if(e.photo.cid) fd.append('client_request_id', e.photo.cid);
        const up = await bgFetch('/api/mobile/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + sess.token },
          body: fd,
        });
        let uj = null; try{ uj = await up.json(); }catch(e2){}
        if(up.status === 200 && uj && uj.success && uj.file_token){
          tokens = [uj.file_token];
        } else if(up.status === 401){
          sess = await bgEnsureAuth(sess, true); remain++;
          await bgIdbSet('queue', q); continue;
        } else {
          e.state = 'pending'; e.error = '现场照片上传失败（弱网）'; remain++;
          await bgIdbSet('queue', q); continue;
        }
      }
      let r = await bgSubmit(e, sess, tokens);
      if(r.status === 401){                       // token 失效：静默重登后重放一次
        sess = await bgEnsureAuth(sess, true);
        if(sess) r = await bgSubmit(e, sess, tokens);
      }
      if(r.ok){
        e.state = 'synced'; e.serverRecordId = r.recordId; e.syncedAt = Date.now(); e.assigned = r.assigned;
        landed++;
      } else if(r.status === 401 || r.status === 429 || r.status >= 500){
        e.state = 'pending'; e.error = r.message || ('HTTP ' + r.status); remain++;   // 可恢复：留待重试
      } else {
        e.state = 'failed'; e.error = r.message || ('HTTP ' + r.status);   // 4xx 业务拒绝：终态，页面打开后可见原因
      }
    }catch(err){
      e.state = 'pending'; e.error = '网络异常，稍后自动补传'; remain++;
    }
    await bgIdbSet('queue', q);   // 每条落一次盘：中途被杀也不重放已定态的
  }
  await bgNotifyResult(landed, remain);
  if(remain > 0) throw new Error('bg-sync: ' + remain + ' 条未完成');   // reject ⇒ Chrome 按退避自动重试本 tag
}
// 方案二兜底通知（仅在用户已授权 Notification 时；授权由页面在出现失败记录后借手势请求）
async function bgNotifyResult(landed, remain){
  try{
    if(typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if(landed > 0) await self.registration.showNotification('网格巡查 · 自动补传成功', { body: '✓ 已补传 ' + landed + ' 条记录到飞书台账', tag: 'hse-bg-done' });
    if(remain > 0) await self.registration.showNotification('网格巡查 · 有 ' + remain + ' 条记录待补传', { body: '点击打开页面继续补传', tag: 'hse-bg-pending', data: { url: '/check' } });
  }catch(e){ /* 静默：通知失败不影响补传结果 */ }
}
self.addEventListener('sync', (e) => { if(e.tag === BG_TAG) e.waitUntil(bgSyncRetry()); });
// 手动触发口：页面 postMessage({type:'hse-bg-sync-run'})（真机调试用；生产路径走 sync 事件）
self.addEventListener('message', (e) => { if(e.data && e.data.type === 'hse-bg-sync-run') e.waitUntil(bgSyncRetry().catch(() => {})); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/check';
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of cs){ if(String(c.url).indexOf('/check') >= 0) return c.focus(); }
    return self.clients.openWindow(url);
  })());
});