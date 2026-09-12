# 认证安全审计报告

| 项目信息       | 内容                                  |
|----------------|---------------------------------------|
| 系统名称       | 宁津环卫 HSE 安全管理系统 v4.1        |
| 审计日期       | 2026-07-11                            |
| 审计类型       | 认证与授权安全审计                      |
| 文档编号       | HSE-SEC-AUDIT-2026-004                |

---

## 1. 审计范围

| 文件                      | 审计内容                     |
|---------------------------|-----------------------------|
| `server/middleware/auth.js`| JWT 签发/验证/黑名单         |
| `server/routes/auth.js`    | 登录/登出/刷新 Token        |
| `server/services/wsServer.js` | WebSocket 认证           |
| `server/middleware/rateLimit.js` | 登录限流               |
| `server/models/user.js`    | 用户模型与密码处理          |

---

## 2. JWT 实现分析

### 2.1 JWT 配置

| 配置项                | 当前值                                      | 评估   |
|-----------------------|---------------------------------------------|--------|
| 算法                  | HS256                                       | ACCEPT |
| Access Token 有效期   | 30 分钟                                     | GOOD   |
| Refresh Token 有效期  | 7 天                                        | GOOD   |
| Token 黑名单          | 已实现（Redis/内存存储）                    | GOOD   |
| Token 签发位置        | `server/middleware/auth.js`                | -      |
| Token 验证中间件      | `server/middleware/auth.js` (authenticate) | -      |

### 2.2 Token 生命周期

```
登录请求
  -> 密码校验 (bcrypt.compare)
  -> 签发 access_token (30min)
  -> 签发 refresh_token (7d)
  -> 返回双 Token

API 请求
  -> Authorization: Bearer <access_token>
  -> authenticate 中间件验证
  -> 检查黑名单
  -> 提取用户信息

Token 刷新
  -> POST /auth/refresh
  -> 验证 refresh_token
  -> 签发新 access_token
  -> 返回新 Token

登出
  -> 将 access_token 加入黑名单
  -> 清除 refresh_token
```

### 2.3 密码存储

| 检查项              | 结果 | 说明                       |
|---------------------|------|---------------------------|
| 哈希算法            | PASS | bcrypt                    |
| 加盐                | PASS | bcrypt 自动加盐            |
| 明文存储            | PASS | 无明文密码存储             |
| 密码传输            | PASS | HTTPS + POST Body         |
| 密码复杂度          | PASS | Zod 校验最小长度/复杂度    |

---

## 3. 发现问题

### 3.1 Critical: JWT_SECRET 硬编码

**问题描述**: JWT 密钥在源码中存在硬编码的 fallback 值，如果环境变量未设置，系统将使用硬编码密钥运行。

**影响**: 攻击者可直接从源码中获取密钥，伪造任意用户的 JWT Token，获取管理员权限。

**影响文件及行号**:

| 文件                           | 行号 | 硬编码值                                        |
|-------------------------------|------|------------------------------------------------|
| `server/middleware/auth.js`    | 10   | `'hse-safety-dashboard-secret-key-2024'`       |
| `server/middleware/auth.js`    | 11   | `'hse-refresh-secret-key-2024'`                |
| `server/services/wsServer.js`  | 15   | `'hse-safety-dashboard-secret-key-2024'`       |
| `server/routes/auth.js`       | 226  | `'hse-safety-dashboard-secret-key-2024'`       |

**当前代码模式**:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'hse-safety-dashboard-secret-key-2024';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'hse-refresh-secret-key-2024';
```

**修复方案**: 移除 fallback 值，启动时强制检查环境变量，缺失则拒绝启动。

### 3.2 Critical: JWT_REFRESH_SECRET 硬编码

同上，Refresh Token 密钥同样存在硬编码问题。

### 3.3 Medium: trust proxy 未配置

**问题描述**: Express 应用未配置 `app.set('trust proxy')`，在 Nginx 反向代理场景下，`req.ip` 和速率限制可能不正确。

**影响**:
- 速率限制基于错误 IP，攻击者可绕过
- 日志中记录的 IP 可能为代理 IP 而非真实客户端 IP

**修复方案**: 根据部署架构配置 trust proxy。

```javascript
// 单层代理
app.set('trust proxy', 1);

// 多层代理（如有 CDN）
// app.set('trust proxy', 'loopback, linklocal, uniquelocal');
```

---

## 4. 登录防护

| 防护措施       | 状态   | 说明                        |
|---------------|--------|-----------------------------|
| 登录速率限制   | PASS   | rate-limit 中间件           |
| 账号锁定       | PASS   | 多次失败后锁定               |
| 密码哈希       | PASS   | bcrypt                      |
| Token 黑名单   | PASS   | 登出时加入                   |
| 刷新 Token     | PASS   | 支持 Token 刷新机制         |

---

## 5. WebSocket 认证

| 检查项                | 结果   | 说明                          |
|-----------------------|--------|-------------------------------|
| 连接时 Token 验证      | PASS   | wsServer.js 验证 JWT          |
| Token 过期处理         | PASS   | 过期 Token 拒绝连接           |
| 密钥硬编码            | FAIL   | wsServer.js 包含硬编码密钥    |

---

## 6. 审计清单

| 检查项                       | 结果  | 备注                          |
|------------------------------|-------|-------------------------------|
| JWT 算法安全性                | PASS  | HS256 + 强密钥可接受           |
| Access Token 有效期          | PASS  | 30 分钟，合理                  |
| Refresh Token 有效期         | PASS  | 7 天，合理                     |
| Token 黑名单机制             | PASS  | 已实现                        |
| 密码哈希（bcrypt）           | PASS  | 安全                          |
| JWT 密钥管理                 | FAIL  | 硬编码 fallback               |
| trust proxy 配置             | FAIL  | 未配置                        |
| 登录速率限制                 | PASS  | 已实现                        |
| 账号锁定机制                 | PASS  | 已实现                        |
| WebSocket 认证              | PASS  | 已实现但密钥硬编码            |

---

## 7. 修复建议

| 优先级 | 修复项                   | 修复方案                                      | 修复文件                  |
|--------|--------------------------|-----------------------------------------------|---------------------------|
| P0     | JWT_SECRET 硬编码        | 移除 fallback，启动时强制检查                  | auth.js, wsServer.js      |
| P0     | JWT_REFRESH_SECRET 硬编码| 移除 fallback，启动时强制检查                  | auth.js                   |
| P1     | trust proxy 未配置       | 根据部署架构配置 `app.set('trust proxy', 1)`   | app.js                    |
| P2     | JWT 算法升级             | 评估 RS256 + 公私钥方案                         | auth.js                   |
| P2     | Token 轮转              | Refresh Token 使用后失效，签发新 Refresh Token  | auth.js                   |

---

## 8. 修复后预期评级

修复 P0 和 P1 问题后，认证安全评级将从 **C (70分)** 提升至 **A (95分)**。

---

*审计结论: JWT 实现机制完善，但密钥硬编码为 Critical 级安全问题，需立即修复。*
*审计日期: 2026-07-11*
