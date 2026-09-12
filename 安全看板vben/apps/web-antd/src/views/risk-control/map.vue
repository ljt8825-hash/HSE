<template>
  <Page auto-content-height class="hse-page">
    <!-- 统计卡片 -->
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="12" :sm="6" :md="6" v-for="s in stats" :key="s.key">
        <Card :bordered="false" size="small" class="stat-card">
          <div class="stat-inner">
            <span class="stat-dot" :style="{ background: s.color }"></span>
            <span class="stat-label">{{ s.label }}</span>
            <span class="stat-value">{{ s.value }}</span>
          </div>
        </Card>
      </Col>
    </Row>

    <!-- 地图主体 -->
    <Card :bordered="false" class="map-card" :body-style="{ padding: 0 }">
      <!-- 图层控制栏 -->
      <div class="map-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">风险地图</span>
          <Divider type="vertical" />
          <span class="toolbar-hint">宁津县城乡环卫一体化 · 安全风险管控</span>
        </div>
        <div class="toolbar-right">
          <Space :size="4" wrap>
            <Tag
              v-for="layer in layerToggles"
              :key="layer.key"
              :color="layer.visible ? layer.color : undefined"
              :class="{ 'layer-tag-off': !layer.visible }"
              style="cursor: pointer; user-select: none"
              @click="toggleLayer(layer.key)"
            >
              {{ layer.label }}
            </Tag>
          </Space>
        </div>
      </div>

      <!-- 地图容器 -->
      <div ref="mapContainer" class="map-container"></div>

      <!-- 图例面板 -->
      <div class="legend-panel">
        <div class="legend-section">
          <div class="legend-title">风险等级</div>
          <div v-for="item in levelLegend" :key="item.level" class="legend-item">
            <span class="legend-dot" :style="{ background: item.color }"></span>
            <span>{{ item.level }}</span>
          </div>
        </div>
        <Divider style="margin: 8px 0" />
        <div class="legend-section">
          <div class="legend-title">道路等级</div>
          <div v-for="r in roadLegend" :key="r.cls" class="legend-item">
            <span class="legend-line" :style="{ background: r.color }"></span>
            <span>{{ r.label }}</span>
          </div>
        </div>
        <Divider style="margin: 8px 0" />
        <div class="legend-section">
          <div class="legend-title">设施点位</div>
          <div class="legend-item">
            <span class="legend-icon" style="background: #1677ff">转</span>
            <span>转运站</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon" style="background: #722ed1">办</span>
            <span>办公室</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon" style="background: #13c2c2">仓</span>
            <span>仓库</span>
          </div>
          <div class="legend-item">
            <span class="legend-park"></span>
            <span>公园/景观带</span>
          </div>
        </div>
        <Divider style="margin: 8px 0" />
        <div class="legend-section">
          <div class="legend-title">转运路线</div>
          <div class="legend-item">
            <span class="legend-line" style="background: #FFD700"></span>
            <span>垃圾转运导航路线</span>
          </div>
        </div>
      </div>

      <!-- 提示词-211：无坐标风险点兜底面板（吸附后仍无法定位的风险点） -->
      <div v-if="noCoordRisks.length > 0" class="no-coord-panel">
        <div class="no-coord-header">
          <span class="no-coord-dot"></span>
          <span class="no-coord-title">未定位风险点</span>
          <span class="no-coord-count">{{ noCoordRisks.length }}条</span>
        </div>
        <div class="no-coord-list">
          <div v-for="r in noCoordRisks" :key="r.id" class="no-coord-item">
            <span class="no-coord-name">{{ r.name }}</span>
            <span class="no-coord-loc">{{ r.location }}</span>
          </div>
        </div>
      </div>
    </Card>
  </Page>
</template>

<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Card, Col, Divider, Row, Space, Tag, message } from 'ant-design-vue';

import { Page } from '@vben/common-ui';

import { getRiskList } from '#/api/hse/risk-control';
import type { RiskControlApi } from '#/api/hse/risk-control';
import { ROAD_NETWORK_DATA, ROAD_LEGEND } from '#/components/hse/risk-map-data';
import { KANGNING_LAKE_POLYGONS } from '#/components/hse/kangning-lake';

// 提示词-215：风险清单 ↔ 风险地图 双向联动
const route = useRoute();
const router = useRouter();

// ==================== 高德地图配置 ====================
const AMAP_KEY = '2dbd01fb5cba78d98503d6d19c46b56b';
const AMAP_SECURITY = '78c2d6a946eb410c19bf9ab999b866f1';
const NINGJIN_CENTER: [number, number] = [116.805, 37.655];
const NINGJIN_ZOOM = 12;

// ==================== 状态 ====================
const mapContainer = ref<HTMLElement | null>(null);
let mapInstance: any = null;
let amapLoaded = false;

// 风险点聚合相关
let riskCluster: any = null;
let riskMarkers: any[] = [];
const RISK_LEVEL_COLOR: Record<string, string> = {
  一级: '#f5222d',
  二级: '#fa8c16',
  三级: '#faad14',
  四级: '#52c41a',
};

// ==================== 定位高亮动画状态（提示词-217） ====================
// 道路 Polyline 引用数组（用于定位高亮）
let roadPolylines: { polyline: any; data: any }[] = [];
// 当前高亮状态，用于清除
let highlightState: {
  pulseMarker: any | null; // 脉冲波纹 Marker
  origMarkerHidden: any | null; // 动画期间被隐藏的原始风险点 Marker（脉冲叠加问题修复）
  highlightedRoads: { polyline: any; origColor: string; origWeight: number; origOpacity: number }[];
  highlightTimer: ReturnType<typeof setTimeout> | null;
  breathTimer: ReturnType<typeof setInterval> | null;
  origMarkerHideTimer: ReturnType<typeof setTimeout> | null;
} = {
  pulseMarker: null,
  origMarkerHidden: null,
  highlightedRoads: [],
  highlightTimer: null,
  breathTimer: null,
  origMarkerHideTimer: null,
};

// 图层状态
const layerToggles = reactive([
  { key: 'boundary', label: '乡镇边界', color: 'purple', visible: true },
  { key: 'roads', label: '道路', color: 'orange', visible: true },
  { key: 'stations', label: '转运站', color: 'blue', visible: true },
  { key: 'facilities', label: '自有设施', color: 'cyan', visible: true },
  { key: 'parks', label: '公园', color: 'green', visible: true },
  { key: 'transit', label: '转运路线', color: 'gold', visible: true },
  { key: 'risks', label: '风险点', color: 'red', visible: true },
]);

// 图层组
const layerGroups: Record<string, any> = {};

// 统计
const stats = reactive([
  { key: 'total', label: '风险总数', color: '#8c8c8c', value: 0 },
  { key: '一级', label: '一级风险', color: '#f5222d', value: 0 },
  { key: '二级', label: '二级风险', color: '#fa8c16', value: 0 },
  { key: '三级', label: '三级风险', color: '#faad14', value: 0 },
]);

// 风险数据
const allRisks = ref<RiskControlApi.RiskSource[]>([]);
// 提示词-211：无坐标风险点兜底面板（吸附后仍无法定位的风险点）
const noCoordRisks = ref<any[]>([]);

// 共享 InfoWindow 实例（同一时刻只显示一个，打开新窗口前关闭旧窗口）
let AMapGlobal: any = null;
let hoverInfoWindow: any = null; // 悬浮名称提示（公园/乡镇）
let clickInfoWindow: any = null; // 点击详情（风险点列表等）
// 公园/康宁湖多边形中心点缓存（用于公园周边风险点距离判定）
const parkCenters: Record<string, [number, number]> = {};
// 最近一次匹配到的风险点（供 InfoWindow 列表项点击定位）
let lastMatchedRisks: any[] = [];

// 图例
const levelLegend = [
  { level: '一级', color: '#f5222d' },
  { level: '二级', color: '#fa8c16' },
  { level: '三级', color: '#faad14' },
  { level: '四级', color: '#52c41a' },
];
const roadLegend = ROAD_LEGEND;

// ==================== 转运站数据 ====================
const transferStations = [
  { name: '大曹镇转运站', lng: 116.59978399, lat: 37.56775370 },
  { name: '保店镇转运站', lng: 116.69413842, lat: 37.60782273 },
  { name: '相衙镇转运站', lng: 116.69304203, lat: 37.66332576 },
  { name: '时集镇转运站', lng: 116.76077978, lat: 37.69101086 },
  { name: '刘营伍乡转运站', lng: 116.78000476, lat: 37.76202433 },
  { name: '张大庄转运站', lng: 116.83372500, lat: 37.78435017 },
  { name: '长官镇转运站', lng: 116.92363535, lat: 37.78334669 },
  { name: '大柳镇转运站', lng: 116.83921723, lat: 37.72366746 },
  { name: '杜集镇转运站', lng: 116.94402388, lat: 37.73019020 },
  { name: '柴胡店转运站', lng: 116.90707714, lat: 37.63870936 },
  { name: '乐陵光大环保', lng: 117.30003017, lat: 37.70145604 },
  { name: '德州润电环保', lng: 116.84101635, lat: 37.53324452 },
];

// ==================== 转运路线配置 ====================
// 起点：山东宁津经济开发区管理委员会（宁津县阳光大街东首）
const TRANSIT_ORIGIN: [number, number] = [116.830, 37.635];
// 转运路线（分类为国道，使用国道金色渲染）
const transitRoutes = [
  {
    id: 'TZ001',
    name: '宁津-乐陵转运路线',
    destination: [117.30003017, 37.70145604] as [number, number],
    destName: '乐陵光大环保能源有限公司',
    desc: '宁津至乐陵垃圾转运路线：从山东宁津经济开发区管理委员会出发，导航至乐陵光大环保能源有限公司',
  },
  {
    id: 'TZ002',
    name: '宁津-陵县转运路线',
    destination: [116.84101635, 37.53324452] as [number, number],
    destName: '德州润电环保有限公司',
    desc: '宁津至陵县（德州）垃圾转运路线：从山东宁津经济开发区管理委员会出发，沿G104国道（京岚线）向南至德州润电环保',
  },
];
// 转运路线渲染样式（国道金色）
const TRANSIT_STYLE = {
  color: '#FFD700',
  weight: 5,
  opacity: 0.85,
};
// 转运路线起点/终点标记
let transitMarkers: any[] = [];

// ==================== 自有设施 ====================
const facilities = [
  { name: '办公室', lng: 116.81585532, lat: 37.63514208, icon: '办', iconColor: '#722ed1' },
  { name: '仓库', lng: 116.81590903, lat: 37.63653545, icon: '仓', iconColor: '#13c2c2' },
];

// ==================== 公园范围 ====================
const parkPolygons = [
  {
    name: '中心公园',
    path: [
      [116.79623522, 37.63993104],
      [116.79863545, 37.63987673],
      [116.79854892, 37.63272266],
      [116.79612725, 37.63276000],
    ],
    color: '#52c41a',
  },
  {
    name: '福宁河景观带',
    path: [
      [116.78103661, 37.64336368],
      [116.79231339, 37.64331755],
      [116.79587130, 37.64360179],
      [116.79627846, 37.64317645],
      [116.83046948, 37.64276205],
      [116.83051226, 37.64225222],
      [116.78095078, 37.64288799],
    ],
    color: '#1890ff',
  },
  {
    name: '新河公园（湿地）',
    path: [
      [116.77910912, 37.66529794],
      [116.79827378, 37.66303401],
      [116.80245250, 37.66403012],
      [116.80815175, 37.66363048],
      [116.80755156, 37.66099850],
      [116.77840103, 37.66196916],
    ],
    color: '#13c2c2',
  },
];

// ==================== 乡镇中心（与 backfill / risk-map-data.ts 保持一致） ====================
// 用于"区域模糊匹配"：location 含乡镇名 → 该乡镇中心坐标
const TOWNSHIP_CENTERS: [string, number, number][] = [
  ['刘营伍乡', 116.7665, 37.7475],
  ['张大庄镇', 116.7984, 37.8012],
  ['柴胡店镇', 116.9276, 37.6317],
  ['大曹镇', 116.5892, 37.5754],
  ['保店镇', 116.6868, 37.6202],
  ['长官镇', 116.8925, 37.8117],
  ['大柳镇', 116.8594, 37.7522],
  ['时集镇', 116.7656, 37.6965],
  ['杜集镇', 116.9341, 37.7143],
  ['相衙镇', 116.6892, 37.6901],
  ['宁城街道', 116.7949, 37.6347],
  ['津城街道', 116.803, 37.6232],
];

// ==================== 道路名称别名映射（location 代码/别名 → 真实路名） ====================
// ROAD_NETWORK_DATA 的真实路名为"京岚线/宁武线/滨德高速…"，而 location 文本使用 G104/S339 等代码。
// 仅硬编码可验证的别名，避免过度吸附到错误道路。
const ROAD_ALIAS: Record<string, string> = {
  G104: '京岚线',
  S339: '宁武线', // 宁武线在 ROAD_NETWORK_DATA 中存在 3 段省道，可参与吸附（报告-208 建议#1）
  // 廊万线 / 宁东路 / 大柳路 在道路数据中无对应真实名，暂不映射
};

// 道路名 → 中点坐标缓存（提示词-208 任务三：首次计算后复用，避免每次加载重复算）
const roadCenterCache = new Map<string, [number, number]>();

// ==================== 加载 Amap SDK ====================
function loadAmapScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (amapLoaded) {
      resolve();
      return;
    }
    if ((window as any).AMap) {
      amapLoaded = true;
      resolve();
      return;
    }
    // 安全密钥
    (window as any)._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY,
    };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.PolygonEditor,AMap.Geocoder,AMap.MarkerClusterer,AMap.Driving`;
    script.onload = () => {
      amapLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('高德地图 SDK 加载失败'));
    };
    document.head.appendChild(script);
  });
}

// ==================== 初始化地图 ====================
async function initMap() {
  if (!mapContainer.value) return;

  try {
    await loadAmapScript();
  } catch {
    message.error('高德地图加载失败，请检查网络连接');
    return;
  }

  const AMap = (window as any).AMap;
  if (!AMap) return;
  AMapGlobal = AMap;

  mapInstance = new AMap.Map(mapContainer.value, {
    center: NINGJIN_CENTER,
    zoom: NINGJIN_ZOOM,
    zoomEnable: true,
    dragEnable: true,
    doubleClickZoom: true,
    scrollWheel: true,
    resizeEnable: true,
    mapStyle: 'amap://styles/light',
    features: ['bg', 'road', 'building', 'point'],
    viewMode: '2D',
    maxZoom: 18,
    minZoom: 8,
  });

  // 创建图层组
  ['boundary', 'roads', 'stations', 'facilities', 'parks', 'transit', 'risks'].forEach((key) => {
    layerGroups[key] = new AMap.OverlayGroup();
    mapInstance.add(layerGroups[key]);
  });

  // 提示词-217：点击地图空白处立即清除上一次定位高亮
  mapInstance.on('click', clearHighlight);

  await nextTick();

  // 加载各乡镇边界
  renderBoundary(AMap);
  // 加载道路
  renderRoads(AMap);
  // 加载转运站
  renderStations(AMap);
  // 加载自有设施
  renderFacilities(AMap);
  // 加载公园
  renderParks(AMap);
  // 加载转运路线（驾车导航）
  await renderTransitRoutes(AMap);
  // 加载风险点
  await loadAndRenderRisks(AMap);

  // 自适应视野
  mapInstance.setFitView(null, false, [60, 60, 60, 60]);
}

// ==================== 渲染乡镇边界 ====================
async function renderBoundary(AMap: any) {
  try {
    const res = await fetch('/geojson/ningjin-boundary.geojson');
    if (!res.ok) return;
    const geoJson = await res.json();
    const features = geoJson.features || [];
    const colors = [
      '#d4c5b0', '#c8d4bc', '#bcc8d4', '#d4c0c0', '#c0d4cc',
      '#c8c0d4', '#d0d4c0', '#c0c8d4', '#d4ccc0', '#c0d4c0',
      '#ccc0d0', '#d0ccc4',
    ];

    features.forEach((feature: any, idx: number) => {
      const color = colors[idx % colors.length];
      const name = feature.properties?.name || '';

      if (feature.geometry?.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach((polygon: any) => {
          polygon.forEach((ring: any) => {
            const path = ring.map((c: number[]) => [c[0], c[1]]);
            const poly = new AMap.Polygon({
              path,
              fillColor: color,
              fillOpacity: 0.06,
              strokeColor: color,
              strokeWeight: 2,
              strokeOpacity: 0.55,
              strokeStyle: 'solid',
              // 提示词-208 任务二：乡镇边界 zIndex 提到 15，高于所有道路(≤10)，避免道路线条遮挡 hover/click 事件
              zIndex: 15,
              bubble: true,
            });
            poly.setExtData({ name, type: 'boundary' });
            // 悬浮显示乡镇名称（常驻 label 已移除，改 hover 提示）
            // 提示词-213：mousemove 实时更新 InfoWindow 位置，使乡镇名称跟随鼠标移动
            poly.on('mouseover', (e: any) => {
              closeClick();
              openHover(name, [e.lnglat.lng, e.lnglat.lat]);
            });
            poly.on('mousemove', (e: any) => {
              if (hoverInfoWindow && hoverInfoWindow.getIsOpen()) {
                try {
                  hoverInfoWindow.setPosition([e.lnglat.lng, e.lnglat.lat]);
                } catch {
                  // 兼容不支持 setPosition 的旧版，关闭后重新打开
                  closeHover();
                  openHover(name, [e.lnglat.lng, e.lnglat.lat]);
                }
              }
            });
            poly.on('mouseout', () => {
              closeHover();
            });
            // 点击展示该乡镇内所有风险点列表
            poly.on('click', (e: any) => {
              closeHover();
              openPopup(
                buildRiskListHtml(name, matchRisksByArea(name)),
                [e.lnglat.lng, e.lnglat.lat],
                [0, -10],
              );
            });
            layerGroups.boundary.addOverlay(poly);
          });
        });
      }
    });

  } catch (err) {
    console.warn('[风险地图] 边界加载失败:', err);
  }
}

// ==================== 渲染道路 ====================
function renderRoads(AMap: any) {
  ROAD_NETWORK_DATA.forEach((road) => {
    const polyline = new AMap.Polyline({
      path: road.path.map((p) => [p[0], p[1]]),
      strokeColor: road.color,
      strokeWeight: road.weight,
      strokeOpacity: road.opacity,
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: road.cls === '国道' ? 10 : road.cls === '省道' ? 8 : road.cls === '县道' ? 6 : 4,
    });
    polyline.setExtData({ name: road.name, cls: road.cls, type: 'road' });
    polyline.on('click', () => {
      clearHighlight();
      closeHover();
      openPopup(
        `<div style="padding:6px 10px;font-size:13px"><strong>${escapeHtml(road.name)}</strong><br/>${escapeHtml(road.desc)}</div>`,
        polyline.getPath()[Math.floor(polyline.getPath().length / 2)],
        [0, -10],
      );
    });
    layerGroups.roads.addOverlay(polyline);
    // 提示词-217：收集道路 Polyline 引用，供定位高亮使用
    roadPolylines.push({ polyline, data: road });
  });
}

// ==================== 渲染转运路线（驾车导航） ====================
async function renderTransitRoutes(AMap: any) {
  if (typeof AMap?.Driving === 'undefined') {
    console.warn('[风险地图] AMap.Driving 插件未加载，跳过转运路线渲染');
    return;
  }

  // 起点：山东宁津经济开发区管理委员会（宁津县阳光大街东首，坐标见 TRANSIT_ORIGIN）
  // 起点非转运站也非处理设施，不在地图单独渲染"起"字标记，仅作为驾车导航路径起点
  // （保留终点"终"字标记与转运路线 Polyline，见下方渲染逻辑）

  // 逐条获取驾车导航路线
  for (const route of transitRoutes) {
    try {
      const pathPoints = await fetchDrivingPath(AMap, TRANSIT_ORIGIN, route.destination);
      if (pathPoints.length < 2) {
        console.warn(`[风险地图] 转运路线 ${route.name} 导航失败，无路径数据`);
        continue;
      }

      // 绘制路线（国道金色样式）
      const polyline = new AMap.Polyline({
        path: pathPoints,
        strokeColor: TRANSIT_STYLE.color,
        strokeWeight: TRANSIT_STYLE.weight,
        strokeOpacity: TRANSIT_STYLE.opacity,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 12,
        showDir: true,
      });
      polyline.setExtData({ name: route.name, cls: '国道', type: 'transit' });
      polyline.on('click', () => {
        const mid = pathPoints[Math.floor(pathPoints.length / 2)];
        if (!mid) return;
        closeHover();
        openPopup(
          `<div style="padding:6px 10px;font-size:13px"><strong>${escapeHtml(route.name)}</strong><br/>终点：${escapeHtml(route.destName)}<br/>${escapeHtml(route.desc)}</div>`,
          mid,
          [0, -10],
        );
      });
      layerGroups.transit.addOverlay(polyline);

      // 终点标记
      const destMarker = new AMap.Marker({
        position: route.destination,
        icon: new AMap.Icon({
          size: new AMap.Size(32, 32),
          imageSize: new AMap.Size(32, 32),
          image: createMarkerSVG('终', '#f5222d'),
        }),
        anchor: 'center',
        offset: new AMap.Pixel(0, -16),
        zIndex: 115,
      });
      destMarker.setExtData({ name: route.destName, type: 'transit' });
      destMarker.on('click', () => {
        closeHover();
        openPopup(
          `<div style="padding:6px 10px;font-size:13px"><strong>终点：${escapeHtml(route.destName)}</strong></div>`,
          route.destination,
          [0, -34],
        );
      });
      layerGroups.transit.addOverlay(destMarker);
      transitMarkers.push(destMarker);
    } catch (err) {
      console.warn(`[风险地图] 转运路线 ${route.name} 渲染失败:`, err);
    }
  }
}

/** 调用 AMap.Driving 获取驾车导航路径坐标 */
function fetchDrivingPath(AMap: any, origin: [number, number], destination: [number, number]): Promise<[number, number][]> {
  return new Promise((resolve, reject) => {
    const driving = new AMap.Driving({
      policy: AMap.DrivingPolicy.LEAST_TIME,
    });
    driving.search(origin, destination, (status: string, result: any) => {
      if (status === 'complete' && result.routes && result.routes.length > 0) {
        const route = result.routes[0];
        const allPoints: [number, number][] = [];
        (route.steps || []).forEach((step: any) => {
          (step.path || []).forEach((p: any) => {
            allPoints.push([p.lng, p.lat]);
          });
        });
        resolve(allPoints);
      } else {
        reject(new Error(`Driving search failed: ${status}`));
      }
    });
  });
}

// ==================== 渲染转运站 ====================
function renderStations(AMap: any) {
  transferStations.forEach((s) => {
    const marker = new AMap.Marker({
      position: [s.lng, s.lat],
      icon: new AMap.Icon({
        size: new AMap.Size(28, 28),
        imageSize: new AMap.Size(28, 28),
        image: createMarkerSVG('转', '#1677ff'),
      }),
      anchor: 'center',
      offset: new AMap.Pixel(0, -14),
      zIndex: 100,
    });
    marker.setExtData({ name: s.name, type: 'station' });
    marker.on('click', () => {
      closeHover();
      openPopup(
        `<div style="padding:6px 10px;font-size:13px"><strong>${escapeHtml(s.name)}</strong><br/>坐标: ${s.lng.toFixed(6)}, ${s.lat.toFixed(6)}</div>`,
        [s.lng, s.lat],
        [0, -30],
      );
    });
    layerGroups.stations.addOverlay(marker);
  });
}

// ==================== 渲染自有设施 ====================
function renderFacilities(AMap: any) {
  facilities.forEach((f) => {
    const marker = new AMap.Marker({
      position: [f.lng, f.lat],
      icon: new AMap.Icon({
        size: new AMap.Size(32, 32),
        imageSize: new AMap.Size(32, 32),
        image: createMarkerSVG(f.icon, f.iconColor),
      }),
      anchor: 'center',
      offset: new AMap.Pixel(0, -16),
      zIndex: 110,
    });
    marker.setExtData({ name: f.name, type: 'facility' });
    marker.on('click', () => {
      closeHover();
      openPopup(`<div style="padding:6px 10px;font-size:13px"><strong>${escapeHtml(f.name)}</strong></div>`, [f.lng, f.lat], [0, -34]);
    });
    layerGroups.facilities.addOverlay(marker);
  });
}

// ==================== 渲染公园 ====================
function renderParks(AMap: any) {
  [...parkPolygons, ...KANGNING_LAKE_POLYGONS].forEach((park) => {
    const polygon = new AMap.Polygon({
      path: park.path,
      fillColor: park.color,
      fillOpacity: 0.15,
      strokeColor: park.color,
      strokeWeight: 2.5,
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      // 提示词-208 任务二：公园/康宁湖 zIndex 提到 20（最高面要素），高于所有道路与转运路线，
      // 确保公园区域优先接收鼠标事件（原 zIndex=5 被道路线遮挡导致 hover/click 无反应）；bubble:true 防止事件被阻断
      zIndex: 20,
      bubble: true,
    });
    polygon.setExtData({ name: park.name, type: 'park' });

    // 计算中心点
    const path = park.path as [number, number][];
    const len = path.length;
    let cx = 0;
    let cy = 0;
    path.forEach((p) => {
      cx += p[0] / len;
      cy += p[1] / len;
    });
    const center: [number, number] = [cx, cy];
    // 缓存公园中心点（用于公园周边风险点距离判定）
    parkCenters[park.name] = center;

    // 悬浮显示公园名称（常驻 label 已移除，改 hover 提示；康宁湖同规则）
    polygon.on('mouseover', (e: any) => {
      closeClick();
      openHover(park.name, [e.lnglat.lng, e.lnglat.lat]);
    });
    polygon.on('mouseout', () => {
      closeHover();
    });
    // 点击展示公园范围内（中心 500m）风险点列表
    polygon.on('click', (e: any) => {
      closeHover();
      openPopup(
        buildRiskListHtml(park.name, matchRisksNearPark(park.name)),
        [e.lnglat.lng, e.lnglat.lat],
        [0, -10],
      );
    });

    layerGroups.parks.addOverlay(polygon);
  });
}

// ==================== 加载并渲染风险点 ====================
async function loadAndRenderRisks(AMap: any) {
  try {
    // 重置聚合状态（防止重复渲染）
    riskMarkers = [];
    riskCluster = null;

    const { list } = await getRiskList({ page: 1, pageSize: 500 });
    // 提示词-208 任务三：风险点坐标智能吸附（仅前端，不写回数据库）。
    // 对每条风险点基于 location 文本匹配道路/场所/乡镇，吸附到更精确的坐标；
    // 已有精确坐标（非哈希占位）的不覆盖。吸附后的坐标用于渲染 Marker / 聚合 / 点击定位。
    allRisks.value = (list || []).map((risk: any) => {
      const snapped = snapRiskToRoad(risk);
      return {
        ...risk,
        lng: snapped.lng,
        lat: snapped.lat,
        _snapMethod: snapped.method,
        _snapPlace: snapped.placeName || snapped.roadName || null,
        _snapTownship: snapped.townshipName || null,
      };
    });

    // 调试日志（仅 dev 环境）：汇总各吸附策略命中与二级归属分布（提示词-209 #2/#4/#5）
    if (import.meta.env.DEV) {
      const snapTally: Record<string, number> = {};
      const placeTally: Record<string, Record<string, number>> = {};
      const townshipTally: Record<string, number> = {};
      allRisks.value.forEach((r: any) => {
        const m = r._snapMethod || 'unknown';
        snapTally[m] = (snapTally[m] || 0) + 1;
        const place = r._snapPlace || '-';
        if (!placeTally[m]) placeTally[m] = {};
        placeTally[m][place] = (placeTally[m][place] || 0) + 1;
        const tn = r._snapTownship || '-';
        townshipTally[tn] = (townshipTally[tn] || 0) + 1;
      });
      console.log('[snap] 风险点坐标吸附统计:', snapTally);
      console.log('[snap] 吸附目标分布:', placeTally);
      console.log('[snap] 乡镇归属分布（二级归属）:', townshipTally);
    }

    // 更新统计
    const levelCounts: Record<string, number> = { 一级: 0, 二级: 0, 三级: 0, 四级: 0 };
    allRisks.value.forEach((r) => {
      const level = r.level as string;
      if (levelCounts[level] !== undefined) levelCounts[level]++;
    });
    stats[0]!.value = allRisks.value.length;
    stats[1]!.value = levelCounts['一级'] || 0;
    stats[2]!.value = levelCounts['二级'] || 0;
    stats[3]!.value = levelCounts['三级'] || 0;

    // 过滤掉天气类风险（高温/雨雾/冰雪）
    const filtered = allRisks.value.filter((r) => {
      const name = r.name || '';
      const location = r.location || '';
      return !(
        name.includes('高温') ||
        name.includes('雨雾') ||
        name.includes('冰雪') ||
        name.includes('恶劣天气') ||
        location.includes('随车')
      );
    });

    // 提示词-211：收集吸附后仍无坐标的风险点（兜底面板展示）
    noCoordRisks.value = filtered.filter((r) => r.lng == null || r.lat == null);

    filtered.forEach((risk) => {
      const lng = risk.lng;
      const lat = risk.lat;
      if (lng == null || lat == null) return;

      const color = RISK_LEVEL_COLOR[risk.level as string] || '#8c8c8c';
      const size = risk.level === '一级' ? 14 : risk.level === '二级' ? 11 : 8;

      const marker = new AMap.Marker({
        position: [lng, lat],
        icon: new AMap.Icon({
          size: new AMap.Size(size, size),
          imageSize: new AMap.Size(size, size),
          image: createCircleSVG(color, size),
        }),
        anchor: 'center',
        offset: new AMap.Pixel(0, 0),
        zIndex: risk.level === '一级' ? 85 : risk.level === '二级' ? 80 : 75,
      });
      marker.setExtData({ ...risk, type: 'risk' });

      marker.on('click', () => {
        clearHighlight();
        closeHover();
        openPopup(buildRiskDetailHtml(risk, color), [lng, lat], [0, -size - 5]);
      });

      riskMarkers.push(marker);
    });

    // 风险点图层：优先使用点聚合（AMap.MarkerClusterer），不可用时降级为普通 Marker
    initRiskCluster(AMap);

    // 提示词-215/217：从清单页 ?riskId=xxx 跳转而来，自动定位并弹出详情
    const riskId = route.query.riskId;
    // focus=animate 表示需要播放定位高亮动画（提示词-217），否则仅定位弹窗
    const focusMode = String((route.query.focus as any) || '');
    if (riskId) {
      const target = allRisks.value.find((r: any) => r.id === Number(riskId));
      if (target) {
        // 延迟执行，等待地图渲染完成
        setTimeout(() => {
          if (focusMode === 'animate') {
            focusRiskWithAnimation(target); // 提示词-217：脉冲波纹 + 路段呼吸高亮
          } else {
            focusRisk(target); // 原有行为（仅定位弹窗）
          }
        }, 800);
      }
      // 清除 query 参数，避免刷新后重复定位
      router.replace({ query: {} });
    }
  } catch (err) {
    console.warn('[风险地图] 风险数据加载失败:', err);
  }
}

// ==================== 风险点点聚合 ====================
/**
 * 使用 AMap.MarkerClusterer 对风险点聚合；不可用时降级为普通 Marker。
 * - 聚合样式按聚合内最高风险等级着色（一级红/二级橙/三级黄/四级绿），圆形内显示数量
 * - 缩放 >= 15 时展开显示单个风险点，< 15 时显示聚合点（见 onRiskZoomEnd）
 */
function initRiskCluster(AMap: any) {
  if (typeof AMap?.MarkerClusterer === 'undefined' || riskMarkers.length === 0) {
    riskMarkers.forEach((m) => layerGroups.risks.addOverlay(m));
    return;
  }
  try {
    riskCluster = new AMap.MarkerClusterer(mapInstance, riskMarkers, {
      gridSize: 60,
      renderClusterMarker,
    });
    mapInstance.on('zoomend', onRiskZoomEnd);
  } catch (err) {
    console.warn('[风险地图] 点聚合初始化失败，降级为普通 Marker:', err);
    riskMarkers.forEach((m) => layerGroups.risks.addOverlay(m));
  }
}

/** 聚合点渲染：统计聚合内各等级数量，取最高风险等级着色 */
function renderClusterMarker(context: any) {
  const markers: any[] = context.markers || [];
  const counts: Record<string, number> = { 一级: 0, 二级: 0, 三级: 0, 四级: 0 };
  markers.forEach((m) => {
    const lv = m.getExtData()?.level;
    if (lv && counts[lv] !== undefined) counts[lv]++;
  });
  const dominant = counts['一级']
    ? '一级'
    : counts['二级']
      ? '二级'
      : counts['三级']
        ? '三级'
        : '四级';
  const color = RISK_LEVEL_COLOR[dominant] || '#8c8c8c';
  const size = 34 + Math.min(markers.length, 20);
  const html = `<div style="background:${color};color:#fff;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${markers.length}</div>`;
  context.marker.setContent(html);
  context.marker.setOffset(new (window as any).AMap.Pixel(-size / 2, -size / 2));
}

/** 缩放 >=15 展开单个风险点；<15 显示聚合点 */
function onRiskZoomEnd() {
  if (!riskCluster || !mapInstance) return;
  const visible = layerToggles.find((l) => l.key === 'risks')?.visible;
  if (!visible) return;
  const zoom = mapInstance.getZoom();
  try {
    if (zoom >= 15) {
      riskCluster.setMap(null);
      riskMarkers.forEach((m) => m.setMap(mapInstance));
      // 提示词-217 脉冲叠加问题修复：缩放回高倍率后，重新隐藏动画中被临时隐藏的原始 Marker
      if (highlightState.origMarkerHidden) {
        try {
          if (highlightState.origMarkerHidden.setOpacity) {
            highlightState.origMarkerHidden.setOpacity(0);
          }
        } catch {
          // ignore
        }
      }
    } else {
      riskMarkers.forEach((m) => m.setMap(null));
      riskCluster.setMap(mapInstance);
    }
  } catch (err) {
    console.warn('[风险地图] 缩放切换聚合失败:', err);
  }
}

// ==================== 图层切换 ====================
function toggleLayer(key: string) {
  const item = layerToggles.find((l) => l.key === key);
  if (!item) return;
  item.visible = !item.visible;
  // 风险点图层在使用聚合时，通过 cluster 显隐控制
  if (key === 'risks' && riskCluster) {
    if (item.visible) {
      const z = mapInstance?.getZoom() ?? 12;
      if (z >= 15) {
        riskCluster.setMap(null);
        riskMarkers.forEach((m) => m.setMap(mapInstance));
      } else {
        riskCluster.setMap(mapInstance);
      }
    } else {
      riskCluster.setMap(null);
      riskMarkers.forEach((m) => m.setMap(null));
    }
    return;
  }
  const group = layerGroups[key];
  if (!group) return;
  if (item.visible) {
    group.show();
  } else {
    group.hide();
  }
}

// ==================== SVG 工具函数 ====================
function createMarkerSVG(text: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="14" r="12" fill="${color}" stroke="#fff" stroke-width="2"/>
    <text x="16" y="17" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold" font-family="sans-serif">${text}</text>
    <polygon points="12,24 20,24 16,30" fill="${color}" stroke="#fff" stroke-width="1"/>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const circleCache: Record<string, string> = {};
function createCircleSVG(color: string, size: number): string {
  const key = `${color}_${size}`;
  if (circleCache[key]) return circleCache[key];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.85"/>
  </svg>`;
  circleCache[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return circleCache[key];
}

// ==================== 共享 InfoWindow / 交互辅助 ====================
/** HTML 特殊字符转义，防止 InfoWindow 渲染动态内容时 XSS */
function escapeHtml(s: string): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** 打开悬浮名称提示（公园/乡镇），同一时刻只显示一个 InfoWindow */
function openHover(name: string, position: [number, number]) {
  if (!AMapGlobal || !mapInstance) return;
  if (!hoverInfoWindow) {
    // closeButton:false 隐藏右上角 ❌；showShadow:false 使悬浮提示更轻量（提示词-208 任务一）
    hoverInfoWindow = new AMapGlobal.InfoWindow({
      offset: new AMapGlobal.Pixel(0, -10),
      closeButton: false,
      showShadow: true,
    });
  }
  hoverInfoWindow.setContent(`<div class="hover-tip">${escapeHtml(name)}</div>`);
  hoverInfoWindow.open(mapInstance, position);
  // 提示词-210：JS 兜底，确保关闭按钮 DOM 被移除（高德某些版本忽略 closeButton:false）
  setTimeout(() => {
    document.querySelectorAll('.amap-info-window-close,.amap-info-close').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
  }, 0);
}

function closeHover() {
  if (hoverInfoWindow) hoverInfoWindow.close();
}

/** 打开点击详情 InfoWindow（风险点列表等），复用单实例 */
function openPopup(content: string, position: [number, number], offset: [number, number] = [0, -10]) {
  if (!AMapGlobal || !mapInstance) return;
  if (!clickInfoWindow) {
    // closeButton:false 隐藏右上角 ❌（提示词-208 任务一）；showShadow:false 去除气泡阴影
    clickInfoWindow = new AMapGlobal.InfoWindow({
      closeButton: false,
      showShadow: false,
    });
  }
  clickInfoWindow.setOffset(new AMapGlobal.Pixel(offset[0], offset[1]));
  clickInfoWindow.setContent(content);
  clickInfoWindow.open(mapInstance, position);
  // 提示词-210：JS 兜底，确保关闭按钮 DOM 被移除
  setTimeout(() => {
    document.querySelectorAll('.amap-info-window-close,.amap-info-close').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
    });
  }, 0);
}

function closeClick() {
  if (clickInfoWindow) clickInfoWindow.close();
}

/** 乡镇名称匹配：精确 → 去后缀（镇/乡/街道）→ 包含关系 */
function matchRisksByArea(townName: string): any[] {
  const town = (townName || '').trim();
  const stripped = town.replace(/(镇|乡|街道)$/, '');
  return allRisks.value.filter((r: any) => {
    const area = (r.area || '').trim();
    if (!area) return false;
    if (area === town) return true;
    if (stripped && area === stripped) return true;
    if (area.includes(town) || town.includes(area)) return true;
    if (stripped && (area.includes(stripped) || stripped.includes(area))) return true;
    return false;
  });
}

/** 公园/康宁湖周边风险点：中心 500m 范围内，或名称/区域匹配 */
function matchRisksNearPark(name: string): any[] {
  const center = parkCenters[name];
  return allRisks.value.filter((r: any) => {
    if (r.lng == null || r.lat == null) return false;
    if (center) {
      const d = Math.sqrt(Math.pow(r.lng - center[0], 2) + Math.pow(r.lat - center[1], 2)) * 111000;
      if (d <= 500) return true;
    }
    const area = (r.area || '').trim();
    const loc = (r.location || '').trim();
    return area === name || loc.includes(name) || name.includes(area);
  });
}

// 提示词-217 任务三：预计算已知道路名（ROAD_NETWORK_DATA 路名 + ROAD_ALIAS 值），用于判断缺失道路
const KNOWN_ROAD_NAMES: Set<string> = new Set();
ROAD_NETWORK_DATA.forEach((r: any) => {
  if (r.name) KNOWN_ROAD_NAMES.add(String(r.name).toLowerCase());
});
Object.values(ROAD_ALIAS).forEach((v) => KNOWN_ROAD_NAMES.add(String(v).toLowerCase()));

/** 判断 location 文本中是否包含数据未覆盖的道路（提示词-217 任务三） */
function hasUnmatchedRoad(location: string): boolean {
  if (!location) return false;
  const tokens: string[] = [];
  const codeRe = /[GSY]\d+/gi;
  const nameRe = /[一-龥]+(线|路|大道|大街|街|高速)/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(location))) tokens.push(m[0].toUpperCase());
  while ((m = nameRe.exec(location))) tokens.push(m[0]);
  if (tokens.length === 0) return false;
  for (const t of tokens) {
    const alias = ROAD_ALIAS[t] || t;
    if (KNOWN_ROAD_NAMES.has(alias.toLowerCase()) || KNOWN_ROAD_NAMES.has(t.toLowerCase())) continue;
    return true; // 命中一条数据未覆盖的道路即提示
  }
  return false;
}

/** 风险点详情 HTML（用于 marker 点击与列表项定位） */
function buildRiskDetailHtml(risk: any, color: string): string {
  // 提示词-217 任务三：缺失道路提示（廊万线/宁东路等数据未覆盖）
  const roadHint = hasUnmatchedRoad(risk.location || '')
    ? `<div style="color:#999;font-size:11px;margin-top:4px;">注：廊万线、宁东路等部分道路数据暂未覆盖，地图仅显示可匹配路段</div>`
    : '';
  return (
    `<div class="iw-risk-detail">` +
    `<div class="iw-risk-name" style="color:${color}">${escapeHtml(risk.name || '未命名风险')}</div>` +
    `<div class="iw-risk-rows">` +
    `<div>类型：${escapeHtml(risk.type || '-')} | 事故：${escapeHtml(risk.accidentType || '-')}</div>` +
    `<div>等级：<span style="color:${color};font-weight:600">${escapeHtml(risk.level || '-')}</span></div>` +
    `<div>场所：${escapeHtml(risk.location || '-')}</div>` +
    roadHint +
    `<div>管控部门：${escapeHtml(risk.area || '-')}</div>` +
    `</div>` +
    `<div class="iw-risk-action" style="margin-top:8px;padding-top:8px;border-top:1px solid hsl(var(--border));">` +
    buildGoToListLink(risk.id) +
    `</div>` +
    `</div>`
  );
}

/** 要素内风险点列表 InfoWindow 内容 */
function buildRiskListHtml(title: string, risks: any[]): string {
  const matched = (risks || []).slice();
  lastMatchedRisks = matched.slice();
  // 数量按区域内最高等级着色
  const order = ['一级', '二级', '三级', '四级'];
  let dominant = '';
  for (const lv of order) {
    if (matched.some((r) => (r.level || '') === lv)) {
      dominant = lv;
      break;
    }
  }
  const countColor = RISK_LEVEL_COLOR[dominant] || '#333';
  const total = matched.length;
  let listHtml = '';
  const showCount = Math.min(total, 10);
  for (let i = 0; i < showCount; i++) {
    const r = matched[i];
    const color = RISK_LEVEL_COLOR[r.level as string] || '#8c8c8c';
    listHtml +=
      `<div class="risk-item" onclick="window.__mapFocusRisk(${i})">` +
      `<span class="risk-dot" style="background:${color}"></span>` +
      `<span class="risk-name">${escapeHtml(r.name || '未命名风险')}</span>` +
      `<span class="risk-level" style="color:${color}">（${escapeHtml(r.level || '')}）</span>` +
      buildGoToListLink(r.id) +
      `</div>`;
  }
  if (total > 10) {
    listHtml += `<div class="risk-more">...还有 ${total - 10} 条</div>`;
  }
  if (total === 0) {
    listHtml = `<div class="risk-empty">该区域暂无风险点数据</div>`;
  }
  return (
    `<div class="iw-wrap">` +
    `<div class="iw-title">${escapeHtml(title)}</div>` +
    `<div class="iw-count" style="color:${countColor}">该区域共 ${total} 个风险点</div>` +
    `<div class="iw-list">${listHtml}</div>` +
    `</div>`
  );
}

/** 地图定位到某风险点并弹出其详情 InfoWindow */
function focusRisk(risk: any) {
  const lng = risk.lng;
  const lat = risk.lat;
  if (lng == null || lat == null || !mapInstance) return;
  mapInstance.setCenter([lng, lat]);
  mapInstance.setZoom(16);
  const color = RISK_LEVEL_COLOR[risk.level as string] || '#8c8c8c';
  openPopup(buildRiskDetailHtml(risk, color), [lng, lat], [0, -30]);
}

function focusRiskByIdx(idx: number) {
  const risk = lastMatchedRisks[idx];
  if (risk) {
    clearHighlight();
    focusRisk(risk);
  }
}
// 供 InfoWindow 列表项 onclick 调用
(window as any).__mapFocusRisk = focusRiskByIdx;

// ==================== 定位高亮动画（提示词-217） ====================

/** 清除上一次定位高亮：恢复道路样式、移除脉冲 Marker、恢复原始 Marker、停止定时器 */
function clearHighlight() {
  if (highlightState.highlightTimer) {
    clearTimeout(highlightState.highlightTimer);
    highlightState.highlightTimer = null;
  }
  if (highlightState.breathTimer) {
    clearInterval(highlightState.breathTimer);
    highlightState.breathTimer = null;
  }
  if (highlightState.origMarkerHideTimer) {
    clearTimeout(highlightState.origMarkerHideTimer);
    highlightState.origMarkerHideTimer = null;
  }
  highlightState.highlightedRoads.forEach(({ polyline, origColor, origWeight, origOpacity }) => {
    if (polyline && polyline.setOptions) {
      polyline.setOptions({ strokeColor: origColor, strokeWeight: origWeight, strokeOpacity: origOpacity });
    }
  });
  highlightState.highlightedRoads = [];
  if (highlightState.pulseMarker && mapInstance) {
    mapInstance.remove(highlightState.pulseMarker);
  }
  highlightState.pulseMarker = null;
  // 恢复被隐藏的原始风险点 Marker（提示词-217 脉冲叠加问题修复）
  if (highlightState.origMarkerHidden) {
    try {
      const m = highlightState.origMarkerHidden;
      if (m.setOpacity) {
        m.setOpacity(1);
      } else if (m.show) {
        m.show();
      }
    } catch {
      // 兼容旧版，忽略恢复失败
    }
    highlightState.origMarkerHidden = null;
  }
}

/** 创建脉冲波纹 Marker（提示词-217） */
function createPulseMarker(position: [number, number], levelColor: string): any {
  const pulseDiv = document.createElement('div');
  pulseDiv.className = 'risk-pulse-marker';
  pulseDiv.style.color = levelColor;
  pulseDiv.innerHTML =
    `<div class="pulse-ring" style="border-color:${levelColor}"></div>` +
    `<div class="pulse-ring pulse-ring-2" style="border-color:${levelColor}"></div>` +
    `<div class="pulse-core" style="background:${levelColor}"></div>`;
  const marker = new AMapGlobal.Marker({
    position: position,
    content: pulseDiv,
    offset: new AMapGlobal.Pixel(-15, -15),
    zIndex: 200,
    clickable: false,
  });
  mapInstance.add(marker);
  return marker;
}

/** 查找并高亮距离风险点 500m 内的路段（提示词-217） */
function highlightNearbyRoads(riskLng: number, riskLat: number, levelColor: string) {
  const MAX_DIST = 500; // 米
  roadPolylines.forEach(({ polyline, data }) => {
    const path: [number, number][] = polyline.getPath ? polyline.getPath() : (data.path || []);
    let minDist = Infinity;
    for (const p of path) {
      const dlng = p[0] - riskLng;
      const dlat = p[1] - riskLat;
      const dist = Math.sqrt(dlng * dlng + dlat * dlat) * 111000;
      if (dist < minDist) minDist = dist;
    }
    if (minDist <= MAX_DIST) {
      const opts = polyline.getOptions ? polyline.getOptions() : null;
      const origColor = (opts && opts.strokeColor) || data.color || '#888';
      const origWeight = (opts && opts.strokeWeight) || data.weight || 4;
      const origOpacity =
        opts && typeof opts.strokeOpacity === 'number' ? opts.strokeOpacity : (data.opacity ?? 0.8);
      highlightState.highlightedRoads.push({ polyline, origColor, origWeight, origOpacity });
      polyline.setOptions({
        strokeColor: levelColor,
        strokeWeight: 7,
        strokeOpacity: 0.9,
      });
    }
  });
}

/** 定位到风险点并播放等级高亮 + 脉冲波纹动画（提示词-217） */
function focusRiskWithAnimation(risk: any) {
  const lng = risk.lng;
  const lat = risk.lat;
  if (lng == null || lat == null || !mapInstance) return;
  // 先清除上一次高亮
  clearHighlight();
  // 定位 + 弹窗（沿用原有行为）
  mapInstance.setCenter([lng, lat]);
  mapInstance.setZoom(16);
  const color = RISK_LEVEL_COLOR[risk.level as string] || '#8c8c8c';
  openPopup(buildRiskDetailHtml(risk, color), [lng, lat], [0, -30]);
  // 脉冲波纹 Marker
  highlightState.pulseMarker = createPulseMarker([lng, lat], color);
  // 高亮最近路段（呼吸闪烁）
  highlightNearbyRoads(lng, lat, color);
  if (highlightState.highlightedRoads.length > 0) {
    let breathPhase = 0;
    highlightState.breathTimer = setInterval(() => {
      breathPhase = (breathPhase + 1) % 20;
      const opacity = 0.55 + 0.4 * Math.abs(Math.sin((breathPhase / 20) * Math.PI));
      highlightState.highlightedRoads.forEach(({ polyline }) => {
        if (polyline && polyline.setOptions) polyline.setOptions({ strokeOpacity: opacity });
      });
    }, 80);
  }
  // 提示词-217 脉冲叠加问题修复：等待 zoom 动画完成（约400ms）后，隐藏原始风险点 Marker，避免与脉冲波纹重叠
  // 需延迟执行，因为 setZoom(16) 会触发 zoomend → onRiskZoomEnd → setMap(mapInstance) 重新显示所有 Marker
  highlightState.origMarkerHideTimer = setTimeout(() => {
    const targetMarker = riskMarkers.find((m) => {
      try {
        const d = m.getExtData();
        return d && d.type === 'risk' && d.id === risk.id;
      } catch {
        return false;
      }
    });
    if (targetMarker) {
      highlightState.origMarkerHidden = targetMarker;
      try {
        if (targetMarker.setOpacity) {
          targetMarker.setOpacity(0);
        } else if (targetMarker.hide) {
          targetMarker.hide();
        }
      } catch {
        // 忽略隐藏失败
      }
    }
    highlightState.origMarkerHideTimer = null;
  }, 500);
  // 8 秒后自动清除（InfoWindow 保留，不影响地图其他操作）
  highlightState.highlightTimer = setTimeout(() => clearHighlight(), 8000);
}

// 提示词-215 任务二（反向）：跳转回风险清单页并定位到该风险行
function goToList(riskId: number) {
  router.push({ path: '/risk/list', query: { riskId: String(riskId) } });
}
(window as any).__mapGoToList = goToList;

// 生成“在风险清单中查看”跳转链接 HTML（供 InfoWindow 内嵌 onclick 调用）
function buildGoToListLink(riskId: number): string {
  return (
    `<a href="/risk/list?riskId=${riskId}" class="iw-go-list" ` +
    `style="color:hsl(var(--primary));font-size:12px;text-decoration:none;display:inline-block;margin-top:4px;" ` +
    `onclick="event.preventDefault();event.stopPropagation();window.__mapGoToList(${riskId})">` +
    `📋 在风险清单中查看</a>`
  );
}

// ==================== 风险点坐标智能吸附（提示词-208 任务三） ====================
/**
 * 复刻 backfill 的确定性哈希 jitter，用于识别"哈希兜底占位坐标"。
 * 占位坐标 = 某乡镇中心 + sin/cos(id) 偏移；真实精确坐标不会命中此模式。
 */
function jitter(center: [number, number], seed: number): [number, number] {
  const a = Math.sin(seed * 1234.5678) * 0.008;
  const b = Math.cos(seed * 8765.4321) * 0.008;
  return [center[0] + a, center[1] + b];
}

/** 判断风险点坐标是否为哈希占位（NULL 或匹配 backfill 的确定性哈希输出） */
function isHashPlaceholder(risk: any): boolean {
  const lng = Number(risk.lng);
  const lat = Number(risk.lat);
  if (risk.lng == null || risk.lat == null || isNaN(lng) || isNaN(lat)) return true;
  const idx = Math.abs(risk.id || 0) % TOWNSHIP_CENTERS.length;
  const t = TOWNSHIP_CENTERS[idx]!;
  const center: [number, number] = [t[1], t[2]];
  const [hlng, hlat] = jitter(center, risk.id || 0);
  return Math.abs(lng - hlng) < 1e-4 && Math.abs(lat - hlat) < 1e-4;
}

/**
 * 提示词-209（area 二级归属增强）：通过风险点 ID 反推所属乡镇中心。
 * backfill 占位坐标 = TOWNSHIP_CENTERS[id % len] + jitter，因此 idx = id % len 可还原所属乡镇。
 * 对于数据库中 lng/lat 为 null 的风险点（未执行过 backfill 写库），同样按 id 确定性分配——
 * 这与 backfill-risk-coords.js 策略5（哈希兜底）的分配规则完全一致，保证推断结果与回填脚本对齐。
 * 对于已有精确坐标的风险点，返回 null（不推断，也不吸附）。
 */
function inferTownshipAnchor(risk: any): [number, number] | null {
  // 精确坐标（非 null 且不匹配 jitter 模式）不推断
  if (risk.lng != null && risk.lat != null && !isHashPlaceholder(risk)) return null;
  // null 坐标或占位坐标：按 backfill 确定性规则 idx = id % len 反推乡镇
  const idx = Math.abs(risk.id || 0) % TOWNSHIP_CENTERS.length;
  const t = TOWNSHIP_CENTERS[idx]!;
  return [t[1], t[2]];
}

/** 道路 path 中点（带缓存） */
function roadMidpoint(road: any): [number, number] {
  const cached = roadCenterCache.get(road.name);
  if (cached) return cached;
  const p = road.path as [number, number][];
  const len = p.length;
  let cx = 0;
  let cy = 0;
  p.forEach((pt) => {
    cx += pt[0] / len;
    cy += pt[1] / len;
  });
  const mid: [number, number] = [cx, cy];
  roadCenterCache.set(road.name, mid);
  return mid;
}

const CLS_PRIORITY: Record<string, number> = { 国道: 0, 省道: 1, 县道: 2, 乡道: 3, 穿村道路: 4 };

/** 从 location 文本提取道路关键词（G/S 代码 + 真实路名） */
function extractRoadKeywords(location: string): string[] {
  const keywords: string[] = [];
  const gMatch = location.match(/G(\d{3})/g);
  if (gMatch) keywords.push(...gMatch);
  const sMatch = location.match(/S(\d{3})/g);
  if (sMatch) keywords.push(...sMatch);
  // 真实路名（从 ROAD_NETWORK_DATA 收集的非 ID 格式名称）直接出现在 location 中
  ROAD_NETWORK_DATA.forEach((road) => {
    if (!/^(国道|省道|县道|乡道|穿村道路)-\d+$/.test(road.name) && location.includes(road.name)) {
      keywords.push(road.name);
    }
  });
  return keywords;
}

/**
 * 风险点坐标智能吸附：基于 location 文本匹配道路/场所/乡镇，返回更精确坐标。
 * 返回 { lng, lat, method }，method ∈ 'road' | 'station' | 'park' | 'facility' | 'township' | 'original'。
 * 规则：已有精确坐标（非哈希占位）直接保留原坐标；其余按策略逐级匹配。
 */
function snapRiskToRoad(risk: any): { lng: number | null; lat: number | null; method: string; roadName?: string; placeName?: string; townshipName?: string } {
  const location = (risk.location || '').trim();
  const cur: [number, number] = [Number(risk.lng), Number(risk.lat)];
  // 提示词-209（area 二级归属）：占位坐标通过 ID 反推所属乡镇中心作为锚点，
  // 使"最近"判定不再全部塌缩到宁津中心，而是匹配到所属乡镇附近的要素，分布更真实。
  // null 坐标仍回退到宁津中心；精确坐标不做吸附（下方 isHashPlaceholder 保护）。
  const inferredAnchor = inferTownshipAnchor(risk);
  const anchor: [number, number] =
    inferredAnchor ??
    (risk.lng == null || risk.lat == null || isNaN(cur[0]) || isNaN(cur[1]) ? NINGJIN_CENTER : cur);
  // 记录推断的乡镇名（用于调试与 placeName 回退）
  let inferredTownName: string | undefined;
  if (inferredAnchor) {
    const idx = Math.abs(risk.id || 0) % TOWNSHIP_CENTERS.length;
    inferredTownName = TOWNSHIP_CENTERS[idx]![0];
  }
  const d2 = (a: [number, number], b: [number, number]) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

  // 精确坐标保护：非占位坐标不做吸附
  if (!isHashPlaceholder(risk)) {
    return { lng: Number(risk.lng), lat: Number(risk.lat), method: 'original' };
  }

  // 1) 道路名称关键词匹配
  const keywords = extractRoadKeywords(location);
  const matchedRoads: any[] = [];
  for (const kw of keywords) {
    const alias = ROAD_ALIAS[kw] || kw;
    ROAD_NETWORK_DATA.forEach((road) => {
      if (road.name.includes(alias) && /^(国道|省道|县道|乡道|穿村道路)$/.test(road.cls)) {
        matchedRoads.push(road);
      }
    });
  }
  if (matchedRoads.length > 0) {
    // G道优先于S道优先于县道；同级取距风险点（锚点）最近的分段中点
    matchedRoads.sort((a: any, b: any) => {
      const pa = CLS_PRIORITY[a.cls] ?? 9;
      const pb = CLS_PRIORITY[b.cls] ?? 9;
      if (pa !== pb) return pa - pb;
      return d2(roadMidpoint(a), anchor) - d2(roadMidpoint(b), anchor);
    });
    const mid = roadMidpoint(matchedRoads[0]);
    return { lng: mid[0], lat: mid[1], method: 'road', roadName: matchedRoads[0].name, townshipName: inferredTownName };
  }

  // 2) 场所类型匹配（"最近"以推断的所属乡镇中心为锚点，实现二级归属，提示词-209 #2）
  if (/转运站|中转站/.test(location)) {
    let best = transferStations[0]!;
    let bd = Infinity;
    transferStations.forEach((s) => {
      const d = d2([s.lng, s.lat], anchor);
      if (d < bd) {
        bd = d;
        best = s;
      }
    });
    return { lng: best.lng, lat: best.lat, method: 'station', placeName: best.name, townshipName: inferredTownName };
  }
  if (/公园|草坪|绿化带/.test(location) && !/道路/.test(location)) {
    // parkCenters 已由 renderParks 在 loadAndRenderRisks 之前填充；兜底用 anchor 避免 undefined
    // 提示词-209 #5（公园细分）：若 location 显式提到"康宁湖"，直接匹配康宁湖；
    // 否则以推断乡镇中心为锚点取最近公园/景观带，空间距离自然实现细分。
    // 距离阈值 PARK_MAX_DIST = 0.05（约 5.5km）：远离县城的乡镇（>5km）无公园数据，
    // 不强行吸附到县城公园，回退到 township（乡镇中心）避免误导。
    const PARK_MAX_DIST = 0.05;
    if (location.includes('康宁湖')) {
      const kn = KANGNING_LAKE_POLYGONS.find((p) => p.name === '康宁湖');
      if (kn) {
        const c = parkCenters[kn.name] ?? anchor;
        return { lng: c[0], lat: c[1], method: 'park', placeName: kn.name, townshipName: inferredTownName };
      }
    }
    let best: any = null;
    let bd = Infinity;
    [...parkPolygons, ...KANGNING_LAKE_POLYGONS].forEach((p) => {
      const c = parkCenters[p.name] ?? anchor;
      const d = d2(c, anchor);
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    // 最近公园在阈值内才吸附，否则继续往下走 township（避免远郊乡镇误吸附到县城公园）
    if (best && bd <= PARK_MAX_DIST) {
      const c = parkCenters[best.name] ?? anchor;
      return { lng: c[0], lat: c[1], method: 'park', placeName: best.name, townshipName: inferredTownName };
    }
  }
  if (/办公室/.test(location)) {
    const f = facilities.find((x) => x.name === '办公室');
    if (f) return { lng: f.lng, lat: f.lat, method: 'facility', placeName: f.name, townshipName: inferredTownName };
  }
  if (/仓库/.test(location)) {
    const f = facilities.find((x) => x.name === '仓库');
    if (f) return { lng: f.lng, lat: f.lat, method: 'facility', placeName: f.name, townshipName: inferredTownName };
  }

  // 3) 区域模糊匹配（乡镇名）
  // 提示词-209 #2：优先使用 ID 反推的所属乡镇中心（二级归属），比"距锚点最近"更准确
  if (inferredAnchor && inferredTownName) {
    return { lng: inferredAnchor[0], lat: inferredAnchor[1], method: 'township', placeName: inferredTownName, townshipName: inferredTownName };
  }
  for (const [town, clng, clat] of TOWNSHIP_CENTERS) {
    if (location.includes(town)) {
      return { lng: clng, lat: clat, method: 'township', placeName: town };
    }
  }
  if (/镇驻地|村内道路/.test(location)) {
    // 取最近乡镇中心
    let best: [string, number, number] | null = null;
    let bd = Infinity;
    TOWNSHIP_CENTERS.forEach(([t, clng, clat]) => {
      const d = d2([clng, clat], anchor);
      if (d < bd) {
        bd = d;
        best = [t, clng, clat];
      }
    });
    if (best) return { lng: best[1], lat: best[2], method: 'township', placeName: best[0] };
  }

  // 4) 兜底：保留原坐标（可能为 NULL，渲染时不显示该点）
  // 注意：直接沿用原始值（不再套 Number()），避免 Number(null)===0 使 Marker 被误放到 (0,0)
  return { lng: risk.lng, lat: risk.lat, method: 'original' };
}

// ==================== 生命周期 ====================
onMounted(() => {
  nextTick(() => {
    initMap();
  });
});

onBeforeUnmount(() => {
  if (mapInstance) {
    mapInstance.destroy();
    mapInstance = null;
  }
});
</script>

<style lang="less" scoped>
.hse-page {
  padding: 0;
}

.stat-card {
  :deep(.ant-card-body) {
    padding: 10px 16px;
  }
}

.stat-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stat-label {
  font-size: 13px;
  color: hsl(var(--foreground) / 0.65);
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  margin-left: auto;
  color: hsl(var(--foreground));
}

.map-card {
  height: calc(100vh - 200px);
  min-height: 600px;
  display: flex;
  flex-direction: column;

  :deep(.ant-card-body) {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
}

.map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.toolbar-hint {
  font-size: 12px;
  color: hsl(var(--foreground) / 0.5);
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.layer-tag-off {
  opacity: 0.4;
}

.map-container {
  flex: 1;
  width: 100%;
  position: relative;
}

.legend-panel {
  position: absolute;
  bottom: 16px;
  left: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 10px 14px;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 130px;
}

.legend-section {
  .legend-title {
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--foreground) / 0.55);
    margin-bottom: 4px;
  }
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: hsl(var(--foreground) / 0.75);
  line-height: 1.8;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-line {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.legend-park {
  width: 18px;
  height: 12px;
  border-radius: 2px;
  border: 2px dashed #52c41a;
  background: #52c41a22;
  flex-shrink: 0;
}

/* 提示词-211：无坐标风险点兜底面板 */
.no-coord-panel {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 10px 14px;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 180px;
  max-width: 260px;
}

.no-coord-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid hsl(var(--border));
}

.no-coord-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  flex-shrink: 0;
}

.no-coord-title {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground) / 0.75);
}

.no-coord-count {
  font-size: 12px;
  font-weight: 700;
  color: #ff4d4f;
  margin-left: auto;
}

.no-coord-list {
  max-height: 160px;
  overflow-y: auto;
}

.no-coord-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  border-bottom: 1px dashed hsl(var(--border));
  font-size: 12px;
  line-height: 1.4;
}

.no-coord-item:last-child {
  border-bottom: none;
}

.no-coord-name {
  color: hsl(var(--foreground));
  font-weight: 500;
}

.no-coord-loc {
  color: hsl(var(--foreground) / 0.55);
  font-size: 11px;
}
</style>

<!-- InfoWindow 内容样式（非 scoped：内容渲染在地图容器 DOM 之外，scoped 不生效） -->
<style>
.hover-tip {
  /* 提示词-214：悬浮名称标签改为卡片样式，与风险清单中风险地图的 tooltip 效果一致 */
  padding: 4px 10px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgb(0 0 0 / 15%);
}

.iw-wrap {
  min-width: 200px;
  max-width: 300px;
  max-height: 400px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
}

.iw-title {
  /* 提示词-208 任务四：点击弹窗标题加粗 14px */
  font-size: 14px;
  font-weight: 700;
  color: #1f1f1f;
  margin-bottom: 4px;
}

.iw-count {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.iw-list {
  max-height: 320px;
  overflow-y: auto;
}

.risk-item {
  cursor: pointer;
  padding: 2px 0;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.risk-item:hover {
  background: #f0f0f0;
}

.risk-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
  flex-shrink: 0;
}

.risk-name {
  margin-right: 4px;
  color: #333;
}

.risk-level {
  font-weight: 600;
  font-size: 12px;
}

.risk-more,
.risk-empty {
  padding: 4px 0 0 14px;
  color: #999;
  font-size: 12px;
}

.iw-risk-detail {
  min-width: 200px;
  padding: 4px;
  font-size: 13px;
  line-height: 1.6;
}

.iw-risk-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.iw-risk-rows {
  font-size: 12px;
  color: #666;
}

/* 提示词-210：彻底隐藏 InfoWindow 右上角 ❌ 关闭按钮（CSS 兜底） */
.amap-info-window-close,
.amap-info-close {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* 提示词-217：风险定位脉冲波纹 Marker */
.risk-pulse-marker {
  position: relative;
  width: 30px;
  height: 30px;
  pointer-events: none;
}
.risk-pulse-marker .pulse-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 8px currentColor;
  z-index: 2;
}
.risk-pulse-marker .pulse-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid;
  transform: translate(-50%, -50%);
  animation: pulse-ring-anim 2s ease-out infinite;
  opacity: 0;
}
.risk-pulse-marker .pulse-ring-2 {
  animation-delay: 0.8s;
}
@keyframes pulse-ring-anim {
  0% {
    width: 14px;
    height: 14px;
    opacity: 0.9;
  }
  100% {
    width: 50px;
    height: 50px;
    opacity: 0;
  }
}
</style>