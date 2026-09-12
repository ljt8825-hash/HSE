<script lang="ts" setup>
/**
 * 责任书管理（web-naive · 月度考核 RESP-002 数据源）
 * 能力：统计卡（总份/已签/缺签/缺签员工）/服务端分页列表（年度·签署状态·类型·乡镇·关键词筛选）/
 *     新建责任书（支持多员工批量创建，默认未签，实时发布缺签扣分）/签核（撤销缺签扣分）/查看/删除（撤销缺签扣分）。
 * 契约：server/routes/hse-responsibility-forms.js + api/hse/responsibility-forms.ts。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NDatePicker,
  NDrawer,
  NDrawerContent,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
} from 'naive-ui';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatCard, HseStatusTag } from '#/components/hse';
import {
  createResponsibilityForms,
  deleteResponsibilityForm,
  getResponsibilityFormList,
  getResponsibilityFormStats,
  signResponsibilityForm,
  type ResponsibilityFormApi,
} from '#/api/hse/responsibility-forms';
import { getEmployeeSelectorBatch, getEmployeeSelectorList, type EmployeeSelectorItem } from '#/api/hse/employee';
import { message } from '#/adapter/naive';

defineOptions({ name: 'ResponsibilityFormManagement' });

const loading = ref(false);
const creating = ref(false);
const dataSource = ref<ResponsibilityFormApi.ResponsibilityForm[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  year: undefined as number | undefined,
  sign_status: undefined as string | undefined,
  form_type: undefined as string | undefined,
  township: undefined as string | undefined,
});

const signOptions = [
  { label: '未签', value: 'unsigned' },
  { label: '已签', value: 'signed' },
];
const typeOptions = [{ label: '安全生产责任书', value: '安全生产责任书' }];

const stats = reactive({ total: 0, signed: 0, unsigned: 0, unsignedEmployees: 0 });

const columns = computed<VxeTableGridColumns>(() => [
  { title: '责任书编号', field: 'formCode', minWidth: 150, align: 'center', showOverflow: 'tooltip' },
  { title: '类型', field: 'formType', minWidth: 120, align: 'center' },
  { title: '年度', field: 'year', minWidth: 70, align: 'center' },
  { title: '员工', field: 'employeeName', minWidth: 110, align: 'center' },
  { title: '所属部门', field: 'department', minWidth: 130, align: 'center', showOverflow: 'tooltip' },
  {
    title: '签署状态',
    field: 'signStatus',
    minWidth: 90,
    align: 'center',
    slots: { default: 'signCell' },
  },
  {
    title: '签署日期',
    field: 'signDate',
    minWidth: 110,
    align: 'center',
    formatter: ({ row }: any) => (row.signDate ? String(row.signDate).slice(0, 10) : '-'),
  },
  { title: '操作', field: 'action', width: 160, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

const SIGN_TEXT: Record<string, string> = { unsigned: '未签', signed: '已签' };
const SIGN_TAG: Record<string, 'warning' | 'success'> = { unsigned: 'warning', signed: 'success' };

async function loadStats() {
  try {
    const s = await getResponsibilityFormStats({ year: searchForm.year });
    stats.total = s.total ?? 0;
    stats.signed = s.signed ?? 0;
    stats.unsigned = s.unsigned ?? 0;
    stats.unsignedEmployees = s.unsignedEmployees ?? 0;
  } catch {
    /* 拦截器已提示 */
  }
}

async function loadData() {
  loading.value = true;
  try {
    const res = await getResponsibilityFormList({
      page: page.value,
      size: pageSize.value,
      keyword: searchForm.keyword || undefined,
      year: searchForm.year,
      sign_status: searchForm.sign_status,
      form_type: searchForm.form_type,
      township: searchForm.township || undefined,
    });
    dataSource.value = res.list || [];
    total.value = res.total || 0;
  } catch {
    dataSource.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  page.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.year = undefined;
  searchForm.sign_status = undefined;
  searchForm.form_type = undefined;
  searchForm.township = undefined;
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 新建 =====================
const createModalOpen = ref(false);
const employeeSearching = ref(false);
const employeeOptions = ref<any[]>([]);
const createForm = reactive<{ employeeIds: number[]; formType: string; year: number | null }>({
  employeeIds: [],
  formType: '安全生产责任书',
  year: new Date().getFullYear(),
});

async function searchEmployees(keyword?: string) {
  employeeSearching.value = true;
  try {
    const list = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 20 });
    employeeOptions.value = list.map((e: EmployeeSelectorItem) => ({
      label: `${e.name}${e.position_name ? `（${e.position_name}）` : ''}`,
      value: e.employee_id,
    }));
  } catch {
    employeeOptions.value = [];
  } finally {
    employeeSearching.value = false;
  }
}

function showCreateModal() {
  createForm.employeeIds = [];
  createForm.formType = '安全生产责任书';
  createForm.year = new Date().getFullYear();
  createModalOpen.value = true;
}

async function handleCreate() {
  if (!createForm.employeeIds.length) {
    message.warning('请至少选择一名员工');
    return;
  }
  creating.value = true;
  try {
    await createResponsibilityForms(
      createForm.employeeIds.map((id) => ({
        employeeId: id,
        formType: createForm.formType,
        year: createForm.year ?? new Date().getFullYear(),
        signStatus: 'unsigned',
      })),
    );
    message.success('创建成功（未签责任书已触发缺签扣分）');
    createModalOpen.value = false;
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  } finally {
    creating.value = false;
  }
}

// ===================== 签核 / 详情 / 删除 =====================
const viewDrawerOpen = ref(false);
const viewData = ref<ResponsibilityFormApi.ResponsibilityForm | null>(null);
const bindName = ref('');

async function handleSign(record: ResponsibilityFormApi.ResponsibilityForm) {
  try {
    await signResponsibilityForm(record.id);
    message.success('签核成功，撤销缺签扣分');
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleView(record: ResponsibilityFormApi.ResponsibilityForm) {
  viewData.value = record;
  bindName.value = record.employeeName || '';
  viewDrawerOpen.value = true;
}

async function handleDelete(record: ResponsibilityFormApi.ResponsibilityForm) {
  try {
    await deleteResponsibilityForm(record.id);
    message.success('删除成功');
    loadData();
    loadStats();
  } catch {
    /* 拦截器已提示 */
  }
}

const actionState = ref<Record<string, { hidden?: boolean }>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

onMounted(() => {
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout title="责任书管理">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="onSearch" @create="showCreateModal" />
    </template>

    <NSpace vertical :size="16">
      <NSpace :size="16" wrap>
        <HseStatCard title="责任书总数" :value="String(stats.total)" icon="lucide:file-signature" color="primary" />
        <HseStatCard title="已签" :value="String(stats.signed)" icon="lucide:check" color="success" />
        <HseStatCard title="缺签份数" :value="String(stats.unsigned)" icon="lucide:alert-triangle" color="warning" />
        <HseStatCard title="缺签员工数" :value="String(stats.unsignedEmployees)" icon="lucide:users" color="danger" />
      </NSpace>

      <HseSearchPanel @query="onSearch" @reset="onReset">
        <NSelect
          v-model:value="searchForm.year"
          placeholder="年度"
          clearable
          :options="[2026, 2025, 2024, 2023].map((y) => ({ label: `${y}年`, value: y }))"
          style="min-width: 120px"
        />
        <NSelect
          v-model:value="searchForm.sign_status"
          placeholder="签署状态"
          clearable
          :options="signOptions"
          style="min-width: 110px"
        />
        <NSelect
          v-model:value="searchForm.form_type"
          placeholder="类型"
          clearable
          :options="typeOptions"
          style="min-width: 150px"
        />
        <NInput v-model:value="searchForm.keyword" placeholder="搜索员工/编号" clearable style="min-width: 200px" @keyup.enter="onSearch" />
      </HseSearchPanel>

      <HseDataGrid
        :columns="columns"
        :data="dataSource"
        :loading="loading"
        :pager="true"
        :total="total"
        auto-width
        @page-change="onPageChange"
      >
        <template #signCell="{ row }">
          <HseStatusTag :type="SIGN_TAG[row.signStatus] || 'warning'">
            {{ SIGN_TEXT[row.signStatus] || row.signStatus }}
          </HseStatusTag>
        </template>
        <template #action="{ row }">
          <NSpace justify="center" :size="4">
            <NButton
              v-if="row.signStatus === 'unsigned'"
              size="small"
              type="primary"
              quaternary
              @click="handleSign(row)"
            >
              签核
            </NButton>
            <NButton size="small" quaternary @click="handleView(row)">查看</NButton>
            <NPopconfirm @positive-click="handleDelete(row)">
              <template #trigger>
                <NButton size="small" type="error" quaternary>删除</NButton>
              </template>
              确认删除该责任书？
            </NPopconfirm>
          </NSpace>
        </template>
      </HseDataGrid>
    </NSpace>

    <NModal
      v-model:show="createModalOpen"
      title="新建责任书"
      preset="card"
      style="width: 560px; max-width: 92vw"
    >
      <NForm label-placement="top">
        <NFormItem label="签署员工（可多选）" required>
          <NSelect
            v-model:value="createForm.employeeIds"
            multiple
            filterable
            remote
            :loading="employeeSearching"
            :options="employeeOptions"
            :consistent-menu-width="false"
            placeholder="搜索并选择员工"
            @search="searchEmployees"
            @focus="createForm.employeeIds.length === 0 && searchEmployees('')"
          />
        </NFormItem>
        <NFormItem label="责任书类型">
          <NSelect v-model:value="createForm.formType" :options="typeOptions" />
        </NFormItem>
        <NFormItem label="年度">
          <NSelect v-model:value="createForm.year" :options="[2026, 2025, 2024, 2023].map((y) => ({ label: `${y}年`, value: y }))" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="createModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="creating" @click="handleCreate">创建</NButton>
        </NSpace>
      </template>
    </NModal>

    <NDrawer v-model:show="viewDrawerOpen" :width="560" placement="right" :show-mask="false">
      <NDrawerContent closable title="责任书详情">
        <NSpin v-if="viewData" :show="false">
          <NDescriptions label-placement="left" :column="1" bordered>
            <NDescriptionsItem label="责任书编号">{{ viewData.formCode }}</NDescriptionsItem>
            <NDescriptionsItem label="类型">{{ viewData.formType }}</NDescriptionsItem>
            <NDescriptionsItem label="年度">{{ viewData.year }} 年</NDescriptionsItem>
            <NDescriptionsItem label="员工">{{ bindName }}</NDescriptionsItem>
            <NDescriptionsItem label="所属部门">{{ viewData.department || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="签字状态">
              <HseStatusTag :type="SIGN_TAG[viewData.signStatus] || 'warning'">
                {{ SIGN_TEXT[viewData.signStatus] || viewData.signStatus }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="签署日期">{{ viewData.signDate ? String(viewData.signDate).slice(0, 10) : '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="备注">{{ viewData.remark || '-' }}</NDescriptionsItem>
          </NDescriptions>
        </NSpin>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>