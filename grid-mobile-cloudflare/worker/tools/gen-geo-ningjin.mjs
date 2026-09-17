// 生成宁津县乡镇边界数据模块（从 vben 的 GCJ-02 geojson 简化而来）
import fs from 'node:fs';

const SRC = 'G:/hse-dashboard/安全看板vben/apps/web-naive/public/geojson/ningjin-boundary.geojson';
const OUT = 'G:/hse-dashboard/grid-mobile-cloudflare/worker/geo-ningjin-data.js';
const TOL = 0.00012;          // ~13m，乡镇级判别足够
const DP = 5;                 // 小数位

const g = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// 点到线段距离平方（平面近似）
function distSq(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx, py = a[1] + t * dy;
  return (p[0] - px) ** 2 + (p[1] - py) ** 2;
}
function dp(points, tol) {
  if (points.length < 3) return points.slice();
  const tol2 = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distSq(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const rnd = (v) => Number(v.toFixed(DP));
const out = [];
let rawPts = 0, simPts = 0;
for (const f of g.features) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const rings = [];
  for (const poly of polys) {
    // 保留全部环（外环 + 孔洞）：判定时对所有环做偶奇规则，孔洞自动镂空
    const group = poly.map((ring) => {
      rawPts += ring.length;
      const s = dp(ring, TOL);
      simPts += s.length;
      // 扁平化 [lng,lat,lng,lat,...]，闭合点省略
      const flat = [];
      for (let i = 0; i < s.length - 1; i++) flat.push(rnd(s[i][0]), rnd(s[i][1]));
      return flat;
    });
    rings.push(group);
  }
  out.push({ name: f.properties.name, polys: rings });
}

const header = `// 宁津县乡镇/街道边界（GCJ-02，高德坐标系）
// 来源：安全看板vben/apps/web-naive/public/geojson/ningjin-boundary.geojson（OSM 原始 WGS-84 已由上游转为 GCJ-02）
// 处理：Douglas–Peucker 简化 tol=${TOL}°(~13m) + ${DP} 位小数；顶点 ${rawPts} → ${simPts}
// 用途：H5 GPS 逆地理编码（WGS-84 → GCJ-02 → 点落面判定 → 乡镇/街道名）。纯离线，零外部依赖。
// 生成脚本：worker/tools/gen-geo-ningjin.mjs（如需更新边界请重跑）
export const NINGJIN_COUNTY = '宁津县';
export const NINGJIN_BOUNDS = `;
fs.writeFileSync(OUT, header + JSON.stringify(out) + ';\n', 'utf8');
console.log('顶点', rawPts, '→', simPts, `(${((1 - simPts / rawPts) * 100).toFixed(1)}% 压缩)`);
console.log('输出', OUT, (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
console.log('乡镇数', out.length);
console.log(out.map((o) => o.name + ':' + o.polys.length + '面/' + o.polys.reduce((s, gp) => s + gp.length, 0) + '环/' + o.polys.reduce((s, gp) => s + gp.reduce((t, r) => t + r.length / 2, 0), 0) + '点').join('  '));
