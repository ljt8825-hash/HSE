/**
 * 人员管理路由 (personnel.js)
 * 对应数据库表: personnel（22个字段）
 *
 * 阶段7: 新增完整 CRUD + 加密中间件 + 审计日志
 * 加密字段: id_card（身份证号）, phone（手机号）
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { auditLog } = require('./audit');
const { encryptMiddleware, decryptMiddleware } = require('../middleware/encryption');

// 加密字段常量
const ENCRYPT_FIELDS = ['id_card', 'phone'];

// ============================================================
// GET / — 分页查询人员列表
// ============================================================
router.get('/', decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({ list: [], total: 0, page: 1, pageSize: 20 }, '数据库未连接'));
    }

    const { page = 1, pageSize = 20, keyword, dept, status, personCategory } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR employee_code ILIKE $${paramIdx} OR phone ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (dept) {
      conditions.push(`dept ILIKE $${paramIdx}`);
      params.push(`%${dept}%`);
      paramIdx++;
    }
    if (status) {
      conditions.push(`status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (personCategory) {
      conditions.push(`person_category = $${paramIdx}`);
      params.push(personCategory);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM personnel WHERE ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT id, name, employee_code, id_card, gender, birth_date, age, dept, dept_id, position,
              hire_date, leave_date, person_category, person_type, is_public_welfare, phone, status,
              remark, created_at, updated_at
       FROM personnel WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// GET /:id — 单个人员详情
// ============================================================
router.get('/:id', decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT * FROM personnel WHERE id = $1 AND is_deleted = false`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '人员不存在'));
    res.json(success(result.rows[0], '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// POST / — 新增人员
// ============================================================
router.post('/', encryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const {
      name, employee_code, id_card, gender, birth_date, age, dept, dept_id,
      position, hire_date, person_category, person_type, is_public_welfare,
      phone, status, remark
    } = req.body;

    if (!name) return res.json(error(-3, '姓名不能为空'));

    const result = await pool.query(
      `INSERT INTO personnel (name, employee_code, id_card, gender, birth_date, age, dept, dept_id,
        position, hire_date, person_category, person_type, is_public_welfare, phone, status, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        name, employee_code || null, id_card || null, gender || null, birth_date || null,
        age || null, dept || null, dept_id || null, position || null, hire_date || null,
        person_category || null, person_type || null, is_public_welfare || false,
        phone || null, status || '在职', remark || null
      ]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '人员管理',
      description: `新增人员: ${name}（${employee_code || '-'}）`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(result.rows[0], '新增成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// PUT /:id — 更新人员信息
// ============================================================
router.put('/:id', encryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = [
      'name', 'employee_code', 'id_card', 'gender', 'birth_date', 'age', 'dept', 'dept_id',
      'position', 'hire_date', 'leave_date', 'person_category', 'person_type', 'is_public_welfare',
      'phone', 'status', 'remark'
    ];

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
      `UPDATE personnel SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.json(error(-2, '人员不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '人员管理',
      description: `更新人员 ID=${req.params.id}: ${updates.name || ''}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(result.rows[0], '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// DELETE /:id — 删除人员（软删除）
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `UPDATE personnel SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id, name`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '人员不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '人员管理',
      description: `删除人员: ${result.rows[0].name} (ID=${req.params.id})`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// GET /stats — 人员统计
// ============================================================
router.get('/stats/summary', async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const [totalResult, deptResult, statusResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM personnel WHERE is_deleted = false`),
      pool.query(`SELECT dept, COUNT(*)::int AS count FROM personnel WHERE is_deleted = false AND dept IS NOT NULL GROUP BY dept ORDER BY count DESC LIMIT 20`),
      pool.query(`SELECT status, COUNT(*)::int AS count FROM personnel WHERE is_deleted = false GROUP BY status`),
    ]);

    res.json(success({
      total: totalResult.rows[0].total,
      byDept: deptResult.rows,
      byStatus: statusResult.rows,
    }, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
