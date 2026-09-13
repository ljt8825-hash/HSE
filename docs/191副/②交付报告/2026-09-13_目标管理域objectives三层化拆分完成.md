# 目标管理域三层化拆分完成（objectives，Phase B 第 4 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/objectives.js`（原 2017 行巨无霸）三层化拆分完成：父路由收敛为 **13 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变，smoke 全绿，已推送远端。本单是 Phase B 中别名路由最密集的文件（`/org-personnel→/committees`、`/responsibility→/responsibilities`、`/safety-budget→/budgets` 三组重派发），且含「双影子 `/stats`」这一 Express 顺序依赖。

## 拆分范围与本层职责
| 文件 | 职责 |
|------|------|
| `routes/objectives.js` | 纯聚合入口（挂载 `./objectives/main`，13 行） |
| `routes/objectives/main.js` | 纯绑定子路由（含别名重派发 + `requireRole`/`uploadCommittee.single`/`uploadExcel.single` 中间件，约 170 行） |
| `controllers/objectiveController.js` | 薄 handler + `respond()`（支持 json/list/file/fileinfo/next 描述符，二进制与 PDF 流式在 controller 收敛） |
| `services/objectiveService.js` | 全部业务+SQL+内存降级（约 60 个函数，9 大数据域） |

## 端点覆盖（9 组，约 60 条）
`/rules`、`/employees/responsibility-*`（台账统计/状态/检索/录入/模板/导入/对账差异/详情/编辑/删除）、`/:bizType/:id/attachments`（通用附件 CRUD）、`/contracts`（CRUD+stats+export）、`/committees`（CRUD+stats+export）、`/responsibilities`（CRUD+stats）、`/budgets`（CRUD+stats+export）、`/monthly/stats`+`/stats/overview`+`/stats`（统计聚合）、`//:id`（safety_goals CRUD）、`/org-personnel`、`/responsibility`、`/safety-budget`（别名）、`/roster-departments`、`/committee-activities`（CRUD+import-pdf+template+import+file）。

## 关键技术决策与本单特殊处理
1. **双「影子 /stats」顺序保留**：Express 中两个同 path+method 的 `/stats` 只会按注册顺序匹配——先注册的 `summaryStats` 恒响应并遮蔽后者。本单严格保持 先 summary、后 goal（有目标返回目标统计、为空则返回 `__t:'next'` 透传落回 summary）的原注册顺序，行为逐字节等价。
2. **goals 的 `/` 与 `/:id` 数字校验后移**：原 `/:id` handler 前置 `/^\d+$/` 校验，非数字 `next()` 让注册其后的别名固定路径（`/org-personnel` 等）继续匹配。该校验移至 controller（`goalDetail/Update/Delete` 带 `next`，非数字直接 `next()`），保证别名不被遮蔽。
3. **别名重派发留在绑定层**：三组别名依赖 `req.app._router.handle({...req, url: req.baseUrl + 目标路径})` 改写 url 再派发，属绑定层逻辑，统一保留在 `main.js`，且依赖父路由同一挂载点 `/api/objectives` 保证 `req.baseUrl` 正确。
4. **二进制端点响应收敛 controller**：模板下载（责任书/安委会 xlsx）与安委会 PDF 流式返回因需写 res，service 只返回 `file`/`fileinfo` 描述符，`streamCommitteeFile`（白名单 + 目录前缀校验 + 流式 pipe）实现在 controller。
5. **错误码→状态码映射**：service 统一返回 `__t:'json'` 描述符；controller 按规则区分——正数 error.code（404/500）设 `res.status(code)`，负数业务码（-1/-2）保持 200 JSON，与原文响应语义一致。
6. **原 `origStatsRoute` 死变量移除**：原 L1493「捕获首个 /stats」的赋值未被使用，属死代码，拆分时一并去除，不影响行为。
7. **无内存单例转发需求**：原 `routes/objectives.js` 仅导出 router（无 `memoryStores` 外部依赖），故父聚合保持最简，不额外转发单例。

## 行为等价验证（本人复核）
- smoke `_smoke_objectives.js`（本地，gitignored）全绿：
  - **72 端点可达性非 404 全过**（含两套 `/stats`、`/` 根、`/:id`、全部别名重派发）；
  - 权限受限端点 `/committee-activities/import-pdf` 未登录 → 401（非 404）正确；
  - 设计的 404 对照组（不存在路径）仍 404 正常；
- 4 源文件 `node --check` 全过。
- smoke 全程未对生产账本发起真实写入（仅未鉴权可达性/形状/401 验证）。

## 交付与收尾
- 提交：`cb9b956 refactor(objectives): 拆分 /api/objectives 路由三层化 route/controller/service`
- 已推送 `origin/main`（`01262c0..cb9b956`）

## 遗留与下一步
- 事故/应急/现场管理/目标四单已收口。按 Phase B 剩余仍需拆分的大文件：`hse-warning-center.js(85.2KB)`、`hse-analysis-center.js(72.4KB)`、`hse-employee-import-v2.js(71.4KB)`、`hse-assessment.js(65.4KB)`、`risk-control.js(64.7KB)` 等。