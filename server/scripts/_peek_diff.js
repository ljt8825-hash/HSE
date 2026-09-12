const data=require('./_report_data.json');
for(const mon of ['2025-08','2026-01','2026-06','2026-07']){
  console.log(`== ${mon} ==`);
  console.log(`  管理员 diff:`);
  for(const d of data[mon].admin.diff)console.log(`    ${d.n}: excel=${d.ex} 系统=${d.sy} Δ=${d.d}`);
  console.log(`  乡镇 diff:`);
  for(const d of data[mon].manager.diff)console.log(`    ${d.n}: excel=${d.ex} 系统=${d.sy} Δ=${d.d}`);
}