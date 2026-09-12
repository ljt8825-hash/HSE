/* 第五轮 web-naive 验收辅助：冻结对象不显示「恢复自动」——先锁定一条，随后由 SQL 置 frozen，验收后再还原 */
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
  if (!token) { console.log('LOGIN FAIL'); process.exit(1); }
  const ap = await api('/hse/assessment-monthly/deductions/review/approve', 'POST', {
    deduction_id: 96, confirmed_score: 2, review_comment: '测试-上线验收-冻结',
  });
  console.log('approve 96:', JSON.stringify(ap.data));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
