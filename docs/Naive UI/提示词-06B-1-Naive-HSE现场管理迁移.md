# 提示词：阶段 06B-1 - Naive HSE 现场管理迁移

## 任务目标

在 `安全看板vben/apps/web-naive` 迁移第一个实际 HSE 菜单批次“现场管理”，以 Naive UI、Vben 和项目既有 VXE 表格公共组件实现以下 3 个页面，并保留旧版路由、权限和业务功能：

| route name | 路径 | 旧版页面 |
|---|---|---|
| SiteViolation | `/site/violation` | `apps/web-antd/src/views/violations/index.vue` |
| SiteFireFacility | `/site/fire-facility` | `apps/web-antd/src/views/inspection/fire-facility/index.vue` |
| SiteGrid | `/site/grid` | `apps/web-antd/src/views/inspection/grid/index.vue` |

开始前必须完整阅读：

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Codex放行.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`（特别是 §一.6、§四.06B-1）
6. 上述 3 个旧版页面及其旧版 API：
   - `apps/web-antd/src/api/hse/violations.ts`
   - `apps/web-antd/src/api/hse/site.ts`
7. 已有 Naive 公共组件和试点页面：
   - `apps/web-naive/src/components/hse/`
   - `apps/web-naive/src/views/emergency/plans/index.vue`
   - `apps/web-naive/src/views/hse/_shared/useGenericImport.ts`

## 严格边界

- 只可修改 `安全看板vben/apps/web-naive` 与本任务的执行总结 Markdown。
- 不得修改 `apps/web-antd`、`server`、SQL、数据库、账号、接口契约、依赖版本或锁文件。
- 不得新增 `ant-design-vue` 引用、第二套 UI 框架、表格列宽拖动、列顺序拖动或用户自定义列宽。
- 不得修改 `apps/web-naive/src/router/routes/index.ts`，不得使用 `meta.ignoreAccess`，不得把 admin 路由加入 `publicRoutes`。
- 不得实现或请求 `GET /violations/by-grid`；该接口仅为未实现的后端 TODO。不得以 mock 代替真实 CRUD/API 结果，也不得伪造导入成功。
- 完成后必须停止，不得开始 06B-2 或其他批次。

## 一、允许新增/修改的应用文件

预期新增：

```text
apps/web-naive/src/api/hse/violations.ts
apps/web-naive/src/api/hse/site.ts
apps/web-naive/src/router/routes/modules/hse-site.ts
apps/web-naive/src/views/site/violation/index.vue
apps/web-naive/src/views/site/fire-facility/index.vue
apps/web-naive/src/views/site/grid/index.vue
```

仅在确有必要时修改同目录已存在的公共类型/导出文件；不得为本批重构公共组件。若需要新增路由标题的 locale key，可做最小 locale 修改，并在总结中说明。

## 二、API、路由与权限

### 1. API 适配层

- 在 `web-naive/src/api/hse/violations.ts` 创建 Naive API 适配层，以旧版 `api/hse/violations.ts` 为唯一契约来源。覆盖本页实际需要的服务端列表、统计、筛选项、创建、编辑、删除、批量删除、导出、整改、复查等方法；保持既有 URL、HTTP 方法、请求参数和响应结构，不改服务端。
- 在 `web-naive/src/api/hse/site.ts` 创建 Naive API 适配层，以旧版 `api/hse/site.ts` 为契约来源。至少覆盖消防设施、网格区域、筛选项、站点统计及本页实际使用的 CRUD 方法。
- 消防负责人/人员选择仅可在逐项核对后复用现有 `api/hse/employee.ts`；不得假设字段兼容。
- 三个页面的导入必须复用 `useGenericImport` + `HseImportDialog` 与既有通用导入网关：模块标识分别为 `violation`、`fire-facility`、`grid`。下载模板、上传预览、确认导入和结果反馈均须真实处理，确认成功后刷新页面；错误必须呈现真实失败状态。

### 2. 路由

新增 `src/router/routes/modules/hse-site.ts`。模块由既有 `import.meta.glob('./modules/**/*.ts')` 自动发现，保持动态权限加载：

```text
父：HseSite /site，order 6，authority ['admin']，keepAlive，redirect /site/violation
子：SiteViolation /site/violation，authority ['admin']
子：SiteFireFacility /site/fire-facility，authority ['admin']
子：SiteGrid /site/grid，authority ['admin']
```

菜单中文名称、顺序、路由 name/path 和 admin 权限必须与旧版基线一致。非 admin 不应通过初始公开路由访问此菜单。

## 三、页面与交互要求

### 共通要求

- 每个列表页统一采用 `HsePageLayout`、`HseSearchPanel`、`HseActionBar`、`HseDataGrid`、`HseImportDialog`、`HseStatusTag`，遵循“标题/面包屑、筛选、可选统计、工具栏、业务表格”的顺序。
- 工具栏统一顺序为：刷新、下载模板、导入、导出、新增；只显示该页面真实支持的动作，新增为唯一 primary 按钮。文案必须使用“下载模板”“导入”。
- 使用 `HseDataGrid` 的服务端分页和三态排序事件。仅对服务端已确认支持 `sortBy/sortOrder` 的可比较字段开启排序；不得对当前页做本地排序。若旧接口未支持该契约，则保持该列不可排序，并在执行总结列为待授权后端限制。
- 表头居中，长文本单行省略且悬停完整显示；日期、数值、状态、风险等级、完成率和操作列居中，普通长文本左对齐。
- 查看优先使用抽屉；新增/编辑用统一的 Naive 表单抽屉或弹窗；删除使用危险语义和二次确认。图标按钮必须有 tooltip。
- 不在页面散落硬编码语义颜色。状态/风险显示使用 `HseStatusTag` 或主题语义色映射。

### 三违管理

保留旧版实际提供的筛选、统计卡片、服务端列表/分页、详情、创建/编辑、整改、复查、删除、批量删除、导入和导出能力。字段、必填校验和实际 API 调用以旧版页面/API 为准；不复制旧版的 Ant Design 结构、列拖动或用户列设置功能。

### 消防设施管理

保留设施筛选、统计、列表、详情、创建/编辑、删除、负责人/站点关联校验、导入和刷新能力。人员与站点数据只能经已核实的现有接口获取；若旧版行为依赖不存在或不兼容的接口，不得伪造数据或改变后端，在总结中明确阻断事实。

### 网格管理

保留年/月、网格级别、乡镇、状态等筛选，完成率与统计展示，网格 CRUD、详情和 `grid` 通用导入。完成率仍由既有后端返回，前端不可自行编造或重新计算。

必须保留旧版的“三违记录”操作入口和抽屉：该抽屉继续使用当前 mock 数据展示，不请求任何未实现接口；要清楚区分它与真实三违管理的 CRUD 数据，不能让用户误以为 mock 内容已入库。

## 四、验证与交付

1. 在 `安全看板vben` 工作区执行：

```powershell
pnpm --filter @vben/web-naive typecheck
pnpm --filter @vben/web-naive build
```

2. 启动或复用本地开发环境，以 admin 身份完成浏览器验证：3 条路由可访问、菜单顺序/权限正确、分页/筛选/导入对话框/表单/删除确认/详情抽屉正常；验证窄屏无溢出。若现有服务或登录状态阻止某项验证，记录真实原因和已完成的替代证据。
3. 确认新增的 site 路由不是 `ignoreAccess`，`routes/index.ts` 未修改，`web-naive/src` 无 `ant-design-vue` 引用。
4. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06B-1-执行总结.md`，至少列出：变更文件、三个页面的 API 映射、保留与未实现的功能边界、实际命令和原始结果、浏览器验证、已知风险。
5. 停止并等待 Codex 审核，不开始 06B-2。
