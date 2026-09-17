/**
 * AI-07 任务模型建表脚本（开发库执行，幂等可重跑）
 *
 * 目标库：safety_dashboard（开发库）
 * 生产库：零 migration（本脚本禁止在生产库执行）
 *
 * 任务书 §5/§35：最小任务表 ai_analysis_tasks，
 * 只保存 请求参数/统计快照/分析结果/Evidence/状态/错误，不复制业务表数据。
 * 业务数据库仍是唯一事实来源。
 */

const { pool } = require('../config/db');

const DDL = `
CREATE TABLE IF NOT EXISTS ai_analysis_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_type VARCHAR(50) NOT NULL DEFAULT 'DATA_ANALYSIS',
  domain VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  priority SMALLINT NOT NULL DEFAULT 5,
  request_hash VARCHAR(64) NOT NULL,
  request_payload JSONB NOT NULL,
  statistics_snapshot JSONB,
  ai_result JSONB,
  evidence JSONB,
  generation_record_id BIGINT,
  provider VARCHAR(50),
  model VARCHAR(100),
  degraded BOOLEAN NOT NULL DEFAULT FALSE,
  error_code VARCHAR(64),
  error_message TEXT,
  error_retryable BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_requested_at TIMESTAMPTZ,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_tasks_status
  ON ai_analysis_tasks (status, priority, id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_tasks_hash
  ON ai_analysis_tasks (request_hash, status);
`;

(async () => {
  let client;
  try {
    const ident = await pool.query('SELECT current_database() db, current_user usr');
    console.log('IDENTITY:', JSON.stringify(ident.rows[0]));
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(DDL);
    await client.query('COMMIT');
    console.log('DDL applied: ai_analysis_tasks + indexes (idempotent)');

    const chk = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ai_analysis_tasks' ORDER BY ordinal_position"
    );
    console.log('COLUMN_COUNT:', chk.rows.length);
    chk.rows.forEach((x) => console.log(' ', x.column_name, x.data_type));
    console.log('RESULT: OK');
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('RESULT: FAIL', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
