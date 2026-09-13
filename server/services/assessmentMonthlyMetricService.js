/**
 * HSE月度安全履职考核模块 · 考核指标服务（第3节 /metrics）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / detail / error）。
 */

const { camelKeys } = require('../utils/commonResponse');
const { pool, logger, TABLES } = require('./assessmentMonthlyShared');

// 3.1 查询指标列表
async function listMetrics(query) {
  try {
    const { category, target_post, status } = query;

    const conditions = ['is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (target_post) {
      conditions.push(`(target_post = $${idx} OR target_post = 'all')`);
      params.push(target_post);
      idx++;
    }
    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    } else {
      conditions.push(`status = 'active'`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT * FROM ${TABLES.metric} ${where} ORDER BY sort_order ASC, id ASC`,
      params
    );

    return {
      __t: 'json',
      payload: { list: result.rows.map(camelKeys), total: result.rows.length },
    };
  } catch (e) {
    logger.error(`[assessment-metric] 列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询指标列表失败' };
  }
}

// 3.2 获取指标详情
async function getMetric(id) {
  try {
    const result = await pool.query(
      `SELECT * FROM ${TABLES.metric} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (result.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核指标不存在' };
    }
    return { __t: 'detail', data: result.rows[0], message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-metric] 详情查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核指标详情失败' };
  }
}

module.exports = { listMetrics, getMetric };