# 第2步报告：Auth 模块 — 前后端全链路对接

> 生成时间：2026-07-07 | 执行人：AI Assistant  
> 项目：山东省宁津县环卫公司 HSE 安全管理系统

---

## 一、方案设计

### 1.1 认证架构

```
┌─────────────┐     POST /api/auth/login      ┌─────────────┐
│   前端页面   │ ────────────────────────────> │             │
│  Login.vue  │                               │   Node.js   │
│             │ <── {token, refreshToken, user}│   Express   │
└─────────────┘                               │   后端      │
       │                                       │             │
       │ localStorage.setItem('hse-token')      │  ┌───────┐  │
       │                                       │  │ users │  │
       ▼                                       │  │token_ │  │
┌─────────────┐                               │  │blacklist  │
│ localStorage│                               │  └───────┘  │
│ hse-token   │                               └─────────────┘
└─────────────┘
       │
       │ 每次请求: Authorization: Bearer <token>
       ▼
┌─────────────┐     受保护 API (vehicles, etc.) ┌─────────────┐
│  Axios请求   │ ────────────────────────────> │  authMiddleware │
│ request.ts  │                               │  JWT 验证     │
│             │ <── 401 (Token失效/过期)        │  黑名单检查   │
└─────────────┘                               └─────────────┘
```

### 1.2 Token 流程

| 阶段 | Access Token | Refresh Token |
|------|-------------|---------------|
| 有效期 | 30 分钟 | 7 天 |
| 用途 | API 请求认证 | 刷新 Access Token |
| 存储位置 | localStorage | localStorage（前端） |
| 签发密钥 | `JWT_SECRET` | `JWT_REFRESH_SECRET` |
| 失效方式 | 过期 / 加入黑名单 | 过期 |

### 1.3 角色权限模型

| 角色 | 权限说明 |
|------|---------|
| `admin` | 系统管理员，全部权限 |
| `manager` | 部门经理，数据管理权限 |
| `viewer` | 普通查看员，只读权限 |

预留 `requireRole()` 中间件，可在各路由中按需启用。

### 1.4 安全策略

| 策略 | 实现 |
|------|------|
| 密码哈希 | bcryptjs，cost=10 |
| 密码强度 | 最少 8 位，含大小写+数字 |
| 登录失败锁定 | 5 次失败锁定 15 分钟 |
| Token 黑名单 | PostgreSQL `token_blacklist` 表 |
| 登出失效 | 登出时将 Token JTI 加入黑名单 |
| 改密失效 | 改密后将当前 Token 加入黑名单 |

---

## 二、数据库变更

### 2.1 新建表

**文件**：`sql/auth_schema.sql`

| 表名 | 说明 | 字段 |
|------|------|------|
| `users` | 用户表 | id, username, password_hash, real_name, role, department, phone, email, avatar, is_active, last_login_at, created_at, updated_at |
| `token_blacklist` | Token 黑名单 | id, token_jti, user_id, expires_at, created_at |
| `login_attempts` | 登录失败记录 | id, username, ip_address, success, attempt_time |

### 2.2 初始化数据

```sql
INSERT INTO users (username, password_hash, real_name, role, department, is_active)
VALUES ('admin', '$2b$10$iiRdJFl7xIHAH7Bumv/D1OtcwBj1rBWmd15ba60smBGj5L5twMnoK', '系统管理员', 'admin', '安全管理部门', TRUE);
```

- 默认管理员：**admin / admin123**
- 密码使用 bcryptjs 哈希（cost=10）

### 2.3 索引

```sql
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);
CREATE INDEX idx_login_attempts_username ON login_attempts(username, attempt_time);
```

---

## 三、后端实现

### 3.1 新增文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| `auth.js` | `server/middleware/auth.js` | JWT 认证中间件、Token 生成/验证/黑名单 |
| `auth.js` | `server/routes/auth.js` | 认证路由（login/logout/current-user/change-password/profile） |
| `auth_schema.sql` | `sql/auth_schema.sql` | 数据库建表 SQL |

### 3.2 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `server/app.js` | 引入 `authMiddleware` 和 `authRoutes`；在 `/api` 挂载认证中间件；注册 `/api/auth` 路由 |
| `server/package.json` | 新增依赖：`jsonwebtoken`、`bcryptjs`、`uuid` |

### 3.3 API 接口文档

| 方法 | 路径 | 请求体 | 响应 | 认证 |
|------|------|--------|------|------|
| POST | `/api/auth/login` | `{username, password}` | `{token, refreshToken, user}` | 公开 |
| POST | `/api/auth/logout` | - | `{success: true}` | Bearer Token |
| GET | `/api/auth/current-user` | - | `{id, username, realName, role, ...}` | Bearer Token |
| PUT | `/api/auth/change-password` | `{oldPassword, newPassword}` | `{success: true}` | Bearer Token |
| PUT | `/api/auth/profile` | `{realName, department, phone, email, avatar}` | 更新后用户信息 | Bearer Token |

### 3.4 中间件链路

```
请求 → helmet → compression → cors → rateLimit → express.json → authMiddleware → 路由处理 → response
```

`authMiddleware` 排除的公开路径：`/auth/login`、`/auth/refresh`、`/health`、`/postgres/status`

---

## 四、前端对接

### 4.1 前端状态评估

经审查，**前端代码已经是真实 API 对接状态**，无需修改：

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/api/auth.ts` | ✅ 已就绪 | 5 个接口定义完整，类型正确 |
| `src/api/request.ts` | ✅ 已就绪 | Bearer Token 自动附加、401 处理、错误总线 |
| `src/stores/index.ts` | ✅ 已就绪 | User Store 管理 token + userInfo + localStorage |
| `src/views/Login.vue` | ✅ 已就绪 | 调用 `authApi.login()`，非 Mock |
| `src/router/index.ts` | ✅ 已就绪 | 路由守卫检查 `isLoggedIn`，支持角色权限预留 |

### 4.2 Token 管理机制

```
登录成功
  → authApi.login() 返回 { token, refreshToken, user }
  → Login.vue: userStore.setToken(token) + userStore.setUserInfo(user)
  → setToken: localStorage.setItem('hse-token', token)
  → setUserInfo: localStorage.setItem('hse-user', JSON.stringify(user))

每次请求
  → request.ts 拦截器读取 localStorage.getItem('hse-token')
  → 附加到请求头: Authorization: Bearer <token>

Token 过期
  → 后端返回 401
  → request.ts pushApiError('登录已过期') + 派发 'hse-auth-expired' 事件
  → App.vue 监听事件，调用 userStore.logout() + 跳转登录页

登出
  → 调用 authApi.logout()
  → userStore.logout(): 清除 token + userInfo + localStorage
  → 后端将 Token JTI 加入黑名单
```

---

## 五、联调测试结果

### 5.1 测试环境

- 后端：`node server/app.js`，端口 3000
- 数据库：PostgreSQL `safety_dashboard`
- 测试工具：Node.js http 原生客户端脚本

### 5.2 测试用例结果

| # | 测试场景 | 预期 | 实际 | 结果 |
|---|---------|------|------|------|
| 1 | 健康检查 `/api/health` | 200 | 200，服务正常 | ✅ 通过 |
| 2 | 未登录访问车辆列表 | 401 | 401，未提供认证令牌 | ✅ 通过 |
| 3 | 错误密码登录 | 401 | 401，用户名或密码错误 | ✅ 通过 |
| 4 | 正确登录 admin/admin123 | 200 + Token | 200，返回 token + user | ✅ 通过 |
| 5 | 获取当前用户信息 | 200 + 用户信息 | 200，返回完整用户信息 | ✅ 通过 |
| 6 | Token 访问车辆列表 | 200 | 200，数据返回正常 | ✅ 通过 |
| 7 | 登出 | 200 | 200，登出成功 | ✅ 通过 |
| 8 | 登出后旧 Token 访问 | 401 | 401，令牌已失效 | ✅ 通过 |
| 9 | 空用户名密码登录 | 400 | 400，用户名和密码不能为空 | ✅ 通过 |
| 10 | 不存在的用户登录 | 401 | 401，用户名或密码错误 | ✅ 通过 |

**10/10 全部通过**

### 5.3 测试中发现的问题及修复

| 问题 | 原因 | 修复 |
|------|------|------|
| `authMiddleware` 拦截了公开接口 | `req.path` 在 Express 挂载后已去掉 `/api` 前缀，但公开路径配置仍包含 `/api` | 将公开路径从 `/api/auth/login` 改为 `/auth/login` |
| 预置 bcrypt hash 验证失败 | SQL 中预置的 `$2a$` 格式 hash 与 bcryptjs 不兼容 | 用 bcryptjs 重新生成 `$2b$` 格式 hash 并更新数据库和 SQL 文件 |

---

## 六、遗留问题与下一步建议

### 6.1 遗留问题

| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | JWT Secret 硬编码 | **高** | `JWT_SECRET` 和 `JWT_REFRESH_SECRET` 在代码中硬编码，生产环境必须通过环境变量配置 |
| 2 | 缺少 Refresh Token 刷新接口 | 中 | 当前只有 Access Token，前端需要实现 Token 自动刷新机制（或延长 Access Token 有效期） |
| 3 | 密码策略可配置化 | 低 | 当前密码强度规则硬编码在路由中，建议提取到配置 |
| 4 | 多因素认证预留 | 低 | 当前只有单因素密码认证，如需 MFA 需在 users 表中预留字段 |
| 5 | 登录日志审计 | 低 | `login_attempts` 表仅记录失败，建议增加完整的登录审计日志 |

### 6.2 生产环境 JWT Secret 配置建议

在 `server/.env` 中添加：

```bash
JWT_SECRET=your-random-secret-key-min-32-chars
JWT_REFRESH_SECRET=your-random-refresh-secret-key-min-32-chars
```

生成强随机密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6.3 下一步：统一后端架构

Auth 模块已完成对接，下一步（第3步）建议：
- 审计 Node.js 和 Python 两套后端的功能覆盖
- 明确技术选型（推荐 Node.js 主后端 + Python 数据处理工具）
- 清理冗余代码，统一架构标准

---

*报告结束。下一步：执行第3步「统一后端架构」，使用提示词 `prompts/step3-backend-consolidation.md`。*
