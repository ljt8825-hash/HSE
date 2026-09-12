<script lang="ts" setup>
/**
 * 应急事件管理（web-naive · 阶段04）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/emergency.js）。
 */
import { reactive, ref, onMounted } from 'vue';

import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NSelect,
  NStatistic,
} from 'naive-ui';
import { $t } from '#/locales';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createEvent,
  deleteEvent,
  exportEvents,
  getEventList,
  getEventStats,
  updateEvent,
  type EmergencyEventApi,
} from '#/api/hse/emergency';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseEmergencyEvents' });

// ===================== 映射 =====================
const LEVEL_OPTIONS = [
  { label: '一级', value: '一级' },
  { label: '二级', value: '二级' },
  { label: '三级', value: '三级' },
  { label: '四级', value: '四级' },
];

const STATUS_OPTIONS = [
  { label: '已接报', value: '已接报' },
  { label: '响应中', value: '响应中' },
  { label: '处置中', value: '处置中' },
  { label: '已结案', value: '已结案' },
];

const LEVEL_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  '一级': 'danger',
  '二级': 'danger',
  '三级': 'warning',
  '四级': 'info',
};

const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  '已接报': 'info',
  '响应中': 'warning',
  '处置中': 'warning',
  '已结案': 'success',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmergencyEventApi.EmergencyEvent[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({ keyword: '', event_level: '', status: '' });

async function loadData() {
  loading.value = true;
  try {
    const res = await getEventList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      event_level: searchForm.event_level || undefined,
      status: searchForm.status || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    });
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

const statTotal = ref(0);
const statHandling = ref(0);
const statClosed = ref(0);
const statAvgDuration = ref(0);

async function loadStats() {
  try {
    const stats = await getEventStats();
    statTotal.value = stats.total ?? 0;
    statHandling.value = stats.handling ?? 0;
    statClosed.value = stats.closed ?? 0;
    statAvgDuration.value = stats.avgDuration ?? 0;
  } catch {
    /* ignore */
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.event_level = '';
  searchForm.status = '';
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  currentPage.value = 1;
  loadData();
}

// ===================== 操作栏 =====================
// 06C-3 对齐基线：应急事件基线无导入入口（后端无 emergency_events 导入配置），仅导出+新增
const actionState = ref<
  Partial<Record<HseActionKey, { hidden?: boolean }>>
>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
});

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}

async function onExport() {
  try {
    const blob = await exportEvents();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '应急事件列表.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch {
    message.error('导出失败');
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<EmergencyEventApi.EventFormData>({
  title: '',
  event_type: '',
  event_level: '',
  status: '已接报',
  happen_time: '',
  location: '',
  reporter: '',
  response_process: '',
  handling_measures: '',
  result: '',
  remark: '',
});

function resetForm() {
  formModel.title = '';
  formModel.event_type = '';
  formModel.event_level = '';
  formModel.status = '已接报';
  formModel.happen_time = '';
  formModel.location = '';
  formModel.reporter = '';
  formModel.response_process = '';
  formModel.handling_measures = '';
  formModel.result = '';
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmergencyEventApi.EmergencyEvent) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    title: row.title,
    event_type: row.event_type ?? '',
    event_level: row.event_level ?? '',
    status: row.status ?? '已接报',
    happen_time: row.happen_time ?? '',
    location: row.location ?? '',
    reporter: row.reporter ?? '',
    response_process: row.response_process ?? '',
    handling_measures: row.handling_measures ?? '',
    result: row.result ?? '',
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: EmergencyEventApi.EmergencyEvent) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.title) {
    message.warning('事件标题不能为空');
    return;
  }
  if (!formModel.event_level) {
    message.warning('请选择事件等级');
    return;
  }
  formLoading.value = true;
  try {
    const payload: EmergencyEventApi.EventFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateEvent(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createEvent(payload);
      message.success('新增成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: EmergencyEventApi.EmergencyEvent) {
  try {
    await deleteEvent(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
const eventColumns = ref<VxeTableGridColumns>([
  { title: '事件标题', field: 'title', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '事件等级', field: 'event_level', width: 100, align: 'center', sortable: true, slots: { default: 'event_level' } },
  { title: '事件类型', field: 'event_type', width: 120, align: 'center' },
  { title: '发生时间', field: 'happen_time', width: 170, align: 'center', sortable: true },
  { title: '地点', field: 'location', minWidth: 140, align: 'left', showOverflow: 'tooltip' },
  { title: '报告人', field: 'reporter', width: 100, align: 'center' },
  { title: '状态', field: 'status', width: 100, align: 'center', sortable: true, slots: { default: 'status' } },
  {
    title: '操作',
    field: 'action',
    width: 180,
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
  <HsePageLayout
    :description="$t('page.hse.emergencyEventsDesc')"
    :title="$t('page.hse.emergencyEvents')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @export="onExport"
        @create="openCreate"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="本年事件数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="处置中" :value="statHandling" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已结案" :value="statClosed" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="平均处置时长(小时)" :value="statAvgDuration" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="事件标题/地点/报告人"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.event_level"
          placeholder="事件等级"
          clearable
          :options="LEVEL_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="事件状态"
          clearable
          :options="STATUS_OPTIONS"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="eventColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #event_level="{ row }">
        <HseStatusTag :type="LEVEL_TAG[row.event_level] || 'neutral'">
          {{ row.event_level || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该事件记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增应急事件'
          : formMode === 'edit'
            ? '编辑应急事件'
            : '事件详情'
      "
      preset="card"
      style="width: 760px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="事件标题" required>
            <NInput v-model:value="formModel.title" placeholder="请输入事件标题" />
          </NFormItem>
          <NFormItem label="事件类型">
            <NInput v-model:value="formModel.event_type" placeholder="请输入事件类型" />
          </NFormItem>
          <NFormItem label="事件等级" required>
            <NSelect
              v-model:value="formModel.event_level"
              placeholder="请选择事件等级"
              :options="LEVEL_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="formModel.status"
              placeholder="请选择状态"
              :options="STATUS_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="发生时间">
            <NInput v-model:value="formModel.happen_time" placeholder="YYYY-MM-DD HH:mm:ss" />
          </NFormItem>
          <NFormItem label="发生地点">
            <NInput v-model:value="formModel.location" placeholder="请输入发生地点" />
          </NFormItem>
          <NFormItem label="报告人">
            <NInput v-model:value="formModel.reporter" placeholder="请输入报告人" />
          </NFormItem>
        </div>
        <NFormItem label="响应过程">
          <NInput
            v-model:value="formModel.response_process"
            type="textarea"
            :rows="3"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="处置措施">
          <NInput
            v-model:value="formModel.handling_measures"
            type="textarea"
            :rows="3"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="处置结果">
          <NInput
            v-model:value="formModel.result"
            type="textarea"
            :rows="3"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput
            v-model:value="formModel.remark"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton
            v-if="formMode !== 'view'"
            type="primary"
            :loading="formLoading"
            @click="onSubmit"
          >
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
