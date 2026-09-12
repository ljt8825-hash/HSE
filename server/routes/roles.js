/**
 * Role 角色管理路由
 * GET  /api/roles           - 获取角色列表
 * GET  /api/roles/:id       - 获取角色详情（含权限）
 * POST /api/roles           - 创建角色
 * PUT  /api/roles/:id       - 更新角色
 * DELETE /api/roles/:id     - 删除角色
 * PUT  /api/roles/:id/permissions - 分配权限
 */
const express = require('express');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { validateBody } = require('../middleware/validate');
const { authMiddleware: verifyToken } = require('../middleware/auth');

const router = express.Router();

/**
 * 角色列表查询（支持分页和筛选）
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, name, code, isActive } = req.query;
    
    let query = `SELECT id, code, name, description, sort_order as sortOrder, is_active as isActive, 
                        created_at as createdAt, updated_at as updatedAt
                 FROM roles
                 WHERE is_deleted = false`;
    const params = [];
    let paramIndex = 1;

    if (name) {
      query += ` AND name LIKE $${paramIndex++}`;
      params.push(`%${name}%`);
    }
    if (code) {
      query += ` AND code LIKE $${paramIndex++}`;
      params.push(`%${code}%`);
    }
    if (isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(isActive === 'true');
    }

    query += ' ORDER BY sort_order ASC, created_at DESC';

    const countQuery = `SELECT COUNT(*) as total FROM roles WHERE is_deleted = false`;
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].total);

    const offset = (page - 1) * pageSize;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(pageSize), offset);

    const result = await pool.query(query, params);

    res.json(success({
      list: result.rows,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    }, '获取角色列表成功'));

  } catch (err) {
    console.error('[Roles] 获取角色列表异常:', err.message);
    res.status(500).json(error(500, '获取角色列表失败'));
  }
});

/**
 * 获取角色详情（包含权限信息）
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const roleResult = await pool.query(
      `SELECT id, code, name, description, sort_order as sortOrder, is_active as isActive, 
              created_at as createdAt, updated_at as updatedAt
       FROM roles WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (roleResult.rows.length === 0) {
      return res.status(404).json(error(404, '角色不存在'));
    }

    const role = roleResult.rows[0];

    const permissionResult = await pool.query(
      `SELECT m.id, m.name, m.path, m.permission, m.type, m.parent_id as parentId
       FROM role_menu rm
       JOIN menus m ON rm.menu_id = m.id
       WHERE rm.role_id = $1
       ORDER BY m.sort_order ASC`,
      [id]
    );

    role.permissions = permissionResult.rows.map(p => p.permission).filter(Boolean);
    role.menuIds = permissionResult.rows.map(p => p.id);

    res.json(success(role, '获取角色详情成功'));

  } catch (err) {
    console.error('[Roles] 获取角色详情异常:', err.message);
    res.status(500).json(error(500, '获取角色详情失败'));
  }
});

/**
 * 创建角色
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { code, name, description, sortOrder = 0, isActive = true, menuIds = [] } = req.body;

    if (!code || !name) {
      return res.status(400).json(error(400, '角色编码和名称不能为空'));
    }

    const existsResult = await pool.query(
      'SELECT id FROM roles WHERE code = $1',
      [code]
    );
    if (existsResult.rows.length > 0) {
      return res.status(400).json(error(400, '角色编码已存在'));
    }

    const result = await pool.query(
      `INSERT INTO roles (code, name, description, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, name, description, sort_order as sortOrder, is_active as isActive,
                 created_at as createdAt, updated_at as updatedAt`,
      [code, name, description, sortOrder, isActive]
    );

    const role = result.rows[0];

    if (menuIds && menuIds.length > 0) {
      for (const menuId of menuIds) {
        await pool.query(
          'INSERT INTO role_menu (role_id, menu_id) VALUES ($1, $2)',
          [role.id, menuId]
        );
      }
    }

    res.json(success(role, '角色创建成功'));

  } catch (err) {
    console.error('[Roles] 创建角色异常:', err.message);
    if (err.code === '23505') {
      return res.status(400).json(error(400, '角色编码已存在'));
    }
    res.status(500).json(error(500, '创建角色失败'));
  }
});

/**
 * 更新角色
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description, sortOrder, isActive } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      params.push(code);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(sortOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json(error(400, '没有要更新的字段'));
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_deleted = false
       RETURNING id, code, name, description, sort_order as sortOrder, is_active as isActive,
                 created_at as createdAt, updated_at as updatedAt`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '角色不存在'));
    }

    res.json(success(result.rows[0], '角色更新成功'));

  } catch (err) {
    console.error('[Roles] 更新角色异常:', err.message);
    if (err.code === '23505') {
      return res.status(400).json(error(400, '角色编码已存在'));
    }
    res.status(500).json(error(500, '更新角色失败'));
  }
});

/**
 * 删除角色（软删除）
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const adminCheck = await pool.query(
      'SELECT id FROM roles WHERE id = $1 AND code = $2',
      [id, 'admin']
    );
    if (adminCheck.rows.length > 0) {
      return res.status(400).json(error(400, '超级管理员角色不能删除'));
    }

    const result = await pool.query(
      'UPDATE roles SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '角色不存在'));
    }

    await pool.query('DELETE FROM role_menu WHERE role_id = $1', [id]);
    await pool.query('DELETE FROM user_role WHERE role_id = $1', [id]);

    res.json(success(null, '角色删除成功'));

  } catch (err) {
    console.error('[Roles] 删除角色异常:', err.message);
    res.status(500).json(error(500, '删除角色失败'));
  }
});

/**
 * 分配权限给角色
 */
router.put('/:id/permissions', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { menuIds = [] } = req.body;

    const roleResult = await pool.query(
      'SELECT id FROM roles WHERE id = $1 AND is_deleted = false',
      [id]
    );
    if (roleResult.rows.length === 0) {
      return res.status(404).json(error(404, '角色不存在'));
    }

    await pool.query('DELETE FROM role_menu WHERE role_id = $1', [id]);

    if (menuIds && menuIds.length > 0) {
      for (const menuId of menuIds) {
        await pool.query(
          'INSERT INTO role_menu (role_id, menu_id) VALUES ($1, $2)',
          [id, menuId]
        );
      }
    }

    const permissionResult = await pool.query(
      'SELECT m.permission FROM role_menu rm JOIN menus m ON rm.menu_id = m.id WHERE rm.role_id = $1',
      [id]
    );

    res.json(success({
      permissions: permissionResult.rows.map(p => p.permission).filter(Boolean),
      menuIds
    }, '权限分配成功'));

  } catch (err) {
    console.error('[Roles] 分配权限异常:', err.message);
    res.status(500).json(error(500, '权限分配失败'));
  }
});

module.exports = router;
