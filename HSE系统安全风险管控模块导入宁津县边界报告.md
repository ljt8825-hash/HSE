# HSE系统安全风险管控模块导入宁津县边界报告

## 一、GeoJSON 文件确认

### 1.1 数据来源

原始边界数据来自 `安全管理系统/app/data/ningjin_boundary.js`，已提取为标准 GeoJSON 格式并放置于：

```
apps/web-antd/public/geojson/ningjin-boundary.geojson
```

### 1.2 GeoJSON 结构

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[
      [116.620, 37.780],
      [116.680, 37.795],
      ... (共19个顶点，首尾闭合)
    ]]
  },
  "properties": {
    "name": "宁津县",
    "adminLevel": "county",
    "countyCode": "371422",
    "province": "山东省",
    "city": "德州市",
    "coordSystem": "GCJ-02",
    "bbox": {
      "minLng": 116.605,
      "maxLng": 116.985,
      "minLat": 37.475,
      "maxLat": 37.800
    },
    "center": [116.805, 37.655]
  }
}
```

| 属性 | 说明 |
|------|------|
| 坐标系 | GCJ-02（火星坐标，与高德瓦片对齐） |
| 几何类型 | Polygon（单面） |
| 顶点数 | 19个（含首尾闭合点） |
| 覆盖范围 | 经度 116.605~116.985，纬度 37.475~37.800 |
| 中心点 | [116.805, 37.655] |

## 二、加载 GeoJSON 的代码

### 2.1 加载函数

```typescript
const countyGeoJson = ref<any>(null);
const countyLoading = ref(false);

async function loadCountyGeoJson(): Promise<any> {
  if (countyGeoJson.value) return countyGeoJson.value;
  countyLoading.value = true;
  try {
    const res = await fetch('/geojson/ningjin-boundary.geojson');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    countyGeoJson.value = data;
    return data;
  } catch (err) {
    console.error('[RiskMapDrawer] 加载宁津县边界 GeoJSON 失败:', err);
    return null;
  } finally {
    countyLoading.value = false;
  }
}
```

**特点：**
- 带缓存机制（`countyGeoJson` ref），多次调用只 fetch 一次
- 错误降级：加载失败返回 `null`，不影响地图其他功能
- 加载状态：`countyLoading` 可用于 UI 展示

### 2.2 L.geoJSON 渲染代码

```typescript
async function renderCountyBoundary(L: any) {
  if (!countyLayer || !mapInstance) return;
  countyLayer.clearLayers();

  if (!layerVisible.county) return;

  const geoJson = await loadCountyGeoJson();
  if (!geoJson) return;

  const primaryColor = getCssVar('--primary') || '#1677ff';

  const geoJsonLayer = L.geoJSON(geoJson, {
    style: {
      color: `hsl(${primaryColor})`,
      weight: 4,
      opacity: 0.9,
      fillColor: `hsl(${primaryColor})`,
      fillOpacity: 0.06,
      dashArray: null,
      lineJoin: 'round',
      lineCap: 'round',
    },
    onEachFeature: (feature: any, layer: any) => {
      const props = feature.properties || {};
      const popupHtml = `
        <div style="min-width: 180px;">
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 6px; color: hsl(${primaryColor});">
            ${props.name || '宁津县'}
          </div>
          <div style="font-size: 12px; color: hsl(var(--foreground) / 0.65); margin-bottom: 3px;">
            行政区划：${props.province || ''} ${props.city || ''}
          </div>
          <div style="font-size: 12px; color: hsl(var(--foreground) / 0.65); margin-bottom: 3px;">
            行政代码：${props.countyCode || '-'}
          </div>
          <div style="font-size: 12px; color: hsl(var(--foreground) / 0.65);">
            坐标系：${props.coordSystem || 'GCJ-02'}
          </div>
        </div>
      `;
      layer.bindPopup(popupHtml);

      layer.on('mouseover', () => {
        layer.setStyle({ weight: 6, opacity: 1, fillOpacity: 0.12 });
      });
      layer.on('mouseout', () => {
        layer.setStyle({ weight: 4, opacity: 0.9, fillOpacity: 0.06 });
      });
    },
  });

  geoJsonLayer.addTo(countyLayer);

  // 自动适配到县边界
  if (geoJsonLayer.getBounds().isValid()) {
    mapInstance.fitBounds(geoJsonLayer.getBounds(), { padding: [40, 40] });
  }
}
```

### 2.3 开关控制代码

```typescript
const layerVisible = reactive({
  county: true,  // 县级边界默认显示
  town: false,   // 乡镇网格默认隐藏
  road: true,    // 道路网络默认显示
});

async function toggleCountyLayer(checked: boolean) {
  layerVisible.county = checked;
  if (mapInstance) {
    const L = (await import('leaflet')).default;
    renderCountyBoundary(L);
  }
}
```

## 三、边界样式

### 3.1 县级边界样式

| 样式属性 | 值 | 说明 |
|---------|----|------|
| color | `hsl(var(--primary))` | 主色实线，支持主题切换 |
| weight | 4px | 较粗，醒目 |
| opacity | 0.9 | 半透明不挡底图 |
| fillColor | `hsl(var(--primary))` | 同色填充 |
| fillOpacity | 0.06 | 极低透明度，仅做范围标识 |
| dashArray | null | 实线 |
| lineJoin | round | 圆角连接 |
| lineCap | round | 圆角端点 |

### 3.2 悬停高亮

| 样式属性 | 悬停值 |
|---------|--------|
| weight | 6px（加粗） |
| opacity | 1（完全不透明） |
| fillOpacity | 0.12（填充加深） |

### 3.3 乡镇网格样式（对比参考）

| 样式属性 | 值 | 说明 |
|---------|----|------|
| color | 各乡不同颜色 | 区分乡镇 |
| weight | 2.5px | 较细 |
| fillOpacity | 0.1 | 半透明 |
| dashArray | '6 3' | 虚线，与县级区分 |

### 3.4 CSS 变量适配

- 边框颜色：使用 `--primary` CSS 变量，跟随主题主色
- 弹窗文字：使用 `--foreground` CSS 变量，亮/暗模式自动适配
- 弹窗背景：Leaflet 全局样式使用 `--card` CSS 变量

## 四、新增/修改文件清单

### 4.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `apps/web-antd/public/geojson/ningjin-boundary.geojson` | 宁津县行政边界 GeoJSON 文件（标准 Feature Polygon，GCJ-02） |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `apps/web-antd/src/components/hse/RiskMapDrawer.vue` | 新增 countyLayer 图层组、loadCountyGeoJson() 加载函数、renderCountyBoundary() 渲染函数（L.geoJSON）、toggleCountyLayer() 开关函数、图层控制面板新增"县级边界"开关 |

## 五、验证清单

### 5.1 GeoJSON 加载

- [x] **文件存在**：`public/geojson/ningjin-boundary.geojson` 路径正确
- [x] **格式正确**：标准 GeoJSON Feature，Polygon 类型，19个顶点闭合
- [x] **fetch 成功**：通过 `/geojson/ningjin-boundary.geojson` 可正常访问
- [x] **缓存机制**：多次打开 Drawer 只请求一次 GeoJSON
- [x] **错误降级**：GeoJSON 加载失败时不影响地图和其他图层

### 5.2 边界显示

- [x] **L.geoJSON 绘制**：使用 Leaflet 原生 `L.geoJSON()` 方法渲染
- [x] **位置正确**：边界范围与高德瓦片宁津县位置匹配（GCJ-02坐标系）
- [x] **样式醒目**：主色实线，4px 宽度，半透明填充
- [x] **悬停高亮**：鼠标悬停时边框加粗、填充加深
- [x] **点击弹窗**：点击边界弹出县信息（名称、行政区划、行政代码、坐标系）
- [x] **自动适配**：地图初始化时自动 fitBounds 到县边界范围

### 5.3 开关控制

- [x] **县级边界开关**：Switch 组件控制显示/隐藏，默认开启
- [x] **乡镇网格开关**：Switch 组件控制显示/隐藏，默认关闭
- [x] **道路网络开关**：Switch 组件控制显示/隐藏，默认开启
- [x] **开关独立**：三个图层互不影响，可自由组合
- [x] **图标区分**：县级边界实心圆点，乡镇网格虚线圆环，视觉区分明显

### 5.4 样式一致性

- [x] **CSS 变量**：边界颜色使用 `--primary`，适配主题切换
- [x] **暗黑模式**：弹窗、控制面板、图例自动适配暗黑模式
- [x] **组件统一**：使用 Ant Design Vue Switch、Divider、Tag 组件
- [x] **Drawer 结构**：保持 Vben Drawer 原生结构，body 无 padding，地图占满

### 5.5 其他功能保持

- [x] **高德底图 + OSM fallback**：不变
- [x] **风险点标记**：不变，与边界同层显示
- [x] **地图与列表联动**：点击标记高亮列表行，点击列表行高亮标记
- [x] **TypeScript 类型检查**：修改文件无类型错误
- [x] **强刷兼容**：fetch 加载 + 动态 import，强刷后功能正常

## 六、技术要点

1. **标准 GeoJSON 格式**：遵循 RFC 7946 规范，`coordinates` 使用 `[lng, lat]`，Leaflet 自动处理转换
2. **L.geoJSON() 原生渲染**：使用 Leaflet 官方推荐方式，支持 `style`、`onEachFeature` 等回调
3. **fetch 异步加载**：不阻塞地图初始化，数据到达后再渲染边界
4. **内存缓存**：`countyGeoJson` ref 缓存已加载数据，避免重复网络请求
5. **图层独立**：countyLayer / townLayer / roadLayer / markerLayer 四层独立管理，开关互不干扰
6. **坐标系一致**：GeoJSON（GCJ-02）+ 高德瓦片（GCJ-02），无偏移问题
