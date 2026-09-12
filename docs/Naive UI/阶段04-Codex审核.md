# 阶段 04 Codex 审核

## 审核对象

- WorkBuddy 总结：`阶段04-执行总结.md`
- 任务书：`提示词-04-Naive-HSE表格试点页面.md`
- 强制规则：`01-强制设计约束.md`
- 目标应用：`安全看板vben/apps/web-naive`
- 审核日期：2026-08-15

## 审核结论

阶段 04 **未通过，需修复后重新提交阶段 04 总结**。当前只能确认三个页面能够通过类型检查和生产构建，不能确认菜单、权限、业务功能及运行验收符合冻结基线。不得进入阶段 05。

## Findings

### P0：三个试点路由绕过鉴权

- [hse-personnel.ts](../../安全看板vben/apps/web-naive/src/router/routes/modules/hse-personnel.ts:13)、[emergency.ts](../../安全看板vben/apps/web-naive/src/router/routes/modules/emergency.ts:13)、[risk.ts](../../安全看板vben/apps/web-naive/src/router/routes/modules/risk.ts:13) 均设置了 `ignoreAccess: true`。
- 旧版对应父路由和子路由使用 `authority: ['admin']`，例如[人员管理](../../安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts:9)、[应急管理](../../安全看板vben/apps/web-antd/src/router/routes/modules/hse-09-emergency.ts:9)和[风险管控](../../安全看板vben/apps/web-antd/src/router/routes/modules/hse-04-risk.ts:9)。
- 独立浏览器实测在未登录状态下，`/hse/employee`、`/emergency/plans`、`/risk/list` 均直接显示业务页面并发起 API 请求，没有跳转登录页。阶段总结中“员工页面正确重定向至登录页”的陈述与代码和实测结果不一致。

### P1：菜单层级和员工路由语义被改变

- 三个页面被注册成独立一级路由，未保留“人员管理 / 应急管理 / 风险管控”父子结构，破坏已冻结的 11 个一级菜单、顺序和二级菜单归属。
- 员工列表从旧版 `/personnel/employee` 改为 `/hse/employee`，见[新路由](../../安全看板vben/apps/web-naive/src/router/routes/modules/hse-personnel.ts:18)与[旧路由](../../安全看板vben/apps/web-antd/src/router/routes/modules/hse-07-personnel.ts:23)。应急和风险虽保留了子路径，但仍缺少父级菜单路由。

### P1：三个页面显示了后端实际不支持的“服务端排序”

- 员工、应急、风险页面均设置 `sortable: true` 并透传 `sortBy/sortOrder`，例如[员工页](../../安全看板vben/apps/web-naive/src/views/hse/employee/index.vue:386)、[应急页](../../安全看板vben/apps/web-naive/src/views/emergency/plans/index.vue:283)和[风险页](../../安全看板vben/apps/web-naive/src/views/risk-control/index.vue:314)。
- 三个列表后端都没有读取这两个参数：员工固定按 `start_date DESC` 排序（[hse-employee.js](../../server/routes/hse-employee.js:606)），应急固定按 `created_at DESC` 排序（[emergency.js](../../server/routes/emergency.js:265)），风险固定按 `id ASC` 排序（[risk-control.js](../../server/routes/risk-control.js:776)）。
- 因此点击表头只改变箭头和无效参数，数据默认顺序不会按选择改变，违反“排序必须为服务端三态排序”的强制规则。阶段总结仅承认员工端限制，遗漏应急和风险。

### P1：员工列表发生业务功能和权限回归

- 旧版员工页明确包含岗位筛选、调岗、历史查询及角色动作显隐，证据见[岗位筛选](../../安全看板vben/apps/web-antd/src/views/hse/employee/index.vue:74)、[调岗/历史操作](../../安全看板vben/apps/web-antd/src/views/hse/employee/index.vue:141)、[角色判断](../../安全看板vben/apps/web-antd/src/views/hse/employee/index.vue:212)。
- 新员工页的筛选模型没有 `positionName`（[index.vue](../../安全看板vben/apps/web-naive/src/views/hse/employee/index.vue:78)），操作列只有查看、编辑、删除，也未使用 `useAccess` 或等价权限判断。
- 这不是 UI 替换，而是删除业务能力并扩大新增、编辑、删除、导入等动作的可见范围。

### P1：风险清单主动删除既有业务能力，且错误判断导入能力不存在

- 新风险页自行声明地图联动、评估工作台、附件版本等“不在试点内”（[index.vue](../../安全看板vben/apps/web-naive/src/views/risk-control/index.vue:6)），但任务书和强制规则没有授权删除功能。
- 旧风险页实际具有风险导入、风险地图、完整详情、附件上传/删除、历史版本、风险评估、生成隐患和关联隐患等能力，相关 API 引用见[旧风险页](../../安全看板vben/apps/web-antd/src/views/risk-control/index.vue:715)。新 API 和页面只保留基础 CRUD 与导出。
- 新页面称风险模块没有真实导入端点并隐藏下载模板/导入（[index.vue](../../安全看板vben/apps/web-naive/src/views/risk-control/index.vue:164)），但通用导入后端已配置 `risk-control`（[import.js](../../server/routes/import.js:477)），并提供模板、上传解析和确认接口（[模板](../../server/routes/import.js:1162)、[上传](../../server/routes/import.js:1352)、[确认](../../server/routes/import.js:983)）。应急模块也已有通用导入配置（[import.js](../../server/routes/import.js:422)）。

### P1：真实浏览器验收未完成

- 阶段任务要求逐页验证权限、查询、分页、排序、CRUD、导入/导出、桌面/窄屏、亮色/暗色和控制台错误。
- 独立实测三个匿名路由可以打开，但后端不可达时分别产生 API 502，无法验证真实数据、分页和写操作。总结所列的模块求值检查不能代替业务流程验收，也没有提供桌面/窄屏和亮暗主题证据。

## 已通过项

- `pnpm -F @vben/web-naive run typecheck`：通过，退出码 0。
- 独立 production build：通过，退出码 0；仅有既有大 chunk 警告。
- `apps/web-naive/src` 未发现 `ant-design-vue` 引用。
- 三个页面已使用阶段 02/03 公共组件，真实 `total` 已传入 `HseDataGrid`，删除操作有二次确认。

## 修复放行条件

1. 恢复三个试点所属的父子菜单结构、原路由语义、顺序和 `authority`，删除所有 `ignoreAccess: true`。
2. 在未授权修改后端的前提下，移除三个页面中没有真实服务端实现的 `sortable: true`；不得保留假排序箭头。
3. 恢复员工页岗位筛选、调岗、历史查询和动作权限显隐。
4. 恢复风险清单页面原有真实业务能力；通用导入链路必须复用 `HseImportDialog`，应急与风险不能再以“没有端点”为由隐藏真实能力。
5. 使用有效账号和可用后端逐页完成真实业务流程、权限角色、桌面/窄屏、亮色/暗色浏览器验收，并提供可复核证据。
6. 重新执行 typecheck、production build，更新 `阶段04-执行总结.md` 后停止，等待 Codex 复审。
