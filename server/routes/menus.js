/**
 * Menu 菜单管理路由
 * GET  /api/menus           - 获取菜单树
 * GET  /api/menus/:id       - 获取菜单详情
 * POST /api/menus           - 创建菜单
 * PUT  /api/menus/:id       - 更新菜单
 * DELETE /api/menus/:id     - 删除菜单
 * GET  /api/menus/tree      - 获取侧边栏菜单树（带权限过滤）
 */
const express = require('express');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { authMiddleware: verifyToken } = require('../middleware/auth');

const router = express.Router();

function buildTree(menus, parentId = 0) {
  return menus
    .filter(menu => (menu.parent_id || 0) === parentId)
    .map(menu => ({
      ...menu,
      children: buildTree(menus, menu.id)
    }))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

router.get('/', verifyToken, async (req, res) => {
  try {
    const { type } = req.query;
    
    let query = `SELECT id, parent_id as parentId, name, path, component, icon, permission, type,
                        sort_order as sortOrder, is_active as isActive, hidden, keep_alive as keepAlive,
                        redirect, created_at as createdAt, updated_at as updatedAt
                 FROM menus
                 WHERE is_deleted = false`;
    const params = [];

    if (type) {
      query += ' AND type = $1';
      params.push(type);
    }

    query += ' ORDER BY sort_order ASC';

    const result = await pool.query(query, params);
    const tree = buildTree(result.rows);

    res.json(success(tree, '获取菜单树成功'));

  } catch (err) {
    console.error('[Menus] 获取菜单树异常:', err.message);
    res.status(500).json(error(500, '获取菜单树失败'));
  }
});

router.get('/tree', verifyToken, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error(401, '未提供认证令牌'));
    }

    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const roleResult = await pool.query(
      'SELECT r.id FROM user_role ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1',
      [decoded.id]
    );

    const roleIds = roleResult.rows.map(r => r.id);
    if (roleIds.length === 0) {
      return res.json(success([], '用户无角色权限'));
    }

    const menuResult = await pool.query(
      `SELECT DISTINCT m.id, m.parent_id as parentId, m.name, m.path, m.component, m.icon, 
                      m.permission, m.type, m.sort_order as sortOrder, m.is_active as isActive,
                      m.hidden, m.keep_alive as keepAlive, m.redirect
       FROM role_menu rm
       JOIN menus m ON rm.menu_id = m.id
       WHERE rm.role_id = ANY($1) AND m.is_deleted = false AND m.is_active = true AND m.hidden = false
       ORDER BY m.sort_order ASC`,
      [roleIds]
    );

    const tree = buildTree(menuResult.rows);

    res.json(success(tree, '获取权限菜单树成功'));

  } catch (err) {
    console.error('[Menus] 获取权限菜单树异常:', err.message);
    res.status(500).json(error(500, '获取权限菜单树失败'));
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, parent_id as parentId, name, path, component, icon, permission, type,
              sort_order as sortOrder, is_active as isActive, hidden, keep_alive as keepAlive,
              redirect, created_at as createdAt, updated_at as updatedAt
       FROM menus WHERE id = $1 AND is_deleted = false`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '菜单不存在'));
    }

    res.json(success(result.rows[0], '获取菜单详情成功'));

  } catch (err) {
    console.error('[Menus] 获取菜单详情异常:', err.message);
    res.status(500).json(error(500, '获取菜单详情失败'));
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { parentId, name, path, component, icon, permission, type = 'menu', 
            sortOrder = 0, isActive = true, hidden = false, keepAlive = false, redirect } = req.body;

    if (!name) {
      return res.status(400).json(error(400, '菜单名称不能为空'));
    }

    const result = await pool.query(
      `INSERT INTO menus (parent_id, name, path, component, icon, permission, type,
                          sort_order, is_active, hidden, keep_alive, redirect)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, parent_id as parentId, name, path, component, icon, permission, type,
                 sort_order as sortOrder, is_active as isActive, hidden, keep_alive as keepAlive,
                 redirect, created_at as createdAt, updated_at as updatedAt`,
      [parentId || 0, name, path, component, icon, permission, type, sortOrder, isActive, hidden, keepAlive, redirect]
    );

    res.json(success(result.rows[0], '菜单创建成功'));

  } catch (err) {
    console.error('[Menus] 创建菜单异常:', err.message);
    res.status(500).json(error(500, '创建菜单失败'));
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { parentId, name, path, component, icon, permission, type, 
            sortOrder, isActive, hidden, keepAlive, redirect } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (parentId !== undefined) {
      updates.push(`parent_id = $${paramIndex++}`);
      params.push(parentId);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (path !== undefined) {
      updates.push(`path = $${paramIndex++}`);
      params.push(path);
    }
    if (component !== undefined) {
      updates.push(`component = $${paramIndex++}`);
      params.push(component);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      params.push(icon);
    }
    if (permission !== undefined) {
      updates.push(`permission = $${paramIndex++}`);
      params.push(permission);
    }
    if (type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      params.push(type);
    }
    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(sortOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }
    if (hidden !== undefined) {
      updates.push(`hidden = $${paramIndex++}`);
      params.push(hidden);
    }
    if (keepAlive !== undefined) {
      updates.push(`keep_alive = $${paramIndex++}`);
      params.push(keepAlive);
    }
    if (redirect !== undefined) {
      updates.push(`redirect = $${paramIndex++}`);
      params.push(redirect);
    }

    if (updates.length === 0) {
      return res.status(400).json(error(400, '没有要更新的字段'));
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE menus SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_deleted = false
       RETURNING id, parent_id as parentId, name, path, component, icon, permission, type,
                 sort_order as sortOrder, is_active as isActive, hidden, keep_alive as keepAlive,
                 redirect, created_at as createdAt, updated_at as updatedAt`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '菜单不存在'));
    }

    res.json(success(result.rows[0], '菜单更新成功'));

  } catch (err) {
    console.error('[Menus] 更新菜单异常:', err.message);
    res.status(500).json(error(500, '更新菜单失败'));
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const childrenResult = await pool.query(
      'SELECT id FROM menus WHERE parent_id = $1 AND is_deleted = false',
      [id]
    );
    if (childrenResult.rows.length > 0) {
      return res.status(400).json(error(400, '请先删除子菜单'));
    }

    const result = await pool.query(
      'UPDATE menus SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error(404, '菜单不存在'));
    }

    await pool.query('DELETE FROM role_menu WHERE menu_id = $1', [id]);

    res.json(success(null, '菜单删除成功'));

  } catch (err) {
    console.error('[Menus] 删除菜单异常:', err.message);
    res.status(500).json(error(500, '删除菜单失败'));
  }
});

module.exports = router;
