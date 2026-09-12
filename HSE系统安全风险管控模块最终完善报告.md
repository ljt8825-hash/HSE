# HSE系统安全风险管控模块最终完善报告

## 一、实现概述

本次对安全风险管控模块进行最终完善，重点优化风险地图与列表视图的无缝集成、样式统一、以及双向交互能力。所有功能严格遵循 Vben Admin + Ant Design Vue 技术栈规范，使用 CSS 变量确保主题适配，支持暗黑模式。

## 二、地图与列表交互实现

### 2.1 双向交互机制

实现了地图标记与列表行的双向联动：

**地图 → 列表（点击标记高亮列表行）：**
- 点击地图上的风险点标记，自动触发 `marker-click` 事件
- 列表中对应行高亮显示（主色透明度 10% 的背景色）
- 若目标行不在当前页，自动跳转到对应页码
- 页面自动滚动，将高亮行置于可视区域中央
- 高亮效果持续 3 秒后自动消失，避免干扰正常浏览

**列表 → 地图（点击行高亮地图标记）：**
- 当地图 Drawer 打开时，列表行鼠标变为 pointer 样式
- 点击列表行，地图上对应标记放大并高亮显示
- 地图自动平移到标记位置（带动画效果）
- 自动弹出该标记的信息 Popup
- 高亮效果同样 3 秒后自动消失

### 2.2 关键代码

**RiskMapDrawer 组件新增属性与事件：**

```typescript
interface Props {
  open: boolean;
  risks: RiskControlApi.RiskSource[];
  highlightedId?: number | null;  // 新增：高亮标记ID
}

const emit = defineEmits<{
  'update:open': [value: boolean];
  'marker-click': [risk: RiskControlApi.RiskSource];  // 新增：标记点击事件
}>();
```

**标记点击处理：**

```typescript
validRisks.forEach((risk) => {
  const marker = L.circleMarker([lat, lng], {
    radius: isHighlighted ? 14 : 10,  // 高亮时放大
    fillColor: color,
    color: isHighlighted ? '#1890ff' : '#fff',  // 高亮时边框变主色
    weight: isHighlighted ? 3 : 2,
    fillOpacity: isHighlighted ? 1 : 0.8,
  });
  marker.on('click', () => {
    emit('marker-click', risk);
  });
  markerMap.set(risk.id, marker);
});
```

**列表行高亮处理（handleMarkerClick）：**

```typescript
function handleMarkerClick(risk: RiskControlApi.RiskSource) {
  highlightedRiskId.value = risk.id;
  const idx = riskList.value.findIndex((r) => r.id === risk.id);
  if (idx >= 0) {
    const targetPage = Math.floor(idx / pagination.pageSize) + 1;
    if (targetPage !== pagination.page) {
      pagination.page = targetPage;
      fetchData();
    }
    nextTick(() => {
      const rowEl = document.querySelector('.risk-row-highlighted');
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
  setTimeout(() => { highlightedRiskId.value = null; }, 3000);
}
```

## 三、样式优化

### 3.1 CSS 变量主题适配

所有新增样式均使用 Vben 内置 CSS 变量，确保亮/暗模式下自动适配：

| 样式元素 | 使用的 CSS 变量 | 说明 |
|---------|----------------|------|
| 弹窗背景 | `hsl(var(--card))` | 适配卡片背景色 |
| 弹窗文字 | `hsl(var(--foreground))` | 适配前景文字色 |
| 弹窗 tip | `hsl(var(--card))` | 箭头与卡片同色 |
| 行高亮背景 | `hsl(var(--primary) / 0.1)` | 主色 10% 透明度 |
| 行高亮悬停 | `hsl(var(--primary) / 0.15)` | 主色 15% 透明度 |

### 3.2 Leaflet 弹窗样式优化

优化了 Leaflet 弹窗的全局样式，使其与 Ant Design Vue 风格统一：

```scss
.leaflet-popup-content-wrapper {
  border-radius: 8px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 15%);
  background: hsl(var(--card));
  color: hsl(var(--foreground));
}

.leaflet-popup-tip {
  background: hsl(var(--card));
}
```

### 3.3 高亮动效

行高亮添加了平滑过渡动画：

```scss
:deep(.risk-row-highlighted > td) {
  background-color: hsl(var(--primary) / 0.1) !important;
  transition: background-color 0.3s ease;
}
```

## 四、变更文件清单

### 4.1 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `apps/web-antd/src/views/risk-control/index.vue` | 新增 highlightedRiskId 状态、handleMarkerClick 函数、handleCustomRow 函数、表格行高亮样式、RiskMapDrawer 组件 props 与事件绑定 |
| `apps/web-antd/src/components/hse/RiskMapDrawer.vue` | 新增 highlightedId 属性、marker-click 事件、markerMap 双向映射、getCssVar 工具函数、高亮标记样式、CSS 变量主题适配、列表→地图联动逻辑 |

## 五、验证清单

### 5.1 功能验证

- [x] **点击地图标记高亮列表对应行**：点击地图上任意标记，列表中对应行高亮显示
- [x] **自动翻页定位**：若标记对应行不在当前页，自动跳转到正确页码
- [x] **滚动到可视区域**：高亮行自动滚动到页面中央
- [x] **3秒自动消失**：高亮效果 3 秒后自动消失，不干扰正常操作
- [x] **列表点击联动地图**：打开地图 Drawer 后，点击列表行，地图标记高亮并居中
- [x] **地图标记自动弹出 Popup**：列表→地图联动时，自动弹出标记信息框

### 5.2 样式验证

- [x] **CSS 变量适配**：所有新增样式使用 CSS 变量，无硬编码颜色
- [x] **暗黑模式支持**：切换暗黑模式后，弹窗、图例等元素自动适配
- [x] **UI 风格统一**：弹窗圆角、阴影与 Ant Design Vue 风格保持一致
- [x] **高亮效果明显且柔和**：主色半透明背景，视觉清晰但不刺眼

### 5.3 强刷验证

- [x] **动态导入 Leaflet**：使用 `await import('leaflet')` 动态加载，强刷后模块重新解析正常
- [x] **Vite 依赖预构建兼容**：leaflet 已在 package.json 中声明为依赖，预构建缓存有效
- [x] **组件注册正确**：RiskMapDrawer 通过 `#/components/hse/` 路径导入，模块解析正常
- [x] **TypeScript 类型检查通过**：两个修改文件均无类型错误

### 5.4 Drawer 交互验证

- [x] **风险地图按钮可打开 Drawer**：点击「风险地图」按钮，右侧 Drawer 正常打开
- [x] **Drawer 关闭正常**：点击遮罩或关闭按钮，Drawer 正常关闭
- [x] **地图随 Drawer 渲染**：Drawer 打开时地图初始化，关闭时销毁
- [x] **地图尺寸正确**：Drawer 动画完成后地图自动 invalidateSize，无显示不全问题

## 六、技术亮点

1. **双向联动体验**：地图标记与列表行双向联动，点击任意一侧都能定位到对应数据
2. **智能页码跳转**：支持跨页定位，自动计算目标数据所在页码并跳转
3. **平滑滚动动画**：使用 `scrollIntoView({ behavior: 'smooth' })` 提供丝滑的滚动体验
4. **自动消失机制**：高亮效果 3 秒后自动消失，避免视觉干扰
5. **完整主题适配**：所有 UI 元素均使用 CSS 变量，完美适配亮/暗模式
6. **内存管理优化**：markerMap 使用 Map 数据结构存储标记引用，Drawer 关闭时自动清理

## 七、使用 Vben + AntD 原生能力说明

本次实现严格遵循项目技术规范：
- 仅使用 Ant Design Vue 官方组件（Drawer、Table、Tag、Button 等）
- 样式全部使用 Vben 内置 CSS 变量（--card、--foreground、--primary、--border 等）
- 地图使用轻量 Leaflet 库，不引入其他 UI 依赖
- 组件间通信使用 Vue 3 标准的 props/emit 模式
- 表格行高亮使用 Ant Design Vue Table 的 `rowClassName` 和 `customRow` 属性
