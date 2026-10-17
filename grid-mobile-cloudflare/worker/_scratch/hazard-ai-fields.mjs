// 一次性脚本（不提交）：CF-WPS-103 AI 识别回填 —— 给 hazard 表补 6 个字段（全部 type=1 文本列）。
// 用法：node _scratch/hazard-ai-fields.mjs --app=test|prod
// 与 _scratch/hazard-fields-extend.mjs 同口径：先 list 既有字段，缺失才建，幂等。
import { readFileSync } from 'node:fs';

const which = (process.argv.find((a) => a.startsWith('--app=')) || '').slice(6) || 'test';
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

// 全部 type=1 文本列：值域由服务端枚举强校验（与整改闭环字段同纪律，避免单选选项漂移导致写入失败）
const NEW_FIELDS = [
  { field_name: '整改依据', type: 1 },
  { field_name: '整改建议', type: 1 },
  { field_name: '三违判定', type: 1 },
  { field_name: '重大事故隐患判定', type: 1 },
  { field_name: '风险等级', type: 1 },
  { field_name: 'AI识别原始输出', type: 1 },
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

  let added = 0, existed = 0, fail = 0;
  for (const f of NEW_FIELDS) {
    if (have.has(f.field_name)) { console.log('  exists:', f.field_name); existed++; continue; }
    const r = await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TABLE}/fields`, {
      method: 'POST', headers: H, body: JSON.stringify({ field_name: f.field_name, type: f.type }),
    })).json();
    if (r.code === 0) { console.log('  added: ' + f.field_name); added++; }
    else { console.log('  FAIL ' + f.field_name + ' code=' + r.code + ' ' + r.msg); fail++; }
  }

  // 回读校验
  const after = ((await (await fetch(`${BASE}/bitable/v1/apps/${APP}/tables/${TABLE}/fields?page_size=100`, { headers: H })).json()).data?.items || []);
  const miss = NEW_FIELDS.map((f) => f.field_name).filter((n) => !after.some((f) => f.field_name === n));
  console.log(`  结果：新增 ${added} / 已存在 ${existed} / 失败 ${fail}；缺失 ${miss.length ? miss.join(',') : '无'}`);
  process.exit(miss.length || fail ? 1 : 0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
