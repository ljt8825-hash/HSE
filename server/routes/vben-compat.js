/**
 * Vben 官方前端兼容路由
 * --------------------------------------------------------------------------
 * 背景：删除 HSE 自定义前端后，剩余前端是「纯官方 Vben Admin」。
 * 官方 Vben 登录成功后会按框架约定请求以下接口：
 *   GET /api/user/info     —— 拉当前用户信息
 *   GET /api/access/codes  —— 拉权限码
 *   GET /api/menu/all      —— 拉菜单（accessMode=frontend 时前端不调用，仅兜底）
 *
 * 但本后端（为 HSE 业务编写）只实现了 /api/auth/current-user、/api/menus 等，
 * 并未实现上面这套官方路径，导致登录后拉用户信息失败、被踢回登录页（"进不去页面"）。
 *
 * 本文件做一层薄兼容：把官方接口映射到现有数据，不改前端官方代码。
 */
const express = require('express');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { getPermissionsForRole } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/user/info ───
// 基于全局 authMiddleware 已解析的 req.user 返回真实用户信息；
// 无 token / 无效 token / 用户不存在或禁用 → 明确的 401/403，不做任何默认用户回退。
router.get('/user/info', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json(error(401, '用户不存在或未登录'));
    }
    const result = await pool.query(
      'SELECT id, username, real_name, role, department, phone, email, avatar, is_active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json(error(401, '用户不存在或未登录'));
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json(error(403, '账户已被禁用'));
    }
    const { authorization = '' } = req.headers;
    return res.json(
      success(
        {
          userId: user.id,
          username: user.username,
          realName: user.real_name,
          avatar: user.avatar,
          roles: [user.role],
          // 权限码与后端角色权限映射一致，禁止固定返回 ['all']
          permissions: getPermissionsForRole(user.role),
          desc: user.department || '',
          homePath: '/overview/leader-dashboard',
          token: authorization.replace('Bearer ', ''),
          department: user.department,
          phone: user.phone,
          email: user.email,
        },
        '获取用户信息成功'
      )
    );
  } catch (err) {
    console.error('[VbenCompat] user/info 异常:', err.message);
    res.status(500).json(error(500, '获取用户信息失败'));
  }
});

// ─── GET /api/access/codes ───
// Vben 官方前端实际请求路径为 /api/auth/codes（见 api/core/auth.ts getAccessCodesApi）
// 权限码基于已认证用户身份返回，不做开发模式回退。
router.get(['/access/codes', '/auth/codes'], async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json(error(401, '用户不存在或未登录'));
    }
    const codes = req.user.role === 'admin' ? ['admin'] : [req.user.role];
    return res.json(success(codes, '获取权限码成功'));
  } catch (err) {
    console.error('[VbenCompat] access/codes 异常:', err.message);
    res.status(500).json(error(500, '获取权限码失败'));
  }
});

// ─── GET /api/menu/all ───
router.get('/menu/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, parent_id as "parentId", name, path, component, icon, permission, type,
              sort_order as "sortOrder", is_active as "isActive", hidden, keep_alive as "keepAlive",
              redirect
       FROM menus
       WHERE is_deleted = false AND is_active = true AND hidden = false
       ORDER BY sort_order ASC`
    );
    const buildTree = (menus, parentId = 0) =>
      menus
        .filter((m) => Number(m.parentId || 0) === Number(parentId))
        .map((m) => ({ ...m, children: buildTree(menus, m.id) }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    res.json(success(buildTree(result.rows), '获取菜单成功'));
  } catch (err) {
    console.error('[VbenCompat] menu/all 异常:', err.message);
    res.status(500).json(error(500, '获取菜单失败'));
  }
});

module.exports = router;
