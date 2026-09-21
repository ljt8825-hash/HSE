#!/usr/bin/env node
/* reset-password.mjs —— CF-WPS-61 配套运维工具
 * ---------------------------------------------------------------------------
 * 业务场景：用户改完密码又忘了 → 「初始密码」已失效（哈希覆盖了初始校验路径），
 *          **唯一**恢复方法是清空飞书身份表该行「密码哈希」字段，
 *          让 checkPassword 重新走「姓名首字母 + 手机尾号 4 位」初始分支。
 *
 * 用法（需要代理出网连飞书）：
 *   HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1 \
 *     node worker/tools/reset-password.mjs --phone 13385340822 [--dry]
 *     [--phone 13969248533]   # 支持多个手机号（逗号分隔或多次 --phone）
 *
 * 凭据：读 worker/.env.local（与生产 Worker 同一份，FS_APP_*）。
 * Dry-run：--dry 只读取并显示当前状态与恢复后的初始密码，不写。
 *
 * 退出码：0 全部成功 / 1 至少有一个失败 / 2 参数错。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyinInitials } from '../pinyin-init.js';
import * as fsAdapter from '../storage/feishuAdapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(HERE, '../.env.local');

// ---- 参数解析 ----
const args = process.argv.slice(2);
const opt = { phones: [], dry: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--phone') {
    if (!args[i + 1]) { console.error('--phone 后缺少手机号'); process.exit(2); }
    for (const p of args[++i].split(',')) {
      const d = p.trim().replace(/\D/g, '');
      if (/^1\d{10}$/.test(d)) opt.phones.push(d); else { console.error('无效手机号：' + p); process.exit(2); }
    }
  } else if (a === '--dry') opt.dry = true;
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else { console.error('未知参数：' + a); usage(); process.exit(2); }
}
if (!opt.phones.length) { usage(); process.exit(2); }

function usage() {
  console.log('用法: node worker/tools/reset-password.mjs --phone <11位手机号> [--dry]');
  console.log('  --phone 13385340822[,13969248533...]   要重置的账号手机号，支持逗号分隔或多次 --phone');
  console.log('  --dry                                   只读不写，显示当前状态与恢复后的初始密码');
  console.log('  凭据读 worker/.env.local（FS_APP_ID / FS_APP_SECRET / FS_APP_TOKEN / FS_IDENTITY_TABLE_ID）');
  console.log('  出网需代理：HTTPS_PROXY=http://127.0.0.1:7890 NODE_USE_ENV_PROXY=1');
}

// ---- 读 .env.local（轻量解析：key=value，# 起为注释，引号自动剥）----
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) { console.error('找不到 ' + ENV_FILE); process.exit(2); }
  const env = {};
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return env;
}
const env = loadEnv();
for (const k of ['FS_APP_ID', 'FS_APP_SECRET', 'FS_APP_TOKEN', 'FS_IDENTITY_TABLE_ID']) {
  if (!env[k]) { console.error('worker/.env.local 缺 ' + k); process.exit(2); }
}

// ---- 读身份表 ----
const recs = await fsAdapter.scanRecords(env, env.FS_APP_TOKEN, env.FS_IDENTITY_TABLE_ID, 50);
const rows = recs.map((r) => {
  const f = r.fields || {};
  const text = (k) => {
    const v = f[k];
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(text).filter(Boolean).join(',');
    if (typeof v === 'object') return String(v.text ?? v.value ?? v.name ?? '');
    return String(v);
  };
  return {
    recordId: r.id,
    name: text('姓名').trim(),
    phone: text('手机号').replace(/\D/g, ''),
    grade: text('分级').trim(),
    pwdHash: text('密码哈希').trim(),
  };
}).filter((r) => r.name);
console.log('已加载身份表：' + rows.length + ' 个账号\n');

// ---- 列存在性探测（飞书列缺时 updateRecord 会 1254045 FieldNameNotFound）----
const fields = await fsAdapter.listFields(env, env.FS_APP_TOKEN, env.FS_IDENTITY_TABLE_ID).catch(() => []);
const fieldNames = new Set(fields.map((f) => f.fieldName));
if (!fieldNames.has('密码哈希') && !opt.dry) {
  console.log('⚠️ 身份表暂无「密码哈希」列 —— 先建（type=1 文本）…');
  try { await fsAdapter.ensureField(env, env.FS_APP_TOKEN, env.FS_IDENTITY_TABLE_ID, '密码哈希', 1); }
  catch (e) { console.error('建列失败：' + (e && e.fsMsg || e && e.message) + '（可直接在飞书后台建列后重跑）'); }
}

// ---- 逐个处理 ----
let bad = 0;
for (const phone of opt.phones) {
  const hit = rows.find((r) => r.phone === phone);
  if (!hit) { console.log('  ✗ ' + phone + '  身份表里没找到'); bad++; continue; }
  const dft = (pinyinInitials(hit.name) || '<无法解析姓名>') + hit.phone.slice(-4);
  const hasHash = !!hit.pwdHash;
  console.log('── [' + hit.name + ' / ' + phone + ' / ' + hit.grade + ']');
  console.log('   当前：' + (hasHash ? '已改密（hash 前缀 ' + hit.pwdHash.slice(0, 22) + '…）' : '仍是初始密码'));
  console.log('   恢复后初始密码：' + dft);
  if (opt.dry) { console.log('   （--dry，跳过写入）\n'); continue; }
  if (!hasHash) { console.log('   已是初始密码，无需重置\n'); continue; }
  try {
    // 写空字符串 = 清空该字段（飞书 PUT 行为），下次登录就会回到初始派生密码
    await fsAdapter.updateRecord(env, env.FS_APP_TOKEN, env.FS_IDENTITY_TABLE_ID, hit.recordId, { '密码哈希': '' });
    console.log('   ✓ 已清空「密码哈希」字段，下次登录请用初始密码：' + dft + '\n');
  } catch (e) {
    console.error('   ✗ 写入失败：HTTP=' + e.fsHttpStatus + ' code=' + e.fsCode + ' msg=' + e.fsMsg + '\n');
    bad++;
  }
}
process.exit(bad ? 1 : 0);