<script lang="ts" setup>
/**
 * 员工列表（web-naive 试点 · 阶段04）
 * 统一使用 HSE 公共组件栈：HsePageLayout / HseSearchPanel / HseActionBar / HseStatusTag / HseDataGrid / HseImportDialog
 * 接入真实 API（server/routes/hse-employee.js），服务端分页 + 三态排序透传 + 真实 total。
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
import EmployeeHistoryDrawer from '#/views/hse/employee/components/EmployeeHistoryDrawer.vue';
import OrgTransferModal from '#/views/hse/employee/components/OrgTransferModal.vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createEmployee,
  deleteEmployee,
  downloadEmployeeImportTemplate,
  getEmployeeList,
  getEmployeeStats,
  getFilterOptions,
  getRosterAuthority,
  importEmployeeExcel,
  previewEmployeeExcel,
  updateEmployee,
  type EmployeeApi,
} from '#/api/hse/employee';
import { dialog, message } from '#/adapter/naive';

defineOptions({ name: 'PersonnelEmployee' });

// 动作级权限：新增 / 编辑 / 删除 / 导入 仅 admin、safety_manager 可见
const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ===================== 状态枚举映射（后端存英文，前端展示中文） =====================
const STATUS_LABEL: Record<string, string> = {
  active: '在职',
  left: '离职',
  pending: '待岗',
  retired: '退休',
  rehire: '返聘',
};
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  left: 'neutral',
  pending: 'warning',
  retired: 'info',
  rehire: 'info',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmployeeApi.EmployeeItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

// 统计卡点击筛选（total/active/left/overage，'' 表示未点卡片，走默认列表口径）
const activeCard = ref('');

const searchForm = reactive({
  keyword: '',
  personCategory: '',
  gender: '',
  status: '',
  deptName: '',
  positionName: '',
});

const deptOptions = ref<{ label: string; value: string }[]>([]);
const positionOptions = ref<{ label: string; value: string }[]>([]);

async function loadData() {
  loading.value = true;
  try {
    const params: EmployeeApi.EmployeeListParams = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      personCategory: (searchForm.personCategory || undefined) as
        | EmployeeApi.PersonCategory
        | undefined,
      gender: searchForm.gender || undefined,
      status: (searchForm.status || undefined) as EmployeeApi.OrgStatus | undefined,
      deptName: searchForm.deptName || undefined,
      positionName: searchForm.positionName || undefined,
    };
    // 统计卡联动
    if (activeCard.value === 'overage') {
      params.overageOnly = true;
    } else if (activeCard.value === 'active') {
      params.employmentRelation = 'active';
    } else if (activeCard.value === 'left') {
      params.employmentRelation = 'left';
    } else if (activeCard.value === 'total') {
      params.employmentRelation = 'total';
    }
    const res = await getEmployeeList(params);
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    // 鉴权 / 网络错误已由全局拦截器提示，此处仅清空
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    const stats = await getEmployeeStats();
    // 卡片口径在后端 /employees/stats 已计算：
    //   listTotal=员工总数(与列表一致)、activeCount=在职、leftCount=离职、overAgeCount=超龄
    statTotal.value = stats.listTotal ?? 0;
    statActive.value = stats.activeCount ?? 0;
    statLeft.value = stats.leftCount ?? 0;
    statOverAge.value = stats.overAgeCount ?? 0;
  } catch {
    /* ignore */
  }
}

async function loadFilterOptions() {
  try {
    const opts = await getFilterOptions();
    deptOptions.value = (opts.departments ?? []).map((d) => ({
      label: d,
      value: d,
    }));
    positionOptions.value = (opts.positions ?? []).map((p) => ({
      label: p,
      value: p,
    }));
  } catch {
    /* ignore */
  }
}

// 统计卡
const statTotal = ref(0);
const statActive = ref(0);
const statLeft = ref(0);
const statOverAge = ref(0);

function onCardClick(key: string) {
  // 再次点击同一卡取消筛选，恢复默认列表
  activeCard.value = activeCard.value === key ? '' : key;
  currentPage.value = 1;
  loadData();
}

function onSearch() {
  activeCard.value = '';
  currentPage.value = 1;
  loadData();
  loadStats();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.personCategory = '';
  searchForm.gender = '';
  searchForm.status = '';
  searchForm.deptName = '';
  searchForm.positionName = '';
  onSearch();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 操作栏 =====================
// 员工无导出端点：隐藏导出动作（保留刷新 / 下载模板 / 导入 / 新增）
// 新增 / 下载模板 / 导入 受 canEdit 控制（admin / safety_manager 可见）
const actionState = computed<Partial<Record<HseActionKey, { hidden?: boolean }>>>(() => ({
  export: {},
  create: canEdit.value ? {} : { hidden: true },
  downloadTemplate: canEdit.value ? {} : { hidden: true },
  import: canEdit.value ? {} : { hidden: true },
}));

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}
function onDownloadTemplate() {
  downloadEmployeeImportTemplate()
    .then((blob: Blob) => triggerDownload(blob, '员工导入模板.xlsx'))
    .catch(() => message.error('下载模板失败'));
}
function onImport() {
  importOpen.value = true;
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

// ===================== 新增 / 编辑 / 查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<EmployeeApi.EmployeeFormData & { id?: number }>({
  id: undefined,
  employee_code: '',
  id_card: '',
  name: '',
  gender: '',
  birth_date: '',
  phone: '',
  id_address: '',
  person_category: undefined,
  person_type: '',
  is_public_welfare: false,
  employment_relation: '',
  leave_date: '',
});

function resetForm() {
  formModel.id = undefined;
  formModel.employee_code = '';
  formModel.id_card = '';
  formModel.name = '';
  formModel.gender = '';
  formModel.birth_date = '';
  formModel.phone = '';
  formModel.id_address = '';
  formModel.person_category = undefined;
  formModel.person_type = '';
  formModel.is_public_welfare = false;
  formModel.employment_relation = '';
  formModel.leave_date = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmployeeApi.EmployeeItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    id: row.id,
    employee_code: row.employee_code ?? '',
    id_card: row.id_card ?? '',
    name: row.name,
    gender: row.gender ?? '',
    birth_date: row.birth_date ?? '',
    phone: row.phone ?? '',
    id_address: row.id_address ?? '',
    person_category: row.person_category,
    person_type: row.person_type ?? '',
    is_public_welfare: row.is_public_welfare ?? false,
    employment_relation: row.employment_relation ?? '',
    leave_date: row.leave_date ?? '',
  });
  formOpen.value = true;
}
function openView(row: EmployeeApi.EmployeeItem) {
  resetForm();
  formMode.value = 'view';
  Object.assign(formModel, {
    id: row.id,
    employee_code: row.employee_code ?? '',
    id_card: row.id_card ?? '',
    name: row.name,
    gender: row.gender ?? '',
    birth_date: row.birth_date ?? '',
    phone: row.phone ?? '',
    id_address: row.id_address ?? '',
    person_category: row.person_category,
    person_type: row.person_type ?? '',
    is_public_welfare: row.is_public_welfare ?? false,
    employment_relation: row.employment_relation ?? '',
    leave_date: row.leave_date ?? '',
  });
  formOpen.value = true;
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('姓名不能为空');
    return;
  }

  // 【以花名册为准】编辑态且明确填写了用工关系状态时，与花名册权威值比对，
  // 不一致则提醒并询问是否仍按人工填写值保存（避免历史遗留/人工写错被误覆盖或误写）。
  if (formMode.value === 'edit' && editingId.value != null && formModel.employment_relation) {
    const authority = await getRosterAuthority(editingId.value).catch(() => null);
    if (
      authority?.found &&
      authority.employment_relation &&
      authority.employment_relation !== formModel.employment_relation
    ) {
      const confirmed = await new Promise<boolean>((resolve) => {
        dialog.warning({
          title: '用工状态与花名册不一致',
          content: `花名册记录该员工用工关系状态为「${authority.employment_relation}」，您当前填写为「${formModel.employment_relation}」。是否仍按您填写的内容保存？`,
          positiveText: '仍保存',
          negativeText: '取消',
          onPositiveClick: () => resolve(true),
          onNegativeClick: () => resolve(false),
          onClose: () => resolve(false),
          onMaskClick: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
  }

  formLoading.value = true;
  try {
    const payload: EmployeeApi.EmployeeFormData = {
      employee_code: formModel.employee_code || undefined,
      id_card: formModel.id_card || undefined,
      name: formModel.name,
      gender: formModel.gender || undefined,
      birth_date: formModel.birth_date || undefined,
      phone: formModel.phone || undefined,
      id_address: formModel.id_address || undefined,
      person_category: formModel.person_category,
      person_type: formModel.person_type || undefined,
      is_public_welfare: formModel.is_public_welfare,
      employment_relation: formModel.employment_relation || undefined,
      leave_date: formModel.leave_date || undefined,
    };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateEmployee(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createEmployee(payload);
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

async function onDelete(row: EmployeeApi.EmployeeItem) {
  try {
    await deleteEmployee(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 调岗 / 人事变动历史 =====================
const transferOpen = ref(false);
const transferEmployeeId = ref<number | null>(null);
const transferEmployeeName = ref('');
const historyOpen = ref(false);
const historyEmployeeId = ref<number | null>(null);
const historyEmployeeName = ref('');

function openTransfer(row: EmployeeApi.EmployeeItem) {
  transferEmployeeId.value = row.id;
  transferEmployeeName.value = row.name;
  transferOpen.value = true;
}
function openHistory(row: EmployeeApi.EmployeeItem) {
  historyEmployeeId.value = row.id;
  historyEmployeeName.value = row.name;
  historyOpen.value = true;
}

const moreOptions = [
  { key: 'transfer', label: '调岗' },
  { key: 'history', label: '历史' },
];

function handleMoreSelect(key: string | number, row: EmployeeApi.EmployeeItem) {
  if (key === 'transfer') openTransfer(row);
  else if (key === 'history') openHistory(row);
}

function onTransferSuccess() {
  onRefresh();
}

// ===================== 导入 =====================
const importOpen = ref(false);
const importFile = ref<File | null>(null);
const importPreviewColumns = ref<VxeTableGridColumns>([
  { title: '姓名', field: 'name', minWidth: 120, align: 'center' },
  { title: '工号', field: 'employee_code', width: 120, align: 'center' },
  { title: '身份证号', field: 'id_card', minWidth: 160, align: 'left' },
  { title: '电话', field: 'phone', width: 140, align: 'center' },
  { title: '人员分类', field: 'person_category', width: 110, align: 'center' },
]);
const importPreviewData = ref<any[]>([]);
const importPreviewError = ref<string | null>(null);
const importConfirming = ref(false);
const importResult = ref<{ success: boolean; message: string } | null>(null);

function onUpload(file: File) {
  importFile.value = file;
  importPreviewError.value = null;
  importPreviewData.value = [];
  previewEmployeeExcel(file)
    .then((res) => {
      importPreviewData.value = res.preview ?? [];
      if (res.errors && res.errors.length > 0) {
        importPreviewError.value = res.errors.join('；');
      }
    })
    .catch(() => {
      importPreviewError.value = '文件解析失败，请检查文件格式';
    });
}
function onConfirmImport() {
  if (!importFile.value) return;
  importConfirming.value = true;
  importResult.value = null;
  importEmployeeExcel(importFile.value)
    .then((res) => {
      importResult.value = {
        success: (res.failed ?? 0) === 0,
        message: `成功 ${res.success ?? 0} 条，失败 ${res.failed ?? 0} 条`,
      };
      onRefresh();
    })
    .catch(() => {
      importResult.value = { success: false, message: '导入失败' };
    })
    .finally(() => {
      importConfirming.value = false;
    });
}
function onImportClose() {
  importFile.value = null;
  importPreviewData.value = [];
  importPreviewError.value = null;
  importResult.value = null;
}

function formatDate(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// ===================== 导出 / 批量删除 =====================
const gridRef = ref<any>(null);

function handleExport() {
  gridRef.value?.gridApi?.grid?.exportData({ type: 'csv' });
}

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
    await Promise.all(rows.map((row) => deleteEmployee(row.id)));
    message.success(`已删除 ${rows.length} 条`);
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 表格列 =====================
const employeeColumns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '工号', field: 'employee_code', width: 120, align: 'center' },
  { title: '姓名', field: 'name', minWidth: 120, align: 'center' },
  { title: '性别', field: 'gender', width: 80, align: 'center' },
  { title: '身份证号', field: 'id_card', minWidth: 180, align: 'center' },
  { title: '电话', field: 'phone', width: 140, align: 'center' },
  { title: '部门', field: 'dept_name', minWidth: 140, align: 'center' },
  { title: '职位', field: 'position_name', minWidth: 140, align: 'center' },
  {
    title: '状态',
    field: 'org_status',
    width: 100,
    align: 'center',
    slots: { default: 'status' },
  },
  {
    title: '入职日期',
    field: 'start_date',
    width: 130,
    align: 'center',
    formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-'),
  },
  {
    title: '离职日期',
    field: 'leave_date',
    width: 130,
    align: 'center',
    formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-'),
  },
  {
    title: '操作',
    field: 'action',
    width: 240,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
  loadFilterOptions();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.employeeDesc')"
    :title="$t('page.hse.employee')"
  >
    <template #extra>
      <NSpace>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @export="handleExport"
          @download-template="onDownloadTemplate"
          @import="onImport"
          @create="openCreate"
        />
        <NButton
          type="error"
          @click="onBatchDelete"
        >
          批量删除
        </NButton>
      </NSpace>
    </template>

    <!-- 统计卡（点击联动下方列表） -->
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <NCard
        :bordered="activeCard === 'total'"
        hoverable
        class="cursor-pointer transition-all hover:shadow-md"
        @click="onCardClick('total')"
      >
        <NStatistic label="员工总数" :value="statTotal" />
      </NCard>
      <NCard
        :bordered="activeCard === 'active'"
        hoverable
        class="cursor-pointer transition-all hover:shadow-md"
        @click="onCardClick('active')"
      >
        <NStatistic label="在职人员" :value="statActive" />
      </NCard>
      <NCard
        :bordered="activeCard === 'left'"
        hoverable
        class="cursor-pointer transition-all hover:shadow-md"
        @click="onCardClick('left')"
      >
        <NStatistic label="离职人员" :value="statLeft" />
      </NCard>
      <NCard
        :bordered="activeCard === 'overage'"
        hoverable
        class="cursor-pointer transition-all hover:shadow-md"
        @click="onCardClick('overage')"
      >
        <NStatistic label="超龄人员" :value="statOverAge" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名 / 工号 / 电话"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.personCategory"
          placeholder="人员分类"
          clearable
          :options="[
            { label: '适龄人员', value: '适龄人员' },
            { label: '超龄人员', value: '超龄人员' },
          ]"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gender"
          placeholder="性别"
          clearable
          :options="[
            { label: '男', value: '男' },
            { label: '女', value: '女' },
          ]"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="[
            { label: '在职', value: 'active' },
            { label: '待岗', value: 'pending' },
            { label: '离职', value: 'left' },
            { label: '退休', value: 'retired' },
            { label: '返聘', value: 'rehire' },
          ]"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.deptName"
          placeholder="部门"
          clearable
          :options="deptOptions"
          filterable
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.positionName"
          placeholder="岗位"
          clearable
          :options="positionOptions"
          filterable
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="employeeColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #driver="{ row }">
        <NText :type="row.is_driver ? 'success' : 'default'">
          {{ row.is_driver ? '是' : '否' }}
        </NText>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.org_status] || 'neutral'">
          {{ STATUS_LABEL[row.org_status] || row.org_status || '-' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton
            v-if="canEdit"
            size="small"
            type="primary" quaternary
            @click="openEdit(row)"
          >
            编辑
          </NButton>
          <NPopconfirm v-if="canEdit" @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该员工吗？
          </NPopconfirm>
          <NDropdown :options="moreOptions" @select="(key) => handleMoreSelect(key, row)">
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
          ? '新增员工'
          : formMode === 'edit'
            ? '编辑员工'
            : '员工详情'
      "
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="姓名" required>
            <NInput v-model:value="formModel.name" placeholder="请输入姓名" />
          </NFormItem>
          <NFormItem label="工号">
            <NInput v-model:value="formModel.employee_code" placeholder="选填" />
          </NFormItem>
          <NFormItem label="性别">
            <NSelect
              v-model:value="formModel.gender"
              placeholder="选填"
              :options="[
                { label: '男', value: '男' },
                { label: '女', value: '女' },
              ]"
            />
          </NFormItem>
          <NFormItem label="人员分类">
            <NSelect
              v-model:value="formModel.person_category"
              placeholder="选填"
              :options="[
                { label: '适龄人员', value: '适龄人员' },
                { label: '超龄人员', value: '超龄人员' },
              ]"
            />
          </NFormItem>
          <NFormItem label="身份证号">
            <NInput v-model:value="formModel.id_card" placeholder="选填" />
          </NFormItem>
          <NFormItem label="电话">
            <NInput v-model:value="formModel.phone" placeholder="选填" />
          </NFormItem>
          <NFormItem label="出生日期">
            <NInput v-model:value="formModel.birth_date" placeholder="YYYY-MM-DD" />
          </NFormItem>
          <NFormItem label="人员类型">
            <NInput v-model:value="formModel.person_type" placeholder="选填" />
          </NFormItem>
          <NFormItem
            v-if="formMode === 'edit'"
            label="用工关系状态"
            :extra="'以花名册为准；与花名册不一致时保存会提醒'"
          >
            <NSelect
              v-model:value="formModel.employment_relation"
              placeholder="选填"
              clearable
              :options="[
                { label: '正式员工', value: '正式员工' },
                { label: '辞职', value: '辞职' },
                { label: '死亡', value: '死亡' },
                { label: '待岗', value: '待岗' },
                { label: '退休', value: '退休' },
              ]"
            />
          </NFormItem>
          <NFormItem v-if="formMode === 'edit'" label="离职日期">
            <NInput v-model:value="formModel.leave_date" placeholder="YYYY-MM-DD，选填" />
          </NFormItem>
        </div>
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

    <!-- 导入弹窗 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入员工"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onDownloadTemplate"
      @upload="onUpload"
      @confirm="onConfirmImport"
      @close="onImportClose"
    />

    <!-- 调岗 / 组织分配 -->
    <OrgTransferModal
      :open="transferOpen"
      :employee-id="transferEmployeeId ?? undefined"
      :employee-name="transferEmployeeName"
      @update:open="(v: boolean) => (transferOpen = v)"
      @success="onTransferSuccess"
    />

    <!-- 人事变动历史 -->
    <EmployeeHistoryDrawer
      :open="historyOpen"
      :employee-id="historyEmployeeId ?? undefined"
      :employee-name="historyEmployeeName"
      @update:open="(v: boolean) => (historyOpen = v)"
    />
  </HsePageLayout>
</template>
