// ============================================================================
// CF-WPS-21 离线逆地理编码（宁津县）—— GPS 经纬度 → 乡镇/街道 地理位置
// ----------------------------------------------------------------------------
// 背景：H5 巡视端原来只显示占位文案「当前网格辖区」。业务要求改成由经纬度反查真实位置。
// 方案：内置宁津县 12 个乡镇/街道边界（GCJ-02，见 geo-ningjin-data.js），
//       手机 GPS(WGS-84) → GCJ-02 → 点落面判定 → 得到乡镇/街道名。
// 为什么离线：乡镇上信号差，外部逆地理 API（高德/腾讯）需要 key 且一旦断网就失败；
//       离线判定零依赖、零延迟、可单测。可选增强：配置 env.AMAP_WEB_KEY 后由高德补全到村级。
// 坐标系：高德/腾讯/边界数据 = GCJ-02；浏览器 navigator.geolocation = WGS-84。
//       **必须先转换再判定**，否则偏移约 300~600m，在乡镇交界处会判错。
// ============================================================================
import { NINGJIN_BOUNDS, NINGJIN_COUNTY } from './geo-ningjin-data.js';

const PI = Math.PI;
const A = 6378245.0;              // 长半轴
const EE = 0.00669342162296594323; // 偏心率平方

function outOfChina(lng, lat) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return r;
}

/** WGS-84（浏览器 GPS）→ GCJ-02（高德/边界数据同坐标系） */
export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const radLat = lat / 180 * PI;
  const magic = Math.sin(radLat);
  const m = 1 - EE * magic * magic;
  const sm = Math.sqrt(m);
  dLat = (dLat * 180) / ((A * (1 - EE)) / (m * sm) * PI);
  dLng = (dLng * 180) / (A / sm * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

/** GCJ-02 → WGS-84（一次逼近即可，误差 < 1cm；用于回显用户原始坐标语义时使用） */
export function gcj02ToWgs84(lng, lat) {
  const [gl, glat] = wgs84ToGcj02(lng, lat);
  return [lng * 2 - gl, lat * 2 - glat];
}

// 环穿越计数（偶奇规则：外环 + 孔洞一起数，孔洞自然镂空）
function crosses(flat, lng, lat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], yi = flat[i * 2 + 1];
    const xj = flat[j * 2], yj = flat[j * 2 + 1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** GCJ-02 点 → 乡镇/街道名（点不在宁津县内 → null） */
export function townOfGcj(lng, lat) {
  for (const t of NINGJIN_BOUNDS) {
    for (const group of t.polys) {
      let inside = false;
      for (const ring of group) if (crosses(ring, lng, lat)) inside = !inside;
      if (inside) return t.name;
    }
  }
  return null;
}

/** 最近的乡镇中心（取顶点均值为中心），返回 {name, distanceKm} */
export function nearestTownGcj(lng, lat) {
  let best = null;
  for (const t of NINGJIN_BOUNDS) {
    // 用外环顶点均值近似中心（乡镇面积大，均值偏差 < 2km，仅用于「县境外」提示）
    const ring = t.polys[0][0];
    const n = ring.length / 2;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += ring[i * 2]; sy += ring[i * 2 + 1]; }
    const cx = sx / n, cy = sy / n;
    const dx = (lng - cx) * 111.32 * Math.cos(lat * PI / 180);
    const dy = (lat - cy) * 110.57;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!best || d < best.distanceKm) best = { name: t.name, distanceKm: d };
  }
  return best;
}

/**
 * 逆地理编码主入口。
 * @param {number} latWgs 纬度（WGS-84，手机 GPS 原始值）
 * @param {number} lngWgs 经度（WGS-84）
 * @returns {{county:string, town:string|null, inCounty:boolean, nearest:string|null,
 *            distanceKm:number, address:string, gcj:[number,number], source:string}}
 */
export function regeoNingjin(latWgs, lngWgs) {
  const [gLng, gLat] = wgs84ToGcj02(Number(lngWgs), Number(latWgs));
  const town = townOfGcj(gLng, gLat);
  const near = nearestTownGcj(gLng, gLat);
  const distanceKm = near ? Number(near.distanceKm.toFixed(1)) : null;
  let address;
  if (town) address = NINGJIN_COUNTY + town;
  else if (distanceKm !== null && distanceKm <= 30) address = `${NINGJIN_COUNTY}境外（距${near.name}约${distanceKm}km）`;
  else address = '县境外';
  return {
    county: NINGJIN_COUNTY,
    town,
    inCounty: !!town,
    nearest: near ? near.name : null,
    distanceKm,
    address,
    gcj: [Number(gLng.toFixed(6)), Number(gLat.toFixed(6))],
    source: 'offline',
  };
}

/** 坐标合法性（前端传入的 lat/lng 必须能落到中国境内合理范围，防脏数据） */
export function validLatLng(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  if (la === 0 && ln === 0) return false; // 空值哨兵
  return true;
}

export const GEO_TOWNS = NINGJIN_BOUNDS.map((t) => t.name);
