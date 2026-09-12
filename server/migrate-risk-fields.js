const { pool, testConnection } = require('./config/db');

async function migrateFields() {
  await testConnection();
  const client = await pool.connect();
  try {
    console.log('开始补充 risk_sources 表字段...');
    const fields = [
      ['responsible_dept', 'VARCHAR(128)'],
      ['responsible_person', 'VARCHAR(64)'],
      ['responsible_person_id', 'BIGINT'],
      ['job_name', 'VARCHAR(128)'],
      ['job_type', 'VARCHAR(64)'],
      ['post_name', 'VARCHAR(128)'],
      ['assessment_method', 'VARCHAR(64)'],
      ['assessment_score', 'NUMERIC(10,2)'],
      ['control_measures', "JSONB DEFAULT '{}'::jsonb"],
      ['responsible_dept_id', 'BIGINT'],
    ];
    for (const [name, type] of fields) {
      try {
        await client.query(`ALTER TABLE risk_sources ADD COLUMN IF NOT EXISTS ${name} ${type}`);
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

migrateFields();
