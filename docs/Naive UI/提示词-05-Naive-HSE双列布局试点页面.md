# WorkBuddy 任务书：阶段 05 - Naive HSE 双列布局试点页面

## 任务边界

阶段 04 已经 Codex 最终审核通过。本阶段仅迁移两个既有业务页面到 `安全看板vben/apps/web-naive`：

1. 组织管理：`/personnel/departments`
2. 条款资料关联：`/standards/relation`

不得进入阶段 06，不得批量迁移其他菜单或页面。不得修改 `apps/web-antd`、`server`、SQL、数据库、接口、依赖版本或锁文件；阶段 04 获授权的 `server/routes/import.js` 修复不构成本阶段继续修改后端的授权。

开始前完整阅读：

1. `../../../docs/Naive UI/01-强制设计约束.md`
2. `../../../docs/Naive UI/00-Naive-UI-HSE总体实施计划.md`
3. `../../../docs/Naive UI/阶段04-Codex最终审核.md`
4. `../../../安全看板vben/apps/web-naive/AGENTS.md`
5. 只读业务基线：
   - `../../web-antd/src/views/hse/employee/departments.vue`
   - `../../web-antd/src/views/hse/standard/relation/index.vue`
   - `../../web-antd/src/views/hse/standard/api.ts`
   - `../../web-antd/src/views/hse/standard/relation/api.ts`
   - `../../web-antd/src/router/routes/modules/hse-07-personnel.ts`
   - `../../web-antd/src/router/routes/modules/hse-03-standards.ts`

## 一、公共双列布局

创建一个仅服务于 HSE 页面、可被两个试点复用的双列布局组件，例如 `HseSplitPane`。不要引入额外依赖。

- 桌面宽度：左侧默认 `280px`，可拖动范围 `220px-420px`；右侧自适应且不会页面级横向溢出。
- 拖动只作用于页面中间分隔条，不得改变 Vben 全局侧栏宽度，也不得恢复表格列宽/列顺序拖动。
- 使用 Pointer Events；拖动时禁止文本选择，并在松开、失焦和组件卸载时正确清理监听。
- 左栏宽度仅保存到当前浏览器 `localStorage`，用稳定且页面维度明确的 key；不得上传或同步该偏好。
- 小于 `768px`：左栏自动成为 Naive `NDrawer`，由带 Lucide 图标和 tooltip 的按钮打开；右侧主内容始终可用。
- 使用 HSE 主题令牌，亮暗主题一致；不得在业务页面散落硬编码语义色。
- 分隔条可聚焦，具备合适的 `role="separator"`、标签和键盘操作（左右方向键小步调整，Home/End 调至最小/最大）。

## 二、组织管理页面

### 路由与权限

- 在既有 `/personnel` 父路由下新增 `/personnel/departments` 子路由，保留 web-antd 基线的中文名称、图标、name 和 `authority: ['admin', 'safety_manager']`。
- 不得更改 `/personnel/employee`、父级菜单、路由顺序或使用 `ignoreAccess` 绕过鉴权。

### 业务功能

- 左侧使用部门树：搜索部门名称/编码、选择、展开状态、刷新、状态/组织类型/层级语义展示。
- 右侧使用详情主体：未选择时的空状态；选择后展示部门编码、简称、层级、组织类型、上级、路径、乡镇、排序、编制、负责人、安全负责人、人数、状态和描述。
- 部门员工列表必须使用 `HseDataGrid + VXE`，保留真实分页和 total；表头居中、长文本省略+tooltip、无列宽拖动/列顺序拖动。
- 完整保留新增根部门、新增子部门、编辑、删除（二次确认）及 `admin/safety_manager` 写操作显隐。新增/编辑使用 Naive 弹窗或抽屉，表单必须有必填校验和保存失败反馈。
- 复用真实既有部门树、部门 CRUD、部门员工、员工选择接口；先核实 API 和字段，禁止 mock、猜测字段或新增后端端点。

## 三、条款资料关联页面

### 路由与权限

- 新增制度标准父菜单和 `/standards/relation` 子路由时，严格以 web-antd `hse-03-standards.ts` 的中文名称、顺序、图标、authority、redirect 语义为基线。
- 当前阶段只注册实际迁移的“条款资料关联”子页面；不得创建空白占位子页面。未迁移页面不得用 `ignoreAccess` 或隐藏路由替代。

### 业务功能

- 页面按既有业务使用“左侧标准条款树，右侧关联资料”双列结构；保留条款树选择、条款标题/编码/层级信息、关联统计和空状态。
- 右侧关联列表使用 `HseDataGrid + VXE`，展示文件名、匹配类型、匹配度、状态和操作；按语义对齐、表头居中、文本 tooltip，无表格拖动。
- 保留人工新增关联、确认关联、取消关联（二次确认）；所有写动作按 `admin/safety_manager` 显隐，成功后刷新当前条款关联与统计，失败不关闭弹窗/不显示成功。
- 文件候选列表、条款树、关联列表、统计、创建、确认和删除必须走现有真实 API。不得迁移或实现本阶段外的“匹配建议”页面。
- 将旧 Ant Design 的统计卡、标签、提示、确认弹窗全部替换为 Naive UI 和已存在 HSE 公共组件；不得引用 `ant-design-vue`。

## 四、统一规范

- 页面使用 `HsePageLayout`；列表页工具栏和动作顺序遵守 `01-强制设计约束.md`。
- 标准新增为唯一 primary 按钮；图标按钮必须带 tooltip；删除为危险语义并二次确认。
- 不提供未获后端支持的排序 UI；不做本地分页冒充服务端分页。
- 不修改阶段 04 已通过页面和公共组件，除非为双列布局复用所必需且能证明不改变现有行为。

## 五、必须完成的验证

使用真实后端和有效账号，保存可复核、不含 token、密码、身份证号或手机号的截图、网络摘要和原始控制台日志。

1. 未登录访问两个路由均跳转登录；admin 与 `safety_manager` 分别验证菜单和动作权限，若现有父路由权限基线产生冲突，停止并在总结中记录证据，不得自行放宽权限。
2. 两页逐项验证树加载/搜索/选择、右侧详情或关联列表、查询/分页/total、空状态、亮暗主题及桌面/375px 窄屏。
3. 验证拖动分隔条的最小、最大、键盘调整、刷新后偏好恢复，以及移动端抽屉打开/关闭；不得出现页面级横向溢出。
4. 组织管理验证新增、编辑、删除保护和部门员工分页；条款关联验证新增、确认、取消关联及统计刷新。若使用测试数据，必须记录并清理。
5. 浏览器控制台记录所有 warning/error/pageerror 原文并分类；不允许以“过滤后无错误”替代原始证据。

执行并记录真实退出码：

```powershell
pnpm -F @vben/web-naive run typecheck
pnpm -F @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
rg -n "ignoreAccess" apps/web-naive/src/router/routes/modules
```

## 六、交付

- 更新 `G:\hse-dashboard\docs\Naive UI\阶段05-执行总结.md`。
- 总结必须包含：旧版功能对照表、路由/权限对照、变更文件和行、真实 API 对照、双列拖动/移动抽屉证据、浏览器截图路径、原始控制台日志路径、typecheck/build 真实输出和未完成项。
- 完成后立即停止，等待 Codex 审核。未经 Codex 明确通过，不得实施阶段 06。
