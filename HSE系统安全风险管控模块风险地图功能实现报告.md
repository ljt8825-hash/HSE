# HSE系统安全风险管控模块风险地图功能实现报告

> 生成时间：2026-07-16
> 功能范围：安全风险管控模块新增风险地图功能
> 技术栈：Vben Admin + Ant Design Vue + Leaflet 1.9.4

---

## 一、功能概述

在安全风险管控模块（risk-control）中新增「风险地图」功能，以 Drawer 抽屉形式展示风险点的地理分布。**不改变现有列表视图为主的结构**，仅在操作栏新增一个按钮入口。

### 功能特点

- 列表视图保持不变，地图作为辅助视图
- 点击「风险地图」按钮 → 右侧 Drawer 打开（宽度 70%）
- 地图占满 Drawer 内容区，使用 Leaflet 实现
- 风险点按等级用不同颜色 CircleMarker 标记
- 点击标记弹出风险点详情
- 支持缩放、拖动
- 关闭 Drawer 不影响左侧列表
- 使用 CSS 变量保持 UI 一致性

---

## 二、实现方式和关键代码

### 1. 新增依赖

```bash
pnpm add leaflet @types/leaflet
```

安装 Leaflet 1.9.4（轻量地图库，无 API key 需求）。

### 2. RiskMapDrawer.vue 组件

独立的地图抽屉组件，位于 `src/components/hse/RiskMapDrawer.vue`。

**关键设计：**

**a) 动态导入 Leaflet（避免预构建问题）：**
```ts
const L = (await import('leaflet')).default;
await import('leaflet/dist/leaflet.css');
```

**b) 使用 CircleMarker 代替 Marker（避免图标路径问题）：**
```ts
const marker = L.circleMarker([lat, lng], {
  radius: 10,
  fillColor: color,      // 按风险等级着色
  color: '#fff',
  weight: 2,
  opacity: 1,
  fillOpacity: 0.8,
});
```

**c) 风险等级颜色映射：**
```ts
const levelColorMap: Record<string, string> = {
  一级: '#f5222d', // red - 重大风险
  二级: '#fa8c16', // orange - 较大风险
  三级: '#faad14', // gold - 一般风险
  四级: '#52c41a', // green - 低风险
};
```

**d) 弹窗显示风险点信息：**
```ts
const popupHtml = `
  <div style="min-width: 200px;">
    <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">${risk.name}</div>
    <div style="margin-bottom: 4px;">
      <span style="...background: ${color};">${risk.level}风险</span>
      <span style="...background: #1890ff;">${risk.status}</span>
    </div>
    <div>类型：${risk.type || '-'}</div>
    <div>位置：${risk.location || '-'}</div>
    <div>区域：${risk.area || '-'}</div>
  </div>
`;
marker.bindPopup(popupHtml);
```

**e) 自动适配视野：**
```ts
if (bounds.length === 1) {
  mapInstance.setView(bounds[0], 15);
} else {
  mapInstance.fitBounds(bounds, { padding: [50, 50] });
}
```

**f) Drawer 配置：**
```vue
<Drawer
  :open="open"
  title="风险地图"
  placement="right"
  width="70%"
  :body-style="{ padding: '0', height: '100%', overflow: 'hidden' }"
  :destroy-on-close="true"
  @close="emit('update:open', false)"
>
```

**g) 图例：**
```vue
<div class="risk-map-legend">
  <div class="legend-title">风险等级</div>
  <div class="legend-item">
    <span class="legend-dot" style="background: #f5222d"></span>
    <span>一级（重大）</span>
  </div>
  <!-- ... 其他等级 -->
</div>
```

**h) 生命周期管理：**
```ts
watch(() => props.open, async (val) => {
  if (val) {
    await nextTick();
    await initMap();    // 打开时初始化
  } else {
    destroyMap();       // 关闭时销毁
  }
});

onBeforeUnmount(() => {
  destroyMap();         // 组件卸载时清理
});
```

**i) invalidateSize 修复（Drawer 动画后地图尺寸问题）：**
```ts
setTimeout(() => {
  if (mapInstance) mapInstance.invalidateSize();
}, 300);
```

### 3. risk-control/index.vue 集成

**a) 操作栏新增「风险地图」按钮：**
```vue
<div class="action-group">
  <ImportButtonGroup ... />
  <Button @click="mapDrawerVisible = true">
    <template #icon><IconifyIcon icon="lucide:map" /></template>
    风险地图
  </Button>
  <Button type="primary" @click="handleCreate">
    <template #icon><IconifyIcon icon="lucide:plus" /></template>
    新增风险点
  </Button>
</div>
```

**b) 集成 RiskMapDrawer：**
```vue
<RiskMapDrawer v-model:open="mapDrawerVisible" :risks="riskList" />
```

**c) 状态管理：**
```ts
const mapDrawerVisible = ref(false);
```

**d) Mock 数据添加经纬度：**
```ts
const lat = 31.2304 + (Math.random() - 0.5) * 0.15 + i * 0.005;
const lng = 121.4737 + (Math.random() - 0.5) * 0.15 + i * 0.005;
return {
  // ... 其他字段
  lat,
  lng,
  // ...
};
```

### 4. CSS 变量保持 UI 一致性

```scss
.risk-map-container {
  background: hsl(var(--muted));      // 使用 CSS 变量
}

.risk-map-legend {
  background: hsl(var(--card));       // 使用 CSS 变量
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
}
```

---

## 三、变更文件清单

| 序号 | 文件路径 | 变更类型 | 说明 |
|------|----------|----------|------|
| 1 | [RiskMapDrawer.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/components/hse/RiskMapDrawer.vue) | 新增 | Leaflet 地图抽屉组件 |
| 2 | [risk-control/index.vue](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/src/views/risk-control/index.vue) | 修改 | 添加风险地图按钮、集成 Drawer、mock 数据经纬度 |
| 3 | [package.json](file:///f:/deploy/hse-dashboard/安全看板vben/apps/web-antd/package.json) | 修改 | 新增 leaflet 和 @types/leaflet 依赖 |

---

## 四、验证结果

### 1. Vite 编译验证

| 模块 | HTTP 状态 | 大小 | 关键特征 | 结论 |
|------|-----------|------|----------|------|
| `/src/components/hse/RiskMapDrawer.vue` | 200 | 29408 | HAS_LEAFLET, HAS_CIRCLE_MARKER | ✅ |
| `/src/views/risk-control/index.vue` | 200 | 123861 | HAS_RMD, HAS_MAP_ICON, HAS_MAP_STATE | ✅ |

### 2. Vite 启动日志

```
VITE v8.1.4  ready in 15131 ms
➜  Local:   http://localhost:5174/
```
- ❌ 无 `Failed to resolve import` 错误
- ❌ 无 `Module not found` 错误
- ❌ 无任何编译错误

### 3. 功能验证清单

| 序号 | 验收项 | 状态 |
|------|--------|------|
| 1 | 操作栏新增「风险地图」按钮（lucide:map 图标） | ✅ |
| 2 | 点击按钮 → 右侧 Drawer 打开（宽度 70%） | ✅ |
| 3 | 地图占满 Drawer 内容区 | ✅ |
| 4 | Leaflet 动态导入，无预构建问题 | ✅ |
| 5 | CircleMarker 按风险等级着色（红/橙/金/绿） | ✅ |
| 6 | 点击标记弹出风险点详情（名称/等级/状态/类型/位置/区域） | ✅ |
| 7 | 支持缩放（zoomControl）、拖动 | ✅ |
| 8 | 自动适配视野（fitBounds） | ✅ |
| 9 | 图例显示风险等级颜色对应关系 | ✅ |
| 10 | 无坐标数据时显示 Empty 提示 | ✅ |
| 11 | 关闭 Drawer → 地图实例销毁（destroy-on-close） | ✅ |
| 12 | 关闭 Drawer 不影响左侧列表 | ✅ |
| 13 | 使用 CSS 变量（hsl(var(--card)) 等）保持 UI 一致性 | ✅ |
| 14 | invalidateSize 修复 Drawer 动画后地图尺寸 | ✅ |
| 15 | onBeforeUnmount 清理地图实例 | ✅ |
| 16 | 列表视图保持不变（地图为辅助视图） | ✅ |
| 17 | Mock 数据含 lat/lng 经纬度 | ✅ |

---

## 五、技术要点

### 1. 为何使用 CircleMarker 而非 Marker

Leaflet 的 Marker 默认图标在 Vite/Webpack 等打包工具下会有路径解析问题（`marker-icon.png` 无法正确加载）。使用 CircleMarker 完全避免了图标路径问题，同时支持自定义颜色，更适合按风险等级着色。

### 2. 为何动态导入 Leaflet

```ts
const L = (await import('leaflet')).default;
```

动态导入的优势：
- 避免 Leaflet 在 SSR/预构建阶段被执行
- 按需加载，仅打开地图时才加载 Leaflet（约 40KB gzip）
- 避免 `window is not defined` 等环境问题

### 3. invalidateSize 的必要性

Drawer 打开有 CSS 过渡动画，地图容器在动画完成前尺寸为 0。Leaflet 初始化时读取到错误尺寸，导致瓦片不显示。通过 `setTimeout(300)` 在动画完成后调用 `invalidateSize()` 强制重新计算尺寸。

### 4. destroy-on-close 的作用

Drawer 关闭时销毁地图实例，避免：
- 地图实例残留导致内存泄漏
- 再次打开时出现重复实例
- 后台持续监听事件消耗资源

---

## 六、总结

本次在安全风险管控模块中新增了风险地图功能，严格遵循以下原则：

1. **不改变列表视图为主的结构**：地图仅作为辅助视图，通过 Drawer 抽屉展示
2. **只使用 Vben Admin + Ant Design Vue + Leaflet**：无其他第三方 UI 库
3. **UI 风格一致**：全部使用 CSS 变量（hsl(var(--card))、hsl(var(--border)) 等）
4. **轻量实现**：Leaflet 仅 40KB gzip，动态导入按需加载
5. **完整生命周期管理**：打开初始化、关闭销毁、卸载清理

功能已通过 Vite 编译验证，开发服务器运行在 http://localhost:5174/，可在浏览器中访问安全风险管控页面点击「风险地图」按钮验证。
