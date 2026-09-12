# WorkBuddy 任务书：阶段 04 修复（第二轮）

阶段 04 Codex 复审仍未通过。本轮只处理三个试点页面及其必要公共/API 适配，不得进入阶段 05，不得批量迁移其他页面，不得修改 `web-antd`、`server`、SQL、数据库、依赖或锁文件，除非按本任务中的风险地图决策流程先暂停并提交方案。

开始前完整阅读：

1. `../../../docs/Naive UI/01-强制设计约束.md`
2. `../../../docs/Naive UI/00-Naive-UI-HSE总体实施计划.md`
3. `../../../docs/Naive UI/阶段04-Codex审核.md`
4. `../../../docs/Naive UI/阶段04-Codex复审.md`
5. `../../../docs/Naive UI/阶段04-执行总结.md`
6. `../../../安全看板vben/apps/web-naive/AGENTS.md`

## 一、必须修复

### 1. 清零当前 typecheck 错误

- 处理 `useGenericImport.ts` 中 `rows[0]` 的空值类型，不能用不安全断言掩盖空数组。
- 删除 `RiskAssessModal.vue` 未使用的 `NInputNumber`。
- 让评估因子类型与真实 API 返回一致，正确处理 `symbol`；将 `NSelect` options 转换为 Naive UI 接受的 `{ label, value }` 结构或使用严格兼容的类型。
- 将 `RiskDetailDrawer.vue`、`RiskMapDrawer.vue` 的标签类型映射限制为 Naive 支持的 `primary/default/error/success/warning/info`，不得使用 `neutral` 或 `danger`。
- 删除或实际接线 `risk-control/index.vue` 的 `openView`，不得保留未使用函数。
- 补齐 `RiskMapDrawer.vue` 模板实际使用的 `NThing`、`NSpace` 导入。

执行并记录真实结果：

```powershell
pnpm -F @vben/web-naive run typecheck
```

### 2. 修复通用导入 module 传递

- 将 API 改为 `uploadImport(file: File, module: string)`，在 `FormData` 同时追加 `file` 和 `module`。
- `useGenericImport(module)` 必须调用 `uploadImport(file, module)`；不得依赖全局状态或从文件名猜模块。
- 保持员工页现有专用导入接口不变。
- 用真实有效模板/文件分别完成 `emergency`、`risk-control`：下载模板、上传、解析/校验预览、确认导入、列表刷新；另测一个格式错误文件，确认不会误报成功。
- 记录请求方法、路径、HTTP 状态和不含敏感数据的响应摘要。仅模板下载 200 不算完成。

### 3. 恢复或正式决策风险地图

- 先对照 `web-antd` 风险地图实现、边界数据和现有依赖，确认是否能在 `web-naive` 现有依赖范围实现真实交互地图（宁津边界、乡镇底图、风险点标记、点击联动）。
- 若可以，完成 Naive 页面中的真实地图和列表/地图联动，并使用现有 HSE 主题令牌。
- 若必须新增 `leaflet` 或其他依赖，**不要直接改 package.json、锁文件或安装依赖**；在总结中提交依赖名称/版本、影响范围、包体积、许可证、替代方案和回退方案，停止并等待 Codex 决策。不得把当前降级列表写成已恢复。

### 4. 完成真实浏览器回归

启动真实后端和 web-naive dev server，使用项目既有 admin 登录方式，不得使用 `ignoreAccess` 或伪造成功结果。至少覆盖：

- 未登录访问 `/personnel/employee`、`/risk/list`、`/emergency/plans` 均跳转登录；admin 能看到正确父子菜单；一个无权限角色不能看到菜单且直接 URL 被拒绝。
- 三页查询、重置、刷新、分页及真实 `total`；三页均无排序箭头；表头居中，长文本省略和 tooltip 可用。
- 员工岗位筛选、查看、调岗、历史、新增、编辑、删除、模板下载及专用导入。
- 应急查看、新增、编辑、删除、导出及通用导入完整链路。
- 风险查看、新增、编辑、删除、导出、通用导入、地图、附件、版本、评估、风险转隐患和关联隐患。
- 桌面与窄屏无页面级横向溢出，亮/暗主题一致，控制台无本轮新增 error/warn。

保存可复核截图或等价浏览器证据，URL、角色和关键结果必须可见；不得包含 token、密码、身份证号或手机号。

## 二、交付与停止条件

- 更新原文件 `G:\hse-dashboard\docs\Naive UI\阶段04-执行总结.md`，不要创建阶段 05 总结。
- 总结逐项采用“复审问题 -> 修改文件/行 -> 验证命令或浏览器步骤 -> 真实结果”格式；typecheck/build 必须写真实退出码。
- 明确列出导入 module 字段证据、风险地图最终决策、浏览器覆盖矩阵和未完成项。
- 若风险地图依赖决策未获批准，或登录/后端环境仍无法完成真实回归，必须明确标记未通过并停止，不得声称阶段 04 完成。
- 完成后立即停止，等待 Codex 复审；Codex 明确通过前不得实施阶段 05。
