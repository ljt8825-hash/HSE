/**
 * HSE 安全管理系统 — Node.js 后端主入口（生产环境）
 *
 * 【2026-07-08 架构统一决策】
 * 经第3步后端架构评审，确定以下技术选型：
 *   - 本文件 (server/app.js) 为唯一生产 API 服务器入口
 *   - server/src/app.ts (TypeScript 版) 已归档至 legacy/nodejs-ts-version/
 *     原因：缺少 auth 路由、CORS 策略宽松、路由路径与前端不一致
 *   - 旧 Python 后端目录已删除，不再作为部署或数据处理入口
 *
 * 如需启动：node server/app.js (或 npm start)
 * 如需开发：npm run dev (当前与 start 相同，可配置 nodemon 热重载)
 */

// ⚠️ dotenv 必须在任何读取环境变量的模块加载之前执行。
// middleware/auth.js、services/aiService.js、services/wsServer.js、utils/logger.js、
// config/db.js 均在模块级（require 时）读取 JWT / AI / DB / NODE_ENV 等变量，
// 若 dotenv 加载过晚，这些模块会拿到 undefined 导致鉴权与配置失效。
//
// 显式从 server/.env 加载（路径基于 __dirname）：无论从项目根目录还是 server
// 目录启动，都定位到同一份环境变量文件，不依赖启动时的当前工作目录。
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { createRequestLogger, logger } = require('./middleware/requestLogger');
const { pool, testConnection, isConnected } = require('./config/db');
const { errorHandler, notFound } = require('./middleware/error');
const { success, error } = require('./middleware/response');
const { ensureDir } = require('./middleware/upload');
const { authMiddleware, requireRole } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const vehiclesRoutes = require('./routes/vehicles');
const filesRoutes = require('./routes/files');
const fileRecordsRoutes = require('./routes/file-records');
const materialPriceRoutes = require('./routes/hse-material-price');
const riskControlRoutes = require('./routes/risk-control');
const importRoutes = require('./routes/import');
const overviewRoutes = require('./routes/overview');
const regulationsRoutes = require('./routes/regulations');
const trainingRoutes = require('./routes/training');
const trainingOcrRoutes = require('./routes/training-ocr');
const violationRoutes = require('./routes/violations');
const accidentsRoutes = require('./routes/accidents');
const hazardsRoutes = require('./routes/hazards');
const emergencyRoutes = require('./routes/emergency');
const insuranceRoutes = require('./routes/insurance');
const standardsRoutes = require('./routes/standards');
const siteMgmtRoutes = require('./routes/site-mgmt');
const objectivesRoutes = require('./routes/objectives');
const dashboardRoutes = require('./routes/dashboard');
const alertsRoutes = require('./routes/alerts');
const auditRoutes = require('./routes/audit');
const usersRoutes = require('./routes/users');
const personnelRoutes = require('./routes/personnel');
const overAgePersonnelRoutes = require('./routes/over-age-personnel');
const rolesRoutes = require('./routes/roles');
const menusRoutes = require('./routes/menus');
const workflowRoutes = require('./routes/workflow');
const notificationsRoutes = require('./routes/notifications');
const visualLayoutRoutes = require('./routes/visual-layout');
const menuOrderRoutes = require('./routes/menu-order');
// HSE 核心事件中心（v4.2 新增）
const hseEventsRoutes = require('./routes/hse-events');
// HSE 闭环引擎（v4.2 新增）
const hseChainRoutes = require('./routes/hse-chain');
// HSE 任务中心（v4.3 新增）
const hseTasksRoutes = require('./routes/hse-tasks');
// HSE 数据分析中心（v5.0 新增）
const hseStatisticsRoutes = require('./routes/hse-statistics');
// HSE 领导驾驶舱（v5.1 新增）
const hseDashboardRoutes = require('./routes/hse-dashboard');
// HSE 智能报告中心（v5.2 新增）
const hseReportRoutes = require('./routes/hse-report');
const { initWebSocketServer } = require('./services/wsServer');
const aiService = require('./services/aiService');
const metrics = require('./metrics');

// 员工模型健康巡检调度器（TRAE Step 9 部署，当前 DISABLED，等 Sprint B 迁移后启用）
const { initHealthCheckScheduler } = require('./services/employeeHealthCheckScheduler');
const { initAssessmentScheduler } = require('./services/assessmentScheduler'); // 新增：月度自动考核调度
const { initWpsGridSyncScheduler } = require('./services/wpsGridSyncScheduler'); // WPS 多维表格 ↔ 网格长巡查台账同步调度
const { initMonthlyLedgerImportScheduler } = require('./services/monthlyLedgerImportScheduler'); // 每月1号自动导入上月台账（安全文化/三违）

// 演示数据管理
const demoDataRoutes = require('./routes/demo-data');

// BI / AI / IoT 路由（v4.0 新增）
const biRoutes = require('./routes/bi');
const aiRoutes = require('./routes/ai');
const aiEnhancedRoutes = require('./routes/ai-enhanced');
const iotRoutes = require('./routes/iot');
const vbenCompatRoutes = require('./routes/vben-compat');
// V2 Sprint 1: 安全资料中心
const hseDocumentsRoutes = require('./routes/hse-documents');
// V2 Sprint 4: 安全生产标准化评价中心
const hseStandardRoutes = require('./routes/hse-standard');
// V2 Sprint 4 Phase4: 标准条款-资料关联管理
const hseStandardRelationRoutes = require('./routes/hse-standard-relation');
// V2 Sprint 4 Phase5: 标准化评价 AI 辅助
const hseStandardEvaluationRoutes = require('./routes/hse-standard-evaluation');
// V2 Sprint 5: 批量导入中心
const hseBatchImportRoutes = require('./routes/hse-batch-import');
// Sprint 5.1: 人员主数据中心
const hseEmployeeRoutes = require('./routes/hse-employee');
// Sprint 5.6: 员工花名册导入 V2
const hseEmployeeImportV2Routes = require('./routes/hse-employee-import-v2');
// Sprint 5.5: 隐患整改闭环中心
const hseHazardRectificationRoutes = require('./routes/hse-hazard-rectification');

// Sprint 10-D-2-1: HSE月度安全履职考核模块
const hseAssessmentMonthlyRoutes = require('./routes/hse-assessment-monthly');
const transferStationsRoutes = require('./routes/transfer-stations');
const vehicleChecksRoutes = require('./routes/vehicle-checks');

// 查询日志初始化
const queryLogger = require('./middleware/queryLogger');

// 启动前校验必需环境变量（dotenv 已在文件顶部加载）
const { validateEnv } = require('./utils/validateEnv');
validateEnv();

// CORS 配置
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5666', 'http://127.0.0.1:5666'];
const CORS_ALLOW_ALL = process.env.CORS_ALLOW_ALL === 'true';

const app = express();
// 安全配置: Trust Proxy（Nginx 反向代理场景下正确获取客户端 IP）
app.set('trust proxy', process.env.TRUST_PROXY || 1);
const PORT = process.env.PORT || 5666;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${process.env.FRONTEND_PORT || 5173}`;
const uploadDir = process.env.UPLOAD_DIR || './uploads';

// ========= 日志目录 =========
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

ensureDir(uploadDir);

// ========= 日志中间件 =========
// 1. 结构化请求日志（基于 winston，替代 morgan）
app.use(createRequestLogger());

// ========= Prometheus 指标中间件（放在最前面，捕获所有请求） =========
app.use(metrics.middleware());

// ========= 安全 & 性能中间件 =========
// 2. 安全头（防止 XSS、点击劫持等）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Ant Design Vue 需要内联样式
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  poweredBy: false,
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
}));

// 2. 响应压缩（性能优化）
app.use(compression());

// 3. CORS（允许前端访问，通过环境变量 CORS_ORIGINS 配置白名单）
app.use(cors({
  origin: function(origin, callback) {
    // 允许无 origin 的请求（比如 curl、Postman、file:// 协议）
    if (!origin) return callback(null, true);
    if (CORS_ALLOW_ALL) {
      logger.warn('CORS 允许所有跨域源 (生产环境请配置 CORS_ORIGINS)');
      return callback(null, true);
    }
    if (CORS_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS 拒绝跨域请求: ${origin}`);
      callback(new Error('CORS 策略不允许此来源'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 4. 请求频率限制（安全防护）
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15分钟
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500, // 每个窗口最多500次请求
  message: { success: false, code: -429, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// 4.1 BI 大屏接口限流（较宽松，因大屏有大量轮询请求）
const biLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_BI_MAX) || 1000,
  message: { success: false, code: -429, message: 'BI 接口请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/hse/bi', biLimiter);

// 4.2 IoT 设备接口限流（最宽松，因有大量实时数据推送）
const iotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_IOT_MAX) || 2000,
  message: { success: false, code: -429, message: 'IoT 接口请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/hse/iot', iotLimiter);

// 5. 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. JWT 认证中间件（排除公开接口）
app.use('/api', authMiddleware);

// 7. 静态文件服务
// 7.0 保单 PDF 旧静态直链明确终止（任务0.2）：必须注册在通用 /uploads 之前。
//     认证 + 保险角色 + 防目录穿越后一律返回 410，不再服务静态文件，
//     也不会 fall through 到通用 /uploads 静态目录。前端已迁移为记录 ID Blob 接口。
app.use(
  '/uploads/insurance',
  authMiddleware,
  requireRole('admin', 'safety_manager'),
  (req, res, next) => {
    // 防目录穿越：解码后禁止出现路径分隔符序列
    if (decodeURIComponent(req.path).includes('..')) {
      return res.status(400).json({ success: false, code: 400, message: '非法路径' });
    }
    next();
  },
  (req, res) => {
    res.status(410).json({
      success: false,
      code: 410,
      message: '静态直链已终止，请通过受保护接口获取保单文件',
    });
  },
);
app.use('/uploads', express.static(path.join(__dirname, uploadDir)));
// 公共模板目录（空模板，不含业务数据；与上传文件权限策略分离，保持公开）
app.use('/templates', express.static(path.join(__dirname, '..', '安全看板vben', 'apps', 'web-antd', 'public', 'templates')));

app.get('/', (req, res) => {
  res.redirect(FRONTEND_URL);
});

// ========= Prometheus 指标暴露端点（默认受保护：JWT 认证 + 系统管理员/管理员角色） =========
app.get('/metrics', authMiddleware, requireRole('system_admin', 'admin'), (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.getMetricsString());
});

// ========= 健康检查接口（v4.1 增强版；匿名响应最小化） =========
// 匿名（无有效 token）只返回存活必需的最小字段；携带有效 access token 时
// 额外返回 database/memory/ai 详情。不向匿名暴露数据库版本/主机/库名/错误详情。
app.get('/api/health', async (req, res) => {
  const startTime = Date.now();
  const isAuthed = Boolean(req.user);
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    responseTimeMs: 0,
  };

  if (isAuthed) {
    health.database = { status: 'unknown' };
    health.memory = { rss: 0, heapUsed: 0, heapTotal: 0 };
    health.ai = { provider: 'not configured', available: false };

    // 数据库连接检查（仅认证响应包含；异常时不向客户端暴露原始错误）
    try {
      const dbResult = await pool.query('SELECT NOW() as now');
      health.database.status = 'connected';
      health.database.responseTimeMs = Date.now() - startTime;
    } catch (err) {
      health.database.status = 'disconnected';
      health.status = 'degraded';
    }

    // 内存使用
    const mem = process.memoryUsage();
    health.memory = {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
    };

    // AI 服务状态
    try {
      if (aiService && aiService.isAvailable) {
        health.ai.provider = aiService.getProvider();
        health.ai.available = aiService.isAvailable();
      }
    } catch (e) { /* AI 服务未配置 */ }
  }

  health.responseTimeMs = Date.now() - startTime;

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json({ code: 0, data: health });
});

// ========= PostgreSQL 状态检测接口（仅系统管理员/管理员） =========
app.get('/api/postgres/status', requireRole('system_admin', 'admin'), async (req, res) => {
  try {
    const startTime = Date.now();
    const result = await pool.query("SELECT version(), current_database(), pg_postmaster_start_time(), pg_database_size(current_database()) AS db_size, (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS table_count");
    const elapsed = Date.now() - startTime;
    const row = result.rows[0];
    res.json(success({
      online: true,
      version: row.version.split(',')[0],
      database: row.current_database,
      startedAt: row.pg_postmaster_start_time,
      dbSizeMB: Math.round(parseInt(row.db_size) / 1024 / 1024 * 100) / 100,
      tableCount: parseInt(row.table_count),
      responseMs: elapsed,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres'
    }, 'PostgreSQL 连接正常'));
  } catch (err) {
    res.json(success({
      online: false,
      error: err.message,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      dbConnected: isConnected()
    }, 'PostgreSQL 连接异常'));
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/hse/file-records', fileRecordsRoutes);
app.use('/api/hse/material-price', materialPriceRoutes);
app.use('/api/risk-control', riskControlRoutes);
app.use('/api/import', importRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/regulations', regulationsRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/training-ocr', trainingOcrRoutes);
app.use('/api/training-assessment', require('./routes/training-assessment'));
app.use('/api/violations', violationRoutes);
app.use('/api/accidents', accidentsRoutes);
app.use('/api/hazards', hazardsRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/standards', standardsRoutes);
app.use('/api/site-mgmt', siteMgmtRoutes);
app.use('/api/wps-grid-sync', require('./routes/wps-grid-sync'));
// Sprint-WPS-02: 当前登录员工上下文（身份解析，见 routes/current-employee.js）
app.use('/api/current-employee', require('./routes/current-employee'));
// Sprint-WPS-01: WPS 多维表基础接入层 管理 Controller（admin 只读/受控自清理，见 routes/wps-dbsheet.js）
app.use('/api/wps/dbsheet', authMiddleware, requireRole('system_admin', 'admin'), require('./routes/wps-dbsheet'));
app.use('/api/objectives', objectivesRoutes);
app.use('/api/system-mgmt', require('./routes/system-mgmt'));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/hse/alerts', alertsRoutes);
app.use('/api/hse/audit', auditRoutes);
app.use('/api/core/users', usersRoutes);
app.use('/api/personnel', personnelRoutes);
app.use('/api/over-age-personnel', overAgePersonnelRoutes);
app.use('/api/core/roles', rolesRoutes);
app.use('/api/core/menus', menusRoutes);
app.use('/api/hse/workflow', workflowRoutes);
app.use('/api/hse/notifications', notificationsRoutes);
app.use('/api/hse/todos/plans', require('./routes/todo-plans'));
app.use('/api/hse/todos', require('./routes/todos'));
app.use('/api/user/visual-layout', visualLayoutRoutes);
app.use('/api/user/menu-order', menuOrderRoutes);

// v4.2 新增路由：HSE 事件中心
app.use('/api/hse/events', hseEventsRoutes);

// v4.2 新增路由：HSE 闭环引擎
app.use('/api/hse/chain', hseChainRoutes);

// v4.3 新增路由：HSE 任务中心
app.use('/api/hse/tasks', hseTasksRoutes);

// v5.0 新增路由：HSE 数据分析中心
app.use('/api/hse/statistics', hseStatisticsRoutes);
  // v5.1 新增路由：HSE 领导驾驶舱
  app.use('/api/hse/dashboard', hseDashboardRoutes);
  
  // v5.2 新增路由：HSE 智能报告中心
  app.use('/api/hse/report', hseReportRoutes);

  // 演示数据管理
  app.use('/api/demo-data', demoDataRoutes);

// 三违管理考核 台账（三违管理 → 三违管理考核）
app.use('/api/hse/violation-assessment', require('./routes/hse-violation-assessment'));

// v4.0 新增路由：BI 大屏 / AI 辅助 / IoT 设备
app.use('/api/hse/bi', biRoutes);
app.use('/api/hse/ai', aiRoutes);
app.use('/api/hse/ai', aiEnhancedRoutes);
app.use('/api/hse/iot', iotRoutes);

// V2 Sprint 1: 安全资料中心
app.use('/api/hse/documents', hseDocumentsRoutes);

// V2 Sprint 4: 安全生产标准化评价中心
app.use('/api/hse/standard', hseStandardRoutes);

// V2 Sprint 4 Phase4: 标准条款-资料关联管理
app.use('/api/hse/standard/relation', hseStandardRelationRoutes);

// V2 Sprint 4 Phase5: 标准化评价 AI 辅助
app.use('/api/hse/standard/evaluation', hseStandardEvaluationRoutes);

// V2 Sprint 5: 批量导入中心
app.use('/api/hse/batch-import', hseBatchImportRoutes);

// Sprint 5.1: 人员主数据中心
app.use('/api/hse/employee', hseEmployeeRoutes);
// Sprint 5.6: 员工花名册导入 V2
app.use('/api/hse/employee-import/v2', hseEmployeeImportV2Routes);

// Sprint 5.5: 隐患整改闭环中心
app.use('/api/hse/hazard-rectification', hseHazardRectificationRoutes);

// 占位路由：通知模块
const hseNoticeRoutes = require('./routes/hse-notice');
app.use('/api/hse/notice', hseNoticeRoutes);

// 占位路由：隐患基线模块
const hseHazardBaselineRoutes = require('./routes/hse-hazard-baseline');
app.use('/api/hse/hazard-baseline', hseHazardBaselineRoutes);

// [阶段3] 作业中心已合并至组织管理，路由注册注释保留（后端文件 server/routes/hse-org-center.js 不动，可作 CRUD 参考）
// const hseOrgCenterRoutes = require('./routes/hse-org-center');
// app.use('/api/hse/org-center', hseOrgCenterRoutes);

// Sprint6.0: 岗位体系 + 责任体系
const hsePositionResponsibilityRoutes = require('./routes/hse-position-responsibility');
app.use('/api/hse/position-resp', hsePositionResponsibilityRoutes);

// Sprint6.0: 花名册导入基础能力
const hseRosterImportRoutes = require('./routes/hse-roster-import');
app.use('/api/hse', hseRosterImportRoutes);

// Sprint6.1-A: 员工风险画像基础框架（必须优先注册，避免被完整版 /:id 捕获）
const hseRiskProfileBaseRoutes = require('./routes/hse-risk-profile-base');
app.use('/api/hse/risk-profile/employee', hseRiskProfileBaseRoutes);

// Sprint6.1-D: 驾驶员专项风险画像
const hseDriverRiskRoutes = require('./routes/hse-driver-risk');
app.use('/api/hse/risk-profile/employee', hseDriverRiskRoutes);

// Sprint6.1: 员工风险画像中心（完整版）
const hseRiskProfileRoutes = require('./routes/hse-risk-profile');
app.use('/api/hse/risk-profile', hseRiskProfileRoutes);

// Sprint6.2: 风险等级计算服务
const hseRiskScoreRoutes = require('./routes/hse-risk-score');
app.use('/api/hse/risk-score', hseRiskScoreRoutes);

// Sprint6.4-A: 员工风险画像详情
const hseRiskProfileDetailRoutes = require('./routes/hse-risk-profile-detail');
app.use('/api/hse/risk/profile', hseRiskProfileDetailRoutes);

// Sprint6.4-B: 驾驶员专项风险中心
const hseDriverRiskCenterRoutes = require('./routes/hse-driver-risk-center');
app.use('/api/hse/driver-risk-center', hseDriverRiskCenterRoutes);

// Sprint6.4-C: 事故分析中心
const hseAccidentAnalysisRoutes = require('./routes/hse-accident-analysis');
app.use('/api/hse/accident-analysis', hseAccidentAnalysisRoutes);

// Sprint6.5: 集团HSE考核分析中心
const hseAssessmentAnalysisRoutes = require('./routes/hse-assessment-analysis');
app.use('/api/hse/assessment-analysis', hseAssessmentAnalysisRoutes);

// Sprint6.5-B: 集团HSE考核分析系统
const hseAssessmentRoutes = require('./routes/hse-assessment');
app.use('/api/hse/assessment', hseAssessmentRoutes);

// Sprint10-D-2-1: HSE月度安全履职考核模块
app.use('/api/hse/assessment-monthly', hseAssessmentMonthlyRoutes);

// 补充缺失业务台账（转运站管理 / 车辆三检），独立模块，不动既有逻辑
app.use('/api/transfer-stations', transferStationsRoutes);
app.use('/api/vehicle-checks', vehicleChecksRoutes);

// 责任书 + 安全会议出席（月度考核 RESP-002 / RESP-004 数据源）
app.use('/api/hse/responsibility-forms', require('./routes/hse-responsibility-forms'));
app.use('/api/hse/meeting-records', require('./routes/hse-meeting-records'));

// 扣分规则库（一期：hse_assessment_rule 规则管理 CRUD）
app.use('/api/hse/assessment-rule', require('./routes/hse-assessment-rule'));

// 扣分规则库-类别扣分上限（一期：hse_assessment_category_limit 类别级最大扣分）
app.use('/api/hse/assessment-category', require('./routes/hse-assessment-category'));
app.use('/api/hse/safety-culture', require('./routes/hse-safety-culture'));

// 三违分析「三违照片信息统计台账」月度分数（乡镇作业中心经理，复刻安全文化建设模式）
app.use('/api/hse/sanwei-analysis', require('./routes/hse-sanwei-analysis'));

// Sprint6.5-C: 集团HSE智能驾驶舱
const hseExecutiveCockpitRoutes = require('./routes/hse-executive-cockpit');
app.use('/api/hse/executive-cockpit', hseExecutiveCockpitRoutes);

// Sprint7: HSE智能预警与整改闭环中心
const hseWarningCenterRoutes = require('./routes/hse-warning-center');
app.use('/api/hse/warning-center', hseWarningCenterRoutes);

// Sprint8-A: HSE智能分析中心
const hseAnalysisCenterRoutes = require('./routes/hse-analysis-center');
app.use('/api/hse/analysis-center', hseAnalysisCenterRoutes);

// Sprint11-1 P0: 业务知识库（帮助说明）
const hseBusinessHelpRoutes = require('./routes/hse-business-help');
app.use('/api/hse/business-help', hseBusinessHelpRoutes);

// Sprint11-1 P0: 统一导入能力（批次/错误日志）
const hseImportFoundationRoutes = require('./routes/hse-import-foundation');
app.use('/api/hse/import', hseImportFoundationRoutes);

// Sprint11-1 P0: 审计记录（数据变化追踪）
const hseAuditRecordsRoutes = require('./routes/hse-audit-records');
app.use('/api/hse/audit-records', hseAuditRecordsRoutes);

// Sprint11-3-A: HSE平台动态能力（规则版本+动态筛选器+卡片交互）
const hseDynamicCapabilityRoutes = require('./routes/hse-dynamic-capability');
app.use('/api/hse/dynamic', hseDynamicCapabilityRoutes);

// 官方 Vben 前端兼容路由（接口契约对齐）：/api/user/info、/api/access/codes、/api/menu/all
app.use('/api', vbenCompatRoutes);

app.use('/api', notFound);

app.get('*', (req, res) => {
  res.status(404).json(error(404, 'API or resource not found'));
});

app.use(errorHandler);

// 仅在非测试环境下自动启动（Jest 测试通过 supertest 直接引用 app）
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    await testConnection();
    // 初始化查询日志监控
    queryLogger.init(pool);
    // 统一使用 http.createServer，让 Express 和 WebSocket 共享同一个 HTTP 服务器
    const http = require('http');
    const server = http.createServer(app);
    server.listen(PORT, () => {
      logger.info('HSE 后端服务启动成功', { port: PORT, env: process.env.NODE_ENV || 'development' });
      logger.info(`服务端口: http://localhost:${PORT}`);
      logger.info(`API文档: http://localhost:${PORT}/api/health`);
      logger.info(`静态文件: http://localhost:${PORT}/`);
      initWebSocketServer(server);
      logger.info(`WebSocket 服务: ws://localhost:${PORT}/ws`);
      // 注册员工模型健康巡检调度器（当前 DISABLED）
      initHealthCheckScheduler();
      // 月度安全履职自动考核调度器（周期创建/每日校验/网格校验）
      initAssessmentScheduler();
      // WPS 多维表格 ↔ 网格长巡查台账 同步调度器（未配置凭证时自动休眠）
      initWpsGridSyncScheduler();
      // 每月1号自动导入上月台账（安全文化建设 / 三违分析）
      initMonthlyLedgerImportScheduler();
    });
  })();
}

module.exports = app;
