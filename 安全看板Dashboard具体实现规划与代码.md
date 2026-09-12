# 安全看板（Dashboard）具体实现规划与代码

> 本文档基于 Feature-Sliced Design 架构，提供安全看板模块的完整实现。涵盖目录结构、页面组件、业务组件、Composables、权限集成、ECharts 图表配置及性能优化。所有代码与已有的 Pinia Store、TanStack Query、API 层、路由权限系统完全兼容。

---

## 目录

- [一、目录结构](#一目录结构)
- [二、API 层接口定义](#二api-层接口定义)
- [三、Composables — 数据层封装](#三composables--数据层封装)
- [四、关键业务组件](#四关键业务组件)
- [五、DashboardView.vue — 页面组装](#五dashboardviewvue--页面组装)
- [六、权限与角色隔离](#六权限与角色隔离)
- [七、性能与安全优化](#七性能与安全优化)
- [八、实施步骤与验证](#八实施步骤与验证)

---

## 一、目录结构

```
src/features/dashboard/
├── index.ts                    # 模块统一导出
├── components/
│   ├── StatCard.vue            # 指标统计卡片
│   ├── TrendChart.vue          # 趋势折线图（ECharts）
│   ├── FilterBar.vue           # 筛选栏（时间范围、维度）
│   ├── AlertList.vue           # 实时告警列表
│   ├── StatGrid.vue            # 指标卡片网格容器
│   └── DataExportPanel.vue     # 数据导出面板（历史数据导出）
├── views/
│   └── DashboardView.vue       # 看板主页面
└── composables/
    └── useDashboardData.ts     # 看板数据 Composable（TanStack Query）

src/api/modules/dashboard.ts    # 看板 API 接口（若未创建）
src/types/dashboard.ts          # 看板类型定义（若未创建）
```

---

## 二、API 层接口定义

### 2.1 类型定义

```typescript
// src/types/dashboard.ts

/**
 * 安全指标项（对应后端 safety_stats 表聚合结果）
 */
export interface SafetyMetric {
  key: string                    // 指标编码（如 accident_count、training_rate）
  name: string                   // 指标名称
  value: number                  // 当前值
  unit?: string                  // 单位（如 %、次、人）
  changeRate?: number            // 环比变化率（%）
  changeType: 'up' | 'down' | 'flat'  // 变化方向（用于 UI 颜色标识）
  period: string                 // 统计周期（如 2025-06）
}

/**
 * 趋势数据点（对应后端 safety_trends 表）
 */
export interface TrendDataPoint {
  date: string                   // 日期（YYYY-MM-DD）
  value: number
  targetValue?: number           // 目标值（对标线）
}

/**
 * 趋势图表数据
 */
export interface TrendChartData {
  metricKey: string
  metricName: string
  unit?: string
  data: TrendDataPoint[]
}

/**
 * 告警项（对应后端 safety_alerts 表）
 */
export interface SafetyAlert {
  id: number
  level: 'critical' | 'warning' | 'info'  // 告警级别
  title: string
  description: string
  source: string                  // 告警来源（如 车间A、设备B）
  occurredAt: string              // 发生时间
  status: 'new' | 'processing' | 'resolved'
  handler?: string                // 处理人
}

/**
 * 历史数据查询参数
 */
export interface HistoryQueryParams {
  startDate: string              // YYYY-MM-DD
  endDate: string
  metrics: string[]              // 指标编码列表
  dimension?: 'day' | 'week' | 'month' | 'year'  // 聚合维度
  departmentId?: number          // 部门筛选（权限隔离）
}

/**
 * 历史数据查询结果
 */
export interface HistoryDataResult {
  metrics: Array<{
    key: string
    name: string
    unit?: string
    data: Array<{ date: string; value: number }>
  }>
  summary: {
    totalRecords: number
    periodStart: string
    periodEnd: string
  }
}

/**
 * 同比环比结果
 */
export interface CompareResult {
  current: number                // 本期值
  previous: number               // 上期值（环比）/ 去年同期（同比）
  changeValue: number            // 变化量
  changeRate: number             // 变化率（%）
}
```

### 2.2 API 模块

```typescript
// src/api/modules/dashboard.ts

import { get, post } from '@/api/client'
import type {
  ApiResponse,
  PageQuery,
  PageResult,
  RequestOptions,
} from '@/types/api'
import type {
  SafetyMetric,
  TrendChartData,
  SafetyAlert,
  HistoryQueryParams,
  HistoryDataResult,
  CompareResult,
} from '@/types/dashboard'

const BASE_URL = '/dashboard'

/**
 * 获取安全指标汇总
 */
export function getSafetyMetrics(
  params?: { departmentId?: number; period?: string },
  options?: RequestOptions
): Promise<ApiResponse<SafetyMetric[]>> {
  return get<SafetyMetric[]>(`${BASE_URL}/metrics`, params, options)
}

/**
 * 获取趋势图表数据
 */
export function getTrendData(
  params: { metricKey: string; startDate: string; endDate: string; dimension?: string },
  options?: RequestOptions
): Promise<ApiResponse<TrendChartData>> {
  return get<TrendChartData>(`${BASE_URL}/trends`, params, options)
}

/**
 * 获取实时告警列表
 */
export function getAlertList(
  params?: PageQuery & { level?: string; status?: string },
  options?: RequestOptions
): Promise<ApiResponse<PageResult<SafetyAlert>>> {
  return get<PageResult<SafetyAlert>>(`${BASE_URL}/alerts`, params, options)
}

/**
 * 获取历史数据（支持导出）
 */
export function getHistoryData(
  params: HistoryQueryParams,
  options?: RequestOptions
): Promise<ApiResponse<HistoryDataResult>> {
  return get<HistoryDataResult>(`${BASE_URL}/history`, params, options)
}

/**
 * 获取同比/环比数据
 */
export function getCompareData(
  params: { metricKey: string; type: 'yoy' | 'mom'; periods: number },
  options?: RequestOptions
): Promise<ApiResponse<CompareResult>> {
  return get<CompareResult>(`${BASE_URL}/compare`, params, options)
}

/**
 * 导出历史数据（返回下载链接）
 */
export function exportHistoryData(
  params: HistoryQueryParams,
  options?: RequestOptions
): Promise<ApiResponse<{ downloadUrl: string; filename: string }>> {
  return post<{ downloadUrl: string; filename: string }>(
    `${BASE_URL}/history/export`,
    params,
    options
  )
}

/**
 * 标记告警已处理
 */
export function resolveAlert(
  id: number,
  options?: RequestOptions
): Promise<ApiResponse<null>> {
  return post<null>(`${BASE_URL}/alerts/${id}/resolve`, {}, options)
}
```

---

## 三、Composables — 数据层封装

```typescript
// src/features/dashboard/composables/useDashboardData.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, type Ref } from 'vue'
import {
  getSafetyMetrics,
  getTrendData,
  getAlertList,
  getHistoryData,
  getCompareData,
  exportHistoryData,
  resolveAlert,
} from '@/api/modules/dashboard'
import { queryKeys } from '@/api/keys'
import type {
  HistoryQueryParams,
  SafetyAlert,
  SafetyMetric,
  TrendChartData,
} from '@/types/dashboard'
import type { PageQuery } from '@/types/api'

// ==================== 指标数据 ====================

/**
 * 安全指标查询
 * @param departmentId — 部门 ID（权限隔离）
 */
export function useSafetyMetrics(departmentId?: Ref<number | undefined>) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.dashboard.metrics(departmentId?.value)
    ),
    queryFn: () =>
      getSafetyMetrics({
        departmentId: departmentId?.value,
      }),
    select: (res) => res.data,
    // 指标数据变化较频繁，30 秒刷新
    refetchInterval: 30_000,
  })
}

// ==================== 趋势图表 ====================

/**
 * 趋势图表数据查询
 * @param metricKey — 指标编码
 * @param dateRange — 时间范围 [startDate, endDate]
 * @param dimension — 聚合维度
 */
export function useTrendData(
  metricKey: Ref<string>,
  dateRange: Ref<[string, string]>,
  dimension: Ref<'day' | 'week' | 'month'>
) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.dashboard.trend(metricKey.value, dateRange.value, dimension.value)
    ),
    queryFn: () =>
      getTrendData({
        metricKey: metricKey.value,
        startDate: dateRange.value[0],
        endDate: dateRange.value[1],
        dimension: dimension.value,
      }),
    select: (res) => res.data,
    // 趋势图数据相对稳定，5 分钟缓存
    staleTime: 5 * 60 * 1000,
  })
}

// ==================== 告警列表 ====================

/**
 * 实时告警列表查询（分页）
 */
export function useAlertList(
  params: Ref<PageQuery & { level?: string; status?: string }>
) {
  return useQuery({
    queryKey: computed(() => queryKeys.dashboard.alerts(params.value)),
    queryFn: () => getAlertList(params.value),
    select: (res) => res.data,
    // 告警数据实时性要求高，15 秒刷新
    refetchInterval: 15_000,
  })
}

/**
 * 处理告警 Mutation
 */
export function useResolveAlert() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => resolveAlert(id),
    onSuccess: () => {
      // 处理后刷新告警列表
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.alertsBase() })
    },
  })
}

// ==================== 历史数据查询 ====================

/**
 * 历史数据查询（支持导出）
 */
export function useHistoryData(params: Ref<HistoryQueryParams>) {
  // 使用 enabled 控制是否自动请求（手动触发）
  const enabled = ref(false)

  const query = useQuery({
    queryKey: computed(() => queryKeys.dashboard.history(params.value)),
    queryFn: () => getHistoryData(params.value),
    select: (res) => res.data,
    enabled: computed(() => enabled.value),
    // 历史数据查询结果缓存 10 分钟
    staleTime: 10 * 60 * 1000,
  })

  function execute() {
    enabled.value = true
  }

  return {
    ...query,
    execute,
  }
}

/**
 * 导出历史数据 Mutation
 */
export function useExportHistory() {
  return useMutation({
    mutationFn: (params: HistoryQueryParams) => exportHistoryData(params),
  })
}

// ==================== 同比环比 ====================

/**
 * 同比/环比数据查询
 */
export function useCompareData(
  metricKey: Ref<string>,
  type: Ref<'yoy' | 'mom'>,
  periods: Ref<number>
) {
  return useQuery({
    queryKey: computed(() =>
      queryKeys.dashboard.compare(metricKey.value, type.value, periods.value)
    ),
    queryFn: () =>
      getCompareData({
        metricKey: metricKey.value,
        type: type.value,
        periods: periods.value,
      }),
    select: (res) => res.data,
  })
}
```

### 3.1 Query Keys 补充

```typescript
// src/api/keys.ts — 补充 dashboard 相关 keys

export const queryKeys = {
  // ... 其他模块 keys

  dashboard: {
    all: ['dashboard'] as const,
    metrics: (deptId?: number) =>
      [...queryKeys.dashboard.all, 'metrics', deptId] as const,
    trend: (key: string, range: [string, string], dim: string) =>
      [...queryKeys.dashboard.all, 'trend', key, range, dim] as const,
    alertsBase: () => [...queryKeys.dashboard.all, 'alerts'] as const,
    alerts: (params: Record<string, unknown>) =>
      [...queryKeys.dashboard.alertsBase(), params] as const,
    history: (params: HistoryQueryParams) =>
      [...queryKeys.dashboard.all, 'history', params] as const,
    compare: (key: string, type: string, periods: number) =>
      [...queryKeys.dashboard.all, 'compare', key, type, periods] as const,
  },
} as const
```

---

## 四、关键业务组件

### 4.1 `StatCard.vue` — 指标统计卡片

```vue
<!-- src/features/dashboard/components/StatCard.vue -->

<template>
  <div class="stat-card" :class="[`level-${level}`, { clickable }]">
    <div class="stat-header">
      <span class="stat-name">{{ name }}</span>
      <el-tag v-if="tag" :type="tagType" size="small">{{ tag }}</el-tag>
    </div>

    <div class="stat-value">
      <span class="value-number">{{ formattedValue }}</span>
      <span v-if="unit" class="value-unit">{{ unit }}</span>
    </div>

    <div v-if="changeRate !== undefined" class="stat-change" :class="changeClass">
      <el-icon>
        <ArrowUp v-if="changeType === 'up'" />
        <ArrowDown v-else-if="changeType === 'down'" />
        <Minus v-else />
      </el-icon>
      <span>{{ Math.abs(changeRate).toFixed(1) }}%</span>
      <span class="change-label">环比</span>
    </div>

    <div v-if="trendSparkline.length > 0" class="stat-sparkline">
      <!-- 使用 ECharts 绘制迷你趋势图 -->
      <div ref="sparklineRef" class="sparkline-chart"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { ArrowUp, ArrowDown, Minus } from '@element-plus/icons-vue'
import * as echarts from 'echarts'

interface Props {
  name: string                  // 指标名称
  value: number                 // 当前值
  unit?: string                 // 单位
  changeRate?: number           // 变化率
  changeType?: 'up' | 'down' | 'flat'
  level?: 'normal' | 'warning' | 'danger'  // 指标健康级别
  tag?: string                  // 标签文本
  tagType?: 'success' | 'warning' | 'danger' | 'info'
  clickable?: boolean           // 是否可点击
  trendSparkline?: number[]     // 迷你趋势数据
}

const props = withDefaults(defineProps<Props>(), {
  changeType: 'flat',
  level: 'normal',
  tagType: 'info',
  clickable: false,
  trendSparkline: () => [],
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

// 格式化数值（千分位）
const formattedValue = computed(() => {
  if (props.value >= 10000) {
    return (props.value / 10000).toFixed(1) + '万'
  }
  return props.value.toLocaleString('zh-CN')
})

// 变化方向样式
const changeClass = computed(() => {
  if (props.changeType === 'up') return 'change-up'
  if (props.changeType === 'down') return 'change-down'
  return 'change-flat'
})

// 迷你趋势图
const sparklineRef = ref<HTMLElement>()
let sparklineChart: echarts.ECharts | null = null

function initSparkline() {
  if (!sparklineRef.value || props.trendSparkline.length === 0) return

  sparklineChart = echarts.init(sparklineRef.value)
  sparklineChart.setOption({
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        type: 'line',
        data: props.trendSparkline,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
          color: props.changeType === 'down' ? '#67c23a' : '#f56c6c',
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: props.changeType === 'down' ? 'rgba(103,194,58,0.3)' : 'rgba(245,108,108,0.3)' },
            { offset: 1, color: 'transparent' },
          ]),
        },
      },
    ],
  })
}

onMounted(initSparkline)
watch(() => props.trendSparkline, initSparkline, { deep: true })
</script>

<style scoped lang="scss">
.stat-card {
  padding: 20px;
  background: var(--card-bg, #fff);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;
  cursor: default;

  &.clickable {
    cursor: pointer;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }
  }

  &.level-warning {
    border-left: 4px solid #e6a23c;
  }

  &.level-danger {
    border-left: 4px solid #f56c6c;
  }
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stat-name {
  font-size: 14px;
  color: var(--text-secondary, #909399);
}

.stat-value {
  margin-bottom: 8px;

  .value-number {
    font-size: 32px;
    font-weight: 600;
    color: var(--text-primary, #303133);
  }

  .value-unit {
    font-size: 14px;
    color: var(--text-secondary, #909399);
    margin-left: 4px;
  }
}

.stat-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;

  &.change-up {
    color: #f56c6c;
  }

  &.change-down {
    color: #67c23a;
  }

  &.change-flat {
    color: #909399;
  }

  .change-label {
    margin-left: 4px;
    color: var(--text-secondary, #909399);
  }
}

.sparkline-chart {
  height: 40px;
  margin-top: 12px;
}
</style>
```

### 4.2 `TrendChart.vue` — 趋势折线图

```vue
<!-- src/features/dashboard/components/TrendChart.vue -->

<template>
  <div class="trend-chart">
    <div class="chart-header">
      <h3 class="chart-title">{{ title }}</h3>
      <div class="chart-tools">
        <el-radio-group v-model="selectedDimension" size="small">
          <el-radio-button label="day">日</el-radio-button>
          <el-radio-button label="week">周</el-radio-button>
          <el-radio-button label="month">月</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="small"
          value-format="YYYY-MM-DD"
        />
      </div>
    </div>

    <div ref="chartRef" class="chart-body"></div>

    <!-- 同比环比对比 -->
    <div v-if="compareResult" class="chart-compare">
      <el-statistic
        :title="compareType === 'yoy' ? '同比' : '环比'"
        :value="compareResult.changeRate"
        :precision="1"
        suffix="%"
      >
        <template #prefix>
          <el-icon :color="compareResult.changeRate >= 0 ? '#f56c6c' : '#67c23a'">
            <ArrowUp v-if="compareResult.changeRate >= 0" />
            <ArrowDown v-else />
          </el-icon>
        </template>
      </el-statistic>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import type { TrendChartData, CompareResult } from '@/types/dashboard'

interface Props {
  title: string
  metricKey: string
  data?: TrendChartData
  compareResult?: CompareResult | null
  compareType?: 'yoy' | 'mom'
}

const props = withDefaults(defineProps<Props>(), {
  compareType: 'mom',
})

const emit = defineEmits<{
  (e: 'update:dimension', value: 'day' | 'week' | 'month'): void
  (e: 'update:dateRange', value: [string, string]): void
}>()

// 内部状态
const selectedDimension = ref<'day' | 'week' | 'month'>('month')
const dateRange = ref<[string, string]>(['2025-01-01', '2025-12-31'])

watch(selectedDimension, (val) => emit('update:dimension', val))
watch(dateRange, (val) => emit('update:dateRange', val))

// ECharts 实例
const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  updateChart()

  // 响应式
  window.addEventListener('resize', handleResize)
}

function updateChart() {
  if (!chartInstance || !props.data) return

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}<br/>${p.marker} ${props.data?.metricName}: ${p.value}${props.data?.unit || ''}`
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.data.data.map((d) => d.date),
      axisLine: { lineStyle: { color: '#dcdfe6' } },
      axisLabel: { color: '#606266' },
    },
    yAxis: {
      type: 'value',
      name: props.data.unit,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#ebeef5' } },
      axisLabel: { color: '#606266' },
    },
    series: [
      {
        name: props.data.metricName,
        type: 'line',
        data: props.data.data.map((d) => d.value),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          width: 3,
          color: '#409eff',
        },
        itemStyle: {
          color: '#409eff',
          borderWidth: 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64,158,255,0.3)' },
            { offset: 1, color: 'rgba(64,158,255,0.05)' },
          ]),
        },
        markLine: props.data.data[0]?.targetValue
          ? {
              data: [
                {
                  yAxis: props.data.data[0].targetValue,
                  label: { formatter: '目标值 {c}' },
                  lineStyle: { color: '#e6a23c', type: 'dashed' },
                },
              ],
            }
          : undefined,
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
    ],
  }

  chartInstance.setOption(option)
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(initChart)
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})

watch(() => props.data, updateChart, { deep: true })
</script>

<style scoped lang="scss">
.trend-chart {
  background: var(--card-bg, #fff);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.chart-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin: 0;
}

.chart-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chart-body {
  height: 350px;
}

.chart-compare {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color, #ebeef5);
  display: flex;
  gap: 40px;
}
</style>
```

### 4.3 `FilterBar.vue` — 筛选栏

```vue
<!-- src/features/dashboard/components/FilterBar.vue -->

<template>
  <div class="filter-bar">
    <div class="filter-left">
      <el-date-picker
        v-model="localDateRange"
        type="daterange"
        unlink-panels
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :shortcuts="dateShortcuts"
        value-format="YYYY-MM-DD"
        size="default"
      />

      <el-select v-model="localDepartment" placeholder="选择部门" clearable size="default">
        <el-option
          v-for="dept in departments"
          :key="dept.id"
          :label="dept.name"
          :value="dept.id"
        />
      </el-select>

      <el-select v-model="localMetricType" placeholder="指标类型" clearable size="default">
        <el-option label="事故统计" value="accident" />
        <el-option label="培训考核" value="training" />
        <el-option label="隐患排查" value="hazard" />
        <el-option label="设备安全" value="equipment" />
      </el-select>
    </div>

    <div class="filter-right">
      <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
      <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      <el-button :icon="Download" @click="handleExport">导出</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, Refresh, Download } from '@element-plus/icons-vue'

interface Department {
  id: number
  name: string
}

interface Props {
  dateRange?: [string, string]
  department?: number
  metricType?: string
  departments: Department[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:dateRange', value: [string, string]): void
  (e: 'update:department', value: number | undefined): void
  (e: 'update:metricType', value: string | undefined): void
  (e: 'search'): void
  (e: 'reset'): void
  (e: 'export'): void
}>()

const localDateRange = ref<[string, string]>(props.dateRange || ['', ''])
const localDepartment = ref<number | undefined>(props.department)
const localMetricType = ref<string | undefined>(props.metricType)

watch(localDateRange, (val) => emit('update:dateRange', val))
watch(localDepartment, (val) => emit('update:department', val))
watch(localMetricType, (val) => emit('update:metricType', val))

// 日期快捷选项
const dateShortcuts = [
  {
    text: '本月',
    value: () => {
      const end = new Date()
      const start = new Date(end.getFullYear(), end.getMonth(), 1)
      return [formatDate(start), formatDate(end)]
    },
  },
  {
    text: '上月',
    value: () => {
      const end = new Date()
      const start = new Date(end.getFullYear(), end.getMonth() - 1, 1)
      end.setDate(0)
      return [formatDate(start), formatDate(end)]
    },
  },
  {
    text: '本季度',
    value: () => {
      const end = new Date()
      const quarter = Math.floor(end.getMonth() / 3)
      const start = new Date(end.getFullYear(), quarter * 3, 1)
      return [formatDate(start), formatDate(end)]
    },
  },
  {
    text: '本年度',
    value: () => {
      const end = new Date()
      const start = new Date(end.getFullYear(), 0, 1)
      return [formatDate(start), formatDate(end)]
    },
  },
]

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function handleSearch(): void {
  emit('search')
}

function handleReset(): void {
  localDateRange.value = ['', '']
  localDepartment.value = undefined
  localMetricType.value = undefined
  emit('reset')
}

function handleExport(): void {
  emit('export')
}
</script>

<style scoped lang="scss">
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--card-bg, #fff);
  border-radius: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-left {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-right {
  display: flex;
  gap: 8px;
}
</style>
```

### 4.4 `AlertList.vue` — 实时告警列表

```vue
<!-- src/features/dashboard/components/AlertList.vue -->

<template>
  <div class="alert-list">
    <div class="alert-header">
      <h3 class="alert-title">
        <el-icon><Bell /></el-icon>
        实时告警
        <el-badge v-if="unreadCount > 0" :value="unreadCount" />
      </h3>
      <el-link type="primary" @click="handleViewAll">查看全部</el-link>
    </div>

    <el-scrollbar max-height="400px">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="alert-item"
        :class="`level-${alert.level}`"
      >
        <div class="alert-icon">
          <el-icon v-if="alert.level === 'critical'" color="#f56c6c"><Warning /></el-icon>
          <el-icon v-else-if="alert.level === 'warning'" color="#e6a23c"><WarningFilled /></el-icon>
          <el-icon v-else color="#909399"><InfoFilled /></el-icon>
        </div>

        <div class="alert-content">
          <div class="alert-title-text">{{ alert.title }}</div>
          <div class="alert-desc">{{ alert.description }}</div>
          <div class="alert-meta">
            <span class="alert-source">{{ alert.source }}</span>
            <span class="alert-time">{{ formatTime(alert.occurredAt) }}</span>
          </div>
        </div>

        <div class="alert-actions">
          <el-button
            v-if="alert.status === 'new'"
            type="primary"
            link
            size="small"
            :loading="resolvingId === alert.id"
            @click="handleResolve(alert.id)"
          >
            处理
          </el-button>
          <el-tag v-else-if="alert.status === 'processing'" type="warning" size="small">
            处理中
          </el-tag>
          <el-tag v-else type="success" size="small">已解决</el-tag>
        </div>
      </div>

      <el-empty v-if="alerts.length === 0" description="暂无告警" />
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Bell, Warning, WarningFilled, InfoFilled } from '@element-plus/icons-vue'
import type { SafetyAlert } from '@/types/dashboard'

interface Props {
  alerts: SafetyAlert[]
  resolvingId?: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'resolve', id: number): void
  (e: 'view-all'): void
}>()

// 未读告警数量
const unreadCount = computed(() =>
  props.alerts.filter((a) => a.status === 'new').length
)

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 小于 1 小时显示"xx 分钟前"
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000))
    return minutes <= 0 ? '刚刚' : `${minutes} 分钟前`
  }

  // 小于 24 小时显示"xx 小时前"
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  }

  // 否则显示日期时间
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function handleResolve(id: number): void {
  emit('resolve', id)
}

function handleViewAll(): void {
  emit('view-all')
}
</script>

<style scoped lang="scss">
.alert-list {
  background: var(--card-bg, #fff);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.alert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.alert-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  transition: background-color 0.2s;
  cursor: pointer;

  &:hover {
    background-color: var(--hover-bg, #f5f7fa);
  }

  &.level-critical {
    border-left: 3px solid #f56c6c;
  }

  &.level-warning {
    border-left: 3px solid #e6a23c;
  }

  &.level-info {
    border-left: 3px solid #909399;
  }
}

.alert-icon {
  flex-shrink: 0;
  padding-top: 2px;
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-title-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #303133);
  margin-bottom: 4px;
}

.alert-desc {
  font-size: 13px;
  color: var(--text-secondary, #606266);
  line-height: 1.5;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.alert-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-hint, #909399);
}

.alert-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
</style>
```

### 4.5 `DataExportPanel.vue` — 数据导出面板

```vue
<!-- src/features/dashboard/components/DataExportPanel.vue -->

<template>
  <el-dialog
    v-model="visible"
    title="历史数据导出"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="时间范围" required>
        <el-date-picker
          v-model="form.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>

      <el-form-item label="统计维度" required>
        <el-radio-group v-model="form.dimension">
          <el-radio-button label="day">按日</el-radio-button>
          <el-radio-button label="week">按周</el-radio-button>
          <el-radio-button label="month">按月</el-radio-button>
          <el-radio-button label="year">按年</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="导出指标" required>
        <el-checkbox-group v-model="form.metrics">
          <el-checkbox label="accident_count">事故次数</el-checkbox>
          <el-checkbox label="injury_count">伤亡人数</el-checkbox>
          <el-checkbox label="training_rate">培训覆盖率</el-checkbox>
          <el-checkbox label="hazard_count">隐患数量</el-checkbox>
          <el-checkbox label="inspection_score">检查评分</el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="部门筛选">
        <el-select v-model="form.departmentId" clearable placeholder="全部部门">
          <el-option
            v-for="dept in departments"
            :key="dept.id"
            :label="dept.name"
            :value="dept.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="exporting" @click="handleExport">
        导出 Excel
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

interface Department {
  id: number
  name: string
}

interface Props {
  departments: Department[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'export', data: {
    dateRange: [string, string]
    dimension: string
    metrics: string[]
    departmentId?: number
  }): void
}>()

const visible = ref(false)
const exporting = ref(false)

const form = reactive({
  dateRange: ['', ''] as [string, string],
  dimension: 'month' as 'day' | 'week' | 'month' | 'year',
  metrics: [] as string[],
  departmentId: undefined as number | undefined,
})

function open(): void {
  visible.value = true
  // 默认选中本月
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  form.dateRange = [start.toISOString().split('T')[0], now.toISOString().split('T')[0]]
}

function handleExport(): void {
  if (!form.dateRange[0] || !form.dateRange[1]) {
    ElMessage.warning('请选择时间范围')
    return
  }
  if (form.metrics.length === 0) {
    ElMessage.warning('请至少选择一个导出指标')
    return
  }

  exporting.value = true
  emit('export', {
    dateRange: form.dateRange,
    dimension: form.dimension,
    metrics: form.metrics,
    departmentId: form.departmentId,
  })
}

function close(): void {
  visible.value = false
  exporting.value = false
}

defineExpose({ open, close })
</script>
```

---

## 五、DashboardView.vue — 页面组装

```vue
<!-- src/features/dashboard/views/DashboardView.vue -->

<template>
  <div class="dashboard-view">
    <!-- 筛选栏 -->
    <FilterBar
      v-model:date-range="filterDateRange"
      v-model:department="filterDepartment"
      v-model:metric-type="filterMetricType"
      :departments="departments"
      @search="handleSearch"
      @reset="handleReset"
      @export="handleOpenExport"
    />

    <!-- 指标卡片网格 -->
    <el-row :gutter="20" class="stat-row">
      <el-col
        v-for="metric in visibleMetrics"
        :key="metric.key"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
      >
        <StatCard
          :name="metric.name"
          :value="metric.value"
          :unit="metric.unit"
          :change-rate="metric.changeRate"
          :change-type="metric.changeType"
          :level="getMetricLevel(metric)"
          clickable
          @click="handleMetricClick(metric)"
        />
      </el-col>
    </el-row>

    <!-- 图表与告警 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :xs="24" :lg="16">
        <TrendChart
          title="安全趋势分析"
          :metric-key="selectedMetricKey"
          :data="trendData"
          :compare-result="compareResult"
          @update:dimension="handleDimensionChange"
          @update:date-range="handleTrendDateChange"
        />
      </el-col>

      <el-col :xs="24" :lg="8">
        <AlertList
          :alerts="alertList"
          :resolving-id="resolvingId"
          @resolve="handleResolveAlert"
          @view-all="handleViewAllAlerts"
        />
      </el-col>
    </el-row>

    <!-- 导出面板 -->
    <DataExportPanel
      ref="exportPanelRef"
      :departments="departments"
      @export="handleExport"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePermissionStore } from '@/stores/permission'
import {
  useSafetyMetrics,
  useTrendData,
  useAlertList,
  useResolveAlert,
  useHistoryData,
  useExportHistory,
  useCompareData,
} from '../composables/useDashboardData'
import FilterBar from '../components/FilterBar.vue'
import StatCard from '../components/StatCard.vue'
import TrendChart from '../components/TrendChart.vue'
import AlertList from '../components/AlertList.vue'
import DataExportPanel from '../components/DataExportPanel.vue'

const router = useRouter()
const permStore = usePermissionStore()

// ==================== 筛选状态 ====================

const filterDateRange = ref<[string, string]>(['2025-01-01', '2025-12-31'])
const filterDepartment = ref<number | undefined>(undefined)
const filterMetricType = ref<string | undefined>(undefined)

// 部门列表（实际应从后端获取，此处示例）
const departments = ref([
  { id: 1, name: '环卫一部' },
  { id: 2, name: '环卫二部' },
  { id: 3, name: '设备管理部' },
  { id: 4, name: '安全监察部' },
])

// ==================== 指标数据 ====================

const { data: metricsData, isLoading: metricsLoading } = useSafetyMetrics(filterDepartment)

// 根据角色过滤可见指标
const visibleMetrics = computed(() => {
  const all = metricsData.value ?? []

  // 非管理员只能看到本部门指标
  if (!permStore.isSuperAdmin && filterDepartment.value) {
    return all.filter((m) => m.key.includes('dept'))
  }

  // 根据指标类型筛选
  if (filterMetricType.value) {
    return all.filter((m) => m.key.startsWith(filterMetricType.value!))
  }

  return all
})

// 指标健康级别判断
function getMetricLevel(metric: any): 'normal' | 'warning' | 'danger' {
  if (metric.changeRate === undefined) return 'normal'
  if (metric.changeRate > 20) return 'danger'
  if (metric.changeRate > 10) return 'warning'
  return 'normal'
}

// ==================== 趋势图表 ====================

const selectedMetricKey = ref('accident_count')
const trendDimension = ref<'day' | 'week' | 'month'>('month')
const trendDateRange = ref<[string, string]>(['2025-01-01', '2025-12-31'])

const { data: trendData } = useTrendData(
  selectedMetricKey,
  trendDateRange,
  trendDimension
)

const { data: compareData } = useCompareData(
  selectedMetricKey,
  ref('mom'),
  ref(1)
)

const compareResult = computed(() => compareData.value ?? null)

function handleDimensionChange(dim: 'day' | 'week' | 'month'): void {
  trendDimension.value = dim
}

function handleTrendDateChange(range: [string, string]): void {
  trendDateRange.value = range
}

// ==================== 告警列表 ====================

const alertParams = ref({
  page: 1,
  pageSize: 10,
  level: undefined as string | undefined,
  status: 'new',
})

const { data: alertPageData } = useAlertList(alertParams)
const alertList = computed(() => alertPageData.value?.list ?? [])

const { mutateAsync: resolveAlertMutate } = useResolveAlert()
const resolvingId = ref<number | null>(null)

async function handleResolveAlert(id: number): Promise<void> {
  resolvingId.value = id
  try {
    await resolveAlertMutate(id)
    ElMessage.success('告警已处理')
  } finally {
    resolvingId.value = null
  }
}

function handleViewAllAlerts(): void {
  router.push('/alerts')
}

// ==================== 导出 ====================

const exportPanelRef = ref<InstanceType<typeof DataExportPanel>>()
const { mutateAsync: exportMutate } = useExportHistory()

function handleOpenExport(): void {
  exportPanelRef.value?.open()
}

async function handleExport(params: {
  dateRange: [string, string]
  dimension: string
  metrics: string[]
  departmentId?: number
}): Promise<void> {
  try {
    const res = await exportMutate({
      startDate: params.dateRange[0],
      endDate: params.dateRange[1],
      dimension: params.dimension as any,
      metrics: params.metrics,
      departmentId: params.departmentId,
    })
    if (res.data?.downloadUrl) {
      window.open(res.data.downloadUrl, '_blank')
    }
    exportPanelRef.value?.close()
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  }
}

// ==================== 事件处理 ====================

function handleSearch(): void {
  // 触发各数据重新获取
  // TanStack Query 的 queryKey 已绑定响应式参数，会自动重新请求
}

function handleReset(): void {
  filterDateRange.value = ['2025-01-01', '2025-12-31']
  filterDepartment.value = undefined
  filterMetricType.value = undefined
}

function handleMetricClick(metric: any): void {
  selectedMetricKey.value = metric.key
}

// ==================== 生命周期 ====================

onMounted(() => {
  // 根据 URL 参数恢复筛选状态（可选）
})
</script>

<style scoped lang="scss">
.dashboard-view {
  padding-bottom: 40px;
}

.stat-row {
  margin-bottom: 20px;
}

.chart-row {
  .el-col {
    margin-bottom: 20px;
  }
}
</style>
```

---

## 六、权限与角色隔离

### 6.1 不同角色可见指标配置

```typescript
// src/features/dashboard/config/permissions.ts

/**
 * 看板指标权限映射
 * 键：指标编码，值：所需权限编码
 */
export const METRIC_PERMISSIONS: Record<string, string | string[]> = {
  // 全局指标（管理员可见）
  'total_accident': 'dashboard:global',
  'total_injury': 'dashboard:global',
  'company_training_rate': 'dashboard:global',

  // 部门指标（部门负责人及以上可见）
  'dept_accident_count': 'dashboard:dept',
  'dept_hazard_count': 'dashboard:dept',
  'dept_inspection_score': 'dashboard:dept',

  // 全员可见
  'personal_training_status': 'dashboard:personal',
  'safety_checklist_progress': 'dashboard:personal',
}

/**
 * 根据权限过滤指标列表
 */
export function filterMetricsByPermission(
  metrics: Array<{ key: string }>,
  hasPermission: (code: string) => boolean
): Array<{ key: string }> {
  return metrics.filter((metric) => {
    const required = METRIC_PERMISSIONS[metric.key]
    if (!required) return true // 未配置默认可见
    if (Array.isArray(required)) {
      return required.some((code) => hasPermission(code))
    }
    return hasPermission(required)
  })
}
```

### 6.2 路由权限配置

```typescript
// src/router/routes.ts — 看板路由（已包含在 asyncRoutes 中）

{
  path: '/dashboard',
  name: 'Dashboard',
  component: () => import('@/features/dashboard/views/DashboardView.vue'),
  meta: {
    title: '安全看板',
    icon: 'dashboard',
    permission: 'dashboard:view',
    keepAlive: true,
  },
}
```

### 6.3 按钮级权限

```vue
<!-- 看板内的按钮权限控制示例 -->

<template>
  <div class="dashboard-actions">
    <!-- 仅管理员可见：全局数据导出 -->
    <el-button v-permission="'dashboard:export'" @click="handleExport">
      导出全局报表
    </el-button>

    <!-- 部门负责人可见：部门数据切换 -->
    <el-select v-permission="'dashboard:dept'" v-model="selectedDept">
      <el-option
        v-for="dept in departments"
        :key="dept.id"
        :label="dept.name"
        :value="dept.id"
      />
    </el-select>

    <!-- 安全监察部可见：事故登记 -->
    <el-button v-permission="'safety:accident:create'" type="danger">
      登记事故
    </el-button>
  </div>
</template>
```

---

## 七、性能与安全优化

### 7.1 性能优化策略

| 策略 | 实现方式 | 效果 |
|------|----------|------|
| 请求缓存 | TanStack Query `staleTime` / `gcTime` | 减少重复请求，5 分钟内同参数不重复请求 |
| 定时刷新 | `refetchInterval` | 指标 30 秒、告警 15 秒自动刷新 |
| 组件懒加载 | `defineAsyncComponent` | 非首屏组件按需加载 |
| 图表懒渲染 | ECharts `lazyUpdate` + `resize` 防抖 | 大量图表时避免同时渲染 |
| 虚拟滚动 | 告警列表超过 100 条时使用 `vue-virtual-scroller` | 避免 DOM 节点过多 |
| 数据分页 | 告警列表分页查询（pageSize: 10） | 减少单次数据传输量 |
| 压缩传输 | 后端开启 gzip | 减少响应体积 |
|  keep-alive | 路由 `meta.keepAlive: true` | 切换标签页后状态保留 |

### 7.2 大数据量处理

```typescript
// 历史数据查询的大数据量处理

/**
 * 1. 后端分页：历史数据查询强制限制最大返回条数
 *    - 单日维度：最多返回 366 条（一年）
 *    - 月度维度：最多返回 60 条（5 年）
 *    - 超出限制必须分批导出
 *
 * 2. 前端处理：
 *    - 图表使用 ECharts dataZoom 实现缩放查看
 *    - 表格使用 el-table 虚拟滚动（virtual-scroll）
 *    - 导出通过后端生成文件（异步任务 + 下载链接）
 */

// ECharts dataZoom 配置（已在 TrendChart.vue 中配置）
const dataZoomConfig = {
  type: 'inside',
  start: 0,
  end: 100,
}
```

### 7.3 安全考虑

| 维度 | 措施 | 说明 |
|------|------|------|
| 数据隔离 | `departmentId` 参数 + 后端校验 | 用户只能查询本部门数据（管理员除外） |
| 权限校验 | 前端 `v-permission` + 后端接口独立校验 | 不信任前端，后端每次请求都校验权限 |
| 敏感数据脱敏 | 后端返回掩码数据 | 个人信息（手机号、身份证）只显示部分 |
| 导出审计 | 后端记录导出日志 | 谁、何时、导出哪些数据 |
| XSS 防护 | Vue 模板自动转义 + DOMPurify | 告警描述等用户输入内容消毒后显示 |
| SQL 注入 | 后端参数化查询 | 所有查询条件使用预编译语句 |

### 7.4 图表性能优化

```typescript
// ECharts 大数据量优化配置

const performanceOption = {
  // 大数据量时启用渐进式渲染
  progressive: 5000,
  progressiveThreshold: 10000,

  // 减少动画时长
  animation: true,
  animationDuration: 300,

  // 数据采样（超过 1000 个点时）
  sampling: 'lttb',

  // 禁用不必要的交互
  hoverAnimation: false,

  // 使用 Canvas 渲染（默认）
  renderer: 'canvas',
}
```

---

## 八、实施步骤与验证

### 8.1 文件创建清单

| 序号 | 文件路径 | 说明 |
|------|----------|------|
| 1 | `src/types/dashboard.ts` | 看板类型定义 |
| 2 | `src/api/modules/dashboard.ts` | 看板 API 接口 |
| 3 | `src/api/keys.ts` | 补充 dashboard Query Keys |
| 4 | `src/features/dashboard/composables/useDashboardData.ts` | 数据层 Composables |
| 5 | `src/features/dashboard/components/StatCard.vue` | 指标卡片 |
| 6 | `src/features/dashboard/components/TrendChart.vue` | 趋势图表 |
| 7 | `src/features/dashboard/components/FilterBar.vue` | 筛选栏 |
| 8 | `src/features/dashboard/components/AlertList.vue` | 告警列表 |
| 9 | `src/features/dashboard/components/DataExportPanel.vue` | 导出面板 |
| 10 | `src/features/dashboard/views/DashboardView.vue` | 看板主页面 |
| 11 | `src/features/dashboard/index.ts` | 模块导出 |
| 12 | `src/features/dashboard/config/permissions.ts` | 指标权限配置 |

### 8.2 依赖安装

```bash
# ECharts（图表库）
npm install echarts@^5.5.0

# Element Plus Icons（若未安装）
npm install @element-plus/icons-vue
```

### 8.3 与已有配置整合

| 配置文件 | 整合内容 |
|----------|----------|
| `src/router/routes.ts` | 确认 `/dashboard` 路由已定义在 `asyncRoutes` 中 |
| `src/api/keys.ts` | 补充 `queryKeys.dashboard.*` 定义 |
| `src/components/layout/LayoutDefault.vue` | 确认侧边栏菜单包含"安全看板"入口 |
| `vite.config.ts` | `optimizeDeps.include` 添加 `echarts` |
| `src/main.ts` | 确认 ECharts 已按需引入或全局注册 |

### 8.4 验证命令

```bash
# 1. TypeScript 类型检查
npm run type-check

# 2. 开发服务器启动
npm run dev

# 3. ESLint 检查
npm run lint

# 4. 生产构建
npm run build
```

### 8.5 功能验证清单

| 功能 | 验证步骤 | 预期结果 |
|------|----------|----------|
| 指标卡片加载 | 打开看板页面 | 显示 4-8 个指标卡片，数值正确 |
| 趋势图表 | 切换时间维度（日/周/月） | 图表数据相应更新，有平滑过渡动画 |
| 同比环比 | 查看图表下方统计 | 显示正确的变化率和变化方向 |
| 告警列表 | 等待 15 秒或手动刷新 | 新告警自动出现在列表顶部 |
| 处理告警 | 点击"处理"按钮 | 告警状态变为"处理中"，列表刷新 |
| 筛选查询 | 选择部门和日期范围，点击查询 | 指标卡片和图表数据相应变化 |
| 导出数据 | 点击导出，选择参数，确认 | 生成 Excel 文件并自动下载 |
| 权限隔离 | 用不同角色账号登录 | 看板显示的指标和数据范围不同 |
| 页面缓存 | 切换到其他页面再返回 | 看板状态保留（keep-alive 生效） |
| 响应式 | 调整浏览器窗口大小 | 布局自适应，图表自动 resize |

---

> **总结**：本文档提供了安全看板模块从数据类型、API 接口、Composables、业务组件到页面组装的完整实现。核心设计：**TanStack Query 管理服务端数据缓存与自动刷新**，**Pinia 管理筛选条件等客户端状态**，**v-permission 实现按钮级权限控制**，**ECharts 实现数据可视化**。所有代码与已有架构文档完全兼容，可直接复制到项目中使用。
