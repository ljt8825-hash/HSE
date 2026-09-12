// 调查"傅连路"加 employee + assign 岗位的可行路径
const fs = require('fs');
(async () => {
  const login = await fetch('http://127.0.0.1:5800/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username:'admin',password:'admin123'})
  }).then(r=>r.json());
  const token = login.data?.token;
  const h = { Authorization:'Bearer '+token };

  // (1) 列出 43 个驾驶员的 profile，挑一个 name='张三' 之类的，看 position_name
  const drivers = await fetch('http://127.0.0.1:5800/api/hse/employee/employees/profile/list?is_driver=true&pageSize=5',{headers:h}).then(r=>r.json());
  console.log('--- 5 个驾驶员样例 profile ---');
  console.log(JSON.stringify(drivers.data?.list?.[0], null, 2));
  fs.writeFileSync('G:/hse-dashboard/server/scripts/_driver_sample.json', JSON.stringify(drivers.data?.list?.[0], null, 2));

  // (2) positions 列表（找"驾驶员"岗位）
  const pos = await fetch('http://127.0.0.1:5800/api/hse/employee/positions', { headers: h }).then(r=>r.json());
  const driverPos = (pos.data?.list || pos.data || pos.list || []).filter(p => /驾驶|司机/.test(p.name || ''));
  console.log('--- 驾驶员岗位候选 ---');
  console.log(JSON.stringify(driverPos, null, 2));
})();
