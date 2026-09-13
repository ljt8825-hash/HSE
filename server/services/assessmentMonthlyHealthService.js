/**
 * HSE月度安全履职考核模块 · 健康检查服务（第13节 /health）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / error）。
 */

const { pool } = require('./assessmentMonthlyShared');

async function checkHealth() {
  try {
    const dbResult = await pool.query('SELECT 1 as ok');
    return {
      __t: 'json',
      payload: {
        status: 'ok',
        module: 'assessment-monthly',
        version: '2.0.0',
        database: dbResult.rows[0].ok === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        features: [
          'cycle_management',
          'target_management',
          'metric_management',
          'scoring_engine',
          'deduction_management',
          'deduction_review',
          'deduction_adjustment',
          'responsibility_chain',
          'freeze_management',
          'result_query',
          'export_import',
        ]
      },
    };
  } catch (e) {
    return { __t: 'error', code: 500, message: '服务不可用', data: { error: e.message } };
  }
}

module.exports = { checkHealth };