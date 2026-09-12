<script lang="ts" setup>
/**
 * 应急预案管理（web-naive 试点 · 阶段04）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/emergency.js）。
 * 预案模块无真实导入端点 → 隐藏「下载模板 / 导入」动作；导出为真实端点。
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
  NText,
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
  createEmergencyPlan,
  deleteEmergencyPlan,
  exportEmergencyPlans,
  getEmergencyPlanList,
  getEmergencyStats,
  updateEmergencyPlan,
  type EmergencyApi,
} from '#/api/hse/emergency';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseEmergencyPlans' });

// ===================== 映射 =====================
const TYPE_LABEL: Record<string, string> = {
  comprehensive: '综合预案',
  special: '专项预案',
  site: '现场处置方案',
};
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  published: 'success',
  pending: 'warning',
  review: 'info',
};
const STATUS_LABEL: Record<string, string> = {
  active: '生效中',
  published: '已发布',
  pending: '待审核',
  review: '复审中',
};
const EXPIRY_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
  permanent: 'neutral',
  unknown: 'neutral',
};
const EXPIRY_LABEL: Record<string, string> = {
  valid: '正常',
  expiring: '临期',
  expired: '已过期',
  permanent: '长期有效',
  unknown: '未知',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmergencyApi.EmergencyPlan[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({ keyword: '', type: '', status: '' });

async function loadData() {
  loading.value = true;
  try {
    const res = await getEmergencyPlanList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      type: (searchForm.type || undefined) as EmergencyApi.PlanType | undefined,
      status: (searchForm.status || undefined) as EmergencyApi.PlanStatus | undefined,
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
const statPublished = ref(0);
const statPendingReview = ref(0);
async function loadStats() {
  try {
    const stats = await getEmergencyStats();
    statTotal.value = stats.total ?? 0;
    statPublished.value = stats.published ?? 0;
    statPendingReview.value = stats.pendingReview ?? 0;
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
  searchForm.type = '';
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
// 接入真实通用导入网关（emergency 模块）：显示 刷新 / 下载模板 / 导入 / 导出 / 新增
const actionState = ref<
  Partial<Record<HseActionKey, { hidden?: boolean }>>
>({});

// 通用导入（真实端点 /import/template/emergency、/import/upload、/import/confirm）
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
} = useGenericImport('emergency');
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
  exportEmergencyPlans()
    .then((blob: Blob) => triggerDownload(blob, '应急预案列表.csv'))
    .catch(() => message.error('导出失败'));
}

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<EmergencyApi.EmergencyFormData>({
  name: '',
  type: 'comprehensive',
  level: '',
  responsible_dept: '',
  responsible_person: '',
  responsible_person_id: null,
  contact_phone: '',
  status: 'pending',
  effective_date: '',
  expiry_date: '',
  description: '',
  plan_content: '',
});

function resetForm() {
  formModel.name = '';
  formModel.type = 'comprehensive';
  formModel.level = '';
  formModel.responsible_dept = '';
  formModel.responsible_person = '';
  formModel.responsible_person_id = null;
  formModel.contact_phone = '';
  formModel.status = 'pending';
  formModel.effective_date = '';
  formModel.expiry_date = '';
  formModel.description = '';
  formModel.plan_content = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmergencyApi.EmergencyPlan) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name,
    type: row.type,
    level: row.level ?? '',
    responsible_dept: row.responsible_dept ?? '',
    responsible_person: row.responsible_person ?? '',
    responsible_person_id: row.responsible_person_id ?? null,
    contact_phone: row.contact_phone ?? '',
    status: row.status,
    effective_date: row.effective_date ?? '',
    expiry_date: row.expiry_date ?? '',
    description: row.description ?? '',
    plan_content: row.plan_content ?? '',
  });
  formOpen.value = true;
}
function openView(row: EmergencyApi.EmergencyPlan) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('预案名称不能为空');
    return;
  }
  formLoading.value = true;
  try {
    const payload: EmergencyApi.EmergencyFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateEmergencyPlan(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createEmergencyPlan(payload);
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

async function onDelete(row: EmergencyApi.EmergencyPlan) {
  try {
    await deleteEmergencyPlan(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
const planColumns = ref<VxeTableGridColumns>([
  { title: '预案名称', field: 'name', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '类型', field: 'type', width: 130, align: 'center', slots: { default: 'type' } },
  { title: '状态', field: 'status', width: 100, align: 'center', sortable: true, slots: { default: 'status' } },
  { title: '负责部门', field: 'responsible_dept', width: 140, align: 'center' },
  { title: '负责人', field: 'responsible_person', width: 100, align: 'center' },
  { title: '生效日期', field: 'effective_date', width: 120, align: 'center' },
  { title: '到期日期', field: 'expiry_date', width: 120, align: 'center' },
  {
    title: '时效状态',
    field: 'expiry_status',
    width: 110,
    align: 'center',
    slots: { default: 'expiry' },
  },
  { title: '创建时间', field: 'created_at', width: 170, align: 'center', sortable: true },
  { title: '更新时间', field: 'updated_at', width: 170, align: 'center', sortable: true },
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
    :description="$t('page.hse.emergencyPlansDesc')"
    :title="$t('page.hse.emergencyPlans')"
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
    <div class="mb-4 grid grid-cols-3 gap-3">
      <NCard :bordered="false">
        <NStatistic label="预案总数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已发布" :value="statPublished" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="待复审" :value="statPendingReview" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="预案名称 / 负责人"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.type"
          placeholder="类型"
          clearable
          :options="[
            { label: '综合预案', value: 'comprehensive' },
            { label: '专项预案', value: 'special' },
            { label: '现场处置方案', value: 'site' },
          ]"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="[
            { label: '生效中', value: 'active' },
            { label: '已发布', value: 'published' },
            { label: '待审核', value: 'pending' },
            { label: '复审中', value: 'review' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="planColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #type="{ row }">
        <NText>{{ TYPE_LABEL[row.type] || row.type || '-' }}</NText>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_LABEL[row.status] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #expiry="{ row }">
        <HseStatusTag :type="EXPIRY_TAG[row.expiry_status] || 'neutral'">
          {{ EXPIRY_LABEL[row.expiry_status] || row.expiry_status || '未知' }}
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
            确定删除该预案吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增应急预案'
          : formMode === 'edit'
            ? '编辑应急预案'
            : '预案详情'
      "
      preset="card"
      style="width: 720px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="预案名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入预案名称" />
          </NFormItem>
          <NFormItem label="预案类型" required>
            <NSelect
              v-model:value="formModel.type"
              :options="[
                { label: '综合预案', value: 'comprehensive' },
                { label: '专项预案', value: 'special' },
                { label: '现场处置方案', value: 'site' },
              ]"
            />
          </NFormItem>
          <NFormItem label="级别">
            <NSelect
              v-model:value="formModel.level"
              placeholder="选填"
              :options="[
                { label: '一级', value: '一级' },
                { label: '二级', value: '二级' },
                { label: '三级', value: '三级' },
              ]"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="formModel.status"
              :options="[
                { label: '生效中', value: 'active' },
                { label: '已发布', value: 'published' },
                { label: '待审核', value: 'pending' },
                { label: '复审中', value: 'review' },
              ]"
            />
          </NFormItem>
          <NFormItem label="负责部门">
            <NInput v-model:value="formModel.responsible_dept" placeholder="选填" />
          </NFormItem>
          <NFormItem label="负责人">
            <NInput v-model:value="formModel.responsible_person" placeholder="选填" />
          </NFormItem>
          <NFormItem label="联系电话">
            <NInput v-model:value="formModel.contact_phone" placeholder="选填" />
          </NFormItem>
          <NFormItem label="生效日期">
            <NInput v-model:value="formModel.effective_date" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="到期日期">
            <NInput v-model:value="formModel.expiry_date" placeholder="YYYY-MM-DD" />
          </NFormItem>
        </div>
        <NFormItem label="预案描述">
          <NInput
            v-model:value="formModel.description"
            type="textarea"
            :rows="2"
            placeholder="选填"
          />
        </NFormItem>
        <NFormItem label="预案内容">
          <NInput
            v-model:value="formModel.plan_content"
            type="textarea"
            :rows="4"
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

    <!-- 通用导入（真实端点：emergency 模块） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入应急预案"
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
