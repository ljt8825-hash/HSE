# 花名册导入域三层化拆分完成（employee-import-v2，Phase B 第 7 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-employee-import-v2.js`（原约 1731 行花名册导入 v2）三层化拆分完成：父路由收敛为 **16 行纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。本单是 Phase B 中**外部依赖最重**的一单——文件上传(multer)、XLSX 解析、加密工具、审计日志、组织/岗位/员工匹配的全套花名册导入业务；且 **12 条端点全部受 requireRole 保护**，HTTP 冒烟无法触达 handler 内部，故以「route 保序 + 401 拦截 + 代码级错误语义核对」为等价验收线。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-employee-import-v2.js` | 纯聚合入口（挂载 `./hse-employee-import-v2/main`，16 行） |
| `routes/hse-employee-import-v2/main.js` | 纯绑定子路由（25 行，12 端点按原顺序 + `requireRole`/`uploadExcel.single('file')` 中间件留绑定层） |
| `controllers/employeeImportV2Controller.js` | 薄 handler + `run()` + `respond()`（90 行，统一解释 `__t:'json'` 描述符） |
| `services/employeeImportV2Service.js` | 全部业务+SQL+22 个私有辅助函数+常量与模块状态（1612 行） |

## 端点覆盖（12 条，全部受保护）
`POST /upload`（+`uploadExcel.single('file')`）、`GET /batches`、`GET /batch/:batchId/preview`、`GET /batch/:batchId/pending`、`POST /pending/:id/resolve`、`POST /batch/:batchId/import`、`DELETE /batch/:batchId`、`POST /clear-all`（admin）、`GET /clear-all-preview`（admin）、`POST /clear-all-cascade`（admin）、`GET /source-files`、`POST /source/import`。

## 关键技术决策与本单特殊处理
1. **require 路径搬家修正**：原文件 `require('./audit')`（auditLog）相对 `routes/` 解析，迁入 `services/` 后改为 `require('../routes/audit')`；`utils/encryption`、`middleware/upload`、`config/db` 从 services 上行 `../` 即对，原样保留。已用 `node --check` + `node -e "require(...)"` 验证 service 可真实解析加载（非仅语法）。
2. **上传中间件分层**：`uploadExcel.single('file')`（multer）只留在 main.js 绑定层（`requireRole → uploadExcel.single → controller`），controller 从 `req.file/req.body` 取参；service 只用 `validateUploadedFile/deleteFile/fixFilenameEncoding` 辅助。
3. **错误语义本域特殊性（关键）**：原路由全部 handler 的 catch 分支均为 `res.json(error(-1, formatDbError(e)))`，且全文 **0 个 `res.status(...)`** ——即**所有响应（含错误）恒为 HTTP 200，从不 500**。故 service 错误描述符统一**不带 httpStatus**，controller `respond()` 不覆写、返回 200，与原契约逐字节一致（未照搬其它域的「真异常→500」约定，避免改变对外行为）。
4. **`!isConnected` 抛错归一 200**：`createImportBatchFromWorkbook` 内部 `if(!isConnected()) throw` 会被外层 `upload`/`sourceImport` 的 `try/catch(ex)→err(-1, formatDbError(ex))` 捕获转成 200 错误描述符，与原件 `res.json(error(-1,'数据库未连接'))`(200) 等价。
5. **常量与模块级状态整体下沉**：`SOURCE_DIR`（依赖 `process.env.ROSTER_SOURCE_DIR`）、`ROSTER_HEADER_MAP`、`HEADER_ALIASES`、`VALID_GENDERS`、`pendingColumnsReady`/`viewUpdated` 模块状态全部迁至 service 顶层，`ensurePendingColumns`/`ensureViewFields` 调用时机不变。
6. **22 个私有辅助函数整体迁入**：`normalizeRosterDept/secureEncode/normalizeDate/parseExcelRow/validateRow/generateBatchNo/inferPersonType/formatDbError/matchOrgUnit/cnNumeralToDigit/matchOperationUnit/matchPosition/matchEmployee/loadSkipSets/loadGenericDepts/resolveOrgBySupervisor/resolveOrg/matchSupervisor/createImportBatchFromWorkbook/performBatchImport/safeSourcePath`。

## 行为等价验证（本人复核）
- `node --check` 5 文件全过；`node -e require(聚合)/require(service)` 正常加载（无 MODULE_NOT_FOUND）。
- 冒烟 `_smoke_employee_import_v2.cjs`（本地 gitignored）：12 条端点全部 401（非 404→路由匹配且 requireRole 正常拦截，不触库）；404 对照组仍 404。
- **代码级错误语义核对**：service 错误 helper `const err=(code,message,httpStatus)=>({__t:'json',error:{code,message},...(httpStatus?{httpStatus}:{})})` 仅显式传参才带 httpStatus，而全文无任何调用点传该参数（全 200）；service 无 `res.json/res.status` 泄漏（`res` 仅为 DB 结果变量）。
- 全程以未鉴权方式打，未触库/未上传真实文件/未做真实写库。

## 交付与收尾
- 提交：`refactor(hse-employee-import-v2): ...` + `docs(191副): ...`（本单，待推送远端）

## 遗留与下一步
- 本单收口后，Phase B 剩余仍需拆分的大文件（按体积）：`hse-assessment.js`、`risk-control.js`、`hazards.js`、`violations.js`、`hse-assessment-analysis.js` 等。