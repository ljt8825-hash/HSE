<script lang="ts" setup>
/**
 * 车辆三检台账（web-naive · 补充缺失业务模块）
 * 后端契约：server/controllers/checkLedgerFactory.js → /api/vehicle-checks
 * 规则映射：CAR001（三检未执行）/ CAR002（记录不规范）/ CAR003（车辆异常）/ FIRE001（消防点检考核点）
 * 能力：服务端分页列表 / 筛选 / 详情抽屉 / 新增·编辑·删除(二次确认) / 批量删除 /
 *      服务端 Excel 导出 / 两段式导入（useCheckLedgerImport）。
 * 边界：不改既有 server 模块；列表返回 snake_case 行，提交用 camelCase payload。
 */
import { onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
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
  confirmVehicleCheckImport,
  createVehicleCheck,
  deleteVehicleCheck,
  deleteVehicleChecks,
  exportVehicleChecks,
  getVehicleCheckList,
  getVehicleCheckTemplate,
  previewVehicleCheckImport,
  updateVehicleCheck,
  type CheckLedgerApi,
} from '#/api/hse/checkLedger';
import { useCheckLedgerImport } from '#/views/hse/_shared/useCheckLedgerImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'SiteVehicleChecks' });

// ===================== 映射 =====================
const INSPECTION_TYPE_OPTIONS = ['日三检', '周检', '月检'];
const STATUS_OPTIONS = ['已完成', '未完成'];
const RECORD_QUALITY_OPTIONS = ['合格', '不合格'];
const FIRE_STATUS_OPTIONS = ['已点检', '未点检'];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<CheckLedgerApi.VehicleCheckRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const searchForm = reactive<CheckLedgerApi.VehicleCheckListParams>({
  keyword: '',
  inspectionType: undefined,
  status: undefined,
  recordQuality: undefined,
  fireCheckStatus: undefined,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getVehicleCheckList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      inspectionType: searchForm.inspectionType || undefined,
      status: searchForm.status || undefined,
      recordQuality: searchForm.recordQuality || undefined,
      fireCheckStatus: searchForm.fireCheckStatus || undefined,
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

function onSearch() {
  currentPage.value = 1;
  loadData();
}
function onReset() {
  Object.assign(searchForm, {
    keyword: '',
    inspectionType: undefined,
    status: undefined,
    recordQuality: undefined,
    fireCheckStatus: undefined,
  });
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}
function onRefresh() {
  loadData();
}

// ===================== 操作栏 / 导入 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({});

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
} = useCheckLedgerImport({
  downloadTemplate: getVehicleCheckTemplate,
  uploadPreview: previewVehicleCheckImport,
  confirmImport: confirmVehicleCheckImport,
  templateFilename: '车辆三检台账导入模板.xlsx',
});
bindImportRefresh(onRefresh);

function handleExport() {
  exportVehicleChecks({
    keyword: searchForm.keyword || undefined,
    inspectionType: searchForm.inspectionType || undefined,
    status: searchForm.status || undefined,
    recordQuality: searchForm.recordQuality || undefined,
    fireCheckStatus: searchForm.fireCheckStatus || undefined,
  }).catch(() => message.error('导出失败'));
}

// ===================== 批量删除 =====================
const gridRef = ref<any>(null);
function getSelectedRows(): CheckLedgerApi.VehicleCheckRow[] {
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
    await deleteVehicleChecks(rows.map((r) => r.id));
    message.success(`已批量删除 ${rows.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<Required<CheckLedgerApi.VehicleCheckPayload>>({
  plate: '',
  vin: '',
  driver: '',
  department: '',
  checkDate: '',
  inspectionType: '日三检',
  status: '已完成',
  recordQuality: '合格',
  abnormalPlate: 0,
  abnormalTurnLight: 0,
  abnormalGps: 0,
  abnormalParking: 0,
  abnormalCamera: 0,
  fireCheckStatus: '已点检',
  fireUnchecked: 0,
  fireExpiredNotReported: 0,
  fireLost: 0,
  remark: '',
});

function resetForm() {
  Object.assign(formModel, {
    plate: '',
    vin: '',
    driver: '',
    department: '',
    checkDate: '',
    inspectionType: '日三检',
    status: '已完成',
    recordQuality: '合格',
    abnormalPlate: 0,
    abnormalTurnLight: 0,
    abnormalGps: 0,
    abnormalParking: 0,
    abnormalCamera: 0,
    fireCheckStatus: '已点检',
    fireUnchecked: 0,
    fireExpiredNotReported: 0,
    fireLost: 0,
    remark: '',
  });
}
function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: CheckLedgerApi.VehicleCheckRow) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    plate: row.plate ?? '',
    vin: row.vin ?? '',
    driver: row.driver ?? '',
    department: row.department ?? '',
    checkDate: row.check_date || '',
    inspectionType: row.inspection_type ?? '日三检',
    status: row.status ?? '已完成',
    recordQuality: row.record_quality ?? '合格',
    abnormalPlate: row.abnormal_plate ?? 0,
    abnormalTurnLight: row.abnormal_turn_light ?? 0,
    abnormalGps: row.abnormal_gps ?? 0,
    abnormalParking: row.abnormal_parking ?? 0,
    abnormalCamera: row.abnormal_camera ?? 0,
    fireCheckStatus: row.fire_check_status ?? '已点检',
    fireUnchecked: row.fire_unchecked ?? 0,
    fireExpiredNotReported: row.fire_expired_not_reported ?? 0,
    fireLost: row.fire_lost ?? 0,
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: CheckLedgerApi.VehicleCheckRow) {
  currentRecord.value = row;
  detailDrawerVisible.value = true;
}

async function onSubmit() {
  if (!formModel.plate) {
    message.warning('请输入车牌号');
    return;
  }
  formLoading.value = true;
  try {
    const payload: CheckLedgerApi.VehicleCheckPayload = {
      ...formModel,
      checkDate: formModel.checkDate || null,
    };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateVehicleCheck(editingId.value, payload);
      message.success('更新成功');
    } else {
      await createVehicleCheck(payload);
      message.success('创建成功');
    }
    formOpen.value = false;
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  } finally {
    formLoading.value = false;
  }
}

// ===================== 删除 =====================
async function onDelete(row: CheckLedgerApi.VehicleCheckRow) {
  try {
    await deleteVehicleCheck(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<CheckLedgerApi.VehicleCheckRow | null>(null);
function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}($|[^\d])/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  return s.slice(0, 10);
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '车牌号', field: 'plate', minWidth: 120, align: 'center' },
  { title: '车架号', field: 'vin', minWidth: 170, align: 'center', showOverflow: 'tooltip' },
  { title: '驾驶员', field: 'driver', minWidth: 110, align: 'center' },
  { title: '部门/班组', field: 'department', minWidth: 130, align: 'center' },
  { title: '检查日期', field: 'check_date', minWidth: 110, align: 'center', formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '检查类型', field: 'inspection_type', minWidth: 100, align: 'center' },
  {
    title: '检查状态',
    field: 'status',
    minWidth: 100,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '记录规范',
    field: 'record_quality',
    minWidth: 100,
    align: 'center',
    slots: { default: 'recordQuality' },
  },
  { title: '号牌污损', field: 'abnormal_plate', minWidth: 90, align: 'center' },
  { title: '转向灯异常', field: 'abnormal_turn_light', minWidth: 100, align: 'center' },
  { title: 'GPS离线', field: 'abnormal_gps', minWidth: 90, align: 'center' },
  { title: '未固定停车', field: 'abnormal_parking', minWidth: 100, align: 'center' },
  { title: '摄像头异常', field: 'abnormal_camera', minWidth: 100, align: 'center' },
  {
    title: '消防点检',
    field: 'fire_check_status',
    minWidth: 110,
    align: 'center',
    slots: { default: 'fireCheck' },
  },
  {
    title: '操作',
    field: 'action',
    width: 180,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(loadData);
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.siteVehicleChecksDesc')"
    :title="$t('page.hse.siteVehicleChecks')"
  >
    <template #extra>
      <NSpace>
        <NButton type="error" secondary @click="onBatchDelete">
          批量删除
        </NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @download-template="onImportTemplate"
          @import="() => (importOpen = true)"
          @export="handleExport"
          @create="openCreate"
        />
      </NSpace>
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="车牌号 / 车架号 / 驾驶员 / 部门" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.inspectionType" placeholder="检查类型" clearable :options="INSPECTION_TYPE_OPTIONS.map((v) => ({ label: v, value: v }))" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.status" placeholder="检查状态" clearable :options="STATUS_OPTIONS.map((v) => ({ label: v, value: v }))" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.recordQuality" placeholder="记录规范" clearable :options="RECORD_QUALITY_OPTIONS.map((v) => ({ label: v, value: v }))" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.fireCheckStatus" placeholder="消防点检" clearable :options="FIRE_STATUS_OPTIONS.map((v) => ({ label: v, value: v }))" />
      </NGi>
    </HseSearchPanel>

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
      <template #status="{ row }">
        <HseStatusTag :type="row.status === '已完成' ? 'success' : 'warning'">
          {{ row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #recordQuality="{ row }">
        <HseStatusTag :type="row.record_quality === '不合格' ? 'warning' : 'success'">
          {{ row.record_quality || '-' }}
        </HseStatusTag>
      </template>
      <template #fireCheck="{ row }">
        <NTag v-if="row.fire_check_status === '未点检'" type="warning">{{ row.fire_check_status }}</NTag>
        <span v-else>{{ row.fire_check_status || '-' }}</span>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="tiny" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="tiny" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="tiny" type="error" quaternary>删除</NButton>
            </template>
            确定删除该车辆三检台账记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" :width="560">
      <NDrawerContent v-if="currentRecord" :title="`车辆三检台账详情 #${currentRecord.id}`">
        <NDescriptions :column="1" bordered label-placement="left">
          <NDescriptionsItem label="车牌号">{{ currentRecord.plate || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="车架号">{{ currentRecord.vin || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="驾驶员">{{ currentRecord.driver || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="部门/班组">{{ currentRecord.department || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="检查日期">{{ formatDate(currentRecord.check_date) }}</NDescriptionsItem>
          <NDescriptionsItem label="检查类型">{{ currentRecord.inspection_type || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="检查状态">
            <HseStatusTag :type="currentRecord.status === '已完成' ? 'success' : 'warning'">
              {{ currentRecord.status || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="记录规范">
            <HseStatusTag :type="currentRecord.record_quality === '不合格' ? 'warning' : 'success'">
              {{ currentRecord.record_quality || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="号牌污损/转向灯/GPS/停车/摄像头">
            {{ currentRecord.abnormal_plate ?? 0 }} / {{ currentRecord.abnormal_turn_light ?? 0 }} / {{ currentRecord.abnormal_gps ?? 0 }} / {{ currentRecord.abnormal_parking ?? 0 }} / {{ currentRecord.abnormal_camera ?? 0 }}
          </NDescriptionsItem>
          <NDescriptionsItem label="消防点检状态">{{ currentRecord.fire_check_status || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="未点检/处">{{ currentRecord.fire_unchecked ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="失效未上报/处">{{ currentRecord.fire_expired_not_reported ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="器材丢失/处">{{ currentRecord.fire_lost ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentRecord.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="currentRecord" type="primary" size="small" @click="openEdit(currentRecord)">编辑</NButton>
        </NSpace>
      </template>
    </NDrawer>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增车辆三检台账' : '编辑车辆三检台账'"
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="车牌号" required>
            <NInput v-model:value="formModel.plate" placeholder="请输入车牌号" />
          </NFormItem>
          <NFormItem label="车架号">
            <NInput v-model:value="formModel.vin" placeholder="选填" />
          </NFormItem>
          <NFormItem label="驾驶员">
            <NInput v-model:value="formModel.driver" placeholder="选填" />
          </NFormItem>
          <NFormItem label="部门/班组">
            <NInput v-model:value="formModel.department" placeholder="选填" />
          </NFormItem>
          <NFormItem label="检查日期">
            <NInput v-model:value="formModel.checkDate" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="检查类型">
            <NSelect v-model:value="formModel.inspectionType" :options="INSPECTION_TYPE_OPTIONS.map((v) => ({ label: v, value: v }))" />
          </NFormItem>
          <NFormItem label="检查状态">
            <NSelect v-model:value="formModel.status" :options="STATUS_OPTIONS.map((v) => ({ label: v, value: v }))" />
          </NFormItem>
          <NFormItem label="记录规范">
            <NSelect v-model:value="formModel.recordQuality" :options="RECORD_QUALITY_OPTIONS.map((v) => ({ label: v, value: v }))" />
          </NFormItem>
          <NFormItem label="号牌污损">
            <NInputNumber v-model:value="formModel.abnormalPlate" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="转向灯异常">
            <NInputNumber v-model:value="formModel.abnormalTurnLight" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="GPS离线">
            <NInputNumber v-model:value="formModel.abnormalGps" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="未固定停车">
            <NInputNumber v-model:value="formModel.abnormalParking" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="摄像头异常">
            <NInputNumber v-model:value="formModel.abnormalCamera" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="消防点检状态">
            <NSelect v-model:value="formModel.fireCheckStatus" :options="FIRE_STATUS_OPTIONS.map((v) => ({ label: v, value: v }))" />
          </NFormItem>
          <NFormItem label="未点检/处">
            <NInputNumber v-model:value="formModel.fireUnchecked" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="失效未上报/处">
            <NInputNumber v-model:value="formModel.fireExpiredNotReported" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="器材丢失/处">
            <NInputNumber v-model:value="formModel.fireLost" :min="0" style="width: 100%" />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" type="textarea" :rows="2" placeholder="选填" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 通用导入（vehicle-checks 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入车辆三检台账"
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