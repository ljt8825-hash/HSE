const http = require('http');
const fs = require('fs');
const TOKEN = fs.readFileSync('G:/hse-dashboard/_06d2_admin_token.txt', 'utf8').trim();
const body = JSON.stringify({
  violationType: '违章作业', violationLevel: '一般', riskLevel: '中',
  description: 'probe', violationDate: '2026-08-30', status: '待处理', checkSource: 'company',
});
const r = http.request(
  {
    host: '127.0.0.1', port: 5800, path: '/api/violations', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let s = '';
    res.on('data', (c) => (s += c));
    res.on('end', () => {
      console.log('status=', res.statusCode);
      console.log(s.slice(0, 800));
    });
  }
);
r.on('error', (e) => console.error('ERR', e.message));
r.write(body);
r.end();
