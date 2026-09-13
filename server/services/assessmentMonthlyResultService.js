/**
 * HSE月度安全履职考核模块 · 结果查询服务（第10节 /results）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / list / error）。
 * 复用共享：TABLES / REVIEW_STATUS / getPagination / getSort。
 */

const { camelKeys } = require('../utils/commonResponse');
const {
  pool,
  logger,
  TABLES,
  REVIEW_STATUS,
  getPagination,
  getSort,
} = require('./assessmentMonthlyShared');

// 10.1 考核结果列表（分页+筛选+排序）
async function listResults(query) {
  try {
    const { cycle_id, township, position, grade, status, keyword } = query;
    const { page, pageSize, offset } = getPagination(query);
    const { sortBy, sortOrder } = getSort(query, 'score_total', 'desc');

    const conditions = ['t.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (cycle_id) {
      conditions.push(`t.cycle_id = $${idx++}`);
      params.push(cycle_id);
    }
    if (township) {
      conditions.push(`t.township = $${idx++}`);
      params.push(township);
    }
    if (position) {
      conditions.push(`t.position = $${idx++}`);
      params.push(position);
    }
    if (grade) {
      conditions.push(`t.grade = $${idx++}`);
      params.push(grade);
    }
    if (status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (keyword) {
      conditions.push(`(t.employee_name LIKE $${idx} OR t.employee_code LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT count(*) as cnt FROM ${TABLES.target} t ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt);

    const result = await pool.query(
      `SELECT t.id, t.cycle_id, t.employee_id, t.employee_code, t.employee_name, 
              t.position, t.township, t.department,
              t.score_auto, t.score_manual, t.score_bonus, t.score_total, 
              t.grade, t.rank_township, t.rank_all,
              t.status, t.review_status, t.score_version
       FROM ${TABLES.target} t ${where} 
       ORDER BY t.${sortBy} ${sortOrder} 
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    );

    return { __t: 'list', list: result.rows, total, page, pageSize, message: '查询成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-result] 列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核结果失败' };
  }
}

// 10.2 考核结果详情
async function getResult(targetId) {
  try {
    const targetResult = await pool.query(
      `SELECT * FROM ${TABLES.target} WHERE id = $1 AND is_deleted = FALSE`,
      [targetId]
    );
    if (targetResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核对象不存在' };
    }

    const scoresResult = await pool.query(
      `SELECT s.*, m.metric_name, m.category, m.base_score, m.metric_type
       FROM ${TABLES.score} s
       JOIN ${TABLES.metric} m ON s.metric_id = m.id
       WHERE s.target_id = $1 AND s.is_deleted = FALSE
       ORDER BY m.sort_order ASC`,
      [targetId]
    );

    const deductionsResult = await pool.query(
      `SELECT d.*, m.metric_name, m.category
       FROM ${TABLES.deduction} d
       LEFT JOIN ${TABLES.metric} m ON d.metric_id = m.id
       WHERE d.target_id = $1 AND d.is_deleted = FALSE 
       ORDER BY d.created_at DESC`,
      [targetId]
    );

    const approvedDeduction = deductionsResult.rows.filter(d => 
      d.review_status === REVIEW_STATUS.APPROVED || d.review_status === REVIEW_STATUS.ADJUSTED
    );
    const totalApprovedDeduction = approvedDeduction.reduce((sum, d) => {
      const eff = d.confirmed_score != null ? Number(d.confirmed_score) : (Number(d.suggested_score) || 0);
      return sum + eff;
    }, 0);

    return {
      __t: 'json',
      payload: {
        target: camelKeys(targetResult.rows[0]),
        scores: scoresResult.rows.map(camelKeys),
        deductions: deductionsResult.rows.map(camelKeys),
        summary: camelKeys({
          total_deductions: deductionsResult.rows.length,
          approved_deductions: approvedDeduction.length,
          total_approved_deduction: Math.round(totalApprovedDeduction * 100) / 100,
        })
      },
    };
  } catch (e) {
    logger.error(`[assessment-result] 详情查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核结果详情失败' };
  }
}

// 10.3 排名查询
async function listRanking(query) {
  try {
    const { cycle_id, township, scope = 'all', limit = 10 } = query;

    if (!cycle_id) {
      return { __t: 'error', code: 400, message: '周期ID不能为空' };
    }

    let querySql = `
      SELECT id, employee_id, employee_code, employee_name, position,
             township, department, score_total, grade,
             rank_all, rank_township
      FROM ${TABLES.target}
      WHERE cycle_id = $1 AND is_deleted = FALSE AND score_total IS NOT NULL
    `;
    const params = [cycle_id];
    let idx = 2;

    if (scope === 'township' && township) {
      querySql += ` AND township = $${idx++}`;
      params.push(township);
      querySql += ` ORDER BY rank_township ASC`;
    } else {
      querySql += ` ORDER BY rank_all ASC`;
    }

    querySql += ` LIMIT $${idx}`;
    params.push(Math.min(100, parseInt(limit) || 10));

    const result = await pool.query(querySql, params);

    return {
      __t: 'json',
      payload: { list: result.rows.map(camelKeys), total: result.rows.length, scope },
    };
  } catch (e) {
    logger.error(`[assessment-result] 排名查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询排名失败' };
  }
}

module.exports = { listResults, getResult, listRanking };