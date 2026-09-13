# 预警域三层化拆分完成（warning-center，Phase B 第 5 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-warning-center.js`（原 2138 行巨无霸，桌面看板「智能预警与整改闭环中心」核心）三层化拆分完成：父路由收敛为 **16 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变，smoke 全绿。本单是 Phase B 中唯一携带**定时任务副作用**的文件（每日 2 点预警扫描 + 每小时升级检查），cron 注册随 service 模块加载执行，测试环境不启动。

## 拆分范围与本层职责
| 文件 | 职责 |
|------|------|
| `routes/hse-warning-center.js` | 纯聚合入口（挂载 `./hse-warning-center/main`，16 行） |
| `routes/hse-warning-center/main.js` | 纯绑定子路由（按原注册顺序绑定 28 端点 + `requireRole` 中间件留绑定层，52 行） |
| `controllers/warningCenterController.js` | 薄 handler + `respond()`（统一解释 `__t:'json'` 描述符 → 成功/错误 + 动态 HTTP 状态码，159 行） |
| `services/warningCenterService.js` | 全部业务 + SQL + 定时任务注册（预警扫描/升级看护，1867 行） |

## 端点覆盖（6 组，28 条可测端点）
`/warnings`（list/stats/detail/scan/escalate）、`/tasks`（list/detail/create/dispatch/process/submit-proof/review/close/evaluate/evaluation）、`/analysis`、`/rules`（list/detail/create/update/toggle/versions）、`/evaluations/stats`、`/schedulers`（list/create/update/toggle/execute）。

## 关键技术决策与本单特殊处理
1. **定时任务副作用随 service 模块加载注册**：原文件中 `cron.schedule`（每日 2 点预警扫描 + 每小时升级检查）属模块加载副作用，迁移至 `warningCenterService.js` 顶层注册。为避免 Jest 冒烟资源泄漏，`process.env.NODE_ENV !== 'test'` 时启动定时器，测试/冒烟环境不创建定时任务。
2. **统一描述符响应机制**：service 层所有入口返回 `__t:'json'` 描述符（含 error.code/error.message/httpStatus 与成功 payload/message），由 controller 的 `respond()` 统一解释——`error.httpStatus` 存在则按其设 `res.status`，否则普通 200 JSON，与原文响应语义一致。
3. **`/rules/versions` 影子顺序保留**：`/rules/:id` 注册在 `/rules/versions` 之前，`GET /rules/versions` 会命中 `:id`（id='versions'）。本单严格保留原注册顺序，行为与原文逐字节等价（实测仍返回 500 的“非数字 id”语义，非本次新增回归）。
4. **权限中间件留在绑定层**：`requireRole('admin','safety_manager')` 仅作用于规则创建/更新/切换与调度器系列，统一保留在 `main.js`，controller/service 不感知鉴权。
5. **无内存单例转发需求**：原文件仅导出 router（无外部依赖其内存单例），父聚合保持最简，不额外转发。

## 行为等价验证（本人复核）
- smoke `_smoke_warning_center.cjs` 全绿：
  - **28 端点可达性非 404 全过**（公开 GET 实际执行、受保护端点打到中间件层）；
  - 公开 GET 响应形状检查全过（warnings/warnings-stats/tasks/analysis/rules/schedulers 无 ReferenceError）；
  - 用不存在 id（`-9999999`）验证 `PUT /tasks/:id/process`、`PUT /tasks/:id/submit-proof` 命中 0 行、**无真实写库**；
  - 14 个受保护端点未登录 → 401（不触库）正确；
  - 设计的 404 对照组（不存在路径）仍 404 正常；
- 4 源文件 `node --check` 全过。

## 交付与收尾
- 提交：`refactor(hse-warning-center): ...` + `docs(191副): ...`（本单，待推送远端）

## 遗留与下一步
- 本单收口后，Phase B 剩余仍需拆分的大文件（按体积）：`hse-analysis-center.js(74KB)`、`hse-employee-import-v2.js(73KB)`、`hse-assessment.js(67KB)`、`risk-control.js(66KB)`、`hazards.js(60KB)`、`violations.js(59KB)` 等。