# 花名册导入域三层化拆分完成（roster-import，Phase B 第 15 单）

> 类别：②交付报告 · 日期：2026-09-13 · 归属对话：当前会话

## 一句话结论
`routes/hse-roster-import.js`（原约 751 行，花名册导入基础能力：Excel 上传解析/预览、确认暂存、待确认列表、映射规则管理、批次列表、网格长同步）三层化拆分完成：父路由收敛为 **纯聚合入口**，业务全部下沉，对外 API 契约逐字节不变。独立复核三绿：**语法 0 错误、冒烟 100% 通过、新旧对比 7+3+1 全部一致/IDENTICAL**。本单为**全端点受 `requireRole` 保护**的受保护域（区别于 standards 全公开）。

## 拆分范围与本层职责

| 文件 | 职责 |
|------|------|
| `routes/hse-roster-import.js` | 纯聚合入口（挂载 `./hse-roster-import/main`，7 行） |
| `routes/hse-roster-import/main.js` | 纯绑定子路由（7 端点 + requireRole 鉴权 + upload 的 multer 预处理中间件） |
| `controllers/rosterImportController.js` | 薄 handler + `respond()`（json 描述符）+ 兜底 `run()`（约 60 行） |
| `services/rosterImportService.js` | 全部业务+SQL+Excel 解析+组织/岗位匹配+网格长同步（约 580 行） |

## 端点覆盖（7 条，均受 requireRole 保护）
| 端点 | 鉴权 | 说明 |
|------|------|------|
| `POST /api/hse/roster-import/upload` | admin·safety_manager·hr | multer `uploadExcel.single('file')`+`validateUploadedFile` 预处理 → Excel 解析预览（写 hse_import_batch） |
| `POST /api/hse/roster-import/confirm` | admin·safety_manager·hr | 写 hse_import_pending + 更新批次 + grid_areas 网格长同步 |
| `GET /api/hse/roster-import/pending` | admin·safety_manager·hr | 待确认列表（只读） |
| `GET /api/hse/import-mapping-rules/list` | admin·safety_manager | 映射规则列表（只读） |
| `POST /api/hse/import-mapping-rules` | admin·safety_manager | 新增映射规则（写） |
| `DELETE /api/hse/import-mapping-rules/:id` | admin·safety_manager | 删除映射规则（写） |
| `GET /api/hse/import-batches/list` | admin·safety_manager·hr | 批次列表（只读） |

> 注意前缀混用：本域同时承载 `/roster-import/*`、`/import-mapping-rules/*`、`/import-batches/list` 三组路径，共挂载于 `/api/hse`。子路由绑定层按原文件顺序原样保留。

## 关键技术决策与本单特殊处理
1. **错误 message 前缀因端点而异，service 层各自捕获**：原文件各端点的 catch 前缀不同（「解析失败:」「确认失败:」「获取待确认列表失败:」「获取映射规则失败:」「创建映射规则失败:」「删除映射规则失败:」「获取批次列表失败:」），且逐一 `console.error` 原日志。故每个 service 函数内保留原 try/catch 并返回对应前缀的错误描述符，controller 的 `run()` 仅作兜底（实际不触发）。
2. **全 200 + code{-1 或 0} 契约**：原文件一律 `error('...')`（默认代码 -1）与 `success(data, msg)`，恒 HTTP 200；controller `respond()` 按描述符 `error.code` 原样输出，不覆写状态码。
3. **upload 的 multer 预处理中间件保留在路由层**：`uploadExcel.single('file')` + `validateUploadedFile` 属请求预处理（在 requireRole 之后、controller 之前），须原样留在 `main.js` 绑定，controller 不承载文件解析。上传 service 通过 `req.file` 读取路径/原名，`finally` 中仍执行 `deleteFile`。
4. **本单不新增内存降级**：原文件始终直接 `pool.connect()/pool.query`，无 `isConnected()` 回退；拆分版忠实保留（DB 不可用时抛错，行为与原文一致）。
5. **鉴权绑定完整性**：7 端点全部 `requireRole`，在路由层绑定。冒烟未登录全 401、对比双 401 逐字节一致，证明中间件未丢未改。
6. **网格长同步完整下沉**：`syncGridAreasFromRoster`（按姓名匹配 grid_areas 更新/新增，含 nextGridCode 生成、deriveGridAreaFields 推导乡镇/区域）随 confirm 事务完整迁移，逻辑逐行未改。

## 独立复核（本单自查）
- **语法**：`node --check` 四文件全过。
- **冒烟**（`_smoke_roster_import.cjs`）：7 未登录鉴权绑定全 401、3 只读端点（注入 admin）形状、8 组 service 描述符（非法参数在写库前 return + 0-row no-op，**不触写库**）、不存在路径 404 —— **全部通过**。
- **新旧对比**（`_compare_roster_import.cjs`，对照 git HEAD 原始版）：未登录 7 端点**双 401 + body 逐字节一致**、注入 admin 3 只读端点**双 200 IDENTICAL**、不存在路径**双 404** —— 全部一致。

## 约定
- 冒烟脚本 `_smoke_roster_import.cjs` 与对比脚本 `_compare_roster_import.cjs` 为临时验证件，保留于 `server/` 供回归。
- 本单未触碰生产表 / 端口 / WPS 边界；验证全部为只读 + 未登录 401 + 非法参数 before-write return + 0-row no-op。