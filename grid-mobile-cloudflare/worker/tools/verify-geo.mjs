// 校验：简化后边界 vs 原始 geojson 判定一致性 + 已知地标
import fs from 'node:fs';
import { regeoNingjin, townOfGcj, wgs84ToGcj02, gcj02ToWgs84, nearestTownGcj } from '../geo-regeo.js';

const g = JSON.parse(fs.readFileSync('G:/hse-dashboard/安全看板vben/apps/web-naive/public/geojson/ningjin-boundary.geojson', 'utf8'));
function inRing(pt, ring) { const [x, y] = pt; let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function refTown(lng, lat) {
  for (const f of g.features) {
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const poly of polys) {
      let inside = false;
      for (const ring of poly) if (inRing([lng, lat], ring)) inside = !inside;
      if (inside) return f.properties.name;
    }
  }
  return null;
}

console.log('=== A. 已知地标（GCJ 坐标 → WGS → regeo） ===');
const marks = [
  ['柴胡店镇政府', 116.9276, 37.6317, '柴胡店镇'],
  ['康宁湖', 116.790544, 37.625374, '宁城街道'],
  ['宁津县城中心', 116.805, 37.655, null],
  ['大曹镇政府', 116.5892, 37.5754, '大曹镇'],
  ['长官镇政府', 116.8925, 37.8117, '长官镇'],
  ['张大庄镇政府', 116.7984, 37.8012, '张大庄镇'],
  ['杜集镇政府', 116.9341, 37.7143, '杜集镇'],
  ['刘营伍乡政府', 116.7665, 37.7475, '刘营伍乡'],
];
for (const [label, lng, lat, expect] of marks) {
  const [wl, wa] = gcj02ToWgs84(lng, lat);
  const r = regeoNingjin(wa, wl);
  const ok = expect === null ? '--' : (r.town === expect ? 'OK' : 'MISS');
  console.log(`  ${ok.padEnd(4)} ${label.padEnd(8)} → ${r.address}  (town=${r.town})`);
}

console.log('\n=== B. 简化边界 vs 原始 geojson：全县网格一致性 ===');
let same = 0, diff = 0, bothNull = 0;
const diffs = [];
for (let la = 37.45; la <= 37.90; la += 0.004) {
  for (let ln = 116.45; ln <= 117.05; ln += 0.004) {
    const a = townOfGcj(ln, la);
    const b = refTown(ln, la);
    if (a === b) { same++; if (!a) bothNull++; } else { diff++; if (diffs.length < 8) diffs.push(`${ln.toFixed(4)},${la.toFixed(4)} 简化=${a} 原始=${b}`); }
  }
}
console.log(`  一致 ${same}  不一致 ${diff}  (其中皆为空 ${bothNull})`);
diffs.forEach((d) => console.log('    ' + d));

console.log('\n=== C. 应带地标（GCJ）===');
console.log('  ' + [116.79, 37.63].map((v, i) => (i === 0 ? v : v)).join(',') + ' → ' + JSON.stringify(regeoNingjin(...(() => { const [l, a] = gcj02ToWgs84(116.79, 37.63); return [a, l]; })())));
console.log('  县外(北京) → ' + JSON.stringify(regeoNingjin(39.9042, 116.4074)));
console.log('  县外近邻(柴胡店东 5km) → ' + JSON.stringify(regeoNingjin(...(() => { const [l, a] = gcj02ToWgs84(116.98, 37.63); return [a, l]; })())));
