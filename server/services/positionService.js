/**
 * HSE 员工域 · 岗位管理服务（position 表）
 * 从 hse-employee/position.js route 内联 handler 迁移 —— 行为逐字节不变
 * 仅承载业务规则 + SQL；无 express 依赖，可独立单测
 */

const { pool } = require('../config/db');

// GET /positions — 岗位列表
async function listPositions(query) {
  const { deptId, keyword, jobCategory, isSpecialPost, page, pageSize } = query;
  const conditions = ['p.is_deleted = false'];
  const params = [];
  let paramIdx = 1;

  if (deptId) {
    conditions.push(`p.dept_id = $${paramIdx++}`);
    params.push(deptId);
  }
  if (keyword) {
    conditions.push(`(p.name ILIKE $${paramIdx} OR p.position_code ILIKE $${paramIdx})`);
    params.push(`%${keyword}%`);
    paramIdx++;
  }
  // 提示词-122 P2：岗位类别 / 特种作业 服务端筛选
  if (jobCategory) {
    conditions.push(`p.job_category = $${paramIdx++}`);
    params.push(jobCategory);
  }
  if (isSpecialPost !== undefined && isSpecialPost !== '') {
    conditions.push(`p.is_special_post = $${paramIdx++}`);
    params.push(isSpecialPost === true || isSpecialPost === 'true');
  }

  const whereClause = conditions.join(' AND ');
  const baseSelect =
    `SELECT p.id, p.position_code, p.name, p.dept_id, p.job_category, p.is_special_post,
            p.is_safety_critical, p.safety_duties, p.sort_order, p.status,
            d.name AS dept_name
     FROM position p
     LEFT JOIN department d ON p.dept_id = d.id AND d.is_deleted = false
     WHERE ${whereClause}
     ORDER BY p.sort_order ASC, p.id ASC`;

  // 提示词-122 P2：分页（仅当传入 page/pageSize 时返回 {list,total,page,pageSize}，
  // 否则返回数组以兼容 OrgTransferModal 等旧调用方）
  const isPaged = page !== undefined || pageSize !== undefined;
  if (isPaged) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize, 10) || 20), 200);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM position p WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].cnt, 10);

    const result = await pool.query(
      `${baseSelect} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limitNum, offset]
    );
    // 岗位管理前端 positions.vue 的 dataIndex/bodyCell 全为 snake_case，返回原始 snake_case
    return { list: result.rows, total, page: pageNum, pageSize: limitNum };
  }
  const result = await pool.query(baseSelect, params);
  // 岗位管理前端 positions.vue 的 dataIndex/bodyCell 全为 snake_case，返回原始 snake_case
  return result.rows;
}

// POST /positions — 新增岗位（返回 {row, error}；error 为业务错误码）
async function createPosition(body) {
  const { position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties, sort_order, status } = body;
  if (!position_code) return { error: -3, message: '岗位编码不能为空' };
  if (!name) return { error: -3, message: '岗位名称不能为空' };

  const existCode = await pool.query(`SELECT id FROM position WHERE position_code = $1 AND is_deleted = false`, [position_code]);
  if (existCode.rows.length > 0) return { error: -4, message: '岗位编码已存在' };

  const result = await pool.query(
    `INSERT INTO position (position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties, sort_order, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [position_code, name, dept_id || null, job_category || null, is_special_post || false, is_safety_critical || false,
     safety_duties || null, sort_order || 0, status || 'active']
  );
  return { row: result.rows[0] };
}

// PUT /positions/:id — 更新岗位（返回 {row, error}）
async function updatePosition(id, body) {
  const updates = body;
  const fields = [];
  const values = [];
  let paramIdx = 1;

  const allowedFields = ['position_code', 'name', 'dept_id', 'job_category', 'is_special_post', 'is_safety_critical', 'safety_duties', 'sort_order', 'status'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${paramIdx++}`);
      values.push(updates[field]);
    }
  }
  if (fields.length === 0) return { error: -3, message: '没有要更新的字段' };

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE position SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
    values
  );
  if (result.rows.length === 0) return { error: -2, message: '岗位不存在或已删除' };
  return { row: result.rows[0] };
}

// DELETE /positions/:id — 删除岗位（软删除，先查在职员工占用）
async function deletePosition(id) {
  // 提示词-122 P1：删除前检查是否有在职员工关联该岗位，返回友好错误而非 DB 原始报错
  const cntResult = await pool.query(
    `SELECT COUNT(*) AS cnt FROM employee_assignment WHERE position_id = $1 AND is_current = true AND is_deleted = false`,
    [id]
  );
  const assignedCount = parseInt(cntResult.rows[0].cnt, 10);
  if (assignedCount > 0) {
    return { error: -5, message: `该岗位下有 ${assignedCount} 名在职员工，无法删除。请先为这些员工调整岗位后再操作。` };
  }

  const result = await pool.query(
    `UPDATE position SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING name`,
    [id]
  );
  if (result.rows.length === 0) return { error: -2, message: '岗位不存在或已删除' };
  return { deleted: true };
}

module.exports = {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
};
