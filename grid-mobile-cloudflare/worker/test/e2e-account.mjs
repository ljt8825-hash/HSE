/* E2E 测试账号解析 —— 仓库内不落任何真实凭据
 *
 * 解析顺序（先命中先用，全部落空则**报错退出**，不静默用假数据）：
 *   ① 环境变量：默认账号用 E2E_PHONE / E2E_PASSWORD；
 *      具名账号用 E2E_PHONE_<NAME> / E2E_PASSWORD_<NAME>（NAME 大写，非字母数字转 _）
 *   ② 本机未跟踪文件 `_e2e-creds.local.json`（已 gitignore，勿提交）：
 *        { "default":      { "phone": "...", "password": "..." },
 *          "guoxiumei":    { "phone": "...", "password": "..." } }
 *
 * 具名账号（按用途命名，不写真实姓名到仓库）：
 *   default       —— 常规登录用例（台账「姓名唯一」的片区经理）
 *   guoxiumei     —— 重名消歧用例（台账唯一重名者，花名册同名 2 行）
 *   huangdianxing —— 网格解析对照用例
 *   huangyuantong —— 一级网格长（直接下级树用例）
 *
 * 用法：
 *   import { e2eAccount } from './e2e-account.mjs';
 *   const { phone, password } = e2eAccount();            // default
 *   const g = e2eAccount('guoxiumei');
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LOCAL_FILE = path.join(import.meta.dirname, '_e2e-creds.local.json');

const KNOWN = ['default', 'guoxiumei', 'huangdianxing', 'huangyuantong'];

function envKey(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function fromLocalFile(name) {
  let raw;
  try {
    raw = readFileSync(LOCAL_FILE, 'utf8');
  } catch {
    return null; // 文件不存在 = 正常情况（本就要求不进仓库）
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[e2e-account] ${LOCAL_FILE} 不是合法 JSON：${e.message}`);
  }
  const rec = json && json[name];
  if (rec && rec.phone && rec.password) {
    return { phone: String(rec.phone), password: String(rec.password) };
  }
  return null;
}

/** 取具名账号；解析不到时抛错（fail loud，避免用假账号跑出「假绿」）。 */
export function e2eAccount(name = 'default') {
  const k = envKey(name);
  const ep = name === 'default' ? 'E2E_PHONE' : `E2E_PHONE_${k}`;
  const ew = name === 'default' ? 'E2E_PASSWORD' : `E2E_PASSWORD_${k}`;
  if (process.env[ep] && process.env[ew]) {
    return { phone: process.env[ep], password: process.env[ew] };
  }
  const local = fromLocalFile(name);
  if (local) return local;
  const hint = KNOWN.includes(name) ? '' : `（注意：${name} 不是内置具名账号，请确认拼写）`;
  throw new Error(
    `[e2e-account] 缺少测试账号「${name}」${hint}\n` +
      `  请二选一：\n` +
      `  ① 设环境变量 ${ep} / ${ew}\n` +
      `  ② 在本机未跟踪文件 ${LOCAL_FILE} 写入 {"${name}":{"phone":"...","password":"..."}}（该文件已 gitignore，勿提交）`
  );
}

export default e2eAccount;
