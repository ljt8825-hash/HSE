/**
 * HSE 员工域 · 岗位管理（position 表）
 * 从 hse-employee.js 拆分迁移 —— 保持对外路由契约逐字节不变
 * 由父路由 router.use('/', this) 挂载，最终契约 /api/hse/employee/positions(...)
 */
const express = require('express');
const router = express.Router();

const { pool, isConnected } = require('../../config/db');
const { success, error } = require('../../middleware/response');
const { buildDetailResponse } = require('../../utils/commonResponse');
const { auditLog } = require('../audit');
const { requireRole, requirePermission } = require('../../middleware/auth');

// ============================================================
// 三、岗位管理 (position 表)
// ============================================================

// GET /positions — 岗位列表
router.get('/positions', async (req, res) => {
  try {
    if (!isConnected()) return res.json(success([], '数据库未连接'));

    const { deptId, keyword, jobCategory, isSpecialPost, page, pageSize } = req.query;
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
      res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '查询成功'));
    } else {
      const result = await pool.query(baseSelect, params);
      // 岗位管理前端 positions.vue 的 dataIndex/bodyCell 全为 snake_case，返回原始 snake_case
      res.json(success(result.rows, '查询成功'));
    }
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// POST /positions — 新增岗位
router.post('/positions', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:create'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const { position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties, sort_order, status } = req.body;
    if (!position_code) return res.json(error(-3, '岗位编码不能为空'));
    if (!name) return res.json(error(-3, '岗位名称不能为空'));

    const existCode = await pool.query(`SELECT id FROM position WHERE position_code = $1 AND is_deleted = false`, [position_code]);
    if (existCode.rows.length > 0) return res.json(error(-4, '岗位编码已存在'));

    const result = await pool.query(
      `INSERT INTO position (position_code, name, dept_id, job_category, is_special_post, is_safety_critical, safety_duties, sort_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [position_code, name, dept_id || null, job_category || null, is_special_post || false, is_safety_critical || false,
       safety_duties || null, sort_order || 0, status || 'active']
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '岗位管理',
      description: `新增岗位: ${name}（${position_code}）`,
      ip: req.ip,
    }).catch(() => {});

    buildDetailResponse(res, result.rows[0], '新增成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// PUT /positions/:id — 更新岗位
router.put('/positions/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:update'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
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
    if (fields.length === 0) return res.json(error(-3, '没有要更新的字段'));

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE position SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.json(error(-2, '岗位不存在或已删除'));

    buildDetailResponse(res, result.rows[0], '更新成功', { camelCase: true });
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// DELETE /positions/:id — 删除岗位（软删除）
router.delete('/positions/:id', requireRole('admin', 'safety_manager'), requirePermission('hse:personnel:delete'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    // 提示词-122 P1：删除前检查是否有在职员工关联该岗位，返回友好错误而非 DB 原始报错
    const cntResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM employee_assignment WHERE position_id = $1 AND is_current = true AND is_deleted = false`,
      [req.params.id]
    );
    const assignedCount = parseInt(cntResult.rows[0].cnt, 10);
    if (assignedCount > 0) {
      return res.json(error(-5, `该岗位下有 ${assignedCount} 名在职员工，无法删除。请先为这些员工调整岗位后再操作。`));
    }

    const result = await pool.query(
      `UPDATE position SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING name`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '岗位不存在或已删除'));

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});
module.exports = router;
