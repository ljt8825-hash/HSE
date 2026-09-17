/**
 * 移动端登录路由（H5-GRID-LOGIN-02）
 * POST /api/mobile/auth/login - 手机号 + 密码 → 现有用户 → employee → employee_code
 *
 * 设计红线（与任务书一致）：
 * 1. 不改 PC 登录：/api/auth/login 语义、users.username 数据、JWT 结构零改动。
 * 2. 手机号精确匹配 users.phone：
 *      0 条 → 统一失败响应（不泄露账号是否存在）；
 *      >1 条 → fail-closed（绝不“选第一条”）。
 * 3. 复用现有密码验证（bcrypt.compare vs users.password_hash），不新建第二套密码体系。
 * 4. 复用现有 JWT 签发（middleware/auth generateAccessToken/generateRefreshToken），
 *    payload 结构与 PC 登录完全一致；employee_code 不进 JWT。
 * 5. 业务身份链复用 authenticatedEmployeeResolver（users.employee_id → employee.id，
 *    严禁姓名兜底）：用户停用 / employee 删除 / employee_code 缺失 → fail-closed。
 * 6. 日志不出现密码与完整 token；手机号脱敏输出。
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { auditLog } = require('./audit');
const { pool } = require('../config/db');
const { success, error } = require('../middleware/response');
const { validateBody } = require('../middleware/validate');
const { logger } = require('../middleware/requestLogger');
const { mobileLoginSchema } = require('../schemas/auth');
const {
  generateAccessToken,
  generateRefreshToken,
  JWT_REFRESH_SECRET
} = require('../middleware/auth');
const { resolveAuthenticatedEmployee } = require('../services/authenticatedEmployeeResolver');

const router = express.Router();

const MOBILE_LOG_PREFIX = '[Auth/MobileLogin]';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// 与 PC 登录保持一致的失败锁定参数（按手机号键记账，复用 login_attempts 表）
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

function getMobileLogger(req) {
  return req.logger || logger.child({ module: 'mobile-auth' });
}

/** 手机号脱敏：139****0001 */
function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 7) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 脱敏 Token 信息（与 PC 登录同规则：仅类型/长度/jti/exp，不输出完整 Token） */
function getTokenDebugInfo(token, type) {
  const decoded = require('jsonwebtoken').decode(token) || {};
  return {
    type,
    generated: Boolean(token),
    length: token ? token.length : 0,
    jti: decoded.jti,
    exp: decoded.exp,
    iat: decoded.iat
  };
}

async function checkLockout(phone, log) {
  const sql = `SELECT count(*) as failed_count
     FROM login_attempts
     WHERE username = $1 AND success = false AND attempt_time > NOW() - INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'`;
  const result = await pool.query(sql, [phone]);
  const failedCount = parseInt(result.rows[0].failed_count);
  log.debug(`${MOBILE_LOG_PREFIX} 锁定检查完成`, {
    phone: maskPhone(phone),
    failedCount,
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS
  });
  if (failedCount >= MAX_LOGIN_ATTEMPTS) {
    return { locked: true, remainingMinutes: LOCKOUT_DURATION_MINUTES };
  }
  return { locked: false };
}

async function recordLoginAttempt(phone, ipAddress, successFlag, log) {
  await pool.query(
    'INSERT INTO login_attempts (username, ip_address, success) VALUES ($1, $2, $3)',
    [phone, ipAddress, successFlag]
  );
  log.debug(`${MOBILE_LOG_PREFIX} 登录尝试已记录`, {
    phone: maskPhone(phone),
    ipAddress,
    success: successFlag
  });
}

// ─── POST /api/mobile/auth/login ───
router.post('/login', validateBody(mobileLoginSchema), async (req, res) => {
  const log = getMobileLogger(req);
  const startedAt = Date.now();
  const { phone, password } = req.body;

  try {
    log.info(`${MOBILE_LOG_PREFIX} 登录流程开始`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      phone: maskPhone(phone),
      passwordProvided: Boolean(password)
    });

    // 生产环境：按手机号键检查失败锁定（与 PC 语义一致；开发环境跳过）
    if (IS_PRODUCTION) {
      const lockout = await checkLockout(phone, log);
      if (lockout.locked) {
        log.warn(`${MOBILE_LOG_PREFIX} 账户被锁定`, { phone: maskPhone(phone) });
        return res.status(423).json(error(423,
          `登录失败次数过多，账户已锁定，请 ${LOCKOUT_DURATION_MINUTES} 分钟后重试`
        ));
      }
    }

    // 手机号精确匹配（唯一索引不依赖：以查询结果条数硬性判定）
    const findUserSql = `SELECT id, username, password_hash, real_name, role, department, phone, email, avatar, is_active
       FROM users WHERE phone = $1`;
    const userResult = await pool.query(findUserSql, [phone]);
    log.debug(`${MOBILE_LOG_PREFIX} 用户查询完成`, {
      phone: maskPhone(phone),
      rowCount: userResult.rows.length
    });

    // 0 条：统一失败响应，不泄露账号是否存在
    if (userResult.rows.length === 0) {
      await recordLoginAttempt(phone, req.ip, false, log);
      log.warn(`${MOBILE_LOG_PREFIX} 手机号未匹配到用户`, {
        phone: maskPhone(phone),
        durationMs: Date.now() - startedAt
      });
      return res.status(401).json(error(401, '手机号或密码错误'));
    }

    // >1 条：fail-closed，绝不自动选择
    if (userResult.rows.length > 1) {
      await recordLoginAttempt(phone, req.ip, false, log);
      log.warn(`${MOBILE_LOG_PREFIX} 手机号匹配到多个账号，fail-closed`, {
        phone: maskPhone(phone),
        rowCount: userResult.rows.length
      });
      return res.status(409).json(error(409, '该手机号匹配到多个账号，无法登录，请联系管理员处理'));
    }

    const user = userResult.rows[0];

    // 用户停用
    if (!user.is_active) {
      log.warn(`${MOBILE_LOG_PREFIX} 账户已禁用`, { userId: user.id, phone: maskPhone(phone) });
      return res.status(403).json(error(403, '账户已被禁用，请联系管理员'));
    }

    // 复用现有密码验证（bcrypt.compare vs users.password_hash）
    const validPassword = await bcrypt.compare(password, user.password_hash);
    log.debug(`${MOBILE_LOG_PREFIX} 密码校验完成`, {
      userId: user.id,
      validPassword
    });
    if (!validPassword) {
      await recordLoginAttempt(phone, req.ip, false, log);
      log.warn(`${MOBILE_LOG_PREFIX} 密码错误`, {
        phone: maskPhone(phone),
        durationMs: Date.now() - startedAt
      });
      return res.status(401).json(error(401, '手机号或密码错误'));
    }

    // 业务身份链（权威链路，严禁姓名兜底）：
    //   users.id → users.employee_id → employee.id → employee_code
    //   用户不存在/停用、employee 不存在/已删除 → fail-closed
    const identity = await resolveAuthenticatedEmployee(user.id, { logger: log });
    if (!identity.ok) {
      log.warn(`${MOBILE_LOG_PREFIX} 员工身份解析失败`, {
        userId: user.id,
        code: identity.code
      });
      return res.status(identity.httpStatus || 403).json(error(identity.httpStatus || 403, identity.message));
    }

    // employee_code 缺失：fail-closed，禁止无稳定业务身份者进入移动端巡查
    if (!identity.employeeCode) {
      log.warn(`${MOBILE_LOG_PREFIX} 员工编码缺失，fail-closed`, {
        userId: user.id,
        employeeId: identity.employeeId
      });
      return res.status(403).json(error(403, '当前登录账号未关联有效的员工编码，请联系管理员处理'));
    }

    // 登录成功：记账、清理、更新最后登录时间
    await recordLoginAttempt(phone, req.ip, true, log);
    await pool.query("DELETE FROM login_attempts WHERE attempt_time < NOW() - INTERVAL '1 day'");
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 复用现有 JWT 签发（payload 与 PC 登录完全一致）
    const tokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.real_name
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    log.info(`${MOBILE_LOG_PREFIX} Token 生成完成`, {
      accessToken: getTokenDebugInfo(accessToken, 'access'),
      refreshToken: getTokenDebugInfo(refreshToken, 'refresh')
    });

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

    // 审计日志：移动端登录（不记录密码）
    await auditLog({
      userId: user.id,
      username: user.username,
      action: 'mobile_login',
      module: 'auth',
      description: '移动端手机号登录',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      statusCode: 200,
    }).catch(() => {});

    log.info(`${MOBILE_LOG_PREFIX} 登录流程成功`, {
      userId: user.id,
      employeeCode: identity.employeeCode,
      durationMs: Date.now() - startedAt
    });

    // refreshToken cookie（与 PC 登录一致，供 /auth/refresh 的 withCredentials 使用）
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // 返回结构与 /api/auth/login 一致 + 最小增量 employeeCode
    res.json(success({
      token: accessToken,
      accessToken: accessToken,
      refreshToken,
      user: userInfo,
      employeeCode: identity.employeeCode
    }, '登录成功'));

  } catch (err) {
    log.error(`${MOBILE_LOG_PREFIX} 登录异常`, {
      error: err.message,
      stack: err.stack,
      durationMs: Date.now() - startedAt
    });
    res.status(500).json(error(500, '登录失败，服务器内部错误'));
  }
});

module.exports = router;
