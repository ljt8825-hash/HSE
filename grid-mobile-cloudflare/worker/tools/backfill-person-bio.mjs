/* 主台账「违章人员档案三列」存量回填工具（CF-WPS-86 的运维配套）
 *
 * 背景：.85 之前，「派发 → 被指派人整改时才选人」这条路径只回写「违章人员姓名」，
 * 台账「性别 / 年龄 / 车辆类型|保洁员」三列永远留空 —— 用户侧表现就是「档案不显示」。
 * Worker 已改成：客户端没传档案时，按花名册**唯一命中**补齐（重名不猜）。
 * 本工具用于**清理存量**：给已经完成、姓名有值但三列空缺的记录补档案。
 *
 * 规则（与 Worker 兜底同口径，故意保守）：
 *   ① 只处理「违章人员姓名」非空、且三列**至少一列**为空的记录；
 *   ② 按姓名在**在职**花名册里唯一命中才补；重名 / 查无此人 / 离职 → 跳过不猜；
 *   ③ 客户端没传的列才补；已有一律不覆盖（不写错人）；
 *   ④ 只补三列，绝不碰其它字段（整改状态/照片/时间一概不动）。
 *
 * 安全：
 *   ① 先把「将要写入的记录 + 写入值」全量导出到 .bio_out/backup-<ts>.json；
 *   ② 默认 dry-run，只有显式 --apply 才真写；
 *   ③ 写后立刻重拉复验，仍缺列的计入失败并以非 0 退出。
 *
 * 用法（在仓库根 grid-mobile-cloudflare/ 下执行）：
 *   node worker/tools/backfill-person-bio.mjs            # 试运行：只打清单
 *   node worker/tools/backfill-person-bio.mjs --apply    # 真写
 *
 * 凭据：读 worker/.env.local（FS_APP_ID / FS_APP_SECRET / FS_APP_TOKEN / FS_PATROL_PRODUCTION_TABLE_ID / FS_ROSTER_TABLE_ID）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');           // grid-mobile-cloudflare/
const APPLY = process.argv.includes('--apply');

/* 凭据/表来源：优先读 worker/.dev.vars（**wrangler dev 真正在用的那一套**，本地 Worker 写的就是它），
   没有 .dev.vars 才退回 worker/.env.local。表 id 会原样打印，避免打错表。 */
function loadEnvFile(file) {
  try { return readFileSync(resolve(ROOT, file), 'utf8'); } catch { return ''; }
}
const envSrc = loadEnvFile('worker/.dev.vars') || loadEnvFile('worker/.env.local');
const env = Object.fromEntries(
  envSrc.split('\n')
    .map((l) => l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, '')])
);
const APPT = env.FS_APP_TOKEN, TBL = env.FS_PATROL_PRODUCTION_TABLE_ID, ROSTER_TBL = env.FS_ROSTER_TABLE_ID;
const BASE = 'https://open.feishu.cn/open-apis';
if (!APPT || !TBL) { console.log('!! 缺少 FS_APP_TOKEN / FS_PATROL_PRODUCTION_TABLE_ID（见 worker/.dev.vars 或 worker/.env.local）'); process.exit(1); }
if (!ROSTER_TBL) { console.log('!! 缺少 FS_ROSTER_TABLE_ID（花名册表，见 worker/.dev.vars 或 worker/.env.local）'); process.exit(1); }
console.log(`凭据来源：${envSrc === loadEnvFile('worker/.dev.vars') ? 'worker/.dev.vars' : 'worker/.env.local'}`);
console.log(`目标表：${APPT} / ${TBL}    花名册表：${ROSTER_TBL}`);

const tok = (await (await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: env.FS_APP_ID, app_secret: env.FS_APP_SECRET }),
})).json()).tenant_access_token;
if (!tok) { console.log('!! tenant_access_token 获取失败'); process.exit(1); }

const t = (v) => (v == null ? '' : (typeof v === 'object' ? (Array.isArray(v) ? v.map(t).join(',') : String(v.text ?? v.value ?? v.name ?? '')) : String(v)));

async function fetchAll(table) {
  const out = []; let pt = '';
  for (let i = 0; i < 40; i++) {
    const qs = new URLSearchParams({ page_size: '500' });
    if (pt) qs.set('page_token', pt);
    const j = await (await fetch(`${BASE}/bitable/v1/apps/${APPT}/tables/${table}/records?${qs}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })).json();
    if (j.code !== 0) throw new Error('list failed: ' + j.msg);
    out.push(...((j.data && j.data.items) || []));
    if (!j.data || !j.data.has_more || !j.data.page_token) break;
    pt = j.data.page_token;
  }
  return out;
}

console.log(`模式：${APPLY ? '** 真写（--apply）**' : '试运行（dry-run，不写任何数据）'}`);
const roster = await fetchAll(ROSTER_TBL);
const INACTIVE = /离职|已退|停用|退出/;
const byName = new Map();
for (const r of roster) {
  const f = r.fields || {};
  const name = t(f['姓名']).trim();
  if (!name) continue;
  if (INACTIVE.test(t(f['用工关系状态'] || f['在职状态'] || f['状态']))) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(r);
}
console.log(`花名册：${roster.length} 行 / 在职且重名归一去重后 ${byName.size} 个姓名`);

const rows = await fetchAll(TBL);
console.log(`主台账：${rows.length} 条`);
const plan = [];
for (const r of rows) {
  const f = r.fields || {};
  const name = t(f['违章人员姓名']).trim();
  if (!name || name === '未指定') continue;
  const missSex = !t(f['性别']).trim(), missAge = !t(f['年龄']).trim(), missJob = !t(f['车辆类型|保洁员']).trim();
  if (!missSex && !missAge && !missJob) continue;
  const hits = byName.get(name) || [];
  if (hits.length !== 1) { plan.push({ id: r.record_id, name, skip: hits.length ? `重名(${hits.length})` : '花名册无此人' }); continue; }
  const rf = hits[0].fields || {};
  const patch = {};
  if (missSex && t(rf['性别']).trim()) patch['性别'] = t(rf['性别']).trim();
  if (missAge && t(rf['年龄']).trim()) patch['年龄'] = t(rf['年龄']).trim();
  if (missJob && t(rf['职位'] || rf['岗位']).trim()) patch['车辆类型|保洁员'] = t(rf['职位'] || rf['岗位']).trim();
  if (!Object.keys(patch).length) { plan.push({ id: r.record_id, name, skip: '花名册该行档案为空' }); continue; }
  plan.push({ id: r.record_id, name, patch });
}
const todo = plan.filter((p) => p.patch);
const skipped = plan.filter((p) => !p.patch);
console.log(`待回填 ${todo.length} 条；跳过 ${skipped.length} 条（重名/查无此人/花名册无档案）`);
for (const p of todo.slice(0, 60)) console.log('  + ' + p.id + '  ' + p.name + '  → ' + JSON.stringify(p.patch));
if (todo.length > 60) console.log(`  … 其余 ${todo.length - 60} 条见备份文件`);
for (const p of skipped.slice(0, 20)) console.log('  - ' + p.id + '  ' + p.name + '  (' + p.skip + ')');
if (skipped.length > 20) console.log(`  … 其余 ${skipped.length - 20} 条跳过原因见备份文件`);

const outDir = resolve(ROOT, 'worker/.bio_out');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = resolve(outDir, `backup-${stamp}.json`);
writeFileSync(backup, JSON.stringify({ at: new Date().toISOString(), apply: APPLY, plan }, null, 2));
console.log('备份（含将要写入的值）：' + backup);

if (!APPLY) { console.log('\ndry-run 结束：未写入任何数据。确需回填请加 --apply。'); process.exit(0); }

let ok = 0, bad = 0;
for (const p of todo) {
  const j = await (await fetch(`${BASE}/bitable/v1/apps/${APPT}/tables/${TBL}/records/${p.id}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: p.patch }),
  })).json();
  if (j.code === 0) { ok++; console.log('  ✓ ' + p.id + '  ' + p.name); }
  else { bad++; console.log('  ✗ ' + p.id + '  ' + j.code + ' ' + j.msg); }
}
// 复验：重拉全表，仍有「姓名有值但三列全空」的记录就报警
const after = await fetchAll(TBL);
let stillMissing = 0;
const byId = new Map(after.map((r) => [r.record_id, r]));
for (const p of todo) {
  const f = (byId.get(p.id) || { fields: {} }).fields || {};
  if (!t(f['性别']).trim() && !t(f['年龄']).trim() && !t(f['车辆类型|保洁员']).trim()) stillMissing++;
}
console.log(`\n回填完成：成功 ${ok}，失败 ${bad}；复验仍全空 ${stillMissing} 条`);
if (bad || stillMissing) { console.log('!! 有失败项，请查看上面的逐条日志'); process.exit(1); }
console.log('全部回填成功。');
