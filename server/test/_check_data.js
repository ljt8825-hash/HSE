const { pool } = require('../config/db');

async function main() {
  // 检查数据量
  const count = await pool.query('SELECT COUNT(*) as cnt FROM document_standard_relation');
  console.log('总记录数:', count.rows[0].cnt);

  // 按状态分组
  const byStatus = await pool.query('SELECT status, COUNT(*) as cnt FROM document_standard_relation GROUP BY status');
  console.log('按状态:');
  byStatus.rows.forEach(r => console.log('  ' + r.status + ': ' + r.cnt));

  // 按match_type分组
  const byType = await pool.query('SELECT match_type, COUNT(*) as cnt FROM document_standard_relation GROUP BY match_type');
  console.log('按匹配类型:');
  byType.rows.forEach(r => console.log('  ' + r.match_type + ': ' + r.cnt));

  // 查看几条样例
  const sample = await pool.query('SELECT * FROM document_standard_relation LIMIT 3');
  console.log('\n样例数据:');
  sample.rows.forEach(r => console.log(JSON.stringify(r, null, 2)));

  await pool.end();
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });
