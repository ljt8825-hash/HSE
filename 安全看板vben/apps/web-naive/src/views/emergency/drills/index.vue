<script lang="ts" setup>
/**
 * 应急演练管理（web-naive · 阶段04）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/emergency.js）。
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
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
  HseImportDialog,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createDrill,
  deleteDrill,
  exportEmergencyDrills,
  getDrillList,
  getDrillStats,
  getEmergencyPlanList,
  updateDrill,
  type EmergencyApi,
  type EmergencyDrillApi,
} from '#/api/hse/emergency';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseEmergencyDrills' });

// ===================== 映射 =====================
const DRILL_TYPE_OPTIONS = [
  { label: '桌面演练', value: '桌面演练' },
  { label: '功能演练', value: '功能演练' },
  { label: '实战演练', value: '实战演练' },
];

const RESULT_OPTIONS = [
  { label: '优秀', value: '优秀' },
  { label: '良好', value: '良好' },
  { label: '合格', value: '合格' },
  { label: '不合格', value: '不合格' },
];

const STATUS_OPTIONS = [
  { label: '计划中', value: '计划中' },
  { label: '进行中', value: '进行中' },
  { label: '已完成', value: '已完成' },
  { label: '已取消', value: '已取消' },
];

const DRILL_LEVEL_OPTIONS = [
  { label: '一级', value: '一级' },
  { label: '二级', value: '二级' },
  { label: '三级', value: '三级' },
  { label: '四级', value: '四级' },
];

const RESULT_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  '优秀': 'success',
  '良好': 'success',
  '合格': 'info',
  '不合格': 'danger',
};

const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  '计划中': 'info',
  '进行中': 'warning',
  '已完成': 'success',
  '已取消': 'neutral',
};

const DRILL_TYPE_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  '桌面演练': 'info',
  '功能演练': 'warning',
  '实战演练': 'success',
};

function formatDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmergencyDrillApi.DrillRecord[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  drill_type: '',
  result: '',
  plan_id: undefined as number | undefined,
});

// 关联预案下拉（对齐基线：getEmergencyPlanList 拉取预案选项）
const planOptions = ref<EmergencyApi.EmergencyPlan[]>([]);
const planSelectOptions = computed(() =>
  planOptions.value.map((p) => ({ label: p.name, value: p.id })),
);
async function fetchPlans() {
  try {
    const res = await getEmergencyPlanList({ page: 1, pageSize: 999 });
    planOptions.value = res.list || [];
  } catch {
    planOptions.value = [];
  }
}

async function loadData() {
  loading.value = true;
  try {
    const res = await getDrillList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      drill_type: searchForm.drill_type || undefined,
      result: searchForm.result || undefined,
      plan_id: searchForm.plan_id ?? undefined,
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

const statYearCount = ref(0);
const statPassRate = ref(0);
const statParticipantsTotal = ref(0);
const statFailed = ref(0);
async function loadStats() {
  try {
    const stats = await getDrillStats();
    statYearCount.value = stats.yearCount ?? 0;
    statPassRate.value = stats.passRate ?? 0;
    statParticipantsTotal.value = stats.participantsTotal ?? 0;
    statFailed.value = stats.failed ?? 0;
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
  searchForm.drill_type = '';
  searchForm.result = '';
  searchForm.plan_id = undefined;
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
const actionState = ref<
  Partial<Record<HseActionKey, { hidden?: boolean }>>
>({});

// 通用导入（模块名：emergency-drill）
const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose: onImportDialogClose,
  bindRefresh: bindImportRefresh,
} = useGenericImport('emergency-drill');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}

async function onExport() {
  try {
    const blob = await exportEmergencyDrills();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '应急演练列表.csv';
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
const formModel = reactive<EmergencyDrillApi.DrillFormData>({
  name: '',
  drill_type: '',
  drill_level: '',
  drill_date: '',
  location: '',
  organizer: '',
  participants: 0,
  duration: 0,
  result: undefined,
  status: '已完成',
  plan_id: null,
  plan_title: '',
  remark: '',
});

function resetForm() {
  formModel.name = '';
  formModel.drill_type = '';
  formModel.drill_level = '';
  formModel.drill_date = '';
  formModel.location = '';
  formModel.organizer = '';
  formModel.participants = 0;
  formModel.duration = 0;
  formModel.result = undefined;
  formModel.status = '已完成';
  formModel.plan_id = null;
  formModel.plan_title = '';
  formModel.remark = '';
}

/** 关联预案选中回写 plan_title（对齐基线 handlePlanSelect） */
function handlePlanSelect(val: number | null) {
  const plan = planOptions.value.find((p) => p.id === val);
  formModel.plan_title = plan?.name ?? '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmergencyDrillApi.DrillRecord) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name,
    drill_type: row.drill_type ?? '',
    drill_level: row.drill_level ?? '',
    drill_date: row.drill_date ?? '',
    location: row.location ?? '',
    organizer: row.organizer ?? '',
    participants: row.participants ?? 0,
    duration: row.duration ?? 0,
    result: row.result,
    status: row.status ?? '已完成',
    plan_id: row.plan_id ?? null,
    plan_title: row.plan_title ?? '',
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: EmergencyDrillApi.DrillRecord) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('演练名称不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: EmergencyDrillApi.DrillFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateDrill(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createDrill(payload);
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

async function onDelete(row: EmergencyDrillApi.DrillRecord) {
  try {
    await deleteDrill(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
const drillColumns = ref<VxeTableGridColumns>([
  { title: '编号', field: 'no', width: 100, align: 'center' },
  { title: '演练名称', field: 'name', minWidth: 180, align: 'left', showOverflow: 'tooltip' },
  { title: '演练类型', field: 'drill_type', width: 110, align: 'center', formatter: ({ cellValue }) => (cellValue || '-'), slots: { default: 'drill_type' } },
  { title: '演练级别', field: 'drill_level', width: 100, align: 'center', formatter: ({ cellValue }) => (cellValue || '-') },
  { title: '演练日期', field: 'drill_date', width: 120, align: 'center', sortable: true, formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '地点', field: 'location', minWidth: 140, align: 'left', showOverflow: 'tooltip', formatter: ({ cellValue }) => (cellValue || '-') },
  { title: '组织单位', field: 'organizer', minWidth: 140, align: 'left', showOverflow: 'tooltip', formatter: ({ cellValue }) => (cellValue || '-') },
  { title: '参演人数', field: 'participants', width: 100, align: 'center', sortable: true },
  { title: '时长(分钟)', field: 'duration', width: 110, align: 'center' },
  { title: '结果', field: 'result', width: 90, align: 'center', slots: { default: 'result' } },
  { title: '状态', field: 'status', width: 90, align: 'center', sortable: true, slots: { default: 'status' } },
  {
    title: '操作',
    field: 'action',
    width: 200,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
  fetchPlans();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.emergencyDrillsDesc')"
    :title="$t('page.hse.emergencyDrills')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @export="onExport"
        @create="openCreate"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-4 gap-3">
      <NCard :bordered="false">
        <NStatistic label="本年演练次数" :value="statYearCount" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="完成率" :value="statPassRate" suffix="%" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="参与人次" :value="statParticipantsTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="不合格次数" :value="statFailed" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="演练名称/地点"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.drill_type"
          placeholder="演练类型"
          clearable
          :options="DRILL_TYPE_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.result"
          placeholder="演练结果"
          clearable
          :options="RESULT_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.plan_id"
          placeholder="关联预案"
          clearable
          :options="planSelectOptions"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="drillColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #drill_type="{ row }">
        <HseStatusTag :type="DRILL_TYPE_TAG[row.drill_type] || 'neutral'">
          {{ row.drill_type || '-' }}
        </HseStatusTag>
      </template>
      <template #result="{ row }">
        <HseStatusTag :type="RESULT_TAG[row.result] || 'neutral'">
          {{ row.result || '-' }}
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
            确定删除该演练记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增应急演练'
          : formMode === 'edit'
            ? '编辑应急演练'
            : '演练详情'
      "
      preset="card"
      style="width: 720px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="演练名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入演练名称" />
          </NFormItem>
          <NFormItem label="关联预案">
            <NSelect
              v-model:value="formModel.plan_id"
              placeholder="请选择关联预案"
              clearable
              :options="planSelectOptions"
              @update:value="handlePlanSelect"
            />
          </NFormItem>
          <NFormItem label="演练类型" required>
            <NSelect
              v-model:value="formModel.drill_type"
              placeholder="请选择演练类型"
              :options="DRILL_TYPE_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="演练级别">
            <NSelect
              v-model:value="formModel.drill_level"
              placeholder="选填"
              clearable
              :options="DRILL_LEVEL_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="演练日期">
            <NInput v-model:value="formModel.drill_date" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="演练地点">
            <NInput v-model:value="formModel.location" placeholder="请输入演练地点" />
          </NFormItem>
          <NFormItem label="组织单位">
            <NInput v-model:value="formModel.organizer" placeholder="请输入组织单位" />
          </NFormItem>
          <NFormItem label="参演人数">
            <NInputNumber v-model:value="formModel.participants" :min="0" style="width: 100%" placeholder="0" />
          </NFormItem>
          <NFormItem label="时长(分钟)">
            <NInputNumber v-model:value="formModel.duration" :min="0" style="width: 100%" placeholder="0" />
          </NFormItem>
          <NFormItem label="演练结果">
            <NSelect
              v-model:value="formModel.result"
              placeholder="请选择演练结果"
              clearable
              :options="RESULT_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="演练状态">
            <NSelect
              v-model:value="formModel.status"
              placeholder="请选择演练状态"
              :options="STATUS_OPTIONS"
            />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput
            v-model:value="formModel.remark"
            type="textarea"
            :rows="3"
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

    <!-- 通用导入 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入应急演练"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @close="onImportDialogClose"
    />
  </HsePageLayout>
</template>
