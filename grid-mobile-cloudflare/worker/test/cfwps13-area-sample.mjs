// CF-WPS-13 阶段B 只读取样：Sheet 11 负责区域字段形态（ employee_code→网格 映射可行性）
import { readFileSync } from 'node:fs';
const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';
const tr = await fetch(`${BASE}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: envVar.WPS_APP_ID, client_secret: envVar.WPS_APP_SECRET }).toString() });
const tj = await tr.json().catch(() => ({}));
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${tj.access_token}` };
const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/11/records/list_by_page`, { method: 'POST', headers: H, body: JSON.stringify({ page_num: 1, page_size: 15 }) });
const j = await res.json().catch(() => ({}));
let shown = 0;
for (const r of (j?.data?.records || [])) {
  let fv = r.fields_value ?? r.fields;
  try { if (typeof fv === 'string') fv = JSON.parse(fv); } catch { continue; }
  const area = fv['负责区域（在职）'];
  if (area == null || area === '') continue;
  console.log(`员工编码=${fv['员工编码']} | 姓名=${fv['姓名']} | 职位=${fv['职位']} | 负责区域（在职）=${JSON.stringify(area).slice(0, 160)}`);
  if (++shown >= 12) break;
}
console.log('sampled:', shown);
