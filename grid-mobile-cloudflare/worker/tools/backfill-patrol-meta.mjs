#!/usr/bin/env node
/* backfill-patrol-meta.mjs —— CF-WPS-62 历史数据回填
 * ---------------------------------------------------------------------------
 * 背景：迁移前「巡查人手机号 / 巡查时间 / 幂等键」三样只压在「备注」列里。
 *       CF-WPS-62 把它们拆成了独立列（巡查人ID / 巡查时间 / 幂等键），
 *       **新记录会双写**，但**历史记录只有备注** —— 在飞书里按独立列做筛选/视图
 *       会漏掉全部老数据。本脚本把老记录的备注解析出来回填进独立列。
 *
 * 安全设计：
 *   · 幂等：只填「独立列为空、且备注能解析出值」的行，已填过的跳过
 *   · 不覆盖：独立列已有值就以列为准（备注可能与列不一致，列是权威）
 *   · 不动备注：备注保持原样，读取侧 patrolIdentity 仍能回退，双保险
 *   · 批量限速：每条之间 sleep，避免撞飞书频率限制
 *
 * 用法（需代理出网）：
 *   HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 \
 *     node worker/tools/backfill-patrol-meta.mjs [--dry] [--limit 200]
 *
 * 退出码：0 全部成功 / 1 至少一条失败 / 2 参数或配置错。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatrolNote, PATROL_META_FIELDS } from '../index.js';
import * as fsAdapter from '../storage/feishuAdapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(HERE, '../.env.local');

const args = process.argv.slice(2);
const opt = { dry: false, limit: 0, gapMs: 220 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry') opt.dry = true;
  else if (args[i] === '--limit') opt.limit = Number(args[++i]) || 0;
  else if (args[i] === '--gap') opt.gapMs = Number(args[++i]) || 0;
  else if (args[i] === '-h' || args[i] === '--help') {
    console.log('用法: node worker/tools/backfill-patrol-meta.mjs [--dry] [--limit N] [--gap 毫秒]');
    process.exit(0);
  } else { console.error('未知参数：' + args[i]); process.exit(2); }
}

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) { console.error('找不到 ' + ENV_FILE); process.exit(2); }
  const env = {};
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return env;
}
const env = loadEnv();
for (const k of ['FS_APP_ID', 'FS_APP_SECRET', 'FS_APP_TOKEN', 'FS_PATROL_PRODUCTION_TABLE_ID']) {
  if (!env[k]) { console.error('worker/.env.local 缺 ' + k); process.exit(2); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (f, k) => {
  const v = (f || {})[k];
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => text({ k: x }, 'k')).filter(Boolean).join(',');
  if (typeof v === 'object') return String(v.text ?? v.value ?? v.name ?? '');
  return String(v);
};

const TABLE = env.FS_PATROL_PRODUCTION_TABLE_ID;
console.log('目标：主台账 ' + TABLE + (opt.dry ? '　（--dry，只读不写）' : ''));

// 建列（幂等）：列不存在时 updateRecord 会 1254045
const fields = await fsAdapter.listFields(env, env.FS_APP_TOKEN, TABLE).catch(() => []);
const names = new Set(fields.map((f) => f.fieldName));
for (const n of Object.values(PATROL_META_FIELDS)) {
  if (!names.has(n)) {
    if (opt.dry) { console.log('  ⚠️ 缺列：' + n + '（--dry 不建）'); continue; }
    try { await fsAdapter.ensureField(env, env.FS_APP_TOKEN, TABLE, n, 1); console.log('  已建列：' + n); }
    catch (e) { console.error('  建列失败：' + n + ' ' + (e && e.fsMsg || e && e.message)); process.exit(2); }
  }
}

const recs = await fsAdapter.scanRecords(env, env.FS_APP_TOKEN, TABLE, 50);
console.log('共 ' + recs.length + ' 条记录\n');

let scanned = 0, need = 0, done = 0, skipped = 0, failed = 0, noNote = 0;
const list = opt.limit > 0 ? recs.slice(0, opt.limit) : recs;

for (const r of list) {
  scanned++;
  const f = r.fields || {};
  const note = text(f, '备注');
  const parsed = parsePatrolNote(note);
  const curUser = text(f, PATROL_META_FIELDS.userId).trim();
  const curTime = text(f, PATROL_META_FIELDS.time).trim();
  const curReq = text(f, PATROL_META_FIELDS.req).trim();

  if (!parsed.employeeCode && !parsed.inspectionTime && !parsed.clientRequestId) { noNote++; continue; }
  // 三列都已有值 → 无需回填
  if (curUser && curTime && curReq) { skipped++; continue; }

  const patch = {};
  if (!curUser && parsed.employeeCode) patch[PATROL_META_FIELDS.userId] = parsed.employeeCode;
  if (!curTime && parsed.inspectionTime) patch[PATROL_META_FIELDS.time] = parsed.inspectionTime;
  if (!curReq && parsed.clientRequestId) patch[PATROL_META_FIELDS.req] = parsed.clientRequestId;
  if (!Object.keys(patch).length) { skipped++; continue; }

  need++;
  if (opt.dry) {
    if (need <= 5) console.log('  将回填 ' + r.id + ' → ' + JSON.stringify(patch));
    continue;
  }
  try {
    await fsAdapter.updateRecord(env, env.FS_APP_TOKEN, TABLE, r.id, patch);
    done++;
    if (opt.gapMs) await sleep(opt.gapMs);
  } catch (e) {
    failed++;
    console.error('  失败 ' + r.id + ' code=' + e.fsCode + ' msg=' + e.fsMsg);
    if (e.isRateLimit) await sleep(1200);
  }
}

console.log('\n──── 结果 ────');
console.log('  扫描        ' + scanned);
console.log('  备注无三件套 ' + noNote);
console.log('  已填满跳过  ' + skipped);
console.log('  需回填      ' + need);
if (!opt.dry) { console.log('  成功        ' + done); console.log('  失败        ' + failed); }
process.exit(failed ? 1 : 0);
