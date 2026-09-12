# WorkBuddy 任务书：阶段 03 - Naive HSE VXE 表格与导入组件

## 任务定位

你正在执行 HSE 系统 Naive UI 改版的第 03 阶段。开始前必须完整阅读：

1. `../../../docs/Naive UI/01-强制设计约束.md`
2. `../../../docs/Naive UI/00-Naive-UI-HSE总体实施计划.md`
3. `../../../docs/Naive UI/阶段02-Codex审核.md`
4. `../../../docs/Naive UI/提示词-03-Naive-HSE-VXE表格与导入组件.md`

本阶段只建立 VXE 表格和通用导入组件，并用演示数据验证；不得迁移真实业务列表页面。

## 项目路径

- 工作区：`G:\hse-dashboard`
- Vben 项目：`G:\hse-dashboard\安全看板vben`
- 目标应用：`安全看板vben/apps/web-naive`
- 旧应用（只读参考/回退）：`安全看板vben/apps/web-antd`
- 文档目录：`G:\hse-dashboard\docs\Naive UI`

## 强制约束

- 必须遵守 `01-强制设计约束.md`；本阶段不迁移员工、应急、风险等真实业务页面。
- 不修改后端、SQL、接口定义、数据库、锁文件或 `web-antd`。
- 不实现表格列宽拖动、列顺序拖动或用户自定义列宽。
- 表头必须居中；长文本必须省略并支持 tooltip；单元格按语义对齐。
- 排序必须支持升序、降序、取消排序三态；组件设计必须能承载服务端 `sortBy`/`sortOrder`，不可把服务端分页数据误当成全量前端排序。
- 不在公共表格组件中写业务 API、业务字段或业务状态映射。

## 具体工作

### 1. 完成 VXE 初始化接入

检查 `src/adapter/vxe-table.ts` 是否在 `web-naive` 启动链路中正确加载和初始化。确保 VXE 组件、语言、主题和 HSE 主题令牌可用，但不要提前改造业务页面。

### 2. 建立 `HseDataGrid`

建议文件：`src/components/hse/HseDataGrid.vue`，并在 `src/components/hse/index.ts` 导出。

组件至少应提供：

- `columns`、`data`、`loading`、`rowKey`、分页配置。
- 查询/刷新所需的 reload 事件或 API，但不直接绑定业务请求。
- 表头居中、固定列宽、操作列固定、统一空态/加载态。
- 长文本 `showOverflow: 'tooltip'` 或等价实现；tooltip 必须显示完整值。
- 列级 `sortable` 白名单；排序事件必须标准化为 `{ sortBy, sortOrder }`，其中 `sortOrder` 为 `asc`、`desc` 或 `undefined`。
- 行编辑基础能力：进入编辑、保存、取消、校验失败回滚；保存动作通过事件交给调用方。
- 自定义单元格 slot 或 VXE renderer 承载标签、人员、附件、日期和操作列。
- 不支持列宽拖动、列顺序拖动和用户自定义列宽。

组件的公共 API 必须在总结中列出；如果选择直接封装 `useVbenVxeGrid` 而非手写 `VxeGrid`，说明适配理由和限制。

### 3. 建立 `HseImportDialog`

建议文件：`src/components/hse/HseImportDialog.vue`，并在 barrel 导出。

本阶段只实现通用 UI 状态和事件，不绑定 HSE 真实导入 API。流程必须覆盖：

```text
下载模板 → 上传文件 → 解析/校验预览 → 确认导入 → 导入结果
```

要求：

- 文件类型、loading、错误、空数据、校验成功/失败、确认中和最终结果状态齐全。
- `download-template`、`upload`、`confirm`、`close` 等事件交给调用方。
- 预览表格复用 `HseDataGrid` 或明确说明为何不复用。
- 文案固定使用“下载模板”和“导入”，不得出现“导入数据”。

### 4. 更新演示验证页

将 `src/views/hse/overview/index.vue` 增加公共表格和导入组件演示：使用本地静态演示数据，不请求后端，不创建真实业务菜单。必须展示：

- 长文本省略和 tooltip。
- 表头居中。
- 一个可排序列的升序/降序/取消状态。
- 一个可编辑行的保存/取消状态。
- 导入弹窗的所有步骤和错误状态。
- 亮色/暗色主题下组件一致性。

## 必须验证

```powershell
pnpm -F @vben/web-naive run typecheck
pnpm -F @vben/web-naive run build
```

必须启动开发服务并使用真实浏览器完成验证，至少覆盖桌面和窄屏：

1. 表头居中，排序三态可见且不会改变未排序列。
2. 长文本不撑宽布局，悬停可看到完整内容。
3. 行编辑保存/取消和校验失败回滚正确。
4. 导入弹窗状态切换无横向溢出。
5. 亮色/暗色下页面内 VXE、导入组件和离散 UI 主题一致。

总结中必须记录实际端口、浏览器验证步骤和截图路径或等价的 DOM/交互证据。若浏览器验证失败，不得写“手工验证通过”。

## 交付物

1. 阶段 03 代码改动。
2. `docs/Naive UI/阶段03-执行总结.md`。

总结必须包含：公共组件 API、排序事件协议、行编辑状态设计、导入状态设计、变更文件、typecheck/build 真实结果、浏览器验证证据、未解决问题和下一阶段建议。

## 完成边界

完成代码与总结后立即停止。不要迁移真实业务页面，不要进入阶段 04。等待用户将总结交给 Codex 审核。

