// 一次性脚本（不提交）：查身份表里「安环管理部」的公司管理账号 + 一个对照组（非安环）。
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')]; })
);
(async () => {
  const tok = (await (await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
  })).json()).tenant_access_token;
  const H = { Authorization: 'Bearer ' + tok };
  const APP = env.FS_APP_TOKEN, TID = 'tbl58t9kjyDlacSw';
  const r = await (await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${APP}/tables/${TID}/records/search`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_size: 100, filter: { conjunction: 'and', conditions: [{ field_name: '所属部门', operator: 'is', value: ['安环管理部'] }] } }),
  })).json();
  if (r.code !== 0) { console.error('search failed', r); process.exit(1); }
  const g = (f, k) => { const v = (Array.isArray(f[k]) ? f[k][0] : f[k]) ?? ''; return String(v && v.text !== undefined ? v.text : v).trim(); };
  const rows = (r.data?.items || []).map(it => {
    const f = it.fields || {};
    return { name: g(f, '姓名'), phone: g(f, '手机号'), dept: g(f, '所属部门'), grade: g(f, '分级'), position: g(f, '职位'), status: g(f, '身份状态') };
  });
  console.log('--- 安环管理部 ---');
  rows.forEach(x => console.log(JSON.stringify(x)));
  // 对照组：随便找一个乡镇经理
  const r2 = await (await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${APP}/tables/${TID}/records/search`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page_size: 5, filter: { conjunction: 'and', conditions: [{ field_name: '分级', operator: 'is', value: ['乡镇作业中心经理'] }] } }),
  })).json();
  console.log('--- 对照组（乡镇作业中心经理）---');
  (r2.data?.items || []).slice(0, 3).forEach(it => {
    const f = it.fields || {};
    console.log(JSON.stringify({ name: g(f, '姓名'), phone: g(f, '手机号'), dept: g(f, '所属部门'), grade: g(f, '分级') }));
  });
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
