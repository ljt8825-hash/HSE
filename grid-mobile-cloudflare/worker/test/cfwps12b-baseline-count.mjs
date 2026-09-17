// CF-WPS-12B 只读基线核对：Sheet 3 / 11 / 13 记录数（零写入）
import { readFileSync } from 'node:fs';

const envText = readFileSync(new URL('../../../server/.env', import.meta.url), 'utf8');
const envVar = {};
for (const line of envText.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) envVar[m[1]] = m[2].trim(); }
const APP_ID = envVar.WPS_APP_ID, APP_SECRET = envVar.WPS_APP_SECRET;
const BASE = envVar.WPS_OPENAPI_BASE || 'https://openapi.wps.cn';
const FILE_ID = 'cn229thwalDs';

const tr = await fetch(`${BASE}/oauth2/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET }).toString(),
  signal: AbortSignal.timeout(25000),
});
const tj = await tr.json().catch(() => ({}));
if (!tj.access_token) { console.log('TOKEN_FAIL ' + tr.status); process.exit(1); }
const H = { Authorization: `Bearer ${tj.access_token}`, 'Content-Type': 'application/json' };

async function count(sheetId) {
  let total = 0, page = 1;
  while (true) {
    const res = await fetch(`${BASE}/v7/coop/dbsheet/${FILE_ID}/sheets/${sheetId}/records/list_by_page`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ page_num: page, page_size: 200 }),
      signal: AbortSignal.timeout(25000),
    });
    const j = await res.json().catch(() => ({}));
    const recs = j?.data?.records || [];
    total += recs.length;
    if (recs.length < 200) break;
    page++;
    await new Promise(r => setTimeout(r, 150));
  }
  return total;
}

for (const [name, id] of [['Sheet3 生产巡查表', 3], ['Sheet11 员工花名册', 11], ['Sheet13 H5提交测试', 13]]) {
  const n = await count(id);
  console.log(`${name} (sheet_id=${id}): ${n} records`);
}
