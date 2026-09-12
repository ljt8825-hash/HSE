# 提示词：阶段 06C-1 - Naive HSE 制度标准迁移（整改对齐基线）

## 任务目标

将"制度标准"一级菜单迁移到 `web-naive` 并**整改对齐 `web-antd` 基线**。本批 5 条路由：`StandardsRegulations`（可见）+ `StandardsLibrary` / `StandardsReview` / `StandardsClauses` / `StandardsSuggestions`（4 条隐藏）；同时对已在阶段 05 验收的 `StandardsRelation` 做**回归**（恢复 `hideInMenu`），并**删除** web-naive 现存偏离基线的独立"文件管理"菜单路由 `hse-documents.ts`。

特殊背景：web-naive 目前已存在一套**未提交的、偏离基线的粗实现**（视图文件已齐全，但路由结构、菜单可见性、路由 name/icon、API 适配层完整性均与基线不符）。本次任务不是从零迁移视图，而是**在保留已存在视图的前提下整改路由/菜单/API 到基线**，并对视图做逐项行为核对与修复。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始 06C-2 或其他批次。

## 前置决策（已由用户确认，必须严格落实）

1. `/standards` redirect 恢复到基线 `/standards/regulations`（web-naive 当前已正确指向 regulations，不得改回 relation）。
2. `StandardsRelation` 恢复 `hideInMenu: true`（web-naive 当前临时置为可见）。
3. `StandardsSuggestions` 恢复 `hideInMenu: true`（web-naive 当前临时置为可见）。
4. 删除 web-naive 独立"文件管理"菜单路由文件 `hse-documents.ts`，其"文件库 / 文件审核"子页面改由 `/standards/library`、`/standards/review` 两条隐藏路由承载（与基线一致）。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06B-3-审核.md`
6. 旧版路由与 API（本次唯一契约来源）：
   - `apps/web-antd/src/router/routes/modules/hse-03-standards.ts`（制度标准基线路由，**必读**）
   - `apps/web-antd/src/router/routes/modules/hse-documents.ts`（安全资料中心，仅用于确认其隐藏语义已被 /standards 合并取代）
   - `apps/web-antd/src/api/hse/documents.ts`（文件/分类/标签/AI 分析 API 契约，**必读**）
   - `apps/web-antd/src/api/hse/regulations.ts`（规章制度 API 契约）
   - `apps/web-antd/src/views/hse/standard/api.ts`（条款库 API，内联于视图，**必读**）
   - `apps/web-antd/src/views/hse/standard/relation/api.ts`（条款-资料关联 API，内联于视图，**必读**）
7. 已存在、需整改的 web-naive 对象（只允许在其基线上整流，不推倒重来）：
   - `apps/web-naive/src/router/routes/modules/hse-standards.ts`
   - `apps/web-naive/src/router/routes/modules/hse-documents.ts`（删除）
   - `apps/web-naive/src/api/hse/documents.ts`
   - `apps/web-naive/src/api/hse/standard.ts`
   - `apps/web-naive/src/api/hse/standard-relation.ts`
   - `apps/web-naive/src/api/hse/regulations.ts`
   - `apps/web-naive/src/views/regulations/index.vue`
   - `apps/web-naive/src/views/hse/documents/library/index.vue`
   - `apps/web-naive/src/views/hse/documents/review/index.vue`
   - `apps/web-naive/src/views/hse/standard/clauses/index.vue`
   - `apps/web-naive/src/views/hse/standard/relation/index.vue`
   - `apps/web-naive/src/views/hse/standard/relation/suggestions.vue`

## 当前 web-naive 现状与偏差（整改对象）

以下为已核实的偏差，须逐项整改到基线：

| 对象 | 当前 web-naive | 基线目标 |
|---|---|---|
| 父路由 | `HseStandards` `/standards` redirect `/standards/regulations`（正确） | 保持不变 |
| 规章制度 route name | `HseRegulations` | `StandardsRegulations` |
| 规章制度 icon | `lucide:book-text` | `lucide:scroll-text` |
| 条款资料关联 | 可见（无 hideInMenu） | `hideInMenu: true` |
| 匹配建议 | 可见（无 hideInMenu） | `hideInMenu: true` |
| 匹配建议 icon | `lucide:sparkles` | `lucide:lightbulb` |
| 文件库路由 | 缺失 | 新增 `StandardsLibrary` `/standards/library`（hide） |
| 文件审核路由 | 缺失 | 新增 `StandardsReview` `/standards/review`（hide） |
| 标准条款库路由 | 缺失 | 新增 `StandardsClauses` `/standards/clauses`（hide） |
| 独立"文件管理"菜单 | `hse-documents.ts`（`/hse/documents`，可见） | 删除文件，删除独立菜单 |
| `documents.ts` | 缺分类 CRUD / 标签 / AI 分析函数与类型 | 补齐到基线全量 |
| `standard-relation.ts` | 缺 `MatchSuggestion` 类型 + `getRelationsByFile` / `getValidRelationsByFile` / `autoMatchForClause` | 补齐到基线全量 |

## 精确范围（目标路由结构）

在 `apps/web-naive/src/router/routes/modules/hse-standards.ts` 中，将 `HseStandards.children` **完全替换**为以下 6 条子路由；父路由 `HseStandards`（`order: 3`、`authority: ['admin']`、`keepAlive`、`icon: 'lucide:book-open-check'`、`redirect: '/standards/regulations'`）保持不变。禁止新建或改动 `routes/index.ts`、`ignoreAccess`、`publicRoutes`。

| 路由 name | path | 菜单与权限 | title（i18n key） | icon | component |
|---|---|---|---|---|---|
| `StandardsRegulations` | `/standards/regulations` | admin，菜单可见 | `$t('page.hse.regulations')` 规章制度 | `lucide:scroll-text` | `#/views/regulations/index.vue` |
| `StandardsLibrary` | `/standards/library` | admin，`hideInMenu: true` | `$t('page.hse.documentLibrary')` 文件库 | `lucide:folder-open` | `#/views/hse/documents/library/index.vue` |
| `StandardsReview` | `/standards/review` | admin，`hideInMenu: true` | `$t('page.hse.documentReview')` 文件审核 | `lucide:file-check` | `#/views/hse/documents/review/index.vue` |
| `StandardsClauses` | `/standards/clauses` | admin，`hideInMenu: true` | `$t('page.hse.standardClauses')` 标准条款库 | `lucide:list-tree` | `#/views/hse/standard/clauses/index.vue` |
| `StandardsRelation` | `/standards/relation` | admin，`hideInMenu: true` | `$t('page.hse.standardRelation')` 条款资料关联 | `lucide:link` | `#/views/hse/standard/relation/index.vue` |
| `StandardsSuggestions` | `/standards/suggestions` | admin，`hideInMenu: true` | `$t('page.hse.standardSuggestions')` 匹配建议 | `lucide:lightbulb` | `#/views/hse/standard/relation/suggestions.vue` |

说明与注意：

- 删除 `apps/web-naive/src/router/routes/modules/hse-documents.ts`。旧版 `web-antd` 中独立"安全资料中心"菜单（order 20、`hideInMenu: true`）是被 `/standards` 合并取代的历史冗余，web-naive 不得再保留独立"文件管理"可见菜单。
- `StandardsClauses` 的 component 指向 web-naive 已存在的 `#/views/hse/standard/clauses/index.vue`（旧版为 `#/views/hse/standard/index.vue`，仅目录层级不同，属非语义差异，须在执行总结中如实说明，不得强行把文件移动到基线目录或新建冗余文件）。
- 若 `page.hse.standardClauses` 键（"标准条款库"）不存在，须在 `zh-CN` 与 `en-US` 两个 locale 中补齐，并确保全站其余 locale 若缺失同样补上；不得硬编码中文标题跳过 i18n。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 内的制度标准相关文件与本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite 配置或代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`、`publicRoutes` 或任何权限绕过；不得改变既有菜单/路由的权限。
- `web-naive` 中制度标准相关文件当前为**未跟踪（untracked）**状态；请**先理解其已存在实现，再在其基础上整改**，不要笼统重写、不要删除后另起一套导致已有正确功能回退。
- 不得导入 `ant-design-vue`；使用 Naive UI、Vben、VXE 与现有 `components/hse/*`。
- 工具栏顺序固定为：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作。
- 列表表头居中；长文本 tooltip 省略；不提供列宽/列序拖动。仅当旧版同一列表确有服务端排序参数时才接入三态排序。
- 不得为验证创建、编辑或删除生产数据。规章制度新增/编辑/删除、分类增删改、标签创建、文件审核通过/驳回、AI 分析触发/重试等均为**写操作**，除非存在明确授权的安全隔离数据，否则只验证到表单/弹窗可用、请求参数正确，并如实记录未执行原因，不得伪造写入成功。

## 一、API 契约补全要求

以旧版 `apps/web-antd/src/api/hse/*.ts` 与 `apps/web-antd/src/views/hse/standard/**/api.ts` 为**唯一契约来源**，逐项对齐 URL、HTTP 方法、参数键名、路径参数位置、响应结构与命名空间类型。仅补全缺失项，不改动已对齐项。

### 1. `documents.ts`（补全分类 CRUD / 标签 / AI 分析）

web-naive 已对齐文件列表/详情/上传/更新/删除/审核/统计与 `getCategoryTree`。须补全以下遗漏：

- 类型：`AnalysisBasis`（`'full_text' | 'metadata_only' | 'filename_only'`）、`AiRiskLevel`（`'low' | 'medium' | 'high' | 'critical'`）、`ConfirmStatus`（`'unconfirmed' | 'confirmed' | 'rejected'`）、`CategoryParams`、`Tag`、`AiSuggestion`、`AiMissingItem`、`DocumentAiAnalysis`、`AiAnalysisHistoryItem`、`AiAnalysisHistoryResult`、`AnalyzeTaskResult`。
- 分类：`createCategory`（POST `/categories`）、`updateCategory`（PUT `/categories/{id}`）、`deleteCategory`（DELETE `/categories/{id}`）。
- 标签：`getTagList`（GET `/tags`）、`createTag`（POST `/tags`）。
- AI 分析：`analyzeDocument`（POST `/{id}/analyze`）、`getDocumentAnalysis`（GET `/{id}/analysis`）、`getDocumentAnalysisHistory`（GET `/{id}/analysis/history`）、`getDocumentAnalysisDetail`（GET `/{id}/analysis/{analysisId}`）、`retryDocumentAnalysis`（POST `/{id}/analysis/{analysisId}/retry`）。
- `downloadDocument`：对齐旧版 `requestClient.get<Blob>(..., { responseType: 'blob' })` 语义；若 web-naive `requestClient` 提供的 `download` 辅助与旧版响应解包等价，可沿用但须在执行总结说明等价性，不得改变端点与方法。
- 逐项核对既有 `DocumentFile` / `DocumentListResult` 等类型的必填/可选语义是否与旧版一致（旧版多数字段为必填），不一致处修回。

### 2. `standard-relation.ts`（补全 3 函数 + 1 类型）

web-naive 已对齐 `getRelationsByClause` / `createRelation` / `deleteRelation` / `confirmRelation` / `batchConfirmRelations` / `generateAutoMatches` / `getPendingSuggestions` / `getRelationStats` 与大部分类型。须补全：

- 类型：`MatchSuggestion`（`fileId / fileName / fileSummary? / fileType? / confidence / hits`）。
- `getRelationsByFile(fileId, params?)`：GET `/file/{fileId}`。
- `getValidRelationsByFile(fileId)`：GET `/file/{fileId}/valid`。
- `autoMatchForClause(clauseId, params?)`：POST `/auto-match/clause/{clauseId}`。

### 3. `standard.ts` 与 `regulations.ts`

经核对已与旧版契约一致，保持现状，不改动。

## 二、视图核对与修复要求

5 条迁移视图 + relation 回归视图已存在于 web-naive（皆未跟踪），须以旧版同路径视图为唯一行为契约逐页核对，修复与基线不符处，并在执行总结逐页列明"已核对一致 / 已修复项"。重点核对：

- `regulations/index.vue`（服务端分页 / 导入导出 / 附件 / 版本）；旧版为 1060 行，web-naive 为 540 行，须确认没有任何被删除的业务能力（如导入/导出/附件/版本履历），补齐缺失。
- `hse/documents/library/index.vue`（分类树 + 文件列表 + 上传/下载/删除 + 筛选 + 分页）；确认分类树数据源、上传 FormData 字段、审核/有效期状态筛选与旧版一致。
- `hse/documents/review/index.vue`（待审核列表 + 通过/驳回 + 审核意见 + 详情）；确认统计卡与 `GET /stats` 字段、审核状态流转文案一致。
- `hse/standard/clauses/index.vue`（三级条款树 + 详情 + 增删改启停 + 导入导出）；确认树/详情布局、启停确认、导入导出真实行为与旧版 `hse/standard/index.vue` 一致。
- `hse/standard/relation/suggestions.vue`（匹配建议 + 批量/单条确认）；确认使用 `getPendingSuggestions` 与确认动作，文案/颜色语义与旧版一致。
- `hse/standard/relation/index.vue`（回归）：仅使其随 hideInMenu 隐藏即可，不改变已验收功能。

所有内部跳转（`router.push` / 快速入口 / 详情按钮）必须指向本批真实路由路径；若旧版存在指向 `/hse/documents/*` 或 `/hse-documents/*` 的死链，改为 `/standards/library`、`/standards/review` 并在总结说明修复，不得沿用死链。

## 验证与交付

1. 在 `安全看板vben` 运行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
```

2. 使用 admin 登录态浏览器做**无写入**验证（截图 + 原始网络请求/控制台日志路径）：
   - "制度标准"菜单仅展开"规章制度"一项；文件库 / 文件审核 / 标准条款库 / 条款资料关联 / 匹配建议 5 条隐藏路由可直达（`/standards/library`、`/standards/review`、`/standards/clauses`、`/standards/relation`、`/standards/suggestions`）但**不出现在菜单**；`/standards` 默认落 `/standards/regulations`；不再出现独立"文件管理"菜单。
   - 5 条迁移页 + 匹配建议页均可见页面标题与筛选/主体结构，控制台无应用级 error/warn；375px 窄屏无横向页面溢出。
   - 规章制度：列表 GET 参数（page/pageSize/keyword/category/type/status）正确；打开新建/编辑弹窗字段完整；导入导出入口与附件/版本入口可见且请求参数正确。
   - 文件库：分类树加载（`GET /categories`）、列表筛选（categoryId/fileType/reviewStatus/validStatus/keyword）请求参数正确；上传弹窗字段完整。
   - 文件审核：统计卡 + 列表（`GET /stats`、`GET /` 带 reviewStatus）请求正确；通过/驳回弹窗与审核意见字段完整。
   - 标准条款库：树（`GET /tree`）+ 详情 + 新增/编辑/启停弹窗字段完整；导入导出入口可见。
   - 匹配建议：`GET /suggestions` 请求正确；单条/批量确认按钮就位。
   - 所有写操作（规章制度增删改、分类增删改、标签创建、审核通过/驳回、AI 分析触发/重试、匹配确认）**不执行**，仅在代码与运行时行为层面证明入口与参数，未执行项在总结中逐条说明原因。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06C-1-执行总结.md`，必须列出：变更文件（含删除的 `hse-documents.ts`）、路由精确映射（含对旧版死链的修复与 `clauses` 目录差异说明）、API 契约逐函数对照（documents.ts / standard-relation.ts 补全项逐条）、视图核对结论（逐页"一致/已修复"）、已验证浏览器步骤、未安全执行的写操作及原因、未实现/阻断项、截图/日志路径和命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始任何后续批次。