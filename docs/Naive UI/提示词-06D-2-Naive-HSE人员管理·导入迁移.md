# 提示词：阶段 06D-2 - Naive HSE 人员管理·导入迁移（完整迁移对齐基线）

## 任务目标

将"人员管理"一级菜单下 2 条**导入**子路由从占位页**完整迁移**对齐 `web-antd` 基线：`PersonnelImport`（花名册导入）、`PersonnelBatchImport`（批量导入中心）。

本批**不是整流既有实现**，而是**从占位到完整迁移**：web-naive 当前两视图均为 `NEmpty` 占位（"开发中"），naive 路由表尚未注册这两条路由，naive 侧 `api/hse/employee-import-v2.ts` 与 `api/hse/batch-import.ts` 均缺失。需按基线**补全路由 + 新建 2 个 API 适配文件 + 完整实现两视图**。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始后续批次（06D-3 redirect、06D-4、06D-5 均禁入）。

## 范围与前置说明（基于基线既定事实，须严格遵循）

1. **父路由 `HsePersonnel`（`/personnel`，`order: 7`，`icon: 'lucide:users'`，`authority: ['admin','safety_manager']`，`keepAlive: true`）保持不变**；本批在 `apps/web-naive/src/router/routes/modules/hse-personnel.ts` 的 children 中**新增** 2 条子路由，existing 5 条（employee/departments/positions/profile/over-age）不动。
2. **路由契约来源**：`apps/web-antd/src/router/routes/modules/hse-07-personnel.ts`。两条目标路由为 `PersonnelImport` `/personnel/import`（icon `lucide:upload`，authority `['admin']`）、`PersonnelBatchImport` `/personnel/batch-import`（icon `lucide:database-upload`，authority `['admin']`），均菜单可见（无 `hideInMenu`）。
3. **API 契约来源**：`apps/web-antd/src/api/hse/employee-import-v2.ts`（后端 `server/routes/hse-employee-import-v2.js`，前缀 `/hse/employee-import/v2`）与 `apps/web-antd/src/api/hse/batch-import.ts`（后端 `server/routes/hse-batch-import.js`，前缀 `/hse/batch-import`）。两端点文件均存在于后端，**以「基线 API + 基线视图实际调用 + 后端返回结构」为准**逐项核对，不得照抄可能陈旧的孤立定义。
4. **后端授权边界**：两端点文件已存在，本批无后端改动；若验收发现基线引用的端点在后端缺失（§三.1 待核实项的 employee-import-v2/batch-import 契约），须在执行总结列为阻断遗留并**另行申请授权**，不得自行改后端。
5. **i18n 键**：naive 侧 `page.hse` 现**无** `personnelImport`/`batchImport` 相关键，需新增（见 §三）。
6. **组件约束**：不新建自定义组件，复用 `components/hse/*`（HseActionBar/HseDataGrid/HsePageLayout/HseSearchPanel/HseStatusTag/HseImportDialog 等）与 Naive UI/VXE；不得导入 `ant-design-vue`。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`（§三.1 待核实项 + §06D-2 批次定义）
5. `G:\hse-dashboard\docs\Naive UI\阶段06D-1-审核.md`（含浏览器验证附条件与超龄标题 i18n 修正遗留）
6. 旧版路由（契约来源，必读）：`apps/web-antd/src/router/routes/modules/hse-07-personnel.ts`
7. 基线 API（必读）：`apps/web-antd/src/api/hse/employee-import-v2.ts`、`apps/web-antd/src/api/hse/batch-import.ts`
8. 后端路由（端点契约，必读）：`server/routes/hse-employee-import-v2.js`、`server/routes/hse-batch-import.js`
9. 对照视图（行为契约，必读）：`apps/web-antd/src/views/hse/employee-import-v2/index.vue`、`apps/web-antd/src/views/hse/batch-import/index.vue`
10. 需整改/补齐的 web-naive 对象（占位页 + 缺失路由/API）：
    - `apps/web-naive/src/router/routes/modules/hse-personnel.ts`（新增 2 子路由）
    - `apps/web-naive/src/api/hse/employee-import-v2.ts`（**缺失，需新建**）
    - `apps/web-naive/src/api/hse/batch-import.ts`（**缺失，需新建**）
    - `apps/web-naive/src/views/hse/employee-import-v2/index.vue`（占位页，需完整实现）
    - `apps/web-naive/src/views/hse/batch-import/index.vue`（占位页，需完整实现）
    - `apps/web-naive/src/locales/langs/zh-CN/page.json`、`en-US/page.json`（补 4 键 × 2 locale）

## 当前 web-naive 现状与偏差

| 对象 | 当前 web-naive | 基线目标 |
|---|---|---|
| 路由 `PersonnelImport` | **未注册** | 新增 `name: PersonnelImport`、`path: /personnel/import`、`icon: lucide:upload`、`authority: ['admin']`、`component: #/views/hse/employee-import-v2/index.vue` |
| 路由 `PersonnelBatchImport` | **未注册** | 新增 `name: PersonnelBatchImport`、`path: /personnel/batch-import`、`icon: lucide:database-upload`、`authority: ['admin']`、`component: #/views/hse/batch-import/index.vue` |
| `api/hse/employee-import-v2.ts` | **缺失** | 按基线新建（uploadEmployeeRoster/getImportBatchList/getBatchPreview/getBatchPendingList/resolvePending/executeImport/deleteImportBatch/clearAllEmployees/getClearAllPreview/clearAllCascade） |
| `api/hse/batch-import.ts` | **缺失** | 按基线新建（createBatchTask/precheckTask/confirmTask/getTaskList/getTaskDetail/getTaskProgress/getItemList/retryItem/retryTaskFailed/downloadTemplate/getConcurrentInfo） |
| `employee-import-v2/index.vue` | 占位（NEmpty"开发中"，name `HseEmployeeImportV2`） | 完整迁移（name 改 `PersonnelImport`，批次管理 + 待确认审批 + 入库 + 清空/级联清空） |
| `batch-import/index.vue` | 占位（NEmpty"开发中"，name `HseBatchImport`） | 完整迁移（name 改 `PersonnelBatchImport`，任务管理 + 预检查 + 确认执行 + 明细/重试 + 模板下载） |
| i18n | 缺 personnelImport/batchImport 相关键 | 补全（§三） |

## 精确范围（目标路由结构）

在 `apps/web-naive/src/router/routes/modules/hse-personnel.ts` children 中新增（父路由与 existing 5 子路由不动）：

| 路由 name | path | authority | title（i18n key，中文） | icon | component |
|---|---|---|---|---|---|
| `PersonnelImport` | `/personnel/import` | `['admin']` | `$t('page.hse.personnelImport')` 花名册导入 | `lucide:upload` | `#/views/hse/employee-import-v2/index.vue` |
| `PersonnelBatchImport` | `/personnel/batch-import` | `['admin']` | `$t('page.hse.batchImport')` 批量导入 | `lucide:database-upload` | `#/views/hse/batch-import/index.vue` |

说明：两条子路由均菜单可见（无 `hideInMenu`）。视图内 `defineOptions({ name })` 须与路由 name 一致（`PersonnelImport`/`PersonnelBatchImport`），不得沿用占位页的 `HseEmployeeImportV2`/`HseBatchImport`。视图内所有内部跳转/联动路由须指向真实路径。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 内：路由模块 `hse-personnel.ts`（仅新增 2 子路由）、新建 `api/hse/employee-import-v2.ts` 与 `api/hse/batch-import.ts`、重写 `views/hse/employee-import-v2/index.vue` 与 `views/hse/batch-import/index.vue`、locales 两个 page.json，以及本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite/代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`/`publicRoutes` 或权限绕过；不得改变员工列表/组织管理/岗位/档案/超龄的既有权限与路由。
- 两视图当前为占位页、API 缺失，属**从零补齐**；勿沿用占位内容，实现须以基线视图为唯一行为契约。
- 不得导入 `ant-design-vue`；统计卡沿用 `NCard + NStatistic`，不新建自定义组件。
- 工具栏顺序固定：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作。
- 列表表头居中；长文本 tooltip 省略；不提供列宽/列序拖动。
- **写操作红线**：花名册导入的上传/审核/入库/清空、批量导入的上传/预检查/确认执行/重试等均为写操作。除非存在明确授权的安全隔离数据，否则**只验证到 UI 可达、请求参数与状态机接线正确**，不实际写库、不伪造成功；上传/清空/级联清空等危险操作尤其不得执行，未执行项在总结逐条说明原因。

## 一、API 契约（新建 2 文件）

### 1. `api/hse/employee-import-v2.ts`（花名册导入）

按基线 `apps/web-antd/src/api/hse/employee-import-v2.ts` 新建，端点前缀 `/hse/employee-import/v2`（后端 `server/routes/hse-employee-import-v2.js`）。须包含（名/签名/端点与基线一致，类型命名空间 `EmployeeImportV2Api`）：

| 函数 | 端点 |
|---|---|
| `uploadEmployeeRoster(file)` | POST `/hse/employee-import/v2/upload`（FormData） |
| `getImportBatchList(params)` | GET `/hse/employee-import/v2/batches` |
| `getBatchPreview(batchId)` | GET `/hse/employee-import/v2/batch/{batchId}/preview` |
| `getBatchPendingList(batchId, params)` | GET `/hse/employee-import/v2/batch/{batchId}/pending` |
| `resolvePending(id, data)` | POST `/hse/employee-import/v2/pending/{id}/resolve` |
| `executeImport(batchId)` | POST `/hse/employee-import/v2/batch/{batchId}/import` |
| `deleteImportBatch(batchId)` | DELETE `/hse/employee-import/v2/batch/{batchId}` |
| `clearAllEmployees()` | POST `/hse/employee-import/v2/clear-all` |
| `getClearAllPreview()` | GET `/hse/employee-import/v2/clear-all-preview` |
| `clearAllCascade()` | POST `/hse/employee-import/v2/clear-all-cascade` |

类型对齐基线：`BatchStatus`（uploaded/parsing/pending_review/completed/partial_completed/failed）、`PendingStatus`（pending/approved/rejected/imported）、`PendingType`（missing_field/unknown_dept/unknown_position/id_card_conflict/phone_conflict/auto_matched）、`ImportBatch`/`ImportPending`/`UploadResult`/`PreviewResult`/`ImportResult`/`PageResult`。逐项核实与后端返回键名一致（camelCase 为准，如 `batch_no/total_count/success_count/pending_count/skipped_count` 等），不得臆造。

### 2. `api/hse/batch-import.ts`（批量导入中心）

按基线 `apps/web-antd/src/api/hse/batch-import.ts` 新建，端点前缀 `/hse/batch-import`（后端 `server/routes/hse-batch-import.js`）。须包含（命名空间 `BatchImportApi`）：

| 函数 | 端点 |
|---|---|
| `createBatchTask(formData)` | POST `/hse/batch-import/tasks`（FormData） |
| `precheckTask(taskId)` | POST `/hse/batch-import/tasks/{taskId}/precheck` |
| `confirmTask(taskId, data)` | POST `/hse/batch-import/tasks/{taskId}/confirm` |
| `getTaskList(params)` | GET `/hse/batch-import/tasks` |
| `getTaskDetail(taskId)` | GET `/hse/batch-import/tasks/{taskId}` |
| `getTaskProgress(taskId)` | GET `/hse/batch-import/tasks/{taskId}/progress` |
| `getItemList(taskId, params)` | GET `/hse/batch-import/tasks/{taskId}/items` |
| `retryItem(itemId)` | POST `/hse/batch-import/items/{itemId}/retry` |
| `retryTaskFailed(taskId)` | POST `/hse/batch-import/tasks/{taskId}/retry` |
| `downloadTemplate(type, version?)` | GET `/hse/batch-import/templates/{type}`（blob，含 JSON 错误解析报错） |
| `getConcurrentInfo()` | GET `/hse/batch-import/concurrent-info` |

类型对齐基线：`ImportType`（document/standard_clause，`safety_record` 后端未实现暂隐藏）、`ModuleType`、`TaskStatus`/`ItemStatus`/`PrecheckStatus`/`ErrorCode`、`BatchTask`/`PrecheckResult`/`PrecheckItem`/`BatchItem`/`TaskProgress`/`ConcurrentInfo`。`downloadTemplate` 须保留基线「后端返回 JSON（非 xlsx）时解析错误并抛出」的处理。逐项核实端点与返回键名，不臆造。

## 二、视图迁移要求

### 1. `hse/employee-import-v2/index.vue`（花名册导入，900+ 行基线，本批最大）

以基线 `web-antd/.../employee-import-v2/index.vue` 为唯一行为契约，完整实现。核心能力（须逐项对照基线）：

- **name**：`defineOptions({ name: 'PersonnelImport' })`。
- **上传**：Excel 上传（`uploadEmployeeRoster`），展示上传结果（batchNo/totalRows/successCount/pendingCount/skippedCount/ruleVersion）。
- **批次列表**：`getImportBatchList`（page/pageSize/status），列含批次号/文件名/规则版本/总数/成功/待确认/跳过/状态/上传人/上传时间/操作；状态 `BatchStatus` 文案+颜色映射对齐基线。
- **批次预览/待确认审批**：`getBatchPreview` + `getBatchPendingList`（status/pending_type 筛选）；待确认记录按 `PendingType`（missing_field/unknown_dept/unknown_position/id_card_conflict/phone_conflict/auto_matched）分组展示与文案；每条支持 `resolvePending`（approved/rejected，可回填 target_org_id/target_unit_id/target_pos_id + remark）。
- **入库**：`executeImport`（展示 insertedCount/updatedCount/assignmentCount/failedCount/errors）。
- **删除批次**：`deleteImportBatch`（二次确认）。
- **清空/级联清空**：`getClearAllPreview`（预检查行数）+ `clearAllEmployees` + `clearAllCascade`，均需危险操作二次确认（输入确认文案或等价强确认）。**验证时不得真实调用**。
- **联动**：花名册导入结果影响员工列表（`/personnel/employee`），导入成功后有无刷新/跳转提示按基线实况处理；如基线无显式联动则不臆造。
- 导入整体遵循既有通用导入交互惯例（下载模板→上传→解析校验预览→确认→结果），但本页为**专用批次流程**（非 `useGenericImport`），以基线视图为准。

### 2. `hse/batch-import/index.vue`（批量导入中心，730+ 行基线）

以基线 `web-antd/.../batch-import/index.vue` 为唯一行为契约，完整实现：

- **name**：`defineOptions({ name: 'PersonnelBatchImport' })`。
- **任务创建**：`createBatchTask`（上传 + importType：document/standard_clause；module 下拉对齐基线 `ModuleType`，`safety_record` 按基线隐藏）。
- **任务列表**：`getTaskList`（page/pageSize/importType/module/status/keyword/createdBy），列含任务号/类型/模块/版本/总数/成功/失败/待确认/状态/进度/创建人/创建时间/操作；状态 `TaskStatus` 文案+颜色映射对齐基线。
- **预检查**：`precheckTask` + 预检查结果展示（validCount/invalidCount/dupCount/items）。
- **确认执行**：`confirmTask`（skipInvalid/skipDuplicate）。
- **任务详情/明细**：`getTaskDetail`（task+items）+ `getItemList`（status/keyword 筛选）；明细状态 `ItemStatus` 与错误码 `ErrorCode` 文案映射对齐基线。
- **进度**：`getTaskProgress`（轮询展示 progress/status）。
- **重试**：`retryItem`（单条）+ `retryTaskFailed`（批量失败重试）。
- **模板下载**：`downloadTemplate(type, version)`。
- **并发信息**：`getConcurrentInfo`（currentCount/maxAllowed/canCreate 提示）。
- 工具栏/动作仅显示具备真实实现项；写操作（创建/预检查/确认/重试）验证时不得真实写库。

## 三、i18n 补齐

`page.hse` 新增 4 键 × 2 locale：

- zh-CN：`personnelImport`="花名册导入"、`personnelImportDesc`="花名册批量导入 · 批次管理 / 待确认审批 / 入库"、`batchImport`="批量导入"、`batchImportDesc`="统一批量导入任务管理 · 预检查 / 确认执行 / 失败重试"。
- en-US：值对齐语义 + 相邻键英文风格（如 `personnelImport`="Roster Import"、`batchImport`="Batch Import" + 各自 Desc）。
- 2 个路由 title 与 2 个视图 HsePageLayout 标题/描述须引用 `$t('page.hse.xxx')`，**不得硬编码中文标题**（含占位页遗留的硬编码标题一并替换）。

## 验证与交付

1. 在 `安全看板vben` 运行：
```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
```

2. 使用 admin 登录态浏览器做**无写入**验证（截图 + 原始网络请求/控制台日志路径）：
   - 人员管理菜单展开：新增「花名册导入」「批量导入」两项可见、路由 name 无 `Hse` 前缀（grep `defineOptions({ name: 'Hse` 应不含本批两视图）、default 落点不变（`/personnel/employee`）。
   - 花名册导入：批次列表 `getImportBatchList` 请求参数正确；上传入口/批次预览/待确认审批/入库/删除/清空入口可达且参数接线正确（**不真实上传/入库/清空**）；`resolvePending` 弹窗字段与 target_org/unit/pos 回填正确。
   - 批量导入：`getTaskList` 参数正确；任务创建/预检查/确认/明细/进度/重试/模板下载/并发信息入口可达且接线正确（**不真实写库**）。
   - 375px 窄屏无横向溢出；控制台无应用级 error/warn（如受工具视口限制，如实说明）。
   - 所有写操作不执行，仅在代码与运行时行为层面证明入口与参数，未执行项逐条说明原因。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06D-2-执行总结.md`，必须列出：变更文件、路由精确映射（新增 2 子路由 name/icon/authority）、API 契约逐项（2 文件新建函数/端点/类型核实）、视图迁移结论（两页逐项"已实现/已对齐"）、i18n 补齐（4 键 × 2 locale）、已验证浏览器步骤、未安全执行的写操作及原因、未实现/阻断项（含 §三.1 端点缺失待授权项）、截图/日志路径与命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始后续批次。

> 附带整改（顺带，非本批主范围，如改动需在执行总结单列说明）：① 上一批遗留的 `over-age/index.vue` 页头 `title="超龄人员管理"` 硬编码 —— 改为 `:title="$t('page.hse.overAge')" + :description="$t('page.hse.overAgeDesc')"`；② 岗位「所属部门ID」列如需显示部门名则另议，勿擅自扩大范围。