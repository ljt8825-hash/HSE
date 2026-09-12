const fs = require('fs');
const data = require('./_report3_data.json');
const L = [];
const p = (x) => L.push(x);
const fmt = (x) => (x == null ? '—' : Number(x).toFixed(1));
const CYCLES = [
  ['2025-09', 45], ['2025-10', 46], ['2025-11', 47],
];

p('# 「月度安全履职考核·自动评分」系统得分 与 Excel月度考核结果 差异化对比报告');
p('');
p('## 一、范围与方法');
p(`- **对比期间**：2025-09～2025-11（周期 cyc45/cyc46/cyc47）。`);
p(`- **岗位**：管理员、乡镇作业中心经理。`);
p(`- **系统得分**：` + '`hse_assessment_target.score_total`' + `；其中 **2025-11 乡镇作业中心经理**按口径「安全文化建设不计入考核」，系统得分 = score_total + 安全文化建设扣分（该列仅展示）。`);
p(`- **Excel 得分**：对应月份《管理员月度考核结果》《乡镇作业中心经理月度考核结果》sheet1「得分」列。`);
p(`- **差异口径**：Δ = Excel得分 − 系统得分；**Δ=0 不列入**，仅报告差异化。`);
p('');
p('## 二、逐月汇总');
p('| 月份(周期) | 岗位 | 分数不一致(人) | 仅在表 | 仅系统 |');
p('|---|---|---|---|---|');
for (const [m, cid] of CYCLES) {
  for (const [kind, lab] of [['admin', '管理员'], ['manager', '乡镇作业中心经理']]) {
    const r = data[m][kind];
    p(`| ${m}(cyc${cid}) | ${lab} | ${r.diff.length > 0 ? `**${r.diff.length}**` : '0'} | ${r.exOnly.length} | ${r.sysOnly.length} |`);
  }
}
p('');

for (const [m, cid] of CYCLES) {
  p('---');
  p(`## ${m}（周期 cyc${cid}）`);
  for (const [kind, lab] of [['admin', '管理员'], ['manager', '乡镇作业中心经理']]) {
    const r = data[m][kind];
    p(`### ${lab}`);
    if (!r.ok) { p(`Excel 解析失败：${r.excelErr || '无文件'}。`); p(''); continue; }
    if (r.diff.length === 0 && r.exOnly.length === 0 && r.sysOnly.length === 0) {
      p('（无差异）'); p(''); continue;
    }
    const hasScore = r.diff.length > 0;
    if (hasScore) {
      p(`**分数不一致 ${r.diff.length} 人**：`);
      p('| 姓名 | Excel得分 | 系统得分 | 差值(Δ) |');
      p('|---|---|---|---|');
      for (const x of r.diff) p(`| ${x.n} | ${fmt(x.ex)} | ${fmt(x.sy)} | **${x.d}** |`);
      p('');
    }
    const notes = [];
    if (r.exOnly.length) notes.push(`仅在表（Excel有/系统无）：${r.exOnly.join('、')}`);
    if (r.sysOnly.length) notes.push(`仅系统（Excel无/系统有）：${r.sysOnly.join('、')}`);
    if (notes.length) { notes.forEach((n) => p(`- ${n}`)); p(''); }
  }
}
p('');
p('## 三、本次已处理的核对项');
p('- **2025-09(cyc45)**：张卫新（事故118）、谢俊章（事故143）按否决项各扣100分 → 系统得分对齐 Excel=0；二人不再列入差异。张福梅（于传峰直接上级）按规则一并否决归0。');
p('- **2025-10(cyc46)**：撤销谢俊章「三违统计(Excel)」1 分，三违合计 7→6，系统总分 93→94。');
p('- **2025-11(cyc47)**：自动评分·乡镇作业中心经理「安全文化建设」列仅展示，不计入考核（前端总分回加该列扣分）。');
fs.writeFileSync('G:/hse-dashboard/自动评分考核对比报告_202509-202511_差异化.md', L.join('\n'));
console.log('报告已生成: G:/hse-dashboard/自动评分考核对比报告_202509-202511_差异化.md (' + L.length + ' 行)');