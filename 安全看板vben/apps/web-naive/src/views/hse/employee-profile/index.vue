<script lang="ts" setup>
/**
 * 员工档案中心（web-naive）
 * 服务端分页 / 搜索 / 详情抽屉
 */
import { h, reactive, ref, onMounted } from 'vue';
import {
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NGi,
  NInput,
  NSelect,
  NSpace,
  NTable,
  NTag,
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
  getProfileList,
  getProfileDetail,
  getProfileAssignments,
  getProfileDriverInfo,
  type EmployeeProfileApi,
} from '#/api/hse/employee-profile';
import { message } from '#/adapter/naive';

defineOptions({ name: 'PersonnelProfile' });

// ===================== 工具函数 =====================
function formatDate(date?: string | null): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('zh-CN');
  } catch {
    return date;
  }
}

function maskIdCard(idCard?: string): string {
  if (!idCard) return '-';
  if (idCard.startsWith('ENC:')) return '***加密数据***';
  return idCard.replace(/^(.{6}).*(.{4})$/, '$1********$2');
}

function maskPhone(phone?: string): string {
  if (!phone) return '-';
  if (phone.startsWith('ENC:')) return '***加密数据***';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

// ===================== 枚举映射 =====================
const GENDER_MAP: Record<string, string> = { '1': '男', '2': '女', '0': '未知' };

const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  left: 'warning',
  pending: 'warning',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmployeeProfileApi.ProfileListItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  isDriver: '' as string | null,
});

async function loadData() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
    };
    if (searchForm.isDriver === 'true') params.is_driver = true;
    else if (searchForm.isDriver === 'false') params.is_driver = false;
    const res = await getProfileList(params);
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// ===================== 搜索 =====================
function onSearch() {
  currentPage.value = 1;
  loadData();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.isDriver = null;
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  refresh: { hidden: false },
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: {},
  create: { hidden: true },
});

async function onRefresh() {
  await loadData();
}

// ===================== 详情抽屉 =====================
const detailVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref<EmployeeProfileApi.ProfileDetail | null>(null);
const assignments = ref<EmployeeProfileApi.AssignmentItem[]>([]);
const driverInfo = ref<EmployeeProfileApi.DriverInfo | null>(null);

async function openDetail(id: number) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const [detailRes, assignRes, driverRes] = await Promise.all([
      getProfileDetail(id),
      getProfileAssignments(id),
      getProfileDriverInfo(id),
    ]);
    currentDetail.value = detailRes;
    assignments.value = assignRes;
    driverInfo.value = driverRes;
  } catch {
    message.error('加载档案详情失败');
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  detailVisible.value = false;
  currentDetail.value = null;
  assignments.value = [];
  driverInfo.value = null;
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
// 档案中心无真实删除 API（操作列「删除」为占位），批量删除仅从本地视图移除选中行
function onBatchDelete() {
  const rows = getSelectedRows();
  if (!rows.length) {
    message.warning('请先勾选要删除的记录');
    return;
  }
  const ids = new Set(rows.map((r) => r.id));
  data.value = data.value.filter((d) => !ids.has(d.id));
  message.success(`已移除 ${ids.size} 条（本地）`);
}

// ===================== 表格列 =====================
const profileColumns = ref<VxeTableGridColumns>([
  { type: 'checkbox', width: 50, align: 'center', fixed: 'left' },
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '姓名', field: 'name', minWidth: 100, align: 'center', slots: { default: 'name' } },
  { title: '性别', field: 'gender', minWidth: 70, align: 'center' },
  { title: '年龄', field: 'age', minWidth: 70, align: 'center' },
  { title: '所属部门', field: 'roster_department', minWidth: 150, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '职位', field: 'roster_position', minWidth: 120, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '在职区域', field: 'roster_work_area', minWidth: 130, align: 'center', showOverflow: 'tooltip', formatter: ({ cellValue }) => cellValue || '-' },
  { title: '入职日期', field: 'hire_date', minWidth: 110, align: 'center', slots: { default: 'hireDate' }, formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '离职日期', field: 'leave_date', minWidth: 110, align: 'center', formatter: ({ cellValue }) => (cellValue ? formatDate(cellValue) : '-') },
  { title: '驾驶员', field: 'is_driver', minWidth: 80, align: 'center', slots: { default: 'driver' } },
  { title: '状态', field: 'status', minWidth: 80, align: 'center', slots: { default: 'status' } },
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
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.employeeProfileDesc')"
    :title="$t('page.hse.employeeProfile')"
  >
    <template #extra>
      <NSpace>
        <HseActionBar
          :actions="actionState"
          @refresh="onRefresh"
          @export="handleExport"
        />
        <NButton
          type="error"
          @click="onBatchDelete"
        >
          批量删除
        </NButton>
      </NSpace>
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名 / 工号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.isDriver"
          placeholder="是否驾驶员"
          clearable
          :options="[
            { label: '是', value: 'true' },
            { label: '否', value: 'false' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="profileColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #name="{ row }">
        <NButton size="small" type="primary" quaternary @click="openDetail(row.id)">
          {{ row.name }}
        </NButton>
      </template>
      <template #hireDate="{ row }">
        {{ formatDate(row.hire_date) }}
      </template>
      <template #driver="{ row }">
        <HseStatusTag :type="row.is_driver ? 'info' : 'neutral'">
          {{ row.is_driver ? '是' : '否' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status || ''] || 'neutral'">
          {{ row.status === 'active' ? '在职' : (row.status === 'left' ? '离职' : (row.status || '-')) }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openDetail(row.id)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openDetail(row.id)">
            编辑
          </NButton>
          <NButton size="small" type="error" quaternary @click="openDetail(row.id)">
            删除
          </NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer
      v-model:show="detailVisible"
      :width="640"
      placement="right"
    >
      <NDrawerContent title="员工档案详情" :closable="true" @close="closeDetail">
        <div v-if="detailLoading" class="py-8 text-center text-gray-400">加载中...</div>
        <div v-else-if="currentDetail">
          <!-- 基础信息 -->
          <h4 class="mb-2 text-sm font-semibold">基础信息</h4>
          <NDescriptions :column="2" bordered size="small" class="mb-4">
            <NDescriptionsItem label="姓名">{{ currentDetail.basic.name }}</NDescriptionsItem>
            <NDescriptionsItem label="员工编号">{{ currentDetail.basic.employee_code || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="性别">{{ GENDER_MAP[currentDetail.basic.gender || ''] || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="年龄">{{ currentDetail.basic.age || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="出生日期">{{ formatDate(currentDetail.basic.birth_date) }}</NDescriptionsItem>
            <NDescriptionsItem label="电话">{{ maskPhone(currentDetail.basic.phone) }}</NDescriptionsItem>
            <NDescriptionsItem label="身份证">{{ maskIdCard(currentDetail.basic.id_card) }}</NDescriptionsItem>
            <NDescriptionsItem label="人员类型">{{ currentDetail.basic.person_type || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="人员类别">{{ currentDetail.basic.person_category || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <HseStatusTag :type="STATUS_TAG[currentDetail.basic.status || ''] || 'neutral'">
                {{ currentDetail.basic.status === 'active' ? '在职' : (currentDetail.basic.status === 'left' ? '离职' : (currentDetail.basic.status || '-')) }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="是否公益岗">{{ currentDetail.basic.is_public_welfare ? '是' : '否' }}</NDescriptionsItem>
            <NDescriptionsItem label="创建时间">{{ formatDate(currentDetail.basic.created_at) }}</NDescriptionsItem>
          </NDescriptions>

          <!-- 当前组织信息 -->
          <h4 class="mb-2 text-sm font-semibold">当前组织信息</h4>
          <NDescriptions v-if="currentDetail.currentOrg" :column="2" bordered size="small" class="mb-4">
            <NDescriptionsItem label="所属组织">{{ currentDetail.currentOrg.org_name || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="组织编码">{{ currentDetail.currentOrg.org_code || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="组织类型">{{ currentDetail.currentOrg.org_type || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="所属部门">{{ currentDetail.currentOrg.dept_name || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="单元类型">{{ currentDetail.currentOrg.unit_type || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="岗位">{{ currentDetail.currentOrg.position_name || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="岗位编码">{{ currentDetail.currentOrg.position_code || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="风险等级">{{ currentDetail.currentOrg.risk_level || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="直属上级">{{ currentDetail.currentOrg.supervisor_name || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="任职状态">{{ currentDetail.currentOrg.assignment_status || '-' }}</NDescriptionsItem>
            <NDescriptionsItem label="开始日期">{{ formatDate(currentDetail.currentOrg.start_date) }}</NDescriptionsItem>
            <NDescriptionsItem label="结束日期">{{ formatDate(currentDetail.currentOrg.end_date) }}</NDescriptionsItem>
          </NDescriptions>
          <div v-else class="mb-4 text-sm text-gray-400">暂无组织信息</div>

          <!-- 驾驶员信息 -->
          <h4 class="mb-2 text-sm font-semibold">驾驶员信息</h4>
          <NDescriptions v-if="driverInfo" :column="2" bordered size="small" class="mb-4">
            <NDescriptionsItem label="是否驾驶员">
              <HseStatusTag :type="driverInfo.is_driver ? 'info' : 'neutral'">
                {{ driverInfo.is_driver ? '是' : '否' }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem v-if="driverInfo.license_type" label="驾照类型">{{ driverInfo.license_type }}</NDescriptionsItem>
          </NDescriptions>
          <div v-else class="mb-4 text-sm text-gray-400">暂无驾驶员信息</div>

          <!-- 任职历史 -->
          <h4 class="mb-2 text-sm font-semibold">任职历史</h4>
          <NTable
            :data="assignments"
            :bordered="false"
            size="small"
            :max-height="240"
            :columns="[
              { title: '组织', key: 'org_name', width: 130 },
              { title: '所属部门', key: 'dept_name', width: 120 },
              { title: '岗位', key: 'position_name', width: 120 },
              { title: '开始日期', key: 'start_date', width: 100, render: (row: any) => formatDate(row.start_date) },
              { title: '结束日期', key: 'end_date', width: 100, render: (row: any) => formatDate(row.end_date) },
              { title: '状态', key: 'is_current', width: 70, render: (row: any) => h(NTag, { type: row.is_current ? 'success' : 'default' }, { default: () => row.is_current ? '当前' : '历史' }) },
            ]"
          />
        </div>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
