/* CF-WPS-21 只读证据：同名行明细（真实生产，飞书数据源）
 *
 * 用途：证明「重名消歧」确实是在两行同名记录之间选择，而不是恰好只有一行。
 * 只读，零写入（仅登录 + GET /api/mobile/roster?q=）。
 *
 * 郭秀梅（台账：<手机号已脱敏，见本机未跟踪的 test/_e2e-creds.local.json> / 时集镇二班 / 管理员 / 上级 郭志强）在花名册中有 2 行：
 *   A 00463231 杜集镇八班（负责区域 杜司村）—— 他人
 *   B 00360045 时集镇二班（负责区域 为空） —— 本人
 * 台账侧无「员工编码」列 ⇒ ① 手机号键不生效（花名册无手机号列）、② 编码键 0 命中，
 * 必须靠 ④ 姓名+所属部门 收敛；若误取 A 行会错绑「杜司村」网格。
 *
 * Run: node test/cfwps21-dupname-evidence.mjs
 */
import { e2eAccount } from './e2e-account.mjs';

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';
async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(PAGES + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let json = {}; try { json = JSON.parse(t); } catch { /* noop */ }
  return { status: r.status, json, text: t };
}
const _acct = e2eAccount('guoxiumei');
const [PHONE, PW, NAME, MINE] = [_acct.phone, _acct.password, '郭秀梅', '时集镇二班'];
const lg = await j('POST', '/api/mobile/auth/login', { phone: PHONE, password: PW });
const token = lg.json.token;
if (!token) { console.log(`登录失败 status=${lg.status} ${lg.text.slice(0, 200)}`); process.exit(1); }
const r = await j('GET', `/api/mobile/roster?q=${encodeURIComponent(NAME)}&limit=50`, null, token);
const list = r.json.items || [];
console.log(`花名册 rosterSize=${r.json.rosterSize}  「${NAME}」命中 ${list.length} 行：`);
for (const it of list) console.log(`  ${it.code}  ${it.dept}  负责区域=${it.area || '(空)'}  ${it.job}  手机号=${it.phone || '(空)'}`);
const mine = list.filter((it) => it.dept === MINE);
console.log(`\n按「姓名+所属部门=${MINE}」收敛命中 ${mine.length} 行 → ${mine.length === 1 ? '等价唯一：' + JSON.stringify(mine[0].code) : '⚠️ 仍不唯一，需再降级到「直接上级」'}`);
console.log(`值来源：该行「负责区域」${mine[0] && mine[0].area ? '有值' : '为空 ⇒ 按业务口径回落「所属部门」= ' + MINE}`);
