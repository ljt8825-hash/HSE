# 提示词：阶段 06A 补充修复 - Naive HSE 菜单迁移盘点

## 任务目标

修正 06A 修复版中尚存的实施可行性、权限路由、批次拆分、证据和授权表述问题，使盘点文档能够作为后续迁移任务的唯一范围依据。

开始前完整阅读：

1. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
2. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
3. `G:\hse-dashboard\docs\Naive UI\阶段06A-Codex审核.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06A-Codex复审.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
6. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`

## 严格边界

- 只允许修改：
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-Naive-HSE菜单迁移清单.md`
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-执行总结.md`
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-修复-执行总结.md`
- 只允许新建：
  - `G:\hse-dashboard\docs\Naive UI\阶段06A-补充修复-执行总结.md`
- 不得修改 `web-naive`、`web-antd`、`server`、SQL、数据库、账号、接口、依赖、锁文件或任何源代码。
- 不得启动服务、调用写接口、创建测试数据/账号、执行 typecheck/build。
- 完成后立即停止。不得开始 06B，不得生成或实施 06B 的代码任务。

## 一、保持已确认正确的基线

- 必须保留并交叉一致地写明：11 个菜单内子路由 **60**、其中 `hideInMenu` **17**；菜单外视图不混入统计，也不进入 06B-06E 的实施批次。
- 不得改变已验收 5 页“仅回归、不重做”的边界。

## 二、修正 06B-1 的 API 和路由实现依据

在清单、执行总结、修复总结中一致更正：

1. 当前 `apps/web-naive/src/api/hse/` **不存在** `violations.ts` 和 `site.ts`。旧版的：
   - `apps/web-antd/src/api/hse/violations.ts`
   - `apps/web-antd/src/api/hse/site.ts`
   仅是接口契约来源，不能称为 Naive 中“复用的既有 API”。
2. 06B-1 的“预计新增 Naive 文件”必须纳入：
   - `apps/web-naive/src/api/hse/violations.ts`
   - `apps/web-naive/src/api/hse/site.ts`
   - 三个对应 site 页面和一个 HSE site 路由模块。
   API 适配文件的任务应表述为：逐个对照旧版请求方法、URL、参数、返回结构后在 Naive 内创建；不改服务端接口。
3. `apps/web-naive/src/api/hse/employee.ts` 已存在，但只能写“实施前逐项核对接口契约后复用”，不得默认其与旧版页面完全一致。
4. 路由模块由 `src/router/routes/index.ts` 的 `import.meta.glob('./modules/**/*.ts')` 自动发现。06B-1 只能新增 `src/router/routes/modules/hse-site.ts`，**不得**修改 `routes/index.ts`，不得使用 `meta.ignoreAccess`，不得把 admin 路由纳入 `publicRoutes`。路由必须继续由 `accessRoutes` 依 `authority: ['admin']` 登录后过滤。

## 三、重新拆分并精确计数

更新完整分批表、各批次详情、执行总结和修复总结，满足所有条件：

1. `06B-2` 只有 4 个子路由：`ObjectivesResponsibility`、`ObjectivesCommittee`、`ObjectivesAssessment`、`ObjectivesBudget`。父路由 redirect 不计入路由数，所有表格均写 **4**。
2. 人员管理剩余 6 条路由必须拆为多个连续、无重叠的子批次，每批不超过 5 页。建议按“常规人员页面”“导入页面”“纯 redirect”分组；可重新编号，但全表和每节编号必须一致。
3. 安全总览 12 条路由必须拆为每批不超过 5 页的独立批次。图表统计、IoT、供应链等尚有 API/依赖待核实的页面，不得与已核实的简单列表页混作一个不可审计的大批次；每批写清 route name/path 和前置待核实项。
4. 重新编号后，原风险地图批次和所有 06B-06E 批次不得重名。菜单外视图只能保留在“菜单外待确认范围”，不计入任一实施批次。

## 四、收紧证据和授权表述

1. `server/sql/personnel_insurance_employee_id_migration.sql` 只能表明迁移脚本存在。删除“已执行”“已回填 2233 条”“阶段 04 已执行”等无当前可复核数据库证据的表述，统一改为“执行状态和回填数量待核实”。
2. `server/routes/site-mgmt.js` 和 `server/services/gridCompletionService.js` 可表述为“文件存在”；不得据此断言接口已联通、契约已验证或无需后端授权。
3. 删除“部门树展示全部 department 的后端调整已授权后续单独任务”。替换为“当前未授权；若迁移验收确需该后端语义变更，须另行向用户申请授权”。
4. 所有“已核实”仅可覆盖本任务真实完成的只读文件检查；不可用文件存在替代数据库执行、接口可用性、用户授权或生产状态证据。

## 五、交付

更新上述 3 份既有 06A Markdown，并新建 `阶段06A-补充修复-执行总结.md`。总结必须包含：

1. 每项修正对应的文件与行/章节；
2. 06B-1 的 Naive API 适配层和安全路由机制说明；
3. 新的分批计数汇总，证明每个实施批次不超过 5 页且无重叠；
4. 被降级为“待核实”或“未授权”的结论；
5. 实际执行的只读命令和修改文件列表；
6. 明确写“等待 Codex 审核，未开始 06B”。
