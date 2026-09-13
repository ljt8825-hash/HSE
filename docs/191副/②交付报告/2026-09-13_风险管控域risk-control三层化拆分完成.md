# 风险管控域三层化拆分完成（risk-control，Phase B 第 9 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/risk-control.js`（原约 1756 行，风险管控 CRUD + 统计 + CSV 导出 + 附件 + 版本 + 评估 + 规则字典）三层化拆分完成：父路由收敛为 **15 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。本单是 Phase B 中**端点最多（24 条）、响应形态最杂**的一单——双套响应（`middleware/response` + `utils/commonResponse`）、CSV 流式导出、文件上传、内存降级、通知联动，且存在**无 requireRole 的写端点**，等价验证需守住「只读 + 0-row no-op + 401」，绝不触真实写库。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/risk-control.js` | 纯聚合入口（挂载 `./risk-control/main`，15 行） |
| `routes/risk-control/main.js` | 纯绑定子路由（46 行，24 端点按原顺序 + `requireRole`/`uploadDocument.single` 留绑定层） |
| `controllers/riskControlController.js` | 薄 handler + `respond()`（json/csv 描述符）+ 双执行包裹 `run`/`runNext`（110 行） |
| `services/riskControlService.js` | 全部业务+SQL+辅助+内存降级+通知+规则配置（1248 行） |

## 端点覆盖（24 条）
`/stats/all`、`/stats/level`、`/stats/type`、`/export`(CSV)、`/`、`/:id`、`POST /`、`PUT /:id`、`DELETE /:id`、`/import`、`/:id/attachments`(GET)+上传(POST)+删除(DELETE /:aid)、`/:id/versions`、`/:id/assess`(鉴权)、`/:id/related-hazards`、`/:id/generate-hazard`、`/rules/levels`、`/rules/assessment-methods`、`/rules/control-measures`、`/rules/categories`、`/rules/responsibility-matrix`、`/rules/assessment-scales`、`/rules/all`。

## 关键技术决策与本单特殊处理
1. **全 200 响应契约（含 -2/-1 code，区别于 analysis-center 的 500）**：逐条核对原文件**无任何 `res.status()` 调用**，所有响应恒 HTTP 200，区别仅在 body 的 `code` —— `sendNotFound`→`error(-2)`、`sendValidationError`/业务错误→`error(-1)`、成功→`error/仍` 形态。故 service 错误描述符统一**不带 httpStatus**，controller `respond()` 不覆写状态，200 输出；`notFound=(msg)=>err(-2,msg)` 在 DB/内存两处不存在路径均返回 -2，code 语义完整保留。
2. **双响应体系协调**：`success/error`(middleware/response) 与 `commonResponse`(sendNotFound/sendValidationError/buildMemoryRecord) 的 400/404 语义其实在原文中都以 `error(-1/-2)` 走 200 JSON 表达，统一由 service 描述符 `error:{code,message}` 承载，controller `respond()` 还原成 `res.json(error(code,msg))`。
3. **CSV 流式导出下沉 controller**：`/export` + `sendCsvExport`（写 res setHeader+send）改由 controller 处理 `__t:'csv'` 描述符（`Content-Type: text/csv; charset=utf-8` + `Content-Disposition` + `res.send(r.csv)`），service 只产出 `{__t:'csv', csv}`，与原逐个字节一致（实测导出 16731 字节真实数据）。
4. **双执行包裹 run/runNext**：原 catch 为 `res.json(error(-1,...))` 的端点用 `run()`（catch→error(-1) 200）；catch 为 `next(err)` 的 6 个端点（attachments×3、versions、related-hazards、generate-hazard）用 `runNext()` 委托 `next(err)`，交由 app 级错误处理，与原运行行为一致。
5. **内存降级 + 幂等 DDL 保留**：`ensureTables`/`initMemoryData` 在 DB 在线时于读端点幂等 DDL，调用时机与原文一致；`linkRiskHazard`、`notifyRiskExpiry`、`notifyRiskLevelChange`、`recordVersion`、`judgeAssessmentLevel`、`calcAssessmentScore` 等私有函数 + `config/hseRules` + `commonResponse` + `middleware/upload` + `notificationService` 依赖全部迁入 service（相对路径已校：`config/hseRules` 为目录 index）。
6. **上传中间件留绑定层**：`uploadDocument.single('file')` 在 main.js；controller 从 `req.file/req.body` 取参；service 用 `getFileUrl`/`fixFilenameEncoding`。
7. **写端点红线（生产边界）**：`POST /`(创建)、`/import`(导入)、`/:id/attachments`(上传)、`/:id/generate-hazard`(生成) 为**无 requireRole 的真实写库端点**，冒烟/验证一律不执行；其绑定正确性靠 main.js 按序 + controller 映射 + 代码核查覆盖。

## 行为等价验证（本人复核）
- `node --check` 5 文件全过；`node -e require(聚合)+require(service)` 正常加载（无 MODULE_NOT_FOUND）。
- 冒烟 `_smoke_risk_control.cjs`（本地 gitignored，安全子集）：
  - 16 条读端点实跑全 200（stats×3、export CSV text/csv、列表/detail/id 缺记录、附件/版本/联动、rules×7）；
  - `PUT /:id/assess` 未登录 → 401（不触库）；
  - `PUT /:id`/`DELETE /:id`/`DELETE attachments` 用 id=-9999999 触发 0-row no-op（不落真实数据）；
  - 404 对照组正常。
- 代码级核对：原文件 0 个 `res.status()`（恒 200 声明成立）；`commonResponse.sendNotFound=error(-2)`/`sendValidationError=error(-1)` 与 service 的 `err(-2,...)`/`err(-1,...)` 对应。
- 全程未触发真实写库/上传/生成。

## 交付与收尾
- 提交：`refactor(risk-control): ...` + `docs(191副): ...`（本单，待推送远端）

## 遗留与下一步
- 本单收口后，Phase B 剩余仍需拆分的大文件（按体积）：`hazards.js`、`violations.js`、`hse-assessment-analysis.js`、`hse-executive-cockpit.js`、`standards.js`、`hse-hazard-rectification.js` 等。