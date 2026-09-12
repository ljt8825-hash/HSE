<script lang="ts" setup>
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { Drawer, Empty, Spin, Switch, Divider, Tag } from 'ant-design-vue';

import type { RiskControlApi } from '#/api/hse/risk-control';
import {
  NINGJIN_CENTER,
  NINGJIN_ZOOM,
  getFallbackCoords,
} from '#/components/hse/risk-map-data';

import { IconifyIcon } from '@vben/icons';

interface Props {
  open: boolean;
  risks: RiskControlApi.RiskSource[];
  highlightedId?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  highlightedId: null,
});
const emit = defineEmits<{
  'update:open': [value: boolean];
  'marker-click': [risk: RiskControlApi.RiskSource];
}>();

const mapContainer = ref<HTMLElement | null>(null);
const mapWrapperRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const isPinned = ref(false);
const isFullscreen = ref(false);
let mapInstance: any = null;
let markerLayer: any = null;
let countyLayer: any = null;
const markerMap = new Map<number, any>();
const countyGeoJson = ref<any>(null);
const countyLoading = ref(false);

// 图层开关状态
const layerVisible = reactive({
  boundary: true, // 乡镇边界默认显示（基于真实 GeoJSON）
});

// 底图类型
const useAmapTiles = ref(true);

/** 12个乡镇/街道的区分颜色（功能色，用于视觉区分各乡镇边界） */
const TOWNSHIP_COLORS = [
  '#E8590C', // 刘营伍乡 - 橙红
  '#099268', // 张大庄镇 - 深绿
  '#92400E', // 柴胡店镇 - 棕
  '#16A34A', // 大曹镇 - 绿
  '#0EA5E9', // 保店镇 - 天蓝
  '#3B82F6', // 长官镇 - 蓝
  '#0D9488', // 大柳镇 - 青绿
  '#CA8A04', // 时集镇 - 金黄
  '#DC2626', // 杜集镇 - 红
  '#84CC16', // 相衙镇 - 黄绿
  '#EC4899', // 宁城街道 - 粉
  '#9333EA', // 津城街道 - 深紫
];

const levelColorMap: Record<string, string> = {
  一级: '#f5222d',
  二级: '#fa8c16',
  三级: '#faad14',
  四级: '#52c41a',
};

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 加载宁津县边界 GeoJSON */
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

async function initMap() {
  loading.value = true;
  try {
    const L = (await import('leaflet')).default;
    await import('leaflet/dist/leaflet.css');

    await nextTick();
    if (!mapContainer.value) return;

    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }

    mapInstance = L.map(mapContainer.value, {
      center: NINGJIN_CENTER,
      zoom: NINGJIN_ZOOM,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
      maxZoom: 18,
      minZoom: 8,
    });

    // 底图：优先高德瓦片，失败时 fallback 到 OSM
    const amapLayer = L.tileLayer(
      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      {
        subdomains: '1234',
        maxZoom: 18,
        attribution: '&copy; 高德地图',
      },
    );

    const osmLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
      },
    );

    // 尝试加载高德瓦片，如果 tileerror 则切换到 OSM
    amapLayer.on('tileerror', () => {
      if (useAmapTiles.value && mapInstance) {
        console.warn('[RiskMapDrawer] 高德瓦片加载失败，切换到 OSM 底图');
        useAmapTiles.value = false;
        mapInstance.removeLayer(amapLayer);
        osmLayer.addTo(mapInstance);
      }
    });

    amapLayer.addTo(mapInstance);

    // 创建图层组
    countyLayer = L.layerGroup().addTo(mapInstance);
    markerLayer = L.layerGroup().addTo(mapInstance);

    // 渲染行政边界和标记
    renderCountyBoundary(L);
    renderMarkers(L);
    loading.value = false;

    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 300);
  } catch (err) {
    console.error('[RiskMapDrawer] 地图初始化失败:', err);
    loading.value = false;
  }
}

/** 渲染乡镇边界（通过 L.geoJSON 加载真实 GeoJSON，12个乡镇 MultiPolygon） */
async function renderCountyBoundary(L: any) {
  if (!countyLayer || !mapInstance) return;
  countyLayer.clearLayers();

  if (!layerVisible.boundary) return;

  const geoJson = await loadCountyGeoJson();
  if (!geoJson) return;

  const features: any[] = geoJson.features || [];

  // 计算所有要素的边界以便自动适配视野
  const allBounds = L.latLngBounds([]);

  features.forEach((feature: any, index: number) => {
    const townColor = TOWNSHIP_COLORS[index % TOWNSHIP_COLORS.length];

    const geoJsonLayer = L.geoJSON(feature, {
      style: {
        color: townColor,
        weight: 2,
        opacity: 0.95,
        fillColor: townColor,
        fillOpacity: 0.2,
        dashArray: null,
        lineJoin: 'round',
        lineCap: 'round',
      },
      onEachFeature: (f: any, layer: any) => {
        const p = f.properties || {};
        const popupHtml = `
          <div style="min-width: 220px;">
            <div style="font-weight: 600; font-size: 15px; margin-bottom: 8px; color: ${townColor}; border-bottom: 2px solid ${townColor}; padding-bottom: 6px;">
              ${p.name || '宁津县'}
            </div>
            <div style="font-size: 12px; color: hsl(var(--foreground) / 0.75); margin-bottom: 4px;">
              <span style="display: inline-block; width: 80px; color: hsl(var(--foreground) / 0.55);">所属区县：</span>山东省 德州市 宁津县
            </div>
            <div style="font-size: 12px; color: hsl(var(--foreground) / 0.75); margin-bottom: 4px;">
              <span style="display: inline-block; width: 80px; color: hsl(var(--foreground) / 0.55);">县行政代码：</span>371422
            </div>
            <div style="font-size: 12px; color: hsl(var(--foreground) / 0.75); margin-bottom: 4px;">
              <span style="display: inline-block; width: 80px; color: hsl(var(--foreground) / 0.55);">乡镇编号：</span>${p.id || '-'}
            </div>
            <div style="font-size: 12px; color: hsl(var(--foreground) / 0.75);">
              <span style="display: inline-block; width: 80px; color: hsl(var(--foreground) / 0.55);">数据来源：</span>${p.site || '-'}
            </div>
          </div>
        `;
        layer.bindPopup(popupHtml);

        // 悬停显示乡镇名 tooltip
        if (p.name) {
          layer.bindTooltip(p.name, {
            sticky: true,
            className: 'township-tooltip',
          });
        }

        const defaultStyle = {
          weight: 2,
          opacity: 0.95,
          fillOpacity: 0.2,
        };
        layer.on('mouseover', (e: any) => {
          e.target.setStyle({
            weight: 4,
            opacity: 1,
            fillOpacity: 0.2,
          });
        });
        layer.on('mouseout', (e: any) => {
          e.target.setStyle(defaultStyle);
        });
      },
    });

    geoJsonLayer.addTo(countyLayer);
    if (geoJsonLayer.getBounds().isValid()) {
      allBounds.extend(geoJsonLayer.getBounds());
    }
  });

  // 自动适配到全部乡镇边界
  if (allBounds.isValid()) {
    mapInstance.fitBounds(allBounds, { padding: [40, 40] });
  }
}

/** 渲染风险点标记 */
function renderMarkers(L: any) {
  if (!markerLayer || !mapInstance) return;
  markerLayer.clearLayers();
  markerMap.clear();

  // 分离有坐标和无坐标的记录
  const withCoords: typeof props.risks = [];
  const withoutCoords: typeof props.risks = [];

  for (const r of props.risks) {
    const hasCoord =
      r.lat != null &&
      r.lng != null &&
      !Number.isNaN(r.lat) &&
      !Number.isNaN(r.lng);
    if (hasCoord) {
      withCoords.push(r);
    } else {
      withoutCoords.push(r);
    }
  }

  // 有精确坐标的 → 直接用
  const allToRender = [...withCoords];

  // 无坐标的 → 用回退坐标（乡镇中心 + ID 偏移）
  for (const r of withoutCoords) {
    const fb = getFallbackCoords(r);
    if (fb) {
      // 创建一个带有回退坐标的副本用于渲染（不修改原始数据）
      allToRender.push({ ...r, lng: fb[0], lat: fb[1] } as any);
    }
  }

  if (allToRender.length === 0) return;

  const bounds: [number, number][] = [];

  allToRender.forEach((risk) => {
    const color = levelColorMap[risk.level] || '#1890ff';
    const lat = risk.lat as number;
    const lng = risk.lng as number;
    const isHighlighted = props.highlightedId === risk.id;
    // 是否使用了回退坐标（原始数据无 GPS 坐标）
    const originalRisk = props.risks.find((r) => r.id === risk.id);
    const isFallback = !(
      originalRisk && originalRisk.lat != null && originalRisk.lng != null &&
      !Number.isNaN(originalRisk.lat) && !Number.isNaN(originalRisk.lng)
    );

    const marker = L.circleMarker([lat, lng], {
      radius: isHighlighted ? 14 : 10,
      fillColor: color,
      color: isHighlighted ? '#1890ff' : '#fff',
      weight: isHighlighted ? 3 : 2,
      opacity: 1,
      fillOpacity: isHighlighted ? 1 : 0.8,
    });

    const fg = getCssVar('--foreground') || '#333';
    const popupHtml = `
      <div class="risk-popup" style="min-width: 220px; color: hsl(${fg});">
        <div class="risk-popup-title" style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: hsl(${fg});">${risk.name}</div>
        ${isFallback ? '<div style="font-size:11px;color:#faad14;margin-bottom:6px;padding:2px 8px;background:#fffbe6;border-radius:4px;display:inline-block;">⚠️ 坐标为近似位置（基于乡镇中心）</div>' : ''}
        <div class="risk-popup-tags" style="margin-bottom: 10px;">
          <span style="display: inline-block; padding: 1px 10px; border-radius: 10px; font-size: 12px; color: #fff; background: ${color}; margin-right: 6px;">${risk.level}风险</span>
          <span style="display: inline-block; padding: 1px 10px; border-radius: 10px; font-size: 12px; color: #fff; background: #1890ff;">${risk.status}</span>
        </div>
        <div class="risk-popup-row" style="font-size: 12px; color: hsl(${fg} / 0.75); margin-bottom: 4px;">类型：${risk.type || '-'}</div>
        <div class="risk-popup-row" style="font-size: 12px; color: hsl(${fg} / 0.75); margin-bottom: 4px;">位置：${risk.location || '-'}</div>
        <div class="risk-popup-row" style="font-size: 12px; color: hsl(${fg} / 0.75);">区域：${risk.area || '-'}</div>
      </div>
    `;
    marker.bindPopup(popupHtml);
    marker.on('click', () => {
      emit('marker-click', risk);
    });
    marker.addTo(markerLayer);
    markerMap.set(risk.id, marker);
    bounds.push([lat, lng]);
  });

  // 自动适配视野（包含标记点）
  if (bounds.length > 0 && !props.highlightedId) {
    if (bounds.length === 1) {
      mapInstance.setView(bounds[0], 15);
    } else {
      mapInstance.fitBounds(bounds, { padding: [50, 50] });
    }
  }
}

/** 切换乡镇边界图层 */
async function toggleBoundaryLayer(checked: any) {
  layerVisible.boundary = checked;
  if (mapInstance) {
    const L = (await import('leaflet')).default;
    renderCountyBoundary(L);
  }
}

/** 切换地图固定状态 */
function togglePin() {
  isPinned.value = !isPinned.value;
}

/** 切换全屏显示 */
function toggleFullscreen() {
  if (!mapWrapperRef.value) return;

  if (!document.fullscreenElement) {
    mapWrapperRef.value.requestFullscreen?.().then(() => {
      isFullscreen.value = true;
      setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize();
      }, 200);
    }).catch((err) => {
      console.error('[RiskMapDrawer] 进入全屏失败:', err);
    });
  } else {
    document.exitFullscreen?.().then(() => {
      isFullscreen.value = false;
      setTimeout(() => {
        if (mapInstance) mapInstance.invalidateSize();
      }, 200);
    }).catch((err) => {
      console.error('[RiskMapDrawer] 退出全屏失败:', err);
    });
  }
}

/** 监听全屏状态变化，同步 isFullscreen */
function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
  if (mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 150);
  }
}

function destroyMap() {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  markerLayer = null;
  countyLayer = null;
  markerMap.clear();
}

watch(
  () => props.open,
  async (val) => {
    if (val) {
      await nextTick();
      await initMap();
      document.addEventListener('fullscreenchange', handleFullscreenChange);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      isPinned.value = false;
      isFullscreen.value = false;
      destroyMap();
    }
  },
);

watch(
  () => props.risks,
  async () => {
    if (props.open && mapInstance) {
      const L = (await import('leaflet')).default;
      renderMarkers(L);
    }
  },
  { deep: true },
);

watch(
  () => props.highlightedId,
  async (val) => {
    if (!props.open || !mapInstance || val == null) return;
    const marker = markerMap.get(val);
    if (marker) {
      const L = (await import('leaflet')).default;
      renderMarkers(L);
      marker.openPopup();
      mapInstance.panTo(marker.getLatLng(), { animate: true, duration: 0.5 });
    }
  },
);

onBeforeUnmount(() => {
  destroyMap();
});
</script>

<template>
  <Drawer
    :open="open"
    placement="right"
    width="70%"
    :body-style="{ padding: '0', height: '100%', overflow: 'hidden' }"
    :destroy-on-close="true"
    :closable="!isPinned"
    :mask-closable="!isPinned"
    @close="emit('update:open', false)"
  >
    <template #title>
      <div class="map-drawer-title">
        <span>风险地图</span>
        <div class="map-drawer-actions">
          <button
            class="map-action-btn"
            :class="{ 'map-action-btn--active': isPinned }"
            :title="isPinned ? '取消固定' : '固定地图'"
            @click.stop="togglePin"
          >
            <IconifyIcon :icon="isPinned ? 'lucide:pin-off' : 'lucide:pin'" />
          </button>
          <button
            class="map-action-btn"
            :class="{ 'map-action-btn--active': isFullscreen }"
            :title="isFullscreen ? '退出全屏' : '全屏显示'"
            @click.stop="toggleFullscreen"
          >
            <IconifyIcon :icon="isFullscreen ? 'lucide:minimize' : 'lucide:maximize'" />
          </button>
        </div>
      </div>
    </template>
    <Spin :spinning="loading" tip="地图加载中..." wrapper-class-name="risk-map-spin">
      <div ref="mapWrapperRef" class="risk-map-wrapper">
        <!-- 地图容器 -->
        <div ref="mapContainer" class="risk-map-container"></div>

        <!-- 图层控制面板 -->
        <div class="risk-map-controls">
          <div class="control-title">图层控制</div>
          <div class="control-item">
            <div class="control-label">
              <span class="control-dot control-dot-rainbow"></span>
              <span>乡镇边界（12乡镇）</span>
            </div>
            <Switch
              :checked="layerVisible.boundary"
              size="small"
              @change="toggleBoundaryLayer"
            />
          </div>
          <Divider style="margin: 8px 0" />
          <div class="control-title">底图</div>
          <div class="control-item">
            <div class="control-label">
              <span class="control-dot" :style="{ background: useAmapTiles ? '#0066ff' : '#94A3B8' }"></span>
              <span>{{ useAmapTiles ? '高德地图' : 'OSM（备用）' }}</span>
            </div>
            <Tag :color="useAmapTiles ? 'blue' : 'default'" style="margin: 0; font-size: 11px;">
              {{ useAmapTiles ? '高德' : 'OSM' }}
            </Tag>
          </div>
        </div>

        <!-- 风险等级图例 -->
        <div class="risk-map-legend risk-legend">
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
        </div>

        <!-- 无数据提示（有回退坐标后仅当无任何记录时显示） -->
        <div
          v-if="!loading && risks.length === 0"
          class="risk-map-empty"
        >
          <Empty description="暂无风险点数据" />
        </div>
      </div>
    </Spin>
  </Drawer>
</template>

<style lang="scss" scoped>
.map-drawer-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .map-drawer-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.map-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  color: hsl(var(--foreground) / 0.7);
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    color: hsl(var(--primary));
    border-color: hsl(var(--primary) / 0.5);
    background: hsl(var(--primary) / 0.06);
  }

  &--active {
    color: hsl(var(--primary));
    border-color: hsl(var(--primary) / 0.5);
    background: hsl(var(--primary) / 0.1);
  }
}

.risk-map-wrapper {
  position: relative;
  width: 100%;
  height: calc(100vh - 55px);
  overflow: hidden;

  &:fullscreen {
    width: 100vw;
    height: 100vh;
    background: hsl(var(--muted));
  }
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
  min-width: 180px;
  padding: 12px 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);

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

    &:last-child {
      margin-bottom: 0;
    }
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

  // 多色渐变圆点：代表12个乡镇的多色边界
  .control-dot-rainbow {
    background: conic-gradient(
      #E8590C, #099268, #92400E, #16A34A, #0EA5E9, #3B82F6,
      #0D9488, #CA8A04, #DC2626, #84CC16, #EC4899, #9333EA, #E8590C
    );
  }
}

.risk-map-legend {
  position: absolute;
  z-index: 1000;
  padding: 12px 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);

  .legend-title {
    font-weight: 600;
    font-size: 13px;
    color: hsl(var(--foreground));
    margin-bottom: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: hsl(var(--foreground) / 0.75);
    margin-bottom: 4px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .legend-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 2px rgb(0 0 0 / 30%);
  }
}

.risk-legend {
  bottom: 16px;
  right: 16px;
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

<style lang="scss">
.leaflet-popup-content-wrapper {
  border-radius: 8px;
  box-shadow: 0 2px 12px rgb(0 0 0 / 15%);
  background: hsl(var(--card));
  color: hsl(var(--foreground));
}

.leaflet-popup-tip {
  background: hsl(var(--card));
}

.leaflet-popup-content {
  margin: 10px 14px;
  line-height: 1.5;
}

.risk-map-spin {
  height: 100%;

  .ant-spin-container {
    height: 100%;
  }
}

.risk-popup {
  font-family: inherit;
}

// 乡镇边界悬停 tooltip 样式
.township-tooltip {
  padding: 4px 10px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 15%);
  font-size: 12px;
  font-weight: 600;
}
</style>
