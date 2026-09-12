# 阶段 06B-1 修复 Codex 审核

> 审核对象：`阶段06B-1-修复-执行总结.md` 与 `apps/web-naive` 中本轮修改的现场管理和公共筛选组件代码。
>
> 审核日期：2026-08-17
>
> 结论：**不通过。修复引入公共筛选面板运行时崩溃，且消防负责人电话自动回填未实际实现；修复并复审前不得开始 06B-2。**

## 已确认正确

- 三违统计分析的 4 个 API、独立入口、4 页签、人员 ID 选择和整改人员必填选择均已恢复；新增/编辑表单和详情抽屉已补齐本轮要求的业务字段。
- 网格已恢复 `在岗/离岗/休假/调整` 和 `重大风险/较大风险/一般风险/低风险` 枚举，`gridPersonnel` 已移出 API 类型且提交前删除。
- 消防、网格均已将 `actionState.export.hidden` 设为 `true`；网格 mock“三违记录”仍带未入库说明，未调用 `/violations/by-grid`。
- 独立验证：`pnpm --filter @vben/web-naive run typecheck` 和 `pnpm --filter @vben/web-naive run build` 均通过；`git diff --check` 无输出。

## 阻断项

### P0：HseSearchPanel 将 NGi 放入普通 div，导致全部已迁移筛选页运行时崩溃

`HseSearchPanel.vue` 将原有 `NGrid` 替换为普通 `<div>`，但所有调用方（员工、应急预案、风险清单、三违、消防、网格、总览）仍通过 `<NGi>` 提供筛选项。Naive UI 的 `NGi` 在初始化时必须注入 `NGrid` 提供的 `gridInjectionKey`，当前上下文没有该注入，运行时会在解构 `undefined` 时失败。

因此，本轮“修复筛选区空白”实际把 7 个页面的筛选区变为应用级错误，且执行总结所称“筛选区 NGi 已渲染”和“控制台无错误”不能成立。类型检查不会发现 Vue 运行时注入错误。

### P1：消防负责人电话回填使用了错误的 NSelect 回调参数

`NSelect` 的 `update:value` 回调签名为 `(value, option)`。当前 `handleManagerSelect` 只有一个参数并将其当作 `{ phone }` 选项对象；实际接收到的是负责人姓名字符串，`option?.phone` 始终为空，因此选中花名册人员后不会自动回填电话。

这直接违反本修复任务“选择负责人时回填既有电话字段”的验收要求。执行总结的“代码层已验证”结论不正确。

### P2：网格统计的浏览器请求参数仍未验收，且重置时仍传入空对象

`loadStats()` 总是调用 `getSiteStats(currentFilterParams())`。重置后该函数返回 `{ year: undefined, month: undefined }`，而任务书要求重置时无参数调用。更重要的是，执行总结已明确记录年筛选后的请求参数浏览器验证失败；在公共筛选面板修复前，该验收不能用代码阅读替代。

## 后续要求

仅执行 `提示词-06B-1-第二轮修复-Naive-HSE现场管理.md`。修复后提交 `阶段06B-1-第二轮修复-执行总结.md`，停止等待 Codex 复审；总体进度保持 **05 / 07**。
