# hse-tasks 单段 GET 被 `/:taskId` 遮蔽——原文件既有缺陷（未修待决策）

> 类别：④风险待办 · 日期：2026-09-13 · 归属对话：当前会话

## 现状
原 `routes/hse-tasks.js` 路由顺序：`GET /` → `GET /:taskId` → … → `GET /inspection` → `GET /pending` → `GET /overdue`。
后三条为**单段路径**，在 Express 中命中先注册的 `/:taskId`（taskId='inspection''pending''overdue'），其预期 handler（检查任务列表/待办/逾期）**从未被真正访问**。

## 根因（既有，非本轮引入）
`/:taskId` 详情 handler 的 `catch(err)` 块引用了 `{ taskId } = req.params`——而该声明位于 `try` 块内，**块作用域不可达 catch** → 一旦 DB 查询抛错（如对非数字 `taskId` 的 bigint 类型校验失败），catch 再抛 `ReferenceError: taskId is not defined` → async handler **未处理拒绝 → 无响应（请求挂起）**。

## 三层化后的处理
- **路由注册顺序严格保留**（保序保遮蔽），三条 GET 仍不可达其预期 handler，忠实复刻原语义。
- **行为收敛**：拆分版由 controller `run()` 归一返回**干净 HTTP 500**（`code=无效的类型 bigint 输入语法: "inspection"`），把原「进程内未处理拒绝/挂起」改为「可观测 500」。属修良性收敛，非功能回归。

## 待决策
1. 三条单段 GET 的预期业务能力（检查任务列表 / 待办 / 逾期）目前**形同虚设**。若要真正启用，需把 `/inspection`、`/pending`、`/overdue` 等静态路由**注册到 `/:taskId` 之前**（或将 `/:taskId` 约束为正则数字 `/^[0-9]+$/`）。
2. 因处于审计冻结期，本轮**不改路由语义**；是否后续修复需单独决策与放行。
3. 相关 API 前端是否依赖这些端点？若无人调用，可考虑下线并同步前端，避免误导。

## 备注
- 复现证据：`_compare_hse_tasks.cjs` 初次对比三条端点时，原文件 `__orig_hse-tasks.js:112` 抛 `ReferenceError: taskId is not defined`（未处理拒绝）。
- 交付报告见 `②交付报告/2026-09-13_任务中心域hse-tasks三层化拆分完成.md`。