# 提示词：阶段 06B-3 - Naive HSE 月度安全履职考核迁移

## 任务目标

仅迁移“目标职责”一级菜单中的**月度安全履职考核**模块到 `web-naive`：父路由 `AssessmentMonthlyIndex` 及其 7 条隐藏子路由，共 8 条路由。保持旧版的路由、权限、接口契约和实际业务能力；统一使用已验收的 Naive HSE 页面、筛选、工具栏、VXE 表格组件。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始其他批次。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06B-2-复审修正-审核.md`
6. 旧版路由与 API（本次唯一契约来源）：
   - `apps/web-antd/src/router/routes/modules/hse-02-objectives.ts`
   - `apps/web-antd/src/api/hse/assessment-monthly.ts`
7. 八个旧版页面全文（包括 template、script，不含样式分区）：
   - `apps/web-antd/src/views/hse/assessment-monthly/index.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/cycles.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/targets.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/scoring.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/deduction-review.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/deduction-adjust.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/freeze.vue`
   - `apps/web-antd/src/views/hse/assessment-monthly/excel.vue`
8. 已验收的参照实现（通用导入、工具栏、表格、筛选、弹窗、抽屉、状态标签）：
   - `apps/web-naive/src/views/site/violation/index.vue`
   - `apps/web-naive/src/views/objectives/budget/index.vue`

## 精确范围

在已存在的路由模块 `apps/web-naive/src/router/routes/modules/hse-objectives.ts` 的 `HseObjectives.children` 中**追加**以下 8 条子路由，父路由 `HseObjectives`（`order: 2`、`authority: ['admin']`、`keepAlive`、redirect）保持不变。禁止新建或改动 `routes/index.ts`、`ignoreAccess`、`publicRoutes`。

| 路由 name | path | 菜单与权限 | 旧版页面 |
|---|---|---|---|
| `AssessmentMonthlyIndex` | `/objectives/assessment-monthly` | `authority: ['admin']`，菜单可见，title「月度安全履职考核」，icon `lucide:file-check-2` | `views/hse/assessment-monthly/index.vue` |
| `AssessmentMonthlyCycles` | `/objectives/assessment-cycles` | admin，`hideInMenu: true`，title「考核周期」 | `views/hse/assessment-monthly/cycles.vue` |
| `AssessmentMonthlyTargets` | `/objectives/assessment-targets` | admin，`hideInMenu: true`，title「考核对象」 | `views/hse/assessment-monthly/targets.vue` |
| `AssessmentMonthlyScoring` | `/objectives/assessment-scoring` | admin，`hideInMenu: true`，title「自动评分」 | `views/hse/assessment-monthly/scoring.vue` |
| `AssessmentMonthlyReview` | `/objectives/assessment-deduction-review` | admin，`hideInMenu: true`，title「扣分审核」 | `views/hse/assessment-monthly/deduction-review.vue` |
| `AssessmentMonthlyAdjust` | `/objectives/assessment-deduction-adjust` | admin，`hideInMenu: true`，title「扣分调整」 | `views/hse/assessment-monthly/deduction-adjust.vue` |
| `AssessmentMonthlyFreeze` | `/objectives/assessment-freeze` | admin，`hideInMenu: true`，title「结果冻结」 | `views/hse/assessment-monthly/freeze.vue` |
| `AssessmentMonthlyExcel` | `/objectives/assessment-excel` | admin，`hideInMenu: true`，title「Excel导入导出」 | `views/hse/assessment-monthly/excel.vue` |

新页面建议放在 8 个独立文件：`apps/web-naive/src/views/hse/assessment-monthly/`（index、cycles、targets、scoring、deduction-review、deduction-adjust、freeze、excel）。不属于本批、不得创建其他路由/页面/占位符；不得改动已验收的 4 条目标职责页面、其他一级菜单或任何菜单外视图。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 和本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite 配置或代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`、`publicRoutes` 或任何权限绕过；不得改变既有菜单/路由的权限。
- `apps/web-naive/src/api/hse/assessment-monthly.ts` 为本次新增适配层，必须以旧版 `apps/web-antd/src/api/hse/assessment-monthly.ts` 为**唯一契约来源**，逐项保持 URL、HTTP 方法、参数键名（尤其 `page_size`、`sort_by`、`sort_order` 为下划线命名）、路径参数位置、响应结构与命名空间 `AssessmentMonthlyApi` 全量类型。本模块全部使用 `requestClient`（JSON），**不存在** Blob 下载或 multipart 上传，不得误用 `baseRequestClient`。不得更改服务端契约。
- 不得导入 `ant-design-vue`；使用 Naive UI、Vben、VXE 与现有 `components/hse/*`。
- 工具栏顺序固定为：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作。
- 列表表头居中；长文本 tooltip 省略；不提供列宽/列序拖动。仅当旧版同一列表确有服务端排序参数时才接入三态排序，否则不显示可排序表头。
- 不得为验证创建、编辑或删除生产数据。冻结、解冻、执行评分、审核通过/驳回、扣分调整、添加/移除/同步考核对象、导入扣分均为**写操作**，除非存在明确授权的安全隔离数据，否则必须只验证到弹窗/表单可用、请求参数正确，并如实记录未执行原因，不得伪造写入成功。

## 一、必须保留的旧版业务能力

### 1. 工作台 `AssessmentMonthlyIndex`

- 顶部说明卡 + 4 个统计卡：考核周期总数（`cycleTotal`）、进行中周期（`activeCycles`，状态为 `in_progress` 或 `pending_review`）、已冻结周期（`frozenCycles`，状态为 `frozen`）、考核指标数（`metricCount`，来自 `getMetricList` 的 `list.length`）。
- 快速入口 7 个卡片 + 当前周期进度卡（`currentCycle` 的 `cycle_name`、状态标签、评分进度百分比、`target_count/scored_count/reviewed_count`）。
- 数据来源为 `getAssessmentCycleList`（page 1、page_size 50、sort_by `created_at`、sort_order `desc`）与 `getMetricList`，用 `Promise.all` 并行。
- 旧版通过 `useHseAssessmentStore` 取数，但 `web-naive` 无此 store；本页可直接用上述两个 API 就地计算，**不必新建 Pinia store**。需等价保留的派生值：`cycleTotal`、`activeCycles`、`frozenCycles`、`metricCount`、`currentCycle`（取列表首条）及进度百分比 = `scored_count / target_count`。

### 2. 考核周期 `AssessmentMonthlyCycles`

- 服务端分页列表（`page`、`page_size`、`status`、`sort_by=created_at`、`sort_order=desc`；旧版局部 `keyword` 未真正传入请求，迁移时若沿用搜索框须以旧版实际请求为准，不得无证据新增服务端 keyword 参数）。
- 状态筛选（not_started / in_progress / pending_review / reviewed / frozen）+ 新建周期（考核年份、考核月份、周期名称留空自动生成、备注）+ 启动（仅 `not_started` 可见）+ 删除（`frozen` 不可删）+ 详情。
- 列：周期编码、周期名称、考核年月（`assessment_year 年 assessment_month 月`）、状态、考核对象数、已评分、创建人、创建时间、操作。
- 旧版“详情”按钮的 `handleView` 落地为占位提示「详情页开发中」，迁移须**如实保留该占位行为**，不得臆造详情页。

### 3. 考核对象 `AssessmentMonthlyTargets`

- 顶部考核周期下拉（列表复用 `getAssessmentCycleList` page_size 100，默认选中首条）。
- 筛选：乡镇（旧版硬编码「乡镇1/2/3」）、岗位（硬编码「安全员/负责人」）、状态（pending/scored/reviewed/frozen）、姓名/工号 keyword；均透传 `getAssessmentTargetList(cycleId, params)`。
- 多选行选择 + 同步对象（`syncAssessmentTargets`，展示 added/removed/total）+ 添加对象（弹窗输入逗号分隔员工 ID，`addAssessmentTargets(cycleId, employee_ids)`）+ 单条/批量移除（`removeAssessmentTarget`）。
- 列：姓名、工号、岗位、乡镇、部门、状态、总分、等级、乡镇排名、总排名、操作。
- 乡镇/岗位筛选选项旧版为硬编码，迁移须原样保留，不得自行请求枚举或改接口。

### 4. 自动评分 `AssessmentMonthlyScoring`

- 顶部周期下拉（默认首条）+ 3 统计卡（总人数/已评分/待评分 = `total_targets - scored_count`）+ 评分进度条（`progress_percent`）+ 刷新进度 + 执行评分（`executeScoring(cycle_id)`）。
- 执行评分后与选择周期时刷新进度；旧版以 3 秒轮询 `getScoringProgress` 直至 `progress_percent >= 100`；迁移可保留轮询并在 `onUnmounted` 清理定时器。
- 评分结果列表复用 `getAssessmentTargetList(cycleId, { sort_by: 'score_total', sort_order: 'desc' })`，列含自动评分 `score_auto`、总分、等级、排名。

### 5. 扣分审核 `AssessmentMonthlyReview`

- 顶部周期下拉（默认首条）+ 审核状态筛选（默认 `pending`：pending/approved/rejected）+ 扣分类型筛选（violation/accident/inspection/training）+ 搜索 + 批量通过（仅 `filterStatus === 'pending'` 可见）。
- 行选择仅 `review_status === 'pending'` 可选；单条「通过/驳回」（`reviewDeduction` / `rejectDeduction`，驳回必填原因）+ 详情抽屉（扣分项、类型、规则编码、建议/确认分值、审核状态、证据、备注、创建时间）。
- 列：扣分项、类型、规则编码、建议分值、确认分值、审核状态、版本、创建时间、操作。建议/确认分值显示为负值语义（`-X`）。

### 6. 扣分调整 `AssessmentMonthlyAdjust`

- 顶部周期下拉（默认首条）+ 扣分类型筛选 + 搜索。
- 单条「调整」（`adjustDeduction`：`deduction_id`、`new_score`、`adjustment_reason`，原因必填）+ 「调整历史」抽屉（`getDeductionAdjustments(deductionId)` 时间线，展示版本、操作类型、`old_score → new_score`、调整人、原因、`is_current` 标签）。

### 7. 结果冻结 `AssessmentMonthlyFreeze`

- 顶部周期下拉（默认首条，`getAssessmentCycle(cycleId)` 取详情）+ 当前周期状态卡（`target_count/scored_count/reviewed_count` 与冻结/未冻结图标）。
- 冻结（`freezeAssessmentCycle(cycleId)`，仅 `reviewed` 或 `pending_review` 状态可冻结，二次确认）+ 解冻（`unfreezeAssessmentCycle({ cycle_id, unfreeze_reason })`，必填原因）+ 刷新状态 + 右侧「冻结说明」时间线/注意事项卡。

### 8. Excel 导入导出 `AssessmentMonthlyExcel`

- 顶部周期下拉（默认首条）+ 左右两卡（导出考核结果 / 导入扣分明细）+ 右侧「操作说明」步进卡与模板字段说明表。
- 导出：`exportAssessmentResults(cycleId)` 返回 `{ cycle, total, data, message }`，旧版在浏览器本地 `JSON.stringify(data)` 后以下载 `.json` 文件落地（`<cycle_name>_考核结果.json`），**并非真实 Excel 导出**。迁移必须保留这一真实行为，不得伪称生成 xlsx、不得引入假 xlsx 打包。
- 导入：「下载模板」同样是本地生成 `.json` 模板（`扣分明细导入模板.json`）；上传控件接受 `.xlsx/.xls` 但实际把文件按文本读取并 `JSON.parse` 后传给 `importDeductions({ cycle_id, items })`。迁移不再自造模板或解析逻辑之外的能力，如实展示旧版的 JSON 模板字段（employee_code、deduction_item、deduction_type、score、evidence、remark）。

## 二、旧版遗留的不一致须知（不得“顺手修正”）

1. **快速入口路径**：旧版 `index.vue` 的 `quickEntries` 使用了 `/hse/assessment-monthly/*` 路径，与真实路由 `/objectives/assessment-*` 不符（旧版死链）。迁移时快速入口必须指向本批真实路由路径（`/objectives/assessment-cycles`、`-targets`、`-scoring`、`-deduction-review`、`-deduction-adjust`、`-freeze`、`-excel`），并在执行总结中显式说明这一处对旧版死链的修复。
2. **Excel 导出/模板非真实 Excel**：见一.8，务必在产品端与执行总结中诚实描述，不得把“导出/导入入口可用”夸大为“真实 Excel 能力”。
3. **周期详情占位**：见一.2，`handleView` 为「开发中」占位，如实保留。
4. **乡镇/岗位筛选硬编码**：见一.3，如实保留旧版枚举。
5. **枚举映射不得改动**：周期状态 `not_started/in_progress/pending_review/reviewed/frozen`；对象状态 `pending/scored/reviewed/frozen`；审核状态 `pending/approved/rejected`；等级 `A/B/C/D`；扣分类型 `violation/accident/inspection/training`，中文文案与颜色语义照旧。

## 实施要求

1. 新建 `api/hse/assessment-monthly.ts` 时，逐一对齐旧版被使用的全部函数与类型（周期 CRUD/启动、对象列表/详情/添加/移除/同步、指标列表/详情、评分执行/进度、扣分列表/审核/驳回、扣分调整/调整历史、冻结/解冻、结果列表/详情、导出/导入、health）。不得只迁移列表而遗漏详情、调整历史、冻结解冻、导入导出。
2. API 参数键名严格遵循旧版下划线命名（`page_size`、`sort_by`、`sort_order`、`cycle_id`、`review_status`、`deduction_type` 等）；路径参数（`cycleId`、`targetId`、`deductionId`）位置与 URL 拼接照旧。
3. 页面结构统一用 `HsePageLayout` + `HseSearchPanel` + `HseActionBar` + `HseDataGrid` + `HseStatusTag`；本模块无通用导入（导入为专用 `importDeductions`），不得套用 `useGenericImport`/`HseImportDialog`。
4. 所有 `NSelect @update:value` 按真实 `(value, option)` 签名处理；周期下拉默认选中首条、切换时重置分页（`pagination.page = 1`）并清空已选行，再触发刷新。
5. 首次加载、筛选、切换周期、执行写操作后刷新，保持当前筛选条件与真实总数；不得用前端模拟数据替代现有 API。
6. 冻结/评分/审核/调整等危险写操作必须有二次确认或必填原因校验（照旧版）；扣除分值显示为负值语义；评分进度 `progress_percent` 为 0 时展示真实 0 而非空。

## 验证与交付

1. 在 `安全看板vben` 运行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
git diff --check -- apps/web-naive
```

2. 使用 admin 登录态浏览器做**无写入**验证（截图 + 原始网络请求/控制台日志路径）：
   - `/objectives/assessment-monthly` 父页面可从“目标职责”菜单进入；7 条隐藏路由可直达但**不出现在菜单**；无权限行为保持既有 `admin` 限制。
   - 8 页均可见页面标题与筛选/主体结构，控制台无应用级 error/warn；375px 窄屏无横向页面溢出。
   - 工作台：4 统计卡与当前周期进度渲染；快速入口 7 个卡片点击能跳转到正确月度子路由。
   - 周期/对象/评分/审核/调整/冻结/Excel 各页：周期下拉默认首条、列表 GET 请求参数正确（含 `page_size`/`sort_by`/`sort_order` 及相应筛选键）；打开新建/添加/审核/调整/解冻/导入等弹窗表单字段完整可见。
   - Excel 页：点击「下载模板」与「导出考核结果」得到 JSON 文件（若导出需已有可导出数据否则如实记录）；不得执行确认导入。
   - 所有写操作（新建/启动/删除周期、同步/添加/移除对象、执行评分、通过/驳回、调整、冻结/解冻、导入扣分）**不执行**，仅在代码与运行时行为层面证明入口与参数，未执行项在总结中逐条说明原因。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06B-3-执行总结.md`，必须列出：变更文件、路由精确映射（含对旧版死链快速入口的修复说明）、API 契约逐函数对照、已验证浏览器步骤、未安全执行的写操作及原因、未实现/阻断项、截图/日志路径和命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始任何后续批次。