# 提示词-06B-2-复审修正-Naive-HSE目标职责迁移

> 来源：阶段06B-2-修复-执行总结.md 的 Codex 复审结论
> 日期：2026-08-18
> 性质：复审退回修正（1 处），不改动其余已通过内容

---

## 复审结论摘要

对 workbuddy 提交的《阶段06B-2-修复-执行总结.md》逐项独立核验后，以下声称均属实并通过：

- typecheck：`vue-tsc --noEmit` → EXIT=0 ✅
- build：`✓ built` + dist.zip 生成 ✅
- antd 扫描：`apps/web-naive/src` 无 `ant-design-vue` 残留 ✅
- P1-2（goals.ts）：`baseRequestClient` + 认证头拦截器 + 3 个 Blob 函数返回 `Promise<Blob>`，与旧版 `request.ts` 一致 ✅
- P1-1（assessment/budget）：5 项导入状态解构 + `HseImportDialog` 5 个 props 绑定，接口名真实存在 ✅
- 证据文件：`shots_s6b2fix/` 截图 + `s6b2fix_run5.log` + `regression_s6b2fix.json` 均存在 ✅

**唯一需退回修正的问题（P1-3 报告失实 + 契约偏离）：**

报告第四节声称「统计请求维持旧版 params：keyword+year，**未无证据扩展**」，但实际代码给 `statsParams` 也加了 `status` 参数，与旧版契约不符。

---

## 要修正的问题

**文件：** `apps/web-naive/src/views/objectives/budget/index.vue`

**位置：** `fetchData()` 内第 192-195 行的 `statsParams`

**现状：**

```ts
const statsParams: BudgetApi.BudgetListParams = {
  keyword: searchForm.keyword || undefined,
  year: searchForm.year ?? new Date().getFullYear(),
  status: searchForm.status || undefined,   // ← 多余，偏离旧版契约
};
```

**旧版契约（`apps/web-antd/src/views/objectives/budget/index.vue` 第 548-551 行）：**

```ts
const statsParams: BudgetApi.BudgetListParams = {
  keyword: searchForm.keyword || undefined,
  year: searchForm.year ?? new Date().getFullYear(),
};   // 仅 keyword + year，不含 status
```

---

## 修正要求

1. 从 `statsParams` 中移除 `status: searchForm.status || undefined`，使**统计请求**严格回归旧版契约（仅 `keyword + year`）。
2. **列表请求** `params` 中的 `status: searchForm.status || undefined`（第 190 行）是本次 P1-3 修复目标，**必须保留，不得改动**。
3. 不得改动以下范围：
   - `apps/web-antd`、`server`、SQL、数据库、账号、依赖、锁文件、Vite/代理；
   - `routes/index.ts`、路由模块、公共 HSE 组件；
   - `apps/web-naive/src/api/hse/goals.ts`（P1-2 已通过）；
   - `apps/web-naive/src/views/objectives/assessment/index.vue`（P1-1 已通过）。
4. 无新增 `ignoreAccess`/`publicRoutes`；无新增路由与依赖。

---

## 验证要求

1. 重跑 `pnpm --filter @vben/web-naive run typecheck`，确认 EXIT=0。
2. 重跑 production build，确认成功。
3. 浏览器实测：选择状态「计划中」查询时——
   - 列表请求 `/api/objectives/safety-budget` 携带 `status=planning`；
   - 统计请求 `/api/objectives/safety-budget/stats` **不携带** `status`。
   保留原始网络请求日志与截图作为证据。

---

## 交付要求

输出：
1. 修正说明（精确改动点 + 前后 diff）。
2. 验证命令与原始结果（typecheck/build 退出码、网络请求日志、截图）。
3. 最终 diff 摘要，确认仅 `budget/index.vue` 的 `statsParams` 一行发生变更。