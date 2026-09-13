/**
 * HSE 安全管理系统后端服务 — TypeScript 入口
 * 文件: src/app.ts
 * 功能: Express 服务 + OpenTelemetry 分布式追踪 + Winston 统一日志
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { pool, testConnection, isConnected } from './config/db';
import { errorHandler, notFound } from './middleware/error';
import { success, error } from './middleware/response';
import { ensureDir } from './middleware/upload';

// ============================================================
// OpenTelemetry 分布式追踪（可选，Docker 环境中启用）
// ============================================================
let tracer: any = { startSpan: () => ({} as any) };
let otelInitialized = false;

function initTelemetry(): void {
  try {
    const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!otelEndpoint) {
      console.log('[OTEL] 未配置 OTEL_EXPORTER_OTLP_ENDPOINT, 跳过追踪');
      return;
    }

    // 动态加载 OTEL 包（仅在 Docker 环境中存在）
    const { trace } = require('@opentelemetry/api');
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_DEPLOYMENT_ENVIRONMENT } = require('@opentelemetry/semantic-conventions');

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'hse-backend',
        [ATTR_DEPLOYMENT_ENVIRONMENT]: process.env.OTEL_DEPLOYMENT_ENV || 'development',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${otelEndpoint}/v1/traces`,
      }),
      logExporter: new OTLPLogExporter({
        url: `${otelEndpoint}/v1/logs`,
      }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    tracer = trace.getTracer('hse-backend');
    otelInitialized = true;
    console.log('[OTEL] OpenTelemetry 追踪已启动, endpoint:', otelEndpoint);

    process.on('SIGTERM', () => {
      sdk.shutdown().then(() => console.log('[OTEL] 追踪已关闭'));
    });
  } catch (err: any) {
    console.warn('[OTEL] OpenTelemetry 初始化失败（包未安装或配置错误）:', err.message);
    otelInitFailed = true;
  }
}

let otelInitFailed = false;
initTelemetry();

// ============================================================
// 日志系统（console 降级 → Winston + Logstash）
// ============================================================
let logger: { info: Function; warn: Function; error: Function };

function initLogger() {
  try {
    const winston = require('winston');
    const transports: any[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
            return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          })
        ),
      }),
    ];

    const logstashHost = process.env.LOGSTASH_HOST;
    const logstashPort = parseInt(process.env.LOGSTASH_PORT || '5001', 10);
    if (logstashHost) {
      try {
        // 自定义 Logstash TCP 传输（避免 winston-logstash 与 winston 版本兼容问题）
        const net = require('net');
        const Transport = require('winston-transport');
        
        class LogstashTcpTransport extends Transport {
          private host: string;
          private port: number;
          private socket: any;
          private buffer: string[];
          private connecting: boolean;
          
          constructor(opts: any) {
            super(opts);
            this.host = opts.host;
            this.port = opts.port;
            this.buffer = [];
            this.connecting = false;
            this.connect();
          }
          
          private connect() {
            if (this.connecting) return;
            this.connecting = true;
            this.socket = new net.Socket();
            this.socket.on('error', () => {
              this.socket.destroy();
              this.connecting = false;
            });
            this.socket.on('close', () => {
              this.connecting = false;
            });
            this.socket.connect(this.port, this.host, () => {
              this.connecting = false;
              while (this.buffer.length > 0) {
                const msg = this.buffer.shift();
                if (msg) this.socket.write(msg);
              }
            });
          }
          
          log(info: any, callback: () => void) {
            setImmediate(() => { this.emit('logged', info); });
            const message = JSON.stringify({
              '@timestamp': new Date().toISOString(),
              level: info.level,
              message: info.message,
              service: process.env.OTEL_SERVICE_NAME || 'hse-backend',
              ...info,
            }) + '\n';
            
            if (this.socket && !this.socket.destroyed && this.socket.readyState === 'open') {
              this.socket.write(message);
            } else {
              this.buffer.push(message);
              this.connect();
            }
            if (callback) callback();
          }
        }
        
        transports.push(new LogstashTcpTransport({
          host: logstashHost,
          port: logstashPort,
        }));
        console.log(`[LOG] Logstash 日志传输已配置: ${logstashHost}:${logstashPort}`);
      } catch (e: any) {
        console.warn('[LOG] Logstash 传输初始化失败:', e.message);
      }
    }

    logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports,
    });
  } catch (err: any) {
    // 降级：console 模式
    const noop = (..._args: any[]) => {};
    logger = {
      info: (...args: any[]) => console.log('[INFO]', ...args),
      warn: (...args: any[]) => console.warn('[WARN]', ...args),
      error: (...args: any[]) => console.error('[ERROR]', ...args),
    };
    console.warn('[LOG] Winston 不可用, 降级为 console:', err.message);
  }
}

initLogger();

// ============================================================
// Express 应用初始化
// ============================================================
dotenv.config();

const app = express();
const PORT: number = parseInt(process.env.PORT || '5666', 10);
const FRONTEND_URL: string = process.env.FRONTEND_URL || `http://localhost:${process.env.FRONTEND_PORT || '5173'}`;
const uploadDir: string = process.env.UPLOAD_DIR || './uploads';

ensureDir(uploadDir);

// ========= 安全 & 性能中间件 =========
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

app.use(compression());

// CORS
const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s: string) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5666', 'http://127.0.0.1:5666'];

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn('CORS 拒绝跨域请求', { origin });
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 请求频率限制
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '500', 10),
  message: { success: false, code: -429, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP 请求', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '..', uploadDir)));

app.get('/', (_req: Request, res: Response): void => {
  res.redirect(FRONTEND_URL);
});

// ========= 健康检查接口 =========
app.get('/api/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT 1 AS ping');
    res.json(success({ ping: result.rows[0].ping, timestamp: new Date().toISOString() }, '服务正常'));
  } catch (err: any) {
    logger.error('健康检查失败', { error: err.message });
    res.json(error(-1, '数据库连接异常', { message: err.message }));
  }
});

// PostgreSQL 状态检测
app.get('/api/postgres/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const result = await pool.query(
      "SELECT version(), current_database(), pg_postmaster_start_time(), pg_database_size(current_database()) AS db_size, (SELECT count(*) FROM information_schema.tables WHERE table_schema='public') AS table_count"
    );
    const elapsed = Date.now() - startTime;
    const row = result.rows[0];
    res.json(success({
      online: true,
      version: row.version.split(',')[0],
      database: row.current_database,
      startedAt: row.pg_postmaster_start_time,
      dbSizeMB: Math.round(parseInt(row.db_size, 10) / 1024 / 1024 * 100) / 100,
      tableCount: parseInt(row.table_count, 10),
      responseMs: elapsed,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
    }, 'PostgreSQL 连接正常'));
  } catch (err: any) {
    res.json(success({
      online: false,
      error: err.message,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      dbConnected: isConnected(),
    }, 'PostgreSQL 连接异常'));
  }
});

// 对其他 /api 接口应用限流
app.use('/api', limiter);

// ========= 路由注册（全部 14 个模块）=========
// 使用 require 避免 TS 编译时找不到新迁移的模块声明
app.use('/api/vehicles', require('./routes/vehicles').default);
app.use('/api/files', require('./routes/files').default);
app.use('/api/file-records', require('./routes/file-records').default);
app.use('/api/risk-control', require('./routes/risk-control').default);
app.use('/api/import', require('./routes/import').default);
app.use('/api/overview', require('./routes/overview').default);
app.use('/api/regulations', require('./routes/regulations').default);
app.use('/api/training', require('./routes/training').default);
app.use('/api/accidents', require('./routes/accidents').default);
app.use('/api/hazards', require('./routes/hazards').default);
app.use('/api/emergency', require('./routes/emergency').default);
app.use('/api/insurance', require('./routes/insurance').default);
app.use('/api/site-mgmt', require('./routes/site-mgmt').default);
app.use('/api/objectives', require('./routes/objectives').default);
app.use('/api/alerts', require('./routes/alerts').default);
app.use('/api/workflow', require('./routes/workflow').default);
app.use('/api/auth', require('./routes/auth').default);
app.use('/api', require('./routes/vben-compat').default);

app.use('/api', notFound);

app.get('*', (req: Request, res: Response): void => {
  res.status(404).json(error(404, 'API or resource not found'));
});

app.use(errorHandler);

// ========= 启动服务 =========
(async (): Promise<void> => {
  await testConnection();
  app.listen(PORT, () => {
    logger.info('HSE后端服务启动成功', { port: PORT });
    console.log(`[SERVER] HSE后端服务启动成功`);
    console.log(`[SERVER] 服务端口: http://localhost:${PORT}`);
    console.log(`[SERVER] API文档: http://localhost:${PORT}/api/health`);
    console.log(`[SERVER] 静态文件: http://localhost:${PORT}/`);
  });
})();

export default app;
