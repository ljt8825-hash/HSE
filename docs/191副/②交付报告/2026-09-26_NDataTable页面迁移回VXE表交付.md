# NDataTable 页面迁移回 VXE/HseDataGrid 交付

> 日期：2026-09-26  |  类别：②交付报告  |  归属对话：当前会话
> 背景：web-naive 实为「VXE + Naive NDataTable」两套表格并存。本次把 NDataTable 统一迁移回 VXE（统一目标组件 HseDataGrid）。
> 验收口径（用户确认）：**迁移后不新增 TS 类型错误**即可（仓库在 NDataTable 页本就有大量历史类型报错，不顺带修）。

## 一、交付结果

- **已迁移并验收：30 处 NDataTable 表格**（19 个文件的绝大部分）→ 统一为 `HseDataGrid`（VXE 封装 `#/components/hse`）。
- **Typecheck 验收通过：迁移后错误 60 = 基线 60，零新增**（剩余均为迁移前就存在、仅行号位移的同文案旧错，符合"不新增"口径）。
- 未改动任何数据流、事件、业务逻辑；仅做表库 + 交互渲染的 1:1 迁移（render 函数 → VXE `slots`）。

## 二、迁移规范（沉淀，后续复用）

- 列定义：`key` → `field`；`sortable`/`ellipsis`/`fixed`/`align`/`width` 保留映射（`ellipsis`→`showOverflow`）。
- 需自定义单元格的列：`slots: { default: 'slotName' }` + 模板 `<template #slotName="{ row }">`。
- 表格标签：`<NDataTable>` → `<HseDataGrid>`；`:pagination`→`:pager`（false/true/对象均可透传）；`:row-key="fn"`→`row-key="主键字段"`；`size`(默认 small)、`:scroll-x` 删除；`:loading` 保留；`:max-height`→`height`。
- render 翻译：`h('span',{class})`→`<span :class>`、`h(NTag)`→`<NTag>`、`h(NProgress)`→`<NProgress type="line" :percentage>`、`h(NSwitch)`→`<NSwitch :value @update:value>`、`h(NButton/NSpace/NPopconfirm/NPopover)`→对应模板 + `@click`。
- naive 组件仅在模板仍使用时保留 import；列数组类型 `DataTableColumns<T>`→`VxeTableGridColumns`（`@vben/plugins/vxe-table`）。
- 服务端分页：`:pager` + `:total` + `:current-page` + `:page-size` + `@page-change`。
- 勾选列（training/ledger、site/driver/assessment 等）：用模板 `NCheckbox` slot 手动维护 checked keys（含全选/半选），原批量操作逻辑不变。
- CSV/明细/附件/版本/保单等弹窗(NModal/NDrawer)内表格同样迁移。

## 三、已迁移文件清单（30 处）

- `hse/assessment-analysis/`：TownshipRanking(试点）、DeductionAnalysis(3)、DeductionDetail(1)、DepartmentRanking(6)、IndicatorAnalysis(1)、TargetProgress(1)
- `hse/`：executive-cockpit(1)、leader-dashboard(7)、warning-center(4)、accident-analysis(2)、ai-analysis(4)
- `training/certificates`(2)、`training/ledger`(2)、`insurance/personnel`(2)、`regulations`(2)、`site/driver/assessment`(2)、`demos/table`(1)

合计 30 处，统一为 HseDataGrid。

## 四、已知例外（本次未迁，落档）

**`site/driver/violation/ViolationList.vue`（主表，1 处）** 与 **`hse/assessment-rule/index.vue`（3 处）**：

- 均为 **「脏行编辑」+ HTML5 行拖拽排序** 交互：行内按编辑态实时渲染 NInput/NInputNumber/NSelect/NCheckbox/规则子编辑器，靠 `row-props` 绑 `ondragover/ondrop` + `draggable` 手柄整表重排。
- **VXE v4 无内建行拖拽**（经 `node_modules/vxe-table` 类型核验，无 drag/dnd 接口），HseDataGrid 也不透传行级 DnD；忠实迁移需手写 vxe 自定义拖拽垫片（外层容器 `dragover/drop` + 读 `tr[data-rowindex]`），属独立专项工程量。
- `assessment-rule` 本身自带约 48 条历史 TS 错误（基线），强行改动有破坏关键配置页的高风险。
- 处理建议：如需彻底统一，开专项时间盒迁移——用 HseDataGrid `slots` 承载编辑（已证明可行），拖拽用外层事件回流 `data-rowindex` 实现，并逐页 typecheck + 页面验收；在此之前保留 NDataTable 不影响功能。

## 五、边界与遗留

- 纯前端、仅表库统一；未触碰后端/生产 5876/生产库/`.env`/计划任务/路由/接口，未改登录取权。
- 遵循迁移约束（仅 Naive/Vben/VXE、禁 ant）。
- **Typecheck 已做**；**未做 vite build 与浏览器实测**（建议本地 dev 5173 抽查：warning-center 的 NTag/NProgress/NSwitch 翻译、training/ledger 与 driver/assessment 的勾选、各弹窗内表格）。生产 dist 待下次前端发布随构建生效。
- 18 个文件因迁移发生了较多改动；如需可提供 git diff 复核。