const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const JWT_SECRET = 'hse_prod_jwt_7f3a9c2e8b1d4f6a0e5c7d9b2a4f8e1c3d5b7a9e1f3c5d7b9a1e3f5c7d9b2';
(async () => {
  const token = jwt.sign({ id: 1, username: 'admin', role: 'admin', realName: '管理员', type: 'access' }, JWT_SECRET, { expiresIn: '12h', jwtid: crypto.randomUUID() });
  const h = { Authorization: `Bearer ${token}` };
  for (const [cid, label] of [[24, '8月'], [27, '7月'], [28, '6月']]) {
    const url = `http://localhost:5800/api/hse/assessment-monthly/deductions?page=1&page_size=100&cycle_id=${cid}&review_status=pending`;
    const r = await fetch(url, { headers: h });
    const j = await r.json();
    const list = (j.data && j.data.list) || [];
    const unchecked = list.filter(x => String(x.deductionItem || '').includes('未检查') || (x.sourceDetail && x.sourceDetail.kind === 'grid_unchecked_monthly'));
    const zzh = list.filter(x => String(x.employeeName || '').includes('张忠华'));
    console.log(`${label}(cycle ${cid}) 待审核 total=${j.data?.total} 未检查=${unchecked.length} 张忠华=${JSON.stringify(zzh.map(x=>({id:x.id,item:x.deductionItem,status:x.reviewStatus,emp:x.employeeName}))) }`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
