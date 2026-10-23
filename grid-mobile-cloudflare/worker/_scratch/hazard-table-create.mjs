// 一次性脚本（不提交）：创建「H5隐患排查台账表」及字段，并做读写验证。
// 用法：node worker/_scratch/hazard-table-create.mjs [--verify-only] [--app=<base app_token>] [--name=<表名>]
import { readFileSync } from 'node:fs';

const VERIFY_ONLY = process.argv.includes('--verify-only');
const argApp = (process.argv.find((a) => a.startsWith('--app=')) || '').slice('--app='.length);
const argName = (process.argv.find((a) => a.startsWith('--name=')) || '').slice('--name='.length);
const TABLE_NAME = argName || 'H5隐患排查台账表';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')];
    })
);

const BASE = 'https://open.feishu.cn/open-apis';
const APP = argApp || env.FS_APP_TOKEN;

async function token() {
  const r = await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  })).json();
  if (r.code !== 0) throw new Error('token failed: ' + JSON.stringify(r));
  return r.tenant_access_token;
}

async function listTables(H) {
  const out = [];
  let pt = '';
  for (;;) {
    const qs = new URLSearchParams({ page_size: '100' });
    if (pt) qs.set('page_token', pt);
    const r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables?${qs}`, { headers: H })).json();
    if (r.code !== 0) throw new Error('listTables failed: ' + JSON.stringify(r));
    out.push(...(r.data?.items || []));
    if (!r.data?.has_more || !r.data?.page_token) break;
    pt = r.data.page_token;
  }
  return out;
}

async function addField(H, tableId, field) {
  const r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(field),
  })).json();
  if (r.code !== 0) throw new Error(`addField ${field.field_name} failed: code=${r.code} msg=${r.msg}`);
  return r.data?.field;
}

// 字段定义（type: 1=多行文本 3=单选 5=日期 17=附件 1001=创建时间）
const FIELDS = [
  { field_name: '隐患编号', type: 1 },
  { field_name: '排查人ID', type: 1 },
  { field_name: '排查人姓名', type: 1 },
  { field_name: '排查人部门', type: 1 },
  { field_name: '排查人职位', type: 1 },
  { field_name: '排查时间', type: 1 },
  { field_name: '隐患类别', type: 3, property: { options: [
    { name: '设备设施' }, { name: '消防安全' }, { name: '用电安全' }, { name: '危化品' },
    { name: '作业安全' }, { name: '高处作业' }, { name: '交通运输' }, { name: '公共设施' },
    { name: '环境卫生' }, { name: '违规操作' }, { name: '其他' },
  ] } },
  { field_name: '隐患级别', type: 3, property: { options: [
    { name: '一般隐患' }, { name: '重大隐患' },
  ] } },
  { field_name: '隐患位置', type: 1 },
  { field_name: '隐患描述', type: 1 },
  { field_name: '纬度', type: 1 },
  { field_name: '经度', type: 1 },
  { field_name: '现场照片', type: 17 },
  { field_name: '处理状态', type: 3, property: { options: [
    { name: '待整改' }, { name: '整改中' }, { name: '已整改' }, { name: '已闭环' },
  ] } },
  { field_name: '备注', type: 1 },
  { field_name: '创建时间', type: 5, property: { date_formatter: 'yyyy/MM/dd HH:mm', auto_fill: true } },
];

(async () => {
  const tok = await token();
  const H = { Authorization: 'Bearer ' + tok };

  let tableId = '';
  if (!VERIFY_ONLY) {
    const existing = (await listTables(H)).find((t) => t.name === TABLE_NAME);
    if (existing) {
      tableId = existing.table_id;
      console.log('table exists:', tableId);
    } else {
      const r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: { name: TABLE_NAME } }),
      })).json();
      if (r.code !== 0) throw new Error('create table failed: ' + JSON.stringify(r));
      tableId = r.data.table_id;
      console.log('table created:', tableId);
    }
    const cols = ((await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${tableId}/fields?page_size=100`, { headers: H })).json()).data?.items || []).map((f) => f.field_name);
    for (const f of FIELDS) {
      if (cols.includes(f.field_name)) { console.log('field exists:', f.field_name); continue; }
      await addField(H, tableId, f);
      console.log('field added:', f.field_name);
    }
  } else {
    const existing = (await listTables(H)).find((t) => t.name === TABLE_NAME);
    if (!existing) throw new Error('table not found');
    tableId = existing.table_id;
  }

  // 读写验证：造一条测试记录 → 读回 → 删除
  const rec = {
    fields: {
      '隐患编号': 'T-verify-1',
      '排查人ID': '18853406505',
      '排查人姓名': '验证脚本',
      '排查人部门': '安环管理部',
      '排查人职位': '安环管理员',
      '排查时间': '2026-10-16 10:30',
      '隐患类别': '设备设施',
      '隐患级别': '一般隐患',
      '隐患位置': '验证位置',
      '隐患描述': 'verify only',
      '纬度': '31.1', '经度': '121.1',
      '处理状态': '待整改',
      '备注': 'create-table verify',
    },
  };
  const c = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${tableId}/records`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(rec),
  })).json();
  if (c.code !== 0) throw new Error('create record failed: ' + JSON.stringify(c));
  const rid = c.data.record.record_id;
  console.log('test record created:', rid);
  const g = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${tableId}/records/${rid}`, { headers: H })).json();
  console.log('read back 隐患类别 =', g.data?.record?.fields?.['隐患类别'], '；处理状态 =', g.data?.record?.fields?.['处理状态']);
  const d = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${tableId}/records/${rid}`, {
    method: 'DELETE', headers: H,
  })).json();
  if (d.code !== 0) throw new Error('delete failed: ' + JSON.stringify(d));
  console.log('test record deleted. OK');
  console.log('HAZARD_TABLE_ID=' + tableId);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
