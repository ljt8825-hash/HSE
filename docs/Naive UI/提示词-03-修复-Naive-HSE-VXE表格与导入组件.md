# WorkBuddy 修复任务：阶段 03 审核问题整改

## 任务定位

阶段 03 已完成初版实现，但 Codex 审核未通过。只修复本任务列出的阶段 03 问题，不开始阶段 04，不迁移真实业务页面。

开始前完整阅读：

1. `../../../docs/Naive UI/01-强制设计约束.md`
2. `../../../docs/Naive UI/00-Naive-UI-HSE总体实施计划.md`
3. `../../../docs/Naive UI/阶段03-Codex审核.md`
4. `../../../docs/Naive UI/提示词-03-Naive-HSE-VXE表格与导入组件.md`
5. `../../../安全看板vben/apps/web-naive/AGENTS.md`

## 必须修复

### 1. 修复行编辑保存判断

`vxe-table@4.19.25` 的表格 `validate()` 成功返回 `undefined/void`，失败返回错误映射。调整 `HseDataGrid` 的保存逻辑，使：

- 校验成功：保留编辑后的行、调用 `clearEdit()`、只发出 `edit-save`；
- 校验失败：回滚原始值、退出编辑、发出 `edit-cancel`；
- 点击取消：回滚原始值并发出 `edit-cancel`。

公共组件应增加可传入的校验规则 API（例如透传 `editRules`），使真实业务页面能够声明必填等规则；不要把业务字段或 API 写进公共组件。演示页至少配置一个可复现的校验失败场景，并验证事件与数据结果，而不只检查输入框是否消失。

### 2. 修复导入文件类型和拖拽处理

在 `HseImportDialog` 中：

- 将 `NUploadDragger` 的 `accept` 改为动态绑定 `:accept="accept"`；
- 点击和拖拽都必须触发一次 `upload(file)` 事件；
- 禁止组件自行上传到未知地址（使用 Naive UI 正确的手动上传配置），文件类型不匹配时不得向外发出上传事件；
- 保留隐藏 input 方案时，确保不会与 `NUploadDragger` 内置 input 重复触发文件选择；
- 重新验证下载模板、上传、校验预览、确认导入、结果和失败提示状态。

### 3. 补足排序三态证据并检查状态保持

- 保持公共组件服务端排序协议：`sortBy`、`sortOrder: 'asc' | 'desc' | undefined`，组件不对数据做本地排序。
- 在真实浏览器中点击可排序表头三次，记录实际 DOM 箭头状态必须是 `asc → desc → none`，并记录三次 `sort-change` 事件载荷。
- 验证父级回灌服务端返回数据后，排序指示仍与当前状态一致；取消排序后恢复默认业务顺序。
- 验证未配置 `sortable: true` 的列不会触发排序。
- 证据必须来自真实鼠标/坐标点击和 DOM/事件记录，不能只用合成事件、静态代码检查或“建议人工复核”代替。

## 变更边界

- 只允许修改 `apps/web-naive/src/components/hse/HseDataGrid.vue`、`HseImportDialog.vue`、必要的演示验证页和相关文档/locale。
- 不修改 `web-antd`、server、SQL、数据库、API、锁文件或依赖版本。
- 不提供列宽拖动、列顺序拖动和用户自定义列宽。

## 必须验证

```powershell
pnpm -F @vben/web-naive run typecheck
pnpm -F @vben/web-naive run build
```

启动可用端口的开发或 production preview，使用真实浏览器至少验证桌面和窄屏：表头居中、长文本 tooltip、排序三态、行编辑三种结果、导入点击/拖拽和弹窗无横向溢出、亮暗主题一致。记录实际命令、端口、断言结果和截图或 JSON 路径。

## 交付物

1. 修复后的代码。
2. 更新 `docs/Naive UI/阶段03-执行总结.md`，明确列出修复内容、真实验证结果和仍存在的风险。

完成后立即停止，等待 Codex 复审。
