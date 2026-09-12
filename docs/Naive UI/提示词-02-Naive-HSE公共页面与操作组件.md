# WorkBuddy 任务书：阶段 02 - Naive HSE 公共页面与操作组件

## 任务定位

你正在执行 HSE 系统 Naive UI 改版的第 02 阶段。总体计划见同目录的 `00-Naive-UI-HSE总体实施计划.md`；阶段 01 审核见 `阶段01-Codex审核.md`。

本阶段建立 HSE 页面级公共组件和操作规范，并修复离散 UI 主题继承问题。不得迁移真实业务页面、表格或后端接口。

## 项目路径

- 工作区：`G:\hse-dashboard`
- Vben 项目：`G:\hse-dashboard\安全看板vben`
- 目标应用：`安全看板vben/apps/web-naive`
- 旧应用（只读参考/回退）：`安全看板vben/apps/web-antd`
- 文档目录：`G:\hse-dashboard\docs\Naive UI`

## 强制设计约束

- 只使用 Naive UI、Vben 公共组件和 Lucide 图标，不混用 Ant Design Vue。
- 保留 HSE 主题语义：绿色主色/成功、蓝色信息、橙色预警、红色危险、灰色普通/草稿。
- 所有主题颜色必须来自 HSE 主题令牌；禁止在公共组件中散落硬编码颜色。
- 工具栏标准顺序固定为：刷新、下载模板、导入、导出、新增；新增是唯一主按钮。
- 本阶段不实现表格、不实现排序、不实现列宽拖动、不实现导入流程、不增加真实业务菜单。
- 不修改 `web-antd`、`server`、SQL、接口定义、数据库或锁文件。

## 具体工作

### 1. 修复离散 UI 主题一致性（最高优先级）

检查并修复 `src/adapter/naive.ts` 的 `createDiscreteApi` 配置，使 `message`、`notification`、`dialog`、`modal`、`loadingBar`：

- 使用与 `src/app.vue` 的 `NConfigProvider` 相同的 HSE 主题令牌来源。
- 亮色/暗色切换时同步切换。
- 主色、成功、信息、预警、危险颜色与页面内组件一致。
- 不要简单把 `lightTheme/darkTheme` 当作 `themeOverrides`；根据 Naive UI 类型和运行时行为选择正确配置。
- 保持现有调用方 API 不变，不能要求业务页面改成另一套 message API。

至少在占位页增加一次 message 或 notification 的可见验证，证明离散 UI 已继承 HSE 主题；如需要修改官方适配文件，必须说明原因、影响和回退方式。

### 2. 建立 `HsePageLayout`

建议文件：`src/components/hse/HsePageLayout.vue`。

要求：

- 统一页面标题、描述、面包屑插槽、内容区域间距。
- 支持标题右侧操作区插槽。
- 支持窄屏布局，不产生横向溢出。
- 基于 Vben `Page`，不要重新实现页面滚动和高度管理。

### 3. 建立 `HseSearchPanel`

建议文件：`src/components/hse/HseSearchPanel.vue`。

要求：

- 提供查询区默认布局、展开/收起、查询和重置插槽。
- 支持响应式列数，桌面端两至三列，窄屏端单列。
- 不绑定真实 API，只提供稳定的插槽/事件接口。
- 查询和重置按钮的 loading、disabled 状态可由调用方控制。

### 4. 建立 `HseActionBar`

建议文件：`src/components/hse/HseActionBar.vue`。

要求：

- 提供 `refresh`、`downloadTemplate`、`import`、`export`、`create` 五类标准动作。
- 动作可按配置隐藏、禁用、显示 loading，并通过事件交给调用方处理。
- 按冻结顺序渲染；`create` 使用 primary，其余使用默认/次级样式。
- 按钮使用 Lucide 图标；图标按钮必须有 tooltip，文字动作保留清晰文案。
- 不在组件中写入任何业务 API 或业务模块判断。

### 5. 建立 `HseStatusTag`

提供统一的 `success/info/warning/danger/neutral` 语义类型，用于后续表格和详情页。组件只负责颜色和基础尺寸，不负责业务状态到语义的映射。

### 6. 更新阶段占位页作为组件展示页

将 `src/views/hse/overview/index.vue` 改为公共组件验证页：展示页面骨架、搜索区、操作栏、状态标签和离散 message/notification。不得添加真实业务数据或 API 请求。验证页可以明确标注“阶段 02 组件验证”，避免误认为已完成安全总览业务页面。

## 必须验证

```powershell
pnpm -F @vben/web-naive run typecheck
pnpm -F @vben/web-naive run build
```

启动开发服务后，至少手工检查：

1. 亮色模式和暗色模式下页面组件颜色一致。
2. message、notification、dialog、modal、loadingBar 与页面主题一致。
3. 工具栏动作顺序和隐藏/禁用/loading 状态正确。
4. 搜索区在桌面和窄屏宽度下不溢出。
5. 页面中不存在 `ant-design-vue` 引用。

如默认端口被占用，允许使用其他空闲端口，但总结中必须记录实际地址和端口。

## 交付物

1. 阶段 02 代码改动。
2. 新增 `docs/Naive UI/阶段02-执行总结.md`。

总结必须包含：完成项、变更文件、公共组件 API、主题一致性修复说明、typecheck/build 真实结果、手工验证端口与步骤、未解决问题、下一阶段建议。不得只写“已完成”，必须提供文件和命令证据。

## 完成边界

完成本阶段代码和总结后立即停止。不要迁移员工列表、应急预案、风险清单等真实业务页面，不要开始阶段 03。等待用户把总结交给 Codex 审核。

