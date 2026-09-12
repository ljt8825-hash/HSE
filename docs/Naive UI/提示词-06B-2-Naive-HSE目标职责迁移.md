# 提示词：阶段 06B-2 - Naive HSE 目标职责迁移

## 任务目标

仅迁移“目标职责”一级菜单中**非月度安全履职考核**的 4 条既有路由到 `web-naive`，保持旧版的路由、权限、接口契约和实际业务能力。统一使用已经验收的 Naive HSE 页面、筛选、工具栏、VXE 表格和导入组件。

完成后提交执行总结并停止，等待 Codex 审核；未经审核通过不得开始 06B-3 或任何其他批次。

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06B-1-第二轮修复-Codex审核.md`
6. 旧版路由与 API：
   - `apps/web-antd/src/router/routes/modules/hse-02-objectives.ts`
   - `apps/web-antd/src/api/hse/goals.ts`
   - `apps/web-antd/src/api/hse/employee.ts`
7. 四个旧版页面全文（包括 template、script、样式和实际 import）：
   - `apps/web-antd/src/views/goals/index.vue`
   - `apps/web-antd/src/views/objectives/committee/index.vue`
   - `apps/web-antd/src/views/objectives/assessment/index.vue`
   - `apps/web-antd/src/views/objectives/budget/index.vue`

## 精确范围

新增目标路由模块 `apps/web-naive/src/router/routes/modules/hse-objectives.ts`，由既有 `import.meta.glob` 自动发现。只允许包含以下父路由和 4 个子路由：

| 路由 name | path | 菜单与权限 | 旧版页面 |
|---|---|---|---|
| `HseObjectives` | `/objectives` | `order: 2`、`authority: ['admin']`、`keepAlive: true`、redirect `/objectives/responsibility` | 父路由 |
| `ObjectivesResponsibility` | `/objectives/responsibility` | admin，可见 | `views/goals/index.vue` |
| `ObjectivesCommittee` | `/objectives/committee` | admin，可见 | `views/objectives/committee/index.vue` |
| `ObjectivesAssessment` | `/objectives/assessment` | admin，`hideInMenu: true` | `views/objectives/assessment/index.vue` |
| `ObjectivesBudget` | `/objectives/budget` | admin，可见 | `views/objectives/budget/index.vue` |

不属于本批、不得创建路由/页面/占位符：

- `AssessmentMonthlyIndex` `/objectives/assessment-monthly` 及其 7 条隐藏子路由，全部属于 06B-3。
- 任何其他一级菜单、菜单外视图或看板页。

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 和本任务执行总结 Markdown。
- 禁止修改 `web-antd`、`server`、SQL、数据库、账号、现有业务数据、依赖、锁文件、Vite 配置或代理配置。
- 禁止修改 `src/router/routes/index.ts`，禁止增加 `ignoreAccess`、`publicRoutes` 或任何权限绕过；不得改变既有菜单/路由的权限。
- 允许在 `web-naive/src/api/hse/goals.ts` 新建适配层，但必须以旧版 `api/hse/goals.ts` 为唯一契约来源，逐项保持 URL、HTTP 方法、参数、响应结构、`baseRequestClient` Blob 下载和 multipart 上传行为。不得更改服务端契约。
- 不得导入 `ant-design-vue`，不得复制 Ant Design 模板/CSS；使用 Naive UI、Vben、VXE 与现有 `components/hse/*`。
- 标准工具栏顺序固定为：刷新、下载模板、导入、导出、新增；仅显示具备真实实现的动作，新增是唯一主按钮。辅助能力（例如对账差异）须作为清晰的次级入口，不能改变公共 `HseActionBar`。
- 所有列表表头居中；长文本使用 tooltip 省略；列不得支持列宽拖动或列顺序拖动。仅当旧版后端 API 已支持对应排序参数时才接入服务端三态排序；无契约则不显示可排序表头。
- 不得为验证创建、编辑或删除生产数据。读已有数据、打开弹窗、检查网络请求、下载既有模板可以；没有安全可用的隔离数据时，必须如实记录，不得伪造写入成功。

## 一、必须保留的旧版业务能力

### 1. 目标责任书管理 `ObjectivesResponsibility`

以旧版责任书签订台账为准，不要错误替换为通用安全目标 CRUD：

- 服务端分页列表、关键词/部门/签订情况筛选、统计卡及“已签订/未签订”统计卡点击筛选。
- 展示员工花名册与责任书签订状态；保留“未签订·无源”细分、查看责任书详情、录入/编辑/软删除责任书。
- 录入时远程检索员工，并保持员工 ID、编号、姓名、身份证、部门、岗位等关联字段的旧版保存语义。
- 保留责任书模板 Blob 下载、xlsx/xls/csv 文件选择和 `importResponsibility` 上传结果（新增、更新、未匹配、总数与未匹配样例）。不得把它错误替换为通用 `useGenericImport`，除非完整核实该通用组件能使用同一专用端点和同一结果结构。
- 保留“对账差异”次级入口、只读差异列表及其既有解释文案。不要将其伪装成导出或新增动作。

### 2. 安全人员及安委会 `ObjectivesCommittee`

该页有两个独立业务页签，必须完整迁移：

- “安全人员”：从既有员工接口查询安环管理部花名册，只读、关键词/状态筛选、服务端分页、统计卡和人员详情抽屉。不得在此页增加不存在的新增/编辑/删除人员能力。
- “安委会”：安委会活动台账的列表/关键词筛选/分页、查看文件、创建、编辑、删除；保留活动名称、类型、日期、主持部门、参与人数、地点、摘要、备注等字段。
- 必须保留 PDF 上传、受保护 Blob 文件预览、Excel 模板下载和 Excel 导入，严格复用旧版端点与返回格式。上传必须限制文件类型，并展示上传/保存/导入错误，不能假装文件已经持久化。
- 两个页签都应使用统一 Naive 样式，但业务数据和操作不得混用。

### 3. 责任制及考核 `ObjectivesAssessment`

- 路由保持隐藏；实现服务端分页、关键词/年份筛选、查看抽屉、新增、编辑、删除及旧版字段（考核人员关联、年度、季度、部门/岗位/乡镇、分数、等级、状态、备注）。
- 先完整核对旧版 API：列表使用 `/hse/assessment`，写入端点使用 `/objectives/responsibility`。这是既有契约，禁止自行“修正”、合并或修改后端。
- 员工选择必须保存旧版要求的 ID 和自动带出的姓名/岗位等字段；不得以自由文本替代应保存的员工 ID。

### 4. 安全费用预算及支出 `ObjectivesBudget`

- 保留服务端分页、关键词/年份/状态筛选、服务端统计卡、查看抽屉、创建、编辑、删除和旧版预算字段。
- 预算表字段较多，必须按旧版保留预算年度、科目、措施项目、名称、规格、用途及依据、使用部门/地点、计划/OA计划/实际支出的数量、单价、总价、使用状态、备注等；不得以“简版表单”删除字段。
- 保留旧版导入能力，但先核实 `ImportButtonGroup module="budget"` 的真实端点与 `web-naive` 可用组件。若通用导入无法保持相同端点、字段映射和导入结果，不得擅自改接口或做假导入，必须在总结中列为阻断。
- 金额/数量展示与录入按旧版精度和单位处理，不能在前端重算后覆盖服务端值。

## 实施要求

1. 页面使用 `HsePageLayout`、`HseSearchPanel`、`HseActionBar`、`HseDataGrid`、`HseStatusTag`、`HseImportDialog` 等已验收组件，前提是它们不改变上述专用接口/文件业务。专用上传、文件预览、责任书导入结果可使用 Naive 原生控件配合局部实现。
2. 新建 `api/hse/goals.ts` 前，逐一对照旧版导出的每个被使用函数、命名空间和类型；不得只迁移列表而遗漏详情、上传、Blob 下载、导入或差异接口。
3. 任何实际无导出端点的页面都必须隐藏“导出”；无模板/导入能力也必须隐藏相应操作。
4. 所有 Naive `NSelect @update:value` 回调需按真实 `(value, option)` 签名处理，不能将第一个 `value` 当作选项对象。
5. 页面首次加载、筛选、保存、删除、导入完成后的刷新必须保持当前筛选条件和真实总数；不得使用前端模拟数据替代现有 API。

## 验证与交付

1. 在 `安全看板vben` 运行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
```

2. 使用 admin 登录态浏览器验证，提供截图、原始控制台日志与网络请求证据路径：
   - `/objectives/responsibility`、`/objectives/committee`、`/objectives/assessment`、`/objectives/budget` 都可访问；父菜单和可见子菜单符合基线，`ObjectivesAssessment` 不出现在菜单中。
   - 每页筛选区可见、查询与重置正常、总数分页真实、表头居中，控制台无应用级 error/warn。
   - 责任书：统计筛选、详情、员工选择弹窗、导入弹窗与对账差异入口可用；不得提交写入。
   - 安委会：两个页签、人员详情、活动新增/编辑弹窗、PDF 上传入口、文件预览入口、模板下载和 Excel 导入入口可用；不得上传或提交写入。
   - 考核与预算：详情和完整表单字段可见；不执行保存/删除。
   - 375px 窄屏无横向页面溢出；无权限访问行为保持既有 `admin` 限制。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06B-2-执行总结.md`，必须列出：变更文件、路由精确映射、API 契约对照、已验证浏览器步骤、未安全执行的写操作、未实现/阻断项目、截图/日志路径和命令原始结果。
4. 完成后停止，等待 Codex 审核。不得开始 06B-3。
