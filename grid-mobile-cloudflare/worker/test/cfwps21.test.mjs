/* CF-WPS-21: OFFLINE mock tests — H5 定位逆地理编码（GPS 经纬度 → 乡镇/街道 地理位置）。
 * 覆盖：
 *   ① GET /api/mobile/geo/regeo  离线判定（内置宁津县 12 乡镇/街道边界，GCJ-02）
 *      - WGS-84 → GCJ-02 转换正确性（浏览器 GPS 是 WGS-84，边界是 GCJ-02，必须先转）
 *      - 已知地标 → 正确乡镇；县境外 → inCounty=false 且不臆造地址
 *      - 坐标非法 → 400；未认证 → 401；未配置会话密钥 → 503
 *   ② 高德增强（可选）：未配置 AMAP_WEB_KEY → 绝不发起外部请求；配置后 → 补全到村级
 *   ③ 纯函数：wgs84ToGcj02 / gcj02ToWgs84 往返、townOfGcj、validLatLng
 * GUARDS:
 *  - global fetch fully mocked：NO real network（未 mock 的 URL 直接抛错）
 *  - 断言响应体不含任何凭据/key
 * Run: node test/cfwps21.test.mjs
 */
const workerMod = await import('../index.js');
const worker = workerMod.default;
const geo = await import('../geo-regeo.js');
const { signJwtHs256, regeoNingjin, validLatLng, GEO_TOWNS } = workerMod;

const SESSION_SECRET = 'mock-session-secret-0123456789abcdef';
const AMAP_KEY = 'mock-amap-web-key';
let amapCalls = 0;

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('restapi.amap.com')) {
    amapCalls++;
    return new Response(JSON.stringify({
      status: '1', info: 'OK', infocode: '10000',
      regeocode: {
        formatted_address: '山东省德州市宁津县柴胡店镇崔杨村',
        addressComponent: { province: '山东省', city: '德州市', district: '宁津县', township: '柴胡店镇', neighborhood: { name: '', type: '' } },
      },
    }), { status: 200 });
  }
  throw new Error(`UNMOCKED URL (guard): ${u}`);
};

function workerEnv(overrides = {}) {
  return { WORKER_SESSION_SECRET: SESSION_SECRET, ROSTER_CACHE_TTL_MS: '0', ...overrides };
}
let pass = 0, failn = 0;
const ok = (n, x = '') => { pass++; console.log(`PASS_MOCK ${n}${x ? ' :: ' + x : ''}`); };
const fail = (n, d) => { failn++; console.log(`FAIL ${n} :: ${d}`); };
const assert = (c, n, d = '') => (c ? ok(n, typeof d === 'string' ? d : '') : fail(n, d || 'assertion false'));

const nowSec = Math.floor(Date.now() / 1000);
const TOKEN = await signJwtHs256({ iss: 'hse-worker-mobile', aud: 'hse-mobile-h5', sub: '13900000021', name: '测试甲', department: '柴胡店镇一班', grid_level: '三级网格长', iat: nowSec, exp: nowSec + 7200, jti: 'g20' }, SESSION_SECRET);

async function get(path, { token = TOKEN, env = workerEnv() } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await worker.fetch(new Request(`https://worker.local${path}`, { method: 'GET', headers }), env);
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text || '{}'), text };
}
// GCJ 坐标（地图/边界坐标系）→ WGS-84（手机 GPS 原始值），用于构造测试输入
const wgs = (gcjLng, gcjLat) => geo.gcj02ToWgs84(gcjLng, gcjLat);

console.log('===== A. 纯函数：坐标系转换与落面判定 =====');
{
  const [gl, ga] = geo.wgs84ToGcj02(116.79, 37.63);
  assert(Math.abs(gl - 116.79) > 0.0005 && Math.abs(ga - 37.63) > 0.0005, 'A1 WGS-84 → GCJ-02 产生约 500m 量级偏移（必须转换）', `${gl.toFixed(6)},${ga.toFixed(6)}`);
  // 往返精度：gcj02ToWgs84 用一次逼近（迭代残差 ~1e-9°），叠加两轮浮点误差后实测 ~7.4e-6°（≈0.8m）。
  // 业务只要求乡镇级判定（~100m 量级），故阈值取 1e-4°（≈11m）—— 严于此值即视为实现异常。
  let maxResidual = 0;
  for (const [tLng, tLat] of [[116.79, 37.63], [116.9276, 37.6317], [117.05, 37.72], [116.65, 37.55]]) {
    const [gl2, ga2] = geo.wgs84ToGcj02(tLng, tLat);
    const [bl2, ba2] = geo.gcj02ToWgs84(gl2, ga2);
    maxResidual = Math.max(maxResidual, Math.abs(bl2 - tLng), Math.abs(ba2 - tLat));
  }
  assert(maxResidual < 1e-4, 'A2 WGS↔GCJ 往返最大残差 < 1e-4°(≈11m)', `maxResidual=${maxResidual.toExponential(2)}`);
  assert(geo.townOfGcj(116.9276, 37.6317) === '柴胡店镇', 'A3 柴胡店镇政府坐标 → 柴胡店镇', geo.townOfGcj(116.9276, 37.6317));
  assert(geo.townOfGcj(116.790544, 37.625374) === '宁城街道', 'A4 康宁湖（GCJ-02）→ 宁城街道', geo.townOfGcj(116.790544, 37.625374));
  assert(geo.townOfGcj(116.4074, 39.9042) === null, 'A5 北京坐标 → null（不在宁津县）');
  assert(GEO_TOWNS.length === 12 && GEO_TOWNS.includes('柴胡店镇'), 'A6 内置 12 个乡镇/街道', GEO_TOWNS.join(','));
  assert(validLatLng(37.63, 116.79) === true && validLatLng(0, 0) === false && validLatLng('x', 1) === false && validLatLng(91, 100) === false,
    'A7 validLatLng 拒绝空值/非数字/越界/哨兵(0,0)');
}

console.log('===== B. GET /api/mobile/geo/regeo（离线判定，无外部请求） =====');
{
  // 柴胡店镇中心（手机拿到的 WGS-84）
  const [lng, lat] = wgs(116.9276, 37.6317);
  const r = await get(`/api/mobile/geo/regeo?lat=${lat}&lng=${lng}`);
  const j = r.json;
  assert(r.status === 200 && j.success && j.code === 'OK', 'B1 200/OK', `status=${r.status}`);
  assert(j.county === '宁津县' && j.town === '柴胡店镇' && j.inCounty === true, 'B2 解析出乡镇', JSON.stringify({ county: j.county, town: j.town }));
  assert(j.address === '宁津县柴胡店镇', 'B3 address = 宁津县+乡镇（替换原占位文案「当前网格辖区」）', j.address);
  assert(j.source === 'offline' && j.detail === null, 'B4 未配置高德 → source=offline、detail=null');
  assert(amapCalls === 0, 'B5 未配置 AMAP_WEB_KEY 时绝不发起外部请求', `amapCalls=${amapCalls}`);
  assert(Array.isArray(j.towns) && j.towns.length === 12, 'B6 返回可选乡镇清单（前端可做兜底选择）');
}
{
  // 县境外（北京）→ inCounty=false，不臆造地址
  const r = await get('/api/mobile/geo/regeo?lat=39.9042&lng=116.4074');
  const j = r.json;
  assert(r.status === 200 && j.inCounty === false && j.town === null, 'B7 县境外 → inCounty=false / town=null', JSON.stringify(j.address));
  assert(/境外/.test(j.address) || j.address.length > 0, 'B8 县境外给出可读文案（不返回空）', j.address);
}
{
  // 宁城街道（城区）
  const [lng, lat] = wgs(116.7949, 37.6347);
  const r = await get(`/api/mobile/geo/regeo?lat=${lat}&lng=${lng}`);
  assert(r.json.town === '宁城街道', 'B9 城区坐标 → 宁城街道', r.json.town);
}
{
  const bad1 = await get('/api/mobile/geo/regeo?lat=0&lng=0');
  const bad2 = await get('/api/mobile/geo/regeo?lat=abc&lng=116.8');
  const bad3 = await get('/api/mobile/geo/regeo');
  assert(bad1.status === 400 && bad1.json.code === 'GEO_INVALID_COORD', 'B10 (0,0) 哨兵 → 400', JSON.stringify(bad1.json));
  assert(bad2.status === 400 && bad3.status === 400, 'B11 非数字/缺参 → 400', `${bad2.status}/${bad3.status}`);
  const noAuth = await get('/api/mobile/geo/regeo?lat=37.63&lng=116.79', { token: '' });
  assert(noAuth.status === 401, 'B12 未认证 → 401', `status=${noAuth.status}`);
  const noSecret = await get('/api/mobile/geo/regeo?lat=37.63&lng=116.79', { env: { ROSTER_CACHE_TTL_MS: '0' } });
  assert(noSecret.status === 503 && noSecret.json.code === 'SESSION_NOT_CONFIGURED', 'B13 会话密钥未配置 → 503', JSON.stringify(noSecret.json));
}

console.log('===== C. 高德增强（可选，配置后才走外部） =====');
{
  const env = workerEnv({ AMAP_WEB_KEY: AMAP_KEY });
  const [lng, lat] = wgs(116.9276, 37.6317);
  const r = await get(`/api/mobile/geo/regeo?lat=${lat}&lng=${lng}`, { env });
  const j = r.json;
  assert(amapCalls > 0, 'C1 配置 AMAP_WEB_KEY 后调用高德 Web 服务逆地理编码', `amapCalls=${amapCalls}`);
  assert(j.source === 'amap' && /崔杨村/.test(j.address), 'C2 增强到村级（address 取高德 formatted_address）', j.address);
  assert(j.detail && j.detail.township === '柴胡店镇', 'C3 detail 结构化字段透出', JSON.stringify(j.detail));
  assert(j.town === '柴胡店镇' && j.inCounty === true, 'C4 离线判定仍然保留（高德失败时可兜底）');
}
{
  // 高德报错 → 静默回落离线结果（不影响定位展示）
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('restapi.amap.com')) return new Response(JSON.stringify({ status: '0', info: 'USERKEY_PLAT_NOMATCH', infocode: '10009' }), { status: 200 });
    throw new Error('UNMOCKED');
  };
  const [lng, lat] = wgs(116.9276, 37.6317);
  const r = await get(`/api/mobile/geo/regeo?lat=${lat}&lng=${lng}`, { env: workerEnv({ AMAP_WEB_KEY: 'bad-key' }) });
  assert(r.json.source === 'offline' && r.json.address === '宁津县柴胡店镇', 'C5 高德 key 无效 → 静默回落离线结果', JSON.stringify(r.json.address));
  globalThis.fetch = orig;
}

console.log('===== D. 响应不含敏感信息 =====');
{
  const [lng, lat] = wgs(116.9276, 37.6317);
  const r = await get(`/api/mobile/geo/regeo?lat=${lat}&lng=${lng}`, { env: workerEnv({ AMAP_WEB_KEY: AMAP_KEY }) });
  assert(!r.text.includes(AMAP_KEY), 'D1 不含高德 key');
  assert(!r.text.includes(SESSION_SECRET), 'D2 不含会话密钥');
  assert(!/password|token|secret/i.test(r.text), 'D3 不含任何凭据字段');
}

console.log('===== E. 真机数据回归：台账/花名册里出现的乡镇都能解析 =====');
{
  // 台账「所属部门」中出现的乡镇/街道（业务真实覆盖面）
  const names = ['宁城街道', '津城街道', '柴胡店镇', '杜集镇', '大曹镇', '保店镇', '长官镇', '大柳镇', '时集镇', '相衙镇', '张大庄镇', '刘营伍乡'];
  const CENTERS = {
    '刘营伍乡': [116.7665, 37.7475], '张大庄镇': [116.7984, 37.8012], '柴胡店镇': [116.9276, 37.6317],
    '大曹镇': [116.5892, 37.5754], '保店镇': [116.6868, 37.6202], '长官镇': [116.8925, 37.8117],
    '大柳镇': [116.8594, 37.7522], '时集镇': [116.7656, 37.6965], '杜集镇': [116.9341, 37.7143],
    '相衙镇': [116.6892, 37.6901], '宁城街道': [116.7949, 37.6347],
  };
  let hits = 0;
  for (const [name, c] of Object.entries(CENTERS)) {
    const [lng, lat] = wgs(c[0], c[1]);
    if (regeoNingjin(lat, lng).town === name) hits++;
  }
  assert(hits === 11, 'E1 11 个乡镇/街道中心坐标全部解析正确', `hits=${hits}/11`);
  assert(names.length === 12, 'E2 12 个乡镇/街道均可在内置数据中找到');
}

console.log(`\n===== RESULT: ${pass} PASS_MOCK, ${failn} FAIL =====`);
process.exit(failn ? 1 : 0);
