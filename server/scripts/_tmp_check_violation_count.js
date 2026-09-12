(async () => {
  const base='http://127.0.0.1:5800/api';
  const login = await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})}).then(r=>r.json());
  const token = login.data?.token || login.token;
  const h = { Authorization:'Bearer '+token };
  const list = await fetch(base+'/site-mgmt/driver-violations?pageSize=200&page=1',{headers:h}).then(r=>r.json());
  console.log('total=',list.data?.total,'list.length=',list.data?.list?.length);
  const seen = new Set();
  const dups = new Map();
  for (const r of (list.data?.list||[])) {
    const k = (r.name||'')+'||'+(r.violationTime||'');
    seen.add(k);
    if (!dups.has(k)) dups.set(k,0);
    dups.set(k,dups.get(k)+1);
  }
  let dupCount = 0;
  for (const v of dups.values()) if (v>1) dupCount++;
  console.log('uniq by name+vTime:', seen.size, 'dup groups:', dupCount);
  const summary = {};
  for (const r of (list.data?.list||[])) summary[r.name]=(summary[r.name]||0)+1;
  console.log('31 names sample:', JSON.stringify(summary).slice(0,300));
})();
