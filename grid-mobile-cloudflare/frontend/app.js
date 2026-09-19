// CF-WPS-11 H5 前端公共请求封装（最小实现）
// CF-WPS-23 变更：
//   ① 会话从 sessionStorage 迁到 localStorage —— 关掉浏览器/微信重进仍然免登录；
//      兼容读取旧的 sessionStorage 数据，读到即迁走（无需用户重新登录）。
//   ② 新增「记住我」：显式勾选后在本机保存手机号+密码，会话过期时**静默重登**，
//      用户不再看到登录页。凭据仅存本机浏览器，退出登录时一并清除。
// - 绝不缓存/打印 token 与密码（唯一例外：用户主动勾选「记住我」时保存的登录凭据）
const H5_SESSION_KEY = 'h5_session_token';
const H5_SESSION_EXP_KEY = 'h5_session_exp';
const H5_CREDS_KEY = 'hse_login_creds_v1';
const H5_DEFAULT_TTL_MS = 7200 * 1000; // 与 Worker 默认 MOBILE_SESSION_TTL_SECONDS 一致

/* ---------------- 会话读写 ---------------- */
// 旧版（CF-WPS-11~22）把会话存在 sessionStorage：读到就迁移到 localStorage，
// 让升级前已登录的用户不用重新登录，也能享受「关掉浏览器仍免登录」。
function migrateLegacySession() {
  try {
    if (localStorage.getItem(H5_SESSION_KEY)) return;
    const legacy = sessionStorage.getItem(H5_SESSION_KEY);
    if (!legacy) return;
    localStorage.setItem(H5_SESSION_KEY, legacy);
    localStorage.setItem(H5_SESSION_EXP_KEY,
      sessionStorage.getItem(H5_SESSION_EXP_KEY) || String(Date.now() + H5_DEFAULT_TTL_MS));
    sessionStorage.removeItem(H5_SESSION_KEY);
    sessionStorage.removeItem(H5_SESSION_EXP_KEY);
  } catch { /* 隐私模式/存储被禁：保持原样，不影响读取 */ }
}
function getToken() {
  migrateLegacySession();
  return localStorage.getItem(H5_SESSION_KEY) || sessionStorage.getItem(H5_SESSION_KEY) || '';
}
function getSessionExp() {
  migrateLegacySession();
  return Number(localStorage.getItem(H5_SESSION_EXP_KEY) || sessionStorage.getItem(H5_SESSION_EXP_KEY) || 0);
}
function setSession(token, expiresIn) {
  const ms = Number(expiresIn) > 0 ? Number(expiresIn) * 1000 : H5_DEFAULT_TTL_MS;
  try {
    localStorage.setItem(H5_SESSION_KEY, token);
    localStorage.setItem(H5_SESSION_EXP_KEY, String(Date.now() + ms));
  } catch { /* 隐私模式/存储被禁：降级为仅本次会话可用 */ }
  sessionStorage.removeItem(H5_SESSION_KEY);
  sessionStorage.removeItem(H5_SESSION_EXP_KEY);
}
function clearSession() {
  try {
    localStorage.removeItem(H5_SESSION_KEY);
    localStorage.removeItem(H5_SESSION_EXP_KEY);
  } catch { /* ignore */ }
  sessionStorage.removeItem(H5_SESSION_KEY);
  sessionStorage.removeItem(H5_SESSION_EXP_KEY);
}
function sessionExpiredLocally() {
  const exp = getSessionExp();
  return !exp || Date.now() > exp;
}

/* ---------------- 回登录页（唯一出口） ---------------- */
// CF-WPS-24：一律用 location.replace —— 失效会话不得在历史栈里留下「回得去但已登出」的页面，
// 否则用户在 /check 上按返回键会退回一个已失效的页面，再被踢去登录，来回弹。
// Pages 启用了 pretty URL（线上是 /login，不是 /login.html），故守卫同时兼容两种写法。
function redirectToLogin() {
  if (/\/login(\.html)?$/.test(location.pathname)) return;   // 已在登录页，别自跳
  location.replace('./login.html');
}

/* ---------------- 「记住我」凭据（仅本机） ---------------- */
// 密码口径 = 姓名拼音首字母(小写) + 手机号后 4 位（台账派生，非高价值凭据）
function saveLoginCreds(phone, password) {
  try { localStorage.setItem(H5_CREDS_KEY, JSON.stringify({ phone, password })); } catch { /* ignore */ }
}
function loadLoginCreds() {
  try {
    const s = localStorage.getItem(H5_CREDS_KEY);
    if (!s) return null;
    const o = JSON.parse(s);
    return o && o.phone && o.password ? o : null;
  } catch { return null; }
}
function clearLoginCreds() {
  try { localStorage.removeItem(H5_CREDS_KEY); } catch { /* ignore */ }
}

/* ---------------- 静默重登 ---------------- */
// token 缺失/过期时，用已保存凭据换新 token（用户无感）。
// force=true：忽略本地 exp 判断，直接换新 token（用于服务端返回 401 后重试）。
// 返回 true = 已拿到可用会话；false = 需人工登录。
// CF-WPS-33：失败原因，供调用方区分「网络不通」与「凭据被拒」
//   'nocreds'  本机没有记住的凭据 → 必须人工登录
//   'network'  超时/断网 → 可凭本机身份快照离线进入
//   'rejected' 服务端明确拒绝（密码规则变更/账号停用）→ 必须人工登录
let lastAuthFail = null;
async function ensureSession(force) {
  if (!force && getToken() && !sessionExpiredLocally()) { lastAuthFail = null; return true; }
  const c = loadLoginCreds();
  if (!c) { lastAuthFail = 'nocreds'; return false; }
  try {
    const res = await fetchWithTimeout(API_BASE + '/api/mobile/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: c.phone, password: c.password }),
    }, H5_LOGIN_TIMEOUT_MS);
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (res.status === 200 && json && json.success && json.token) {
      setSession(json.token, json.expiresIn);
      lastAuthFail = null;
      return true;
    }
    // 凭据已失效（密码规则变更 / 账号停用）→ 丢弃并回登录页
    clearLoginCreds();
    clearSession();
    lastAuthFail = 'rejected';
    return false;
  } catch {
    lastAuthFail = 'network';
    return false; // 网络异常/超时：保留凭据，下次网络恢复再试
  }
}

/* ---------------- 超时保护（CF-WPS-33） ----------------
   现场 4G/乡镇信号差，Worker 冷启动又要回源飞书，登录实测冷启 3s、弱网可达 10s+。
   原实现 fetch 无超时：一旦请求悬挂，启动页会**永久停在「正在验证登录状态…」**。
   统一走 fetchWithTimeout：超时按失败处理（status 0），调用方按未同步/稍后重试处理，
   绝不再让界面无出口地干等。 */
const H5_LOGIN_TIMEOUT_MS = 15000;   // 登录宽容一些（冷启动 + 飞书 token）
const H5_API_TIMEOUT_MS = 20000;     // 业务接口（提交带照片时更慢）
function fetchWithTimeout(url, opt, timeoutMs) {
  if (typeof AbortController === 'undefined') return fetch(url, opt); // 老 WebView 无 AbortController：保持原行为
  const ac = new AbortController();
  const t = setTimeout(() => { try { ac.abort(); } catch { /* ignore */ } }, timeoutMs);
  return fetch(url, Object.assign({}, opt, { signal: ac.signal })).finally(() => clearTimeout(t));
}

/* ---------------- 请求封装 ---------------- */
async function mobileApi(path, body, method) {
  const isLogin = path.endsWith('/auth/login');
  const send = (tk) => fetchWithTimeout(API_BASE + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: tk ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tk }
                : { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }, H5_API_TIMEOUT_MS);

  let res;
  try {
    res = await send(getToken());
  } catch (e) {
    return { status: 0, body: {}, timeout: true };   // 超时/断网：调用方视为未成功，稍后重试
  }

  // 401 = 登录态失效 → 先尝试静默重登并重试一次；仍失败才回登录页
  if (res.status === 401 && !isLogin) {
    const ok = await ensureSession(true);
    if (ok) {
      try { res = await send(getToken()); } catch (e) { return { status: 0, body: {}, timeout: true }; }
    }
    if (!ok || res.status === 401) {
      clearSession();
      redirectToLogin();
    }
  }

  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: json || {} };
}

// 照片上传（multipart；employee_code 由 Worker 从 Session 注入，前端不传）
async function mobileUpload(file, clientRequestId) {
  const token = getToken();
  const fd = new FormData();
  fd.append('file', file, file.name);
  if (clientRequestId) fd.append('client_request_id', clientRequestId);
  const res = await fetch(API_BASE + '/api/mobile/upload', {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    body: fd,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  if (res.status === 401) {
    clearSession();
    redirectToLogin();
  }
  return { status: res.status, body: json || {} };
}
