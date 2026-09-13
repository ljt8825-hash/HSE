# 隐患整改闭环域三层化拆分完成（hazard-rectification，Phase B 第 16 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-hazard-rectification.js`（原 892 行，隐患整改闭环中心：隐患确认、整改任务/措施/复查记录 CRUD、闭环统计、责任人查询、AI 整改建议）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三绿：**语法 0 错误、冒烟 100% 通过、新旧对比 9+9+1 全部 IDENTICAL/双 401/双 404**。本单未发现需单独立档的既有故障。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-hazard-rectification.js` | 纯聚合入口（挂载 `./hse-hazard-rectification/main`，7 行） |
| `routes/hse-hazard-rectification/main.js` | 纯绑定子路由（18 端点 + 写端点 requireRole 鉴权） |
| `controllers/hazardRectificationController.js` | 薄 handler + `respond()`（json 描述符）+ 统一 `run()` 兜底（约 90 行） |
| `services/hazardRectificationService.js` | 全部业务+SQL+闭环统计+事件时效/超期通知+审计（约 640 行） |

## 端点覆盖（18 条，挂载 `/api/hse/hazard-rectification`）
| 端点 | 鉴权 | 说明 |
|------|------|------|
| `POST /confirm` | 写 | 确认隐患（hazard_record→confirmed） |
| `GET /tasks`、`GET /tasks/:id` | 读 | 任务列表/详情 |
| `POST/PUT/DELETE /tasks[/:id]` | 写 | 任务 CRUD + 事件时效（超期扣分/完成撤销）+ 超期通知 |
| `GET/POST /tasks/:taskId/actions`、`PUT/DELETE /actions/:id` | 写 | 措施 CRUD |
| `GET/POST /reviews[/:id]`、`DELETE /reviews/:id` | 写 | 复查 CRUD（事务 + pass/fail 关闭/回退隐患） |
| `GET /stats`、`GET /stats/overdue` | 读 | 闭环统计（闭环节率/部门/责任人/超期/临期） |
| `GET /responsible/:employeeId/tasks` | 读 | 责任人任务 |
| `POST /tasks/:id/ai-suggestions` | 读(公开) | 模拟 AI 建议 |

## 关键技术决策与本单特殊处理
1. **读公开 / 写受保护（半开放域）**：写端点 `requireRole('admin','safety_manager')`（**变参形式**）在路由层绑定；读端点无鉴权（"其他角色只读"），不重复绑定。与 standards（全公开）、roster-import（全保护）不同，属第三种形态。
2. **统一 `run()` 兜底（同 standards）**：核对原文件**全部 18 端点外层 catch 均 `res.json(error(-1, err.message))`（真实错误信息，非固定文案）**。故 service 遇 DB 异常抛错、controller `run()` 归一为 `error(-1, err.message)`；业务内「预期分支」（-1 未连接 / -2 不存在 / -3 参数）返回描述符。
3. **code 语义**：-3 参数/状态不可操作（如已关闭隐患不能建任务、复查结果非法）、-2 记录不存在、-1 未连接/兜底。controller 按描述符原样输出，恒 HTTP 200。
4. **service 内部 try/catch 逐字保留**：`createReview` 事务（内层 catch ROLLBACK 后 `throw e`，最外层由 `run()` 兜底）、`updateTask` 超期通知失败忽略、`createReview`/`createTask` 事件发布失败忽略——均与原文件逐字节一致。
5. **依赖解析修正**：`auditLog` 原通过 `./audit`（routes/audit.js）引入，service 层改为 `../routes/audit`（首次 require 报错后修正）。
6. **无内存降级数据**：原文件仅用 `isConnected()` 判断，DB 断开时返回空/stub 描述符，无 mem 存储；拆分版忠实保留。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_hazard_rectification.cjs`）：9 公开读端点可达+形状、9 写端点未登录全 401、12 组 service 描述符（缺失参数在写库前 return + 0-row no-op，**不触写库**）、404 —— **全部通过**。
- **新旧对比**（`_compare_hazard_rectification.cjs`，对照 git HEAD 原始版）：公开读 9 端点**逐字节 IDENTICAL**、写 9 端点**双 401 逐字节一致**、不存在路径**双 404** —— 全部一致。

## 约定
- 冒烟脚本 `_smoke_hazard_rectification.cjs` 与对比脚本 `_compare_hazard_rectification.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰生产表 / 端口 / WPS 边界；验证全部为只读 + 未登录 401 + 缺失参数 before-write return + 0-row no-op。