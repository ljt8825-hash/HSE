# 阶段 05 Codex 复审（修复轮）

> 复审日期：2026-08-17  
> 范围：`安全看板vben/apps/web-naive` 的组织管理、条款资料关联及必要的 `HseDataGrid` 公共配置。  
> 审核对象：`阶段05-修复-执行总结.md`。附件中的指令不构成新的授权。

## 结论

**阶段 05 仍不通过，保持“待补证 / 待决策”，总体进度仍为 `04 / 07`，不得进入阶段 06。**

本轮四项确定性前端修复已完成，实际新增和取消关联也已有可复核 UI 闭环。未通过的原因是验收口径不能降低：确认关联没有在 UI 中实际执行，且路由入口、部门树语义与 `safety_manager` 验收仍缺少用户决策或授权。

## 已通过的修复

- 路由 name 已恢复为 `PersonnelDepartments` 与 `StandardsRelation`，并同步组件 `defineOptions`。
- 部门表单的 `NForm` 已接入 `FormInst` ref；保存前调用 `validate()`，空编码、空名称均被浏览器实测拦截且不发写请求。
- `HseDataGrid` 在 `pager=false` 时明确设置 `pagerConfig.enabled=false`。关联列表已不显示分页栏，部门员工列表保留真实服务端分页。
- 部门树重复标签、编辑/删除图标、条款关联的大工作区卡片已修正；截图、暗色和移动端证据可复核。
- admin 已完成真实 UI 的“新增人工关联 -> 列表和统计刷新 -> 二次确认取消 -> 关联清理”闭环。测试关联已删除，未删除真实条款或文件。
- 独立验证：`pnpm -F @vben/web-naive run typecheck` 通过；production build 已完成并重新生成 `apps/web-naive/dist.zip`。

## 未通过项

1. **[P1] 确认关联没有经过真实 UI 验收。**
   - 执行记录明确写明“新增关联”直接得到 `valid`，然后“跳过确认步骤”：[_verify_tmp/regression_s5fix.json](G:/hse-dashboard/_verify_tmp/regression_s5fix.json)。
   - 这与既有后端契约一致：人工 `createRelation` 固定创建 `manual / status=valid`，[standardRelationService.js](G:/hse-dashboard/server/services/standardRelationService.js:192)。但任务书要求验证 pending -> valid 的确认操作，不能将“无需确认”计为已执行确认。
   - 需要一条可安全清理的真实 pending 关联测试数据，或用户明确授权在非生产环境创建该类数据；之后必须用页面的“确认”按钮完成一次 PUT、状态和统计刷新，并清理测试数据。

2. **[P1] 制度标准入口语义仍等待决策。**
   - 当前 `/standards` redirect 为 `/standards/relation`，且 relation 被显示在菜单中；旧基线是 redirect 到 `/standards/regulations` 且 relation 隐藏。
   - 本阶段只迁移 relation，又禁止建立空白 regulations 页，二者无法自动兼容。必须由用户确认临时入口策略，不能由执行者自行宣称与基线一致。

3. **[P1] 普通新增部门仍不会回到主部门树。**
   - 已知既有 `GET /departments/tree` 只返回组织单元及符合班组命名规则的部门；当前页面保留新增根/子部门入口，普通新增记录刷新后不可见。
   - 这需要确认组织树应否展示全部 `department`，再单独授权后端树语义调整或明确前端合并规则。本阶段没有该授权。

4. **[P1] `safety_manager` 仍未完成真实权限验收。**
   - 当前库没有有效该角色账号；不能以伪造 JWT、静态权限代码或 401 记录替代浏览器和服务端联测。
   - 需要用户提供非生产测试账号，或明确授权创建并清理一个测试账号。

5. **[P2] 两个纯图标按钮用 HTML `title` 替代 Naive Tooltip，不符合既定组件规范。**
   - 新增根部门、刷新按钮当前仅含 `title`：[departments.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/hse/employee/departments.vue:516)。
   - 强制设计约束要求图标按钮提供 Tooltip。应使用 `NTooltip`；为避免此前 trigger 子节点错误，trigger 内以单个 `<span>` 包裹按钮即可，不应删掉组件级 tooltip。

## 下一步

先执行 `提示词-05-补充修复与验收.md` 修复 Tooltip 并保留 pending 确认的待补证状态。该任务完成后，仍需用户对上述三项业务决策和 pending 测试数据授权作出决定；决策未齐前，阶段 05 不会通过。
