const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const JWT_SECRET = 'hse_prod_jwt_7f3a9c2e8b1d4f6a0e5c7d9b2a4f8e1c3d5b7a9e1f3c5d7b9a1e3f5c7d9b2';
const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', realName: '管理员', type: 'access' }, JWT_SECRET, { expiresIn: '2h', jwtid: crypto.randomUUID() });

(async () => {
  const targets = [
    'http://localhost:5888/api/hse/assessment-monthly/cycles?page=1&page_size=100&sort_by=created_at&sort_order=desc',
    'http://localhost:5888/api/hse/assessment-monthly/deductions?cycleId=24&status=approved',
  ];
  for (const url of targets) {
    try {
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const txt = await res.text();
      console.log('STATUS', res.status, 'URL', url.replace(/^.*\/api/, '/api'));
      console.log('  body-head:', txt.slice(0, 400));
      console.log('---');
    } catch (e) {
      console.log('FETCH-ERR', url.replace(/^.*\/api/, '/api'), e.message);
      console.log('---');
    }
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
