// (1) 检查 employee 里有没有"傅连路"；(2) 删 store 中"洪永刚"6 条
const fs = require('fs');
(async () => {
  const login = await fetch('http://127.0.0.1:5800/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:'admin',password:'admin123'})
  }).then(r=>r.json());
  const token = login.data?.token;
  const h = { Authorization:'Bearer '+token };

  // (1) 检查"傅连路"
  const q = await fetch('http://127.0.0.1:5800/api/hse/employee/employees?pageSize=9999&keyword=' + encodeURIComponent('傅连路'), { headers: h }).then(r=>r.json());
  console.log('--- search 傅连路 ---');
  console.log(JSON.stringify(q, null, 2).slice(0, 800));

  // (2) 删 store 中"洪永刚"6 条 id=119..124
  for (const id of [119,120,121,122,123,124]) {
    const r = await fetch(`http://127.0.0.1:5800/api/site-mgmt/driver-violations/${id}`, { method:'DELETE', headers: h });
    const j = await r.json();
    console.log(`DELETE id=${id} → code=${j.code} msg=${j.message||j.msg||JSON.stringify(j).slice(0,80)}`);
  }

  // 再确认 store 现状
  const list = await fetch('http://127.0.0.1:5800/api/site-mgmt/driver-violations?pageSize=200', { headers: h }).then(r=>r.json());
  console.log('--- after delete ---');
  console.log('total =', list.data?.total);
  const byName = {};
  for (const r of (list.data?.list||[])) byName[r.name] = (byName[r.name]||0)+1;
  const names = Object.keys(byName).sort();
  for (const n of names) console.log(`  ${n}: ${byName[n]}`);
  fs.writeFileSync('G:/hse-dashboard/server/scripts/_after_delete.json', JSON.stringify(list.data?.list, null, 2));
})();
