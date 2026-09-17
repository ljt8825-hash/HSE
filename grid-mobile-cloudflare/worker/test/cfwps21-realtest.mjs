/* CF-WPS-21 REAL API 验证（只读，零写入）
 * 目标：公网 Pages → Functions → Worker → 飞书，验证本次四项后端改动：
 *   ① GET /api/mobile/geo/regeo 上线且离线判定正确（宁津县 12 乡镇/街道）
 *   ② 坐标非法/县外/缺参的行为
 *   ③ /api/mobile/patrol/meta 网格解析（新键优先级：手机号 → 员工编码 → 姓名 → +部门 → +上级）
 *   ④ /api/mobile/me 返回网格长等级（前端展示用；不再需要员工编号）
 * 纪律：不写任何业务表；不做巡查提交（那属于 cfwps19/cfwps20 e2e 的职责）。
 * Run: node test/cfwps21-realtest.mjs
 */
import { e2eAccount } from './e2e-account.mjs';

const PAGES = process.env.PAGES_ORIGIN || 'https://grid-mobile-cloudflare.pages.dev';

let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_REAL ${n}${x ? ' :: ' + x : ''}`); };
const bad = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : bad(n, d || 'false'));

async function j(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const res = await fetch(PAGES + path, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch { /* noop */ }
  return { status: res.status, json, text };
}
const login = async (phone, password) => (await j('POST', '/api/mobile/auth/login', { phone, password })).json.token || '';

// GCJ-02 地标 → WGS-84（手机 GPS 原始值）；Worker 内部会再转回 GCJ-02
const WGS = {
  chaihudian: [116.9276, 37.6317],   // 柴胡店镇政府
  ningcheng: [116.790544, 37.625374], // 康宁湖（宁城街道）
  dacaozhen: [116.5892, 37.5754],    // 大曹镇
  beijing: [116.4074, 39.9042],      // 县境外
};
// WGS-84 ↔ GCJ-02 简化正变换（与 worker/geo-regeo.js 同算法，用于构造输入）
function wgs84ToGcj02(lng, lat) {
  const a = 6378245.0, ee = 0.00669342162296594323;
  const outOfChina = lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  if (outOfChina) return [lng, lat];
  const tLat = (x, y) => {
    let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return r;
  };
  const tLng = (x, y) => {
    let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    r += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return r;
  };
  const dLat = tLat(lng - 105.0, lat - 35.0), dLng = tLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  const magic = 1 - ee * Math.sin(radLat) ** 2;
  const sq = Math.sqrt(magic);
  const gcjLat = lat + (dLat * 180.0) / ((a * (1 - ee)) / (magic * sq) * Math.PI);
  const gcjLng = lng + (dLng * 180.0) / (a / sq * Math.cos(radLat) * Math.PI);
  return [gcjLng, gcjLat];
}
// GCJ-02 → WGS-84（一次逼近，构造反向输入用）
function gcj02ToWgs84(gLng, gLat) {
  const [cl, ca] = wgs84ToGcj02(gLng, gLat);
  return [gLng * 2 - cl, gLat * 2 - ca];
}

console.log(`===== CF-WPS-21 真机验证 @ ${PAGES} =====`);

// ---------- 1. 接口存在性 + 鉴权 ----------
console.log('--- 1. /api/mobile/geo/regeo 鉴权 ---');
{
  const r = await j('GET', `/api/mobile/geo/regeo?lat=37.63&lng=116.79`);
  assert(r.status === 401 && r.json.code === 'UNAUTHORIZED', '未认证 → 401（接口已上线）', `status=${r.status} code=${r.json.code}`);
  const r2 = await j('GET', `/api/mobile/geo/regeo?lat=37.63`);
  assert(r2.status === 401, '缺 lng 且未认证 → 先挡鉴权 401', `status=${r2.status}`);
}

// ---------- 2. 登录（台账账号） ----------
console.log('--- 2. 登录（飞书网格长信息台账） ---');
const _acct = e2eAccount();
const ACCOUNTS = [[_acct.phone, _acct.password, '张万恒']];
let token = '', me = null;
for (const [phone, pw, name] of ACCOUNTS) {
  token = await login(phone, pw);
  if (token) {
    const r = await j('GET', '/api/mobile/me', null, token);
    me = r.json.employee || {};
    ok(`登录成功：${name}`, `role=${me.role} grid_level=${me.grid_level}`);
  } else {
    bad(`登录失败：${name}`, 'token 为空（密码 = 姓名首字母小写 + 手机号后 4 位）');
  }
}
if (!token) {
  console.log(`\n===== RESULT: ${pass} PASS, ${failn} FAIL（无有效会话，后续用例跳过） =====`);
  process.exit(1);
}

// ---------- 3. /api/mobile/me：展示字段 ----------
console.log('--- 3. /api/mobile/me：网格长等级（替代员工编号） ---');
{
  assert(!!me.grid_level, '返回 grid_level（前端身份卡/我的页显示「网格长等级 X网格长」）', me.grid_level);
  assert(/网格长|总网格长/.test(me.grid_level || ''), 'grid_level 是台账口径（一级/二级/三级/总网格长）', me.grid_level);
  assert(!!me.superior, '返回 superior（「我的」页显示直接上级）', String(me.superior).slice(0, 12));
  assert(/^1\d{10}$/.test(String(me.employee_code || '')), 'employee_code = 手机号（内部标识，前端不再展示为工号）', String(me.employee_code));
  const leak = /secret|password_hash|WORKER_SESSION_SECRET|client_secret/i.test(JSON.stringify(me));
  assert(!leak, 'me 响应无凭据泄露');
}

// ---------- 4. 逆地理编码：地标 ----------
console.log('--- 4. 逆地理编码：真实地标 → 乡镇/街道 ---');
const CASES = [
  ['柴胡店镇政府', WGS.chaihudian, '柴胡店镇'],
  ['康宁湖（宁城街道）', WGS.ningcheng, '宁城街道'],
  ['大曹镇', WGS.dacaozhen, '大曹镇'],
];
for (const [label, [wlng, wlat], expect] of CASES) {
  const r = await j('GET', `/api/mobile/geo/regeo?lat=${wlat}&lng=${wlng}`, null, token);
  const jj = r.json;
  assert(r.status === 200 && jj.success, `${label} → 200/OK`, `status=${r.status}`);
  assert(jj.county === '宁津县' && jj.town === expect, `${label} → ${expect}`, `town=${jj.town} address=${jj.address} src=${jj.source}`);
  assert(jj.address === '宁津县' + expect, `${label} address 文案正确（非「当前网格辖区」）`, jj.address);
  assert(jj.source === 'offline' && jj.detail === null, `${label} 未配置高德 → 纯离线，零外部请求`, `source=${jj.source}`);
  assert(Array.isArray(jj.towns) && jj.towns.length === 12, `${label} 返回 12 乡镇清单`, `n=${(jj.towns || []).length}`);
}
{
  // 同一坐标 GCJ-02 直传（前端若误传 GCJ）——仍应落同一乡镇，容错性验证
  const [gl, ga] = wgs84ToGcj02(...WGS.chaihudian);
  const r = await j('GET', `/api/mobile/geo/regeo?lat=${ga}&lng=${gl}`, null, token);
  assert(r.json.town === '柴胡店镇', 'GCJ-02 坐标直传 → 仍判为柴胡店镇（交界处容错）', `town=${r.json.town}`);
}

// ---------- 5. 县外 / 非法坐标 ----------
console.log('--- 5. 县外 / 非法坐标 ---');
{
  const r = await j('GET', `/api/mobile/geo/regeo?lat=${WGS.beijing[1]}&lng=${WGS.beijing[0]}`, null, token);
  assert(r.status === 200 && r.json.inCounty === false && r.json.town === null,
    '北京坐标 → inCounty=false / town=null', JSON.stringify({ inCounty: r.json.inCounty, town: r.json.town, address: r.json.address }));
  assert(typeof r.json.address === 'string' && r.json.address.length > 0 && !/宁津县[^境]/.test(r.json.address),
    '县外给出可读文案（不臆造宁津县乡镇）', r.json.address);
  const r2 = await j('GET', `/api/mobile/geo/regeo?lat=0&lng=0`, null, token);
  assert(r2.status === 400 && r2.json.code === 'GEO_INVALID_COORD', '(0,0) 哨兵 → 400 GEO_INVALID_COORD', `status=${r2.status}`);
  const r3 = await j('GET', `/api/mobile/geo/regeo?lat=abc&lng=116`, null, token);
  assert(r3.status === 400, '非数字 lat → 400', `status=${r3.status}`);
  const r4 = await j('GET', `/api/mobile/geo/regeo?lat=91&lng=116`, null, token);
  assert(r4.status === 400, 'lat=91 越界 → 400', `status=${r4.status}`);
}

// ---------- 6. 网格解析（新键优先级） ----------
console.log('--- 6. /api/mobile/patrol/meta 网格解析 ---');
{
  const r = await j('GET', '/api/mobile/patrol/meta', null, token);
  const jj = r.json;
  assert(r.status === 200 && jj.success, 'meta 200/OK', `status=${r.status}`);
  assert(jj.grid_resolved === true && jj.grids.length > 0, '网格已解析', JSON.stringify({ grids: jj.grids, by: jj.grid_resolved_by, matched: jj.roster_matches }));
  assert(['phone', 'employee_code', 'name', 'name+dept', 'name+superior'].includes(jj.grid_resolved_by),
    'grid_resolved_by 属于新键集合（phone/employee_code/name/name+dept/name+superior）', String(jj.grid_resolved_by));
  assert(typeof jj.roster_matches === 'number' && jj.roster_matches === 1, 'roster_matches=1（唯一命中，未走重名消歧）', `matched=${jj.roster_matches}`);
  assert(jj.grid_mode === 'auto' || jj.grid_mode === 'select', 'grid_mode 合法（auto/select）', jj.grid_mode);
  assert(!!jj.employee.grid_level, 'meta 透出 grid_level（巡查页显示「姓名（网格长等级）」）', jj.employee.grid_level);
  const leak = /secret|client_secret|password/i.test(JSON.stringify(jj));
  assert(!leak, 'meta 响应无凭据泄露');
}

console.log(`\n===== RESULT: ${pass} PASS_REAL, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
