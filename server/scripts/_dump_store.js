// 列出 store 的全部 (name, vt)，输出 store_rows.json
const fs = require('fs');
(async () => {
  const login = await fetch('http://127.0.0.1:5800/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:'admin',password:'admin123'})
  }).then(r=>r.json());
  const token = login.data?.token;
  const list = await fetch('http://127.0.0.1:5800/api/site-mgmt/driver-violations?pageSize=200',{
    headers:{Authorization:'Bearer '+token}
  }).then(r=>r.json());
  const rows = list.data?.list || [];
  console.log('dump rows:', rows.length);
  const out = rows.map(r => `${r.name}\t${r.violationTime||''}`).join('\n');
  fs.writeFileSync('G:/hse-dashboard/server/scripts/_store_dump.txt', out);
  fs.writeFileSync('G:/hse-dashboard/server/scripts/_store_dump.json', JSON.stringify(rows, null, 2));
})();
