// 一次性脚本（不提交）：清理 CF-WPS-95 联调产生的脏数据。
// 范围：测试base hazard表全部记录 + 生产base hazard表全部记录 + 两base主台账里「联调*」记录。
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]; })
);
const BASE = 'https://open.feishu.cn/open-apis';
(async () => {
  const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  const del = async (app, tid, label) => {
    let ids = [], pt = '';
    for (;;) {
      const qs = new URLSearchParams({ page_size: '500' });
      if (pt) qs.set('page_token', pt);
      const r = await (await fetch(`${BASE}/bitable/v1/apps/${app}/tables/${tid}/records?${qs}`, { headers: H })).json();
      ids.push(...(r.data?.items || []).map(i => i.record_id));
      if (!r.data?.has_more) break;
      pt = r.data.page_token;
    }
    for (let i = 0; i < ids.length; i += 100) {
      const d = await (await fetch(`${BASE}/bitable/v1/apps/${app}/tables/${tid}/records/batch_delete`, {
        method: 'POST', headers: H, body: JSON.stringify({ records: ids.slice(i, i + 100) }),
      })).json();
      console.log(label, 'deleted', (d.data?.records || []).length, 'code=' + d.code);
    }
    console.log(label, 'total', ids.length);
  };
  await del('WZLJbFxpvarTWWsXWj8cOc1jnkh', 'tblxTdsCT9v3YY03', '[测试base hazard]');
  await del(env.FS_APP_TOKEN, 'tblnyMjxtxjpP08q', '[生产base hazard]');
  // 主台账「检查人姓名=联调」/「联调-parentnode」
  for (const [app, tid] of [[env.FS_APP_TOKEN, 'tbl5QiCv5Qbal044'], ['WZLJbFxpvarTWWsXWj8cOc1jnkh', env.FS_PATROL_PRODUCTION_TABLE_ID]]) {
    const r = await (await fetch(`${BASE}/bitable/v1/apps/${app}/tables/${tid}/records/search`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ page_size: 100, filter: { conjunction: 'and', conditions: [{ field_name: '检查人姓名', operator: 'contains', value: ['联调'] }] } }),
    })).json();
    const ids = (r.data?.items || []).map(i => i.record_id);
    if (ids.length) {
      const d = await (await fetch(`${BASE}/bitable/v1/apps/${app}/tables/${tid}/records/batch_delete`, {
        method: 'POST', headers: H, body: JSON.stringify({ records: ids }),
      })).json();
      console.log('[主台账 ' + app.slice(0, 8) + '] deleted', (d.data?.records || []).length, 'code=' + d.code);
    } else console.log('[主台账 ' + app.slice(0, 8) + '] 无需清理');
  }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
