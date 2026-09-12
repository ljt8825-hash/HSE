const { pool } = require('../config/db');

async function main() {
  // 检查表是否存在
  const r = await pool.query(
    "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='document_standard_relation' ORDER BY ordinal_position"
  );
  if (r.rows.length === 0) {
    console.log('表 document_standard_relation 不存在');
  } else {
    console.log('表已存在，字段:');
    r.rows.forEach(row => console.log('  ' + row.column_name + ': ' + row.data_type + ' (default: ' + (row.column_default || 'NULL') + ')'));
  }

  // 检查索引
  const idx = await pool.query(
    "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='document_standard_relation'"
  );
  console.log('\n索引:');
  idx.rows.forEach(row => console.log('  ' + row.indexname));

  // 检查约束
  const con = await pool.query(
    "SELECT conname, contype, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid='document_standard_relation'::regclass"
  );
  console.log('\n约束:');
  con.rows.forEach(row => console.log('  ' + row.conname + ' (' + row.contype + '): ' + row.def));

  await pool.end();
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });
