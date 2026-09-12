const XLSX = require('xlsx');
const path = 'G:/safety_vault/04_现场管理/27、HSE月度考核/2026年/5月/5月管理员月度考核结果.xlsx';
const wb = XLSX.readFile(path);
const ws = wb.Sheets['管理员月度考核结果'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

// 列（R2 子表头，0-indexed）
// 0序号 1乡镇 2管辖区域 3职务 4姓名 5目标职责1 6目标职责2 7培训1 8培训2 9培训3 10三违 11否决项 12加分1 13加分2 14加分3 15共计 16得分
let nonZero = [];
let totalRows = 0;
for (let i = 3; i < data.length; i++) {
  const r = data[i];
  if (!r || !r[4] || String(r[4]).trim() === '' || String(r[4]).trim() === '/') continue;
  totalRows++;
  const name = String(r[4]).trim();
  const town = r[1] != null ? String(r[1]).trim() : '';
  const vals = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((ix) => (r[ix] == null ? null : r[ix]));
  const numVals = vals.map((v) => (v == null ? 0 : Number(v) || 0));
  // 得分列 R2 的子表头最后是"得分"，列16
  const score = r[16] == null ? null : Number(r[16]);
  const hasDeduct = numVals.some((v) => v > 0 && v != null);
  if (hasDeduct || (score != null && score < 100)) {
    nonZero.push({ i, name, town, vals, score });
  }
}
console.log('数据行总数(有姓名):', totalRows);
console.log('有扣分(某维度>0 或得分<100) 的行数:', nonZero.length);
console.log('\n===== 各维度有扣分的人（原始单元格值）=====');
console.log('列标: 目标职责1 目标职责2 培训1(缺次扣10) 培训2(新入职) 培训3(签字/记录) 三违 否决项 加分(思路) 加分(举报) 加分(表彰) | 得分');
for (const x of nonZero) {
  console.log('R' + x.i + ' [' + x.town + '] ' + x.name + ' : ' + x.vals.join(' | ') + ' | 得分=' + x.score);
}

console.log('\n===== 分维度统计"有扣分的人数"=====');
const dims = [
  ['目标职责1(签订责任书)', 5], ['目标职责2(专项活动)', 6],
  ['培训1(按计划缺次扣10)', 7], ['培训2(新入职/转岗/复工)', 8], ['培训3(签字/按手印/记录)', 9],
  ['三违(工作群照片反馈)', 10], ['否决项', 11],
  ['加分(新思路)', 12], ['加分(三违举报)', 13], ['加分(活动表彰)', 14],
];
for (const [label, ix] of dims) {
  let names = [];
  for (let i = 3; i < data.length; i++) {
    const r = data[i];
    if (!r || !r[4] || String(r[4]).trim() === '' || String(r[4]).trim() === '/') continue;
    const v = r[ix];
    const n = v == null ? 0 : Number(v) || 0;
    if (n !== 0) names.push(String(r[4]).trim() + '(' + n + ')');
  }
  console.log('  ' + label + ' [' + ix + '] 非0人数=' + names.length + (names.length ? ' : ' + names.join(', ') : ''));
}
process.exit(0);