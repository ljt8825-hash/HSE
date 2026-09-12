# 第2步：Auth 模块 — 前后端全链路对接

## 前置条件（第1步完成后）

第1步数据迁移已完成，业务表中已有真实数据。Node.js 后端已成功连接 PostgreSQL `safety_dashboard` 数据库并正常提供服务。

## 项目背景

你正在开发**山东省宁津县环卫公司 HSE 安全管理系统**。

**当前 Auth 状态：**
- 前端有完整的 Auth API 定义（`src/api/auth.ts`），包含 login/logout/currentUser/changePassword/profile 5 个接口
- 前端登录页面 `Login.vue` 当前使用 Mock 模拟登录（任意用户名密码可登录）
- 前端 Pinia Store（`stores/index.ts`）中有 User Store 管理登录态
- 前端路由守卫已实现，但依赖 Mock Token
- **Node.js 后端（`server/app.js`）未注册任何 auth 路由** — 这是本次任务的核心
- Python Flask 后端有 Blueprint 代码但未启用

**技术栈：**
- 前端：Vue 3 + TypeScript + Pinia + Vue Router + Axios
- 后端：Node.js Express + pg（PostgreSQL）
- 数据库：PostgreSQL `safety_dashboard`，空密码 trust 认证
- 前端 Axios baseURL = `/api`，Vite 代理到 `localhost:3000`

## 核心问题

系统的认证授权模块是空壳：前端登录走了 Mock 逻辑，后端没有任何 auth 路由。生产环境下任何人都可以伪造身份访问系统，存在严重安全风险。

## 你的任务

### 任务 1：设计 Auth 方案

基于现有技术栈，设计一套适合企业级内部管理系统的认证方案：

**必须包含：**
- JWT Token 认证（Access Token + Refresh Token 双 Token 机制）
- 密码 bcrypt 哈希存储
- Token 中间件（验证请求头 Authorization: Bearer <token>）
- 角色权限模型（至少支持 admin / manager / viewer 三级角色）

**主流实践参考：**
- Access Token 有效期 15-30 分钟，Refresh Token 有效期 7 天
- 密码强度：最少 8 位，含大小写和数字
- 登录失败 5 次锁定 15 分钟
- Token 黑名单机制（用于登出和改密场景）

### 任务 2：数据库 Auth 表

在 PostgreSQL `safety_dashboard` 中创建以下表（参考 `sql/unified_schema.sql` 的风格）：

```sql
-- 用户表
users (id, username, password_hash, real_name, role, department, phone, email, avatar, is_active, last_login_at, created_at, updated_at)

-- Token 黑名单（用于登出和改密）
token_blacklist (id, token_jti, user_id, expires_at, created_at)

-- 登录失败记录（用于锁定）
login_attempts (id, username, ip_address, success, attempt_time)
```

创建独立的 SQL 文件 `sql/auth_schema.sql`，然后执行建表。同时初始化默认管理员账号：
- 用户名：`admin`
- 密码：`admin123`（bcrypt 哈希后存储）

### 任务 3：实现后端 Auth 路由

在 `server/routes/` 下创建 `auth.js`，实现以下接口：

| 方法 | 路径 | 功能 | 备注 |
|------|------|------|------|
| POST | `/api/auth/login` | 用户登录 | 返回 accessToken + refreshToken + 用户信息 |
| POST | `/api/auth/logout` | 用户登出 | 将当前 Token 加入黑名单 |
| GET | `/api/auth/current-user` | 获取当前用户 | 从 Token 解析用户信息 |
| PUT | `/api/auth/change-password` | 修改密码 | 验证旧密码，旧 Token 失效 |
| PUT | `/api/auth/profile` | 更新个人信息 | 需登录态 |

**依赖包建议：**
- `jsonwebtoken` — JWT 签发与验证
- `bcryptjs` — 密码哈希（纯 JS 实现，无需编译）
- `uuid` — 生成 Token JTI

在 `server/app.js` 中注册 auth 路由，并添加全局 Token 验证中间件（排除 login 和 health 等公开接口）。

### 任务 4：对接前端

修改前端代码，将 Mock 登录替换为真实 API 调用：

1. **`src/api/auth.ts`** — 已存在，确认接口路径与后端一致（已定义为 `/auth/login` 等，通过 `/api` 前缀代理，路径应一致）
2. **`Login.vue`** — 移除 Mock 逻辑，使用 `authApi.login()` 调用后端接口
3. **`stores/index.ts` User Store** — 确保 Token 存储在 localStorage，请求拦截器自动附加 Bearer Token
4. **`src/api/request.ts`** — Axios 拦截器添加 401 响应处理（自动跳转登录页）
5. **路由守卫** — 确保未登录时重定向到 `/login`

### 任务 5：联调验证

1. 启动 Node.js 后端（`node server/app.js`）
2. 启动前端开发服务器（`npm run dev`）
3. 测试完整流程：
   - 使用 admin/admin123 登录 → 成功跳转首页
   - 刷新页面 → 保持登录态
   - 登出 → 返回登录页
   - 使用错误密码 → 显示错误提示
   - 未登录时访问业务页面 → 跳转登录页
   - 修改密码 → 旧密码失效需重新登录

## 输出要求

生成一份 Markdown 报告文件 `step2-auth-integration-report.md`，保存到 `f:\个人文件\新安全看板\prompts\` 目录，包含以下章节：

1. **方案设计** — 认证架构图、Token 流程、角色权限模型、安全策略
2. **数据库变更** — 建表 SQL、初始化数据、迁移记录
3. **后端实现** — 新增文件清单、路由注册、中间件链路、API 接口文档
4. **前端对接** — 修改的文件列表、Mock → 真实 API 的变更对比、Token 管理机制
5. **联调测试结果** — 每个测试场景的通过/失败记录
6. **遗留问题与下一步建议** — 密码策略优化、多因素认证预留、下一步（统一后端架构）

## 技术约束

- 数据库：PostgreSQL `safety_dashboard`，空密码
- Node.js 后端入口：`f:\个人文件\新安全看板\server\app.js`
- 新增 npm 依赖需在 `server/package.json` 中声明
- 前端使用 TypeScript，类型定义需与后端接口保持一致
- 不得引入重量级框架（如 Passport.js），保持轻量化

## 关键文件路径

| 文件 | 路径 |
|------|------|
| Node.js 后端入口 | `f:\个人文件\新安全看板\server\app.js` |
| 数据库配置 | `f:\个人文件\新安全看板\server\config\db.js` |
| 前端 Auth API | `f:\个人文件\新安全看板\安全管理系统\src\api\auth.ts` |
| 前端请求封装 | `f:\个人文件\新安全看板\安全管理系统\src\api\request.ts` |
| 前端登录页 | `f:\个人文件\新安全看板\安全管理系统\src\views\Login.vue` |
| 前端 Store | `f:\个人文件\新安全看板\安全管理系统\src\stores\index.ts` |
| 前端路由 | `f:\个人文件\新安全看板\安全管理系统\src\router\index.ts` |
| 权威 DDL | `f:\个人文件\新安全看板\sql\unified_schema.sql` |
| 后端路由目录 | `f:\个人文件\新安全看板\server\routes\` |
