/**
 * Auth 认证路由
 * POST /api/auth/login     - 用户登录
 * POST /api/auth/logout    - 用户登出
 * GET  /api/auth/current-user - 获取当前用户
 * PUT  /api/auth/change-password - 修改密码
 * PUT  /api/auth/profile   - 更新个人信息
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { auditLog } = require('./audit');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { validateBody } = require('../middleware/validate');
const { logger } = require('../middleware/requestLogger');
const { loginSchema, registerSchema, changePasswordSchema, profileSchema } = require('../schemas/auth');
const { validateEnv } = require('../utils/validateEnv');
validateEnv();

const {
  generateAccessToken,
  generateRefreshToken,
  blacklistToken,
  isTokenBlacklisted,
  JWT_REFRESH_SECRET
} = require('../middleware/auth');

const router = express.Router();

// 登录失败锁定配置
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// 登录调试日志配置
const AUTH_LOG_PREFIX = '[Auth/Login]';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * 获取当前请求可用的结构化 logger。
 * requestLogger 中间件启用时优先使用 req.logger，以便自动携带 requestId。
 */
function getAuthLogger(req) {
  return req.logger || logger.child({ module: 'auth' });
}

/**
 * 脱敏输出数据库连接配置，避免泄露密码。
 */
function getSafeDbConfig() {
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '';
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || process.env.POSTGRES_PORT || '5432',
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
    database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.POSTGRES_DB || process.env.PGDATABASE || 'safety_dashboard',
    passwordConfigured: Boolean(password),
    passwordMasked: password ? `${password.slice(0, 3)}***${password.slice(-3)}` : ''
  };
}

/**
 * SQL 参数脱敏，密码、Token、密钥类字段不进入日志。
 */
function maskSqlParams(params = []) {
  return params.map((value) => {
    if (value === null || value === undefined) return value;
    const str = String(value);
    if (str.length > 64) return `${str.slice(0, 16)}...(${str.length} chars)`;
    return value;
  });
}

/**
 * 脱敏用户信息，保留排障必要字段，不输出 password_hash。
 */
function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    role: user.role,
    department: user.department,
    phone: user.phone,
    email: user.email,
    avatar: Boolean(user.avatar),
    isActive: user.is_active,
    passwordHashPresent: Boolean(user.password_hash),
    lastLoginAt: user.last_login_at
  };
}

/**
 * 脱敏 Token 信息，仅输出类型、长度、jti、exp，不输出完整 Token。
 */
function getTokenDebugInfo(token, type) {
  const decoded = jwt.decode(token) || {};
  return {
    type,
    generated: Boolean(token),
    length: token ? token.length : 0,
    jti: decoded.jti,
    exp: decoded.exp,
    iat: decoded.iat
  };
}

function logSql(log, sql, params, context) {
  log.debug(`${AUTH_LOG_PREFIX} 执行 SQL`, {
    context,
    sql,
    params: maskSqlParams(params)
  });
}

/**
 * 检查用户是否被锁定
 * @param {string} username
 * @returns {Promise<{locked: boolean, remainingMinutes: number}>}
 */
async function checkLockout(username, log = logger) {
  const sql = `SELECT count(*) as failed_count
     FROM login_attempts
     WHERE username = $1 AND success = false AND attempt_time > NOW() - INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'`;
  logSql(log, sql, [username], 'checkLockout');
  const result = await pool.query(
    sql,
    [username]
  );
  const failedCount = parseInt(result.rows[0].failed_count);
  log.debug(`${AUTH_LOG_PREFIX} 锁定检查完成`, {
    username,
    failedCount,
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
    lockoutDurationMinutes: LOCKOUT_DURATION_MINUTES
  });
  if (failedCount >= MAX_LOGIN_ATTEMPTS) {
    return { locked: true, remainingMinutes: LOCKOUT_DURATION_MINUTES };
  }
  return { locked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS - failedCount };
}

/**
 * 记录登录尝试
 */
async function recordLoginAttempt(username, ipAddress, successFlag, log = logger) {
  const sql = 'INSERT INTO login_attempts (username, ip_address, success) VALUES ($1, $2, $3)';
  logSql(log, sql, [username, ipAddress, successFlag], 'recordLoginAttempt');
  await pool.query(
    sql,
    [username, ipAddress, successFlag]
  );
  log.debug(`${AUTH_LOG_PREFIX} 登录尝试已记录`, { username, ipAddress, success: successFlag });
}

/**
 * 清理过期登录记录
 */
async function cleanupLoginAttempts(log = logger) {
  const sql = "DELETE FROM login_attempts WHERE attempt_time < NOW() - INTERVAL '1 day'";
  logSql(log, sql, [], 'cleanupLoginAttempts');
  const result = await pool.query(sql);
  log.debug(`${AUTH_LOG_PREFIX} 过期登录记录清理完成`, { rowCount: result.rowCount });
}

// ─── POST /api/auth/debug-login ───
// 仅开发环境开放，用于排查登录流程。不会返回完整 Token，不会记录失败次数。
router.post('/debug-login', async (req, res) => {
  if (IS_PRODUCTION) {
    return res.status(404).json(error(404, '接口不存在'));
  }

  const log = getAuthLogger(req);
  const startedAt = Date.now();
  const { username, password } = req.body || {};
  const steps = [];

  const pushStep = (name, status, detail = {}) => {
    const step = { name, status, detail };
    steps.push(step);
    log.info(`${AUTH_LOG_PREFIX} debug-login 步骤`, step);
  };

  try {
    pushStep('读取请求参数', username && password ? 'ok' : 'fail', {
      username,
      passwordProvided: Boolean(password),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!username || !password) {
      return res.status(400).json(error(400, 'username 和 password 必填'));
    }

    pushStep('读取数据库连接配置', 'ok', getSafeDbConfig());

    const dbResult = await pool.query('SELECT current_database() AS database, current_user AS user');
    pushStep('验证数据库连接', 'ok', dbResult.rows[0]);

    const lockout = await checkLockout(username, log);
    pushStep('检查登录锁定', lockout.locked ? 'locked' : 'ok', lockout);

    const userSql = 'SELECT id, username, password_hash, real_name, role, department, phone, email, avatar, is_active, last_login_at FROM users WHERE username = $1';
    logSql(log, userSql, [username], 'debugLogin.findUser');
    const userResult = await pool.query(userSql, [username]);
    pushStep('查询用户', userResult.rows.length > 0 ? 'ok' : 'not_found', {
      rowCount: userResult.rows.length,
      user: sanitizeUser(userResult.rows[0])
    });

    if (userResult.rows.length === 0) {
      return res.status(200).json(success({ steps, durationMs: Date.now() - startedAt }, 'debug-login 完成：用户不存在'));
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      pushStep('检查账户状态', 'disabled', sanitizeUser(user));
      return res.status(200).json(success({ steps, durationMs: Date.now() - startedAt }, 'debug-login 完成：账户已禁用'));
    }

    pushStep('检查账户状态', 'ok', { isActive: user.is_active });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    pushStep('验证密码', validPassword ? 'ok' : 'fail', { validPassword });

    if (!validPassword) {
      return res.status(200).json(success({ steps, durationMs: Date.now() - startedAt }, 'debug-login 完成：密码不匹配'));
    }

    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.real_name
    };
    pushStep('准备 Token Payload', 'ok', tokenPayload);

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    pushStep('生成 Token', 'ok', {
      accessToken: getTokenDebugInfo(accessToken, 'access'),
      refreshToken: getTokenDebugInfo(refreshToken, 'refresh'),
      jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
      jwtRefreshSecretConfigured: Boolean(JWT_REFRESH_SECRET)
    });

    return res.json(success({
      steps,
      durationMs: Date.now() - startedAt,
      user: sanitizeUser(user)
    }, 'debug-login 完成'));
  } catch (err) {
    log.error(`${AUTH_LOG_PREFIX} debug-login 异常`, {
      error: err.message,
      stack: err.stack,
      username,
      durationMs: Date.now() - startedAt
    });
    return res.status(500).json(error(500, 'debug-login 执行失败'));
  }
});

// ─── POST /api/auth/login ───
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const log = getAuthLogger(req);
  const startedAt = Date.now();
  const loginContext = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    db: getSafeDbConfig()
  };

  try {
    const { username, password } = req.body;
    log.info(`${AUTH_LOG_PREFIX} 登录流程开始`, {
      ...loginContext,
      username,
      passwordProvided: Boolean(password)
    });

    // 参数校验
    if (!username || !password) {
      log.warn(`${AUTH_LOG_PREFIX} 参数校验失败`, { username, passwordProvided: Boolean(password) });
      return res.status(400).json(error(400, '用户名和密码不能为空'));
    }

    // 检查锁定（生产环境启用，开发环境跳过）
    if (IS_PRODUCTION) {
      const lockout = await checkLockout(username, log);
      if (lockout.locked) {
        log.warn(`${AUTH_LOG_PREFIX} 账户被锁定`, { username, lockout });
        return res.status(423).json(error(423,
          `登录失败次数过多，账户已锁定，请 ${LOCKOUT_DURATION_MINUTES} 分钟后重试`
        ));
      }
      log.debug(`${AUTH_LOG_PREFIX} 账户未锁定`, { username, lockout });
    } else {
      log.debug(`${AUTH_LOG_PREFIX} 开发环境跳过锁定检查`, { username });
    }

    // 查询用户
    const findUserSql = 'SELECT id, username, password_hash, real_name, role, department, phone, email, avatar, is_active FROM users WHERE username = $1';
    logSql(log, findUserSql, [username], 'login.findUser');
    const userResult = await pool.query(
      findUserSql,
      [username]
    );
    log.debug(`${AUTH_LOG_PREFIX} 用户查询完成`, {
      username,
      rowCount: userResult.rows.length,
      user: sanitizeUser(userResult.rows[0])
    });

    if (userResult.rows.length === 0) {
      await recordLoginAttempt(username, req.ip, false, log);
      log.warn(`${AUTH_LOG_PREFIX} 用户不存在`, { username, durationMs: Date.now() - startedAt });
      return res.status(401).json(error(401, '用户名或密码错误'));
    }

    const user = userResult.rows[0];

    // 检查账户是否激活
    if (!user.is_active) {
      log.warn(`${AUTH_LOG_PREFIX} 账户已禁用`, { user: sanitizeUser(user) });
      return res.status(403).json(error(403, '账户已被禁用，请联系管理员'));
    }
    log.debug(`${AUTH_LOG_PREFIX} 账户状态正常`, { userId: user.id, username: user.username });

    // 验证密码
    const validPassword = await bcrypt.compare(password, user.password_hash);
    log.debug(`${AUTH_LOG_PREFIX} 密码校验完成`, { username, validPassword });
    if (!validPassword) {
      await recordLoginAttempt(username, req.ip, false, log);
      log.warn(`${AUTH_LOG_PREFIX} 密码错误`, { username, durationMs: Date.now() - startedAt });
      return res.status(401).json(error(401, '用户名或密码错误'));
    }

    // 登录成功，清理旧记录
    await recordLoginAttempt(username, req.ip, true, log);
    await cleanupLoginAttempts(log);

    // 更新最后登录时间
    const updateLoginSql = 'UPDATE users SET last_login_at = NOW() WHERE id = $1';
    logSql(log, updateLoginSql, [user.id], 'login.updateLastLogin');
    await pool.query(
      updateLoginSql,
      [user.id]
    );
    log.debug(`${AUTH_LOG_PREFIX} 最后登录时间已更新`, { userId: user.id });

    // 生成 Token
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.real_name
    };
    log.debug(`${AUTH_LOG_PREFIX} Token Payload 已准备`, tokenPayload);
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    log.info(`${AUTH_LOG_PREFIX} Token 生成完成`, {
      accessToken: getTokenDebugInfo(accessToken, 'access'),
      refreshToken: getTokenDebugInfo(refreshToken, 'refresh'),
      jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
      jwtRefreshSecretConfigured: Boolean(JWT_REFRESH_SECRET)
    });

    // 返回用户信息（不包含密码）
    const userInfo = {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      department: user.department,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar
    };

    // 审计日志: 登录
    await auditLog({
      userId: user.id,
      username: user.username,
      action: 'login',
      module: 'auth',
      description: '用户登录',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      statusCode: 200,
    }).catch(() => {});

    log.info(`${AUTH_LOG_PREFIX} 登录流程成功`, {
      user: userInfo,
      durationMs: Date.now() - startedAt
    });

    // 设置 refreshToken 到 cookie（供 baseRequestClient 的 withCredentials 使用）
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false, // 开发环境不用 HTTPS
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天 = refreshToken 有效期
      path: '/',
    });

    res.json(success({
      token: accessToken,
      accessToken: accessToken, // Vben 官方前端要求字段名
      refreshToken,
      user: userInfo
    }, '登录成功'));

  } catch (err) {
    log.error(`${AUTH_LOG_PREFIX} 登录异常`, {
      error: err.message,
      stack: err.stack,
      durationMs: Date.now() - startedAt,
      db: getSafeDbConfig()
    });
    res.status(500).json(error(500, '登录失败，服务器内部错误'));
  }
});

// ─── POST /api/auth/logout ───
// 语义：无 Token / 无效 Token / 伪造 Token → 幂等成功（不写黑名单、不用其声明写审计）；
//       有效 Token → 验签后写入黑名单（持久化失败返回明确失败，不伪装成功），审计使用可信身份。
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let decoded = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        // 只撤销 access 类型且含 jti 的令牌
        if (decoded.type !== 'access' || !decoded.jti) {
          decoded = null;
        }
      } catch (err) {
        // 无效/过期/伪造 Token：保持幂等，不写入黑名单、不用其声明
        decoded = null;
      }
    }

    if (decoded && decoded.jti && decoded.exp) {
      try {
        await blacklistToken(decoded.jti, decoded.id, new Date(decoded.exp * 1000));
      } catch (err) {
        console.error('[Auth] 登出撤销失败:', err.message);
        return res.status(500).json(error(500, '登出失败：服务端会话撤销失败，请重试'));
      }
      // 审计（仅使用验签后的可信身份）
      auditLog({
        userId: decoded.id,
        username: decoded.username,
        action: 'logout',
        module: 'auth',
        description: '用户登出',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }).catch((err) => {
        console.warn('[Auth] 登出审计写入失败:', err.message);
      });
    }

    res.json(success(null, '登出成功'));
  } catch (err) {
    console.error('[Auth] 登出异常:', err.message);
    res.status(500).json(error(500, '登出失败'));
  }
});

// ─── POST /api/auth/register ───
router.post('/register', validateBody(registerSchema), async (req, res) => {
  try {
    const { username, password, realName, email, phone, department } = req.body;

    // 检查用户名是否已存在
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json(error(409, '用户名已存在'));
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户（默认角色 viewer，状态激活）
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, real_name, role, department, phone, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, username, real_name, role, department, phone, email`,
      [username, passwordHash, realName, 'viewer', department || null, phone || null, email || null]
    );

    const user = result.rows[0];
    await auditLog({
      userId: user.id,
      username: user.username,
      action: 'register',
      module: 'auth',
      description: `新用户注册: ${username}`,
      ip: req.ip,
    }).catch(() => {});
    res.status(201).json(success({
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      department: user.department,
      phone: user.phone,
      email: user.email,
    }, '注册成功，请登录'));
  } catch (err) {
    console.error('[Auth] 注册异常:', err.message);
    res.status(500).json(error(500, '注册失败，服务器内部错误'));
  }
});

// ─── GET /api/auth/current-user ───
router.get('/current-user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error(401, '未提供认证令牌'));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 查询最新用户信息
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
      lastLoginAt: user.last_login_at
    }, '获取用户信息成功'));

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(error(401, '登录已过期'));
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json(error(401, '无效的令牌'));
    }
    console.error('[Auth] 获取用户信息异常:', err.message);
    res.status(500).json(error(500, '获取用户信息失败'));
  }
});

// ─── PUT /api/auth/change-password ───
router.put('/change-password', validateBody(changePasswordSchema), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error(401, '未提供认证令牌'));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json(error(400, '旧密码和新密码不能为空'));
    }

    // 密码强度检查
    if (newPassword.length < 8) {
      return res.status(400).json(error(400, '新密码长度不能少于8位'));
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json(error(400, '新密码必须包含大小写字母和数字'));
    }

    // 查询用户
    const userResult = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json(error(404, '用户不存在'));
    }

    const user = userResult.rows[0];

    // 验证旧密码
    const validOldPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validOldPassword) {
      return res.status(400).json(error(400, '旧密码不正确'));
    }

    // 哈希新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, user.id]
    );

    // 审计日志: 修改密码
    await auditLog({
      userId: user.id,
      username: user.username,
      action: 'change_password',
      module: 'auth',
      description: `修改密码`,
      ip: req.ip,
    }).catch(() => {});

    // 将当前 Token 加入黑名单（强制重新登录）
    try {
      if (decoded.jti && decoded.exp) {
        await blacklistToken(decoded.jti, decoded.id, new Date(decoded.exp * 1000));
      }
    } catch (blErr) {
      console.warn('[Auth] 加入黑名单失败:', blErr.message);
    }

    res.json(success(null, '密码修改成功，请使用新密码重新登录'));

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(error(401, '登录已过期'));
    }
    console.error('[Auth] 修改密码异常:', err.message);
    res.status(500).json(error(500, '修改密码失败'));
  }
});

// ─── PUT /api/auth/profile ───
router.put('/profile', validateBody(profileSchema), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(error(401, '未提供认证令牌'));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { realName, department, phone, email, avatar } = req.body;

    // 构建动态更新 SQL
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (realName !== undefined) {
      updates.push(`real_name = $${paramIndex++}`);
      values.push(realName);
    }
    if (department !== undefined) {
      updates.push(`department = $${paramIndex++}`);
      values.push(department);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(avatar);
    }

    if (updates.length === 0) {
      return res.status(400).json(error(400, '没有要更新的字段'));
    }

    values.push(decoded.id);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );

    // 返回更新后的用户信息
    const userResult = await pool.query(
      'SELECT id, username, real_name, role, department, phone, email, avatar FROM users WHERE id = $1',
      [decoded.id]
    );

    const user = userResult.rows[0];
    await auditLog({
      userId: decoded.id,
      username: decoded.username,
      action: 'update_profile',
      module: 'auth',
      description: `更新个人资料`,
      ip: req.ip,
    }).catch(() => {});
    res.json(success({
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      department: user.department,
      phone: user.phone,
      email: user.email,
      avatar: user.avatar
    }, '个人信息更新成功'));

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json(error(401, '登录已过期'));
    }
    console.error('[Auth] 更新个人信息异常:', err.message);
    res.status(500).json(error(500, '更新个人信息失败'));
  }
});

// ─── POST /api/auth/refresh ───
// 用 refreshToken 换取新的 accessToken（前端 401 时自动调用）
router.post('/refresh', async (req, res) => {
  try {
    // 多来源获取 refreshToken：header > body > cookie
    let refreshToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      refreshToken = authHeader.substring(7);
    }
    if (!refreshToken && req.body && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }
    // 手动解析 Cookie header（无 cookie-parser 依赖）
    if (!refreshToken && req.headers.cookie) {
      const cookieStr = req.headers.cookie;
      const match = cookieStr.match(/refresh_token=([^;]+)/);
      if (match) refreshToken = match[1];
    }
    if (!refreshToken) {
      return res.status(401).json(error(401, '未提供刷新令牌'));
    }

    // 验证 refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json(error(401, '刷新令牌已过期，请重新登录'));
      }
      return res.status(401).json(error(401, '刷新令牌无效'));
    }

    // 必须是 refresh 类型
    if (decoded.type !== 'refresh') {
      return res.status(401).json(error(401, '令牌类型错误'));
    }

    // 黑名单检查（fail-closed：撤销存储查询异常时拒绝刷新，不 fail-open）
    try {
      if (decoded.jti && await isTokenBlacklisted(decoded.jti)) {
        return res.status(401).json(error(401, '刷新令牌已注销'));
      }
    } catch (err) {
      console.error('[Auth] 刷新黑名单检查失败:', err.message);
      return res.status(503).json(error(503, '认证服务暂不可用，请稍后重试'));
    }

    // 生成新的 access token
    const tokenPayload = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    const newAccessToken = generateAccessToken(tokenPayload);

    logger.info('[Auth] Token 刷新成功', { userId: decoded.id, username: decoded.username });

    // 前端期望 { data: string } 格式（accessToken 直接放在 data 字段）
    res.json({ code:0, success:true, data: newAccessToken, message:'Token 刷新成功' });

  } catch (err) {
    console.error('[Auth] 刷新令牌异常:', err.message);
    res.status(500).json(error(500, '刷新令牌失败'));
  }
});

module.exports = router;
