// 直接拉台账最近 5 条并对照 编号 / 巡查人ID / 整改接收人ID
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
  const H = { Authorization: 'Bearer ' + tok };
  // 只看最近 7 天（按 创建时间 / 巡查时间 倒序）
  const lst = await (await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + APP + '/tables/' + TBL + '/records?page_size=500', { headers: H })).json();
  const ids = (lst.data && lst.data.items || []).map(x => x.record_id);
  const recent = [];
  for (let i = 0; i < Math.min(ids.length, 100); i++) {
    const r = await (await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + APP + '/tables/' + TBL + '/records/' + ids[i], { headers: H })).json();
    if (r.code !== 0) continue;
    const f = r.data.record.fields;
    recent.push({ id: ids[i], num: t(f['编号']),
      occur: t(f['巡查时间']), recv: t(f['整改接收人姓名']), sender: t(f['指派人姓名']),
      user: t(f['巡查人ID']), problem: t(f['问题类型']), rect: t(f['整改状态']),
      sceneCnt: (f['现场照片'] || []).length, rectifyCnt: (f['整改后照片'] || []).length });
  }
  recent.sort((a, b) => String(b.occur).localeCompare(String(a.occur)));
  console.log('--- 最近 10 条（按巡查时间倒序）---');
  for (const r of recent.slice(0, 10)) {
    console.log(JSON.stringify(r));
  }
  // 找 SW20261015010
  const hit = recent.find(r => r.num === 'SW20261015010');
  console.log('--- 查 SW20261015010 ---');
  console.log(hit ? '命中: ' + JSON.stringify(hit) : '台账前 100 条没有 SW20261015010');
})();
