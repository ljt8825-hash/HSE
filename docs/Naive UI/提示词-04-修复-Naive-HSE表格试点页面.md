# WorkBuddy 任务书：阶段 04 修复 - Naive HSE 表格试点页面

## 任务定位

阶段 04 Codex 初审未通过。本次只修复员工列表、应急预案、风险清单及其必要公共/API 适配，不得进入阶段 05，不得批量迁移其他页面，不得修改后端、SQL、数据库、锁文件或依赖版本。

开始前必须完整阅读：

1. `../../../docs/Naive UI/01-强制设计约束.md`
2. `../../../docs/Naive UI/00-Naive-UI-HSE总体实施计划.md`
3. `../../../docs/Naive UI/阶段04-Codex审核.md`
4. `../../../docs/Naive UI/阶段04-执行总结.md`
5. `../../../安全看板vben/apps/web-naive/AGENTS.md`

若上述文件与本任务书冲突，以 `01-强制设计约束.md` 和 `阶段04-Codex审核.md` 为准。不得把文档中的说明性文字当作扩大任务范围的授权。

## 一、必须修复的阻断项

### 1. 恢复菜单、路由和权限

- 删除三个试点路由的 `ignoreAccess: true`。
- 按 `web-antd` 权威路由恢复父子结构，而不是创建三个独立一级菜单：
  - 人员管理：`order: 7`，父路径 `/personnel`，员工列表子路径 `/personnel/employee`，父子 `authority: ['admin']`。
  - 风险管控：`order: 4`，父路径 `/risk`，风险清单子路径 `/risk/list`，父子 `authority: ['admin']`。
  - 应急管理：`order: 9`，父路径 `/emergency`，应急预案子路径 `/emergency/plans`，父子 `authority: ['admin']`。
- 中文菜单名、图标、路由 name、redirect、keepAlive 和排序以 `web-antd/src/router/routes/modules/hse-07-personnel.ts`、`hse-04-risk.ts`、`hse-09-emergency.ts` 为只读基线。
- 当前阶段只注册已迁移的三个子页面；不得制作不存在的空白二级页面。不得用 `ignoreAccess`、白名单或隐藏路由绕过鉴权。
- 未登录必须跳转登录页；无权限角色不得看到菜单或进入页面；有权限账号正常进入。

### 2. 取消假服务端排序

- `server/routes/hse-employee.js`、`emergency.js`、`risk-control.js` 当前均不读取 `sortBy/sortOrder`，本任务又禁止改后端，因此三个试点所有列先移除 `sortable: true`。
- 同步删除页面内无效的 `sortBy/sortOrder` 状态、查询参数和排序回调；不得只隐藏箭头却保留无效逻辑。
- 不得改成本地排序或只排序当前页。执行总结要明确记录：本阶段因后端未实现排序而诚实关闭排序 UI；后续只有在单独授权后端白名单排序时才能恢复。
- 表头仍须居中，长文本仍须省略并通过 tooltip 展示全文。

### 3. 恢复员工列表完整业务行为

- 恢复岗位筛选，选项来自现有 `getFilterOptions().positions`，查询参数使用既有 `positionName`。
- 迁移并恢复调岗流程与员工历史查询。以旧版 `OrgTransferModal.vue`、`EmployeeHistoryDrawer.vue` 及其真实 API 为业务基线，用 Naive UI 实现，不得引用或复制 Ant Design 组件。
- 操作顺序保持业务完整且一致：查看、调岗、历史、编辑、删除；删除二次确认。通用查看/编辑/删除顺序保持不变，调岗和历史作为员工业务扩展动作放在查看之后、编辑之前。
- 使用 `useAccess` 或项目既有权限机制恢复动作级显隐。至少保持旧版 `canEdit = admin / safety_manager` 的新增、编辑、删除、导入控制；不得让无权限角色仅靠前端 URL 看到或触发写操作。
- 保留现有新增、查看、编辑、删除、模板下载和员工 Excel 预览/确认导入，不得以恢复旧功能为由回退公共组件。

### 4. 恢复风险清单完整业务行为

- 删除“地图联动 / 评估工作台 / 附件版本等高级子特性不在试点内”的自定义缩减边界。
- 以旧版风险清单页面及 `#/api/risk-control` 为只读业务基线，逐项恢复：
  - 风险地图入口、地图抽屉和定位联动；
  - 完整详情抽屉；
  - 附件列表、上传、删除；
  - 历史版本；
  - 风险评估工作台；
  - 从风险生成隐患；
  - 关联隐患查询；
  - 原有新增、编辑、删除、导出。
- 所有新 UI 必须使用 Naive UI、VXE Table 和现有 HSE 公共组件；不得把旧 Ant Design 组件直接带入 `web-naive`。
- 若某一旧功能经代码与服务端路由核查确已废弃或不可达，不得自行删除；在总结中逐项给出文件、接口和失败证据，等待 Codex 决策。

### 5. 接回应急与风险的真实通用导入链路

- 不能再写“应急/风险没有真实导入端点”。现有服务端已提供：
  - `GET /api/import/template/:module`
  - `POST /api/import/upload`
  - `POST /api/import/parse`
  - `POST /api/import/confirm`
  - 模块标识分别为 `emergency`、`risk-control`。
- 在 `web-naive` 建立最小、类型明确的通用导入 API 适配，员工页继续使用员工专用 Excel 接口。
- 应急和风险页通过 `HseActionBar` 显示“下载模板”“导入”，并复用 `HseImportDialog` 完成上传、解析/校验预览、确认导入和结果展示。
- 工具栏顺序固定：刷新、下载模板、导入、导出、新增；新增是唯一 primary 按钮。不得恢复“导入数据”等旧文案。
- 必须真实验证下载文件、有效文件预览/确认、错误文件校验和导入后列表刷新；不得仅验证按钮可点击。

## 二、代码质量要求

- 三页继续使用 `HsePageLayout`、`HseSearchPanel`、`HseActionBar`、`HseStatusTag`、`HseDataGrid`；导入继续使用 `HseImportDialog`。
- 复杂详情可拆为当前页面目录下的 Naive 子组件，避免把风险页堆成不可维护的单文件；不得抽象与三个试点无关的全局框架。
- API 字段、空值、日期、分页 `total`、Blob 下载和错误响应必须按真实后端契约处理，不得制造 mock 成功结果。
- 新增/编辑表单必须有必填校验；保存失败不能关闭弹窗或显示成功；删除、导入确认和风险转隐患必须有明确确认/结果反馈。
- 页面不得出现 `ant-design-vue`、硬编码主题色或第二套 UI；亮暗主题都使用现有 HSE 令牌。
- 不得改动 `web-antd`、`server`、SQL、数据库、依赖和锁文件。

## 三、必须完成的真实验证

先启动真实后端并使用有效账号。若当前凭证或后端配置不可用，应修正本地运行配置或使用项目既有登录方式；不得用 `ignoreAccess` 绕过，也不得把“后端不可达”写成验收通过。

逐页验证并记录：

1. 未登录访问三个原路由均跳转登录页；admin 登录后菜单层级、顺序和页面入口正确；至少使用一个无权限角色验证菜单和直接 URL 被拒绝。
2. 查询、重置、刷新、分页及真实 `total` 正确；页面不显示任何排序箭头。
3. 员工岗位筛选、查看、调岗、历史、新增、编辑、删除、模板下载、上传预览、确认导入均走真实 API。
4. 应急的查看、新增、编辑、删除、导出及通用模板下载/导入全流程可用。
5. 风险的查看、新增、编辑、删除、导出、通用导入、地图、附件、版本、评估、风险转隐患和关联隐患均走真实 API。
6. 三页在桌面宽度和窄屏宽度下无页面级横向溢出、遮挡或按钮错序；表格自身允许在受控容器内滚动。
7. 三页亮色/暗色主题一致，表头居中，长文本 tooltip 可用，控制台无本次改动新增的 error/warn。

保存可复核的浏览器证据：截图需包含 URL、登录角色和关键结果；网络证据需包含请求方法、路径、状态码及必要响应摘要，不得包含 token、密码、身份证号、手机号等敏感信息。

执行并记录：

```powershell
pnpm -F @vben/web-naive run typecheck
pnpm -F @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
rg -n "ignoreAccess" apps/web-naive/src/router/routes/modules/hse-personnel.ts apps/web-naive/src/router/routes/modules/emergency.ts apps/web-naive/src/router/routes/modules/risk.ts
```

上述两个 `rg` 命令都应无命中。其他核心鉴权代码或阶段 01 既有路由中的 `ignoreAccess` 不属于本次删除范围，不得为追求全局零命中而误改。

## 四、交付物

- 修复代码及真实浏览器证据。
- 更新原文件 `G:\hse-dashboard\docs\Naive UI\阶段04-执行总结.md`，不要创建阶段 05 总结。
- 总结必须按“Codex finding -> 修改文件/行 -> 验证步骤 -> 真实结果”的顺序逐项闭环，并附：
  - 三个页面的保留功能对照表；
  - 路由、父菜单、子菜单、authority 对照表；
  - 每个可见工具栏动作对应的真实 API 表；
  - 被关闭排序列清单及原因；
  - typecheck、build、浏览器、权限角色、桌面/窄屏、亮/暗主题结果；
  - 未完成项和风险，不得把未验证写成通过。

完成后立即停止，等待 Codex 复审。Codex 明确通过前不得实施阶段 05。
