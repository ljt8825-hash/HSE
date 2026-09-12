<script lang="ts" setup>
/**
 * 培训考核要求管理（web-naive）
 * 统一使用 HSE 公共组件栈；接入真实 API。
 */
import { reactive, ref, onMounted } from 'vue';

import {
  NButton,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
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
  createTrainingRequirement,
  deleteTrainingRequirement,
  getTrainingRequirements,
  updateTrainingRequirement,
  type TrainingRequirementApi,
} from '#/api/hse/training';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseTrainingRequirements' });

// ===================== 映射 =====================
const CYCLE_TAG: Record<
  string,
  'success' | 'info' | 'warning' | 'danger' | 'neutral'
> = {
  '年度': 'info',
  '半年': 'warning',
  '季度': 'success',
  '月度': 'neutral',
  '专项': 'danger',
  '入职': 'warning',
};

const cycleOptions = [
  { label: '年度', value: '年度' },
  { label: '半年', value: '半年' },
  { label: '季度', value: '季度' },
  { label: '月度', value: '月度' },
  { label: '专项', value: '专项' },
  { label: '入职', value: '入职' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<TrainingRequirementApi.TrainingRequirement[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getTrainingRequirements({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
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

function onSearch() {
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
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
} = useGenericImport('training-requirements');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await loadData();
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<TrainingRequirementApi.RequirementFormData>({
  positionId: 0,
  positionName: '',
  trainingName: '',
  trainingCycle: '年度',
  isRequired: true,
  durationMinutes: 60,
  remark: '',
});

function resetForm() {
  formModel.positionId = 0;
  formModel.positionName = '';
  formModel.trainingName = '';
  formModel.trainingCycle = '年度';
  formModel.isRequired = true;
  formModel.durationMinutes = 60;
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: TrainingRequirementApi.TrainingRequirement) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    positionId: row.positionId,
    positionName: row.positionName,
    trainingName: row.trainingName,
    trainingCycle: row.trainingCycle,
    isRequired: row.isRequired,
    durationMinutes: row.durationMinutes,
    remark: row.remark || '',
  });
  formOpen.value = true;
}

function openView(row: TrainingRequirementApi.TrainingRequirement) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.trainingName) {
    message.warning('培训名称不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: TrainingRequirementApi.RequirementFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateTrainingRequirement(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createTrainingRequirement(payload);
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

async function onDelete(row: TrainingRequirementApi.TrainingRequirement) {
  try {
    await deleteTrainingRequirement(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
const columns = ref<VxeTableGridColumns>([
  { title: '岗位', field: 'positionName', width: 150, align: 'center' },
  { title: '培训名称', field: 'trainingName', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '培训周期', field: 'trainingCycle', width: 120, align: 'center', slots: { default: 'cycle' }, sortable: true },
  { title: '是否必须', field: 'isRequired', width: 100, align: 'center', slots: { default: 'required' } },
  { title: '培训时长(分钟)', field: 'durationMinutes', width: 130, align: 'center', sortable: true },
  { title: '备注', field: 'remark', minWidth: 150, align: 'left', showOverflow: 'tooltip' },
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
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.trainingRequirementsDesc')"
    :title="$t('page.hse.trainingRequirements')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @create="openCreate"
      />
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="岗位/培训名称"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="columns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #cycle="{ row }">
        <HseStatusTag :type="CYCLE_TAG[row.trainingCycle] || 'neutral'">
          {{ row.trainingCycle || '-' }}
        </HseStatusTag>
      </template>
      <template #required="{ row }">
        <HseStatusTag :type="row.isRequired ? 'danger' : 'neutral'">
          {{ row.isRequired ? '必须' : '可选' }}
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
            确定删除该培训要求吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增培训要求'
          : formMode === 'edit'
            ? '编辑培训要求'
            : '培训要求详情'
      "
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="岗位名称" required>
            <NInput v-model:value="formModel.positionName" placeholder="请输入岗位名称" />
          </NFormItem>
          <NFormItem label="培训名称" required>
            <NInput v-model:value="formModel.trainingName" placeholder="请输入培训名称" />
          </NFormItem>
          <NFormItem label="培训周期" required>
            <NSelect v-model:value="formModel.trainingCycle" :options="cycleOptions" />
          </NFormItem>
          <NFormItem label="是否必须">
            <NSelect
              v-model:value="formModel.isRequired as any"
              :options="[
                { label: '必须', value: true },
                { label: '可选', value: false },
              ] as any"
            />
          </NFormItem>
          <NFormItem label="培训时长(分钟)" required>
            <NInputNumber v-model:value="formModel.durationMinutes" :min="1" style="width: 100%" />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" type="textarea" :rows="2" placeholder="其他说明" />
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
      title="导入培训要求"
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
