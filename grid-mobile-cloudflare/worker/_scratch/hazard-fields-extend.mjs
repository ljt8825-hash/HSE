// 一次性脚本（不提交）：CF-WPS-100 隐患整改闭环 —— 给 hazard 表补 14 个字段 + 处理状态选项扩容。
// 用法：node _scratch/hazard-fields-extend.mjs --app=test|prod
import { readFileSync } from 'node:fs';

const which = (process.argv.find((a) => a.startsWith('--app=')) || '').slice(6) || 'test';
// ⚠️ .dev.vars 里 FS_HAZARD_TABLE_ID 那行带行内注释：必须先剥注释、再去引号，否则拿到带引号的假 ID
const parseEnv = (txt) => Object.fromEntries(
  txt.split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      let v = l.slice(i + 1).trim().replace(/\s*#.*$/, '').trim();
      v = v.replace(/^"(.*)"$/, '$1');
      return [l.slice(0, i).trim(), v];
    })
);
const dev = parseEnv(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'));
const prod = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const APP = which === 'prod' ? 'WX9TbTqJKa7sywsgrU4cVoKdnXb' : dev.FS_APP_TOKEN;
const TABLE = which === 'prod' ? 'tblnyMjxtxjpP08q' : dev.FS_HAZARD_TABLE_ID;
const ID = dev.FS_APP_ID, SECRET = dev.FS_APP_SECRET;   // 同一 App 对两个 base 都有权限
const BASE = 'https://open.feishu.cn/open-apis';

const NEW_FIELDS = [
  { field_name: '整改人ID', type: 1 },
  { field_name: '整改人姓名', type: 1 },
  { field_name: '整改人部门', type: 1 },
  { field_name: '指派人ID', type: 1 },
  { field_name: '指派人姓名', type: 1 },
  { field_name: '指派时间', type: 1 },
  { field_name: '整改期限', type: 1 },
  { field_name: '整改说明', type: 1 },
  { field_name: '整改提交时间', type: 1 },
  { field_name: '整改后照片', type: 17 },
  { field_name: '验收人', type: 1 },
  { field_name: '验收时间', type: 1 },
  { field_name: '验收结论', type: 1 },
  { field_name: '闭环时间', type: 1 },
  { field_name: '打回次数', type: 1 },
];

(async () => {
  const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: ID, app_secret: SECRET }),
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };

  const list = (await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TABLE}/fields?page_size=100`, { headers: H })).json()).data?.items || [];
  const have = new Set(list.map((f) => f.field_name));
  console.log(`[${which}] 现有字段 ${have.size} 个`);

  for (const f of NEW_FIELDS) {
    if (have.has(f.field_name)) { console.log('  exists:', f.field_name); continue; }
    const r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TABLE}/fields`, {
      method: 'POST', headers: H, body: JSON.stringify({ field_name: f.field_name, type: f.type }),
    })).json();
    console.log(r.code === 0 ? '  added: ' + f.field_name : '  FAIL ' + f.field_name + ' code=' + r.code + ' ' + r.msg);
  }

  // 「处理状态」单选扩容：待整改 / 待验收 / 已闭环（保留原选项，追加新选项）
  const st = list.find((f) => f.field_name === '处理状态');
  if (!st) { console.error('  未找到「处理状态」字段'); process.exit(1); }
  const opts = ((st.property && st.property.options) || []).map((o) => ({ name: o.name, color: o.color }));
  for (const name of ['待验收', '已闭环']) {
    if (!opts.some((o) => o.name === name)) opts.push({ name });
  }
  const up = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TABLE}/fields/${st.field_id}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ field_name: '处理状态', type: 3, property: { options: opts } }),
  })).json();
  console.log(up.code === 0 ? '  处理状态选项 → ' + opts.map((o) => o.name).join('/') : '  处理状态扩容 FAIL code=' + up.code + ' ' + up.msg);

  // 回读校验
  const after = ((await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TABLE}/fields?page_size=100`, { headers: H })).json()).data?.items || []);
  const miss = NEW_FIELDS.map((f) => f.field_name).filter((n) => !after.some((f) => f.field_name === n));
  const stAfter = after.find((f) => f.field_name === '处理状态');
  const stNames = ((stAfter.property && stAfter.property.options) || []).map((o) => o.name);
  console.log(`  校验：缺失字段 ${miss.length ? miss.join(',') : '无'}；处理状态=${stNames.join('/')}`);
  process.exit(miss.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
