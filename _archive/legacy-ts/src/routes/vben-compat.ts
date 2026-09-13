/**
 * Vben 官方前端兼容路由
 *
 * 官方 Vben 登录成功后按框架约定请求：
 *   GET /api/user/info     —— 拉当前用户信息（核心！缺此接口前端无法进入页面）
 *   GET /api/access/codes  —— 拉权限码
 *   GET /api/menu/all      —— 拉菜单树
 *
 * 参考文档: Vben Admin v5.7 官方认证流程 (api/core/auth.ts)
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

/**
 * 从 Bearer Token 解析并加载用户
 */
async function loadUserByToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
  const result = await pool.query(
    'SELECT id, username, real_name, role, department, phone, email, avatar, is_active FROM users WHERE id = $1',
    [decoded.id]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// ─── GET /api/user/info ───
// Vben 前端登录后第一个调用的接口，返回用户信息+角色+权限
router.get('/user/info', async (req: Request, res: Response) => {
  try {
    const user = await loadUserByToken(req);
    if (!user) return res.status(401).json(error(401, '用户不存在或未登录'));
    if (!user.is_active) return res.status(403).json(error(403, '账户已被禁用'));

    const { authorization = '' } = req.headers;
    res.json(
      success(
        {
          userId: user.id,
          username: user.username,
          realName: user.real_name,
          avatar: user.avatar,
          roles: [user.role],
          permissions: ['all'],
          desc: user.department || '',
          homePath: '/hse/todos',
          token: authorization.replace('Bearer ', ''),
          // 业务扩展字段
          department: user.department,
          phone: user.phone,
          email: user.email,
        },
        '获取用户信息成功'
      )
    );
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') return res.status(401).json(error(401, '登录已过期'));
    if (err.name === 'JsonWebTokenError') return res.status(401).json(error(401, '无效的令牌'));
    console.error('[VbenCompat] user/info 异常:', err.message);
    res.status(500).json(error(500, '获取用户信息失败'));
  }
});

// ─── GET /api/access/codes ───
// Vben 实际请求路径可能是 /api/auth/codes（见 api/core/auth.ts getAccessCodesApi）
router.get(['/access/codes', '/auth/codes'], async (req: Request, res: Response) => {
  try {
    const user = await loadUserByToken(req);
    if (!user) return res.status(401).json(error(401, '用户不存在或未登录'));
    const codes = user.role === 'admin' ? ['all'] : [user.role];
    res.json(success(codes, '获取权限码成功'));
  } catch (err: any) {
    console.error('[VbenCompat] access/codes 异常:', err.message);
    res.status(500).json(error(500, '获取权限码失败'));
  }
});

// ─── GET /api/menu/all ───
// 菜单树（frontend accessMode 下前端不调用此接口，仅兜底）
router.get('/menu/all', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, parent_id as "parentId", name, path, component, icon, permission, type,
              sort_order as "sortOrder", is_active as "isActive", hidden, keep_alive as "keepAlive",
              redirect
       FROM menus
       WHERE is_deleted = false AND is_active = true AND hidden = false
       ORDER BY sort_order ASC`
    );
    const buildTree = (menus: any[], parentId = 0): any[] =>
      menus
        .filter((m) => (m.parentId || 0) === parentId)
        .map((m) => ({ ...m, children: buildTree(menus, m.id) }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    res.json(success(buildTree(result.rows), '获取菜单成功'));
  } catch (err: any) {
    console.error('[VbenCompat] menu/all 异常:', err.message);
    res.status(500).json(error(500, '获取菜单失败'));
  }
});

export default router;
