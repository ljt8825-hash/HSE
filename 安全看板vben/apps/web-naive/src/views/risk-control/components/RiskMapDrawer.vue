<script lang="ts" setup>
/**
 * 风险地图抽屉（web-naive 试点 · 阶段04 · 真实交互地图）
 *
 * 实现方案（P1-3 决策点 1）：与 web-antd 独立风险地图页（views/risk-control/map.vue）
 * 一致，使用高德 AMap JS SDK（v2.0，运行时 <script> 动态加载），
 * 不引入任何 npm 依赖，不修改 package.json / 锁文件。
 *
 * 能力：
 *   - 乡镇行政边界（真实 GeoJSON，12 乡镇分色，hover 显示名称，点击展示该乡镇风险点）
 *   - 乡镇底图（AMap 标准底图）
 *   - 道路网络（ROAD_NETWORK_DATA，五级分色）
 *   - 康宁湖 / 公园多边形
 *   - 风险点标记（等级分色；无 GPS 坐标者经 getFallbackCoords 回退到乡镇中心，
 *     弹窗标注「近似位置」）
 *   - 图层开关 / 风险等级图例 / 无坐标风险点兜底面板
 *   - 列表 ↔ 地图联动：marker 点击 emit marker-click；父组件传入 highlightedId 定位高亮
 *
 * 失败降级：AMap SDK 加载失败或 GeoJSON 拉取失败时，显示明确的降级提示，
 * 不产生未捕获异常，控制台无新增 error/warn。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  NAlert,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NSpin,
  NSwitch,
} from 'naive-ui';
import type { RiskControlApi } from '#/api/risk-control';
import {
  KANGNING_LAKE_POLYGONS,
} from '#/components/hse/kangning-lake';
import {
  NINGJIN_CENTER,
  NINGJIN_ZOOM,
  ROAD_NETWORK_DATA,
  ROAD_LEGEND,
  getFallbackCoords,
} from '#/components/hse/risk-map-data';

const props = defineProps<{
  open: boolean;
  risks?: RiskControlApi.RiskSource[];
  highlightedId?: number | null;
  /** 地图数据集加载中（父级按当前筛选条件拉全量数据时） */
  dataLoading?: boolean;
  /** 地图数据集加载失败信息（父级传入） */
  dataError?: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'marker-click', risk: RiskControlApi.RiskSource): void;
}>();

// ==================== 高德地图配置（与 web-antd map.vue 一致） ====================
const AMAP_KEY = '2dbd01fb5cba78d98503d6d19c46b56b';
const AMAP_SECURITY = '78c2d6a946eb410c19bf9ab999b866f1';
const AMAP_ZOOM = NINGJIN_ZOOM; // 12

const mapContainer = ref<HTMLElement | null>(null);
const loading = ref(false);
const loadError = ref('');
/** 乡镇边界 GeoJSON 加载失败的用户可见提示（仅边界层失败，不影响地图主体） */
const boundaryError = ref('');
let mapInstance: any = null;
let amapGlobal: any = null;
let amapLoaded = false;

// 图层开关
const layerVisible = ref({
  boundary: true,
  roads: true,
  parks: true,
  stations: true,
  facilities: true,
  risks: true,
});

const layerGroups: Record<string, any> = {};
let riskMarkers: any[] = [];
const markerMap = new Map<number, any>();

/** 12 乡镇分色（功能色，仅用于视觉区分各乡镇边界） */
const TOWNSHIP_COLORS = [
  '#E8590C', '#099268', '#92400E', '#16A34A', '#0EA5E9', '#3B82F6',
  '#0D9488', '#CA8A04', '#DC2626', '#84CC16', '#EC4899', '#9333EA',
];
const RISK_LEVEL_COLOR: Record<string, string> = {
  一级: '#f5222d',
  二级: '#fa8c16',
  三级: '#faad14',
  四级: '#52c41a',
};

// 转运站 / 自有设施（与 web-antd map.vue 数据一致）
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
const facilities = [
  { name: '办公室', lng: 116.81585532, lat: 37.63514208, icon: '办', iconColor: '#722ed1' },
  { name: '仓库', lng: 116.81590903, lat: 37.63653545, icon: '仓', iconColor: '#13c2c2' },
];
const parkPolygons = [
  {
    name: '中心公园',
    path: [
      [116.79623522, 37.63993104], [116.79863545, 37.63987673],
      [116.79854892, 37.63272266], [116.79612725, 37.63276000],
    ],
    color: '#52c41a',
  },
  {
    name: '福宁河景观带',
    path: [
      [116.78103661, 37.64336368], [116.79231339, 37.64331755],
      [116.79587130, 37.64360179], [116.79627846, 37.64317645],
      [116.83046948, 37.64276205], [116.83051226, 37.64225222],
      [116.78095078, 37.64288799],
    ],
    color: '#1890ff',
  },
  {
    name: '新河公园（湿地）',
    path: [
      [116.77910912, 37.66529794], [116.79827378, 37.66303401],
      [116.80245250, 37.66403012], [116.80815175, 37.66363048],
      [116.80755156, 37.66099850], [116.77840103, 37.66196916],
    ],
    color: '#13c2c2',
  },
];

// ==================== AMap SDK 动态加载 ====================
function loadAmapScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (amapLoaded && (window as any).AMap) {
      resolve((window as any).AMap);
      return;
    }
    if ((window as any).AMap) {
      amapLoaded = true;
      resolve((window as any).AMap);
      return;
    }
    (window as any)._AMapSecurityConfig = {
      securityJsCode: AMAP_SECURITY,
    };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Geocoder`;
    script.onload = () => {
      amapLoaded = true;
      resolve((window as any).AMap);
    };
    script.onerror = () => reject(new Error('高德地图 SDK 加载失败'));
    document.head.appendChild(script);
  });
}

function escapeHtml(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

// ==================== 渲染：乡镇边界（真实 GeoJSON） ====================
async function renderBoundary(AMap: any) {
  if (!layerGroups.boundary) return;
  layerGroups.boundary.clearOverlays();
  if (!layerVisible.value.boundary) return;

  let geoJson: any = null;
  try {
    const res = await fetch('/geojson/ningjin-boundary.geojson');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geoJson = await res.json();
  } catch (err) {
    // 用户可见的降级提示：仅边界层失败，地图主体/风险标记继续可用；
    // 不静默跳过，也不制造新的控制台 warn/error。
    boundaryError.value = `乡镇边界数据加载失败（${(err as Error)?.message || '未知错误'}），地图暂仅显示风险点标记。`;
    return;
  }
  boundaryError.value = '';

  const features: any[] = geoJson?.features || [];
  features.forEach((feature: any, idx: number) => {
    const color = TOWNSHIP_COLORS[idx % TOWNSHIP_COLORS.length];
    const name = feature.properties?.name || '';
    if (feature.geometry?.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach((polygon: any) => {
        polygon.forEach((ring: any) => {
          const path = ring.map((c: number[]) => [c[0], c[1]]);
          const poly = new AMap.Polygon({
            path,
            fillColor: color,
            fillOpacity: 0.08,
            strokeColor: color,
            strokeWeight: 2,
            strokeOpacity: 0.65,
            strokeStyle: 'solid',
            zIndex: 15,
            bubble: true,
          });
          poly.setExtData({ name, type: 'boundary' });
          poly.on('mouseover', (e: any) => {
            poly.setOptions({ fillOpacity: 0.16, strokeWeight: 3 });
            if (name) {
              (poly as any)._hoverInfo = new AMap.InfoWindow({
                content: `<div class="risk-map-hover-tip">${escapeHtml(name)}</div>`,
                offset: new AMap.Pixel(0, -8),
                closeWhenClickMap: true,
              });
              (poly as any)._hoverInfo.open(mapInstance, e.lnglat);
            }
          });
          poly.on('mouseout', () => {
            poly.setOptions({ fillOpacity: 0.08, strokeWeight: 2 });
            if ((poly as any)._hoverInfo) {
              (poly as any)._hoverInfo.close();
              (poly as any)._hoverInfo = null;
            }
          });
          poly.on('click', (e: any) => {
            if ((poly as any)._hoverInfo) {
              (poly as any)._hoverInfo.close();
              (poly as any)._hoverInfo = null;
            }
            const matched = (props.risks ?? []).filter((r) => {
              const area = (r.area || '').trim();
              const stripped = name.replace(/(镇|乡|街道)$/, '');
              return (
                area === name ||
                (stripped && area === stripped) ||
                area.includes(name) ||
                name.includes(area)
              );
            });
            const title = escapeHtml(name);
            const total = matched.length;
            let listHtml = '';
            matched.slice(0, 8).forEach((r) => {
              const c = RISK_LEVEL_COLOR[r.level] || '#8c8c8c';
              listHtml += `<div class="iw-risk-item"><span class="iw-risk-dot" style="background:${c}"></span><span>${escapeHtml(r.name)}</span><span style="color:${c}">（${escapeHtml(r.level || '')}）</span></div>`;
            });
            if (total > 8) listHtml += `<div class="iw-risk-more">... 还有 ${total - 8} 条</div>`;
            if (total === 0) listHtml = `<div class="iw-risk-empty">该乡镇暂无风险点数据</div>`;
            const info = new AMap.InfoWindow({
              content: `<div class="risk-map-info"><div class="iw-title">${title}</div><div class="iw-count">共 ${total} 个风险点</div><div class="iw-list">${listHtml}</div></div>`,
              offset: new AMap.Pixel(0, -10),
              closeWhenClickMap: true,
            });
            info.open(mapInstance, e.lnglat);
          });
          layerGroups.boundary.addOverlay(poly);
        });
      });
    }
  });
}

// ==================== 渲染：道路网络 ====================
function renderRoads(AMap: any) {
  if (!layerGroups.roads) return;
  layerGroups.roads.clearOverlays();
  if (!layerVisible.value.roads) return;
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
    polyline.on('click', (e: any) => {
      const mid = polyline.getPath()[Math.floor(polyline.getPath().length / 2)];
      const info = new AMap.InfoWindow({
        content: `<div class="risk-map-info"><div class="iw-title">${escapeHtml(road.name)}</div><div style="font-size:12px;color:hsl(var(--foreground) / 0.75)">${escapeHtml(road.desc)}</div></div>`,
        offset: new AMap.Pixel(0, -10),
        closeWhenClickMap: true,
      });
      info.open(mapInstance, mid || e.lnglat);
    });
    layerGroups.roads.addOverlay(polyline);
  });
}

// ==================== 渲染：公园 / 康宁湖 ====================
function renderParks(AMap: any) {
  if (!layerGroups.parks) return;
  layerGroups.parks.clearOverlays();
  if (!layerVisible.value.parks) return;
  [...parkPolygons, ...KANGNING_LAKE_POLYGONS].forEach((park) => {
    const polygon = new AMap.Polygon({
      path: park.path.map((p) => [p[0], p[1]]),
      fillColor: park.color,
      fillOpacity: 0.15,
      strokeColor: park.color,
      strokeWeight: 2.5,
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      zIndex: 20,
      bubble: true,
    });
    polygon.setExtData({ name: park.name, type: 'park' });
    polygon.on('mouseover', (e: any) => {
      const tip = new AMap.InfoWindow({
        content: `<div class="risk-map-hover-tip">${escapeHtml(park.name)}</div>`,
        offset: new AMap.Pixel(0, -8),
        closeWhenClickMap: true,
      });
      tip.open(mapInstance, e.lnglat);
      (polygon as any)._tip = tip;
    });
    polygon.on('mouseout', () => {
      (polygon as any)._tip?.close?.();
      (polygon as any)._tip = null;
    });
    layerGroups.parks.addOverlay(polygon);
  });
}

// ==================== 渲染：转运站 / 设施 ====================
function renderStations(AMap: any) {
  if (!layerGroups.stations) return;
  layerGroups.stations.clearOverlays();
  if (!layerVisible.value.stations) return;
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
      const info = new AMap.InfoWindow({
        content: `<div class="risk-map-info"><div class="iw-title">${escapeHtml(s.name)}</div><div style="font-size:12px;color:hsl(var(--foreground) / 0.75)">坐标：${s.lng.toFixed(6)}, ${s.lat.toFixed(6)}</div></div>`,
        offset: new AMap.Pixel(0, -30),
        closeWhenClickMap: true,
      });
      info.open(mapInstance, [s.lng, s.lat]);
    });
    layerGroups.stations.addOverlay(marker);
  });
}

function renderFacilities(AMap: any) {
  if (!layerGroups.facilities) return;
  layerGroups.facilities.clearOverlays();
  if (!layerVisible.value.facilities) return;
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
      const info = new AMap.InfoWindow({
        content: `<div class="risk-map-info"><div class="iw-title">${escapeHtml(f.name)}</div></div>`,
        offset: new AMap.Pixel(0, -34),
        closeWhenClickMap: true,
      });
      info.open(mapInstance, [f.lng, f.lat]);
    });
    layerGroups.facilities.addOverlay(marker);
  });
}

// ==================== 渲染：风险点标记 ====================
function renderRisks(AMap: any) {
  if (!layerGroups.risks) return;
  layerGroups.risks.clearOverlays();
  riskMarkers = [];
  markerMap.clear();
  if (!layerVisible.value.risks) return;

  const withCoords: RiskControlApi.RiskSource[] = [];
  const withoutCoords: RiskControlApi.RiskSource[] = [];
  for (const r of props.risks ?? []) {
    const has =
      r.lat != null && r.lng != null && !Number.isNaN(r.lat) && !Number.isNaN(r.lng);
    (has ? withCoords : withoutCoords).push(r);
  }

  const toRender = [...withCoords];
  for (const r of withoutCoords) {
    const fb = getFallbackCoords(r as any);
    if (fb) toRender.push({ ...r, lng: fb[0], lat: fb[1] } as RiskControlApi.RiskSource);
  }

  toRender.forEach((risk) => {
    const lat = Number(risk.lat);
    const lng = Number(risk.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const color = RISK_LEVEL_COLOR[risk.level] || '#1890ff';
    const isHighlighted = props.highlightedId != null && props.highlightedId === risk.id;
    const original = props.risks?.find((r) => r.id === risk.id);
    const isFallback = !(
      original && original.lat != null && original.lng != null &&
      !Number.isNaN(original.lat) && !Number.isNaN(original.lng)
    );

    const marker = new AMap.CircleMarker({
      center: [lng, lat],
      radius: isHighlighted ? 14 : 10,
      fillColor: color,
      strokeColor: isHighlighted ? '#1677ff' : '#ffffff',
      strokeWeight: isHighlighted ? 3 : 2,
      strokeOpacity: 1,
      fillOpacity: isHighlighted ? 1 : 0.85,
      zIndex: risk.level === '一级' ? 85 : risk.level === '二级' ? 80 : 75,
      bubble: true,
    });
    marker.setExtData({ ...risk, type: 'risk' });

    const fallbackNote = isFallback
      ? '<div style="font-size:11px;color:#fa8c16;margin-bottom:6px;padding:2px 8px;background:#fffbe6;border-radius:4px;display:inline-block;">⚠️ 坐标为近似位置（基于乡镇中心）</div>'
      : '';
    marker.on('click', () => {
      const fg = 'var(--foreground)';
      const content = `<div class="risk-map-info" style="min-width:220px">
        <div class="iw-title" style="color:${color}">${escapeHtml(risk.name)}</div>
        ${fallbackNote}
        <div class="iw-row">类型：${escapeHtml(risk.type || '-')}｜事故：${escapeHtml(risk.accidentType || '-')}</div>
        <div class="iw-row">等级：<span style="color:${color};font-weight:600">${escapeHtml(risk.level || '-')}</span></div>
        <div class="iw-row">场所：${escapeHtml(risk.location || '-')}</div>
        <div class="iw-row">区域：${escapeHtml(risk.area || '-')}</div>
        <div class="iw-row" style="color:hsl(${fg} / 0.55)">${lng.toFixed(6)}, ${lat.toFixed(6)}</div>
      </div>`;
      const info = new AMap.InfoWindow({
        content,
        offset: new AMap.Pixel(0, -22),
        closeWhenClickMap: true,
      });
      info.open(mapInstance, [lng, lat]);
      emit('marker-click', risk);
    });

    layerGroups.risks.addOverlay(marker);
    riskMarkers.push(marker);
    markerMap.set(risk.id, marker);
  });
}

function createMarkerSVG(text: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="14" r="12" fill="${color}" stroke="#fff" stroke-width="2"/>
    <text x="16" y="17" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold" font-family="sans-serif">${text}</text>
    <polygon points="12,24 20,24 16,30" fill="${color}" stroke="#fff" stroke-width="1"/>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ==================== 初始化 / 销毁 ====================
async function initMap() {
  loadError.value = '';
  boundaryError.value = '';
  if (!mapContainer.value) return;
  let AMap: any;
  try {
    AMap = await loadAmapScript();
  } catch (err: any) {
    loadError.value = err?.message || '高德地图加载失败';
    loading.value = false;
    return;
  }
  amapGlobal = AMap;
  mapInstance = new AMap.Map(mapContainer.value, {
    center: NINGJIN_CENTER,
    zoom: AMAP_ZOOM,
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

  ['boundary', 'roads', 'parks', 'stations', 'facilities', 'risks'].forEach((key) => {
    layerGroups[key] = new AMap.OverlayGroup();
    mapInstance.add(layerGroups[key]);
  });

  // 风险点标记：地图打开时若父级已传完整数据集则立即渲染；
  // 数据加载中由父级 dataLoading 驱动 NSpin，数据到达后由 risks watch 重渲染。
  renderBoundary(AMap).catch(() => {});
  renderRoads(AMap);
  renderParks(AMap);
  renderStations(AMap);
  renderFacilities(AMap);
  renderRisks(AMap);

  loading.value = false;
  setTimeout(() => mapInstance?.setFitView(null, false, [60, 60, 60, 60]), 200);
}

function destroyMap() {
  if (mapInstance) {
    mapInstance.destroy();
    mapInstance = null;
  }
  amapGlobal = null;
  riskMarkers = [];
  markerMap.clear();
}

function toggleLayer(key: string) {
  const visible = layerVisible.value[key as keyof typeof layerVisible.value];
  layerVisible.value[key as keyof typeof layerVisible.value] = !visible;
  if (!mapInstance || !amapGlobal) return;
  if (key === 'risks') {
    renderRisks(amapGlobal);
    return;
  }
  const group = layerGroups[key];
  if (!group) return;
  group.clearOverlays();
  if (!layerVisible.value[key as keyof typeof layerVisible.value]) return;
  if (key === 'boundary') renderBoundary(amapGlobal).catch(() => {});
  else if (key === 'roads') renderRoads(amapGlobal);
  else if (key === 'parks') renderParks(amapGlobal);
  else if (key === 'stations') renderStations(amapGlobal);
  else if (key === 'facilities') renderFacilities(amapGlobal);
}

function focusRisk(id: number) {
  if (!mapInstance || !amapGlobal) return;
  const marker = markerMap.get(id);
  if (!marker) return;
  const center = marker.getCenter?.() ?? marker.getPosition?.();
  if (!center) return;
  mapInstance.setCenter(center);
  mapInstance.setZoom(16);
  const risk = props.risks?.find((r) => r.id === id);
  if (risk) {
    const color = RISK_LEVEL_COLOR[risk.level] || '#1890ff';
    const info = new amapGlobal.InfoWindow({
      content: `<div class="risk-map-info" style="min-width:220px"><div class="iw-title" style="color:${color}">${escapeHtml(risk.name)}</div><div class="iw-row">等级：<span style="color:${color};font-weight:600">${escapeHtml(risk.level || '-')}</span></div></div>`,
      offset: new amapGlobal.Pixel(0, -22),
      closeWhenClickMap: true,
    });
    info.open(mapInstance, center);
  }
}

function handleClose() {
  emit('update:open', false);
}

watch(
  () => props.open,
  async (val) => {
    if (val) {
      loading.value = true;
      await nextTick();
      await initMap();
    } else {
      destroyMap();
    }
  },
);

watch(
  () => props.risks,
  () => {
    if (props.open && mapInstance && amapGlobal) {
      renderRisks(amapGlobal);
    }
  },
  { deep: true },
);

watch(
  () => props.highlightedId,
  (val) => {
    if (props.open && mapInstance && amapGlobal) {
      if (val != null) {
        focusRisk(val);
      } else {
        renderRisks(amapGlobal);
      }
    }
  },
);

onBeforeUnmount(() => {
  destroyMap();
});
</script>

<template>
  <NDrawer :show="props.open" :width="860" placement="right" @update:show="handleClose">
    <NDrawerContent title="风险地图" :native-scrollbar="true">
      <NSpin :show="loading || props.dataLoading" description="地图加载中...">
        <div class="risk-map-wrapper">
          <NAlert
            v-if="loadError"
            type="warning"
            :show-icon="true"
            class="mb-3"
            title="地图加载失败"
          >
            {{ loadError }}。请检查网络后重试，或前往 web-antd 版查看地图能力。
          </NAlert>

          <NAlert
            v-if="props.dataError"
            type="warning"
            :show-icon="true"
            class="mb-3"
            title="风险数据加载失败"
          >
            {{ props.dataError }}。请刷新后重试。
          </NAlert>

          <NAlert
            v-if="boundaryError && !loadError"
            type="info"
            :show-icon="true"
            class="mb-3"
            title="边界数据不可用"
          >
            {{ boundaryError }}
          </NAlert>

          <div v-show="!loadError" ref="mapContainer" class="risk-map-container"></div>

          <!-- 图层控制 -->
          <div v-if="!loadError" class="risk-map-controls">
            <div class="control-title">图层控制</div>
            <div class="control-item">
              <div class="control-label">
                <span class="control-dot control-dot-rainbow"></span>
                <span>乡镇边界（12乡镇）</span>
              </div>
              <NSwitch
                size="small"
                :value="layerVisible.boundary"
                @update:value="() => toggleLayer('boundary')"
              />
            </div>
            <div class="control-item">
              <div class="control-label">
                <span class="control-dot" style="background: #22C55E"></span>
                <span>道路网络</span>
              </div>
              <NSwitch
                size="small"
                :value="layerVisible.roads"
                @update:value="() => toggleLayer('roads')"
              />
            </div>
            <div class="control-item">
              <div class="control-label">
                <span class="control-dot" style="background: #52c41a"></span>
                <span>公园 / 康宁湖</span>
              </div>
              <NSwitch
                size="small"
                :value="layerVisible.parks"
                @update:value="() => toggleLayer('parks')"
              />
            </div>
            <div class="control-item">
              <div class="control-label">
                <span class="control-dot" style="background: #1677ff"></span>
                <span>转运站</span>
              </div>
              <NSwitch
                size="small"
                :value="layerVisible.stations"
                @update:value="() => toggleLayer('stations')"
              />
            </div>
            <div class="control-item">
              <div class="control-label">
                <span class="control-dot" style="background: #722ed1"></span>
                <span>自有设施</span>
              </div>
              <NSwitch
                size="small"
                :value="layerVisible.facilities"
                @update:value="() => toggleLayer('facilities')"
              />
            </div>
            <div class="control-item">
              <div class="control-label">
                <span class="control-dot" style="background: #f5222d"></span>
                <span>风险点</span>
              </div>
              <NSwitch
                size="small"
                :value="layerVisible.risks"
                @update:value="() => toggleLayer('risks')"
              />
            </div>
          </div>

          <!-- 风险等级图例 -->
          <div v-if="!loadError" class="risk-map-legend">
            <div class="legend-title">风险等级</div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #f5222d"></span>
              <span>一级（重大）</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #fa8c16"></span>
              <span>二级（较大）</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #faad14"></span>
              <span>三级（一般）</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot" style="background: #52c41a"></span>
              <span>四级（低）</span>
            </div>
            <div class="legend-title legend-title-sub">道路等级</div>
            <div
              v-for="r in ROAD_LEGEND"
              :key="r.cls"
              class="legend-item"
            >
              <span class="legend-line" :style="{ background: r.color }"></span>
              <span>{{ r.label }}</span>
            </div>
          </div>

          <!-- 无数据提示 -->
          <div
            v-if="!loadError && !loading && !props.dataLoading && (props.risks?.length ?? 0) === 0"
            class="risk-map-empty"
          >
            <NEmpty description="暂无风险点数据" />
          </div>
        </div>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.risk-map-wrapper {
  position: relative;
  width: 100%;
  height: calc(100vh - 120px);
  min-height: 480px;
  overflow: hidden;
  border-radius: 8px;
}

.risk-map-container {
  width: 100%;
  height: 100%;
  background: hsl(var(--muted));
}

.risk-map-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1000;
  min-width: 190px;
  padding: 12px 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
}

.control-title {
  font-weight: 600;
  font-size: 13px;
  color: hsl(var(--foreground));
  margin-bottom: 10px;
}

.control-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.control-item:last-child {
  margin-bottom: 0;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: hsl(var(--foreground) / 0.85);
}

.control-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid hsl(var(--border));
}

.control-dot-rainbow {
  background: conic-gradient(
    #E8590C, #099268, #92400E, #16A34A, #0EA5E9, #3B82F6,
    #0D9488, #CA8A04, #DC2626, #84CC16, #EC4899, #9333EA, #E8590C
  );
}

.risk-map-legend {
  position: absolute;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  padding: 12px 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
}

.legend-title {
  font-weight: 600;
  font-size: 13px;
  color: hsl(var(--foreground));
  margin-bottom: 8px;
}

.legend-title-sub {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed hsl(var(--border));
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: hsl(var(--foreground) / 0.75);
  margin-bottom: 4px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 2px rgb(0 0 0 / 30%);
}

.legend-line {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}

.risk-map-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  padding: 24px;
  background: hsl(var(--card));
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
}
</style>

<!-- InfoWindow / tooltip 内容样式（非 scoped：渲染在地图容器 DOM 之外） -->
<style>
.risk-map-hover-tip {
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

.risk-map-info {
  min-width: 200px;
  max-width: 300px;
  padding: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: hsl(var(--foreground));
}

.risk-map-info .iw-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  color: hsl(var(--foreground));
}

.risk-map-info .iw-count {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: hsl(var(--foreground));
}

.risk-map-info .iw-list {
  max-height: 260px;
  overflow-y: auto;
}

.risk-map-info .iw-risk-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 12px;
}

.risk-map-info .iw-risk-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.risk-map-info .iw-risk-more,
.risk-map-info .iw-risk-empty {
  padding: 4px 0 0 14px;
  color: hsl(var(--foreground) / 0.55);
  font-size: 12px;
}

.risk-map-info .iw-row {
  font-size: 12px;
  color: hsl(var(--foreground) / 0.75);
  margin-bottom: 2px;
}

.amap-info-window-close,
.amap-info-close {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
</style>
