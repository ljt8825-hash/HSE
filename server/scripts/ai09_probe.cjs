/**
 * AI-09 环境探查（只读）：开发库用户角色 / hazards 数据量 / Provider 状态 / 任务表
 * 用法: node scripts/ai09_probe.cjs
 */
const { pool } = require('../config/db');

(async () => {
  try {
    const users = await pool.query(
      `SELECT id, username, role, is_active FROM users ORDER BY id LIMIT 50`
    );
    console.log('USERS:', JSON.stringify(users.rows, null, 2));

    const haz = await pool.query(
      `SELECT COUNT(*)::int AS total,
              MIN(hazard_date)::text AS min_date,
              MAX(hazard_date)::text AS max_date
       FROM hazards WHERE is_deleted = false`
    );
    console.log('HAZARDS:', JSON.stringify(haz.rows[0]));

    const insp = await pool.query(
      `SELECT COUNT(*)::int AS total FROM hse_inspection_tasks`
    );
    console.log('INSPECTION_TASKS:', JSON.stringify(insp.rows[0]));

    const tasks = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
              COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running
       FROM ai_analysis_tasks`
    );
    console.log('AI_TASKS:', JSON.stringify(tasks.rows[0]));
  } catch (e) {
    console.error('PROBE_ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
