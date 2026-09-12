/**
 * 迁移：培训签到表（扫描件 OCR）场次台账
 *
 * 新增 training_signin_sessions 表：一行 = 一场培训（一页签到表）
 *   - 班组级(kind=team)：归属班组/作业中心，含应到/实到/缺少/在岗未培训人数
 *   - 公司级(kind=company)：宁津项目跨部门培训，不纳入乡镇/班组统计
 *   - 标签：信息不完整 / 培训内容未填写（只提醒不阻断）
 *   - detail(jsonb)：人员明细（在岗未培训/离职未培训/新入职/待核 分组）
 *
 * 同时为 training_records 增补 source_session_id 列，把场次逐人落痕关联回场次。
 */
const { pool, testConnection } = require('./config/db');

async function migrate() {
  await testConnection();
  console.log('[DBMigrate] 开始培训签到表场次台账迁移...\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. 场次表 training_signin_sessions');
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_signin_sessions (
        id BIGSERIAL PRIMARY KEY,
        source_name VARCHAR(255),
        page_no INT,
        kind VARCHAR(16) NOT NULL DEFAULT 'team',
        dept_name VARCHAR(128),
        team_unit_id BIGINT,
        team_unit_name VARCHAR(128),
        center_name VARCHAR(128),
        training_date DATE,
        expected_count INT NOT NULL DEFAULT 0,
        actual_count INT NOT NULL DEFAULT 0,
        missing_count INT NOT NULL DEFAULT 0,
        untrained_count INT NOT NULL DEFAULT 0,
        resigned_count INT NOT NULL DEFAULT 0,
        newcomer_count INT NOT NULL DEFAULT 0,
        tags TEXT[] NOT NULL DEFAULT '{}',
        content TEXT,
        detail JSONB,
        created_by_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    const sessFields = [
      ['source_name', 'VARCHAR(255)'],
      ['page_no', 'INT'],
      ['kind', "VARCHAR(16) NOT NULL DEFAULT 'team'"],
      ['dept_name', 'VARCHAR(128)'],
      ['team_unit_id', 'BIGINT'],
      ['team_unit_name', 'VARCHAR(128)'],
      ['center_name', 'VARCHAR(128)'],
      ['training_date', 'DATE'],
      ['expected_count', 'INT NOT NULL DEFAULT 0'],
      ['actual_count', 'INT NOT NULL DEFAULT 0'],
      ['missing_count', 'INT NOT NULL DEFAULT 0'],
      ['untrained_count', 'INT NOT NULL DEFAULT 0'],
      ['resigned_count', 'INT NOT NULL DEFAULT 0'],
      ['newcomer_count', 'INT NOT NULL DEFAULT 0'],
      ['tags', "TEXT[] NOT NULL DEFAULT '{}'"],
      ['content', 'TEXT'],
      ['detail', 'JSONB'],
      ['created_by_id', 'BIGINT'],
      ['is_deleted', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ];
    for (const [name, type] of sessFields) {
      try { await client.query(`ALTER TABLE training_signin_sessions ADD COLUMN IF NOT EXISTS ${name} ${type}`); } catch (e) { /* 列已存在 */ }
    }
    await client.query('CREATE INDEX IF NOT EXISTS idx_signin_sessions_date ON training_signin_sessions(training_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_signin_sessions_dept ON training_signin_sessions(dept_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_signin_sessions_team ON training_signin_sessions(team_unit_id)');
    console.log('   ✅ training_signin_sessions 就绪\n');

    console.log('2. training_records 增补 source_session_id');
    try {
      await client.query(`ALTER TABLE training_records ADD COLUMN IF NOT EXISTS source_session_id BIGINT`);
    } catch (e) { /* 列已存在 */ }
    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_training_records_session ON training_records(source_session_id)');
    } catch (e) { /* 忽略 */ }
    console.log('   ✅ training_records.source_session_id 就绪\n');

    await client.query('COMMIT');
    console.log('[DBMigrate] 迁移完成');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[DBMigrate] 迁移失败:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
