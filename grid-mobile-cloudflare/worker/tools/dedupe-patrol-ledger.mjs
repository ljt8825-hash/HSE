/* 主台账重复记录清理工具（CF-WPS-重复台账 的运维配套）
 *
 * 背景：/api/mobile/patrol/submit 的幂等是「先查后写」。客户端在第一次提交**在途期间**
 * 又发一次（同一个 client_request_id）时，两条请求会都在对方落库前完成预查 → 双双建单 →
 * 台账里出现逐字段一致、只有创建时间差几秒的多条记录。
 *   2026-10-01 实测生产：112 条里 27 组重复、多出 53 条（19 个相邻间隔是 0 秒）。
 *   前端已加在途锁、后端已加写后自愈；本工具用于**清理存量**与事后审计。
 *
 * 规则：同一「幂等键」（= 备注里的 `req:`）的多条记录，**保留创建最早的一条**，其余删除。
 * 安全：
 *   ① 先把每组（含保留条与待删条）的**全字段**导出到 .dup_out/backup-<ts>.json；
 *   ② 默认 dry-run，只有显式传 --apply 才真的删；
 *   ③ 删后立刻重拉全表复验，仍重复则非 0 退出。
 *
 * 用法（在仓库根 grid-mobile-cloudflare/ 下执行）：
 *   node worker/tools/dedupe-patrol-ledger.mjs            # 试运行：只打清单
 *   node worker/tools/dedupe-patrol-ledger.mjs --apply    # 真删
 *
 * 凭据：读 worker/.env.local（FS_APP_ID / FS_APP_SECRET / FS_APP_TOKEN / FS_PATROL_PRODUCTION_TABLE_ID）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');           // grid-mobile-cloudflare/
const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, 'worker/.env.local'), 'utf8').split('\n')
    .map((l) => l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')])
);
const APPT = env.FS_APP_TOKEN, TBL = env.FS_PATROL_PRODUCTION_TABLE_ID;
const BASE = 'https://open.feishu.cn/open-apis';
if (!APPT || !TBL) { console.log('!! 缺少 FS_APP_TOKEN / FS_PATROL_PRODUCTION_TABLE_ID（见 worker/.env.local）'); process.exit(1); }

const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
})).json()).tenant_access_token;
if (!tok) { console.log('!! tenant_access_token 获取失败'); process.exit(1); }

async function fetchAll() {
  const out = []; let pt = '';
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ page_size: '500' });
    if (pt) qs.set('page_token', pt);
    const j = await (await fetch(`${BASE}/bitable/v1/apps/${APPT}/tables/${TBL}/records?${qs}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })).json();
    if (j.code !== 0) throw new Error('list failed: ' + j.msg);
    out.push(...((j.data && j.data.items) || []));
    if (!j.data || !j.data.has_more || !j.data.page_token) break;
    pt = j.data.page_token;
  }
  return out;
}

const t = (v) => (v == null ? '' : (typeof v === 'object' ? (Array.isArray(v) ? v.map(t).join(',') : String(v.text ?? v.value ?? v.name ?? '')) : String(v)));
const F = (r, k) => t(r.fields[k]);
const at = (r) => Number(r.fields['日期'] || 0);

function plan(rows) {
  const m = new Map();
  rows.forEach((r) => { const k = F(r, '幂等键'); if (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(r); } });
  const groups = [...m.entries()].filter(([, v]) => v.length > 1);
  const keep = [], del = [];
  groups.forEach(([, v]) => {
    const s = [...v].sort((a, b) => at(a) - at(b));
    keep.push(s[0]);
    del.push(...s.slice(1));
  });
  return { groups, keep, del };
}

const rows0 = await fetchAll();
const { groups, keep, del } = plan(rows0);
console.log(`清理前：全表 ${rows0.length} 条；重复组 ${groups.length} 个；保留 ${keep.length} 条；待删 ${del.length} 条\n`);
if (!groups.length) { console.log('✅ 没有重复记录，无需处理'); process.exit(0); }

const outDir = resolve(ROOT, '.dup_out');
mkdirSync(outDir, { recursive: true });
const backupPath = resolve(outDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(backupPath, JSON.stringify({
  at: new Date().toISOString(), table: TBL, rule: 'keep earliest by 日期, delete the rest',
  groups: groups.map(([req, v]) => ({
    req,
    records: [...v].sort((a, b) => at(a) - at(b))
      .map((r) => ({ record_id: r.record_id, keep: keep.includes(r), fields: r.fields })),
  })),
}, null, 2), 'utf8');
console.log(`备份已写入 ${backupPath}（含 ${groups.length} 组 / ${groups.reduce((s, [, v]) => s + v.length, 0)} 条全字段）\n`);

const local = (r) => new Date(at(r) + 8 * 3600 * 1000).toISOString().slice(11, 19);
console.log('待删清单（每组保留最早一条）：');
groups.forEach(([, v], i) => {
  const s = [...v].sort((a, b) => at(a) - at(b));
  console.log(`  ${String(i + 1).padStart(2)}. ${F(s[0], '检查人姓名')} · ${F(s[0], '片区|班组')}  [${local(s[0])}] 保留 ${s[0].record_id}`);
  s.slice(1).forEach((r) => console.log(`        删 ${r.record_id}  [${local(r)}]`));
});

if (!APPLY) {
  console.log('\n>>> 试运行结束，未做任何删除。确认无误后执行： node worker/tools/dedupe-patrol-ledger.mjs --apply');
  process.exit(0);
}

const ids = del.map((r) => r.record_id);
let removed = 0;
for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200);
  const res = await fetch(`${BASE}/bitable/v1/apps/${APPT}/tables/${TBL}/records/batch_delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: chunk }),
  });
  const j = await res.json();
  if (j.code !== 0) { console.log(`!! 删除失败 HTTP ${res.status} code=${j.code} msg=${j.msg}`); process.exit(1); }
  removed += ((j.data && j.data.records) || chunk).length;
  console.log(`  已删 ${removed}/${ids.length} …`);
}

const rows1 = await fetchAll();
const after = plan(rows1);
console.log(`\n清理后：全表 ${rows1.length} 条（原 ${rows0.length}，减少 ${rows0.length - rows1.length}）`);
console.log(`        重复组 ${after.groups.length} 个；待删 ${after.del.length} 条`);
if (after.groups.length === 0) { console.log('✅ 复验通过：已无重复'); process.exit(0); }
console.log('⚠️ 仍有重复，需人工复查');
process.exit(1);
