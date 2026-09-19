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