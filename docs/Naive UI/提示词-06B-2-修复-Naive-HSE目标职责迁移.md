# 提示词：阶段 06B-2 修复 - Naive HSE 目标职责迁移

## 任务目标

修复 `阶段06B-2-Codex审核.md` 指出的三个 P1 阻断问题，仅限已迁移的“目标职责”4 条非月度路由及其本批 API 适配层。完成后写执行总结并停止，等待 Codex 审核。**未经复审通过，不得开始 06B-3 或修改任何其他页面。**

## 开始前必读

1. `G:\hse-dashboard\安全看板vben\apps\web-naive\AGENTS.md`
2. `G:\hse-dashboard\docs\Naive UI\01-强制设计约束.md`
3. `G:\hse-dashboard\docs\Naive UI\00-Naive-UI-HSE总体实施计划.md`
4. `G:\hse-dashboard\docs\Naive UI\阶段06B-2-Codex审核.md`
5. `G:\hse-dashboard\docs\Naive UI\提示词-06B-2-Naive-HSE目标职责迁移.md`
6. 参照实现：`apps/web-naive/src/views/site/violation/index.vue` 中 `useGenericImport` 与 `HseImportDialog` 的完整状态绑定。

## 严格边界

- 仅允许修改：
  - `安全看板vben/apps/web-naive/src/api/hse/goals.ts`
  - `安全看板vben/apps/web-naive/src/views/objectives/assessment/index.vue`
  - `安全看板vben/apps/web-naive/src/views/objectives/budget/index.vue`
  - 本任务执行总结 Markdown。
- 不得修改：`web-antd`、server、SQL、数据库、账号、任何业务数据、依赖、锁文件、Vite/代理配置、`routes/index.ts`、路由模块、公共 HSE 组件、其他页面。
- 禁止新增 `ignoreAccess`、`publicRoutes` 或权限绕过；禁止新增路由；禁止进入月度考核。
- 不执行新增、编辑、删除、导入确认、PDF 上传或任何生产数据写入。测试上传必须只停留在解析预览，且使用批准的安全测试文件；没有安全文件时，如实记录，不能伪造证据。

## 必须修复

### 1. 修复考核和预算的通用导入状态链路

对 `assessment/index.vue` 和 `budget/index.vue`：

1. 从 `useGenericImport('assessment'|'budget')` 解构并保持命名清晰：
   - `importPreviewColumns`
   - `importPreviewData`
   - `importPreviewError`
   - `importConfirming`
   - `importResult`
2. 在各自的 `HseImportDialog` 显式传入：

```vue
:preview-columns="importPreviewColumns"
:preview-data="importPreviewData"
:preview-error="importPreviewError"
:confirming="importConfirming"
:result="importResult"
```

3. 保留既有 `v-model:open`、下载模板、上传、确认、关闭事件和 `bindRefresh`；不得自行重写 `useGenericImport` 或 `HseImportDialog`。
4. 关闭弹窗后仍应调用现有清理逻辑；上传失败时显示真实的解析错误；确认成功才刷新列表。不得提交确认导入。

### 2. 恢复 goals.ts 的 Blob 客户端契约

在 `api/hse/goals.ts`：

1. 同时导入 `requestClient` 与 `baseRequestClient`。
2. 以下函数必须与旧版 `apps/web-antd/src/api/hse/goals.ts` 的 Blob 行为一致：
   - `downloadResponsibilityTemplate`
   - `getCommitteeActivityFile`
   - `downloadCommitteeActivityTemplate`
3. 每个函数使用 `baseRequestClient.get<Blob>(url, { responseType: 'blob' })`，并返回 `(response as any).data || response`，函数返回类型明确为 `Promise<Blob>`。
4. 不得改 URL、HTTP 方法、超时、multipart 上传逻辑或调用页面的下载/预览行为。

### 3. 修复预算状态筛选参数

`budget/index.vue` 的 `fetchData()` 生成列表 `params` 时必须传入：

```ts
status: searchForm.status || undefined,
```

仅影响 `getBudgetList(params)` 的列表请求；统计请求是否支持状态必须以旧版页面和 API 实际契约为准，不要无证据扩展。查询、重置、分页后都必须保持当前筛选状态和真实总数。

## 必须验证

在 `安全看板vben` 执行：

```powershell
pnpm --filter @vben/web-naive run typecheck
pnpm --filter @vben/web-naive run build
rg -n "ant-design-vue" apps/web-naive/src
git diff --check -- apps/web-naive "../docs/Naive UI"
```

使用 admin 登录态浏览器，仅做无写入验证：

1. 考核和预算：打开导入弹窗；使用安全测试文件上传到预览阶段，核实预览列/行出现，确认按钮可用；**不得点击确认导入**。若无安全测试文件，至少在代码和 props 证据中如实说明，不能把“弹窗打开”记为链路通过。
2. 责任书和安委会：点击模板下载；保存网络响应或浏览器证据，确认调用对应 Blob 端点且得到可下载文件。已有带附件的活动记录才验证预览；没有则如实记录，不能创建附件。
3. 预算：分别选择一个状态查询和点击重置，保存原始网络请求。查询请求必须有 `status=<值>`；重置后的请求不得带 `status`。
4. 不得更改原有筛选、权限、菜单或表格能力。

## 交付

创建 `G:\hse-dashboard\docs\Naive UI\阶段06B-2-修复-执行总结.md`，必须包含：

- 精确改动文件、每处修复对应的审核项；
- 通用导入完整 props 绑定清单，以及上传后预览/确认可用的证据；
- 三个 Blob 函数的旧版/新版客户端与返回值对照；
- 预算状态查询和重置的原始网络请求证据；
- typecheck、build、扫描和 diff 检查原始结果；
- 所有未执行的写操作与未能验证的原因；
- 截图、控制台日志、网络证据的实际路径。

完成后停止，等待 Codex 审核。
