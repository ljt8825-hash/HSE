<script lang="ts" setup>
/**
 * 风险清单（web-naive 试点 · 阶段04）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/risk-control.js）。
 * 完整业务已恢复：列表 + 统计 + CRUD + 导出 + 通用导入（risk-control 模块）
 * + 详情抽屉（附件/版本/关联隐患/生成隐患）+ 评估工作台 + 风险地图入口（降级）。
 */
import { reactive, ref, computed, onMounted } from 'vue';
import { useAccess } from '@vben/access';

import {
  NButton,
  NCard,
  NDropdown,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NSelect,
  NPopconfirm,
  NSpace,
  NStatistic,
  NInputNumber,
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
  createRisk,
  deleteRisk,
  exportRisks,
  getRiskList,
  getRiskStats,
  updateRisk,
  type RiskControlApi,
} from '#/api/risk-control';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import RiskDetailDrawer from './components/RiskDetailDrawer.vue';
import RiskMapDrawer from './components/RiskMapDrawer.vue';
import RiskAssessModal from './components/RiskAssessModal.vue';
import { message } from '#/adapter/naive';

defineOptions({ name: 'RiskControlList' });

// 动作级权限：编辑 / 删除 / 评估 / 导入 仅 admin、safety_manager 可见
const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ===================== 映射 =====================
const LEVEL_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  一级: 'danger',
  二级: 'warning',
  三级: 'info',
  四级: 'success',
};
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  正常: 'success',
  已处置: 'info',
  监控中: 'warning',
};
const EXPIRY_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  normal: 'success',
  expiring: 'warning',
  expired: 'danger',
  permanent: 'neutral',
  unknown: 'neutral',
};
const EXPIRY_LABEL: Record<string, string> = {
  normal: '正常',
  expiring: '临期',
  expired: '已过期',
  permanent: '长期有效',
  unknown: '未知',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<RiskControlApi.RiskSource[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  level: '',
  type: '',
  area: '',
  expiryStatus: '',
  levels: [] as string[],
  status: '',
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getRiskList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      level: searchForm.level || undefined,
      type: searchForm.type || undefined,
      area: searchForm.area || undefined,
      expiryStatus: (searchForm.expiryStatus || undefined) as
        | RiskControlApi.ExpiryStatus
        | ''
        | undefined,
      levels: searchForm.levels?.length ? searchForm.levels : undefined,
      status: searchForm.status || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    } as any);
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
const statLevel1 = ref(0);
const statExpiring = ref(0);
const statExpired = ref(0);
async function loadStats() {
  try {
    const stats = await getRiskStats();
    statTotal.value = stats.total ?? 0;
    statLevel1.value = stats.byLevel?.['一级'] ?? 0;
    statExpiring.value = stats.expiring ?? 0;
    statExpired.value = stats.expired ?? 0;
  } catch {
    /* ignore */
  }
}

// 19D §6.1：风险等级分布（基于当前列表 data，按 level 字段计数）
const levelStats = computed(() => {
  const list = data.value || [];
  return {
    level1: list.filter((r) => r.level === '一级').length,
    level2: list.filter((r) => r.level === '二级').length,
    level3: list.filter((r) => r.level === '三级').length,
    level4: list.filter((r) => r.level === '四级').length,
  };
});

function onSearch() {
  currentPage.value = 1;
  loadData();
  loadStats();
  // 地图打开时同步刷新完整地图数据集（按当前筛选条件）
  if (mapOpen.value) {
    loadMapData();
  }
}
function onReset() {
  searchForm.keyword = '';
  searchForm.level = '';
  searchForm.type = '';
  searchForm.area = '';
  searchForm.expiryStatus = '';
  searchForm.levels = [];
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

/** 列表↔地图联动：marker 点击后高亮列表行（仅当前页存在该行时生效） */
function rowClassName({ row }: { row: RiskControlApi.RiskSource }) {
  return mapHighlightedId.value != null && mapHighlightedId.value === row.id
    ? 'risk-row-highlighted'
    : '';
}

// ===================== 操作栏 =====================
// 接入真实通用导入网关（risk-control 模块）：刷新 / 下载模板 / 导入 / 导出 / 新增
const actionState = ref<
  Partial<Record<HseActionKey, { hidden?: boolean }>>
>({});

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
} = useGenericImport('risk-control');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}
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
function onExport() {
  exportRisks()
    .then((blob: Blob) => triggerDownload(blob, '风险清单.csv'))
    .catch(() => message.error('导出失败'));
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
interface RiskForm {
  name: string;
  type: string;
  category: string;
  location: string;
  accidentType: string;
  level: '一级' | '二级' | '三级' | '四级';
  area: string;
  sheet: string;
  status: '正常' | '已处置' | '监控中';
  assessmentDate: string;
  reviewCycle: number | null;
  measures: string;
  emergency: string;
}

const formModel = reactive<RiskForm>({
  name: '',
  type: '',
  category: '',
  location: '',
  accidentType: '',
  level: '一级',
  area: '',
  sheet: '',
  status: '正常',
  assessmentDate: '',
  reviewCycle: null,
  measures: '',
  emergency: '',
});

function resetForm() {
  formModel.name = '';
  formModel.type = '';
  formModel.category = '';
  formModel.location = '';
  formModel.accidentType = '';
  formModel.level = '一级';
  formModel.area = '';
  formModel.sheet = '';
  formModel.status = '正常';
  formModel.assessmentDate = '';
  formModel.reviewCycle = null;
  formModel.measures = '';
  formModel.emergency = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: RiskControlApi.RiskSource) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name,
    type: row.type,
    category: row.category,
    location: row.location,
    accidentType: row.accidentType,
    level: row.level,
    area: row.area,
    sheet: row.sheet,
    status: row.status,
    assessmentDate: row.assessmentDate ?? '',
    reviewCycle: row.reviewCycle ?? null,
    measures: row.measures,
    emergency: row.emergency,
  });
  formOpen.value = true;
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('风险点名称不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: RiskControlApi.RiskFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateRisk(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createRisk(payload);
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

async function onDelete(row: RiskControlApi.RiskSource) {
  try {
    await deleteRisk(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 批量删除 =====================
const gridRef = ref<any>(null);
function getSelectedRows(): any[] {
  try {
    return gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() ?? [];
  } catch {
    return [];
  }
}
async function onBatchDelete() {
  const rows = getSelectedRows();
  if (!rows.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  try {
    for (const row of rows) {
      await deleteRisk(row.id);
    }
    message.success(`已批量删除 ${rows.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情抽屉 / 地图 / 评估 =====================
const detailOpen = ref(false);
const detailId = ref<number | null>(null);
const detailName = ref('');
function openDetail(row: RiskControlApi.RiskSource) {
  detailId.value = row.id;
  detailName.value = row.name;
  detailOpen.value = true;
}

const mapOpen = ref(false);
const mapHighlightedId = ref<number | null>(null);
/** 完整地图数据集（按当前筛选条件全量拉取，不随列表分页截断） */
const mapRisks = ref<RiskControlApi.RiskSource[]>([]);
const mapLoading = ref(false);
const mapError = ref('');

/** 按当前筛选条件拉取完整地图数据集（page:1, pageSize:500 覆盖系统全量） */
async function loadMapData() {
  mapLoading.value = true;
  mapError.value = '';
  try {
    const res = await getRiskList({
      page: 1,
      pageSize: 500,
      keyword: searchForm.keyword || undefined,
      level: searchForm.level || undefined,
      type: searchForm.type || undefined,
      area: searchForm.area || undefined,
      expiryStatus: (searchForm.expiryStatus || undefined) as
        | RiskControlApi.ExpiryStatus
        | ''
        | undefined,
      levels: searchForm.levels?.length ? searchForm.levels : undefined,
      status: searchForm.status || undefined,
    } as any);
    mapRisks.value = res.list ?? [];
  } catch {
    mapRisks.value = [];
    mapError.value = '地图数据集获取失败';
  } finally {
    mapLoading.value = false;
  }
}

function openMap() {
  mapOpen.value = true;
  // 打开地图即按当前筛选条件加载完整数据集（地图标记/乡镇计数不受列表分页影响）
  loadMapData();
}
/** 地图 marker 点击 → 高亮列表行（列表↔地图联动） */
function onMapMarkerClick(risk: RiskControlApi.RiskSource) {
  mapHighlightedId.value = risk.id;
}
/** 列表操作列「定位」→ 打开地图抽屉并定位该风险点 */
function onLocateOnMap(row: RiskControlApi.RiskSource) {
  mapHighlightedId.value = row.id;
  mapOpen.value = true;
  loadMapData();
}

const assessOpen = ref(false);
const assessId = ref<number | null>(null);
const assessName = ref('');
const assessMethod = ref<string | null>(null);
const assessScore = ref<number | string | null>(null);
function openAssess(row: RiskControlApi.RiskSource) {
  assessId.value = row.id;
  assessName.value = row.name;
  assessMethod.value = row.assessmentMethod ?? null;
  assessScore.value = row.assessmentScore ?? null;
  assessOpen.value = true;
}
function moreOptions(row: RiskControlApi.RiskSource) {
  const options = [
    {
      label: '定位',
      key: 'locate',
      props: { onClick: () => onLocateOnMap(row) },
    },
  ];
  if (canEdit.value) {
    options.push({
      label: '评估',
      key: 'assess',
      props: { onClick: () => openAssess(row) },
    });
  }
  return options;
}
function onAssessSuccess() {
  onRefresh();
}

// ===================== 表格列 =====================
function formatDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

const riskColumns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '风险点名称', field: 'name', minWidth: 180, align: 'center', showOverflow: 'tooltip' },
  { title: '类型', field: 'type', minWidth: 120, align: 'center' },
  {
    title: '等级',
    field: 'level',
    minWidth: 90,
    align: 'center',
    sortable: true,
    slots: { default: 'level' },
  },
  { title: '责任对象', field: 'accidentType', minWidth: 140, align: 'center' },
  { title: '区域', field: 'area', minWidth: 120, align: 'center' },
  {
    title: '状态',
    field: 'status',
    minWidth: 100,
    align: 'center',
    sortable: true,
    slots: { default: 'status' },
  },
  {
    title: '时效状态',
    field: 'expiryStatus',
    minWidth: 110,
    align: 'center',
    slots: { default: 'expiry' },
  },
  { title: '评估日期', field: 'assessmentDate', minWidth: 130, align: 'center', sortable: true, formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  {
    title: '操作',
    field: 'action',
    width: 240,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(async () => {
  await Promise.all([loadData(), loadStats()]);
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.riskControlDesc')"
    :title="$t('page.hse.riskControl')"
  >
    <template #extra>
      <NSpace>
        <NButton secondary @click="openMap">风险地图</NButton>
        <NButton
          type="error"
          secondary
          @click="onBatchDelete"
        >
          批量删除
        </NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="onExport"
          @create="openCreate"
        />
      </NSpace>
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <NCard :bordered="false">
        <NStatistic label="风险总数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="一级风险" :value="statLevel1" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="临期" :value="statExpiring" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已过期" :value="statExpired" />
      </NCard>
    </div>

    <!-- 19D §6.1 风险等级分布 -->
    <div class="mb-4 mt-3">
      <div class="mb-2 block text-sm text-[#7f7f7f]">风险等级分布</div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NCard :bordered="false">
          <div class="text-sm text-[#7f7f7f]">一级风险</div>
          <div class="mt-2 text-2xl font-bold" style="color: #d03050">
            {{ levelStats.level1 }}
          </div>
        </NCard>
        <NCard :bordered="false">
          <div class="text-sm text-[#7f7f7f]">二级风险</div>
          <div class="mt-2 text-2xl font-bold" style="color: #f0a020">
            {{ levelStats.level2 }}
          </div>
        </NCard>
        <NCard :bordered="false">
          <div class="text-sm text-[#7f7f7f]">三级风险</div>
          <div class="mt-2 text-2xl font-bold" style="color: #18a058">
            {{ levelStats.level3 }}
          </div>
        </NCard>
        <NCard :bordered="false">
          <div class="text-sm text-[#7f7f7f]">四级风险</div>
          <div class="mt-2 text-2xl font-bold" style="color: #909399">
            {{ levelStats.level4 }}
          </div>
        </NCard>
      </div>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="风险点名称 / 编号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.level"
          placeholder="等级"
          clearable
          :options="[
            { label: '一级', value: '一级' },
            { label: '二级', value: '二级' },
            { label: '三级', value: '三级' },
            { label: '四级', value: '四级' },
          ]"
        />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.type" placeholder="类型" clearable />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.area" placeholder="区域" clearable />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.expiryStatus"
          placeholder="时效状态"
          clearable
          :options="[
            { label: '正常', value: 'normal' },
            { label: '临期', value: 'expiring' },
            { label: '已过期', value: 'expired' },
            { label: '长期有效', value: 'permanent' },
          ]"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.levels"
          placeholder="风险等级（多选）"
          multiple
          clearable
          :options="[
            { label: '一级', value: '一级' },
            { label: '二级', value: '二级' },
            { label: '三级', value: '三级' },
            { label: '四级', value: '四级' },
          ]"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="[
            { label: '正常', value: '正常' },
            { label: '已处置', value: '已处置' },
            { label: '监控中', value: '监控中' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="riskColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :row-class-name="rowClassName"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #level="{ row }">
        <HseStatusTag :type="LEVEL_TAG[row.level] || 'neutral'">
          {{ row.level || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="EXPIRY_TAG[row.expiryStatus] || 'neutral'">
          {{ EXPIRY_LABEL[row.expiryStatus] || row.expiryStatus || '未知' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="small" type="primary" quaternary @click="openDetail(row)">
            查看
          </NButton>
          <NButton
            v-if="canEdit"
            size="small"
            type="primary"
            quaternary
            @click="openEdit(row)"
          >
            编辑
          </NButton>
          <NPopconfirm v-if="canEdit" @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该风险点吗？
          </NPopconfirm>
          <NDropdown :options="moreOptions(row)">
            <NButton size="small" type="primary" quaternary>更多</NButton>
          </NDropdown>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增风险点'
          : formMode === 'edit'
            ? '编辑风险点'
            : '风险点详情'
      "
      preset="card"
      style="width: 760px; max-width: 94vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="风险点名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入风险点名称" />
          </NFormItem>
          <NFormItem label="等级">
            <NSelect
              v-model:value="formModel.level"
              :options="[
                { label: '一级', value: '一级' },
                { label: '二级', value: '二级' },
                { label: '三级', value: '三级' },
                { label: '四级', value: '四级' },
              ]"
            />
          </NFormItem>
          <NFormItem label="类型">
            <NInput v-model:value="formModel.type" placeholder="选填" />
          </NFormItem>
          <NFormItem label="类别">
            <NInput v-model:value="formModel.category" placeholder="选填" />
          </NFormItem>
          <NFormItem label="位置">
            <NInput v-model:value="formModel.location" placeholder="选填" />
          </NFormItem>
          <NFormItem label="责任对象">
            <NInput v-model:value="formModel.accidentType" placeholder="选填" />
          </NFormItem>
          <NFormItem label="区域">
            <NInput v-model:value="formModel.area" placeholder="选填" />
          </NFormItem>
          <NFormItem label="所属表单">
            <NInput v-model:value="formModel.sheet" placeholder="选填" />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="formModel.status"
              :options="[
                { label: '正常', value: '正常' },
                { label: '已处置', value: '已处置' },
                { label: '监控中', value: '监控中' },
              ]"
            />
          </NFormItem>
          <NFormItem label="评估日期">
            <NInput v-model:value="formModel.assessmentDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="复评周期(月)">
            <NInputNumber
              v-model:value="formModel.reviewCycle"
              :min="0"
              placeholder="0=长期有效"
              style="width: 100%"
            />
          </NFormItem>
        </div>
        <NFormItem label="管控措施">
          <NInput
            v-model:value="formModel.measures"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="应急措施">
          <NInput
            v-model:value="formModel.emergency"
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

    <!-- 详情抽屉（附件 / 版本 / 关联隐患 / 评估入口） -->
    <RiskDetailDrawer
      :open="detailOpen"
      :risk-id="detailId ?? undefined"
      :risk-name="detailName"
      @update:open="(v: boolean) => (detailOpen = v)"
      @refreshed="onRefresh"
    />

    <!-- 风险地图抽屉（真实 AMap 交互地图，完整数据集 + 加载/失败状态） -->
    <RiskMapDrawer
      :open="mapOpen"
      :risks="mapRisks"
      :data-loading="mapLoading"
      :data-error="mapError"
      :highlighted-id="mapHighlightedId"
      @update:open="(v: boolean) => (mapOpen = v)"
      @marker-click="onMapMarkerClick"
    />

    <!-- 评估工作台（行内直接调用） -->
    <RiskAssessModal
      v-model:open="assessOpen"
      :risk-id="assessId ?? undefined"
      :risk-name="assessName"
      :current-method="assessMethod"
      :current-score="assessScore"
      @success="onAssessSuccess"
    />

    <!-- 通用导入（真实端点：risk-control 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入风险清单"
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

<style scoped>
/* 列表↔地图联动：地图 marker 点击后高亮对应列表行 */
:deep(.risk-row-highlighted) {
  background: hsl(var(--primary) / 0.12) !important;
}
:deep(.risk-row-highlighted td) {
  color: hsl(var(--primary));
  font-weight: 600;
}
</style>
