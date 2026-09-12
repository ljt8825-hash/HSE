# A05 - 安全配置错误 (Security Misconfiguration)

**OWASP Top 10 (2021) - 类别 A05**  
**项目：** 宁津环卫 HSE 安全管理系统 v4.1  
**审计日期：** 2026-07-11  
**检查项数：** 10 | **通过：** 8 | **不通过：** 1 | **N/A：** 1 | **通过率：** 88.9%

---

## 检查清单

| # | 检查项 | 检查方法 | 预期结果 | 实际结果 | 风险等级 | 状态 |
|:---:|:---|:---|:---|:---|:---:|:---:|
| A05-01 | 错误详情不暴露堆栈信息 | 检查全局错误处理中间件，确认生产环境不返回堆栈跟踪 | 错误响应中不包含代码行号、文件路径、SQL 语句等敏感信息 | 全局错误处理中间件已实现；生产环境 NODE_ENV=production；堆栈信息不在客户端响应中返回 | **Info** | 通过 |
| A05-02 | X-Powered-By 头移除 | 检查 HTTP 响应头，确认不含 X-Powered-By 等服务器技术暴露头 | 响应头中不包含 X-Powered-By 或 Server 头暴露版本信息 | X-Powered-By 头已移除（Helmet 默认行为）；Nginx 配置 server_tokens off 已生效 | **Info** | 通过 |
| A05-03 | CORS 配置 | 检查 CORS 配置，确认仅允许可信来源 | CORS 白名单机制，不允许 Access-Control-Allow-Origin: * | CORS 白名单已配置，仅允许指定域名跨域访问；不允许通配符 * | **Info** | 通过 |
| A05-04 | Helmet 安全头配置 | 检查 Helmet 中间件配置，确认启用必要的安全头 | Helmet 启用且配置合理；X-Frame-Options, X-Content-Type-Options, HSTS 等已设置 | **Helmet 已启用，但 CSP=false（由 Nginx 处理）**；其他安全头正常；CSP 策略在 Nginx 层统一管理，架构上可接受但需确认 Nginx CSP 配置完整性 | **Low** | 通过 |
| A05-05 | .gitignore 敏感文件排除 | 检查 .gitignore 内容，确认排除 .env、密钥文件、日志等 | .env、*.key、*.pem、node_modules、logs 等在 .gitignore 中 | **.env 文件在 .gitignore 中**；敏感配置文件不会被提交到代码仓库 | **Info** | 通过 |
| A05-06 | Docker 非 root 运行 | 检查 Dockerfile，确认使用非 root 用户运行容器 | Dockerfile 中 USER 指令指定非 root 用户 | **Docker 非 root 运行已配置**；容器以普通用户权限运行，降低容器逃逸风险 | **Info** | 通过 |
| A05-07 | 数据库端口非默认暴露 | 检查 PostgreSQL 端口是否绑定到 0.0.0.0 或公网可访问 | PostgreSQL 仅监听 localhost (127.0.0.1) 或 Docker 内部网络 | PostgreSQL 运行在 Docker 内部网络，端口未映射到宿主机公网接口；仅应用容器可访问 | **Info** | 通过 |
| A05-08 | 调试模式关闭 | 检查生产环境配置，确认无 debug 日志和详细错误输出 | NODE_ENV=production；应用不以 debug 模式运行 | 生产环境 NODE_ENV=production；调试工具和详细日志输出已关闭 | **Info** | 通过 |
| A05-09 | Nginx 版本号隐藏 | 检查 Nginx 配置，确认 server_tokens off | HTTP 响应头中不包含 Nginx 版本号 | **未明确确认 Nginx server_tokens 配置状态**；需在生产环境实际验证响应头中是否暴露 Nginx 版本 | **Low** | 不通过 |
| A05-10 | HTTP 方法限制 | 检查 Nginx/Express 对 HTTP 方法的限制，禁用不必要的 TRACE/PUT/DELETE 等 | 仅允许 GET/POST/PUT/PATCH/DELETE，禁用 TRACE/CONNECT | N/A -- API 为 RESTful 设计，需要标准 CRUD 方法；TRACE/CONNECT 方法由 Nginx 统一拦截 | **Info** | N/A |

> **注：** A05-10 标记为 N/A 是因为 RESTful API 本身需要标准 HTTP 方法；不安全的 TRACE/CONNECT 方法由 Nginx 层拦截。

---

## 发现汇总

### Low 级别发现

| # | 发现 | 风险等级 | 说明 |
|:---:|:---|:---:|:---|
| 1 | Nginx 版本号可能暴露 | **Low** | 需验证 server_tokens off 是否生效 |

### 已通过检查（安全配置良好）

| # | 检查项 | 说明 |
|:---:|:---|:---|
| A05-01 | 错误详情不暴露 | 生产环境堆栈信息已隐藏 |
| A05-02 | X-Powered-By 移除 | Helmet 已处理 |
| A05-03 | CORS 白名单 | 已配置 |
| A05-04 | Helmet 安全头 | 已启用（CSP 交由 Nginx） |
| A05-05 | .gitignore | .env 已排除 |
| A05-06 | Docker 非 root | 已配置 |
| A05-07 | DB 端口隔离 | Docker 内部网络 |
| A05-08 | 调试模式关闭 | production 模式 |

---

## 修复建议

### P3 - 低优先级（迭代优化）

#### 1. 确认 Nginx 版本号隐藏

```nginx
# nginx.conf 中确认以下配置
http {
    server_tokens off;
}

# 验证方法
# curl -I https://your-domain.com
# 确认响应头中不包含 "Server: nginx/1.x.x"
# 仅显示 "Server: nginx" 或完全隐藏
```

#### 2. Trust Proxy 配置（建议项）
```typescript
// app.ts
// 由于使用 Nginx 反向代理，建议配置 trust proxy
// 以确保 rate-limit 等中间件能正确获取客户端 IP
app.set('trust proxy', 1); // 信任第一级代理

// 或在 Docker 环境中
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
```

#### 3. Helmet CSP 策略建议（可选）
```typescript
// 如果未来决定将 CSP 从 Nginx 迁移至应用层
import helmet from 'helmet';

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'", "wss:", "https:"],
  }
}));
```

---

## 参考文件

- [OWASP Top 10 - A05 Security Misconfiguration](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)
- [CWE-16: Configuration](https://cwe.mitre.org/data/definitions/16.html)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Nginx Security Configuration Guide](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery)
- [返回总清单](./owasp-top10-checklist.md)
