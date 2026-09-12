# Node.js 安全加固指南

| 项目信息       | 内容                                  |
|----------------|---------------------------------------|
| 系统名称       | 宁津环卫 HSE 安全管理系统 v4.1        |
| 文档编号       | HSE-SEC-HARDEN-2026-002               |
| 日期           | 2026-07-11                            |

---

## 1. 移除 Express 指纹

隐藏 Express 框架版本信息，减少信息泄露。

```javascript
// server/app.js
const express = require('express');
const app = express();

// 禁用 X-Powered-By 头
app.disable('x-powered-by');
```

**验证方法**:
```bash
curl -I http://localhost:3000/
# 不应看到: X-Powered-By: Express
```

---

## 2. Helmet 配置优化

当前状态: Helmet 已启用但 `contentSecurityPolicy` 被设为 `false`，需启用 CSP。

```javascript
// server/app.js
const helmet = require('helmet');

app.use(helmet({
  // 启用内容安全策略（CSP）
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Ant Design Vue 需要 unsafe-inline
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "wss:"],            // WebSocket 连接
      frameAncestors: ["'none'"],                 // 禁止被 iframe 嵌入
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],               // 自动升级 HTTP 到 HTTPS
    },
  },

  // HSTS: 强制 HTTPS（生产环境启用）
  hsts: {
    maxAge: 31536000,       // 1 年
    includeSubDomains: true,
    preload: true,
  },

  // 跨域策略
  crossOriginEmbedderPolicy: false,  // 视需求启用
  crossOriginOpenerPolicy: false,     // 视需求启用
  crossOriginResourcePolicy: { policy: "same-origin" },

  // Referrer 策略
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
```

---

## 3. 请求体大小限制

限制请求体大小，防止大负载攻击。

```javascript
// server/app.js

// JSON 请求体限制为 1MB
app.use(express.json({ limit: '1mb' }));

// URL 编码请求体限制为 1MB
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

---

## 4. trust proxy 配置

在 Nginx 反向代理场景下，必须配置 trust proxy 以正确获取客户端 IP。

```javascript
// server/app.js

// 单层代理（Nginx -> Express）
app.set('trust proxy', 1);

// 多层代理（如 CDN -> Nginx -> Express）
// app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// 或者使用自定义代理 IP 列表
// app.set('trust proxy', ['192.168.1.0/24', '10.0.0.0/8']);
```

**影响说明**:

| 未配置 trust proxy 的后果                    | 配置后的改善                     |
|---------------------------------------------|---------------------------------|
| `req.ip` 返回代理 IP (127.0.0.1)            | `req.ip` 返回真实客户端 IP      |
| 速率限制基于代理 IP，可被绕过                | 速率限制基于真实 IP，有效防护    |
| 日志中记录的 IP 不准确                       | 日志记录真实客户端 IP           |
| `req.protocol` 始终返回 http               | 正确识别 HTTPS                  |

---

## 5. 全局错误处理

错误响应中不应暴露堆栈信息、数据库详情等敏感信息。

```javascript
// server/middleware/errorHandler.js

function errorHandler(err, req, res, next) {
  // 记录完整错误到日志（包含堆栈）
  console.error('[ERROR]', {
    timestamp: new Date().toISOString(),
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    error: err.message,
    stack: err.stack,
  });

  // 响应中不暴露敏感信息
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? (statusCode === 500 ? '服务器内部错误' : err.message)
    : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    // 仅开发环境返回堆栈
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
```

---

## 6. ETag 禁用（可选）

对于不需要缓存的 API 响应，禁用 ETag 以减少信息泄露和计算开销。

```javascript
// server/app.js
app.set('etag', false);

// 或者使用弱 ETag（默认行为，安全影响较低）
// app.set('etag', 'weak');
```

> **说明**: ETag 可能泄露文件内容的部分哈希信息，但对于 API 服务影响较小，可按需配置。

---

## 7. Cookie 安全配置

设置安全的 Cookie 属性。

```javascript
// 使用 cookie-parser 或 express-session 时
app.use(session({
  secret: process.env.SESSION_SECRET,
  cookie: {
    httpOnly: true,       // 禁止 JavaScript 访问 Cookie
    secure: true,         // 仅通过 HTTPS 传输（生产环境）
    sameSite: 'lax',      // CSRF 防护
    maxAge: 3600000,      // 1 小时过期
    path: '/',
  },
  rolling: true,
  resave: false,
  saveUninitialized: false,
}));
```

---

## 8. CORS 配置

仅允许可信源跨域访问。

```javascript
// server/app.js
const cors = require('cors');

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如服务端调用、Postman）
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 不允许的源'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,         // 允许携带 Cookie
  maxAge: 86400,             // 预检请求缓存 24 小时
}));
```

---

## 9. 依赖安全

### 9.1 定期审计

```bash
# 检查已知漏洞
npm audit

# 自动修复（仅修复不破坏兼容性的更新）
npm audit fix

# 强制修复（可能包含破坏性更新，需测试）
npm audit fix --force

# 仅查看，不修复
npm audit --json
```

### 9.2 CI 集成

```yaml
# .github/workflows/security.yml 或类似 CI 配置
- name: 依赖安全审计
  run: npm audit --audit-level=high
```

### 9.3 锁文件管理

```bash
# 使用 npm ci 代替 npm install（CI 环境）
npm ci

# 确保 package-lock.json 提交到版本控制
# 确保不可信来源的包不被引入
```

---

## 10. 安全响应头检查清单

| 安全头                  | 状态   | 说明                               |
|-------------------------|--------|------------------------------------|
| X-Powered-By           | 禁用   | app.disable('x-powered-by')        |
| X-Frame-Options        | Helmet | DENY 或 SAMEORIGIN                 |
| X-Content-Type-Options | Helmet | nosniff                            |
| X-XSS-Protection       | Helmet | 1; mode=block                     |
| Strict-Transport-Security | Helmet | max-age=31536000                 |
| Content-Security-Policy | Helmet | 需启用（当前 false）               |
| Referrer-Policy        | Helmet | strict-origin-when-cross-origin    |
| Permissions-Policy     | Helmet | 限制浏览器 API                     |

---

## 11. 加固检查清单

| 检查项                       | 状态   | 说明                           |
|------------------------------|--------|-------------------------------|
| X-Powered-By 禁用           | CHECK  | app.disable('x-powered-by')    |
| Helmet CSP 启用              | TODO   | 当前 CSP=false，需修复         |
| HSTS 配置                    | CHECK  | 生产环境必须启用               |
| 请求体大小限制               | CHECK  | JSON/URL 编码 1MB             |
| trust proxy 配置             | TODO   | 当前未配置，需修复             |
| 全局错误处理                | CHECK  | 不暴露堆栈信息                 |
| Cookie 安全属性              | CHECK  | httpOnly + secure + sameSite   |
| CORS 白名单                  | PASS   | 已配置                         |
| 依赖审计                     | CHECK  | 定期 npm audit                |

---

*文档日期: 2026-07-11*
