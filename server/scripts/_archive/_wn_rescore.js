/* 第五轮 web-naive 验收辅助：执行评分（cycle 24），验证人工锁定行不被覆盖 */
const BASE = 'http://127.0.0.1:5800/api';
let token = '';
async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
(async () => {
  const login = await api('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  token = login.data.data.accessToken;
  if (!token) { console.log('LOGIN FAIL', JSON.stringify(login.data).slice(0, 300)); process.exit(1); }
  const ex = await api('/hse/assessment-monthly/scoring/execute', 'POST', { cycle_id: 24 });
  console.log('执行评分:', JSON.stringify(ex.data));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
