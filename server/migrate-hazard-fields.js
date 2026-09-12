const { pool, testConnection } = require('./config/db');

async function migrateHazardFields() {
  await testConnection();
  const client = await pool.connect();
  try {
    console.log('开始补充 hazards 表字段...');
    const fields = [
      ['responsible_dept', 'VARCHAR(128)'],
      ['responsible_dept_id', 'BIGINT'],
      ['hazard_source', "VARCHAR(64) DEFAULT 'daily_check'"],
      ['hazard_category', 'VARCHAR(64)'],
      ['hazard_level', 'VARCHAR(32)'],
      ['post_name', 'VARCHAR(128)'],
      ['area', 'VARCHAR(128)'],
      ['related_risk_ids', "JSONB DEFAULT '[]'::jsonb"],
      ['deadline_date', 'DATE'],
      ['actual_rectify_date', 'DATE'],
    ];
    for (const [name, type] of fields) {
      try {
        await client.query(`ALTER TABLE hazards ADD COLUMN IF NOT EXISTS ${name} ${type}`);
        console.log(`  ✅ 字段 ${name} 已就绪`);
      } catch (e) {
        console.log(`  ⚠️  字段 ${name}: ${e.message}`);
      }
    }
    console.log('字段迁移完成！');
  } finally {
    client.release();
    pool.end();
  }
}

migrateHazardFields();
