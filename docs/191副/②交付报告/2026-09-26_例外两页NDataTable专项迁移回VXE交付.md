# 例外两页 NDataTable 专项迁移回 VXE 交付

> 交付日期：2026-09-26
> 归属：NDataTable→HseDataGrid 统一计划 的收尾专项（ViolationList + assessment-rule 两个拖拽例外页）

## 一、背景

此前 30 处 NDataTable 已迁移回 VXE/HseDataGrid（见 `2026-09-26_NDataTable页面迁移回VXE表交付.md`），遗留两个**例外页**因历史实现依赖行级拖拽 + 脏行编辑，当时未一并迁移：

- `site/driver/violation/ViolationList.vue` 主表
- `hse/assessment-rule/index.vue` 三处表格（类别扣分上限 2 处、明细子项管理抽屉 1 处）

难点：VXE v4.19.25 无内建行拖拽，且这两页用了 HTML5 DnD + NDataTable render 内联编辑。经核验 VXE v4 提供 `rowDragConfig`（`row-config.drag=true` + 列 `dragSort:true` + `trigger:'cell'` 手柄拖拽），据此扩展 HseDataGrid 的 `rowDrag` prop 后，两页均可原生迁移，无需手写 DnD 垫片。

## 二、方案

### HseDataGrid 组件扩展（一行新增）
- 新增 `rowDrag?: boolean | Record<string,any>` prop：`true=整行可拖`；`{ trigger:'cell' }`=仅 `dragSort` 手柄列可拖。
- 内部 `buildGridOptions` 合并 `rowDragConfig`（`showIcon:false, trigger:'cell'`）+ `rowConfig.drag=true`，并透传 `row-dragend` 事件。
- 调用方在 `row-dragend` 里用 `dragRow/newRow`（数据源引用）在自身数组重排，随 `data` prop 变化自动刷新。

### 迁移内容

**ViolationList.vue** —— 已在前一阶段完成，本专项核对确认无 NDataTable 残留，拖拽走 `:row-drag="{trigger:'cell'}"` + `@row-dragend`，与下述 assessment-rule 同模式。无需改动。

**assessment-rule/index.vue** —— 本专项主体，3 处 NDataTable → HseDataGrid。

| 表格 | 原实现 | 迁移后 |
|------|--------|--------|
| 类别扣分上限·经理 tab | NDataTable + `catColumns`(render) + `:row-props="catRowProps"` | HseDataGrid + `catVxeColumns`(field/slots) + `:row-drag` |
| 类别扣分上限·管理员 tab | 同上（共用 catColumns/catLimits） | 同上（第二个 HseDataGrid，slots 复用） |
| 明细子项管理抽屉 | NDataTable + `detailColumns` + `detailPagination` | HseDataGrid + `detailVxeColumns` + VXE 分页 |

## 三、关键实现要点

1. **列定义重建**：`catColumns`→`catVxeColumns`（`key`→`field`，`render`→`slots.default/header` + 模板 `#slot`）；复选框表头/单元格用 VXE header+default 双 slot。
2. **行拖拽**：`sort` 列 `dragSort:true` + `:row-drag="{trigger:'cell'}"` + `@row-dragend="onRowDragend"`；移除原 HTML5 `row-props` ondrag/ondrop 与死代码 `catStore.dragFrom`。
3. **脏行编辑**：类别/maxDeduct/扣分对象 由 render h() 翻译为模板内 `<template v-if="isEditing(rowIndex)">` 的 NInput/NInputNumber/NSelect；行子表编辑器（规则名称）包成 `CatRuleItemsEditor`（`defineComponent` 复用原 `makeRuleItemsEditor` render 逻辑）供 slot 使用。
4. **VXE row-key 唯一性**：
   - 类别行新增客户端唯一键 `_key`（模块级自增 `c{n}`），并在 `startEdit` 还原深拷贝时保留 `_key`；`_key` 声明入 `CategoryLimit`（`_key?`）与 `_ruleItems?` 类型。
   - 明细行补 `_t`（DB 行 `d{id}`，新建/导入行原已有），`row-key="_t"`。
   - 持久化载荷为显式字段映射，`_key`/`_ruleItems` 均不落库。
5. **分页**：明细抽屉 VXE 分页用 `:pager` + `:current-page` + `:page-size` + `:total` + `@page-change`；`onDetailPageChange` 在 pageSize 变化时回到第 1 页（对齐原 Naive `onUpdatePageSize` 行为）。
6. **样式适配**（纯 CSS 选择器随表库切换）：
   - `.cat-table .n-data-table-td/.n-data-table-th` → `.cat-table .vxe-body--column`（输入内容居中）。
   - `.cat-drag-row:hover` → `.vxe-body--row:hover`（手柄悬停绿高亮）。
   - 删除死导入 NDataTable、NCascader 及 5 个无调用 helper（catDeductTargetValue/onCatDeductTarget/catDeductTargetText/toggleCategoryRule/addCategoryRule）。

## 四、验收（typecheck）

- 命令：`pnpm run typecheck`（web-naive，vue-tsc `--noEmit --skipLibCheck`）。
- 迁移区域（类别两表 + 明细抽屉 + 新增列/slots）**零新增类型错误**。
- 迁移过程中自身引入的错误已全部清零：
  - `_key` 类型报错（startEdit 取值、addCategoryRow 字面量）→ `CategoryLimit` 补 `_key?` 已解；
  - addCategoryRow 的 `_ruleItems` 字面量超限 → 补 `_ruleItems?` 已解；
  - 模板 `<NSpace wrap="false">`（字符串非布尔，导致恒换行 + 类型错误）→ `:wrap="false"` 已解；
  - 死代码/死导入清理。
- 剩余 assessment-rule 类型错误（27 条）全部位于**未改动区域**（`makeRuleItemsEditor` name/i 隐式 any、树组件 `n.children`、视图抽屉 `row` 可能未定义、明细导入 addDetail 缺 id、主规则表 HseStatusType 配色、`__VLS_ctx.viewData`），与本专项无关，属既有基线，不随本交付新增。
- 全局 typecheck 出错文件均为历史存量（assessment-monthly、employee、meeting-records、responsibility-forms、grid、violation/analysis、training/certificates 等），非本次改动引入。

## 五、变更文件

| 文件 | 变更 |
|------|------|
| `apps/web-naive/src/components/hse/HseDataGrid.vue` | 新增 `rowDrag` prop + rowDragConfig 合并 + `row-dragend` 透传 |
| `apps/web-naive/src/views/hse/assessment-rule/index.vue` | 3 处 NDataTable→HseDataGrid，列重建 + slots + 拖拽/编辑改造 + CSS 适配 + 清理死代码 |
| `apps/web-naive/src/api/hse/assessment-rule.ts` | `CategoryLimit` 补 `_key?`、`_ruleItems?` 类型 |

## 六、边界

- 全程未触碰生产后端 5876 / 生产 `.env` / 计划任务 `HSE-Backend` / 生产库表（含 WPS 写）；未改其他模块代码与登录/鉴权逻辑。
- 纯前端 + 组件扩展，未发起任何生产写操作。

## 七、迁移逻辑源码级验证（2026-09-26 补充，36/36 PASS）

> 方式：从真实 `index.vue` 提取关键函数体（`onRowDragend`/`startEdit`/`cancelEdit`/`saveRowEdit`/`addCategoryRow`/`removeCategoryRow`/`addDetail`/`removeDetailRow`/`onDetailPageChange`），注入运行时替身作用域后喂边界入参断言；全程只读，不登录、不落库、不改文件。
> 脚本：`server/.dev-runtime/_verify_assessment_rule_migrate.cjs`

| # | 验证分组 | 断言条数 | 结果 |
|---|----------|----------|------|
| 1 | 结构契约（row-key/row-drag/row-dragend/dragSort/明细分页/无 NDataTable 残留/CatRuleItemsEditor 复用） | 11 | 全 PASS |
| 2 | 行拖拽重排 `onRowDragend`（top/bottom/首尾/原地/越界/不在列表） | 8 | 全 PASS |
| 3 | 行编辑 startEdit/cancelEdit/saveRowEdit（_key 保留、深拷贝还原、越界、退出编辑态并触发保存） | 8 | 全 PASS |
| 4 | 类别行新增/删除（addCategoryRow 唯一 _key+id=null+_ruleItems 初值、removeCategoryRow 清 checked） | 5 | 全 PASS |
| 5 | 明细子项 addDetail/removeDetailRow/onDetailPageChange（_t 唯一、页码 clamp、pageSize 变化回第 1 页） | 4 | 全 PASS |

关键结论：
- **拖拽重排逻辑正确**：`splice(from,1)` 后按 `dragPos` 决定插入位（bottom 插 newRow 后，否则插其前），首尾/中间/原地/越界/引用缺失均符合预期。
- **行编辑无副作用**：`startEdit` 备份保留 `_key` 且为独立深拷贝；`cancelEdit` 完整还原并清编辑态；`saveRowEdit` 退出编辑态并触发整表保存。
- **明细分页正确**：`addDetail` 生成唯一 `_t`；`removeDetailRow` 删除后页码 clamp 到最大页；`onDetailPageChange` 在 pageSize 变化时回第 1 页（对齐原 Naive 行为）。
- ViolationList.vue 的 `onRowDragend` 与 assessment-rule 实现**算法完全一致**，本验证同样覆盖其拖拽逻辑。

## 八、遗留

- 生产 dist 待下次前端发布重建生效。
- 浏览器验收（dev 5173 实测拖拽 + 行编辑）留待用户确认。