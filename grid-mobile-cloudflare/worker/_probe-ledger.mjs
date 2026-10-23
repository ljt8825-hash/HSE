import { readFileSync } from 'node:fs';
const parseEnv = (txt) => Object.fromEntries(
  txt.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); let v = l.slice(i + 1).trim().replace(/\s*#.*$/, '').trim().replace(/^"(.*)"$/, '$1'); return [l.slice(0, i).trim(), v]; })
);
const dev = parseEnv(readFileSync('.dev.vars', 'utf8'));
const BASE = 'https://open.feishu.cn/open-apis';
(async () => {
  const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: dev.FS_APP_ID, app_secret: dev.FS_APP_SECRET }),
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  // 台账（身份表）所有表
  const tables = (await (await fetch(`${BASE}/bitable/v1/apps/${dev.FS_APP_TOKEN}/tables?page_size=100`, { headers: H })).json()).data?.items || [];
  for (const t of tables) console.log('table:', t.table_id, t.name);
  // 身份表记录数（第一页即可看规模）
  const led = await (await fetch(`${BASE}/bitable/v1/apps/${dev.FS_APP_TOKEN}/tables/${dev.FS_LEDGER_TABLE_ID || ''}/records?page_size=1`, { headers: H })).json();
  console.log('ledger total:', led.data?.total, 'has_more:', led.data?.has_more);
  const ros = await (await fetch(`${BASE}/bitable/v1/apps/${dev.FS_APP_TOKEN}/tables/${dev.FS_ROSTER_TABLE_ID || ''}/records?page_size=1`, { headers: H })).json();
  console.log('roster total:', ros.data?.total, 'has_more:', ros.data?.has_more);
  const hz = await (await fetch(`${BASE}/bitable/v1/apps/${dev.FS_APP_TOKEN}/tables/${dev.FS_HAZARD_TABLE_ID}/records?page_size=5`, { headers: H })).json();
  console.log('hazard total:', hz.data?.total, 'rows:', (hz.data?.items || []).length);
})().catch((e) => console.error('FAIL', e.message));
