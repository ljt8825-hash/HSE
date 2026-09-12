# 表格列宽拖拽 —— 纯 Vben 原生实现

## 结论先行

你的需求"不自定义任何组件/代码/样式、仅用 Vben 原生干净组件实现列宽拖拽"在本项目里**已经是免费能力**：

- 本项目 `apps/web-antd/src/adapter/vxe-table.ts` 中已经全局开启：
  ```ts
  setConfig({
    grid: {
      columnConfig: { resizable: true }, // ← 列宽拖拽全局开启
      ...
    },
  });
  ```
- 因此只要用 Vben 原生网格 `useVbenVxeGrid`（`@vben/plugins/vxe-table`），**列宽拖拽开箱即用**，无需写任何封装、注入或样式。
- 列宽状态的"持久化 + 响应式"用 vxe-table 原生 `id` + `customConfig: { storage: true }` 即可，刷新后自动恢复，同样零自定义。

完整可运行示例见同目录 `列宽拖拽-原生Vben实现示例.vue`。

---

## 实现要点（对应你的 4 条要求）

| 要求 | 实现方式（Vben 原生） |
|---|---|
| 1. 完全基于内置表格组件，不引入自定义封装 | 使用 `useVbenVxeGrid`（`@vben/plugins/vxe-table`），不写任何 wrapper 组件 |
| 2. 代码风格与 Vben 一致 | 与官方 `views/demos` 用法一致：`reactive(gridOptions)` + `const [Grid] = useVbenVxeGrid(gridOptions)` + `<Page><Grid/></Page>` |
| 3. 鼠标拖拽列边框调整列宽 | adapter 全局 `columnConfig.resizable: true` 已开启，拖动列右边缘即可 |
| 4. 列宽状态正确维护与响应 | 会话内：vxe-table 内部实时维护并响应；跨刷新：`customConfig.storage + id` 自动持久化到 localStorage |

---

## 核心代码（节选）

```ts
import { reactive } from 'vue';
import { Page } from '@vben/common-ui';
import { useVbenVxeGrid, type VxeTableGridOptions } from '@vben/plugins/vxe-table';

const gridOptions = reactive<VxeTableGridOptions<RowType>>({
  id: 'hse-column-resize-demo',        // 持久化键前缀（原生）
  customConfig: { storage: true },     // 列宽/列序/显隐自动存 localStorage（原生）
  columns: [
    { title: '姓名', field: 'name', width: 120 },
    { title: '部门', field: 'department', width: 160 },
    // ...
  ],
  data: tableData,
  border: true,
  pagerConfig: { pageSize: 10 },
});

const [Grid] = useVbenVxeGrid(gridOptions); // 返回 [组件, api]，无额外封装
```

```vue
<template>
  <Page title="列宽拖拽（Vben 原生网格）" description="拖动列右边缘调整列宽，刷新后自动保留">
    <Grid />
  </Page>
</template>
```

---

## 远程数据（接口分页）写法

把静态 `data` 换成 Vben 原生的 `proxyConfig` 即可，仍是零自定义：

```ts
const gridOptions = reactive<VxeTableGridOptions<RowType>>({
  id: 'hse-column-resize-remote',
  customConfig: { storage: true },
  columns: [/* ... */],
  proxyConfig: {
    ajax: {
      query: async ({ page }) => {
        const res = await fetch(`/api/your-list?page=${page.currentPage}&size=${page.pageSize}`);
        const data = await res.json();
        return { items: data.items, total: data.total };
      },
    },
  },
  pagerConfig: { pageSize: 10 },
});
```

> 响应字段名与本项目的 `adapter/vxe-table.ts` 中 `proxyConfig.response` 保持一致（`result: 'items'` / `total: 'total'`）。

---

## 如何接入现有 HSE 页面

当前 HSE 5 个拖拽页（事故/风险/现场/保险/培训）使用的是 **ant-design-vue 的 `<Table>`**，列宽拖拽的"原生 Vben 方式"是 vxe-grid，两者 API 不同（分页、列渲染、插槽都不同）。

- 若要保留现有 antd 表格：列宽拖拽需用 antd 的方式（或已存在的自定义手柄方案），不属于"纯 Vben 原生网格"。
- 若要统一为"Vben 原生网格"：需将这 5 个页面的 antd `<Table>` 改写为 `useVbenVxeGrid`（中等规模重构，分页/排序/自定义单元格需逐一迁移）。

如确认要我把某个 HSE 页面整体迁移到 Vben 原生网格（从而获得原生列宽拖拽 + 原生列顺序拖拽 + 原生显隐持久化），告诉我具体页面即可，我会按"只改 HSE 遗留页 + 必要 adapter"的约束来进行。
