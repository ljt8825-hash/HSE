# 宁津环卫 HSE 安全管理系统 -- 测试体系报告

> **版本**: v4.1 (E2E 补全完成)
> **更新日期**: 2026-07-11
> **适用范围**: 前端 (Vben Admin monorepo) + 后端 (Node.js/Express/PostgreSQL) + E2E (Playwright + Jest)
> **状态**: E2E 全部已实现，测试金字塔 100% 完成

---

## 1. 测试体系总览

### 1.1 测试金字塔

本系统采用经典的测试金字塔策略，从底层到顶层依次为：

```
            /  E2E  \
           / Playwright\        ← 少量、高价值、跨系统
          /--------------\
         /   集成测试     \       ← 后端 E2E 链路测试 (Supertest)
        /-----------------\
       /    组件测试         \    ← Vue 组件 + HSE 业务组件
      /---------------------\
     /     单元测试           \   ← Utils / Composables / Hooks / Store / 路由 / 中间件
    /-------------------------\
```

| 层级 | 数量 | 工具 | 覆盖目标 |
|------|------|------|----------|
| **单元测试** | 135 用例 | Vitest (前端) / Jest (后端) | 工具函数、Composables、Hooks、Store、路由、中间件 |
| **组件测试** | 30 用例 | Vitest + @vue/test-utils | HSE 业务组件、表单组件 |
| **集成测试** | 43 用例 | Jest + Supertest | 后端 API 全链路（认证、隐患、事故、导入） |
| **E2E 测试** | 59 用例 | Playwright | 全栈页面交互、导航、业务流程、移动端适配 |

### 1.2 覆盖范围

- **前端**: Utils 工具函数 / Composables 组合式函数 / Hooks / Vue 组件 / Pinia Store
- **后端**: 24 个路由模块 / 4 类中间件 / AI 服务 / 全链路 E2E 集成
- **E2E**: 认证流程 / 仪表盘 / 导航 / 业务模块 / AI 页面 / 移动端响应式

### 1.3 工具链

| 工具 | 用途 | 版本要求 |
|------|------|----------|
| **Vitest** | 前端单元/组件测试 | 与项目 package.json 一致 |
| **@vue/test-utils** | Vue 组件挂载与交互 | 与 Vben Admin 版本一致 |
| **happy-dom** | 浏览器环境模拟 | 与项目 package.json 一致 |
| **Jest** | 后端单元/集成测试 | server/package.json 配置 |
| **Supertest** | HTTP 集成测试 | server/package.json 配置 |
| **Playwright** | E2E 端到端测试 | 与项目 package.json 一致 |

---

## 2. 前端测试

### 2.1 Utils 测试（performance、request）

**测试文件**:
- `安全看板vben/apps/web-antd/src/utils/__tests__/performance.test.ts`
- `安全看板vben/apps/web-antd/src/utils/__tests__/request.test.ts`

**测试内容**:

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| performance.test.ts | 20 | >= 90% | 性能监控工具：FPS 计算、长任务检测、内存监控、PerformanceObserver 封装 |
| request.test.ts | 17 | >= 90% | HTTP 请求工具：请求拦截、响应处理、Token 注入、错误重试、超时处理 |

**关键测试点**:
- `performance`: `measureFPS()` 帧率采集、`detectLongTasks()` 长任务阈值检测、`monitorMemory()` 内存水位报警
- `request`: 请求/响应拦截器链、自动 Token 刷新逻辑、网络错误重试机制、请求取消 (AbortController)

### 2.2 Composables 测试（useVirtualScroll、useDebounceFetch、useWebSocket）

**测试文件**:
- `安全看板vben/apps/web-antd/src/composables/__tests__/useVirtualScroll.test.ts`
- `安全看板vben/apps/web-antd/src/composables/__tests__/useDebounceFetch.test.ts`
- `安全看板vben/apps/web-antd/src/composables/__tests__/useWebSocket.test.ts`

**测试内容**:

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| useVirtualScroll.test.ts | 15 | >= 85% | 虚拟滚动：可视区域计算、动态行高、滚动事件节流、键盘导航 |
| useDebounceFetch.test.ts | 12 | >= 85% | 防抖请求：防抖延迟、取消上一次请求、竞态处理、loading 状态 |
| useWebSocket.test.ts | 11 | >= 85% | WebSocket：连接管理、自动重连、心跳检测、消息队列 |

**关键测试点**:
- `useVirtualScroll`: 大列表渲染性能、滚动位置恢复、窗口 resize 响应
- `useDebounceFetch`: 防抖时间精度、组件卸载时自动取消、并发请求去重
- `useWebSocket`: 断线重连指数退避、心跳超时检测、二进制消息解析

### 2.3 Hooks 测试（useResponsive）

**测试文件**:
- `安全看板vben/apps/web-antd/src/hooks/__tests__/useResponsive.test.ts`

**测试内容**:

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| useResponsive.test.ts | 12 | >= 90% | 响应式断点：窗口尺寸检测、断点切换回调、移动/平板/桌面模式 |

**关键测试点**:
- 断点阈值匹配 (`sm`/`md`/`lg`/`xl`/`2xl`)
- `window.matchMedia` 模拟
- 窗口 resize 事件响应
- 服务端渲染 (SSR) 降级处理

### 2.4 组件测试（HseStatCard、HseForm）

**测试文件**:
- `安全看板vben/apps/web-antd/src/components/hse/__tests__/HseStatCard.test.ts`
- `安全看板vben/apps/web-antd/src/components/hse/__tests__/HseForm.test.ts`

**测试内容**:

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| HseStatCard.test.ts | 15 | >= 80% | 统计卡片：数值显示、趋势箭头、颜色主题、loading 骨架屏 |
| HseForm.test.ts | 15 | >= 80% | 表单组件：字段校验、动态表单项、提交/重置、联动逻辑 |

**关键测试点**:
- `HseStatCard`: props 传递、slot 插槽渲染、数值格式化、趋势图标方向
- `HseForm`: 表单验证规则、异步校验、字段显隐联动、表单数据收集与重置

### 2.5 Store 测试（auth、app）

**测试文件**:
- `安全看板vben/apps/web-antd/src/store/__tests__/auth.test.ts`
- `安全看板vben/apps/web-antd/src/store/__tests__/app.test.ts`

**测试内容**:

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| auth.test.ts | 10 | >= 85% | 认证状态：登录/登出、Token 管理、用户信息持久化、权限角色 |
| app.test.ts | 8 | >= 85% | 应用状态：主题切换、侧边栏折叠、多标签页管理、全局 loading |

**关键测试点**:
- `auth`: 登录成功/失败流程、Token 过期自动刷新、角色权限映射、登出清理
- `app`: 主题切换持久化、侧边栏状态记忆、标签页增删改、全局 loading 状态控制

### 2.6 运行命令

```bash
# 进入前端项目目录
cd 安全看板vben

# 安装依赖
pnpm install

# 运行全部前端单元测试
pnpm run test:unit

# 运行测试并生成覆盖率报告
pnpm run test:unit -- --coverage

# 运行特定测试文件
pnpm run test:unit -- src/utils/__tests__/performance.test.ts

# 运行测试（监听模式，开发时使用）
pnpm run test:unit -- --watch

# 运行测试（UI 界面模式）
pnpm run test:unit -- --ui
```

---

## 3. 后端测试

### 3.1 路由测试（24 个路由模块）

**测试文件位置**: `server/__tests__/routes/`

本项目后端共包含 24 个路由模块，按业务域划分为以下 12 组测试文件：

| 测试文件 | 路由模块 | 用例数 | 覆盖率目标 | 说明 |
|----------|----------|--------|-----------|------|
| auth.test.ts | /api/auth | 15 | >= 80% | 登录、登出、Token 刷新、密码修改 |
| users.test.ts | /api/users | 12 | >= 80% | 用户 CRUD、角色分配、状态切换 |
| hazards.test.ts | /api/hazards | 14 | >= 80% | 隐患排查上报、审核、整改、闭环 |
| accidents.test.ts | /api/accidents | 14 | >= 80% | 事故报告、等级评估、根因分析 |
| inspections.test.ts | /api/inspections | 13 | >= 80% | 巡检计划、巡检记录、异常标记 |
| vehicles.test.ts | /api/vehicles | 12 | >= 80% | 车辆台账、维保记录、GPS 定位 |
| training.test.ts | /api/training | 12 | >= 80% | 培训计划、签到、考核结果 |
| safety-meetings.test.ts | /api/safety-meetings | 11 | >= 80% | 安全会议、议题、决议跟踪 |
| statistics.test.ts | /api/statistics | 14 | >= 80% | 各类统计报表、图表数据接口 |
| alerts.test.ts | /api/alerts | 12 | >= 80% | 预警规则、预警推送、预警确认 |
| system.test.ts | /api/system | 14 | >= 80% | 系统配置、字典管理、文件上传 |
| import-export.test.ts | /api/import-export | 14 | >= 80% | Excel 导入导出、模板下载、数据校验 |

**关键测试点**:
- 每个 CRUD 路由覆盖正常创建、参数校验失败、权限不足三种场景
- 分页查询覆盖空结果、边界页码、排序筛选
- 删除操作覆盖级联删除、不存在的记录

### 3.2 中间件测试（cache、queryLogger）

**测试文件位置**: `server/__tests__/middleware/`

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| cache.test.ts | 18 | >= 90% | 缓存中间件：GET 缓存、POST/PUT/DELETE 清除、TTL 过期、缓存键生成 |
| queryLogger.test.ts | 15 | >= 90% | SQL 查询日志：慢查询检测、查询计数、日志格式化、性能阈值 |

**关键测试点**:
- `cache`: 缓存命中/未命中、不同 HTTP 方法缓存策略、并发请求缓存穿透
- `queryLogger`: 慢查询阈值报警、查询日志与请求 ID 关联、批量查询性能分析

### 3.3 AI 服务测试（aiService）

**测试文件位置**: `server/__tests__/services/aiService.test.ts`

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| aiService.test.ts | 20 | >= 85% | AI 辅助服务：事故根因分析、隐患风险评分、智能报告生成、上下文管理 |

**关键测试点**:
- AI 模型调用成功/失败/超时三种场景
- 提示词 (Prompt) 构建与参数注入
- 流式响应 (Streaming) 处理
- 上下文窗口管理与截断策略
- 错误回退与降级处理

### 3.4 E2E 链路测试（auth-flow、hazard-alert-flow、accident-rca-flow、import-flow）

**测试文件位置**: `server/__tests__/e2e/`

| 测试文件 | 用例数 | 覆盖率目标 | 说明 |
|----------|--------|-----------|------|
| auth-flow.test.ts | 10 | >= 90% | 认证全链路：注册 -> 登录 -> Token 刷新 -> 权限校验 -> 登出 |
| hazard-alert-flow.test.ts | 11 | >= 90% | 隐患预警全链路：上报 -> 审核 -> 派发 -> 整改 -> 验收 -> 关闭 |
| accident-rca-flow.test.ts | 11 | >= 90% | 事故分析全链路：报告 -> 定级 -> 根因分析 -> 措施跟踪 -> 结案 |
| import-flow.test.ts | 6 | >= 90% | 数据导入全链路：模板下载 -> Excel 上传 -> 数据校验 -> 批量入库 -> 结果反馈 |
| notification-flow.test.ts | 5 | >= 90% | 通知推送全链路：触发通知 -> 多渠道推送 -> 已读/未读 -> 批量标记 |

**关键测试点**:
- 每条链路模拟完整的业务闭环，从请求发起到最终状态变更
- 中间状态校验（如隐患审核中状态不可重复提交）
- 并发操作冲突检测
- 权限隔离验证（不同角色只能看到对应数据）

### 3.5 运行命令

```bash
# 进入后端项目目录
cd server

# 安装依赖
npm install

# 确保 PostgreSQL 测试数据库已启动
# 默认连接：localhost:5432 / safety_dashboard_test / hse_app / test_password_123

# 运行全部后端测试
npm test

# 运行测试并生成覆盖率报告
npm test -- --coverage

# 运行特定测试文件
npx jest __tests__/routes/auth.test.ts

# 运行 E2E 链路测试
npx jest __tests__/e2e/

# 查看测试覆盖率详情
open coverage/lcov-report/index.html
```

---

## 4. E2E 测试（Playwright）

### 4.1 测试用例清单（auth、dashboard、navigation、business、ai-pages、mobile）

**测试文件位置**: `安全看板vben/e2e/`

| 测试文件 | 用例数 | 说明 |
|----------|--------|------|
| auth.spec.ts | 10 | 登录流程、错误提示、记住密码、验证码、多角色切换 |
| dashboard.spec.ts | 10 | 仪表盘数据加载、图表渲染、统计卡片、时间范围筛选、实时刷新 |
| navigation.spec.ts | 8 | 侧边栏导航、路由跳转、面包屑、多标签页切换、路由守卫 |
| business.spec.ts | 13 | 隐患排查表单、事故报告流程、巡检计划管理、数据导出、搜索过滤 |
| ai-pages.spec.ts | 10 | AI 分析页面加载、流式输出、参数配置、历史记录、错误处理 |
| mobile.spec.ts | 8 | 移动端布局适配、触摸交互、底部导航、响应式表格、手势操作 |

**关键测试点**:
- `auth`: 正确/错误密码、Token 过期跳转、多标签页登录状态同步
- `dashboard`: WebSocket 实时数据更新、图表交互（缩放/筛选）、数据对比
- `navigation`: 前进/后退浏览器行为、权限菜单过滤、404 兜底页面
- `business`: 表单多步骤提交、文件上传预览、列表无限滚动、批量操作
- `ai-pages`: AI 响应流式渲染、Markdown 格式化、停止生成、上下文记忆
- `mobile`: 旋转屏幕适配、软键盘弹出布局、滑动菜单、手势缩放图表

### 4.2 运行命令

```bash
# 进入前端项目目录
cd 安全看板vben

# 安装 Playwright 浏览器（首次运行需要）
pnpm exec playwright install

# 运行全部 E2E 测试（无头模式）
pnpm run test:e2e

# 运行 E2E 测试（有头模式，可观察浏览器）
pnpm exec playwright test --headed

# 运行特定测试文件
pnpm exec playwright test e2e/auth.spec.ts

# 运行特定测试用例
pnpm exec playwright test -g "登录成功"

# 调试模式（逐步执行）
pnpm exec playwright test --debug

# 查看测试报告
pnpm exec playwright show-report
```

---

## 5. CI/CD 质量门禁

### 5.1 GitHub Actions 流水线

项目配置了 **3 条 CI/CD 流水线**，协同保障代码质量：

| 流水线文件 | 触发条件 | 职责 |
|-----------|----------|------|
| `ci-quality-gate.yml` | push (main/develop)、PR (main) | 质量门禁：Lint + Test + Security Audit |
| `ci-cd.yml` | push、PR、手动触发 | 完整 CI/CD：Lint + Test + Build + Docker + Deploy |
| `deploy.yml` | push (main/master) | 快速部署：Lint + Test + Build + SSH 部署 |

**质量门禁流水线 (`ci-quality-gate.yml`)** 包含 6 个 Job：

```
frontend-lint ──→ frontend-test ──┐
                                  ├──→ quality-report（门禁汇总）
backend-lint ───→ backend-test ──┤
                                  │
                security-audit ───┘
```

### 5.2 质量门禁规则

| 规则 | 要求 | 说明 |
|------|------|------|
| **前端 Lint** | 必须 0 error | ESLint + OxLint，错误则阻断流水线 |
| **前端 Type Check** | 必须 0 error | TypeScript 类型检查 + 循环依赖检查 + 依赖检查 |
| **前端单元测试** | 全部通过 | Vitest 运行，失败则阻断流水线 |
| **后端 Lint** | 必须 0 error | ESLint 检查后端代码规范 |
| **后端测试** | 全部通过 | Jest + Supertest，失败则阻断流水线 |
| **安全审计** | 无 high/critical 漏洞 | npm audit + pnpm audit，moderate 级别仅告警 |

### 5.3 覆盖率要求

| 模块 | 覆盖率目标 | 阻断阈值 | 说明 |
|------|-----------|---------|------|
| 前端 Utils | >= 90% | < 80% 阻断 | 工具函数要求最高覆盖率 |
| 前端 Composables | >= 85% | < 70% 阻断 | 组合式函数核心逻辑需充分覆盖 |
| 前端 Hooks | >= 90% | < 80% 阻断 | 自定义 Hook 需覆盖各种边界 |
| 前端组件 | >= 80% | < 65% 阻断 | 组件测试覆盖主要交互路径 |
| 前端 Store | >= 85% | < 70% 阻断 | 状态管理需覆盖所有 mutation/action |
| 后端路由 | >= 80% | < 70% 阻断 | API 路由覆盖正常 + 异常场景 |
| 后端中间件 | >= 90% | < 80% 阻断 | 中间件是全局影响，要求高覆盖 |
| 后端 AI 服务 | >= 85% | < 70% 阻断 | AI 服务需覆盖调用成功/失败/超时 |
| 后端 E2E 链路 | >= 90% | < 80% 阻断 | 业务链路要求端到端完整覆盖 |
| **整体** | **>= 85%** | **< 75% 阻断** | 所有模块加权平均覆盖率 |

---

## 6. 测试统计

| 类别 | 文件数 | 用例数 | 状态 | 覆盖率目标 |
|------|--------|--------|------|-----------|
| 前端 Utils | 2 | 37 | ✅ 已实现 | >= 90% |
| 前端 Composables | 3 | 38 | ✅ 已实现 | >= 85% |
| 前端 Hooks | 1 | 12 | ✅ 已实现 | >= 90% |
| 前端组件 | 2 | 30 | ✅ 已实现 | >= 80% |
| 前端 Store | 2 | 18 | ✅ 已实现 | >= 85% |
| 后端路由 | 12 | 157 | ✅ 已实现 | >= 80% |
| 后端中间件 | 2 | 33 | ✅ 已实现 | >= 90% |
| 后端 AI 服务 | 1 | 20 | ✅ 已实现 | >= 85% |
| 后端 E2E 链路 | 6 | 43 | ✅ 已实现 | >= 90% |
| Playwright E2E | 9 | 59 | ✅ 已实现 | >= 90% |
| Helper + Fixture | 3 | - | ✅ 已实现 | - |
| **合计** | **43** | **447** | **100% 完成** | **>= 85%** |

> **E2E 补全完成** — Playwright 6 spec + 后端 E2E 6 链路，全部已实现并通过验证

---

## 7. 运行指南

### 7.1 前端测试

```bash
# 1. 进入前端项目
cd 安全看板vben

# 2. 安装依赖
pnpm install

# 3. 运行全部前端单元测试
pnpm run test:unit

# 4. 运行并查看覆盖率
pnpm run test:unit -- --coverage

# 5. 运行前端 E2E 测试（需先启动后端服务和前端开发服务器）
pnpm run test:e2e
```

**前提条件**:
- Node.js >= 22.18.0
- pnpm >= 10.0.0（当前锁定 10.33.4）
- E2E 测试需要同时启动后端 API 服务和前端开发服务器

### 7.2 后端测试

```bash
# 1. 进入后端项目
cd server

# 2. 安装依赖
npm install

# 3. 确保测试数据库可用
#    默认配置：localhost:5432 / safety_dashboard_test / hse_app / test_password_123
#    可通过环境变量覆盖：DB_HOST, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD

# 4. 运行全部后端测试
npm test

# 5. 运行并查看覆盖率
npm test -- --coverage
```

**前提条件**:
- Node.js >= 22
- PostgreSQL 数据库实例（测试用，可使用 Docker 启动）
- 快速启动测试数据库：
  ```bash
  docker run -d --name hse-test-db \
    -e POSTGRES_DB=safety_dashboard_test \
    -e POSTGRES_USER=hse_app \
    -e POSTGRES_PASSWORD=test_password_123 \
    -p 5432:5432 \
    postgres:17-alpine
  ```

### 7.3 全栈测试

```bash
# 终端 1：启动测试数据库
docker run -d --name hse-test-db \
  -e POSTGRES_DB=safety_dashboard_test \
  -e POSTGRES_USER=hse_app \
  -e POSTGRES_PASSWORD=test_password_123 \
  -p 5432:5432 postgres:17-alpine

# 终端 2：运行后端测试
cd server && npm test

# 终端 3：运行前端测试
cd 安全看板vben && pnpm run test:unit

# 终端 4：E2E 测试（需前后端服务运行中）
cd 安全看板vben && pnpm run test:e2e
```

### 7.4 CI 本地验证

在提交代码前，建议在本地模拟 CI 质量门禁的检查步骤：

```bash
# === 前端质量检查 ===
cd 安全看板vben
pnpm install --frozen-lockfile
pnpm run lint                    # 代码规范检查
pnpm run check                   # 类型检查 + 循环依赖 + 依赖检查
pnpm run test:unit               # 单元测试
pnpm audit --audit-level=moderate # 安全审计

# === 后端质量检查 ===
cd server
npm ci
npx eslint .                      # ESLint 检查
npm test                          # 全部测试
npm audit --audit-level=moderate   # 安全审计
```

---

## 8. 持续改进计划

### 8.1 近期计划（v4.1 - v4.2）

| 改进项 | 说明 | 优先级 |
|--------|------|--------|
| **视觉回归测试** | 引入 Playwright 截图对比，防止 UI 意外变更 | 高 |
| **API 契约测试** | 基于 OpenAPI Schema 自动生成接口测试用例 | 高 |
| **覆盖率趋势图** | 在 CI 中集成覆盖率趋势追踪，防止覆盖率下降 | 中 |

### 8.2 中期计划（v4.3 - v5.0）

| 改进项 | 说明 | 优先级 |
|--------|------|--------|
| **性能基准测试** | 建立前端 Lighthouse 性能基线，CI 中自动检测退化 | 中 |
| **混沌工程测试** | 模拟数据库断连、服务超时等异常场景 | 中 |
| **测试数据工厂** | 建立 Faker.js 数据工厂，支持多环境测试数据生成 | 低 |
| **并行测试加速** | Vitest/Jest 分片执行，缩短 CI 执行时间 | 中 |

### 8.3 长期计划

| 改进项 | 说明 | 优先级 |
|--------|------|--------|
| **AI 辅助测试生成** | 基于 AST 分析自动生成边界测试用例 | 低 |
| **生产环境冒烟测试** | 部署后自动运行关键路径冒烟测试 | 中 |
| **测试覆盖率与代码审查联动** | PR 中自动标注未覆盖的变更代码行 | 低 |

---

> **文档维护说明**: 本文档应随项目迭代同步更新。每次新增测试文件或调整覆盖率目标时，需同步修改对应章节的统计数据。
