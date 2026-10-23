import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
(async () => {
  const tok = (await (await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET })
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok };
  // 直接拿最早的一条 rec28cvMk6mgRy，看原始 fields
  const r = await (await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + env.FS_APP_TOKEN + '/tables/' + env.FS_LEDGER_TABLE_ID + '/records/rec28cvMk6mgRy', { headers: H })).json();
  console.log('code=', r.code, 'msg=', r.msg);
  console.log('keys=', Object.keys(r.data?.record?.fields || {}));
  // 列 schema
  const fs2 = await (await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + env.FS_APP_TOKEN + '/tables/' + env.FS_LEDGER_TABLE_ID + '/fields', { headers: H })).json();
  const names = (fs2.data?.items || []).map(f => f.field_name);
  console.log('--- schema 列名（' + names.length + ' 列）---');
  console.log(names.join('\n'));
})();
