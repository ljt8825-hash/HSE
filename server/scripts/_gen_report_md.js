const fs = require('fs');
const data=require('./_report_data.json');
const MONTHS=Object.keys(data);
const cycMAP={'2025-08':44,'2025-09':45,'2025-10':46,'2025-11':47,'2025-12':48,'2026-01':49,'2026-02':50,'2026-03':51,'2026-04':52,'2026-05':53,'2026-06':28,'2026-07':27};
const L=[];const p=x=>L.push(x);
const fmt=x=>{if(x==null)return '—';return Number(x).toFixed(1);};
p('# 「月度安全履职考核·自动评分」 系统得分 与 Excel月度考核结果 对比报告');
p('');
p('## 一、范围与方法');
p(`- **对比期间**：2025-08 ~ 2026-07（12 个月），系统周期 ${MONTHS.map(m=>`cyc${cycMAP[m]}`).join(' / ')}。`);
p(`- **岗位**：管理员（自动评分「管理员」tab）与 乡镇作业中心经理（自动评分「乡镇作业中心经理」tab）。`);
p(`- **系统得分**：`+`hse_assessment_target.score_total`+`（自动评分总分）。`);
p(`- **Excel 得分**：`+`G:\\safety_vault\\04_现场管理\\27、HSE月度考核\\`+`对应月份《管理员月度考核结果》/《乡镇作业中心经理月度考核结果》sheet1 的「得分」列。`);
p(`- **差异口径**：Δ = Excel得分 − 系统得分；Δ≠0 即不一致。「仅在表」=Excel有系统无（多为离职/未建目标）；「仅在系统」=系统有Excel无。`);
p('');

// 汇总表
p('## 二、逐月汇总');
p('| 月份 | 岗位 | 双方一致 | 分数不一致 | 仅在表 | 仅系统 | 备注 |');
p('|---|---|---|---|---|---|---|');
for(const m of MONTHS){
  for(const [kind,lab] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
    const r=data[m][kind];
    const co=r.matches-r.diff.length, d=r.diff.length, eo=r.exOnly.length, so=r.sysOnly.length;
    let note='';
    if(kind==='manager'&&d>=5)note='经理评分尚未对齐';
    if(!r.ok)note=r.excelErr||'无文件';
    p(`| ${m} | ${lab} | ${co} | ${d} | ${eo} | ${so} | ${note} |`);
  }
}
p('');

// 各月明细
monMap: for(const m of MONTHS){
  p(`---`);
  p(`## ${m}（周期 cyc${cycMAP[m]}）`);
  for(const [kind,lab] of [['admin','管理员'],['manager','乡镇作业中心经理']]){
    const r=data[m][kind];
    if(!r.ok){p(`### ${lab}：${r.excelErr||'无文件'}`);p('');continue;}
    const list=Object.keys(r.excel).filter(n=>n in r.sys).sort((a,b)=>a.localeCompare(b,'zh'));
    p(`### ${lab}（Excel得分 vs 系统得分）`);
    if(r.matches===0){p('（无匹配人员）');}
    else{
      p('| 姓名 | Excel得分 | 系统得分 | 差值(Δ) |');
      p('|---|---|---|---|');
      for(const n of list){
        const ex=r.excel[n], sy=r.sys[n];
        const d=+( (ex)-(sy) ).toFixed(2);
        const ds = Math.abs(d)>0.005 ? `**${d}**` : '0.0';
        p(`| ${n} | ${fmt(ex)} | ${fmt(sy)} | ${ds} |`);
      }
    }
    const notes=[];
    if(r.exOnly.length)notes.push(`**仅在表（Excel有/系统无）**：${r.exOnly.join('、')}`);
    if(r.sysOnly.length)notes.push(`**仅系统（Excel无/系统有）**：${r.sysOnly.join('、')}`);
    if(r.diff.length)notes.push(`**分数不一致 ${r.diff.length} 人**：${r.diff.map(x=>`${x.n}(Δ${x.d})`).join('、')}`);
    if(notes.length){notes.forEach(n=>p(`- ${n}`));}
    p('');
  }
}
fs.writeFileSync('G:/hse-dashboard/自动评分考核对比报告_202508-202607.md', L.join('\n'));
console.log('报告已生成: G:/hse-dashboard/自动评分考核对比报告_202508-202607.md ('+L.length+' 行)');