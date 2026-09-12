// 验证前端 Excel 解析 + 判定链路：用真实「驾驶员五年违章记录汇总.xlsx」跑一遍
import { readFileSync } from 'node:fs';

const { readViolationExcel } = await import(
  './apps/web-naive/src/views/site/driver/_shared/readViolationExcel.ts'
);
const { calcDriverRisk, riskContent, riskMeasures } = await import(
  './apps/web-naive/src/views/site/driver/_shared/riskRules.ts'
);

const buf = readFileSync(
  'G:\\safety_vault\\04_现场管理\\2026交通专项行动\\公司\\驾驶员五年违章记录汇总.xlsx',
);
// 模拟浏览器 File（readViolationExcel 只用 name / arrayBuffer）
const file = new File([buf], '驾驶员五年违章记录汇总.xlsx');

const { rows, skipped, sheetName } = await readViolationExcel(file);
console.log('sheet:', sheetName, '| rows:', rows.length, '| skipped:', skipped);
console.log('样例:', JSON.stringify(rows.slice(0, 2), null, 0));

// 聚合判定
const byName = new Map();
for (const r of rows) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}
const dist = {};
const out = [];
for (const [name, list] of byName) {
  const v = calcDriverRisk(list);
  dist[v.level] = (dist[v.level] || 0) + 1;
  out.push({ name, level: v.level, score: v.windowScore, hits: [...v.severeHits, ...v.majorHits].join('、') || '-' });
}
const order = { 重大: 0, 较大: 1, 一般: 2, 较低: 3 };
out.sort((a, b) => order[a.level] - order[b.level]);
console.log('\n等级分布:', dist);
console.log('\n非「较低」清单:');
for (const r of out.filter((x) => x.level !== '较低')) {
  console.log(`  ${r.name} → ${r.level}（近12月${r.score}分，命中：${r.hits}）`);
}
console.log('\n管控措施[重大]:\n', riskMeasures('重大'));
console.log('\n违规内容[较大]:\n', riskContent('较大'));
