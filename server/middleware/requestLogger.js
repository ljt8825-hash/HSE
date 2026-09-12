/**
 * HSE 安全管理系统 v4.1 — 请求日志中间件
 *
 * 基于 winston 结构化日志的 Express 中间件，替代 morgan：
 *   - 为每个请求生成唯一 requestId（支持从 X-Request-Id 头继承）
 *   - 记录请求方法、URL、IP、User-Agent
 *   - 记录响应状态码、响应时间（ms）、内容长度
 *   - 将 requestId 挂载到 req.requestId，供下游中间件/路由使用
 *   - 使用 logger.child({ requestId }) 创建子 logger
 *   - 错误响应（>=400）单独记录为 warn/error 级别
 */

// 使用 Node 内置 crypto.randomUUID 替代 uuid 包（uuid@14 为纯 ESM，CJS require 会报
// SyntaxError: Unexpected token 'export'，导致 Jest 加载 app.js 时整个测试套件崩溃）
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

/**
 * 创建请求日志中间件
 * @returns {Function} Express 中间件
 */
function createRequestLogger() {
  return function requestLogger(req, res, next) {
    // 1. 生成或继承 requestId
    const requestId = req.headers['x-request-id'] || randomUUID().replace(/-/g, '').substring(0, 16);

    // 2. 挂载 requestId 到请求对象
    req.requestId = requestId;

    // 3. 创建子 logger（自动携带 requestId）
    req.logger = logger.child({ requestId });

    // 4. 记录请求开始时间
    const startTime = Date.now();

    // 5. 捕获响应完成事件
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const statusCode = res.statusCode;
      const contentLength = res.get('Content-Length') || '-';

      // 请求基本信息
      const requestInfo = {
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip || req.connection?.remoteAddress || '-',
        userAgent: req.get('User-Agent') || '-',
        statusCode,
        responseTimeMs: responseTime,
        contentLength
      };

      // 6. 根据状态码选择日志级别
      if (statusCode >= 500) {
        // 服务端错误
        req.logger.error('请求处理失败', requestInfo);
      } else if (statusCode >= 400) {
        // 客户端错误
        req.logger.warn('请求异常', requestInfo);
      } else {
        // 正常请求（使用 http 级别）
        req.logger.http('请求完成', requestInfo);
      }
    });

    // 7. 继续后续中间件
    next();
  };
}

// ========== 导出 ==========
module.exports = {
  createRequestLogger,
  logger
};
