<script lang="ts" setup>
/**
 * 告警中心（web-naive）
 * 统一使用 HSE 公共组件栈（HseDataGrid / HseSearchPanel / HsePageLayout / HseStatusTag）。
 * 接入真实 API（/api/hse/alerts）。
 * 支持批量处置、单条处置、查看详情、导出等功能。
 */
import { onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
} from 'naive-ui';

import {
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  batchResolveAlerts,
  exportAlerts,
  getAlertList,
  getAlertStats,
  resolveAlert,
  type AlertsApi,
} from '#/api/hse/alerts';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseAlerts' });

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ===================== 枚举映射 =====================
const LEVEL_OPTIONS = [
  { label: '严重', value: 'critical' },
  { label: '高危', value: 'high' },
  { label: '中危', value: 'medium' },
  { label: '低危', value: 'low' },
  { label: '提示', value: 'info' },
];

const STATUS_OPTIONS = [
  { label: '待处理', value: 'new' },
  { label: '处理中', value: 'processing' },
  { label: '已关闭', value: 'resolved' },
];

const LEVEL_TAG: Record<string, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'warning',
  low: 'info',
  info: 'neutral',
};

const LEVEL_LABEL: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '提示',
};

const STATUS_TAG: Record<string, 'danger' | 'warning' | 'success' | 'info' | 'neutral'> = {
  new: 'danger',
  processing: 'warning',
  resolved: 'success',
};

const STATUS_LABEL: Record<string, string> = {
  new: '待处理',
  processing: '处理中',
  resolved: '已关闭',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<AlertsApi.AlertItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const gridRef = ref<{ gridApi: any } | null>(null);

const searchForm = reactive({
  keyword: '',
  level: null as string | null,
  status: null as string | null,
  dateRange: null as [number, number] | null,
});

// ===================== 统计数据 =====================
const statsLoading = ref(false);
const statsData = ref<AlertsApi.AlertStats>({
  total: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  newCount: 0,
  processingCount: 0,
  resolvedCount: 0,
});

async function loadData() {
  loading.value = true;
  try {
    const params: AlertsApi.AlertListParams = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      level: searchForm.level || undefined,
      status: searchForm.status || undefined,
    };
    if (searchForm.dateRange && searchForm.dateRange[0] && searchForm.dateRange[1]) {
      params.startDate = formatDate(searchForm.dateRange[0]);
      params.endDate = formatDate(searchForm.dateRange[1]);
    }
    const res = await getAlertList(params);
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  try {
    const stats = await getAlertStats();
    statsData.value = stats;
  } catch {
    // keep defaults
  } finally {
    statsLoading.value = false;
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.level = null;
  searchForm.status = null;
  searchForm.dateRange = null;
  currentPage.value = 1;
  loadData();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}

// ===================== 导出 =====================
const exportLoading = ref(false);

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

async function onExport() {
  exportLoading.value = true;
  try {
    const params: AlertsApi.AlertListParams = {
      keyword: searchForm.keyword || undefined,
      level: searchForm.level || undefined,
      status: searchForm.status || undefined,
    };
    const blob = await exportAlerts(params);
    triggerDownload(blob, `alerts_${nowStamp()}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  } finally {
    exportLoading.value = false;
  }
}

// ===================== 处置（单条 / 批量） =====================
const resolveModalVisible = ref(false);
const resolveLoading = ref(false);
const isBatchResolve = ref(false);
const currentAlert = ref<AlertsApi.AlertItem | null>(null);
const resolveForm = reactive({
  remark: '',
});

function openResolveSingle(row: AlertsApi.AlertItem) {
  isBatchResolve.value = false;
  currentAlert.value = row;
  resolveForm.remark = '';
  resolveModalVisible.value = true;
}

function openBatchResolve() {
  let rows: AlertsApi.AlertItem[] = [];
  try {
    rows = gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    message.warning('请先勾选要处置的告警');
    return;
  }
  isBatchResolve.value = true;
  currentAlert.value = null;
  resolveForm.remark = '';
  resolveModalVisible.value = true;
}

async function onResolveConfirm() {
  resolveLoading.value = true;
  try {
    if (isBatchResolve.value) {
      let rows: AlertsApi.AlertItem[] = [];
      try {
        rows = gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
      } catch {
        rows = [];
      }
      const ids = rows.map((r) => r.id);
      if (!ids.length) {
        message.warning('请先勾选要处置的告警');
        return;
      }
      await batchResolveAlerts({ ids, remark: resolveForm.remark });
      message.success(`成功处置 ${ids.length} 条告警`);
    } else if (currentAlert.value) {
      await resolveAlert(currentAlert.value.id, { remark: resolveForm.remark });
      message.success('处置成功');
    }
    resolveModalVisible.value = false;
    onRefresh();
  } catch {
    // 拦截器已提示
  } finally {
    resolveLoading.value = false;
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const detailAlert = ref<AlertsApi.AlertItem | null>(null);

function openView(row: AlertsApi.AlertItem) {
  detailAlert.value = row;
  detailDrawerVisible.value = true;
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center' },
  {
    title: '序号',
    field: '_index',
    width: 60,
    align: 'center',
    formatter: (params: any) =>
      (currentPage.value - 1) * pageSize.value + ((params as any)?.rowIndex ?? 0) + 1,
  },
  { title: '告警标题', field: 'title', minWidth: 220, align: 'left', showOverflow: 'tooltip' },
  { title: '级别', field: 'level', width: 80, align: 'center', slots: { default: 'level' } },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'status' } },
  { title: '来源', field: 'source', width: 120, align: 'center' },
  { title: '位置', field: 'location', minWidth: 140, align: 'left', showOverflow: 'tooltip' },
  {
    title: '发生时间',
    field: 'occurredAt',
    width: 170,
    align: 'center',
    slots: { default: 'occurredAt' },
  },
  {
    title: '操作',
    field: 'action',
    width: 150,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout :title="$t('page.hse.alerts')" description="集中查看、处置和跟踪安全告警">
    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="告警总数" :value="statsData.total" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="严重告警" :value="statsData.critical" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="待处理" :value="statsData.newCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已解决" :value="statsData.resolvedCount" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索告警标题/描述"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.level"
          placeholder="告警级别"
          clearable
          :options="LEVEL_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="处理状态"
          clearable
          :options="STATUS_OPTIONS"
        />
      </NGi>
      <NGi>
        <NDatePicker
          v-model:value="searchForm.dateRange"
          type="daterange"
          clearable
          style="width: 100%"
          placeholder="选择时间范围"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 操作按钮 -->
    <NSpace class="mb-2" justify="end">
      <NButton :loading="exportLoading" @click="onExport">导出</NButton>
      <NButton type="primary" danger @click="openBatchResolve">
        批量处置
      </NButton>
    </NSpace>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #level="{ row }">
        <HseStatusTag :type="LEVEL_TAG[row.level] || 'neutral'">
          {{ LEVEL_LABEL[row.level] || row.level || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_LABEL[row.status] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #occurredAt="{ row }">
        {{ row.occurredAt ? formatDateTime(row.occurredAt) : '-' }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton
            v-if="row.status !== 'resolved'"
            size="small"
            type="warning"
            quaternary
            @click="openResolveSingle(row)"
          >
            处置
          </NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 处置弹窗 -->
    <NModal
      v-model:show="resolveModalVisible"
      :title="isBatchResolve ? '批量处置告警' : '告警处置'"
      preset="card"
      style="width: 500px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem v-if="isBatchResolve" label="处置数量">
          <NTag type="info" :bordered="false">共选中的告警将被批量处置</NTag>
        </NFormItem>
        <NFormItem label="处置备注">
          <NInput
            v-model:value="resolveForm.remark"
            type="textarea"
            :rows="4"
            placeholder="请输入处置说明..."
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="resolveModalVisible = false">取消</NButton>
          <NButton type="primary" :loading="resolveLoading" @click="onResolveConfirm">
            确认处置
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="600" placement="right">
      <NDrawerContent title="告警详情" :closable="true">
        <template v-if="detailAlert">
          <NDescriptions :column="1" bordered size="small" label-placement="left">
            <NDescriptionsItem label="告警标题">{{ detailAlert.title }}</NDescriptionsItem>
            <NDescriptionsItem label="告警级别">
              <HseStatusTag :type="LEVEL_TAG[detailAlert.level] || 'neutral'">
                {{ LEVEL_LABEL[detailAlert.level] || detailAlert.level }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="告警状态">
              <HseStatusTag :type="STATUS_TAG[detailAlert.status] || 'neutral'">
                {{ STATUS_LABEL[detailAlert.status] || detailAlert.status }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="告警来源">{{ detailAlert.source }}</NDescriptionsItem>
            <NDescriptionsItem label="发生位置">{{ detailAlert.location || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="发生时间">
              {{ detailAlert.occurredAt ? formatDateTime(detailAlert.occurredAt) : '-' }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="detailAlert.resolvedAt" label="解决时间">
              {{ formatDateTime(detailAlert.resolvedAt) }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="detailAlert.handler" label="处理人">
              {{ detailAlert.handler }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="detailAlert.remark" label="处置备注">
              {{ detailAlert.remark }}
            </NDescriptionsItem>
            <NDescriptionsItem label="详细描述">{{ detailAlert.description }}</NDescriptionsItem>
          </NDescriptions>
          <div class="mt-4" v-if="detailAlert.status !== 'resolved'">
            <NSpace>
              <NButton type="primary" @click="() => { detailDrawerVisible = false; if (detailAlert) openResolveSingle(detailAlert); }">
                处置此告警
              </NButton>
            </NSpace>
          </div>
        </template>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
