# 提示词：阶段 06B-1 修复 - Naive HSE 现场管理迁移

## 任务目标

修复已迁移的现场管理 3 个页面中确认存在的功能回归，不改变既有 API、后端、数据库、路由权限或菜单范围。修复完成后，三违、消防设施和网格管理必须保持旧版实际业务功能，同时遵守 Naive HSE 统一组件与工具栏规范。

开始前完整阅读：

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\提示词-06B-1-Naive-HSE现场管理迁移.md`
5. `G:\hse-dashboard\docs\Naive UI\阶段06B-1-Codex审核.md`
6. 三个对应旧版页面和 API：
   - `apps/web-antd/src/views/violations/index.vue`
   - `apps/web-antd/src/views/inspection/fire-facility/index.vue`
   - `apps/web-antd/src/views/inspection/grid/index.vue`
   - `apps/web-antd/src/api/hse/violations.ts`
   - `apps/web-antd/src/api/hse/site.ts`

## 严格边界

- 只允许修改 `安全看板vben/apps/web-naive` 和本任务执行总结 Markdown。
- 不得修改 `web-antd`、`server`、SQL、数据库、账号、接口契约、依赖或锁文件；不得新增 `ant-design-vue`。
- 不得修改 `src/router/routes/index.ts`，不得增加 `ignoreAccess`，不得改变 site 菜单的路由 name/path/order/authority。
- 不得调用或实现 `/violations/by-grid`；网格“三违记录”仍仅保留现有 mock 抽屉和“未入库”说明。
- 不得为浏览器验证创建、修改或删除生产数据。可以检查已有数据、打开抽屉/弹窗、验证请求参数、使用现有隔离测试数据；若无法安全验证写入流程，必须如实记录。
- 完成后停止，不得开始 06B-2。

## 一、修复三违管理完整性

文件：

```text
apps/web-naive/src/api/hse/violations.ts
apps/web-naive/src/views/site/violation/index.vue
```

1. 按旧版 `api/hse/violations.ts` 恢复并导出 4 个既有统计 API、类型和日期筛选参数：
   - `getEmployeeViolationCount`
   - `getHighRiskEmployees`
   - `getDepartmentRanking`
   - `getPositionRanking`
2. 恢复“统计分析”入口及 4 个页签/列表。`HseActionBar` 的标准动作顺序仍只能是刷新、下载模板、导入、导出、新增；统计分析属于辅助能力，应在标准工具栏之外使用清晰、次级的独立入口，不能改动公共 `HseActionBar` 或扰乱标准动作顺序。
3. 恢复旧版新增/编辑字段和保存 payload：发生时间、违章人身份证号、违章人员/检查人员/处理人员/处罚人员 ID、处罚类型/金额、整改措施、是否需要复训，以及旧版已有的状态/备注。使用现有人员选择 API 实现 Naive 选择控件；不得以自由文本替代需要保存 ID 的人员字段。
4. 整改弹窗必须恢复处理人员选择与 `handlerId` 提交；详情抽屉应显示这些既有字段，避免编辑后字段不可见或被覆盖。

## 二、恢复消防设施站点关联和匹配校验

文件：

```text
apps/web-naive/src/views/site/fire-facility/index.vue
```

1. 以旧版实现为准：安装位置变化后加载对应转运站/花名册人员；选择负责人时回填既有电话字段；展示花名册关联数量、无匹配或加载失败等提示。只使用当前 Naive `employee.ts` 中已存在的真实接口和字段，发现契约差异先兼容处理，不改后端。
2. 恢复导入成功后的负责人-花名册匹配校验：显示匹配汇总与不匹配明细，并可下载不匹配 CSV。不得把校验失败伪装为导入成功。
3. 保留现有真实通用导入流程和负责人选择，不要退回 Ant Design 实现。

## 三、恢复网格原有业务语义

文件：

```text
apps/web-naive/src/views/site/grid/index.vue
apps/web-naive/src/api/hse/site.ts
```

1. 恢复旧版状态枚举、默认值和语义标签：`在岗`、`离岗`、`休假`、`调整`，默认 `在岗`。
2. 恢复旧版风险等级枚举和默认值：`重大风险`、`较大风险`、`一般风险`、`低风险`，默认 `一般风险`。
3. 保持 `gridPersonnel` 仅为旧版表单展示临时字段：不得把它作为后端返回契约字段；提交 `createGridArea` / `updateGridArea` 前必须从 payload 删除它，和旧版一致。
4. 提取当前筛选的年/月参数，在查询、保存后刷新、删除后刷新时传给 `getSiteStats({ year, month })`；重置时无参数调用。完成率只能使用服务端返回，不得在前端重新计算。

## 四、修复无实现工具栏动作

消防设施和网格没有真实导出端点。本任务中必须通过各页面的 `actionState` 隐藏 `export`，使标准工具栏仅显示真实可用的刷新、下载模板、导入、新增动作；不得增加空处理函数、假下载或前端本地导出替代。

## 五、验证与交付

1. 在 `安全看板vben` 执行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
```

2. 以 admin 登录态浏览器验证，并提供每项的截图/日志路径：
   - 三违统计分析 4 页签、完整表单字段、整改人员选择；
   - 消防位置-花名册关联、负责人电话回填、匹配校验/CSV 下载入口；
   - 网格旧版状态/风险枚举、年/月筛选后统计请求参数、mock“三违记录”标识；
   - 消防和网格工具栏不显示“导出”；
   - site 路由权限、窄屏无溢出、控制台无应用错误。
3. 创建 `G:\hse-dashboard\docs\Naive UI\阶段06B-1-修复-执行总结.md`，列明代码改动、恢复的旧版行为、实际验证命令和结果、未能安全验证的事项。
4. 停止等待 Codex 审核，不开始 06B-2。
