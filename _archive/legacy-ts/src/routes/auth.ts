/**
 * Auth 认证路由（精简 TS 版）
 *
 * 覆盖 Vben 前端需要的核心认证端点:
 *   POST /api/auth/login          - 用户登录
 *   POST /api/auth/logout         - 用户登出
 *   GET  /api/auth/current-user   - 获取当前用户（备用路径，Vben 主要用 /api/user/info）
 *
 * 完整版见: server/routes/auth.js (CommonJS, 717行)
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';
import { success, error } from '../middleware/response';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'hse-dashboard-secret-key-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'hse-dashboard-refresh-secret-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';

// ─── Token 工具函数（内联，避免依赖 middleware/auth.ts）────────

function generateAccessToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, jwtid: `at-${Date.now()}` } as jwt.SignOptions);
}

function generateRefreshToken(payload: object): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN, jwtid: `rt-${Date.now()}` } as jwt.SignOptions);
}

async function blacklistToken(_jti: string, _userId: string, _exp: Date): Promise<void> {
  // TODO: 接入 Redis/PG 黑名单；当前仅做占位
}

// ─── POST /api/auth/login ───
router.post('/login', async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json(error(400, '用户名和密码不能为空'));
    }

    // 查询用户
    const userResult = await pool.query(
      'SELECT id, username, password_hash, real_name, role, department, phone, email, avatar, is_active FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json(error(401, '用户名或密码错误'));
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json(error(403, '账户已被禁用，请联系管理员'));
    }

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json(error(401, '用户名或密码错误'));
    }

    // 更新最后登录时间
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 生成 Token
    const tokenPayload = { id: user.id, username: user.username, role: user.role, realName: user.real_name };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // 返回用户信息（不含密码）
    const userInfo = {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      department: user.department,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
    };

    console.log(`[Auth] 登录成功: ${username} (${Date.now() - startedAt}ms)`);

    res.json(success({
      token: accessToken,
      accessToken: accessToken,   // Vben 官方前端要求字段名
      refreshToken,
      user: userInfo,
    }, '登录成功'));

  } catch (err: any) {
    console.error('[Auth] 登录异常:', err.message);
    res.status(500).json(error(500, '登录失败，服务器内部错误'));
  }
});

// ─── POST /api/auth/logout ───
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded?.jti && decoded?.exp) {
          await blacklistToken(decoded.jti, decoded.id, new Date(decoded.exp * 1000));
        }
      } catch (_decodeErr) { /* ignore */ }
    }
    res.json(success(null, '登出成功'));
  } catch (err: any) {
    console.error('[Auth] 登出异常:', err.message);
    res.status(500).json(error(500, '登出失败'));
  }
});

// ─── GET /api/auth/current-user ───
router.get('/current-user', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error(401, '未提供认证令牌'));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userResult = await pool.query(
      'SELECT id, username, real_name, role, department, phone, email, avatar, is_active, last_login_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(403).json(error(403, '账户已被禁用'));
    }

    res.json(success({
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      department: user.department,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar,
      lastLoginAt: user.last_login_at,
    }, '获取用户信息成功'));

  } catch (err: any) {
    if (err.name === 'TokenExpiredError') return res.status(401).json(error(401, '登录已过期'));
    if (err.name === 'JsonWebTokenError') return res.status(401).json(error(401, '无效的令牌'));
    console.error('[Auth] 获取用户信息异常:', err.message);
    res.status(500).json(error(500, '获取用户信息失败'));
  }
});

export default router;
