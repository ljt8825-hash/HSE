/**
 * HSE 安全管理系统 v4.1 — 结构化日志工具
 *
 * 基于 winston 的生产级日志系统，提供：
 *   - 开发环境：彩色文本格式（便于阅读）
 *   - 生产环境：JSON 格式（便于日志采集平台解析）
 *   - 按日期轮转的文件日志（错误日志 + 综合日志）
 *   - 自动捕获未处理异常和未处理的 Promise 拒绝
 *   - 支持 requestId 请求追踪
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 日志目录（与 app.js 中的 logDir 保持一致）
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 当前运行环境
const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

// 自定义日志格式 — 开发环境（带颜色）
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqId = requestId ? ` [${requestId}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${reqId}: ${message}${metaStr}`;
  })
);

// 自定义日志格式 — 生产环境（JSON）
const prodFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 控制台输出
const consoleTransport = new winston.transports.Console({
  format: isProduction ? prodFormat : devFormat,
  level: isProduction ? 'info' : 'debug'
});

// ========== 孤儿进程 EPIPE 熔断 ==========
// 后端被孤儿化（终端关闭但进程残留）时 stdout/stderr 已断，任意 console/logger 写控制台都会 EPIPE：
//   console.error → stderr EPIPE → uncaughtException → logger.error → console 传输写 stdout 又 EPIPE → 死循环刷屏。
// 熔断策略：任一 EPIPE 信号出现后，一次性把 console 传输静默掉（仅保留文件日志），
// 并在 stdout/stderr 上挂 error 监听吞掉后续 EPIPE，阻断连锁反应。
let consoleEpipeTripped = false;
function tripConsoleTransport() {
  if (consoleEpipeTripped) return;
  consoleEpipeTripped = true;
  consoleTransport.silent = true;
  try {
    process.stderr.write('[logger] stdout/stderr 已断开（EPIPE），控制台传输已静默，仅保留文件日志\n');
  } catch (_) { /* stderr 已断，忽略 */ }
}
function isBrokenPipeError(e) {
  return !!(e && (e.code === 'EPIPE' || e.code === 'ECONNRESET' || e.code === 'EAGAIN'));
}
consoleTransport.on('error', (e) => { if (isBrokenPipeError(e)) tripConsoleTransport(); });
// 挂监听后 EPIPE 不再冒泡为 uncaughtException（吞掉，避免全局 console.error 连锁触发）
process.stdout.on('error', (e) => { if (isBrokenPipeError(e)) tripConsoleTransport(); });
process.stderr.on('error', (e) => { if (isBrokenPipeError(e)) tripConsoleTransport(); });

// 按日期轮转的错误日志（仅记录 error 级别）
const errorFileTransport = new winston.transports.File({
  filename: path.join(logDir, 'error-%DATE%.log'),
  level: 'error',
  datePattern: 'YYYY-MM-DD',
  format: prodFormat,
  maxsize: 100 * 1024 * 1024, // 100MB
  maxFiles: '30d',
  tailable: true,
  zippedArchive: true // 自动压缩归档为 .gz
});

// 按日期轮转的综合日志（记录所有级别）
const combinedFileTransport = new winston.transports.File({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  format: prodFormat,
  maxsize: 100 * 1024 * 1024, // 100MB
  maxFiles: '30d',
  tailable: true,
  zippedArchive: true // 自动压缩归档为 .gz
});

// 创建 winston logger 实例
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'safety-dashboard-server',
    version: '4.1',
    env: env
  },
  transports: [
    consoleTransport,
    errorFileTransport,
    combinedFileTransport
  ],
  exitOnError: false // 不因未捕获异常退出进程
});

// ========== 自动捕获未处理异常 ==========

// 防递归 guard：handler 内 logger.error 写 console 若再次 EPIPE，不得再次进入本 handler 造成死循环
let handlingUncaught = false;

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  if (handlingUncaught) return;
  handlingUncaught = true;
  try {
    logger.error('未捕获异常', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
  } finally {
    handlingUncaught = false;
  }
});

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack
    } : String(reason)
  });
});

// ========== 导出 ==========

module.exports = logger;
