# UI 架构迁移日志 — 从自定义 Element Plus 到 vue-vben-admin v5.7.0

> **迁移日期**：2026-07-10
> **迁移版本**：v3.0.0
> **原架构**：自定义 Element Plus 架构（`src/`）
> **新架构**：vue-vben-admin v5.7.0（`安全看板vben/apps/web-ele/`）
> **后端**：完全不变（Express + PostgreSQL）

---

## 一、迁移背景与决策

### 迁移原因

1. **长期维护成本**：自定义 Element Plus 架构虽然完整，但所有基础设施（Layout、权限、主题、标签页等）都需要自行维护
2. **组件丰富度**：vben-admin 内置大量业务组件（VbenForm、VbenTable、VbenModal 等），可大幅提升开发效率
3. **社区生态**：vben-admin 有活跃的社区和持续更新，问题可快速解决
4. **架构规范**：vben-admin 有严格的代码规范、目录结构和最佳实践

### 迁移策略

**渐进式迁移**：
- 第一阶段（当前）：迁移核心模块（权限、Dashboard、工作流、通知中心）
- 第二阶段（v3.1）：迁移剩余业务模块（用户管理、告警中心、审计日志等）
- 第三阶段（v3.5）：完全移除旧架构代码

**双轨运行**：
- 旧架构（`src/`）保留作为降级方案
- 新架构（`安全看板vben/`）逐步完善
- 后端 API 完全不变，前后端解耦

---

## 二、架构对比

| 维度 | 旧架构（自定义） | 新架构（vben-admin v5.7.0） |
|------|------------------|---------------------------|
| **项目结构** | 单包（Single Package） | Monorepo（pnpm + turbo + workspace） |
| **包管理器** | npm | pnpm >= 10.0.0 |
| **Node 要求** | >= 20.0.0 | ^22.18.0 \|\| ^24.0.0 |
| **别名** | `@/` | `#/` |
| **Layout** | 自研（5个组件） | `@vben/layouts`（功能完整） |
| **权限系统** | 自研（RBAC + 动态菜单） | `@vben/access` + `@vben/stores/access` |
| **请求库** | Axios 自定义封装 | `@vben/request`（Axios 底层 + 拦截器链） |
| **状态管理** | Pinia（直接使用） | `@vben/stores`（模块化 + 持久化） |
| **主题系统** | CSS 变量 + Element Plus 暗黑模式 | `@vben/preferences`（完整主题系统） |
| **国际化** | Vue I18n（自定义配置） | `@vben/locales`（完整 i18n 体系） |
| **表单** | Element Plus 原生 | VbenForm（JSON 配置化表单） |
| **表格** | Element Plus 原生 | VbenTable（配置化表格 + 虚拟滚动） |
| **标签页** | 自研 | `@vben/stores/tabbar` |
| **代码规范** | ESLint + Prettier | ESLint + Stylelint + Oxlint + Commitlint + Lefthook |

---

## 三、已完成迁移内容

### 3.1 基础架构

| 项目 | 位置 | 状态 |
|------|------|------|
| 环境配置 | `apps/web-ele/.env.development` / `.env.production` | ✅ 已配置 |
| 应用偏好设置 | `apps/web-ele/src/preferences.ts` | ✅ 已配置 |
| API 基础路径 | 指向 `http://localhost:3000/api`（开发）/ `/api`（生产） | ✅ 已配置 |
| WebSocket 配置 | `VITE_WS_BASE_URL` | ✅ 已配置 |
| 多租户配置 | `VITE_MULTI_TENANT_ENABLED` | ✅ 已配置 |
| Sentry DSN | `VITE_SENTRY_DSN` | ✅ 预留配置项 |

### 3.2 API 层

| 模块 | 文件 | 状态 |
|------|------|------|
| 认证 API | `apps/web-ele/src/api/hse/auth.ts` | ✅ 已迁移 |
| Dashboard API | `apps/web-ele/src/api/hse/dashboard.ts` | ✅ 已迁移 |
| 通知 API | `apps/web-ele/src/api/hse/notification.ts` | ✅ 已迁移 |
| 工作流 API | `apps/web-ele/src/api/hse/workflow.ts` | ✅ 已迁移 |
| 统一导出 | `apps/web-ele/src/api/hse/index.ts` | ✅ 已创建 |

**API 适配说明**：
- 后端 API 格式 `{ code: 0, data: {...}, message: '...' }` 与 vben `RequestClient` 兼容
- vben 的 `defaultResponseInterceptor` 配置 `codeField: 'code'`, `successCode: 0` 已匹配
- 请求拦截器自动携带 `Authorization: Bearer {token}`
- Token 过期自动处理（重定向登录 / 刷新 Token）

### 3.3 权限系统

| 模块 | 文件 | 状态 |
|------|------|------|
| auth store | `apps/web-ele/src/store/auth.ts` | ✅ 已适配 |
| 登录接口 | 对接 `hseLoginApi` | ✅ 已适配 |
| 用户信息 | 对接 `hseGetUserInfoApi` | ✅ 已适配 |
| 权限码 | 对接 `hseGetAccessCodesApi` | ✅ 已适配 |
| 登出接口 | 对接 `hseLogoutApi` | ✅ 已适配 |
| 路由守卫 | `apps/web-ele/src/router/guard.ts` | ✅ 复用 vben 体系 |
| 权限指令 | `v-access`（vben 内置） | ✅ 复用 vben 体系 |

### 3.4 核心页面

| 页面 | 文件 | 状态 |
|------|------|------|
| Dashboard 数据概览 | `apps/web-ele/src/views/hse/dashboard/index.vue` | ✅ 已迁移 |
| 通知中心 | `apps/web-ele/src/views/hse/notification/index.vue` | ✅ 已迁移 |
| 工作流设计器 | `apps/web-ele/src/views/hse/workflow/designer.vue` | ✅ 已迁移 |
| 工作流设计器组件 | `apps/web-ele/src/views/hse/workflow/WorkflowDesigner.vue` | ✅ 已迁移 |

### 3.5 路由配置

| 模块 | 文件 | 状态 |
|------|------|------|
| HSE 路由模块 | `apps/web-ele/src/router/routes/modules/hse.ts` | ✅ 已创建 |
| 路由自动加载 | vben 自动扫描 `modules/**/*.ts` | ✅ 无需额外配置 |

### 3.6 依赖新增

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@logicflow/core` | ^2.0.0 | 流程设计器核心 |
| `@logicflow/extension` | ^2.0.0 | 流程设计器扩展 |

---

## 四、待迁移内容（后续版本）

### v3.1 版本（1-2 个月）

- [ ] 用户管理模块
- [ ] 角色管理模块
- [ ] 菜单管理模块
- [ ] 告警中心模块
- [ ] 审计日志模块
- [ ] 隐患排查模块
- [ ] 事故管理模块
- [ ] 培训教育模块
- [ ] 保险/人员/车辆/设备管理
- [ ] WebSocket 告警推送
- [ ] Sentry 错误监控

### v3.5 版本（3-4 个月）

- [ ] 完全移除旧架构代码
- [ ] 所有业务模块迁移完成
- [ ] 性能优化与调优
- [ ] 完整测试覆盖

---

## 五、关键技术点

### 5.1 路径别名

| 旧别名 | 新别名 | 说明 |
|--------|--------|------|
| `@/` | `#/` | 项目源码根目录 |

替换规则：所有 `@/xxx` 替换为 `#/xxx`

### 5.2 API 调用

**旧写法（Axios client）**：
```typescript
import { client } from '@/api/client'

const result = await client.get<UserInfo>('/auth/current-user')
```

**新写法（vben RequestClient）**：
```typescript
import { requestClient } from '#/api/request'

const result = await requestClient.get<UserInfo>('/auth/current-user')
```

### 5.3 Store 使用

**旧写法**：
```typescript
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
```

**新写法**：
```typescript
// 应用级 Store（auth / user 等）
import { useAuthStore } from '#/store'
// vben 内置 Store（access / user / tabbar 等）
import { useAccessStore, useUserStore } from '@vben/stores'
```

### 5.4 权限控制

**旧写法（v-permission 指令）**：
```vue
<button v-permission="'user:create'">创建用户</button>
```

**新写法（v-access 指令）**：
```vue
<button v-access="'user:create'">创建用户</button>
```

---

## 六、运行方式

### 环境要求

- Node.js ^22.18.0 || ^24.0.0
- pnpm >= 10.0.0

### 安装依赖

```bash
cd 安全看板vben
pnpm install
```

### 启动开发服务器

```bash
# 方式一（推荐，从根目录）
cd 安全看板vben
pnpm dev:ele

# 方式二（从应用目录）
cd 安全看板vben/apps/web-ele
pnpm dev
```

### 生产构建

```bash
cd 安全看板vben
pnpm build:ele
```

### 访问地址

- 开发环境：http://localhost:5173
- 后端 API：http://localhost:3000/api
- WebSocket：ws://localhost:3000/ws

---

## 七、后端兼容性

**后端完全不变**，所有 API 接口保持原样：

| 后端模块 | 兼容性 | 说明 |
|----------|:------:|------|
| 认证 API（/api/auth/*） | ✅ | 完全兼容 |
| 用户 API（/api/users/*） | ✅ | 完全兼容 |
| 角色 API（/api/roles/*） | ✅ | 完全兼容 |
| 菜单 API（/api/menus/*） | ✅ | 完全兼容 |
| Dashboard API（/api/dashboard/*） | ✅ | 完全兼容 |
| 告警 API（/api/alerts/*） | ✅ | 完全兼容 |
| 工作流 API（/api/workflow/*） | ✅ | 完全兼容 |
| 通知 API（/api/notifications/*） | ✅ | 完全兼容 |
| WebSocket（/ws） | ✅ | 完全兼容 |

---

## 八、风险与注意事项

### 8.1 Node 版本要求

vben-admin v5.7.0 要求 Node.js ^22.18.0 || ^24.0.0，而旧架构使用 Node 20。如需本地开发，需升级 Node 版本。

### 8.2 包管理器

必须使用 pnpm >= 10.0.0，不能使用 npm 或 yarn。

### 8.3 Monorepo 复杂度

vben-admin 是大型 monorepo，包含多个应用和包。初期可能需要时间熟悉结构。

### 8.4 旧架构保留

旧架构（`src/`）完整保留，可随时回退或对照参考。

---

## 九、迁移总结

| 指标 | 数据 |
|------|------|
| 迁移开始日期 | 2026-07-10 |
| v3.0 交付日期 | 2026-07-10 |
| 当前迁移阶段 | **第一阶段完成（核心模块迁移 + v3.0 正式交付）** |
| 已迁移模块数 | 4 个（认证 / Dashboard / 通知 / 工作流） |
| 新增文件 | ~10 个 |
| 修改文件 | 5 个 |
| 后端变更 | 0（完全不变） |
| 旧架构状态 | 完整保留，标记 Legacy，v3.5 移除 |
| 主生产目录 | `安全看板vben/apps/web-ele/` |
| 预计剩余工作量 | 2-3 人月（全部迁移） |

### 9.1 v3.0 交付状态

✅ **v3.0 版本已正式交付**，前端主架构已切换为 vue-vben-admin v5.7.0：

- ✅ 核心模块（认证、Dashboard、工作流、通知中心）已迁移并可用
- ✅ 旧架构 `src/` 完整保留，标记为 Legacy，可随时回退
- ✅ 所有文档（README、项目总览、交付说明）已更新
- ✅ 生产构建配置就绪（`pnpm build:ele`）
- ✅ 后端 API 完全兼容，无需改动

### 9.2 后续版本计划

| 版本 | 内容 | 预计时间 |
|------|------|----------|
| v3.1 | 迁移用户/角色/菜单管理、告警中心 | v3.0 后 1 个月 |
| v3.2 | 迁移隐患排查、事故管理、培训教育 | v3.1 后 1 个月 |
| v3.3 | 迁移保险/人员/车辆/设备管理 | v3.2 后 1 个月 |
| v3.4 | WebSocket / Sentry / 性能优化 | v3.3 后 2 周 |
| v3.5 | 移除旧架构 `src/`，完全切换 | v3.4 后 2 周 |

---

**迁移负责人**：首席全栈架构师
**文档版本**：v2.0（v3.0 正式交付版）
**下次更新**：v3.1 版本迁移完成后
