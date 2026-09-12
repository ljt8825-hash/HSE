/**
 * 超龄人员管理路由 (over-age-personnel.js)
 * 对应数据库表: over_age_personnel（23个字段）
 * 关联: personnel 表（通过 personnel_id）
 *
 * 阶段7: 新增完整 CRUD + 加密中间件 + 审计日志
 * 加密字段: id_card（身份证号）
 */

const express = require('express');
const router = express.Router();
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const { auditLog } = require('./audit');
// F1（提示词-131）：与 insurance.js `/overage` 统一加解密策略。
// over_age_personnel.id_card 为 varchar(32)，密文长度 68 → 加密写入必然触发
// "value too long for type character varying(32)"，此前 POST/PUT 带 id_card 时恒失败。
// 在"禁止修改表结构"红线下统一为：写入明文，读取仍解密（对明文 no-op）。
const { decryptMiddleware } = require('../middleware/encryption');

// F6（提示词-132）：补齐路由层鉴权，与前端路由 authority:['admin'] 对齐。
// 此前仅依赖全局 authMiddleware（只校验登录），任何已登录用户均可读写超龄人员数据。
const { requireRole } = require('../middleware/auth');

// 敏感字段常量（读取侧解密白名单；写入侧当前不加密，详见上方说明）
const ENCRYPT_FIELDS = ['id_card'];

// ============================================================
// GET / — 分页查询超龄人员列表
// ============================================================
router.get('/', requireRole('admin', 'safety_manager'), decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) {
      return res.json(success({ list: [], total: 0, page: 1, pageSize: 20 }, '数据库未连接'));
    }

    const { page = 1, pageSize = 20, keyword, dept, controlType, optimizeStatus } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['is_deleted = false'];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(name ILIKE $${paramIdx} OR id_card ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    if (dept) {
      conditions.push(`dept ILIKE $${paramIdx}`);
      params.push(`%${dept}%`);
      paramIdx++;
    }
    if (controlType) {
      conditions.push(`control_type = $${paramIdx}`);
      params.push(controlType);
      paramIdx++;
    }
    if (optimizeStatus) {
      conditions.push(`optimize_status = $${paramIdx}`);
      params.push(optimizeStatus);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM over_age_personnel WHERE ${whereClause}`, params);
    const total = countResult.rows[0].total;

    params.push(limitNum, offset);
    const result = await pool.query(
      `SELECT id, personnel_id, name, id_card, gender, birth_date, age, dept, position, hire_date,
              person_type, control_type, is_to_optimize, actual_insurance, has_injury, has_employer,
              compliance, expire_date, optimize_status, optimize_date, optimize_remark,
              created_at, updated_at
       FROM over_age_personnel WHERE ${whereClause}
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
// GET /:id — 单个超龄人员详情
// ============================================================
router.get('/:id', requireRole('admin', 'safety_manager'), decryptMiddleware(...ENCRYPT_FIELDS), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `SELECT * FROM over_age_personnel WHERE id = $1 AND is_deleted = false`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.json(error(-2, '超龄人员记录不存在'));
    res.json(success(result.rows[0], '查询成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// POST / — 新增超龄人员
// ============================================================
router.post('/', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const {
      personnel_id, name, id_card, gender, birth_date, age, dept, position, hire_date,
      person_type, control_type, is_to_optimize, actual_insurance, has_injury, has_employer,
      compliance, expire_date, optimize_status, optimize_date, optimize_remark
    } = req.body;

    if (!name) return res.json(error(-3, '姓名不能为空'));
    if (age === undefined || age === null) return res.json(error(-3, '年龄不能为空'));

    const result = await pool.query(
      `INSERT INTO over_age_personnel (personnel_id, name, id_card, gender, birth_date, age, dept,
        position, hire_date, person_type, control_type, is_to_optimize, actual_insurance, has_injury,
        has_employer, compliance, expire_date, optimize_status, optimize_date, optimize_remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        personnel_id || null, name, id_card || null, gender || null, birth_date || null, age,
        dept || null, position || null, hire_date || null, person_type || null, control_type || null,
        is_to_optimize || false, actual_insurance || null, has_injury || false, has_employer || false,
        compliance || null, expire_date || null, optimize_status || '待处理', optimize_date || null,
        optimize_remark || null
      ]
    );

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'create', module: '超龄人员管理',
      description: `新增超龄人员: ${name}（年龄${age}）`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(result.rows[0], '新增成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// PUT /:id — 更新超龄人员信息
// ============================================================
router.put('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const updates = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = [
      'personnel_id', 'name', 'id_card', 'gender', 'birth_date', 'age', 'dept', 'position',
      'hire_date', 'person_type', 'control_type', 'is_to_optimize', 'actual_insurance',
      'has_injury', 'has_employer', 'compliance', 'expire_date', 'optimize_status',
      'optimize_date', 'optimize_remark'
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
      `UPDATE over_age_personnel SET ${fields.join(', ')} WHERE id = $${paramIdx} AND is_deleted = false RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.json(error(-2, '超龄人员记录不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'update', module: '超龄人员管理',
      description: `更新超龄人员 ID=${req.params.id}: ${updates.name || ''}`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(result.rows[0], '更新成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// DELETE /:id — 删除超龄人员（软删除）
// ============================================================
router.delete('/:id', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const result = await pool.query(
      `UPDATE over_age_personnel SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id, name`,
      [req.params.id]
    );

    if (result.rows.length === 0) return res.json(error(-2, '超龄人员记录不存在或已删除'));

    await auditLog({
      userId: req.user?.id, username: req.user?.username,
      action: 'delete', module: '超龄人员管理',
      description: `删除超龄人员: ${result.rows[0].name} (ID=${req.params.id})`,
      ip: req.ip,
    }).catch(() => {});

    res.json(success(null, '删除成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

// ============================================================
// GET /stats/summary — 超龄人员统计
// ============================================================
router.get('/stats/summary', requireRole('admin', 'safety_manager'), async (req, res) => {
  try {
    if (!isConnected()) return res.json(error(-1, '数据库未连接'));

    const [totalResult, controlResult, statusResult, expireResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM over_age_personnel WHERE is_deleted = false`),
      pool.query(`SELECT control_type, COUNT(*)::int AS count FROM over_age_personnel WHERE is_deleted = false AND control_type IS NOT NULL GROUP BY control_type ORDER BY count DESC`),
      pool.query(`SELECT optimize_status, COUNT(*)::int AS count FROM over_age_personnel WHERE is_deleted = false GROUP BY optimize_status`),
      pool.query(`SELECT COUNT(*)::int AS expiring_soon FROM over_age_personnel WHERE is_deleted = false AND expire_date IS NOT NULL AND expire_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`),
    ]);

    res.json(success({
      total: totalResult.rows[0].total,
      byControlType: controlResult.rows,
      byOptimizeStatus: statusResult.rows,
      expiringSoon: expireResult.rows[0].expiring_soon,
    }, '统计成功'));
  } catch (err) {
    res.json(error(-1, err.message));
  }
});

module.exports = router;
