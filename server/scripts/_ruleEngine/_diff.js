/**
 * 规则引擎阶段1 · 快照比对工具（parity 校验）
 *
 * 用法：node server/scripts/_ruleEngine/_diff.js <before.json> <after.json>
 * 比对口径：
 *   - 忽略 id（迁移后重新 upsert 可能产生新行 id）、detail.otherCatScore 不参与（依赖扫描时点）
 *   - 比对：行数、target 集合、逐 target 的 suggested/confirmed/review_status 与 source_detail 关键字段
 * 输出：diff=0 表示零行为变化。
 */

const fs = require('fs');
const path = require('path');

// 会随时点变化的字段（不参与 parity 判定）
const IGNORE_DETAIL = new Set(['otherCatScore']);

function normRows(snap) {
  const map = new Map();
  for (const r of snap.rows) {
    if (r.isDeleted) continue; // 只比对生效行
    const detail = {};
    for (const [k, v] of Object.entries(r.detail || {})) {
      if (IGNORE_DETAIL.has(k)) continue;
      detail[k] = v;
    }
    map.set(String(r.targetId), {
      targetId: r.targetId,
      metricId: r.metricId,
      metricCode: r.metricCode,
      deductionItem: r.deductionItem,
      deductionType: r.deductionType,
      deductionSource: r.deductionSource,
      sourceTable: r.sourceTable,
      suggestedScore: r.suggestedScore,
      confirmedScore: r.confirmedScore,
      reviewStatus: r.reviewStatus,
      detail,
    });
  }
  return map;
}

function main() {
  const a = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.resolve(process.argv[3]), 'utf8'));
  const ma = normRows(a);
  const mb = normRows(b);

  const diffs = [];
  const keys = new Set([...ma.keys(), ...mb.keys()]);
  for (const k of [...keys].sort((x, y) => Number(x) - Number(y))) {
    const ra = ma.get(k);
    const rb = mb.get(k);
    if (!ra) { diffs.push(`target=${k}: 迁移后新增行`); continue; }
    if (!rb) { diffs.push(`target=${k}: 迁移后缺失行`); continue; }
    const sa = JSON.stringify(ra);
    const sb = JSON.stringify(rb);
    if (sa !== sb) {
      // 定位首个不同字段
      let field = '?';
      for (const f of Object.keys(ra)) {
        if (JSON.stringify(ra[f]) !== JSON.stringify(rb[f])) { field = f; break; }
      }
      diffs.push(
        `target=${k}: ${field}\n    before=${JSON.stringify(ra[field])}\n    after =${JSON.stringify(rb[field])}`
      );
    }
  }

  const out = [];
  out.push(`cycle=${a.cycleId}  迁移前: 生效行=${a.activeRows} targets=${a.distinctTargets} 合计=${a.sumSuggested}`);
  out.push(`cycle=${b.cycleId}  迁移后: 生效行=${b.activeRows} targets=${b.distinctTargets} 合计=${b.sumSuggested}`);
  out.push('');
  if (a.activeRows !== b.activeRows) diffs.push(`生效行数不一致: ${a.activeRows} vs ${b.activeRows}`);
  if (a.distinctTargets !== b.distinctTargets) diffs.push(`target 数不一致: ${a.distinctTargets} vs ${b.distinctTargets}`);
  if (Math.abs(a.sumSuggested - b.sumSuggested) > 0.001) diffs.push(`suggested 合计不一致: ${a.sumSuggested} vs ${b.sumSuggested}`);

  if (diffs.length === 0) {
    out.push('✅ diff = 0（逐人逐字段完全一致，零行为变化）');
  } else {
    out.push(`❌ diff = ${diffs.length}`);
    out.push(...diffs);
  }
  console.log(out.join('\n'));
  process.exit(diffs.length === 0 ? 0 : 1);
}

main();
