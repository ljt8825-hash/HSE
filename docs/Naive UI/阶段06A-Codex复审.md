# 阶段 06A Codex 复审

> 审核对象：`阶段06A-修复-执行总结.md`、`阶段06A-Naive-HSE菜单迁移清单.md`、`阶段06A-执行总结.md`
>
> 审核日期：2026-08-17
>
> 结论：**不通过，须完成一次仅限文档的补充修复后重审。不得开始 06B 或修改应用源码。**

## 已确认正确的内容

- 11 个 HSE 一级菜单的基线统计已更正为 **60 个子路由、17 个 `hideInMenu` 路由**；逐模块分布与旧版 11 个 `hse-0X` 路由模块一致。
- 59 个带组件路由和 1 个 `PersonnelOrgCenter` 纯 redirect 的划分合理。
- 菜单外视图已经补齐旧版路由来源，并从 06B-06E 的实际实施范围移除，作为“菜单外待确认范围”处理。
- 本轮未发现应归因于该任务的 `web-naive`、`web-antd`、`server`、SQL、依赖或锁文件改动；任务保持在文档盘点边界内。

## 阻断项

### P1：06B-1 把不存在的 Naive API 适配层写成“复用”

迁移清单 [第 251 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-Naive-HSE菜单迁移清单.md:251) 和修复总结 [第 66 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-修复-执行总结.md:66) 指定“复用 `#/api/hse/violations`”；同处还指定“复用 `#/api/hse/site`”。但当前 `apps/web-naive/src/api/hse/` 仅有 `documents.ts`、`employee.ts`、`standard.ts`、`standard-relation.ts`，不存在 `violations.ts` 和 `site.ts`。

旧版 `web-antd` 的 `api/hse/violations.ts`、`api/hse/site.ts` 可以作为接口契约来源，不能被 Naive 应用直接复用。06B-1 必须明确新增两个 Naive API 适配文件并逐项对照旧版请求方法、参数和返回结构；现有的 `employee.ts` 也只能在契约核对后复用。

### P1：路由“注册进 routes/index.ts 白名单”的方案错误且有权限回归风险

迁移清单 [第 252 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-Naive-HSE菜单迁移清单.md:252) 和修复总结 [第 69 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-修复-执行总结.md:69) 要求将 site 路由注册进 `routes/index.ts`“白名单”。当前文件以 `import.meta.glob('./modules/**/*.ts')` 自动发现模块；只有 `meta.ignoreAccess` 路由才被纳入初始 `publicRoutes`，其余路由经 `accessRoutes` 在登录后按 `authority` 过滤。

06B-1 只应新增 `src/router/routes/modules/hse-site.ts`（命名可遵循现有 HSE 模块），不得修改 `routes/index.ts`、不得设置 `ignoreAccess`、不得把 admin 路由加入初始公开路由。该项必须在清单、执行总结和后续任务书中一致更正。

### P1：批次数量和拆分规则仍不满足任务书

- `06B-2` 在标题和总表中写“5 路由”，实际只列出 4 个子路由；父级 redirect 不是子路由，必须改为 **4**。
- `06D-1` 包含 6 个待迁移路由，违反“一个菜单内待迁移页面超过 5 个必须继续拆分”的要求。应至少拆为常规人员页面、导入页面、redirect 路由三个可独立验收范围，且重新编号后不能与现有批次冲突。
- `06E-1` 将 12 个看板/分析页合并为一个“高复杂度批次”。“高复杂度独立批”不等于把 12 个不同的数据链路和图表页打包；必须按每批最多 5 页拆分，并把 IoT、图表库/统计端点未核实的页面安排在完成前置确认之后。

### P1：证据强度和授权状态被错误扩大

- [第 233 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-Naive-HSE菜单迁移清单.md:233) 和修复总结 [第 83 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-修复-执行总结.md:83) 从 `personnel_insurance_employee_id_migration.sql` 文件存在推导出“已执行并回填 2233 条”。文件存在只能证明迁移脚本存在；本轮没有数据库执行或数据核验授权和证据。必须改为“脚本存在，执行状态和回填数量待核实”。
- [第 314 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-Naive-HSE菜单迁移清单.md:314) 与 [第 363 行](G:/hse-dashboard/docs/Naive%20UI/阶段06A-Naive-HSE菜单迁移清单.md:363) 声称“部门树展示全部 department 的后端调整已授权”。当前对话的授权仅覆盖阶段 05 已明确的组织管理只读可见和条款关联 admin 限制，不包含该后端语义变更。必须改为“未授权；如确有需要，另行向用户申请授权”。

## 后续要求

补充修复仅改 3 份现有 06A Markdown 和新建一份补充修复执行总结；不运行服务、构建或测试，不改任何应用/后端文件。完成后提交 `阶段06A-补充修复-执行总结.md`，由 Codex 重审。总体进度维持 **05 / 07**。
