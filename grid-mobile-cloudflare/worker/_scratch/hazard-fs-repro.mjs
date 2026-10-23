// 一次性脚本（不提交）：分步复现 hazard 表写入/检索失败的具体飞书错误码。
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]; })
);
const BASE = 'https://open.feishu.cn/open-apis';
const APP = env.FS_APP_TOKEN, TID = 'tblnyMjxtxjpP08q';
(async () => {
  const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  // A. batch_create 无附件
  let r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TID}/records/batch_create`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ records: [{ fields: { '隐患编号': 'T-A', '排查人ID': '13800000003', '排查人姓名': '联调', '排查时间': '2026-10-16 10:30', '隐患类别': '设备设施', '隐患级别': '一般隐患', '隐患描述': 'batch_create 无附件', '处理状态': '待整改' } }] }),
  })).json();
  console.log('A batch_create 无附件:', r.code, r.msg || '');

  // B. batch_create 带附件
  r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TID}/records/batch_create`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ records: [{ fields: { '隐患编号': 'T-B', '排查人ID': '13800000003', '排查人姓名': '联调', '排查时间': '2026-10-16 10:30', '隐患类别': '设备设施', '隐患级别': '一般隐患', '隐患描述': 'batch_create 带附件', '处理状态': '待整改', '现场照片': [{ file_token: 'C98ebxVVjoBrbVxhNxEcsLbjnCg' }] } }] }),
  })).json();
  console.log('B batch_create 带附件:', r.code, r.msg || '');

  // C. 单条 POST /records
  r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TID}/records`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fields: { '隐患编号': 'T-C', '排查人ID': '13800000003', '排查人姓名': '联调', '排查时间': '2026-10-16 10:30', '隐患类别': '设备设施', '隐患级别': '一般隐患', '隐患描述': '单条带附件', '处理状态': '待整改', '现场照片': [{ file_token: 'C98ebxVVjoBrbVxhNxEcsLbjnCg' }] } }),
  })).json();
  console.log('C 单条 create:', r.code, r.msg || '');

  // D. records/search
  r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TID}/records/search`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ page_size: 500, filter: { conjunction: 'and', conditions: [{ field_name: '排查人ID', operator: 'is', value: ['13800000003'] }] } }),
  })).json();
  console.log('D records/search:', r.code, r.msg || '', 'items=', (r.data?.items || []).length);
  if (r.code === 0) {
    r.data.items.forEach(it => console.log('   search hit:', it.fields['隐患编号'], '照片=', JSON.stringify(it.fields['现场照片'] || null)));
  }

  // E. list 全部记录（确认 A/B/C 是否真落库）
  r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TID}/records?page_size=100`, { headers: H })).json();
  console.log('E list all:', r.code, 'count=', (r.data?.items || []).length);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
