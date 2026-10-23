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
  const H = { Authorization: 'Bearer ' + tok };
  const rows = [];
  let pt = '';
  do {
    const j = await (await fetch(`${BASE}/bitable/v1/apps/${dev.FS_APP_TOKEN}/tables/${dev.FS_LEDGER_TABLE_ID}/records?page_size=100${pt ? '&page_token=' + pt : ''}`, { headers: H })).json();
    (j.data?.items || []).forEach(r => rows.push(r.fields));
    pt = j.data?.has_more ? j.data.page_token : '';
  } while (pt);
  console.log('identity rows:', rows.length);
  const g = {};
  rows.forEach(f => { const k = String(f['分级'] || '?'); g[k] = (g[k] || 0) + 1; });
  console.log('分级分布:', JSON.stringify(g));
  // 打印前若干非公司管理账号
  const nonCompany = rows.filter(f => String(f['分级'] || '') !== '公司管理' && f['姓名'] && f['手机号']).slice(0, 12);
  nonCompany.forEach(f => console.log('  cand:', String(f['手机号']).replace(/\D/g,''), f['姓名'], '|', f['分级'], '|', f['所属部门'] || '', '|', f['职位'] || ''));
  const comp = rows.filter(f => String(f['分级'] || '') === '公司管理');
  console.log('公司管理账号:', comp.map(f => String(f['手机号']).replace(/\D/g,'') + ':' + f['姓名']).join(', '));
})().catch(e => console.error('FAIL', e.message));
