/**
 * 提示词-208 只读分析：离线复刻 snapRiskToRoad 逻辑，统计各策略命中数。
 * 默认 --dry（不写库），仅 SELECT 与内存计算。
 */
const fs = require('fs');
const path = require('path');

// ---- 解析 ROAD_NETWORK_DATA（从 risk-map-data.ts 文本提取 name/cls/path）----
const ROAD_FILE = path.join(__dirname, '..', '..', 'apps', 'web-antd', 'src', 'components', 'hse', 'risk-map-data.ts');
const roadText = fs.readFileSync(ROAD_FILE, 'utf8');

function parseRoads(text) {
  const roads = [];
  // 以 id: 'R 为分块边界
  const chunks = text.split(/id:\s*'R/);
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    const nameM = c.match(/name:\s*'([^']*)'/);
    const clsM = c.match(/cls:\s*'([^']*)'/);
    const pathM = c.match(/path:\s*(\[\[[\s\S]*?\]\])/);
    if (!nameM || !clsM || !pathM) continue;
    let path = null;
    try {
      path = JSON.parse(pathM[1]);
    } catch (e) {
      continue;
    }
    if (!Array.isArray(path) || path.length === 0) continue;
    roads.push({ name: nameM[1], cls: clsM[1], path });
  }
  return roads;
}

const ROAD_NETWORK_DATA = parseRoads(roadText);
console.log(`[解析] ROAD_NETWORK_DATA 共 ${ROAD_NETWORK_DATA.length} 条`);

// 真实路名（非 ID 格式）
const REAL_ROAD_NAMES = ROAD_NETWORK_DATA
  .filter((r) => !/^(国道|省道|县道|乡道|穿村道路)-\d+$/.test(r.name))
  .map((r) => r.name);
console.log(`[解析] 真实路名（非ID）共 ${REAL_ROAD_NAMES.length} 个: ${[...new Set(REAL_ROAD_NAMES)].join('、')}`);

// ---- 道路中点缓存 ----
const NINGJIN_CENTER = [116.805, 37.655];
const CLS_PRIORITY = { 国道: 0, 省道: 1, 县道: 2, 乡道: 3, 穿村道路: 4 };
function roadMidpoint(road) {
  const p = road.path;
  const len = p.length;
  let cx = 0, cy = 0;
  p.forEach((pt) => {
    cx += pt[0] / len;
    cy += pt[1] / len;
  });
  return [cx, cy];
}
function distToNingjin(pt) {
  return Math.sqrt((pt[0] - NINGJIN_CENTER[0]) ** 2 + (pt[1] - NINGJIN_CENTER[1]) ** 2);
}

// ---- 别名映射（location 代码/别名 → 真实路名）----
const ROAD_ALIAS = {
  G104: '京岚线',
  // S339 / 廊万线 / 宁东路 / 大柳路 等在道路数据中无对应真实名，暂不映射，避免过度吸附
};

// ---- 场所/乡镇数据源（与 backfill / map.vue 一致）----
const TOWNSHIP_CENTERS = [
  ['刘营伍乡', 116.7665, 37.7475],
  ['张大庄镇', 116.7984, 37.8012],
  ['柴胡店镇', 116.9276, 37.6317],
  ['大曹镇', 116.5892, 37.5754],
  ['保店镇', 116.6868, 37.6202],
  ['长官镇', 116.8925, 37.8117],
  ['大柳镇', 116.8594, 37.7522],
  ['时集镇', 116.7656, 37.6965],
  ['杜集镇', 116.9341, 37.7143],
  ['相衙镇', 116.6892, 37.6901],
  ['宁城街道', 116.7949, 37.6347],
  ['津城街道', 116.803, 37.6232],
];
const PARKS = [
  { name: '中心公园', lng: 116.79738671, lat: 37.63632261 },
  { name: '福宁河景观带', lng: 116.80569098, lat: 37.642924 },
  { name: '新河公园（湿地）', lng: 116.79332627, lat: 37.66315 },
  { name: '康宁湖（西区）', lng: 116.7802801, lat: 37.62537245 },
  { name: '康宁湖（东区）', lng: 116.7915655, lat: 37.624862 },
];
const STATIONS = [
  { name: '大曹镇转运站', lng: 116.59978399, lat: 37.5677537 },
  { name: '保店镇转运站', lng: 116.69413842, lat: 37.60782273 },
  { name: '相衙镇转运站', lng: 116.69304203, lat: 37.66332576 },
  { name: '时集镇转运站', lng: 116.76077978, lat: 37.69101086 },
  { name: '刘营伍乡转运站', lng: 116.78000476, lat: 37.76202433 },
  { name: '张大庄转运站', lng: 116.833725, lat: 37.78435017 },
  { name: '长官镇转运站', lng: 116.92363535, lat: 37.78334669 },
  { name: '大柳镇转运站', lng: 116.83921723, lat: 37.72366746 },
  { name: '杜集镇转运站', lng: 116.94402388, lat: 37.7301902 },
  { name: '柴胡店转运站', lng: 116.90707714, lat: 37.63870936 },
  { name: '乐陵光大环保', lng: 117.30003017, lat: 37.70145604 },
  { name: '德州润电环保', lng: 116.84101635, lat: 37.53324452 },
];
const FACILITIES = [
  { name: '办公室', lng: 116.81585532, lat: 37.63514208 },
  { name: '仓库', lng: 116.81590903, lat: 37.63653545 },
];

// ---- 哈希占位识别（复刻 backfill jitter）----
function jitter(center, seed) {
  const a = Math.sin(seed * 1234.5678) * 0.008;
  const b = Math.cos(seed * 8765.4321) * 0.008;
  return [center[0] + a, center[1] + b];
}
function isHashPlaceholder(risk) {
  const lng = Number(risk.lng);
  const lat = Number(risk.lat);
  if (risk.lng == null || risk.lat == null || isNaN(lng) || isNaN(lat)) return true;
  // 复刻策略4/5：按 id 哈希到某乡镇中心 + jitter
  const idx = Math.abs(risk.id || 0) % TOWNSHIP_CENTERS.length;
  const center = [TOWNSHIP_CENTERS[idx][1], TOWNSHIP_CENTERS[idx][2]];
  const [hlng, hlat] = jitter(center, risk.id || 0);
  return Math.abs(lng - hlng) < 1e-4 && Math.abs(lat - hlat) < 1e-4;
}

// ---- 关键词提取 ----
function extractRoadKeywords(location) {
  const keywords = [];
  const gMatch = location.match(/G(\d{3})/g);
  if (gMatch) keywords.push(...gMatch);
  const sMatch = location.match(/S(\d{3})/g);
  if (sMatch) keywords.push(...sMatch);
  // 已知真实路名（location 直接出现真实名）
  REAL_ROAD_NAMES.forEach((name) => {
    if (location.includes(name)) keywords.push(name);
  });
  return keywords;
}

// ---- snapRiskToRoad 复刻 ----
function snapRiskToRoad(risk) {
  const location = (risk.location || '').trim();
  const cur = [Number(risk.lng), Number(risk.lat)];
  const anchor = isNaN(cur[0]) ? NINGJIN_CENTER : cur;
  const d2 = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  // 精确坐标保护：非占位坐标不做吸附
  if (!isHashPlaceholder(risk)) {
    return { lng: Number(risk.lng), lat: Number(risk.lat), method: 'original' };
  }

  // 1) 道路名称关键词匹配
  const keywords = extractRoadKeywords(location);
  const matchedRoads = [];
  for (const kw of keywords) {
    const alias = ROAD_ALIAS[kw] || kw;
    ROAD_NETWORK_DATA.forEach((road) => {
      if (road.name.includes(alias) && /^(国道|省道|县道|乡道|穿村道路)$/.test(road.cls)) {
        matchedRoads.push(road);
      }
    });
  }
  if (matchedRoads.length > 0) {
    // G道优先于S道优先于县道；同级取距风险点（锚点）最近的分段
    matchedRoads.sort((a, b) => {
      const pa = CLS_PRIORITY[a.cls] ?? 9;
      const pb = CLS_PRIORITY[b.cls] ?? 9;
      if (pa !== pb) return pa - pb;
      return d2(roadMidpoint(a), anchor) - d2(roadMidpoint(b), anchor);
    });
    const mid = roadMidpoint(matchedRoads[0]);
    return { lng: mid[0], lat: mid[1], method: 'road', roadName: matchedRoads[0].name };
  }

  // 2) 场所类型匹配（"最近"锚定到风险点当前坐标，地理更合理）
  if (/转运站|中转站/.test(location)) {
    let best = null, bd = Infinity;
    STATIONS.forEach((s) => {
      const d = d2([s.lng, s.lat], anchor);
      if (d < bd) { bd = d; best = s; }
    });
    if (best) return { lng: best.lng, lat: best.lat, method: 'station', placeName: best.name };
  }
  if (/公园|草坪|绿化带/.test(location) && !/道路/.test(location)) {
    let best = null, bd = Infinity;
    PARKS.forEach((p) => {
      const d = d2([p.lng, p.lat], anchor);
      if (d < bd) { bd = d; best = p; }
    });
    if (best) return { lng: best.lng, lat: best.lat, method: 'park', placeName: best.name };
  }
  if (/办公室/.test(location)) {
    const f = FACILITIES.find((x) => x.name === '办公室');
    return { lng: f.lng, lat: f.lat, method: 'facility', placeName: f.name };
  }
  if (/仓库/.test(location)) {
    const f = FACILITIES.find((x) => x.name === '仓库');
    return { lng: f.lng, lat: f.lat, method: 'facility', placeName: f.name };
  }

  // 3) 区域模糊匹配（乡镇名）
  for (const [town, clng, clat] of TOWNSHIP_CENTERS) {
    if (location.includes(town)) {
      return { lng: clng, lat: clat, method: 'township', placeName: town };
    }
  }
  if (/镇驻地|村内道路/.test(location)) {
    // 取最近乡镇中心
    let best = null, bd = Infinity;
    TOWNSHIP_CENTERS.forEach(([t, clng, clat]) => {
      const d = d2([clng, clat], anchor);
      if (d < bd) { bd = d; best = [t, clng, clat]; }
    });
    if (best) return { lng: best[1], lat: best[2], method: 'township', placeName: best[0] };
  }

  // 4) 兜底：保留原坐标
  return { lng: Number(risk.lng), lat: Number(risk.lat), method: 'original' };
}

// ---- 连接 DB（只读）----
let pool;
try {
  const db = require(path.join(__dirname, '..', '..', '..', 'server', 'config', 'db'));
  pool = db.pool;
} catch (e) {
  try {
    const db = require(path.join(__dirname, '..', '..', 'server', 'config', 'db'));
    pool = db.pool;
  } catch (e2) {
    console.error('无法加载 db 配置:', e2.message);
    process.exit(1);
  }
}

(async () => {
  const { rows } = await pool.query(
    `SELECT id, name, type, level, location, lng, lat, area, sheet
     FROM risk_sources ORDER BY id`,
  );
  // 应用地图过滤（与 loadAndRenderRisks 一致）
  const filtered = rows.filter((r) => {
    const name = r.name || '';
    const location = r.location || '';
    return !(name.includes('高温') || name.includes('雨雾') || name.includes('冰雪') || name.includes('恶劣天气') || location.includes('随车'));
  });
  console.log(`[DB] risk_sources 总数=${rows.length}, 过滤后渲染集=${filtered.length}`);

  const counts = { road: 0, station: 0, park: 0, facility: 0, township: 0, original: 0 };
  const roadDetail = [];
  const originalList = [];
  let nullCoords = 0;
  for (const r of filtered) {
    if (r.lng == null || r.lat == null) nullCoords++;
    const s = snapRiskToRoad(r);
    counts[s.method] = (counts[s.method] || 0) + 1;
    if (s.method === 'road') roadDetail.push({ risk: r.name, id: r.id, road: s.roadName, loc: r.location });
    if (s.method === 'original') originalList.push({ id: r.id, name: r.name, lng: r.lng, lat: r.lat, loc: r.location });
  }

  console.log('\n===== snapRiskToRoad 命中统计 =====');
  console.log(`道路匹配(road):   ${counts.road}`);
  console.log(`转运站(station):  ${counts.station}`);
  console.log(`公园(park):       ${counts.park}`);
  console.log(`设施(facility):   ${counts.facility}`);
  console.log(`乡镇(township):   ${counts.township}`);
  console.log(`保留原坐标(original): ${counts.original}`);
  console.log(`其中原坐标为 NULL 的渲染集记录数: ${nullCoords}`);

  console.log('\n===== 道路匹配明细 (风险点 → 道路) =====');
  roadDetail.forEach((d) => console.log(`  [${d.id}] ${d.risk}  →  ${d.road}   (loc: ${d.loc})`));

  console.log('\n===== 保留原坐标明细 (前20) =====');
  originalList.slice(0, 20).forEach((d) => console.log(`  [${d.id}] ${d.name}  lng=${d.lng} lat=${d.lat}  (loc: ${d.loc})`));

  await pool.end();
  process.exit(0);
})().catch((e) => {
  console.error('分析失败:', e);
  process.exit(1);
});
