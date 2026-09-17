# 培训台账OCR域三层化拆分完成（training-ocr，Phase B 第 19 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/training-ocr.js`（原 536 行，培训台账 PDF/图片 OCR → Excel/入库 业务）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉，对外 API 契约不变。独立复核全绿：**语法 0 错误、冒烟 100%、新旧对比只读端点逐字节 IDENTICAL + before-write 分支一致**。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/training-ocr.js` | 纯聚合入口（挂载 `./training-ocr/main`） |
| `routes/training-ocr/main.js` | 纯绑定子路由（7 端点，严格按原注册顺序 + requireRole + multer 中间件） |
| `controllers/trainingOcrController.js` | 薄 handler + `respond()`（json 描述符）+ 兜底 `error(-1)` + 两个 Excel 二进制渲染 |
| `services/trainingOcrService.js` | 全部业务 + 子进程 OCR + Excel 生成 + SQL + multer/临时目录配置（原文件几乎全部逻辑） |

## 端点覆盖（7 条，挂载 **`/api/training-ocr`**）
> 本域端点**全部 requireRole('admin','safety_manager')**（保持原状，写/导入能力均需管理角色）。
| 端点 | 说明 |
|------|------|
| `POST /recognize` | PDF/图片 OCR 识别（`upload.single('file')`，多模态：普通台账 / 签到表合集 / 探测） |
| `GET /export` | 预览行导出 Excel（rows/columns 经 query base64 传入） |
| `POST /confirm` | 预览行确认入库 `training_records`（人员落键复用 training 同口径） |
| `POST /confirm-signin` | 签到场次入库 `training_signin_sessions` + 逐人落痕 `training_records` |
| `GET /signin-sessions` | 场次台账列表（分类/部门/日期/标签过滤） |
| `GET /export-signin` | 导出场次台账（汇总 sheet + 未培训人员明细 sheet） |
| `GET /signin-sessions/:id` | 场次明细 |

## 关键处理
- **鉴权在路由层**：改用 `GUARD = requireRole('admin','safety_manager')` 常量统一挂在 7 端点（原文件每端点显式调用同参数，行为等价）。
- **`/recognize` 的 multer 中间件**：原文件在端点内联 `upload.single('file')(req,res,cb)` 并捕获上传错误 → `error(-1,'文件上传失败:...')`。拆后路由层以 `uploadGuard` 中间件复刻同一语义：解析错误响应 `error(-1,'文件上传失败: msg')`、成功交 controller；service 只对"未传文件/不支持类型/识别失败"等返回描述符。
- **跨域依赖下沉到 services**：原文件 `require('./training')` 取 `resolveTrainingPersonId/Name`，现直接 `require('./trainingShared')`（同源、消除了 route→service 反向依赖，避免循环）。`SigninAttribution` 原就在 services。
- **错误语义**：service 对业务预期分支（缺文件 -2、不支持类型 -3、识别失败 -4、内存模式 -3、空 rows/sessions -2）返回 `err(code,msg)` 描述符 → controller `error(code,msg)`（HTTP 200）；未捕获异常由 controller 兜底 `error(-1, msg)`。与原文件逐位一致（原文件各端点即 `res.json(error(...))`，非 errorHandler）。
- **两个 Excel 导出端点**：controller 成功时渲染为 xlsx 二进制附件直接发送（`Content-Disposition` 保持原文件名规则），不经 `respond()`。

## 端点顺序约束（与原文件一致）
- `GET /signin-sessions`（列表）先于 `GET /signin-sessions/:id`；
- `GET /export-signin` **必须在** `/signin-sessions/:id` 之前，否则被 `:id` 遮蔽（原文件即有此注释约束，保持原列序）。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过；`require` 图加载 OK。
- **冒烟**（`_smoke_training_ocr.cjs`，mock req.user=admin）：权限控制 viewer→403；只读端点形状正确（列表/明细不存在 -4/导出空 -2）；service 层 before-write 分支描述符（recognize 缺 file / confirm 空 rows / confirmSignin 空 sessions）全对；`/recognize` multer 中间件行为（未传文件 -2 / 超限文件 -1 上传失败）；404 —— 全部通过。
- **新旧对比**（`_compare_training_ocr.cjs`，对照 git HEAD 原始版）：只读端点 `/signin-sessions`、`/signin-sessions/:id`、`/export` **双 200 逐字节 IDENTICAL**；write 型端点 before-write return 分支（recognize 缺 file / confirm / confirmSignin）逐字节一致；`/recognize` 路由行为 IDENTICAL；不存在路径 **双 404** —— 全部一致。
- **回归**：`npm test` 23 套件通过 / 3 套失败（**insurance-file、import-personnel-behavior、personnel-insurance**，22 处）——与拆分前基线完全一致（保险/花名册导入域），**未引入新回归**。
- **引用核查**：外部对 `routes/training-ocr` 的引用仅 `app.js` 一处（`/api/training-ocr`）；无单测直读其源码。

## 约定
- 冒烟 `_smoke_training_ocr.cjs` 与对比 `_compare_training_ocr.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰生产表 / 端口 / WPS 边界；验证全部为只读 + before-write return + 0-row no-op，未真实落库（`/recognize` 超限文件写入临时目录后由 multer 校验拦截、临时文件不入库）。
- 连续性：Phase B 此前已完成 roster-import、hazard-rectification、position-responsibility、regulations，本单为 training OCR 域，累计拆分规整文件数第 19 单。