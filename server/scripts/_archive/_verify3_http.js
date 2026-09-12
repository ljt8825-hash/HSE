/* 第三轮验证：真实 HTTP 链路 —— 登录 + 执行评分 + 幂等检查 */
const BASE = 'http://127.0.0.1:5800/api';
let token = '';

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

(async () => {
  // 1. 登录
  const login = await api('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  if (!login.data.data || !login.data.data.accessToken) {
    console.log('LOGIN FAIL:', JSON.stringify(login.data).slice(0, 500));
    process.exit(1);
  }
  token = login.data.data.accessToken;
  console.log('登录成功');

  // 2. 执行评分（cycle 24，第二次执行应幂等 affected 不变）
  const ex1 = await api('/hse/assessment-monthly/scoring/execute', 'POST', { cycle_id: 24 });
  console.log('=== 执行评分 #1 ===');
  console.log(JSON.stringify(ex1.data, null, 2));
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
