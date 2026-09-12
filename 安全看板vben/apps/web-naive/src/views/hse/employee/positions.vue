<script lang="ts" setup>
/**
 * 岗位管理（web-naive）
 * 服务端分页 / 搜索 / 新增 / 编辑 / 删除
 */
import { computed, reactive, ref, onMounted } from 'vue';
import {
  NButton,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadio,
  NRadioGroup,
  NSpace,
  NSelect,
  NSwitch,
  NTag,
  NTreeSelect,
} from 'naive-ui';
import { $t } from '#/locales';
import { useAccess } from '@vben/access';

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
  createPosition,
  deletePosition,
  getDeptTree,
  getPositionList,
  updatePosition,
  type EmployeeApi,
} from '#/api/hse/employee';
import { message } from '#/adapter/naive';

defineOptions({ name: 'PersonnelPositions' });

const { hasAccessByRoles } = useAccess();
const canEdit = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

// ===================== 枚举映射 =====================
const JOB_CATEGORY_OPTIONS = [
  { label: '管理', value: '管理' },
  { label: '技术', value: '技术' },
  { label: '生产', value: '生产' },
  { label: '辅助', value: '辅助' },
];

const SPECIAL_POST_OPTIONS = [
  { label: '是', value: 'true' },
  { label: '否', value: 'false' },
];

const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
};

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmployeeApi.PositionItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  deptId: null as number | null,
  jobCategory: '' as string | null,
  specialPost: '' as string | null,
});

// 部门树（所属部门筛选 / 表单选择）
const deptTreeData = ref<EmployeeApi.DeptNode[]>([]);

async function loadData() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      deptId: searchForm.deptId || undefined,
      jobCategory: searchForm.jobCategory || undefined,
    };
    if (searchForm.specialPost === 'true') params.isSpecialPost = true;
    else if (searchForm.specialPost === 'false') params.isSpecialPost = false;

    const resp = await getPositionList(params);
    let rows: EmployeeApi.PositionItem[] = [];
    if (Array.isArray(resp)) {
      rows = resp;
      total.value = resp.length;
    } else {
      const result = resp as EmployeeApi.PositionListResult;
      rows = result.list ?? [];
      total.value = result.total ?? 0;
    }
    data.value = rows;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadDeptTree() {
  try {
    const data = await getDeptTree();
    deptTreeData.value = data || [];
  } catch {
    deptTreeData.value = [];
  }
}

// ===================== 搜索 =====================
function onSearch() {
  currentPage.value = 1;
  loadData();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.deptId = null;
  searchForm.jobCategory = null;
  searchForm.specialPost = null;
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

// ===================== 操作栏 =====================
// 基线仅「新增岗位」主按钮（无导入/导出/模板下载）；canEdit 门禁
const actionState = computed<Partial<Record<HseActionKey, { hidden?: boolean }>>>(() => ({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: {},
  create: { hidden: !canEdit.value },
}));

const gridRef = ref<any>(null);

function handleExport() {
  gridRef.value?.gridApi?.grid?.exportData({ type: 'csv' });
}

async function onRefresh() {
  loadData();
}

// ===================== 新增 / 编辑 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);
const formModel = reactive<EmployeeApi.PositionFormData & { status?: string }>({
  position_code: '',
  name: '',
  dept_id: undefined,
  job_category: '',
  is_special_post: false,
  is_safety_critical: false,
  safety_duties: '',
  sort_order: 0,
  status: 'active',
});

function resetForm() {
  formModel.position_code = '';
  formModel.name = '';
  formModel.dept_id = undefined;
  formModel.job_category = '';
  formModel.is_special_post = false;
  formModel.is_safety_critical = false;
  formModel.safety_duties = '';
  formModel.sort_order = 0;
  formModel.status = 'active';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmployeeApi.PositionItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    position_code: row.position_code,
    name: row.name,
    dept_id: row.dept_id,
    job_category: row.job_category ?? '',
    is_special_post: row.is_special_post ?? false,
    is_safety_critical: row.is_safety_critical ?? false,
    safety_duties: row.safety_duties ?? '',
    sort_order: row.sort_order ?? 0,
    status: row.status ?? 'active',
  });
  formOpen.value = true;
}

async function onSubmit() {
  if (!formModel.position_code) {
    message.warning('岗位编码不能为空');
    return;
  }
  if (!formModel.name) {
    message.warning('岗位名称不能为空');
    return;
  }
  // 提示词-122 P3：所属部门必填，避免无归属岗位成为数据孤岛
  if (formModel.dept_id == null) {
    message.warning('请选择所属部门');
    return;
  }
  formLoading.value = true;
  try {
    if (formMode.value === 'edit' && editingId.value != null) {
      await updatePosition(editingId.value, { ...formModel });
      message.success('编辑成功');
    } else {
      await createPosition({ ...formModel });
      message.success('新增成功');
    }
    formOpen.value = false;
    loadData();
  } catch {
    // 拦截器已提示
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: EmployeeApi.PositionItem) {
  try {
    await deletePosition(row.id);
    message.success('删除成功');
    loadData();
  } catch {
    // 拦截器已提示
  }
}

// ===================== 表格列 =====================
const positionColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '岗位编码', field: 'position_code', minWidth: 120, align: 'center' },
  { title: '岗位名称', field: 'name', minWidth: 160, align: 'center', showOverflow: 'tooltip', slots: { default: 'name' } },
  { title: '岗位类别', field: 'job_category', minWidth: 100, align: 'center', slots: { default: 'category' }, formatter: ({ cellValue }) => (cellValue || '-') },
  { title: '特种作业', field: 'is_special_post', minWidth: 100, align: 'center', slots: { default: 'special' } },
  { title: '安全关键', field: 'is_safety_critical', minWidth: 100, align: 'center', slots: { default: 'safety' } },
  { title: '排序', field: 'sort_order', minWidth: 70, align: 'center' },
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
  loadDeptTree();
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.positionsDesc')"
    :title="$t('page.hse.positions')"
  >
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @export="handleExport"
        @create="openCreate"
      />
    </template>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="岗位名称 / 编码"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NTreeSelect
          v-model:value="searchForm.deptId"
          :options="deptTreeData"
          placeholder="所属部门"
          clearable
          :default-expand-all="true"
          key-field="id"
          label-field="name"
          children-field="children"
          style="width: 100%"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.jobCategory"
          placeholder="岗位类别"
          clearable
          :options="JOB_CATEGORY_OPTIONS"
          @update:value="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.specialPost"
          placeholder="特种作业"
          clearable
          :options="SPECIAL_POST_OPTIONS"
          @update:value="onSearch"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="positionColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #name="{ row }">
        <NSpace align="center" justify="center" :size="4">
          <span class="font-medium">{{ row.name }}</span>
          <NTag v-if="row.is_special_post" type="error" size="small" round>特种作业</NTag>
          <NTag v-if="row.is_safety_critical" type="error" size="small" round :bordered="false">安全关键</NTag>
        </NSpace>
      </template>
      <template #category="{ row }">
        <HseStatusTag v-if="row.job_category" type="info">
          {{ row.job_category }}
        </HseStatusTag>
        <span v-else>-</span>
      </template>
      <template #special="{ row }">
        <HseStatusTag :type="row.is_special_post ? 'danger' : 'neutral'">
          {{ row.is_special_post ? '是' : '否' }}
        </HseStatusTag>
      </template>
      <template #safety="{ row }">
        <HseStatusTag :type="row.is_safety_critical ? 'danger' : 'neutral'">
          {{ row.is_safety_critical ? '是' : '否' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status || ''] || 'neutral'">
          {{ row.status === 'active' ? '启用' : row.status === 'inactive' ? '停用' : (row.status || '-') }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace v-if="canEdit" justify="center">
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该岗位吗？
          </NPopconfirm>
        </NSpace>
        <span v-else>-</span>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="formMode === 'create' ? '新增岗位' : '编辑岗位'"
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="岗位编码" required>
            <NInput v-model:value="formModel.position_code" placeholder="如 POS-001" :disabled="formMode === 'edit'" />
          </NFormItem>
          <NFormItem label="岗位名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入岗位名称" />
          </NFormItem>
          <NFormItem label="所属部门" required>
            <NTreeSelect
              v-model:value="formModel.dept_id"
              :options="deptTreeData"
              placeholder="请选择所属部门"
              clearable
              :default-expand-all="true"
              key-field="id"
              label-field="name"
              children-field="children"
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="岗位类别">
            <NSelect
              v-model:value="formModel.job_category"
              placeholder="请选择"
              clearable
              :options="JOB_CATEGORY_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="排序">
            <NInputNumber
              :value="formModel.sort_order"
              :min="0"
              :max="9999"
              style="width: 100%"
              @update:value="(v: number | null) => (formModel.sort_order = v ?? 0)"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NRadioGroup v-model:value="formModel.status">
              <NSpace>
                <NRadio value="active">启用</NRadio>
                <NRadio value="inactive">停用</NRadio>
              </NSpace>
            </NRadioGroup>
          </NFormItem>
        </div>
        <NFormItem label="特种作业岗位">
          <NSwitch v-model:value="formModel.is_special_post" />
          <span class="ml-2 text-xs text-gray-400">如电工、焊工、高处作业等</span>
        </NFormItem>
        <NFormItem label="安全关键岗位">
          <NSwitch v-model:value="formModel.is_safety_critical" />
          <span class="ml-2 text-xs text-gray-400">安全职责关键岗位</span>
        </NFormItem>
        <NFormItem label="安全职责">
          <NInput
            v-model:value="formModel.safety_duties"
            type="textarea"
            :rows="4"
            placeholder="请输入该岗位的安全职责描述"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">取消</NButton>
          <NButton type="primary" :loading="formLoading" @click="onSubmit">
            确定
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
