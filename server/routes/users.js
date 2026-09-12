/**
 * 用户管理路由 (users.js)
 * 对应前端 api/modules/user.ts
 *
 * 阶段2完善: 接入 users / roles / user_role / departments 表实现真实 CRUD
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { success, error } = require('../middleware/response');
const { validateBody, validateQuery, validateParams } = require('../middleware/validate');
const { pool } = require('../config/db');
const {
  userQuerySchema,
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
  batchDeleteSchema,
} = require('../schemas/users');
const { idParamSchema } = require('../schemas/common');
const { auditLog } = require('./audit');
const { encryptMiddleware, decryptMiddleware, decryptResult, encryptData } = require('../middleware/encryption');

/**
 * GET /users
 * 分页查询用户列表（支持关键词搜索、角色筛选、部门筛选）
 * 解密 phone 字段返回前端
 */
router.get('/', decryptMiddleware('phone'), validateQuery(userQuerySchema), async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword, role, department, isActive } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(pageSize) || 10), 200);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (keyword) {
      conditions.push(`(u.username ILIKE $${paramIdx} OR u.real_name ILIKE $${paramIdx} OR u.phone ILIKE $${paramIdx})`);
      params.push(`%${keyword}%`);
    }
    if (role) {
      conditions.push(`u.role = $${paramIdx++}`);
      params.push(role);
    }
    if (department) {
      conditions.push(`u.department ILIKE $${paramIdx}`);
      params.push(`%${department}%`);
    }
    if (isActive !== undefined && isActive !== '') {
      conditions.push(`u.is_active = $${paramIdx++}`);
      params.push(isActive === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 总数
    const countResult = await pool.query(`SELECT COUNT(*) as total FROM users u ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // 查询数据（关联角色信息）
    params.push(limitNum);
    params.push(offset);
    const result = await pool.query(
      `SELECT u.id, u.username, u.real_name, u.role, u.department, u.phone, u.email,
              u.avatar, u.is_active, u.last_login_at, u.created_at, u.updated_at
       FROM users u ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      params
    );

    res.json(success({ list: result.rows, total, page: pageNum, pageSize: limitNum }, '获取用户列表成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/:id
 * 单个用户详情（解密 phone）
 */
router.get('/:id', decryptMiddleware('phone'), validateParams(idParamSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, username, real_name, role, department, phone, email, avatar, is_active, last_login_at, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    // 查询用户角色详情
    const rolesResult = await pool.query(
      `SELECT r.id, r.name, r.code, r.description
       FROM roles r
       JOIN user_role ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [id]
    );

    const user = result.rows[0];
    res.json(success({ ...user, roles: rolesResult.rows }, '获取用户详情成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /users
 * 创建用户（加密 phone 字段）
 */
router.post('/', encryptMiddleware('phone'), validateBody(userCreateSchema), async (req, res, next) => {
  try {
    const { username, realName, password, role, department, phone, email, isActive } = req.body;

    // 检查用户名是否已存在
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json(error(409, '用户名已存在'));
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建用户
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, real_name, role, department, phone, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, real_name, role, department, phone, email, is_active, created_at`,
      [username, passwordHash, realName, role || 'viewer', department || null, phone || null, email || null, isActive !== false]
    );

    const user = result.rows[0];

    // 记录审计日志
    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'create',
      module: 'users',
      description: `创建用户: ${username} (${realName})`,
      ip: req.ip,
    });

    res.status(201).json(success(user, '用户创建成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /users/:id
 * 更新用户（加密 phone 字段）
 */
router.put('/:id', encryptMiddleware('phone'), validateParams(idParamSchema), validateBody(userUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 构建动态更新
    const fields = [];
    const values = [];
    let paramIdx = 1;

    if (updates.realName !== undefined) {
      fields.push(`real_name = $${paramIdx++}`);
      values.push(updates.realName);
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${paramIdx++}`);
      values.push(updates.role);
    }
    if (updates.department !== undefined) {
      fields.push(`department = $${paramIdx++}`);
      values.push(updates.department);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramIdx++}`);
      values.push(updates.phone);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIdx++}`);
      values.push(updates.email);
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramIdx++}`);
      values.push(updates.isActive);
    }

    if (fields.length === 0) {
      return res.status(400).json(error(400, '没有要更新的字段'));
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, username, real_name, role, department, phone, email, is_active, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'update',
      module: 'users',
      description: `更新用户 ID=${id}: ${JSON.stringify(updates)}`,
      ip: req.ip,
    });

    res.json(success(result.rows[0], '用户更新成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /users/:id
 * 删除用户
 */
router.delete('/:id', validateParams(idParamSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    // 不允许删除自己
    if (req.user && parseInt(id) === req.user.id) {
      return res.status(403).json(error(403, '不能删除自己的账号'));
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, username', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    // 清理关联数据
    await pool.query('DELETE FROM user_role WHERE user_id = $1', [id]);

    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'delete',
      module: 'users',
      description: `删除用户: ${result.rows[0].username} (ID=${id})`,
      ip: req.ip,
    });

    res.json(success(null, '用户删除成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /users/batch-delete
 * 批量删除用户
 */
router.post('/batch-delete', validateBody(batchDeleteSchema), async (req, res, next) => {
  try {
    const { ids } = req.body;

    // 不允许删除自己
    if (req.user && ids.includes(req.user.id)) {
      return res.status(403).json(error(403, '不能删除自己的账号'));
    }

    await pool.query('DELETE FROM user_role WHERE user_id = ANY($1)', [ids]);
    const result = await pool.query('DELETE FROM users WHERE id = ANY($1) RETURNING id', [ids]);

    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'batch_delete',
      module: 'users',
      description: `批量删除 ${result.rows.length} 个用户`,
      ip: req.ip,
    });

    res.json(success({ deletedCount: result.rows.length }, '批量删除成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /users/:id/status
 * 修改用户状态
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (typeof status !== 'boolean') {
      return res.status(400).json(error(400, 'status 必须为布尔值'));
    }

    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, is_active',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: status ? 'enable' : 'disable',
      module: 'users',
      description: `${status ? '启用' : '禁用'}用户: ${result.rows[0].username}`,
      ip: req.ip,
    });

    res.json(success(result.rows[0], '状态修改成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /users/:id/reset-password
 * 管理员重置密码
 */
router.post('/:id/reset-password', validateParams(idParamSchema), validateBody(passwordResetSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username',
      [passwordHash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    await auditLog({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'reset_password',
      module: 'users',
      description: `重置用户密码: ${result.rows[0].username}`,
      ip: req.ip,
    });

    res.json(success(null, '密码重置成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/roles/options
 * 角色下拉选项
 */
router.get('/roles/options', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, code, description FROM roles WHERE is_active = true ORDER BY id'
    );
    res.json(success(result.rows, '获取角色选项成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/depts/tree
 * 部门树形结构
 */
router.get('/depts/tree', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != '' ORDER BY department`
    );
    // 转换为树形结构（扁平列表，前端可自行展开）
    const tree = result.rows.map((r, i) => ({
      id: i + 1,
      name: r.department,
      children: [],
    }));
    res.json(success(tree, '获取部门树成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/export
 * 导出用户列表（解密 phone）
 */
router.get('/export', decryptMiddleware('phone'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, username, real_name, role, department, phone, email, is_active, last_login_at, created_at
       FROM users ORDER BY created_at DESC LIMIT 5000`
    );
    res.json(success({
      data: result.rows,
      total: result.rows.length,
      exportTime: new Date().toISOString(),
    }, '用户导出成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /users/profile
 * 更新个人资料（加密 phone 字段）
 */
router.put('/profile', encryptMiddleware('phone'), async (req, res, next) => {
  try {
    const profileData = req.body;
    const fields = [];
    const values = [];
    let paramIdx = 1;

    const fieldMap = { realName: 'real_name', phone: 'phone', email: 'email', avatar: 'avatar', department: 'department' };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (profileData[key] !== undefined) {
        fields.push(`${col} = $${paramIdx++}`);
        values.push(profileData[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json(error(400, '没有要更新的字段'));
    }

    fields.push('updated_at = NOW()');
    values.push(req.user?.id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, username, real_name, role, department, phone, email, avatar`,
      values
    );

    res.json(success(result.rows[0], '个人资料更新成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /users/change-password
 * 修改密码
 */
router.post('/change-password', async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!req.user?.id) {
      return res.status(401).json(error(401, '未登录'));
    }

    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json(error(400, '原密码不正确'));
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

    res.json(success(null, '密码修改成功'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
