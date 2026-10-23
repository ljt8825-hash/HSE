// _scratch/fs-clean-t93.mjs —— 清理 _t93 真链路探针**误写进飞书测试台账**的记录。
// 用法：node fs-clean-t93.mjs            → dry-run，只列出候选（不删）
//       node fs-clean-t93.mjs --delete   → 真的删除候选
// 运行目录必须是 worker/（读 .dev.vars）。飞书直连需代理。
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const APP = env.FS_APP_TOKEN;
const TBL = env.FS_PATROL_PRODUCTION_TABLE_ID;
const NEEDLE = (process.argv.find(a => a.startsWith('--needle=')) || '').slice('--needle='.length) || '自建自改测试人';
const DO_DELETE = process.argv.includes('--delete');

const FS = 'https://open.feishu.cn/open-apis';

const auth = async () => (await (await fetch(`${FS}/auth/v3/tenant_access_token/internal`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
})).json()).tenant_access_token;

// 任意字段值 → 可读字符串（飞书字段可能是 array of {text} / 数字 / 字符串）
const flat = v => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? (x.text !== undefined ? x.text : JSON.stringify(x)) : String(x))).join(',');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

(async () => {
  const tok = await auth();
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  // 全表扫描（主台账 ~50 条，串行分页）
  const items = [];
  let pageToken = '';
  for (let p = 0; p < 20; p++) {
    const qs = new URLSearchParams({ page_size: '500' });
    if (pageToken) qs.set('page_token', pageToken);
    const j = await (await fetch(`${FS}/bitable/v1/apps/${APP}/tables/${TBL}/records?${qs}`, { headers: H })).json();
    if (!j || j.code !== 0) { console.error('list failed', j && j.code, j && j.msg); process.exit(1); }
    items.push(...((j.data && j.data.items) || []));
    if (!j.data || !j.data.has_more || !j.data.page_token) break;
    pageToken = j.data.page_token;
  }
  console.log(`主台账共 ${items.length} 条`);

  const hits = [];
  for (const it of items) {
    const f = it.fields || {};
    const blob = Object.values(f).map(flat).join('|');
    if (blob.includes(NEEDLE)) hits.push({ id: it.record_id, fields: f });
  }

  console.log(`\n命中「${NEEDLE}」的记录：${hits.length} 条`);
  for (const h of hits) {
    const f = h.fields;
    console.log('---');
    console.log('  record_id =', h.id);
    console.log('  检查时间 =', flat(f['检查时间']), '| 创建时间 =', flat(f['创建时间']));
    console.log('  违规描述 =', flat(f['违规描述']), '| 问题类型 =', flat(f['问题类型']));
    console.log('  检查人   =', flat(f['检查人姓名']) || flat(f['检查人']));
    console.log('  接收人   =', flat(f['整改接收人姓名']), '| 指派人 =', flat(f['指派人姓名']));
    console.log('  整改状态 =', flat(f['整改状态']), '| 完成时间 =', flat(f['整改完成时间']));
    console.log('  全字段 =', JSON.stringify(f, null, 0).slice(0, 800));
  }

  if (!hits.length) { console.log('\n无命中，无需清理。'); return; }

  if (!DO_DELETE) { console.log('\n[dry-run] 未删除。确认无误后加 --delete 重跑。'); return; }

  // 备份要动的记录到本地（不可逆操作，先留底）
  const { writeFileSync } = await import('node:fs');
  const bak = `_scratch/t93-deleted-backup-${Date.now()}.json`;
  writeFileSync(bak, JSON.stringify(hits, null, 2), 'utf8');
  console.log('\n已备份到', bak);

  const ids = hits.map(h => h.id);
  const res = await fetch(`${FS}/bitable/v1/apps/${APP}/tables/${TBL}/records/batch_delete`, {
    method: 'POST', headers: H, body: JSON.stringify({ records: ids }),
  });
  const j = await res.json();
  if (!res.ok || !j || j.code !== 0) { console.error('delete failed', res.status, j && j.code, j && j.msg); process.exit(1); }
  console.log(`已删除 ${ids.length} 条：`, ids.join(', '));
})();
