# WorkBuddy 任务书：阶段 06A - Naive HSE 全量菜单迁移盘点

## 任务目标

阶段 05 已经 Codex 最终审核通过，当前总体进度为 `05 / 07`。阶段 06 的目标是完成其余 HSE 菜单页面的 Naive UI 迁移；由于旧版存在 11 个一级菜单和大量二级页面，本任务只完成**可审核的迁移盘点与分批实施方案**，不开始任何页面迁移。

本任务要产出一份可作为后续所有阶段 06 子批次唯一范围依据的菜单/页面/API 对照清单。完成后立即停止，等待 Codex 审核；不得自行实施 06B 或修改应用代码。

## 开始前必须完整阅读

1. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
2. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
3. `G:\hse-dashboard\docs\Naive UI\阶段05-Codex最终复验审核.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段05-Codex最终复验-追认复审.md`
5. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
6. 旧版 HSE 菜单基线：
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-01-overview.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-02-objectives.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-03-standards.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-04-risk.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-05-hazards.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-06-site.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-07-personnel.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-08-training.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-09-emergency.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-10-insurance.ts`
   - `G:\hse-dashboard\安全看板vben\apps\web-antd\src\router\routes\modules\hse-11-system.ts`

## 严格边界

- **只允许新建或更新 `G:\hse-dashboard\docs\Naive UI` 中本任务明确要求的 Markdown 文档。**
- 禁止修改 `安全看板vben/apps/web-naive`、`apps/web-antd`、`server`、SQL、数据库、账号、路由、接口、依赖和锁文件。
- 不启动开发/预览/后端服务，不创建测试数据或账号，不调用写接口。
- 不得把“盘点”伪装成已完成迁移；未在 Naive 版本真实存在并可达的页面必须标为“未迁移”。
- 不得根据自己的判断合并、删除、重命名菜单、改变路由、权限、接口或业务流程。

## 一、必须交付的迁移清单

创建：`G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`

该文档至少包含以下内容。

### 1. 完整路由与功能对照表

以 11 个旧版一级菜单为完整范围，逐一列出所有二级页面和隐藏业务路由。每行必须包含：

| 一级菜单（顺序） | 二级名称 | route name | 路径 | authority / hideInMenu / redirect | 旧版组件绝对或项目内路径 | 旧版核心功能 | 旧版 API 文件或端点来源 | Naive 当前状态 | 迁移复杂度 | 建议批次 |
|---|---|---|---|---|---|---|---|---|---|---|

要求：

- “Naive 当前状态”只能写“已迁移并已验收”“已存在未验收”“未迁移”“仅占位”“路由缺失”之一，并给出对应路径。
- 必须单独标注阶段 04/05 已验收页面，避免后续批次重做：员工列表、应急预案、风险清单、组织管理、条款资料关联。
- 必须如实标注当前已发现的两个后续决策项：部门树展示全部 `department`、`/hse/todos` homePath 404；两者均不属于本任务实现范围。
- 逐项核对旧版的 `name`、`path`、`authority`、`hideInMenu`、`redirect`，不能只列菜单可见项。

### 2. 页面能力与统一组件适配矩阵

按页面逐项判断并列出证据来源：

- 是否为标准列表页，能否采用 `HsePageLayout + HseSearchPanel + HseActionBar + HseDataGrid`；
- 是否有导入、下载模板、导出、新增、编辑、删除、详情、审批、附件、地图、图表、树/详情双列等能力；
- 是否要求服务端分页与三态排序，以及已存在的 API 是否支持；
- 是否适合 `HseSplitPane`，只允许在“树/目录选择，右侧详情或列表”的页面标记“是”；
- 需要的 Naive UI 组件和已存在 HSE 公共组件；
- 风险：缺失 API、旧版依赖 Ant Design 专有组件、页面功能过大、权限不明确、需要后端改动。

禁止在文档中假设 API 或字段。无法从旧版 API/调用点核实的项目必须写“待核实”，并给出待核实文件路径。

### 3. 分批实施方案

将阶段 06 拆成连续、可独立审核的子批次 `06B`、`06C`、`06D`……。每个批次必须：

- 不超过 3 个一级菜单，或不超过 5 个低复杂度页面；复杂页面单独成批；
- 写明具体菜单、二级页面、路由、预期复用组件、禁止触碰范围；
- 说明先后依赖关系和该批次完成标志；
- 明确哪些批次可能需要用户单独授权后端改动，且这些改动不得预先授权；
- 把已验收的阶段 04/05 页面排除在迁移范围外，仅可纳入全量回归清单。

推荐优先顺序应由功能依赖和风险决定，而不是仅按菜单编号；必须说明排序理由。

### 4. 阶段 06 总回归清单

列出未来阶段 07 需要覆盖的：菜单可见性、未登录跳转、admin/safety_manager 权限、主流程、导入、服务端排序、双列移动端、亮暗主题、控制台、typecheck/build。此部分只定义验收项，不执行测试。

## 二、只读核对要求

可使用 `rg`、`Get-Content`、`Get-ChildItem` 等只读命令。记录以下客观数据：

1. 旧版 11 个一级菜单的数量、各自二级页面数量、隐藏业务路由数量；
2. 当前 Naive 路由模块和 HSE 视图目录；
3. 每个建议批次的页面数量与复杂度依据；
4. `apps/web-naive/src` 中 `ant-design-vue` 的命中数（只读扫描）。

不得执行 typecheck/build，因为本任务不改源代码；不得为了“验证”修改任何文件。

## 三、执行总结

完成后创建：`G:\hse-dashboard\docs\Naive UI\阶段06A-执行总结.md`

总结必须包含：

1. 本任务范围与“未改任何应用源码/后端/数据库”的声明；
2. 完整迁移清单路径、各菜单和路由统计；
3. 建议的 06B 起始批次、排序理由、该批次预期改动范围；
4. 所有待用户或架构决策项；
5. 实际执行的只读命令和真实结果；
6. 明确声明“等待 Codex 审核，未开始 06B”。

完成后立即停止。不要生成或实施 06B 的代码。
