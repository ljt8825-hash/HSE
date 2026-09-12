# 提示词：阶段 06C-2 - Naive HSE 培训考核迁移（整改对齐基线）

## 任务目标

将"培训考核"一级菜单迁移到 `web-naive` 并**整改对齐 `web-antd` 基线**。本批 5 条路由：`TrainingPlans`（培训计划，可见）+ `TrainingRecords`（培训记录，可见）+ `CertificateManagement`（证书管理，可见）+ `AssessmentManagement`（考核管理，隐藏）+ `ComprehensiveAssessment`（综合考核，隐藏）。

特殊背景：web-naive 目前已存在一套**未提交的、偏离基线的粗实现**（视图文件已齐全，7 个视图其中 5 个已接线，另有 `driver`、`new-employee` 两个孤儿视图；路由 name/path/可见性/icon、API 适配层文件位置、i18n 中文键均与基线不符）。本次任务**不是从零迁移视图**，而是**在保留已存在视图的前提下整改路由/菜单/API/i18n 到基线**，并对视图做逐项行为核对与修复。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始后续批次。

## 范围与前置说明（基于基线既定事实，须严格遵循）

1. 父菜单标题为**"培训考核"**（基线 `hse-08-training.ts` 的 title），并非旧版遗留 `hse-training.ts` 的"培训管理"。
2. 本批唯一契约来源是 `apps/web-antd/src/router/routes/modules/hse-08-training.ts`（5 条子路由）。web-antd 同目录另存有一份**旧版遗留** `hse-training.ts`（order 5、父级 `hideInMenu: true`、10 条子路由、含 new-employee/driver/execute/analysis/reminders 等），该文件是历史冗余，**不作为本次基线**，不得据此新增路由。
3. `CertificateManagement` 的旧版 component 是 `views/training/index.vue`（页面注释自述为"培训记录/证书管理"），而 web-naive 已将其实现于 `views/training/certificates/index.vue`（文件头部注释亦写明"对应 web-antd 的 training/index.vue"）。属**目录层级 / 文件命名非语义差异**，沿用 06C-1「条款库目录差异」判例：**保留 web-naive 现有 `certificates/index.vue`，不移动到 `training/index.vue`，不新建冗余文件**，仅须在执行总结如实说明。
4. web-naive 现存 `views/training/driver/index.vue`、`views/training/new-employee/index.vue` 两个**孤儿视图**不在基线 5 条路由内（旧版遗留功能），当前亦未接线。**保持未接线状态，不新增路由、不删除文件**，执行总结说明其为非基线遗留即可。
5. web-naive 现存 `src/api/training.ts` 同时含 `driver` / `new-employee` 相关 API 函数（`getDriverList`/`getNewEmployeeList` 等），这些函数**存在于基线 `web-antd/src/api/hse/training.ts` 中**（基线 API 契约保留它们，只是路由层不再暴露页面），故**保留这些 API 函数**，仅搬迁文件位置，不删除。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06C-1-审核.md`
6. 旧版路由与 API（本次唯一契约来源）：
   - `apps/web-antd/src/router/routes/modules/hse-08-training.ts`（培训考核基线路由，**必读**）
   - `apps/web-antd/src/router/routes/modules/hse-training.ts`（旧版遗留，仅用于确认其已被 `hse-08-training.ts` 取代，不作为基线）
   - `apps/web-antd/src/api/hse/training.ts`（培训考核 API 契约，**必读，唯一契约来源**）
   - 对照视图：`apps/web-antd/src/views/training/` 下的 `plans/`、`ledger/`、`requirements/`、`index.vue`（证书管理）、`stats/` 五个页面（行为契约）
7. 已存在、需整改的 web-naive 对象（只允许在其基线上整流，不推倒重来）：
   - `apps/web-naive/src/router/routes/modules/hse-training.ts`
   - `apps/web-naive/src/api/training.ts`（**迁移到** `apps/web-naive/src/api/hse/training.ts`）
   - `apps/web-naive/src/views/training/plans/index.vue`
   - `apps/web-naive/src/views/training/ledger/index.vue`
   - `apps/web-naive/src/views/training/requirements/index.vue`
   - `apps/web-naive/src/views/training/certificates/index.vue`
   - `apps/web-naive/src/views/training/stats/index.vue`
   - `apps/web-naive/src/locales/langs/zh-CN/page.json`、`en-US/page.json`

## 当前 web-naive 现状与偏差（整改对象）

以下为已核实的偏差，须逐项整改到基线：

| 对象 | 当前 web-naive | 基线目标 |
|---|---|---|
| 父路由 name / path / redirect | `HseTraining` `/training` redirect `/training/plans`（正确） | 保持不变 |
| 父路由 title | `$t('page.hse.training')`（zh 缺键，en 为 "Training"） | 中文 = "培训考核" |
| 培训计划 route name | `HseTrainingPlans` | `TrainingPlans` |
| 培训记录 route name/path | `HseTrainingLedger` `/training/ledger` | `TrainingRecords` `/training/records` |
| 考核管理 route name/path/可见性 | `HseTrainingRequirements` `/training/requirements`（可见） | `AssessmentManagement` `/training/assessments` + `hideInMenu: true` |
| 证书管理 route name/component | `HseTrainingCertificates` → `certificates/index.vue` | `CertificateManagement`（component 保留 `certificates/index.vue`，见前置说明 3） |
| 综合考核 route name/path/可见性 | `HseTrainingStats` `/training/stats`（可见） | `ComprehensiveAssessment` `/training/comprehensive` + `hideInMenu: true` |
| 子路由 icon | 全部缺失 | `training/plans`=calendar-check、`ledger`=book-open、`requirements`=clipboard-check、`certificates`=badge-check、`stats`=trending-up |
| API 文件位置 | `src/api/training.ts` | `src/api/hse/training.ts` |
| 视图 API import | 全部 `#/api/training` | `#/api/hse/training` |
| i18n（zh-CN） | `page.hse` 下培训相关键**全部缺失** | 补齐（见 §三） |
| i18n（en-US） | 有键但部分语义与基线不符（Ledger/Requirements/Certificates/Analytics） | 对齐（见 §三） |

## 精确范围（目标路由结构）

在 `apps/web-naive/src/router/routes/modules/hse-training.ts` 中，将 `HseTraining.children` **完全替换**为以下 5 条子路由；父路由 `HseTraining`（`name: 'HseTraining'`、`path: '/training'`、`redirect: '/training/plans'`、`order: 8`、`authority: ['admin']`、`keepAlive: true`、`icon: 'lucide:graduation-cap'`、`title: $t('page.hse.training')`）保持不变。禁止新建或改动 `routes/index.ts`、`ignoreAccess`、`publicRoutes`。

| 路由 name | path | 菜单与权限 | title（i18n key，中文） | icon | component |
|---|---|---|---|---|---|
| `TrainingPlans` | `/training/plans` | admin，菜单可见 | `$t('page.hse.trainingPlans')` 培训计划 | `lucide:calendar-check` | `#/views/training/plans/index.vue` |
| `TrainingRecords` | `/training/records` | admin，菜单可见 | `$t('page.hse.trainingLedger')` 培训记录 | `lucide:book-open` | `#/views/training/ledger/index.vue` |
| `AssessmentManagement` | `/training/assessments` | admin，`hideInMenu: true` | `$t('page.hse.trainingRequirements')` 考核管理 | `lucide:clipboard-check` | `#/views/training/requirements/index.vue` |
| `CertificateManagement` | `/training/certificates` | admin，菜单可见 | `$t('page.hse.trainingCertificates')` 证书管理 | `lucide:badge-check` | `#/views/training/certificates/index.vue` |
| `ComprehensiveAssessment` | `/training/comprehensive` | admin，`hideInMenu: true` | `$t('page.hse.trainingStats')` 综合考核 | `lucide:trending-up` | `#/views/training/stats/index.vue` |

说明与注意：

- 菜单内可见子项为 **3 条**：培训计划、培训记录、证书管理；考核管理 / 综合考核 2 条为隐藏路由，可直达但不出现在菜单。
- 不在本批新增 `driver`、`new-employee` 等任何基线之外的路由（见前置说明 2/4）。
- 视图内所有内部跳转（`router.push` / 快速入口 / 详情按钮）必须指向本批真实路由路径（`/training/plans`、`/training/records`、`/training/assessments`、`/training/certificates`、`/training/comprehensive`）。若旧版或 naive 现存指向 `/training/ledger`、`/training/requirements`、`/training/stats` 的跳转/死链，改为新路径并在执行总结说明修复，不得沿用旧路径。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 内的培训考核相关文件与本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite 配置或代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`、`publicRoutes` 或任何权限绕过；不得改变既有菜单/路由的权限。
- `web-naive` 中培训考核相关文件当前为**未跟踪（untracked）**状态；请**先理解其已存在实现，再在其基础上整流**，不要笼统重写、不要删除后另起一套导致已有正确功能回退。
- 不得导入 `ant-design-vue`；使用 Naive UI、Vben、VXE 与现有 `components/hse/*`。统计卡片沿用已迁移页面（`regulations` / `risk-control` / `hazards` / `accidents`）的 `NCard` + `NStatistic` 惯例，**不新建 `HseStatCard` 类自定义组件**。
- 工具栏顺序固定为：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作。
- 列表表头居中；长文本 tooltip 省略；不提供列宽/列序拖动。仅当旧版同一列表确有服务端排序参数时才接入三态排序。
- 不得为验证创建、编辑或删除生产数据。培训计划/台账/要求/记录的新增编辑删除、附件上传、计划执行、导入等均为**写操作**，除非存在明确授权的安全隔离数据，否则只验证到表单/弹窗可用、请求参数正确，并如实记录未执行原因，不得伪造写入成功。

## 一、API 契约补全要求

以旧版 `apps/web-antd/src/api/hse/training.ts` 为**唯一契约来源**，逐项对齐 URL、HTTP 方法、参数键名、路径参数位置、响应结构与命名空间类型。仅补全缺失项、修正偏离项，不改动已对齐项。

### 1. 文件位置迁移（必做）

将 `apps/web-naive/src/api/training.ts` **迁移**为 `apps/web-naive/src/api/hse/training.ts`（与 `api/hse/` 下其余 HSE 模块文件一致）。随后将 7 个视图的 import 由 `#/api/training` 改为 `#/api/hse/training`：

- `views/training/plans/index.vue`
- `views/training/ledger/index.vue`
- `views/training/requirements/index.vue`
- `views/training/certificates/index.vue`
- `views/training/stats/index.vue`
- `views/training/driver/index.vue`（孤儿视图，若有 import 同样改路径）
- `views/training/new-employee/index.vue`（同上）

迁移后删除 `apps/web-naive/src/api/training.ts` 原文件，不得留下两份同名实现。

### 2. 补全缺失函数

web-naive 缺失，须按基线补全：

- `getTrainingRequirement(id: number)`：GET `/training/requirements/{id}`，返回 `TrainingRequirementApi.TrainingRequirement`（基线因详情编辑而存在，web-naive 仅有列表 CRUD）。

### 3. 修正多余导出（对齐基线）

web-naive 存在但基线没有的导出，须处理：

- `exportTrainingPlans`（`/training/plans/export`）
- `exportTrainingRequirements`（`/training/requirements/export`）

基线的导出动作仅有 `exportTrainingRecords`（`/training/records/export`）与 `exportTrainingLedger`（`/training/ledger/export`）。处理原则：若对应视图（plans/requirements）的导出按钮引用了上述两个非基线函数，须改对齐基线的导出语义（沿用基线已有的导出端点）或移除该导出入口；不得保留引入非基线端点的函数。最终选择在执行总结逐条说明。

### 4. 类型语义核对（逐项对齐或如实说明）

对照基线核对并修回以下类型语义差异，若确为 naive 侧更严格的等价实现，须在执行总结逐条说明等价性而非静默保留：

- `TrainingRequirement` 缺少 `isDeleted: boolean`（基线为必填）→ 补。
- `TrainingPlanItem` 缺少 `isDeleted: boolean`（基线为必填）→ 补。
- `TrainingRequirement.trainingCycle`：naive 为联合字面量 `'年度' | '半年' | '季度' | '月度' | '专项' | '入职'`，基线为 `string`；`PlanListParams.planType`/`status`：naive 为联合字面量，基线为 `string`。核对运行态取值为动态枚举（来自 `/training-assessment/rules/*`），确认无须把动态字符串收敛为窄联合即可，否则修回 `string` 以对齐契约。
- `createTrainingRequirement` / `createTrainingPlanItem` 参数类型：naive 用专用 `RequirementFormData` / `PlanFormData`，基线用 `Partial<TrainingRequirement>` / `Partial<TrainingPlanItem>`。确认字段与基线一致即可，形式差异在执行总结说明。
- `uploadTrainingAttachment`：基线支持 `options.uploadedBy`（`uploaded_by` 字段），naive 仅支持 `options.version`。核对基线契约补 `uploadedBy`。

### 5. 已对齐项（核对即可，勿改动语义）

以下函数与基线 URL/方法/参数一致，仅作回归确认：`getTrainingPlanItems`、`getTrainingPlanItem`、`createTrainingPlanItem`、`updateTrainingPlanItem`、`deleteTrainingPlanItem`、`getLedgerList`、`createLedger`、`updateLedger`、`deleteLedger`、`getTrainingRequirements`、`createTrainingRequirement`、`updateTrainingRequirement`、`deleteTrainingRequirement`、`getTrainingPlanList`、`getTrainingStats`、`getTrainingPlanDetail`、`createTrainingPlan`、`updateTrainingPlan`、`deleteTrainingPlan`、`getTrainingRecords`、`getTrainingAttachments`、`deleteTrainingAttachment`、`getTrainingVersions`、`exportTrainingRecords`、`exportTrainingLedger`、`getEnhancedTrainingStats`、`executeTrainingPlan`、`getExpiryReminders`、`getNewEmployeeReminders`、`getTrainingAnalysis`、`getTrainingTypes`、`getPlanStatusFlow`、`getAssessmentGrades`、`getNewEmployeeList`、`createNewEmployee`、`updateNewEmployee`、`deleteNewEmployee`、`getDriverList`、`createDriver`、`updateDriver`、`deleteDriver`。

## 二、视图核对与修复要求

5 条迁移视图已存在于 web-naive（皆未跟踪），须以旧版同路径视图为唯一行为契约逐页核对，修复与基线不符处，并在执行总结逐页列明"已核对一致 / 已修复项"。重点核对：

- `plans/index.vue`（年度/专项/新员工培训计划）：确认使用 `getTrainingPlanItems`（服务端分页 `page/pageSize/keyword/planType/status`）、`getTrainingTypes`（类型枚举）、`getPlanStatusFlow`（状态流转）、计划 CRUD、模板导入/导出；表单字段（培训类型、受训对象、培训师、起止日期、学时、是否考核、及格分、状态等）与旧版一致。
- `ledger/index.vue`（培训台账/记录）：确认使用 `LedgerApi` 的 `getLedgerList`（`page/pageSize/keyword/result`）、CRUD、统计卡（`getTrainingStats`）、导入/导出（`exportTrainingLedger`）、上级（`supervisorId/supervisorName`）与到期状态（`expiryStatus`）字段与旧版一致。
- `requirements/index.vue`（考核管理，隐藏）：确认使用 `getTrainingRequirements`（`page/pageSize/positionId/keyword`）、CRUD，岗位/周期/是否必修/学时字段完整、周期枚举来自动态规则，与旧版一致。
- `certificates/index.vue`（证书管理，对应旧版 `training/index.vue`）：确认统计卡（`NCard`+`NStatistic`，数据源 `getTrainingStats`：总数/进行中/已完成/参训人数/通过率/分类型）、记录列表（`getTrainingPlanList`）、类型/状态枚举（`getTrainingTypes`/`getPlanStatusFlow`）、附件上传与版本履历（`getTrainingAttachments`/`uploadTrainingAttachment`/`deleteTrainingAttachment`/`getTrainingVersions`）、模板导入（`useGenericImport`）与旧版能力一致，无能力丢失。
- `stats/index.vue`（综合考核，隐藏）：确认使用 `getEnhancedTrainingStats`（岗位必修/完成、超期人员、岗位完成率、员工完成率）与 `getTrainingStats`，渲染"岗位完成率 / 到期人员"结构与旧版一致。

所有内部跳转指向本批真实路由路径（见"精确范围"说明与注意），不得沿用 `ledger/requirements/stats` 旧路径死链。

## 三、i18n 补齐要求

`apps/web-naive/src/locales/langs/zh-CN/page.json` 的 `page.hse` 下**培训相关键全部缺失**，须补齐；`en-US/page.json` 已有关键但部分语义与基线不符，须对齐。全站 locale 仅 `zh-CN` 与 `en-US` 两处。以如下键值表为准：

| key（`page.hse.*`） | zh-CN | en-US | 状态 |
|---|---|---|---|
| `training` | 培训考核 | Training Assessment | zh 新增；en 现为 "Training" 需改 |
| `trainingPlans` | 培训计划 | Training Plans | zh 新增；en 已对齐 |
| `trainingPlansDesc` | 培训计划管理 · 服务端分页 / 模板导入 / 导出 | Training plan management · server pagination / template import / export | zh 新增；en 已对齐 |
| `trainingLedger` | 培训记录 | Training Records | zh 新增；en 现为 "Training Ledger" 需改 |
| `trainingLedgerDesc` | 培训台账记录 · 服务端分页 / 统计 / 导入 / 导出 | Training records ledger · server pagination / stats / import / export | zh 新增；en 已对齐 |
| `trainingRequirements` | 考核管理 | Assessment Management | zh 新增；en 现为 "Assessment Requirements" 需改 |
| `trainingRequirementsDesc` | 培训考核要求管理 · 服务端分页 / 导入 / 导出 | Training assessment requirements · server pagination / import / export | zh 新增；en 已对齐 |
| `trainingCertificates` | 证书管理 | Certificate Management | zh 新增；en 现为 "Certificates" 需改 |
| `trainingCertificatesDesc` | 培训证书与记录 · 服务端分页 / 附件 / 版本 / 导入 / 导出 | Training certificates & records · server pagination / attachments / versions / import / export | zh 新增；en 已对齐 |
| `trainingStats` | 综合考核 | Comprehensive Assessment | zh 新增；en 现为 "Training Analytics" 需改 |
| `trainingStatsDesc` | 综合培训考核 · 岗位完成率 / 到期人员 | Comprehensive training assessment · position completion / overdue personnel | zh 新增；en 已对齐 |

要求：补齐后确保路由与 5 个视图所引用的每个 `page.hse.training*` 键在两个 locale 中均存在且值正确；不得硬编码中文标题跳过 i18n。

## 验证与交付

1. 在 `安全看板vben` 运行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
```

2. 使用 admin 登录态浏览器做**无写入**验证（截图 + 原始网络请求/控制台日志路径）：
   - "培训考核"菜单展开仅显示 3 项：培训计划、培训记录、证书管理；考核管理（`/training/assessments`）、综合考核（`/training/comprehensive`）2 条隐藏路由可直达但**不出现在菜单**；`/training` 默认落 `/training/plans`；菜单中不再出现旧路径 `/training/ledger`、`/training/requirements`、`/training/stats`，也不新增 driver/new-employee 菜单。
   - 5 个迁移页均可见页面标题与筛选/主体结构，控制台无应用级 error/warn；375px 窄屏无横向页面溢出。
   - 培训计划：`getTrainingPlanItems` 的 page/pageSize/keyword/planType/status 请求参数正确；`getTrainingTypes`/`getPlanStatusFlow` 动态枚举请求正确；新建/编辑弹窗字段完整；导入入口可见。
   - 培训记录（台账）：`getLedgerList` 参数正确；统计卡（`getTrainingStats`）渲染；导入/导出入口可见且参数正确。
   - 考核管理：`getTrainingRequirements` 参数正确；CRUD 弹窗字段完整。
   - 证书管理：统计卡 + 记录列表（`getTrainingPlanList`）请求正确；附件上传弹窗与版本履历入口可见且参数正确；导入入口可见。
   - 综合考核：`getEnhancedTrainingStats` 请求正确；岗位完成率/到期人员渲染正常。
   - 所有写操作（计划/台账/要求/记录增删改、附件上传、计划执行、导入）**不执行**，仅在代码与运行时行为层面证明入口与参数，未执行项在总结中逐条说明原因。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06C-2-执行总结.md`，必须列出：变更文件（含 `src/api/training.ts` 删除与 `src/api/hse/training.ts` 新增、7 个视图 import 迁移）、路由精确映射（含对旧路径死链的修复与 `certificates` 目录差异说明、孤儿视图与旧版遗留 `hse-training.ts` 的处置说明）、API 契约逐函数对照（补全的 `getTrainingRequirement`、删除的 `exportTrainingPlans`/`exportTrainingRequirements` 及类型语义核对项逐条）、i18n 键值补齐对照、视图核对结论（逐页"一致/已修复"）、已验证浏览器步骤、未安全执行的写操作及原因、未实现/阻断项、截图/日志路径和命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始任何后续批次。