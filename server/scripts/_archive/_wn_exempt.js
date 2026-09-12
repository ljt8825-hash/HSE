/* 第五轮 web-naive 验收辅助：豁免路径（approve confirmed=0 → unlock 恢复） */
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
  // 豁免：李先菊 id=97 通过且确认分 0
  const ap = await api('/hse/assessment-monthly/deductions/review/approve', 'POST', {
    deduction_id: 97, confirmed_score: 0, review_comment: '测试-上线验收-豁免',
  });
  console.log('approve 0:', JSON.stringify(ap.data));
  // 恢复自动：unlock id=97
  const un = await api('/hse/assessment-monthly/deductions/97/unlock', 'POST', {});
  console.log('unlock 97:', JSON.stringify(un.data));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
