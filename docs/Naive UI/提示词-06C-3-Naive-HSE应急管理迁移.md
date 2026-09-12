# 提示词：阶段 06C-3 - Naive HSE 应急管理迁移（整改对齐基线）

## 任务目标

将"应急管理"一级菜单迁移到 `web-naive` 并**整改对齐 `web-antd` 基线**。本批 5 条路由：`EmergencyPlans`（应急预案，阶段 04 已验收，仅回归）+ `EmergencyDrills`（应急演练）+ `EmergencyMaterials`（应急物资）+ `EmergencyTeams`（应急队伍）+ `EmergencyEvents`（应急事件），**全部菜单可见，无 hidden 路由**。

特殊背景：web-naive 目前已存在一套**偏离基线的现有实现**（5 个视图文件齐全且均已接线，功能基本可用；但路由 name 全部带 `Hse` 前缀、子路由 icon 全部缺失、API 适配层分散为 `src/api/emergency/` 下 5 个文件而非基线的单一 `src/api/hse/emergency.ts`）。本次任务**不是从零迁移视图**，而是**在保留已存在视图的前提下整改路由/菜单/API 到基线**，并对视图做逐项行为核对与修复。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始后续批次。

## 范围与前置说明（基于基线既定事实，须严格遵循）

1. 父菜单标题为**"应急管理"**（基线 `hse-09-emergency.ts` 的 title）。父路由 `name: 'HseEmergency'`、`path: '/emergency'`、`redirect: '/emergency/plans'`、`order: 9`、`authority: ['admin']`、`keepAlive: true`、`icon: 'lucide:siren'`。**父路由 name 与基线一致（均为 `HseEmergency`），保持不变**；只有 5 条子路由的 name 需要去掉 `Hse` 前缀。
2. 本批唯一路由契约来源是 `apps/web-antd/src/router/routes/modules/hse-09-emergency.ts`（5 条子路由，全部菜单可见，无 `hideInMenu`）。不存在其它"旧版遗留"路由文件用于混淆。
3. **API 契约来源的特殊性（务必先理解再动手）**：
   - 基线 `apps/web-antd/src/api/hse/emergency.ts` 是**孤儿文件**——5 个基线视图（`plans`/`drills`/`materials`/`teams`/`events`）**均不 import 它**，而是直接 `import request from '#/api/request'` 后用裸 `request.get/post/put/delete` 调后端。
   - 该孤儿文件使用 **camelCase** 字段与部分陈旧定义（例如其 `getEmergencyStats` 指向 `/emergency/stats`、`EmergencyStats` 类型写 `totalPlans/activePlans/...`），与本批后端 + 视图实际行为不符。
   - 后端 `server/routes/emergency.js` 的 `formatPlanRow/formatDrillRow/formatMaterialRow/formatTeamRow/formatEventRow` **同时返回 camelCase 与 snake_case 两套键**（双键快照），因此两种命名皆可解析。
   - 因此：本批 API 的**行为契约来源 = 基线视图 + 后端路由**，而非孤儿 API 文件。`api/hse/emergency.ts` 仅作为「**文件位置 + 函数清单**」参考，不得逐字段照抄其已被证明陈旧的类型/端点。
4. 应急预案 `EmergencyPlans` 在阶段 04 已验收，本批**仅**将 name 从 `HseEmergencyPlans` 恢复为基线名 `EmergencyPlans` 并补 icon，**不改动其视图功能、路径、权限**；其余 4 个子路由为本次整改主体。
5. 5 个视图的**目录层级与命名与基线完全一致**（`views/emergency/{plans,drills,materials,teams,events}/index.vue`），无 06C-1/06C-2 那样的目录差异或孤儿视图，不涉及移动/新建文件。
6. **`EmployeeSelector`/`EmployeeName` 弱化**：基线视图用 `#/components/hse/EmployeeSelector.vue`（选责任人/队长/关联人员）与 `#/composables/hse` 的 `EmployeeName`（按 ID 显示姓名）；web-naive 侧 **无此组件**（`components/hse/` 下仅 HseActionBar/HseDataGrid/HseImportDialog/HsePageLayout/HseSearchPanel/HseSplitPane/HseStatusTag 等）。与 06C-2 岗位字段同属一类遗留，本批**沿用普通输入框弱化（保留 snake_case 兼容字段 `responsible_person`/`leader_name` 等）**，在执行总结如实说明，不新建自定义组件，遗留待后续统一评估。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06C-2-审核.md`
6. 旧版路由（路由契约来源，**必读**）：`apps/web-antd/src/router/routes/modules/hse-09-emergency.ts`
7. 基线 API（文件位置/函数清单参考，**必读但注意孤儿性质**）：`apps/web-antd/src/api/hse/emergency.ts`
8. 后端路由（数据与端点契约，**必读**）：`server/routes/emergency.js`
9. 对照视图（行为契约，**必读**）：`apps/web-antd/src/views/emergency/` 下 `plans/`、`drills/`、`materials/`、`teams/`、`events/` 五个 `index.vue`
10. 已存在、需整改的 web-naive 对象（只允许在其基础上整流，不推倒重来）：
    - `apps/web-naive/src/router/routes/modules/emergency.ts`
    - `apps/web-naive/src/api/emergency/{plans,drills,materials,teams,events}.ts`（**合并为** `apps/web-naive/src/api/hse/emergency.ts`）
    - `apps/web-naive/src/views/emergency/{plans,drills,materials,teams,events}/index.vue`（共 5 个）
    - `apps/web-naive/src/locales/langs/zh-CN/page.json`、`en-US/page.json`

## 当前 web-naive 现状与偏差（整改对象）

以下为已核实的偏差，须逐项整改到基线：

| 对象 | 当前 web-naive | 基线目标 |
|---|---|---|
| 父路由 name / path / redirect | `HseEmergency` `/emergency` → `/emergency/plans`（正确） | 保持不变 |
| 父路由 title | `$t('page.hse.emergency')` = 应急管理（键已存在） | 保持不变 |
| 应急预案 name | `HseEmergencyPlans` | `EmergencyPlans` |
| 应急演练 name | `HseEmergencyDrills` | `EmergencyDrills` |
| 应急物资 name | `HseEmergencyMaterials` | `EmergencyMaterials` |
| 应急队伍 name | `HseEmergencyTeams` | `EmergencyTeams` |
| 应急事件 name | `HseEmergencyEvents` | `EmergencyEvents` |
| 子路由 icon | 5 个子路由**全部缺失** | plans=`lucide:file-warning`、drills=`lucide:users-round`、materials=`lucide:package`、teams=`lucide:shield-users`、events=`lucide:alert-triangle` |
| API 文件位置 | `src/api/emergency/` 下 5 个独立文件 | `src/api/hse/emergency.ts`（单一文件） |
| 视图 API import | `#/api/emergency/{plans,drills,materials,teams,events}` | `#/api/hse/emergency` |
| i18n（zh-CN / en-US） | `page.hse.emergency*` 11 键已存在 | 核对对齐（见 §三） |

## 前置决策（已定）

1. **路由 name 统一去 `Hse` 前缀**：5 个子路由（含阶段 04 已验收的 `HseEmergencyPlans`）一并恢复基线名 `Emergency*`，与 06C-2 培训考核命名对齐原则一致。仅改 name、`path` 不变。
2. **API 合并到 `src/api/hse/emergency.ts`**：把 5 个独立文件合并为单一文件，目录与其余 HSE 模块（`api/hse/*.ts`）及 06C-2 先例一致；5 个视图 import 同步改为 `#/api/hse/emergency`。

## 精确范围（目标路由结构）

在 `apps/web-naive/src/router/routes/modules/emergency.ts` 中，将 `HseEmergency.children` 的 5 条子路由 name 改为基线名并补齐 icon；父路由 `HseEmergency`（`name: 'HseEmergency'`、`path: '/emergency'`、`redirect: '/emergency/plans'`、`order: 9`、`authority: ['admin']`、`keepAlive: true`、`icon: 'lucide:siren'`、`title: $t('page.hse.emergency')`）保持不变。禁止新建或改动 `routes/index.ts`、`ignoreAccess`、`publicRoutes`。

| 路由 name | path | 菜单与权限 | title（i18n key，中文） | icon | component |
|---|---|---|---|---|---|
| `EmergencyPlans` | `/emergency/plans` | admin，菜单可见 | `$t('page.hse.emergencyPlans')` 应急预案 | `lucide:file-warning` | `#/views/emergency/plans/index.vue` |
| `EmergencyDrills` | `/emergency/drills` | admin，菜单可见 | `$t('page.hse.emergencyDrills')` 应急演练 | `lucide:users-round` | `#/views/emergency/drills/index.vue` |
| `EmergencyMaterials` | `/emergency/materials` | admin，菜单可见 | `$t('page.hse.emergencyMaterials')` 应急物资 | `lucide:package` | `#/views/emergency/materials/index.vue` |
| `EmergencyTeams` | `/emergency/teams` | admin，菜单可见 | `$t('page.hse.emergencyTeams')` 应急队伍 | `lucide:shield-users` | `#/views/emergency/teams/index.vue` |
| `EmergencyEvents` | `/emergency/events` | admin，菜单可见 | `$t('page.hse.emergencyEvents')` 应急事件 | `lucide:alert-triangle` | `#/views/emergency/events/index.vue` |

说明与注意：

- 5 条子路由**全部菜单可见**，无 `hideInMenu` 项；`/emergency` 默认落 `/emergency/plans`。
- 视图内所有内部跳转（`router.push` / 详情 / 关联跳转）必须指向本批真实路由路径（`/emergency/plans`、`/emergency/drills`、`/emergency/materials`、`/emergency/teams`、`/emergency/events`），不得沿用带 `Hse` 前缀的 route name 或任何旧/失效路径；如有死链须修复并在执行总结说明。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 内的应急管理相关文件与本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite 配置或代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`、`publicRoutes` 或任何权限绕过；不得改变既有菜单/路由的权限。
- `web-naive` 中应急管理相关文件当前为**未跟踪（untracked）**状态；请**先理解其已存在实现，再在其基础上整流**，不要笼统重写、不要删除后另起一套导致已有正确功能回退。
- 不得导入 `ant-design-vue`；使用 Naive UI、Vben、VXE 与现有 `components/hse/*`。统计卡片沿用已迁移页面的 `NCard` + `NStatistic` 惯例，**不新建 `HseStatCard` 类自定义组件，不新建 `EmployeeSelector` 类自定义组件**。
- 工具栏顺序固定为：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作（materials/teams/events 基线**无导入**入口，仅导出+新增；plans/drills 基线有导入入口但后端未实现，按基线实况处理——见 §二）。
- 列表表头居中；长文本 tooltip 省略；不提供列宽/列序拖动。仅当基线同列表确有服务端排序参数时才接入三态排序（应急预案 `effective_date` 支持排序）。
- 不得为验证创建、编辑或删除生产数据。应急预案/演练/物资/队伍/事件的新增编辑删除、附件上传、导入等均为**写操作**，除非存在明确授权的安全隔离数据，否则只验证到表单/弹窗可用、请求参数正确，并如实记录未执行原因，不得伪造写入成功。

## 一、API 契约整改要求

契约 = **基线视图实际调用的端点 + 后端 `server/routes/emergency.js` 返回结构**；`apps/web-antd/src/api/hse/emergency.ts` 仅作文件位置与函数清单参考（其 camelCase 类型与 `/emergency/stats`、`totalPlans` 等定义为陈旧快照，勿照抄）。逐项对齐 URL、HTTP 方法、参数键名、路径参数位置、响应结构，仅补全缺失、修正偏离，不改动已对齐且正常工作的项。

### 1. 文件位置合并（必做）

将 `apps/web-naive/src/api/emergency/` 下 5 个文件（`plans.ts`/`drills.ts`/`materials.ts`/`teams.ts`/`events.ts`）**合并为单一** `apps/web-naive/src/api/hse/emergency.ts`，随后将 5 个视图的 import 由 `#/api/emergency/{plans,drills,materials,teams,events}` 改为 `#/api/hse/emergency`：

- `views/emergency/plans/index.vue`
- `views/emergency/drills/index.vue`
- `views/emergency/materials/index.vue`
- `views/emergency/teams/index.vue`
- `views/emergency/events/index.vue`

合并后删除 `apps/web-naive/src/api/emergency/` 整个目录，不得留下新旧两份同名实现。命名空间可保留 5 个子命名空间（`EmergencyApi`/`EmergencyDrillApi`/`EmergencyMaterialApi`/`EmergencyTeamApi`/`EmergencyEventApi`）或合并为单一 `EmergencyApi`，但必须保证 5 个视图的 import 与类型引用在合并后仍通过 typecheck，且选择在执行总结说明。

### 2. 补全缺失函数（基线 API 文件有、naive 无、后端确实存在对应端点）

以下函数在基线 `hse/emergency.ts` 中存在、naive 缺少，且后端 `server/routes/emergency.js` 存在对应端点，须按端点补全：

- `getEmergencyPlanDetail(id: number)`：GET `/emergency/plans/{id}`，返回 `EmergencyApi.EmergencyPlan`（后端 `/plans/:id` 存在）。
- `getPlanAttachments(id: number, version?: string)`：GET `/emergency/plans/{id}/attachments`（后端存在）。
- `uploadPlanAttachment(id: number, file: File, options: { version?: string; uploadedBy?: string })`：POST `/emergency/plans/{id}/attachments`，`FormData` 含 `file`/`version`/`uploaded_by`（后端存在）。
- `deletePlanAttachment(id: number, aid: number)`：DELETE `/emergency/plans/{id}/attachments/{aid}`（后端存在）。
- `getPlanVersions(id: number)`：GET `/emergency/plans/{id}/versions`（后端存在）。

### 3. 保留 naive 特有、基线视图以裸 request 等价的函数

naive 现有、基线 `hse/emergency.ts` 无、但**基线视图确实通过裸 `request.get('/emergency/{drills,materials,teams,events}/stats')` 调用同端点**的 4 个统计函数，属等价封装，**保留**（执行总结说明其为基线视图裸调用的封装化）：

- `getDrillStats()` → `/emergency/drills/stats`
- `getMaterialStats()` → `/emergency/materials/stats`
- `getTeamStats()` → `/emergency/teams/stats`
- `getEventStats()` → `/emergency/events/stats`

### 4. 修正端点/类型偏离（naive 更贴近后端 + 视图，保留 naive 语义并说明）

以下为确认的偏离，处理原则是**以「后端 + 基线视图」为准，如与基线孤儿 API 文件冲突，保留更贴近后端的实现并在总结说明**：

- `getEmergencyStats`：naive 指向 `/emergency/plans/stats`（与基线 plans 视图 `request.get('/emergency/plans/stats')` 及后端 `/plans/stats` 一致，返回 `{ total, published, pendingReview, byType }`）。基线孤儿文件指向 `/emergency/stats`（返回结构不同，系另一端点）。**保留 naive 的 `/emergency/plans/stats`**，执行总结说明。
- `EmergencyStats` 类型：naive 为 `{ total, published, pendingReview }`（对齐后端 `/plans/stats` 返回），基线孤儿文件写 `{ totalPlans, activePlans, ... }`（陈旧）。**保留 naive 类型**，执行总结说明。
- 字段命名：后端 `formatXxx` 双键（camel + snake 皆返回）。naive 用 snake_case（与基线视图表单绑定 `responsible_dept`/`drill_type`/`expire_date`/`leader_name`/`member_ids`/`event_level`/`happen_time` 等及表头 `dataIndex` 的 snake_case 列一致）、基线孤儿文件用 camelCase。**合并后以「不破坏既已工作的视图字段绑定」为第一原则**，可保留 snake_case 并在必要处补 camelCase 别名，逐字段核对后端 `formatXxx` 输出与基线视图 `dataIndex`/`v-model` 绑定无字段断裂，最终命名策略在执行总结逐条说明。

### 5. 已对齐项（核对即可，勿改动语义）

以下函数与基线 URL/方法/参数一致，仅作回归确认：

- 预案：`getEmergencyPlanList`、`createEmergencyPlan`、`updateEmergencyPlan`、`deleteEmergencyPlan`、`exportEmergencyPlans`（`/emergency/plans/export`）。
- 演练：`getDrillList`、`getDrillDetail`、`createDrill`、`updateDrill`、`deleteDrill`、`exportEmergencyDrills`（`/emergency/drills/export`）。
- 物资：`getMaterialList`、`createMaterial`、`updateMaterial`、`deleteMaterial`、`exportMaterials`（`/emergency/materials/export`）。
- 队伍：`getTeamList`、`createTeam`、`updateTeam`、`deleteTeam`、`exportTeams`（`/emergency/teams/export`）。
- 事件：`getEventList`、`createEvent`、`updateEvent`、`deleteEvent`、`exportEvents`（`/emergency/events/export`）。

注意：导出函数保持 naive 现用的 `requestClient.download(...)`（正确返回 Blob）即可；基线视图用 `request.get(..., { responseType: 'blob' })` + 手动 `downloadBlob`，二者等价，无需改为裸 request。

## 二、视图核对与修复要求

5 个视图已存在于 web-naive（皆未跟踪），须以旧版同路径视图为唯一行为契约逐页核对，修复与基线不符处，并在执行总结逐页列明"已核对一致 / 已修复项"。重点核对：

- `plans/index.vue`（应急预案，仅回归）：确认统计卡（`getEmergencyStats` → `/emergency/plans/stats`：预案总数/已发布/待复审）、筛选（关键词/类型/状态）、列表（预案名称/类型/状态/负责部门/负责人/生效日期/到期日期/时效状态）、CRUD、导出（`exportEmergencyPlans`）。表单字段（名称/类型/级别/负责部门/负责人/联系电话/状态/生效日期/到期日期/描述/内容）与基线一致。基线"导入"入口后端**未实现**（`message.info('导入功能开发中')`），naive 按同事实处理并在总结说明，不得伪造导入成功。
- `drills/index.vue`：确认统计卡（`getDrillStats`：本年演练次数/完成率/参与人次/不合格）、筛选（关键词/演练类型/结果/关联预案）、列表（编号/演练名称/乡镇/演练级别/演练类型/演练日期/地点/组织单位/参演人数/时长/结果/状态）、关联预案下拉（`getEmergencyPlanList` 拉取选项）、CRUD、导出。表单字段（关联预案/名称/类型/日期/地点/人数/时长/结果/状态/组织单位/备注）完整。
- `materials/index.vue`：确认统计卡（`getMaterialStats`：总数/正常/临期/过期）、筛选（关键词/类别/状态）、列表（名称/类别/规格/数量/位置/责任人/到期日期/状态）、CRUD、导出；**无导入入口**。责任人字段为 NInput 弱化、保留 `responsible_person` 兼容字段（无 EmployeeSelector）。
- `teams/index.vue`：确认统计卡（`getTeamStats`：总数/人员数/专职/兼职）、筛选（关键词/类型/部门）、列表（名称/类型/部门/队长/联系电话/队员人数）、CRUD（队员多选 `member_ids`）、导出；**无导入入口**。队长字段 NInput 弱化、保留 `leader_name` 兼容字段。
- `events/index.vue`：确认统计卡（`getEventStats`：本年事件数/处置中/已结案/平均处置时长）、筛选（关键词/等级/状态）、列表（标题/等级/发生时间/地点/报告人/状态）、CRUD、导出；**无导入入口**。关联人员字段 NInput 弱化。

所有内部跳转指向本批真实路由路径（见"精确范围"说明与注意），不得沿用带 `Hse` 前缀的 name 或失效路径死链。

## 三、i18n 核对要求

`page.hse.emergency*` 11 键在 zh-CN 与 en-US 中**均已存在**（`emergency`、`emergencyPlans`、`emergencyPlansDesc`、`emergencyDrills`、`emergencyDrillsDesc`、`emergencyMaterials`、`emergencyMaterialsDesc`、`emergencyTeams`、`emergencyTeamsDesc`、`emergencyEvents`、`emergencyEventsDesc`）。本批仅需**核对**：

- 5 个路由 title 与 5 个视图所引用的每个 `page.hse.emergency*` 键在两个 locale 中均存在且值正确（中文对应：应急管理/应急预案/应急演练/应急物资/应急队伍/应急事件 + 各自 Desc）。
- 不得硬编码中文标题跳过 i18n；如有个别键语义与基线中文标题（应急预案/应急演练/应急物资/应急队伍/应急事件）不符，修正并在执行总结说明。

## 验证与交付

1. 在 `安全看板vben` 运行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
```

2. 使用 admin 登录态浏览器做**无写入**验证（截图 + 原始网络请求/控制台日志路径）：
   - "应急管理"菜单展开显示 5 项：应急预案、应急演练、应急物资、应急队伍、应急事件；`/emergency` 默认落 `/emergency/plans`；菜单与路由中不再出现带 `Hse` 前缀的 name（肉眼不可见，以路由表与代码 grep 佐证）。
   - 5 个页面均可见页面标题与筛选/统计/主体结构，控制台无应用级 error/warn；375px 窄屏无横向页面溢出。
   - 应急预案：`getEmergencyStats`（`/emergency/plans/stats`）与 `getEmergencyPlanList`（page/pageSize/keyword/type/status）请求参数正确；CRUD 弹窗字段完整；导出/导入入口按基线实况呈现。
   - 应急演练：`getDrillStats` 与 `getDrillList` 参数正确；关联预案下拉（`getEmergencyPlanList`）有数据；CRUD 弹窗字段完整；导出入口可用。
   - 应急物资：`getMaterialStats` 与 `getMaterialList`（`/emergency/materials/list`）参数正确；CRUD 弹窗字段完整；导出入口可用（无导入）。
   - 应急队伍：`getTeamStats` 与 `getTeamList`（`/emergency/teams/list`）参数正确；队员多选字段可用；导出入口可用（无导入）。
   - 应急事件：`getEventStats` 与 `getEventList`（`/emergency/events/list`）参数正确；CRUD 弹窗字段完整；导出入口可用（无导入）。
   - 所有写操作（预案/演练/物资/队伍/事件增删改、附件上传、导入）**不执行**，仅在代码与运行时行为层面证明入口与参数，未执行项在总结中逐条说明原因。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06C-3-执行总结.md`，必须列出：变更文件（含 `src/api/emergency/` 5 文件删除与 `src/api/hse/emergency.ts` 新增、5 个视图 import 迁移、`emergency.ts` 路由整改）、路由精确映射（含 name 去 `Hse` 前缀 + 5 个 icon 补全、应急预案仅回归说明、死链修复说明）、API 契约逐函数对照（合并方式、补全的 `getEmergencyPlanDetail`/附件/版本函数、保留的 4 个 per-modile 统计函数、`getEmergencyStats` 端点与 `EmergencyStats` 类型偏离说明、字段命名策略逐条）、i18n 核对结论、视图核对结论（逐页"一致/已修复"）、已验证浏览器步骤、未安全执行的写操作及原因、未实现/阻断项、截图/日志路径和命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始任何后续批次。