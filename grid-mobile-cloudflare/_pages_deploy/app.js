// CF-WPS-11 H5 前端公共请求封装（最小实现）
// - token 存 sessionStorage（XSS 面已知，最小阶段取舍；HttpOnly Cookie 方案属后续阶段）
// - 绝不缓存/打印 token 与密码
async function mobileApi(path, body, method) {
  const token = sessionStorage.getItem('h5_session_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  // 401 = 登录态失效 → 丢弃本地会话回登录页
  if (res.status === 401 && !path.endsWith('/auth/login')) {
    clearSession();
    if (!location.pathname.endsWith('login.html')) location.href = './login.html';
  }
  return { status: res.status, body: json || {} };
}

function clearSession() {
  sessionStorage.removeItem('h5_session_token');
  sessionStorage.removeItem('h5_session_exp');
}

function sessionExpiredLocally() {
  const exp = Number(sessionStorage.getItem('h5_session_exp') || 0);
  return !exp || Date.now() > exp;
}

// CF-WPS-12：照片上传（multipart；employee_code 由 Worker 从 Session 注入，前端不传）
async function mobileUpload(file, clientRequestId) {
  const token = sessionStorage.getItem('h5_session_token');
  const fd = new FormData();
  fd.append('file', file, file.name);
  if (clientRequestId) fd.append('client_request_id', clientRequestId);
  const res = await fetch(API_BASE + '/wps/upload/image', {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    body: fd,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  if (res.status === 401) {
    clearSession();
    if (!location.pathname.endsWith('login.html')) location.href = './login.html';
  }
  return { status: res.status, body: json || {} };
}
