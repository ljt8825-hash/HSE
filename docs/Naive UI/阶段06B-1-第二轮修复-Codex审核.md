# 阶段 06B-1 第二轮修复 Codex 审核

> 审核对象：`阶段06B-1-第二轮修复-执行总结.md` 及 `apps/web-naive` 中第二轮修复代码。
>
> 审核日期：2026-08-17
>
> 结论：**通过。06B-1 现场管理迁移及其两轮修复完成，可开始唯一下一批 06B-2；总体进度保持 05 / 07。**

## 已确认

- `HseSearchPanel` 已恢复 `NGrid`，`NGi` 重新位于其直接插槽中，使用合法响应式字符串 `cols`。七个既有调用页面（员工、应急预案、风险清单、三违、消防、网格、总览）均有浏览器原始日志证明筛选项可见，且无 `NGi`、`GridItem`、`gridInjectionKey` 或解构错误。
- 消防负责人的 `NSelect` 回调已按 `(value, option)` 使用第二个参数的 `option.phone` 回填电话；安装位置切换清空负责人和电话、站点花名册提示、导入后匹配校验、CSV 下载及隐藏无效导出按钮均得到保留。
- 网格统计在年/月筛选存在时透传参数，在重置后调用无参数 `getSiteStats()`；原始浏览器请求证据分别为 `/site-mgmt/stats?year=2024` 与无查询参数的 `/site-mgmt/stats`。
- 网格状态/风险等级、`gridPersonnel` 提交前删除、服务端完成率、mock“三违记录”的未入库标识，以及三违完整表单/统计分析恢复均继续保持。
- 独立执行 `pnpm --filter @vben/web-naive run typecheck` 和 `pnpm --filter @vben/web-naive run build` 均通过；`git diff --check` 无输出，`web-naive/src` 无 `ant-design-vue` 引用。

## 非阻断记录

消防负责人“选择花名册人员后自动回填电话”未能在本环境完成端到端点击：当前部门树没有任何名称含“转运站”的二级部门，1311 名在职员工的组织名称为“作业中心”，与旧版和新版共同采用的“二级部门等于转运站名称”匹配规则不一致，因此负责人下拉为空。

这不是前端回调实现缺陷，也不是本批范围内可通过修改数据或后端解决的问题。后续如需要该链路用真实数据验收，必须先由业务确认“作业中心”与“转运站”的映射口径，或另行授权数据/后端调整；本批不得伪造花名册数据。

## 放行范围

允许开始且仅允许开始 `提示词-06B-2-Naive-HSE目标职责迁移.md`：目标职责的 `ObjectivesResponsibility`、`ObjectivesCommittee`、`ObjectivesAssessment`、`ObjectivesBudget` 四条路由。月度安全履职考核及其隐藏路由仍属于 06B-3，禁止提前迁移。
