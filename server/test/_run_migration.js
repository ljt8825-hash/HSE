const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'hse_standard_relation_v55_migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('迁移成功');

  const r = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='document_standard_relation' ORDER BY ordinal_position"
  );
  console.log('表结构:');
  r.rows.forEach(row => console.log('  ' + row.column_name + ': ' + row.data_type));

  await pool.end();
}

main().catch(e => { console.error('迁移失败:', e.message); process.exit(1); });
