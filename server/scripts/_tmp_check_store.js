(async () => {
  const base='http://127.0.0.1:5800/api';
  const login = await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})}).then(r=>r.json());
  const token = login.data?.token || login.token;
  const h = { Authorization:'Bearer '+token };
  const list = await fetch(base+'/site-mgmt/driver-violations?pageSize=200&page=1',{headers:h}).then(r=>r.json());
  const rows = list.data?.list || [];
  console.log("total:", rows.length);
  const byName = {};
  for (const r of rows) byName[r.name] = (byName[r.name]||0)+1;
  console.log("UNIQUE NAMES:", Object.keys(byName).length);
  const summary = Object.entries(byName).map(([k,v])=>[k,v]).sort((a,b)=>a[0].localeCompare(b[0]));
  for (const [k,v] of summary) console.log(`  ${k}: ${v}`);
})();
