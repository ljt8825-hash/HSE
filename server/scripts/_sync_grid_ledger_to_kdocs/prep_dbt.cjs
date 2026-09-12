// Prep payload for creating a WPS 多维表格 (.dbt) from normalized grid-ledger records.
// - drops empty-string fields per record to shrink payload
// - all fields typed as text for guaranteed creation
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const recs = JSON.parse(fs.readFileSync(path.join(dir, '_wps_records.json'), 'utf8'));

const FIELDS = [
  '当日序号', '昵称', '分组名称', '姓名', '所属岗位', '网格等级', '检查日期',
  '三违行为', '违章人姓名', '违章人性别', '违章人年龄', '当日是否报名',
  '标记', '是否补交', '提交时间', '编号', '来源日期',
];

const fieldsDef = FIELDS.map((n) => ({ name: n, type: 'text' }));

function cleanRecord(r) {
  const fields = {};
  for (const k of FIELDS) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      fields[k] = String(v);
    }
  }
  return { fields };
}

const records = recs.map(cleanRecord);

// chunk into groups of 50
const CHUNK = 50;
const outDir = path.join(dir, 'dbt_chunks');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(dir, 'dbt_fields.json'), JSON.stringify(fieldsDef, null, 2));
for (let i = 0; i < records.length; i += CHUNK) {
  const slice = records.slice(i, i + CHUNK);
  const idx = String(Math.floor(i / CHUNK)).padStart(2, '0');
  fs.writeFileSync(
    path.join(outDir, `chunk_${idx}.json`),
    JSON.stringify(slice, null, 1)
  );
}
const nChunks = Math.ceil(records.length / CHUNK);
console.log('total records:', records.length);
console.log('fields:', FIELDS.length);
console.log('chunks:', nChunks, 'chunk size:', CHUNK);
// sample first record (full)
console.log('sample:', JSON.stringify(records[0]));
// per-chunk byte sizes
for (let i = 0; i < nChunks; i++) {
  const idx = String(i).padStart(2, '0');
  const sz = fs.statSync(path.join(outDir, `chunk_${idx}.json`)).size;
  console.log(`chunk_${idx}.json bytes=${sz}`);
}
