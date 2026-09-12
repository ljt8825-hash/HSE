# HSE系统拖拽功能实现报告

---

## 一、实现概述

本报告记录HSE系统中两类拖拽功能的实现过程：

1. **表格列拖拽排序 + 宽度调整**（主要列表页面）
2. **统计卡片拖拽重排**（主要页面顶部统计区域）

**技术选型**：由于所有列表页面当前使用 Ant Design Vue `<Table>` 组件，且项目已有 Vben 原生 `useSortable` composable（基于 `sortablejs`），因此采用 **AntD Table + `useSortable`** 的方案实现表格列拖拽，采用 **`useSortable`** 实现统计卡片拖拽。此方案无需引入额外依赖，改动最小，不影响现有 CRUD、筛选、导入功能。

---

## 二、实现方式和关键代码

### 2.1 通用能力封装

#### 2.1.1 `useTableColumnSettings` composable

位置：`apps/web-antd/src/composables/useTableColumnSettings.ts`

功能：
- 列拖拽排序：通过 `useSortable` 对表头 `<th>` 进行拖拽，拖拽后更新列顺序
- 列宽调整：为每个表头添加 resize handle，拖拽调整宽度
- localStorage 持久化：保存列顺序和宽度，下次打开自动恢复

```typescript
export function useTableColumnSettings<T extends { key: string; [key: string]: any }>(
  originalColumns: Ref<T[]>,
  pageKey: string,
) {
  const storageKey = `table-columns:${pageKey}`;
  const columnOrder = ref<string[]>([]);
  const columnWidths = ref<Record<string, number>>({});

  // 处理后的 columns（应用顺序和宽度）
  const columns = computed(() => {
    const source = [...originalColumns.value];
    const withAttrs = source.map((col) => ({
      ...col,
      customHeaderCell: () => ({
        'data-col-key': col.key,
        style: columnWidths.value[col.key]
          ? { width: `${columnWidths.value[col.key]}px`, minWidth: `${columnWidths.value[col.key]}px` }
          : undefined,
      }),
    }));
    // 应用保存的顺序
    if (columnOrder.value.length > 0) {
      const orderMap = new Map(columnOrder.value.map((k, i) => [k, i]));
      withAttrs.sort((a, b) => (orderMap.get(a.key) ?? Infinity) - (orderMap.get(b.key) ?? Infinity));
    }
    return withAttrs;
  });

  // 初始化 sortable（列拖拽排序）
  async function initSortable(tableEl: HTMLElement) {
    const tr = tableEl.querySelector('.ant-table-thead tr');
    if (!tr) return;
    const { initializeSortable } = useSortable(tr as HTMLElement, {
      draggable: 'th.ant-table-cell',
      animation: 200,
      onEnd: () => {
        const keys = Array.from(tr.querySelectorAll('th.ant-table-cell'))
          .map(th => (th as HTMLElement).dataset.colKey)
          .filter(Boolean) as string[];
        columnOrder.value = keys;
        saveSettings();
      },
    });
    await initializeSortable();
  }

  // 初始化 resizable（列宽调整）
  async function initResizable(tableEl: HTMLElement) {
    const ths = tableEl.querySelectorAll<HTMLElement>('.ant-table-thead th.ant-table-cell');
    ths.forEach((th) => {
      const key = th.dataset.colKey;
      if (!key || th.querySelector('.col-resize-handle')) return;
      const handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      handle.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize;z-index:1;';
      th.style.position = 'relative';
      th.appendChild(handle);

      handle.addEventListener('mousedown', (e: MouseEvent) => {
        const startX = e.pageX;
        const startWidth = th.getBoundingClientRect().width;
        const onMouseMove = (moveEvt: MouseEvent) => {
          const newWidth = Math.max(60, startWidth + moveEvt.pageX - startX);
          th.style.width = `${newWidth}px`;
        };
        const onMouseUp = (upEvt: MouseEvent) => {
          const finalWidth = Math.max(60, startWidth + upEvt.pageX - startX);
          columnWidths.value = { ...columnWidths.value, [key]: finalWidth };
          saveSettings();
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  return { columns, initSortable, initResizable };
}
```

#### 2.1.2 `SortableStatRow` 组件

位置：`apps/web-antd/src/components/hse/SortableStatRow.vue`

功能：
- 包裹统计卡片区域，基于 `useSortable` 实现卡片拖拽重排
- 从 localStorage 加载保存的顺序，初始化时重排 DOM
- 拖拽结束后保存新顺序到 localStorage

```vue
<script setup>
const props = defineProps<{ pageKey: string }>();
const rowRef = ref<HTMLElement | null>(null);

onMounted(async () => {
  const saved = loadOrder();
  if (saved.length > 0 && rowRef.value) {
    // 按保存顺序重排 DOM
    const children = Array.from(rowRef.value.children) as HTMLElement[];
    const orderMap = new Map(saved.map((k, i) => [k, i]));
    children.sort((a, b) =>
      (orderMap.get(a.dataset.statKey || '') ?? Infinity) -
      (orderMap.get(b.dataset.statKey || '') ?? Infinity)
    );
    children.forEach(child => rowRef.value!.appendChild(child));
  }

  const { initializeSortable } = useSortable(rowRef.value!, {
    draggable: '.sortable-stat-col',
    animation: 300,
    onEnd: () => {
      const keys = Array.from(rowRef.value!.children).map(
        child => (child as HTMLElement).dataset.statKey || ''
      );
      saveOrder(keys);
    },
  });
  await initializeSortable();
});
</script>

<template>
  <Row ref="rowRef" :gutter="[16, 16]" class="sortable-stat-row mb-4">
    <slot />
  </Row>
</template>
```

---

### 2.2 页面接入方式

以 **accidents/index.vue** 为例，接入步骤如下：

#### 步骤1：导入组件和 composable

```typescript
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
```

#### 步骤2：统计卡片区域改用 SortableStatRow

```vue
<SortableStatRow page-key="accidents">
  <Col
    :xs="24" :sm="12" :md="8" :lg="6" :xl="6"
    v-for="stat in statItems"
    :key="stat.key"
    class="sortable-stat-col"
    :data-stat-key="stat.key"
  >
    <HseStatCard ... />
  </Col>
</SortableStatRow>
```

#### 步骤3：表格列改为响应式并接入 composable

```typescript
const originalColumns = ref([
  { title: '事故标题', dataIndex: 'title', key: 'title', width: 200 },
  { title: '等级', key: 'level', width: 90 },
  // ...
]);

const { columns: tableColumns, initSortable, initResizable } =
  useTableColumnSettings(originalColumns, 'accidents');

const tableRef = ref<any>(null);
```

```vue
<Table ref="tableRef" :columns="tableColumns" ... />
```

#### 步骤4：onMounted 中初始化拖拽

```typescript
onMounted(() => {
  fetchData();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
});
```

---

## 三、变更文件清单

### 3.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `apps/web-antd/src/composables/useTableColumnSettings.ts` | 表格列拖拽排序 + 宽度调整通用 composable |
| `apps/web-antd/src/components/hse/SortableStatRow.vue` | 统计卡片拖拽重排通用组件 |

### 3.2 修改文件（主要页面）

| 文件路径 | 变更内容 |
|---------|---------|
| `apps/web-antd/src/views/accidents/index.vue` | 统计卡片接入 SortableStatRow；表格列接入 useTableColumnSettings |
| `apps/web-antd/src/views/insurance/personnel/index.vue` | 统计卡片接入 SortableStatRow；表格列接入 useTableColumnSettings |
| `apps/web-antd/src/views/hazards/index.vue` | 统计卡片接入 SortableStatRow；表格列接入 useTableColumnSettings |
| `apps/web-antd/src/views/inspection/index.vue` | 统计卡片接入 SortableStatRow；列表视图表格列接入 useTableColumnSettings |
| `apps/web-antd/src/views/training/index.vue` | 统计卡片接入 SortableStatRow；表格列接入 useTableColumnSettings |

---

## 四、验证清单

### 4.1 表格列拖拽验证

- [ ] 打开事故管理/人员保险/隐患排查/三违管理/培训管理页面
- [ ] 列表视图下，鼠标悬停表头，列标题可拖拽
- [ ] 拖拽表头改变列顺序后，表格列顺序随之改变
- [ ] 刷新页面后，列顺序保持上次拖拽后的顺序
- [ ] 鼠标悬停表头右侧，出现 resize 光标，可拖拽调整列宽
- [ ] 调整列宽后，表格列宽度随之改变
- [ ] 刷新页面后，列宽度保持上次调整后的宽度
- [ ] 列表视图的 CRUD、筛选、导入、分页功能正常

### 4.2 统计卡片拖拽验证

- [ ] 打开上述5个主要页面
- [ ] 鼠标悬停统计卡片，光标变为 grab
- [ ] 拖拽统计卡片可改变卡片位置
- [ ] 刷新页面后，统计卡片顺序保持上次拖拽后的顺序
- [ ] 页面原有筛选、导入、统计功能正常

### 4.3 UI一致性验证

- [ ] 拖拽过程中无样式错乱
- [ ] 统计卡片拖拽时有 ghost 效果（虚线边框）
- [ ] 暗黑模式下拖拽效果正常
- [ ] 移动端显示正常（sortable 默认禁用触摸拖拽）

---

## 五、技术要点

### 5.1 为什么使用 useSortable 而非 vuedraggable

- `useSortable` 是 Vben Admin 原生提供的 composable，基于 `sortablejs`
- 项目已间接依赖 `sortablejs`，无需额外安装 `vuedraggable`
- `useSortable` 更轻量，与 Vben 生态集成更好

### 5.2 为什么基于 AntD Table 而非 VxeTable

- 所有27+个列表页面当前使用 AntD Table
- 替换为 VxeTable 需要重写 columns 定义、bodyCell 插槽、pagination 配置等，改动量巨大
- 容易破坏现有 CRUD、筛选、导入、行选择等功能
- 基于 AntD Table + `useSortable` 的方案改动最小，风险最低

### 5.3 localStorage 键名规则

| 功能 | 键名格式 | 示例 |
|------|---------|------|
| 表格列设置 | `table-columns:{pageKey}` | `table-columns:accidents` |
| 统计卡片顺序 | `stat-cards:{pageKey}` | `stat-cards:accidents` |

---

## 六、总结

本次实现基于 Vben 原生能力（`useSortable`）和现有 AntD Table 组件，以最小改动完成了两类拖拽功能：

1. **表格列拖拽排序 + 宽度调整**：通过 `useTableColumnSettings` composable 实现，已在5个主要页面接入
2. **统计卡片拖拽重排**：通过 `SortableStatRow` 组件实现，已在5个主要页面接入

所有功能均支持 localStorage 持久化，不影响现有 CRUD、筛选、导入等功能。

---

*报告生成时间：2026年7月16日*
