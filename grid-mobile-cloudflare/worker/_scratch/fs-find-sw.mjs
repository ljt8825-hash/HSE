// 拉前 200 条（多页），并行 GET，找 SW20261015010 + 打印最近 5 条
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const APP = env.FS_APP_TOKEN, TBL = env.FS_PATROL_PRODUCTION_TABLE_ID;
const t = v => Array.isArray(v) ? v.map(x => x && x.text !== undefined ? x.text : String(x)).join(',') : v;
const auth = async () => (await (await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET })
})).json()).tenant_access_token;

(async () => {
  const tok = await auth();
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  // 列全表 ID
  let ids = [];
  for (let p = 0; p < 20; p++) {
    const lst = await (await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + APP + '/tables/' + TBL + '/records?page_size=500', { headers: H })).json();
    ids.push(...((lst.data && lst.data.items) || []).map(x => x.record_id));
    if (!lst.data || !lst.data.has_more) break;
  }
  console.log('总', ids.length, '条 ID 已列出');
  // 按 record_id 倒序，只看 top 50 并行 GET
  ids.sort().reverse();
  const top = ids.slice(0, 50);
  // 并行 GET（每批 20 个）
  const rows = [];
  for (let i = 0; i < top.length; i += 20) {
    const batch = top.slice(i, i + 20);
    const rs = await Promise.all(batch.map(id =>
      fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + APP + '/tables/' + TBL + '/records/' + id, { headers: H })
        .then(r => r.json()).catch(() => null)));
    for (const r of rs) {
      if (!r || r.code !== 0) continue;
      const f = r.data.record.fields;
      const num = t(f['记录编号']);
    if (num === 'SW20261015010' || t(f['编号']) === 'SW20261015010') {
      console.log('*** 命中 ***', r.data.record.record_id);
      console.log('  记录编号(界面)=', num, '| 编号(列)=', t(f['编号']),
        '违章人员=', t(f['违章人员姓名']),
        '指派人=', t(f['指派人姓名']), '接收=', t(f['整改接收人姓名']));
      console.log('  整改状态=', t(f['整改状态']), '完成时间=', t(f['整改完成时间']),
        '说明=', t(f['整改说明']));
      console.log('  现场照片=', (f['现场照片'] || []).length, '整改后照片=', (f['整改后照片'] || []).length);
      console.log('  整改后照片 tokens:', JSON.stringify(f['整改后照片'] || []));
      console.log('  现场照片 tokens:', JSON.stringify(f['现场照片'] || []));
      console.log('  性别=', t(f['性别']), '年龄=', t(f['年龄']), '岗位=', t(f['车辆类型|保洁员']));
    }
      rows.push({ id: r.data.record.record_id, num, status: t(f['整改状态']),
        doneAt: t(f['整改完成时间']), created: t(f['创建时间']),
        sceneCnt: (f['现场照片'] || []).length, rectifyCnt: (f['整改后照片'] || []).length,
        who: t(f['违章人员姓名']), recver: t(f['整改接收人姓名']) });
    }
  }
  rows.sort((a, b) => String(b.id).localeCompare(String(a.id)));  // record_id 倒序（最新在前）
  console.log('--- 按 record_id 倒序最近 8 条 ---');
  for (const r of rows.slice(0, 8)) console.log(JSON.stringify(r));
})();
