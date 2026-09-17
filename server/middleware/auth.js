/**
 * JWT 认证中间件
 * 验证请求头 Authorization: Bearer <token>
 * 支持 Token 黑名单检查
 */
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// JWT 密钥 — 必须通过环境变量配置，启动时由 validateEnv 校验
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error('[FATAL] JWT_SECRET 和 JWT_REFRESH_SECRET 环境变量未设置');
  console.error('[FATAL] 请在 .env 中配置，生成方式: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

/**
 * 生成 Access Token
 * @param {Object} payload 用户数据
 * @returns {string} JWT Token
 */
function generateAccessToken(payload) {
  // 有效期可通过环境变量 JWT_ACCESS_EXPIRES_IN 配置（默认 12h），
  // 大幅降低过期频率，减少自动刷新触发次数。
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '12h';
  return jwt.sign(
    { ...payload, type: 'access' },
    JWT_SECRET,
    { expiresIn, jwtid: require('crypto').randomUUID() }
  );
}

/**
 * 生成 Refresh Token
 * @param {Object} payload 用户数据
 * @returns {string} JWT Refresh Token
 */
function generateRefreshToken(payload) {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d', jwtid: require('crypto').randomUUID() }
  );
}

/**
 * 验证 Token 是否在黑名单中（fail-closed：查询异常时抛出，由调用方决定拒绝/匿名，
 * 绝不返回 false 伪装“未拉黑”）
 * @param {string} jti Token ID
 * @returns {Promise<boolean>}
 */
async function isTokenBlacklisted(jti) {
  const result = await pool.query(
    'SELECT 1 FROM token_blacklist WHERE token_jti = $1 LIMIT 1',
    [jti]
  );
  return result.rows.length > 0;
}

/**
 * 将 Token 加入黑名单（持久化失败时抛出，由调用方决定是否对外宣称登出成功）
 * @param {string} jti Token ID
 * @param {number} userId 用户ID
 * @param {Date} expiresAt 过期时间
 */
async function blacklistToken(jti, userId, expiresAt) {
  await pool.query(
    'INSERT INTO token_blacklist (token_jti, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token_jti) DO NOTHING',
    [jti, userId, expiresAt]
  );
}

/**
 * 清理过期黑名单记录
 */
async function cleanupBlacklist() {
  try {
    await pool.query('DELETE FROM token_blacklist WHERE expires_at < NOW()');
  } catch (err) {
    console.error('[Auth] 清理黑名单失败:', err.message);
  }
}

/**
 * 认证中间件
 * 验证请求头中的 JWT Token
 * 排除公开接口（login, health 等）
 */
/**
 * 公开接口显式清单（method + path 精确匹配；不使用 /auth/、/import/ 宽泛前缀）
 * 公开理由：
 *   POST /auth/login   —— 登录入口（匿名必需）
 *   POST /auth/refresh —— 刷新访问令牌（匿名必需，携带 refreshToken）
 *   POST /auth/logout  —— 注销（幂等、无敏感数据；无 token 时返回成功）
 *   GET  /health       —— 脱敏存活检查（启动脚本/负载均衡依赖；匿名响应最小化，见 app.js）
 * 其余接口（含 /auth/register、/auth/debug-login、/import/*、/user/info、权限码、诊断端点）
 * 一律要求认证；导入写操作额外要求管理员/安全管理角色（见 routes/import.js）。
 */
const PUBLIC_ROUTES = [
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/refresh' },
  { method: 'POST', path: '/auth/logout' },
  { method: 'GET', path: '/health' },
  // H5-GRID-LOGIN-02: 移动端手机号+密码登录（独立入口，匿名必需；不改变 PC /auth/login 语义）
  { method: 'POST', path: '/mobile/auth/login' },
];

function isPublicRoute(method, path) {
  return PUBLIC_ROUTES.some((r) => r.method === method && r.path === path);
}

/**
 * 统一 Token 认证解析（普通认证与可选认证共用同一套校验规则）。
 *
 * 一个 Token 只有在同时满足以下条件时才形成认证身份：
 *   1. 签名、有效期、Token 类型（access）正确；
 *   2. 存在有效的 jti；
 *   3. 不在黑名单中（黑名单查询异常 → fail-closed，返回 error，绝不放行）；
 *   4. （checkUser=true 时）当前用户仍存在且处于启用状态。
 * req.user 只包含明确允许的规范字段，不直接挂载原始 decoded payload。
 *
 * @param {string|undefined} authHeader Authorization 请求头
 * @param {{ checkUser?: boolean }} [options]
 * @returns {Promise<{
 *   status: 'ok' | 'no-token' | 'invalid' | 'blacklisted' | 'disabled' | 'deleted' | 'error',
 *   user?: { id, username, role, realName, jti },
 * }>}
 */
async function resolveAuthentication(authHeader, { checkUser = false } = {}) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 'no-token' };
  }
  const token = authHeader.substring(7);

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // 无效/过期/伪造 token：按无认证身份处理（由调用方决定 401 或匿名）
    return { status: 'invalid' };
  }
  if (decoded.type !== 'access' || !decoded.jti) {
    return { status: 'invalid' };
  }

  // 黑名单检查（fail-closed：查询异常时拒绝，不返回 false 伪装未拉黑）
  let blacklisted;
  try {
    blacklisted = await isTokenBlacklisted(decoded.jti);
  } catch (err) {
    console.error('[Auth] 黑名单查询失败:', err.message);
    return { status: 'error' };
  }
  if (blacklisted) {
    return { status: 'blacklisted' };
  }

  // 规范字段（不含原始 payload 的任意声明）
  let user = {
    id: decoded.id,
    username: decoded.username,
    role: decoded.role,
    realName: decoded.realName,
    jti: decoded.jti,
  };

  // 需要认证详情的路径：校验当前用户状态（存在 + 启用），并采用库中最新角色
  if (checkUser) {
    try {
      const result = await pool.query(
        'SELECT id, username, role, real_name, is_active FROM users WHERE id = $1',
        [decoded.id]
      );
      if (result.rows.length === 0) {
        return { status: 'deleted' };
      }
      const row = result.rows[0];
      if (!row.is_active) {
        return { status: 'disabled' };
      }
      user = {
        id: row.id,
        username: row.username,
        role: row.role,
        realName: row.real_name,
        jti: decoded.jti,
      };
    } catch (err) {
      console.error('[Auth] 当前用户查询失败:', err.message);
      return { status: 'error' };
    }
  }

  return { status: 'ok', user };
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // 公开路径：可选认证（有有效 Token 才注入 req.user，供 /api/health 区分匿名/认证）
  if (isPublicRoute(req.method, req.path)) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const result = await resolveAuthentication(authHeader, { checkUser: true });
      if (result.status === 'ok') {
        req.user = result.user;
      }
      // 无效/过期/拉黑/禁用/删除/存储异常：一律按匿名处理（不破坏公开可用性）
    }
    return next();
  }

  // 受保护路径：强制认证，黑名单/用户查询异常 fail-closed（503，不泄露数据库细节）
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      code: 401,
      message: '未提供认证令牌'
    });
  }

  const result = await resolveAuthentication(authHeader, { checkUser: true });
  switch (result.status) {
    case 'ok':
      req.user = result.user;
      return next();
    case 'blacklisted':
      return res.status(401).json({
        success: false,
        code: 401,
        message: '令牌已失效'
      });
    case 'disabled':
      return res.status(403).json({
        success: false,
        code: 403,
        message: '账户已被禁用'
      });
    case 'deleted':
      return res.status(401).json({
        success: false,
        code: 401,
        message: '用户不存在或未登录'
      });
    case 'error':
      return res.status(503).json({
        success: false,
        code: 503,
        message: '认证服务暂不可用'
      });
    case 'invalid':
    default:
      return res.status(401).json({
        success: false,
        code: 401,
        message: '无效的令牌'
      });
  }
}

/**
 * 可选认证中间件
 * 有 Token 则解析（复用统一校验；黑名单异常按未认证处理，不破坏公开可用性），
 * 无 Token 也放行。用于不敏感的可选认证端点（如模块健康检查）。
 */
async function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const result = await resolveAuthentication(authHeader, { checkUser: false });
    if (result.status === 'ok') {
      req.user = result.user;
    }
  }
  next();
}

/**
 * 角色权限检查中间件
 *
 * 同时兼容两种调用形式（扁平化一层 + 去重 + 非空字符串校验）：
 *   requireRole('admin', 'safety_manager')        // 可变参数式
 *   requireRole(['admin', 'safety_manager'])      // 数组式
 *
 * fail-closed：角色集合为空（无参数 / 全为非法值）时拒绝所有请求，
 * 绝不意外放行。返回语义保持：未认证 401、角色不允许 403、允许则 next()。
 *
 * @param {...(string|string[])} allowedRoles 允许的角色（可变参数或数组）
 */
function requireRole(...allowedRoles) {
  // 严格 fail-closed：一层扁平化后，只要出现任何非字符串、空字符串或二层嵌套
  // 等非法值，该中间件实例整体拒绝；绝不"过滤非法值后继续放行合法角色"。
  const flat = allowedRoles.flat(1);
  const allValid = flat.length > 0 && flat.every((r) => typeof r === 'string' && r.trim() !== '');
  if (!allValid) {
    return (req, res, next) => {
      return res.status(403).json({
        success: false,
        code: 403,
        message: '权限不足，无法执行此操作'
      });
    };
  }
  const roles = [...new Set(flat)];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: '请先登录'
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: 403,
        message: '权限不足，无法执行此操作'
      });
    }
    next();
  };
}

/**
 * HSE 角色权限映射表
 * 与前端 permission.ts 保持一致，后端仅包含关键的接口权限码
 */
// HSE 全模块权限集（HSE管理员 / 管理员 / 安全主管 共用，P1-1 补全 admin/safety_manager）
const HSE_MANAGER_PERMISSIONS = [
  // 安全总览
  'hse:overview:view', 'hse:overview:cockpit:view', 'hse:overview:executive:view',
  'hse:overview:alerts:view', 'hse:overview:notifications:view', 'hse:overview:reports:view',
  'hse:overview:create', 'hse:overview:update', 'hse:overview:delete', 'hse:overview:export',
  // 风险管控
  'hse:risk:view', 'hse:risk:classification:view', 'hse:risk:employee:view',
  'hse:risk:driver:view', 'hse:risk:accidents:view', 'hse:risk:analysis:view', 'hse:risk:ai:view',
  'hse:risk:create', 'hse:risk:update', 'hse:risk:delete', 'hse:risk:export', 'hse:risk:import',
  // 隐患治理
  'hse:hazard:view', 'hse:hazard:hazards:view', 'hse:hazard:rectification:view',
  'hse:hazard:warning:view', 'hse:hazard:statistics:view',
  'hse:hazard:create', 'hse:hazard:update', 'hse:hazard:delete', 'hse:hazard:export', 'hse:hazard:import',
  // 现场管理
  'hse:site:view', 'hse:site:violations:view', 'hse:site:grid:view',
  'hse:site:fire:view', 'hse:site:vehicles:view', 'hse:site:inspection:view',
  'hse:site:create', 'hse:site:update', 'hse:site:delete', 'hse:site:export', 'hse:site:import', 'hse:site:freeze',
  // 网格巡查专用子业务权限码（阶段3-B-1 新增）：与模块级 hse:site:* 区分，
  // 避免"能删三违"等价于"能删网格"。purge 为清空全部台账，属高危，仅本组与 system_admin 持有。
  'hse:site:grid:create', 'hse:site:grid:update', 'hse:site:grid:delete', 'hse:site:grid:purge',
  // 人员管理
  'hse:personnel:view', 'hse:personnel:employees:view', 'hse:personnel:organization:view',
  'hse:personnel:positions:view', 'hse:personnel:insurance:view', 'hse:personnel:overage:view', 'hse:personnel:import:view',
  'hse:personnel:create', 'hse:personnel:update', 'hse:personnel:delete', 'hse:personnel:export', 'hse:personnel:import',
  // 培训考核
  'hse:training:view', 'hse:training:plan:view', 'hse:training:requirements:view',
  'hse:training:ledger:view', 'hse:training:special:view', 'hse:training:statistics:view',
  'hse:training:assessment:view', 'hse:training:responsibility:view',
  'hse:training:create', 'hse:training:update', 'hse:training:delete', 'hse:training:export', 'hse:training:import',
  // 培训考核 - 扣分审核/调整/冻结（月度安全履职考核，P1-2 补全 audit 权限码，消除冻结/审核 403）
  'hse:training:audit',
  // 应急管理
  'hse:emergency:view', 'hse:emergency:manage:view',
  'hse:emergency:create', 'hse:emergency:update', 'hse:emergency:delete', 'hse:emergency:export',
  // 目标职责
  'hse:objectives:view', 'hse:objectives:responsibility:view', 'hse:objectives:committee:view', 'hse:objectives:budget:view',
  'hse:objectives:create', 'hse:objectives:update', 'hse:objectives:delete', 'hse:objectives:export',
  // 制度标准
  'hse:standards:view', 'hse:standards:regulations:view', 'hse:standards:documents:view',
  'hse:standards:clauses:view', 'hse:standards:relation:view', 'hse:standards:evaluation:view',
  'hse:standards:create', 'hse:standards:update', 'hse:standards:delete', 'hse:standards:export', 'hse:standards:import',
  // 系统管理
  'hse:system:view', 'hse:system:users:view', 'hse:system:roles:view',
  'hse:system:audit:view', 'hse:system:workflow:view', 'hse:system:batchimport:view',
  'hse:system:create', 'hse:system:update', 'hse:system:delete',
];

const ROLE_PERMISSIONS_MAP = {
  // 系统管理员 — 拥有全部权限
  system_admin: ['*'],

  // 管理员 — 与 HSE管理员 同等权限（P1-1 补全：消除 requirePermission 降级 viewer 导致的 403）
  admin: HSE_MANAGER_PERMISSIONS,

  // 安全主管 — 与 HSE管理员 同等权限（P1-1 补全）
  safety_manager: HSE_MANAGER_PERMISSIONS,

  // HSE管理员 — 所有HSE模块 view + create/update/delete/export/import/freeze
  hse_manager: HSE_MANAGER_PERMISSIONS,

  // 乡镇/单位负责人 — 安全总览 + 风险管控(部分) + 隐患治理 + 现场管理 + 培训考核(部分) + 目标职责(部分)
  township_manager: [
    // 安全总览
    'hse:overview:view', 'hse:overview:cockpit:view', 'hse:overview:alerts:view', 'hse:overview:notifications:view',
    // 风险管控（部分）
    'hse:risk:view', 'hse:risk:classification:view', 'hse:risk:employee:view', 'hse:risk:accidents:view',
    'hse:risk:create', 'hse:risk:update',
    // 隐患治理
    'hse:hazard:view', 'hse:hazard:hazards:view', 'hse:hazard:rectification:view', 'hse:hazard:warning:view', 'hse:hazard:statistics:view',
    'hse:hazard:create', 'hse:hazard:update', 'hse:hazard:delete', 'hse:hazard:export',
    // 现场管理
    'hse:site:view', 'hse:site:violations:view', 'hse:site:grid:view', 'hse:site:fire:view', 'hse:site:inspection:view',
    'hse:site:create', 'hse:site:update', 'hse:site:delete',
    // 网格巡查专用（阶段3-B-1）：乡镇负责人可新建/修改/删除本域巡查记录；
    // 依阶段3-A 冻结方案授予 delete（其已持有模块级 hse:site:delete），但**不授予 purge**（清空全部属高危）。
    'hse:site:grid:create', 'hse:site:grid:update', 'hse:site:grid:delete',
    // 培训考核（部分）
    'hse:training:view', 'hse:training:plan:view', 'hse:training:ledger:view', 'hse:training:statistics:view',
    'hse:training:create', 'hse:training:update',
    // 目标职责（部分）
    'hse:objectives:view', 'hse:objectives:responsibility:view', 'hse:objectives:committee:view',
    'hse:objectives:create', 'hse:objectives:update',
  ],

  // 管理人员 — 安全总览 + 风险管控 + 隐患治理 + 现场管理 + 人员管理(view) + 培训考核(view) + 应急管理(view)
  manager: [
    // 安全总览
    'hse:overview:view', 'hse:overview:cockpit:view', 'hse:overview:alerts:view', 'hse:overview:notifications:view',
    // 风险管控
    'hse:risk:view', 'hse:risk:classification:view', 'hse:risk:employee:view', 'hse:risk:accidents:view',
    'hse:risk:create', 'hse:risk:update', 'hse:risk:delete', 'hse:risk:export',
    // 隐患治理
    'hse:hazard:view', 'hse:hazard:hazards:view', 'hse:hazard:rectification:view', 'hse:hazard:warning:view',
    'hse:hazard:create', 'hse:hazard:update', 'hse:hazard:delete', 'hse:hazard:export',
    // 现场管理
    'hse:site:view', 'hse:site:violations:view', 'hse:site:grid:view',
    'hse:site:create', 'hse:site:update', 'hse:site:delete',
    // 网格巡查专用（阶段3-B-1）：管理人员仅授予新建/修改。
    // 依阶段3-A 冻结方案，**不授予 grid:delete 与 purge**（删除与清空留给乡镇负责人及以上）。
    'hse:site:grid:create', 'hse:site:grid:update',
    // 人员管理 (view only)
    'hse:personnel:view', 'hse:personnel:employees:view', 'hse:personnel:organization:view',
    // 培训考核 (view only)
    'hse:training:view', 'hse:training:plan:view', 'hse:training:ledger:view',
    // 应急管理 (view only)
    'hse:emergency:view', 'hse:emergency:manage:view',
  ],

  // 查看者 — 安全总览(驾驶舱+通知) + 隐患排查(view)
  viewer: [
    'hse:overview:view', 'hse:overview:cockpit:view', 'hse:overview:notifications:view',
    'hse:hazard:view', 'hse:hazard:hazards:view',
  ],

  // 网格巡查负责人 — 阶段3-B-2 专用最小权限角色（阶段4 创建的 62 个网格负责人账号迁移至此）
  // 仅授予完成「本人负责网格巡查」所必需的最小权限：查看 / 新建 / 修改。
  // 严格按最小权限原则：**不授予 grid:delete（删除）与 grid:purge（清空全部）**。
  // 行级范围由后端 gridScope 控制（own_grid），前端无法扩大授权范围。
  grid_inspector: [
    'hse:site:grid:view',
    'hse:site:grid:create',
    'hse:site:grid:update',
  ],
};


/**
 * 获取指定角色的权限列表
 * @param {string} role 用户角色
 * @returns {string[]} 权限码列表
 */
function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS_MAP[role] || ROLE_PERMISSIONS_MAP.viewer || [];
}

/**
 * 权限码校验中间件
 * 检查用户是否拥有指定权限码
 * @param {string} permissionCode 所需权限码
 * @returns {Function} Express 中间件
 */
function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: '请先登录'
      });
    }

    const permissions = getPermissionsForRole(req.user.role);

    // 通配符 '*' 直接放行
    if (permissions.includes('*')) {
      return next();
    }

    // 检查所需权限是否在权限列表中
    if (!permissions.includes(permissionCode)) {
      return res.status(403).json({
        success: false,
        code: 403,
        message: '权限不足，缺少权限: ' + permissionCode
      });
    }

    next();
  };
}

/**
 * 基于角色-权限映射快速创建中间件的工厂函数
 * 可用于一次性注册多个权限校验或自定义权限映射
 * @param {Object} customPermissionMap 自定义角色-权限映射（可选，默认使用 ROLE_PERMISSIONS_MAP）
 * @returns {{ getPermissionsForRole: Function, requirePermission: Function }}
 */
function createPermissionMiddleware(customPermissionMap) {
  const permissionMap = customPermissionMap || ROLE_PERMISSIONS_MAP;

  function getPermissions(role) {
    return permissionMap[role] || [];
  }

  function checkPermission(permissionCode) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          code: 401,
          message: '请先登录'
        });
      }

      const permissions = getPermissions(req.user.role);

      if (permissions.includes('*')) {
        return next();
      }

      if (!permissions.includes(permissionCode)) {
        return res.status(403).json({
          success: false,
          code: 403,
          message: '权限不足，缺少权限: ' + permissionCode
        });
      }

      next();
    };
  }

  return {
    getPermissionsForRole: getPermissions,
    requirePermission: checkPermission,
  };
}

module.exports = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  generateAccessToken,
  generateRefreshToken,
  isTokenBlacklisted,
  blacklistToken,
  cleanupBlacklist,
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  ROLE_PERMISSIONS_MAP,
  getPermissionsForRole,
  requirePermission,
  createPermissionMiddleware,
};
