/* CF-WPS-21 只读验证：重名人员的网格解析（真实生产，飞书数据源）
 * 台账唯一重名者 = 郭秀梅（时集镇二班 / 管理员），花名册同名 2 行 → 旧逻辑 fail-closed。
 * 新键优先级应经「姓名 + 所属部门」收敛到唯一行。
 * 对照组：张万恒（姓名唯一，回落所属部门）。
 *
 * 2026-09-17 强化：断言从「拿到任意网格」升级为「网格值 + 解析依据精确匹配」——
 * 郭秀梅同名 2 行为 杜集镇八班（area 杜司村）与 时集镇二班（area 空），
 * 若误取前者会错绑「杜司村」网格，仅判非空无法发现该错绑。
 * Run: node test/cfwps21-dupname-verify.mjs
 */
import { e2eAccount } from './e2e-account.mjs';

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';
async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(PAGES + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
  const t = await r.text();
  let json = {}; try { json = JSON.parse(t); } catch { /* noop */ }
  return { status: r.status, json, text: t };
}
// 台账账号：手机号 + 密码（姓名拼音首字母小写 + 手机号后 4 位），凭据从本机未跟踪文件解析
// [phone, password, name, note, expectGrids, expectBy]
const _gxm = e2eAccount('guoxiumei');
const _zwh = e2eAccount();
const CASES = [
  // 2026-09-17 CF-WPS-22 上线后：同名 2 行中仅「人工班长」是网格长 ⇒ 解析依据由 name+dept 前移到 name+job（网格值不变）
  [_gxm.phone, _gxm.password, '郭秀梅', '重名者（时集镇二班 / 花名册同名 2 行）', ['时集镇二班'], 'name+job'],
  [_zwh.phone, _zwh.password, '张万恒', '对照：姓名唯一（宁城街道片区）', ['宁城街道片区'], 'name'],
];
let pass = 0, fail = 0;
for (const [phone, pw, name, note, expectGrids, expectBy] of CASES) {
  const lg = await j('POST', '/api/mobile/auth/login', { phone, password: pw });
  const token = lg.json.token;
  if (!token) { fail++; console.log(`FAIL 登录失败 ${name} :: ${lg.status} ${lg.text.slice(0, 160)}`); continue; }
  const me = (await j('GET', '/api/mobile/me', null, token)).json.employee || {};
  const meta = await j('GET', '/api/mobile/patrol/meta', null, token);
  const m = meta.json || {};
  const okGrid = Array.isArray(m.grids) && m.grids.length > 0;
  console.log(`\n--- ${name}（${note}）---`);
  console.log(`  /me      : role=${me.role} 网格长等级=${me.grid_level} 部门=${me.department || '(空)'} 上级=${me.superior || '(空)'}`);
  console.log(`  /meta    : status=${meta.status} grids=${JSON.stringify(m.grids)}`);
  console.log(`             解析依据 grid_resolved_by=${m.grid_resolved_by}  花名册命中行数 roster_matches=${m.roster_matches}  值来源 ${m.grid_source || m.source || '-'}`);
  if (!okGrid) { fail++; console.log(`  FAIL 未拿到网格（fail-closed） :: ${meta.text.slice(0, 200)}`); continue; }
  let strict = true;
  if (JSON.stringify(m.grids) !== JSON.stringify(expectGrids)) { strict = false; console.log(`  FAIL 网格值不符：期望 ${JSON.stringify(expectGrids)} 实际 ${JSON.stringify(m.grids)}（疑误取同名他人行）`); }
  if (m.grid_resolved_by !== expectBy) { strict = false; console.log(`  FAIL 解析依据不符：期望 ${expectBy} 实际 ${m.grid_resolved_by}`); }
  if (strict) { pass++; console.log(`  PASS 网格与解析依据均精确匹配 → 可正常巡查`); }
  else fail++;
}
console.log(`\n===== RESULT: ${pass} PASS, ${fail} FAIL =====`);
