const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const JWT_SECRET = 'hse_prod_jwt_7f3a9c2e8b1d4f6a0e5c7d9b2a4f8e1c3d5b7a9e1f3c5d7b9a1e3f5c7d9b2';
const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', realName: '管理员', type: 'access' }, JWT_SECRET, { expiresIn: '2h', jwtid: crypto.randomUUID() });

(async () => {
  const filePath = path.join(__dirname, '_r6_backfill_zhangzhonghua.xlsx');
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), path.basename(filePath));
  fd.append('module', 'grid');

  const res = await fetch('http://localhost:5888/api/import/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const txt = await res.text();
  console.log('UPLOAD status=', res.status);
  console.log('UPLOAD body=', txt.slice(0, 3000));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
