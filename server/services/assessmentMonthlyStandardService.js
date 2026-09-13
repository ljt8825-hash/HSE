/**
 * HSE月度安全履职考核模块 · 考核标准配置服务（第12节 /standards）
 * 从 routes/hse-assessment-monthly.js 迁移，业务规则 + SQL，无 express 依赖。
 * 返回统一描述符供 controller 包装（__t: json / detail / error）。
 */

const { camelKeys } = require('../utils/commonResponse');
const { pool, logger, TABLES, recordAudit } = require('./assessmentMonthlyShared');

// 12.1 查询考核标准列表（按岗位）
async function listStandards(query) {
  try {
    const { position, keyword, rule_type } = query;
    const conditions = ['s.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (position) {
      conditions.push(`s.position = $${idx++}`);
      params.push(position);
    }
    if (rule_type) {
      conditions.push(`s.rule_type = $${idx++}`);
      params.push(rule_type);
    }
    if (keyword) {
      conditions.push(`(s.item_name LIKE $${idx} OR s.deduction_rule LIKE $${idx} OR s.category LIKE $${idx})`);
      params.push(`%${keyword}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await pool.query(
      `SELECT s.* FROM ${TABLES.standard} s ${where} ORDER BY s.position ASC, s.sort_order ASC, s.id ASC`,
      params
    );

    const grouped = {};
    for (const row of result.rows) {
      const key = row.position;
      if (!grouped[key]) {
        grouped[key] = { position: row.position, positionName: row.position_name, items: [] };
      }
      grouped[key].items.push(camelKeys(row));
    }

    return {
      __t: 'json',
      payload: { positions: Object.values(grouped), total: result.rows.length },
      message: '查询成功',
    };
  } catch (e) {
    logger.error(`[assessment-standard] 列表查询失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '查询考核标准失败' };
  }
}

// 12.2 更新考核标准
async function updateStandard(user, id, body) {
  try {
    const { item_name, deduction_rule, deduction_score, rule_type, remark, is_active } = body;

    const existResult = await pool.query(
      `SELECT * FROM ${TABLES.standard} WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (existResult.rows.length === 0) {
      return { __t: 'error', code: 404, message: '考核标准不存在' };
    }

    const fields = [];
    const params = [];
    let idx = 1;
    if (item_name !== undefined) { fields.push(`item_name = $${idx++}`); params.push(item_name); }
    if (deduction_rule !== undefined) { fields.push(`deduction_rule = $${idx++}`); params.push(deduction_rule); }
    if (deduction_score !== undefined) { fields.push(`deduction_score = $${idx++}`); params.push(deduction_score); }
    if (rule_type !== undefined) { fields.push(`rule_type = $${idx++}`); params.push(rule_type); }
    if (remark !== undefined) { fields.push(`remark = $${idx++}`); params.push(remark); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(is_active); }

    if (fields.length === 0) {
      return { __t: 'error', code: 400, message: '没有需要更新的字段' };
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE ${TABLES.standard} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await recordAudit(user.id, user.name, user.role, 'UPDATE', 'STANDARD', result.rows[0].id,
      result.rows[0].item_name, { deduction_score: result.rows[0].deduction_score }, '更新考核标准', user.ip);

    return { __t: 'detail', data: result.rows[0], message: '考核标准更新成功', camelCase: true };
  } catch (e) {
    logger.error(`[assessment-standard] 更新失败: ${e.message}`);
    return { __t: 'error', code: 500, message: '更新考核标准失败' };
  }
}

module.exports = { listStandards, updateStandard };