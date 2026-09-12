# 提示词：阶段 06D-1 - Naive HSE 人员管理·常规迁移（整改对齐基线）

## 任务目标

将"人员管理"一级菜单下 3 条**常规**子路由迁移对齐 `web-antd` 基线：`PersonnelPositions`（岗位管理）、`PersonnelProfile`（员工档案）、`PersonnelOverAge`（超龄人员）。

本批**不是从零迁移**：web-naive 已存在一套偏离基线的未跟踪实现（3 个视图文件齐全、已接线，但路由 name 带 `Hse` 前缀、icon 缺失、岗位管理缺部门树与权限控制、超龄人员功能严重缺失）。本次任务在保留已存在实现的前提下**整改路由/权限/API 到基线**，并对视图做逐项行为补齐与修复。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始后续批次（06D-2 导入、06D-3 redirect、06D-4、06D-5 均禁入）。

## 范围与前置说明（基于基线既定事实，须严格遵循）

1. 父路由 `HsePersonnel`（`name: 'HsePersonnel'`、`path: '/personnel'`、`redirect: '/personnel/employee'`、`order: 7`、`icon: 'lucide:users'`、`keepAlive: true`、`title: $t('page.hse.personnel')`）**保持不变**。**注意**：父路由 `authority` 现为 `['admin', 'safety_manager']`（阶段 05 角色模型修复的既定状态，非基线原始 `['admin']`），**保持现值不变，不得改回**；子路由权限逐条对齐基线（见 §精确范围）。
2. 本批唯一路由契约来源：`apps/web-antd/src/router/routes/modules/hse-07-personnel.ts`。**员工列表 `PersonnelEmployee` 与组织管理 `PersonnelDepartments` 已在前序阶段验收，本批**只回归不改**（其 name/icon 保持现状，不在整改范围）。花名册导入 `PersonnelImport`、批量导入 `PersonnelBatchImport`、作业中心 `PersonnelOrgCenter`（hide 纯 redirect）分别属 06D-2 / 06D-3，**禁入本批**。
3. **API 契约来源**：岗位管理/超龄人员 → 基线 `apps/web-antd/src/api/hse/employee.ts`；员工档案 → 基线 `apps/web-antd/src/api/hse/employee-profile.ts`；超龄人员"保险管控"相关 → 基线 `apps/web-antd/src/api/hse/insurance.ts`。web-naive 侧 `api/hse/employee.ts` 与 `api/hse/employee-profile.ts` **均已存在**，实施前逐项核对接口契约后**复用**（不得默认与旧版完全一致）；`api/hse/insurance.ts` 已有附件/版本 4 函数，但**缺超龄管控的 getOverAgeDetail/create/update/delete 4 个函数**，须按基线补全。
4. **前置决策（已定，勿再请示）**：部门树"展示全部 department"的后端语义调整**当前未授权**（阶段 05 遗留，见 `阶段06A-Naive-HSE菜单迁移清单.md` §五.2）。岗位管理页的部门树筛选/表单**沿用 `getDeptTree()` 现有返回行为**，不请求、不实现"展示全部（含未授权范围）department"的语义变更；若迁移验收实际需要该语义，须在执行总结列为阻断遗留项，另行申请授权，不得自行改后端。
5. **组件弱化（无对应 naive 组件）**：基线的 `HelpButton`（员工档案页）与 `EmployeeSelector`/`EmployeeName`（若出现）在 web-naive `components/hse/` 下**均不存在**（仅 HseActionBar/HseDataGrid/HseImportDialog/HsePageLayout/HseSearchPanel/HseSplitPane/HseStatusTag）。本批对 HelpButton 沿用"省略或在页面标题说明"的弱化，员工/责任人字段沿用 NInput 或 NSelect 既有弱化，**不新建自定义组件**，执行总结如实说明，遗留待后续统一评估。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`（§七 人员管理 + §06D-1 批次定义）
5. `G:\hse-dashboard\docs\Naive UI\阶段06C-3-审核.md`
6. 旧版路由（路由契约来源，必读）：`apps/web-antd/src/router/routes/modules/hse-07-personnel.ts`
7. 基线 API（必读）：`apps/web-antd/src/api/hse/employee.ts`、`apps/web-antd/src/api/hse/employee-profile.ts`、`apps/web-antd/src/api/hse/insurance.ts`（超龄管控 4 函数）
8. 后端路由（数据与端点契约，必读）：`server/routes/hse-employee.js`、`server/routes/over-age-personnel.js`、`server/routes/insurance.js`、`server/routes/import.js`（含 `over-age` 模块配置）
9. 对照视图（行为契约，必读）：`apps/web-antd/src/views/hse/employee/positions.vue`、`apps/web-antd/src/views/hse/employee-profile/index.vue`、`apps/web-antd/src/views/hse/employee/over-age/index.vue`
10. 已存在、需整改的 web-naive 对象（只允许在其基础上整流，不推倒重来）：
    - `apps/web-naive/src/router/routes/modules/hse-personnel.ts`
    - `apps/web-naive/src/api/hse/employee.ts`、`apps/web-naive/src/api/hse/employee-profile.ts`、`apps/web-naive/src/api/hse/insurance.ts`
    - `apps/web-naive/src/views/hse/employee/positions.vue`、`apps/web-naive/src/views/hse/employee/over-age/index.vue`、`apps/web-naive/src/views/hse/employee-profile/index.vue`
    - `apps/web-naive/src/locales/langs/zh-CN/page.json`、`en-US/page.json`

## 当前 web-naive 现状与偏差（整改对象）

| 对象 | 当前 web-naive | 基线目标 |
|---|---|---|
| 岗位管理 name | `HsePositionList` | `PersonnelPositions` |
| 岗位管理 authority | `['admin']` | `['admin', 'safety_manager']` |
| 岗位管理 icon | 缺失 | `lucide:briefcase` |
| 员工档案 name | `HseEmployeeProfile` | `PersonnelProfile` |
| 员工档案 icon | 缺失 | `lucide:file-user` |
| 超龄人员 name | `HseOverAgeList` | `PersonnelOverAge` |
| 超龄人员 icon | 缺失 | `lucide:user-round-x` |
| 岗位管理视图 | 无部门树筛选/表单（dept_id 用 NInputNumber）；无 `canEdit` 权限；多加了 status 筛选 | 补部门树（`getDeptTree`）+ `canEdit = hasAccessByRoles(['admin','safety_manager'])`；移除 status 筛选；dept_id 必填 |
| 员工档案视图 | 已基本可用（列表/搜索/详情抽屉）；缺 HelpButton；多加了统计卡 | name 改正 + 核对；HelpButton 弱化说明；统计卡保留与否说明 |
| 超龄人员视图 | 仅列表 + 4 统计卡 + 规则说明；无 查看/编辑、无编辑弹窗、无详情抽屉、无导入、导出为 stub；thresholds 键用 male/female | 对齐基线全量能力（见 §二） |
| `api/hse/insurance.ts` | 缺 getOverAgeDetail/createOverAge/updateOverAge/deleteOverAge | 按基线补全（`/insurance/overage`） |
| i18n en-US | 缺 positions/positionsDesc/employeeProfile/employeeProfileDesc/overAge/overAgeDesc 6 键 | 补全对齐 |

## 精确范围（目标路由结构）

在 `apps/web-naive/src/router/routes/modules/hse-personnel.ts` 中，仅整改以下 3 条子路由（name / authority / icon）；父路由与其余子路由（employee/departments）不动。禁止新建或改动 `routes/index.ts`、`ignoreAccess`、`publicRoutes`。

| 路由 name | path | authority | title（i18n key，中文） | icon | component |
|---|---|---|---|---|---|
| `PersonnelPositions` | `/personnel/positions` | `['admin', 'safety_manager']` | `$t('page.hse.positions')` 岗位管理 | `lucide:briefcase` | `#/views/hse/employee/positions.vue` |
| `PersonnelProfile` | `/personnel/profile` | `['admin']` | `$t('page.hse.employeeProfile')` 员工档案 | `lucide:file-user` | `#/views/hse/employee-profile/index.vue` |
| `PersonnelOverAge` | `/personnel/over-age` | `['admin']` | `$t('page.hse.overAge')` 超龄人员 | `lucide:user-round-x` | `#/views/hse/employee/over-age/index.vue` |

说明与注意：

- 3 条子路由全部菜单可见（无 `hideInMenu`）；岗位管理 authority 恢复基线 `['admin', 'safety_manager']`（与组织管理一致，符合阶段 05 角色模型）。
- 视图内所有内部跳转（`router.push` / 详情 / 关联跳转）须指向本批真实路由路径，不得沿用带 `Hse` 前缀的 route name 或失效路径；如有死链须修复并在执行总结说明。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 内的员工档案/岗位管理/超龄人员相关文件、`api/hse/insurance.ts`（仅补超龄管控 4 函数）、路由模块 `hse-personnel.ts`、locales 两个 page.json，以及本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite 配置或代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`、`publicRoutes` 或任何权限绕过；不得改变员工列表/组织管理的既有权限与路由。
- 相关人员管理文件当前为**未跟踪（untracked）**状态；请**先理解其已存在实现，再在其基础上整流**，不要笼统重写、不要删除后另起一套导致已有正确功能回退。
- 不得导入 `ant-design-vue`；使用 Naive UI、Vben、VXE 与现有 `components/hse/*`。统计卡沿用 `NCard` + `NStatistic` 惯例，**不新建 `HseStatCard`、`HelpButton`、`EmployeeSelector`、`EmployeeName` 等自定义组件**。
- 工具栏顺序固定为：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作。岗位管理/员工档案基线**无导入**；超龄人员基线**有导入**（后端 `import.js` 已配置 `over-age` → `over_age_personnel`，见 §二）。
- 列表表头居中；长文本 tooltip 省略；不提供列宽/列序拖动。仅当基线同列表确有服务端排序参数时才接入三态排序。
- 不得为验证创建、编辑或删除生产数据。超龄人员的编辑/导入/附件上传等均为写操作，除非存在明确授权的安全隔离数据，否则只验证到表单/弹窗可用、请求参数正确，并如实记录未执行原因，不得伪造写入成功。

## 一、API 契约整改要求

### 1. `api/hse/employee.ts`（岗位管理 + 超龄人员，核对复用，不改后端）

已有函数齐全（`getDeptTree` / `getPositionList` / `createPosition` / `updatePosition` / `deletePosition` / `getOverAgeAutoList` / `getOverAgeAutoStats` / `getOverAgeAutoDetail` / `exportOverAgeAutoList` 均已在 web-naive 侧存在），本批仅**逐项核对**与基线 + 后端一致，发现偏离需修正：

- `getPositionList`：请求参数（`page/pageSize/keyword/deptId/jobCategory/isSpecialPost`）与返回结构（`{list,total,page,pageSize}` 与旧版直接数组双兼容）须支持岗位管理页的服务端筛选与分页。
- `getDeptTree(params?: { includeInactive?: boolean })`：返回 `DeptNode[]`（`{id,name,children,...}`），供岗位管理页部门树筛选与表单选择；**沿用现有返回行为，不实现"展示全部 department"的未授权语义**。
- 超龄 `getOverAgeAutoStats()`：返回 `OverAgeAutoStats`，其中 `thresholds: Record<string, number>` 的**键为中文 `男` / `女`**（后端权威值，来自 `config/hseRules/employee-age-rule.json`），`byGender` / `byAgeGroup` 键同后端（`byGender['男']`、`byAgeGroup['70岁以上']` 等）。**不要**把 thresholds 键当作 `male`/`female`。
- `exportOverAgeAutoList()`：返回 Blob（`responseType: 'blob'`），导出 CSV。

### 2. `api/hse/employee-profile.ts`（员工档案，核对复用）

已有 `getProfileList` / `getProfileDetail` / `getProfileAssignments` / `getProfileDriverInfo` 齐全，核对请求参数（`page/pageSize/keyword/org_unit_id/position_id/is_driver`）、返回结构（列表 `{list,total}`、详情 `ProfileDetail{basic,currentOrg}` 等）与基线一致。若基线 `searchForm` 中 `org_unit_id`/`position_id` 实际未在 UI 使用（基线模板仅渲染 keyword + is_driver），以基线视图实际行为为准，不强制补前端筛选控件，仅保证列表请求可透传。

### 3. `api/hse/insurance.ts`（超龄"保险管控"，补全 4 函数）

naive 现有 `getInsuranceAttachments` / `uploadInsuranceAttachment` / `deleteInsuranceAttachment` / `getInsuranceVersions` 4 函数；**缺**超龄管控 4 函数，按基线 `apps/web-antd/src/api/hse/insurance.ts` 与后端 `server/routes/over-age-personnel.js` / `insurance.js` 补全：

| 函数 | 端点 | 说明 |
|---|---|---|
| `getOverAgeDetail(id)` | GET `/insurance/overage/{id}` | 取超龄人员保险管控记录 |
| `createOverAge(data)` | POST `/insurance/overage` | 新建管控记录（基线传 `personnel_id/name/id_card/gender/birth_date/age/dept/position` + 管控字段） |
| `updateOverAge(id, data)` | PUT `/insurance/overage/{id}` | 更新管控记录 |
| `deleteOverAge(id)` | DELETE `/insurance/overage/{id}` | 删除（基线索有，如后端存在则补；后端无则仅在总结说明不补，不得臆造端点） |

- 类型：基线以 `Record<string, any>` 承载，重点对齐**请求/响应字段键名**（`control_type`/`actual_insurance`/`has_injury`/`has_employer`/`compliance`/`expire_date`/`optimize_status`/`optimize_date`/`optimize_remark` 等 snake_case）与 `getInsuranceAttachments('overage', bizId)`、`getInsuranceVersions('overage', bizId)` 的调用方式。补全后以「后端 + 基线视图」为准核实端点与字段，不得照抄可能陈旧的孤立定义。

## 二、视图核对与修复要求

### 1. `hse/employee/positions.vue`（岗位管理）

以基线 `web-antd/.../employee/positions.vue` 为唯一行为契约，补齐/修复：

- **部门树筛选**：搜索区补「所属部门」`NTreeSelect`（数据来自 `getDeptTree()`，fieldNames `{children:'children',label:'name',value:'id'}`，`default-expand-all`），`searchForm.deptId` 并入 `getPositionList` 请求。当前 naive 无此筛选，需补。
- **部门树表单选择**：编辑弹窗「所属部门」由当前 `NInputNumber`（dept_id）改为 `NTreeSelect`（同上数据源），且 `dept_id` 设为**必填**（基线 提示词-122 P3：避免无归属岗位成为数据孤岛）；提交校验须落地该必填。
- **权限控制 `canEdit`**：补 `const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']))`（`useAccess` from `@vben/access`），新增/编辑/删除入口均以 `canEdit` 门禁（对齐基线）。
- **移除多余 status 筛选**：基线搜索区为 keyword / deptId / jobCategory / specialPost（**无 status**）。当前 naive 多加了 status 筛选，须移除以对齐；表格的「状态」列保留。
- 其余（关键字/岗位类别/特种作业筛选、表格列、CRUD 弹窗字段 `position_code/name/dept_id/job_category/is_special_post/is_safety_critical/safety_duties/sort_order/status`）核对与基线一致。
- 工具栏：基线仅「新增岗位」主按钮（无导入/导出/模板下载），naive 当前 actionState 已隐藏 downloadTemplate/import/export，保持，仅保留新增。

### 2. `hse/employee-profile/index.vue`（员工档案）

以基线 `web-antd/.../employee-profile/index.vue` 为行为契约，本页已基本完成，仅：

- 路由 name 已在外层路由整改（`HseEmployeeProfile` → `PersonnelProfile`），视图内 `defineOptions({ name: ... })` 同步改动以保持 SFC name 与路由 name 一致。
- **HelpButton**：基线有 `<HelpButton menuCode="HSE_EMPLOYEE_PROFILE" />`；web-naive 无此组件，本批省略（或在标题区用 `NText` 辅助说明），执行总结如实说明为弱化项。
- **统计卡**：当前 naive 多出的 3 张统计卡（档案总数/当前页在职/当前页驾驶员）基线无；属 naive 增强，如无副作用可**保留但在执行总结说明为偏离**，若需严格对齐可移除——二选一并说明理由。
- 列表列（员工编号/姓名/性别/年龄/所属组织/作业单元/岗位/入职日期/是否驾驶员/状态）、搜索（keyword/is_driver）、详情抽屉（基础信息/当前组织信息/任职历史/驾驶员信息，字段 `basic`/`currentOrg`/`assignments`/`driverInfo`，含身份证/手机号脱敏 `ENC:` 前缀与掩码）核对与基线一致；详情抽屉字段对齐基线（基线有 `currentOrg.org_code/org_type/position_code/risk_level/supervisor_name/assignment_status`、基础信息有 `gender/birth_date/person_type/is_public_welfare/created_at` 等，naive 缺其中若干列时按基线补齐）。

### 3. `hse/employee/over-age/index.vue`（超龄人员）——本批工作量最大

以基线 `web-antd/.../employee/over-age/index.vue` 为唯一行为契约，naive 当前仅列表 + 统计卡 + 规则说明，须补齐以下基线的完整能力：

- **统计卡**：保留 4 张（超龄人员总数 / 男性超龄 / 女性超龄 / 70岁以上）。`byGender`/`byAgeGroup` 键对齐后端中文键（`byGender['男']`、`byGender['女']`、`byAgeGroup['70岁以上']`）。
- **规则说明 `ruleDescription`**：阈值读取改对齐后端 `stats.thresholds['男'] / ['女']`（当前 naive 误用 `thresholds.male/female`，因后端键为中文，实际恒回退 60/50，须修正）；阈值缺失时回退 60/50 占位。
- **表格**：补「操作」列——每行「查看」+「编辑」。列（姓名/性别/年龄/超龄年数/出生日期/身份证号脱敏/部门/岗位/联系方式脱敏/人员类型）与基线一致（当前缺「操作」列）。
- **查看（详情抽屉）**：点击「查看」打开抽屉，标题「超龄人员详情」，内以 `NTabs`/`NTabPane` 分三页签：
  - 「基本信息」：阈值 alert（`男性 X岁 / 女性 X岁` + 当前年龄/超龄年数）+ `NDescriptions`（姓名/性别/身份证号脱敏/工号/出生日期/年龄/年龄阈值/超龄年数/部门/岗位/联系方式脱敏/人员类型/人员分类/是否公益岗）。数据来自当前行 record（与基线一致，不额外调 `getOverAgeAutoDetail`）。
  - 「附件列表」：上传按钮（pdf/doc/docx/xls/xlsx/png/jpg/jpeg，单文件 <10MB）+ 附件表（文件名/版本/大小/上传人/操作：下载+删除），走 `getInsuranceAttachments('overage', bizId)` / `uploadInsuranceAttachment('overage', bizId, file, {uploadedBy})` / `deleteInsuranceAttachment('overage', bizId, id)`，其中 `bizId = record.over_age_id || record.id`。
  - 「历史版本」：版本表（版本号/变更类型/变更说明/操作人/变更时间），走 `getInsuranceVersions('overage', bizId)`；变更类型文案/颜色映射（create→新增、update→更新、import→导入、revise→修订、delete→删除）对齐基线 `getChangeTypeText/getChangeTypeColor`。
- **编辑（保险管控弹窗）**：点击「编辑」打开 `NModal`「编辑保险管控信息」，字段：`control_type`(管控类型：重点关注/一般关注/定期复查)、`actual_insurance`(实际保险)、`has_injury`(工伤险 有/无)、`has_employer`(雇主险 有/无)、`compliance`(合规情况：合规/不合规/待确认)、`expire_date`(保险到期日，NDatePicker)、`optimize_status`(优化状态：待处理/处理中/已完成/无需处理)、`optimize_date`(优化日期)、`optimize_remark`(优化备注)。打开时若 `record.over_age_id` 存在则 `getOverAgeDetail(over_age_id)` 反填，否则默认值；保存时存在 `over_age_id` 走 `updateOverAge`，否则 `createOverAge`（带 `personnel_id/name/id_card/gender/birth_date/age/dept/position`），日期 `format('YYYY-MM-DD')`，成功后刷新列表。
- **导入**：启用工具栏「导入」入口，遵循既有通用导入模式（`#/views/hse/_shared/useGenericImport` + `HseImportDialog`，参考 `views/emergency/plans/index.vue` 的 `useGenericImport('emergency')` 用法），module 传 `'over-age'`（后端 `server/routes/import.js` 已配置 `over-age` → `over_age_personnel`，模块名「超龄人员管控」）。同时「下载模板」应可用。
- **导出**：将当前 stub `message.info('导出功能开发中')` 改为真实 `exportOverAgeAutoList()`（Blob → CSV 下载，文件名 `超龄人员清单_YYYYMMDD.csv`），并保留基线对非 CSV/文本响应（如 JSON 错误）的解析报错处理。
- 内部跳转/死链：本页无路由跳转，核对即可。

## 三、i18n 补齐与核对要求

`page.hse` 人员管理相关键：

- zh-CN 已齐（`personnel`/`employee(+Desc)`/`departments(+Desc)`/`positions(+Desc)`/`employeeProfile(+Desc)`/`overAge(+Desc)`），**核对**值正确（岗位管理/员工档案/超龄人员 + 各自 Desc）。
- en-US **缺 6 键须补齐**：`positions`、`positionsDesc`、`employeeProfile`、`employeeProfileDesc`、`overAge`、`overAgeDesc`，值对齐 zh-CN 语义（各 Desc 沿用「server pagination / …」英文风格，与相邻键一致）。
- 不得硬编码中文标题跳过 i18n；3 个路由 title 与 3 个视图引用键须在两 locale 命中。

## 验证与交付

1. 在 `安全看板vben` 运行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
```

2. 使用 admin 登录态浏览器做**无写入**验证（截图 + 原始网络请求/控制台日志路径）：
   - 人员管理菜单展开：岗位管理 / 员工档案 / 超龄人员可见且 default 落点、路由 name 无 `Hse` 前缀（路由表 + 代码 grep 佐证）；菜单入口权限符合 baseline（岗位管理 admin+safety_manager，其余 admin）。
   - 岗位管理：`getDeptTree` 与 `getPositionList`（page/pageSize/keyword/deptId/jobCategory/isSpecialPost）请求参数正确；部门树筛选与表单部门树可选；`dept_id` 必填校验生效；弹窗字段完整；safety_manager 账号可达且 CRUD 门禁符合 `canEdit`（如无真实账号，说明并以 admin 验证 + 权限代码佐证）。
   - 员工档案：`getProfileList` 参数正确；详情抽屉三块（基础/组织/任职历史/驾驶员）字段完整、脱敏正确；HelpButton 弱化说明。
   - 超龄人员：`getOverAgeAutoStats`（阈值 `thresholds['男'/'女']`）与 `getOverAgeAutoList`（page/pageSize/keyword/gender）参数正确；查看抽屉三页签（基本信息阈值文案、附件列表、历史版本）渲染且 `getInsuranceAttachments/getInsuranceVersions('overage', bizId)` 请求正确；编辑弹窗字段完整、`getOverAgeDetail` 反填（无授权隔离数据时只验证入口与参数）；导入入口（`useGenericImport('over-age')` + 下载模板）与导出入口接线正确；导出/导入不落盘、不写库。
   - 375px 窄屏无横向页面溢出；控制台无应用级 error/warn（如受工具视口限制，如实说明）。
   - 所有写操作（超龄编辑、导入、附件上传/删除等）**不执行**，仅在代码与运行时行为层面证明入口与参数，未执行项在总结逐条说明原因。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06D-1-执行总结.md`，必须列出：变更文件、路由精确映射（name 去 `Hse` 前缀 + authority + 3 个 icon、员工列表/组织管理仅回归说明）、API 契约逐项（`employee.ts`/`employee-profile.ts` 核对结论、`insurance.ts` 补全 4 函数及端点核实）、视图核对结论（逐页"已对齐/已修复/已补齐"）、i18n 补齐（en-US 6 键）、已验证浏览器步骤、未安全执行的写操作及原因、未实现/阻断项（含部门树"展示全部 department"未授权语义）、截图/日志路径与命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始任何后续批次。