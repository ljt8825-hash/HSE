# 阶段 04 Codex 第四轮复审

## 审核对象

- WorkBuddy 总结：`阶段04-执行总结.md`（第三轮修复版）
- 前序审核：`阶段04-Codex第三轮复审.md`
- 强制规则：`01-强制设计约束.md`
- 审核日期：2026-08-16

## 结论

阶段 04 **前端范围基本完成，但整体未通过**，总体进度保持 `03 / 07`，不得进入阶段 05。

独立执行 `pnpm -F @vben/web-naive run typecheck` 和 `pnpm -F @vben/web-naive run build` 均通过。地图全量数据、地图抽屉、定位与视觉渲染已有可复核截图和回归脚本证据。剩余放行阻断项是未获授权的服务端导入确认缺陷；该问题不能由前端修改规避。

## Findings

### P1：应急和风险通用导入仍无法确认入库

执行总结和服务端源码一致表明：前端已正确提交 `module`，上传和预览成功，但 `POST /api/import/confirm` 对 `emergency` 和 `risk-control` 都失败，无法写入数据和刷新列表。

- `server/routes/import.js:422-441` 的 emergency 映射写入不存在的 `version`，并使用与真实表不一致的 `department`、`phone`。
- `server/routes/import.js:1915-1921` 为风险模块额外注入 `title`，而 `risk_sources` 没有该列。

阶段 04 的固定导入流程要求“下载模板、上传、解析/校验预览、确认导入、导入结果”，当前在确认步骤失败。现有任务边界禁止修改 `server`，且用户尚未授权扩大范围，因此该问题仍为阻断项。

### P1：控制台零告警的验收证据不完整

`G:\hse-dashboard\_verify_tmp\regression_r3.json` 的第 25 项实际为失败：`控制台无本轮新增 error/warn（总 8 条，过滤后 6 条）`。执行总结将其解释为 headless GPU/Canvas 提示，但没有保存这 6 条原始日志，无法独立确认它们均非应用告警。

本轮独立匿名访问生产预览 `/risk/list` 能正确跳转登录页，浏览器显示 `0 errors, 1 warnings`。这不能证明登录后关键流程控制台无新增告警。后续验收必须保留原始控制台日志，并逐条标注来源和是否与本次改动有关。

## 已确认通过

- 独立 typecheck 和 production build 均成功。
- `uploadImport(file, module)` 已提交 module；confirm 失败时前端显示失败结果且不会刷新列表或误报成功。
- 风险地图打开时按当前筛选条件请求 `pageSize=500` 的完整数据集，不再使用当前表格分页数据；截图 `G:\hse-dashboard\_verify_tmp\shots_r3\02_risk_map_open.png` 可复核地图、边界、图例和风险标记。
- GeoJSON 失败有用户可见提示，道路图例样式绑定已修复。
- 浏览器截图和 `regression_r3*.json` 存在于 `G:\hse-dashboard\_verify_tmp`，可支撑大部分登录态页面、响应式和主题结论。

## 下一步所需授权

需要用户明确授权一个单独、最小范围的后端修复任务，限于 `server/routes/import.js`：

1. 将 emergency 导入字段映射对齐 `emergency_plans` 真实列，移除或替换不存在的 `version`。
2. 防止 risk-control 写入 `risk_sources` 不存在的 `title` 列。
3. 以隔离测试数据验证两种模板的上传、预览、确认入库、结果和列表刷新，并清理测试数据。

授权后才能生成该后端修复任务书。修复完成后，补充保留原始控制台日志的登录态回归，再进行阶段 04 最终复审。
