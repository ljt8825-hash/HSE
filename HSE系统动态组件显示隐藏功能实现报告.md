# HSE系统动态组件显示隐藏功能实现报告

---

## 一、实现概述

本报告记录HSE系统中主要列表页面增加「组件显示设置」功能的实现过程。用户可以通过设置面板动态控制以下组件的显示/隐藏状态：

1. **统计卡片组**：支持单个卡片隐藏
2. **操作栏按钮**：导入数据、下载模板、新增按钮等
3. **筛选器区域**：整个筛选表单区域

所有配置按页面 key 保存到 localStorage，页面加载时自动应用，并提供「恢复默认」按钮。

---

## 二、实现方式和关键代码

### 2.1 核心能力封装

#### 2.1.1 `useComponentVisibility` composable

位置：`apps/web-antd/src/composables/useComponentVisibility.ts`

功能：
- 按页面 key 从 localStorage 加载和保存显示配置
- 管理统计卡片、操作按钮、筛选器三种可见性状态
- 提供恢复默认配置能力
- 自动为新增加的组件设置默认显示

```typescript
export interface VisibilityConfig {
  stats: Record<string, boolean>;
  actions: Record<string, boolean>;
  filter: boolean;
}

export function useComponentVisibility(options: UseComponentVisibilityOptions) {
  const { pageKey, statItems, actionButtons } = options;
  const storageKey = `component-visibility:${pageKey}`;

  function buildDefaultConfig(): VisibilityConfig {
    const stats: Record<string, boolean> = {};
    statItems.value.forEach((item) => {
      stats[item.key] = true;
    });
    const actions: Record<string, boolean> = {};
    actionButtons.value.forEach((item) => {
      actions[item.key] = true;
    });
    return { stats, actions, filter: true };
  }

  const config = ref<VisibilityConfig>(buildDefaultConfig());

  function loadFromStorage() {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved: Partial<VisibilityConfig> = JSON.parse(raw);
      const defaultConfig = buildDefaultConfig();
      config.value = {
        stats: { ...defaultConfig.stats, ...saved.stats },
        actions: { ...defaultConfig.actions, ...saved.actions },
        filter: saved.filter ?? defaultConfig.filter,
      };
    }
  }

  const isStatVisible = computed(() => (key: string) => config.value.stats[key] !== false);
  const isActionVisible = computed(() => (key: string) => config.value.actions[key] !== false);
  const isFilterVisible = computed(() => config.value.filter !== false);

  loadFromStorage();

  return { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault };
}
```

#### 2.1.2 `ComponentVisibilitySettings` 组件

位置：`apps/web-antd/src/components/hse/ComponentVisibilitySettings.vue`

功能：
- 提供设置按钮（齿轮图标）
- 点击后右侧滑出抽屉设置面板
- 分组展示：统计卡片、操作栏按钮、筛选器区域
- 支持全选/取消全选
- 提供「恢复默认」按钮

```vue
<template>
  <Tooltip title="组件显示设置">
    <Button type="text" @click="open = true">
      <SettingOutlined />
      显示设置
    </Button>
  </Tooltip>

  <Drawer v-model:open="open" title="组件显示设置" placement="right" width="320px">
    <div class="visibility-settings">
      <div class="setting-section">
        <div class="section-title">
          <Checkbox v-model:checked="allStatsSelected" />
          <span>统计卡片</span>
        </div>
        <div class="section-items">
          <Checkbox
            v-for="item in statItems"
            :key="item.key"
            v-model:checked="localConfig.stats[item.key]"
          >
            {{ item.label }}
          </Checkbox>
        </div>
      </div>

      <div class="setting-section">
        <div class="section-title">
          <Checkbox v-model:checked="allActionsSelected" />
          <span>操作栏按钮</span>
        </div>
        <div class="section-items">
          <Checkbox
            v-for="item in actionButtons"
            :key="item.key"
            v-model:checked="localConfig.actions[item.key]"
          >
            {{ item.label }}
          </Checkbox>
        </div>
      </div>

      <div class="setting-section">
        <div class="section-title">
          <span>筛选器区域</span>
          <Switch v-model:checked="localConfig.filter" size="small" />
        </div>
      </div>
    </div>

    <template #footer>
      <Space class="drawer-footer">
        <Button @click="open = false">关闭</Button>
        <Button type="primary" @click="handleReset">恢复默认</Button>
      </Space>
    </template>
  </Drawer>
</template>
```

---

### 2.2 页面接入方式

以 **accidents/index.vue** 为例：

#### 步骤1：导入组件和 composable

```typescript
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useComponentVisibility } from '#/composables/useComponentVisibility';
```

#### 步骤2：定义可配置的按钮项

```typescript
const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: '导入数据' },
  { key: 'create', label: '新增事故' },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'accidents',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));
```

#### 步骤3：模板中绑定显示状态

```vue
<!-- 统计卡片区域 -->
<SortableStatRow v-if="hasVisibleStats" page-key="accidents">
  <Col
    v-for="stat in statItems"
    :key="stat.key"
    v-show="isStatVisible(stat.key)"
  >
    <HseStatCard ... />
  </Col>
</SortableStatRow>

<!-- 操作栏 -->
<Space>
  <ImportButtonGroup v-if="isActionVisible('import')" ... />
  <Button v-if="isActionVisible('create')" ...>新增事故</Button>
  <ComponentVisibilitySettings
    title="事故管理显示设置"
    v-model:model-value="config"
    :stat-items="visibilityStatItems"
    :action-buttons="actionButtons"
    @reset="resetToDefault"
  />
</Space>

<!-- 筛选器 -->
<Form v-if="isFilterVisible" layout="inline" class="filter-form">
  ...
</Form>
```

---

## 三、当前主要页面结构扫描结果

| 页面 | 表格组件 | 统计卡片布局 | 操作栏结构 | 筛选器 |
|------|---------|-------------|-----------|--------|
| accidents | AntD Table | SortableStatRow（4项） | 导入 + 新增 | 关键词/年份/月份/等级/类型/状态 |
| insurance/personnel | AntD Table | SortableStatRow（4项） | 视图切换 + 批量续保 + 导入 + 新增 | 关键词/部门/保险状态/高危工种 |
| hazards | AntD Table | SortableStatRow（4项） | 导入 + 新增 | 关键词/等级/状态/分类/区域/年月/上报人/日期 |
| inspection | AntD Table + Kanban | SortableStatRow（4项） | 列表/看板 Tab + 导入 + 新增 | 关键词/类型/级别/状态/部门/日期 |
| training | AntD Table | SortableStatRow（5项） | 导入 + 新增 | 关键词/类型/状态 |
| emergency | AntD Table（双 Tab） | 普通 Row（4项） | 外层导入按钮 | 预案 Tab + 演练 Tab 各有一套筛选器 |
| goals | AntD Table | 普通 Row（5项） | 导入 + 新增 | 关键词/年份/类型/状态/部门 |

---

## 四、变更文件清单

### 4.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `apps/web-antd/src/composables/useComponentVisibility.ts` | 组件可见性状态管理 composable |
| `apps/web-antd/src/components/hse/ComponentVisibilitySettings.vue` | 组件显示设置抽屉组件 |

### 4.2 修改文件

| 文件路径 | 变更内容 |
|---------|---------|
| `apps/web-antd/src/views/accidents/index.vue` | 统计卡片/操作按钮/筛选器接入显示隐藏 |
| `apps/web-antd/src/views/insurance/personnel/index.vue` | 统计卡片/操作按钮/筛选器接入显示隐藏 |
| `apps/web-antd/src/views/hazards/index.vue` | 统计卡片/操作按钮/筛选器接入显示隐藏 |
| `apps/web-antd/src/views/inspection/index.vue` | 统计卡片/操作按钮/筛选器接入显示隐藏 |
| `apps/web-antd/src/views/training/index.vue` | 统计卡片/操作按钮/筛选器接入显示隐藏 |
| `apps/web-antd/src/views/emergency/index.vue` | 统计卡片/外层导入按钮/双 Tab 筛选器接入显示隐藏 |
| `apps/web-antd/src/views/goals/index.vue` | 统计卡片/操作按钮/筛选器接入显示隐藏 |

### 4.3 localStorage 键名规则

| 页面 | localStorage key |
|------|-----------------|
| 事故管理 | `component-visibility:accidents` |
| 人员保险 | `component-visibility:insurance-personnel` |
| 隐患排查 | `component-visibility:hazards` |
| 三违管理 | `component-visibility:inspection-violation` |
| 培训管理 | `component-visibility:training` |
| 应急管理 | `component-visibility:emergency` |
| 目标管理 | `component-visibility:goals` |

---

## 五、验证清单

### 5.1 主要页面显示/隐藏验证

- [ ] 打开事故管理页面，点击「显示设置」按钮
- [ ] 在抽屉中取消勾选某个统计卡片，该卡片立即隐藏
- [ ] 取消勾选「导入数据」按钮，导入按钮立即隐藏
- [ ] 取消勾选「新增事故」按钮，新增按钮立即隐藏
- [ ] 关闭「筛选器区域」开关，筛选表单立即隐藏
- [ ] 重复验证人员保险、隐患排查、三违管理、培训管理、应急管理、目标管理页面

### 5.2 刷新后保持验证

- [ ] 在任意页面隐藏部分组件后刷新浏览器
- [ ] 刷新后隐藏的组件保持隐藏状态
- [ ] 刷新后显示的组件保持显示状态
- [ ] 打开浏览器开发者工具，确认 localStorage 中保存了对应 key 的配置

### 5.3 恢复默认验证

- [ ] 在显示设置抽屉中点击「恢复默认」
- [ ] 所有统计卡片恢复显示
- [ ] 所有操作按钮恢复显示
- [ ] 筛选器区域恢复显示
- [ ] localStorage 中对应 key 的配置被重置

### 5.4 UI一致性验证

- [ ] 设置按钮样式与页面其他按钮协调
- [ ] 抽屉面板使用 CSS 变量，支持暗黑模式
- [ ] 隐藏组件后页面布局无错乱
- [ ] 所有页面原有 CRUD、导入、筛选功能正常（在显示状态下）
- [ ] 统计卡片区域的拖拽排序功能不受显示隐藏影响

---

## 六、技术要点

### 6.1 为什么使用 v-show 控制单个统计卡片

- 统计卡片区域可能接入了拖拽排序（SortableStatRow）
- 使用 `v-if` 会从 DOM 中移除元素，可能破坏 sortable 的状态
- 使用 `v-show` 只改变 `display` 属性，保留 DOM 结构，确保拖拽排序稳定

### 6.2 为什么统计卡片整体使用 v-if

- 当所有统计卡片都隐藏时，使用 `v-if="hasVisibleStats"` 移除整个空区域
- 避免留下空白占位，保持页面紧凑

### 6.3 应急管理页面的特殊处理

- emergency 页面包含「应急预案」和「应急演练」两个 Tab
- 每个 Tab 内都有自己的筛选器表单
- 将两个 Tab 的筛选器表单都绑定到同一个 `isFilterVisible`
- 这样「筛选器区域」开关可以同时控制两个 Tab 的筛选器显示/隐藏

### 6.4 与拖拽排序的兼容性

- 动态显示隐藏功能与之前的表格列拖拽、统计卡片拖拽功能独立
- localStorage key 不同，互不冲突
- 统计卡片拖拽排序基于 DOM 顺序，显示隐藏不改变元素顺序

---

## 七、总结

本次实现基于 Vben Admin + Ant Design Vue 原生能力，以最小侵入性完成了主要页面的动态组件显示隐藏功能：

1. **通用封装**：通过 `useComponentVisibility` composable 统一管理配置
2. **统一入口**：通过 `ComponentVisibilitySettings` 组件提供一致的设置交互
3. **持久化**：配置按页面 key 保存到 localStorage，刷新后自动应用
4. **可恢复**：提供「恢复默认」按钮一键还原
5. **零额外依赖**：仅使用 Vue 3 响应式、Ant Design Vue 组件和原生 localStorage

---

*报告生成时间：2026年7月16日*
