# 阶段 06B-2 Codex 审核 - Naive HSE 目标职责迁移

审核日期：2026-08-18  
审核对象：`阶段06B-2-执行总结.md`、`安全看板vben/apps/web-naive` 中本批新增的 API、路由和四个目标职责页面。  
结论：**不通过**。总体进度保持 **`05 / 07`**；阶段 06 状态为 **06B-2 目标职责修复待审核**。不得开始 06B-3 月度安全履职考核迁移。

## 审核结果

### P1-1：考核与预算的通用导入无法确认入库

`useGenericImport` 返回 `importPreviewColumns`、`importPreviewData`、`importPreviewError`、`importConfirming`、`importResult` 五项状态；`HseImportDialog` 是纯展示组件，必须由页面显式透传这些状态。

- [assessment/index.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/objectives/assessment/index.vue:366) 仅解构事件与 `importOpen`，遗漏全部五项状态；[弹窗调用](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/objectives/assessment/index.vue:590) 也没有绑定这些 props。
- [budget/index.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/objectives/budget/index.vue:392) 与 [弹窗调用](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/objectives/budget/index.vue:628) 存在相同遗漏。
- [HseImportDialog.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/components/hse/HseImportDialog.vue:99) 的 `canConfirm` 必须满足 `previewData.length > 0`。未传 prop 时其默认值为 `[]`，上传成功后没有预览，确认按钮永久禁用，`confirmImport(jobId)` 无法触发。

这与执行总结第 45、52、111-113 行的“通用导入完成”不一致。此前已验收页面的完整绑定可作为修复参照，但只限修复本批两个页面。

### P1-2：三个 Blob 接口破坏旧版请求客户端契约

任务书明确规定保留旧版的 `baseRequestClient` Blob 下载行为。旧版 [goals.ts](G:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/goals.ts:196)、[goals.ts](G:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/goals.ts:204)、[goals.ts](G:/hse-dashboard/安全看板vben/apps/web-antd/src/api/hse/goals.ts:477) 均使用 `baseRequestClient`，并以 `(response as any).data || response` 返回 Blob。

新版 [goals.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/goals.ts:153)、[goals.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/goals.ts:298)、[goals.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/goals.ts:305) 都改为 `requestClient` 直接返回。该客户端启用了默认业务 JSON 响应拦截器（[request.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/api/request.ts:73)）并设置 `responseReturn: 'data'`（[request.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/api/request.ts:108)），不能代替专用文件读取客户端。

影响范围为责任书模板下载、安委会活动模板下载、安委会受保护文件预览。必须恢复旧版客户端和兼容解包，不能改服务端、不能改变端点。

### P1-3：预算“状态”筛选没有作用于列表请求

[budget/index.vue](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/objectives/budget/index.vue:64) 定义并在 UI 暴露了 `searchForm.status`，但 [fetchData](G:/hse-dashboard/安全看板vben/apps/web-naive/src/views/objectives/budget/index.vue:180) 创建的 `BudgetListParams` 只传 `page`、`pageSize`、`keyword`、`year`，遗漏 `status`。

新版类型 [goals.ts](G:/hse-dashboard/安全看板vben/apps/web-naive/src/api/hse/goals.ts:409) 和旧版契约均支持该字段。用户选择“计划中/执行中/已完成”后，列表请求和结果均不会按状态过滤，属于明确业务回归。

## 已确认符合要求的内容

- 路由模块的父路由、四个子路由、`admin` 权限、redirect 与 `ObjectivesAssessment.hideInMenu` 符合本批范围；未提前加入月度考核路由。
- 责任书使用专用的 `importResponsibility` 及结果展示，并未错误改用通用导入。
- 安委会保留“安全人员”和“安委会”活动台账两个页签；安全人员未引入不应有的写操作入口。
- 四页均隐藏无后端能力支撑的导出动作；`rg -n "ant-design-vue" apps/web-naive/src` 无命中。
- 独立执行通过：

```text
pnpm --filter @vben/web-naive run typecheck  -> EXIT 0
pnpm --filter @vben/web-naive run build      -> EXIT 0
git diff --check -- 安全看板vben/apps/web-naive docs/Naive UI -> 无输出
```

静态检查无法发现组件 props 漏传和筛选请求参数缺失，不能替代针对上传后状态和网络请求的浏览器回归。

## 修复验收门槛

1. 考核、预算的导入对话框都完整绑定五项状态，上传一个**不提交**的可安全测试文件后，能看到预览；在预览有效时确认按钮可用。不得执行确认入库。
2. 三个 Blob 函数恢复 `baseRequestClient`、`responseType: 'blob'` 和兼容返回值解包；浏览器仅验证模板下载与已有文件预览入口的请求/响应类型，不创建数据。
3. 预算依次选择状态、查询、重置；保存原始网络请求证据，证明查询含正确 `status`，重置后不含该参数。
4. 重新执行 typecheck、production build、Ant Design 扫描和 diff 检查；补充执行总结，诚实区分“入口可见”和“上传后的状态验证”。

