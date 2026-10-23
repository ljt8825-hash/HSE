<script lang="ts" setup>
/**
 * 应急物资管理（web-naive · 阶段04）
 * 统一使用 HSE 公共组件栈；接入真实 API（server/routes/emergency.js）。
 */
import { reactive, ref, computed, onMounted } from 'vue';

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
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
  EXPIRY_TAG as STATUS_TAG,
  EXPIRY_LABEL as STATUS_LABEL,
  EMERGENCY_MATERIAL_CATEGORY_TAG as CATEGORY_TAG,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  createMaterial,
  deleteMaterial,
  exportMaterials,
  getMaterialList,
  getMaterialStats,
  updateMaterial,
  type EmergencyMaterialApi,
} from '#/api/hse/emergency';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseEmergencyMaterials' });

// ===================== 映射 =====================
const CATEGORY_OPTIONS = [
  { label: '救援装备', value: '救援装备' },
  { label: '个人防护', value: '个人防护' },
  { label: '医疗急救', value: '医疗急救' },
  { label: '消防器材', value: '消防器材' },
  { label: '通讯设备', value: '通讯设备' },
  { label: '应急照明', value: '应急照明' },
  { label: '其他物资', value: '其他物资' },
];

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmergencyMaterialApi.EmergencyMaterial[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({ keyword: '', category: '', status: '' });

async function loadData() {
  loading.value = true;
  try {
    const res = await getMaterialList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      category: searchForm.category || undefined,
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
const statExpiring = ref(0);
const statExpired = ref(0);
const statNormal = computed(() => (statTotal.value || 0) - (statExpiring.value || 0) - (statExpired.value || 0));

async function loadStats() {
  try {
    const stats = await getMaterialStats();
    statTotal.value = stats.total ?? 0;
    statExpiring.value = stats.expiring ?? 0;
    statExpired.value = stats.expired ?? 0;
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
  searchForm.category = '';
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
// 06C-3 对齐基线：应急物资基线无导入入口（后端无 emergency_materials 导入配置），仅导出+新增
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
    const blob = await exportMaterials();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '应急物资列表.csv';
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
const formModel = reactive<EmergencyMaterialApi.MaterialFormData>({
  name: '',
  category: '',
  spec: '',
  quantity: 0,
  location: '',
  responsible_person: '',
  expire_date: '',
  remark: '',
});

function resetForm() {
  formModel.name = '';
  formModel.category = '';
  formModel.spec = '';
  formModel.quantity = 0;
  formModel.location = '';
  formModel.responsible_person = '';
  formModel.expire_date = '';
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}
function openEdit(row: EmergencyMaterialApi.EmergencyMaterial) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    name: row.name,
    category: row.category ?? '',
    spec: row.spec ?? '',
    quantity: row.quantity ?? 0,
    location: row.location ?? '',
    responsible_person: row.responsible_person ?? '',
    expire_date: row.expire_date ?? '',
    remark: row.remark ?? '',
  });
  formOpen.value = true;
}
function openView(row: EmergencyMaterialApi.EmergencyMaterial) {
  openEdit(row);
  formMode.value = 'view';
}

async function onSubmit() {
  if (!formModel.name) {
    message.warning('物资名称不能为空');
    return;
  }
  if (!formModel.category) {
    message.warning('请选择物资类别');
    return;
  }
  formLoading.value = true;
  try {
    const payload: EmergencyMaterialApi.MaterialFormData = { ...formModel };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateMaterial(editingId.value, payload);
      message.success('编辑成功');
    } else {
      await createMaterial(payload);
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

async function onDelete(row: EmergencyMaterialApi.EmergencyMaterial) {
  try {
    await deleteMaterial(row.id);
    message.success('删除成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 行编辑（快速修改；弹窗编辑保留） =====================
const gridRef = ref<InstanceType<typeof HseDataGrid>>();
/** 行内编辑中的行 id（区别于弹窗 editingId） */
const rowEditingId = ref<string | null>(null);

const editRules: Record<string, any[]> = {
  quantity: [
    {
      validator: (params: any) => {
        const v = params?.rowValue;
        if (v === null || v === undefined || v === '') return true;
        return Number(v) >= 0 || '数量不能为负数';
      },
    },
  ],
};

function startEdit(row: EmergencyMaterialApi.EmergencyMaterial) {
  rowEditingId.value = String(row.id);
  gridRef.value?.beginEdit(row);
}

async function onEditSave(payload: { row: EmergencyMaterialApi.EmergencyMaterial }) {
  rowEditingId.value = null;
  const row = payload?.row;
  if (!row?.id) return;
  try {
    // 行编辑仅提交可编辑字段（status 由后端按到期日派生，不在此编辑）
    await updateMaterial(row.id, {
      quantity: row.quantity == null ? 0 : Number(row.quantity),
      expire_date: row.expire_date || null,
    });
    message.success('保存成功');
    onRefresh();
  } catch {
    /* 拦截器已提示 */
  }
}

function onEditCancel() {
  rowEditingId.value = null;
  // VXE 已自动回滚原始数据（keepSource），无需额外处理
}

// ===================== 表格列 =====================
const materialColumns = ref<VxeTableGridColumns>([
  { title: '物资名称', field: 'name', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  { title: '类别', field: 'category', minWidth: 110, align: 'center', slots: { default: 'category' } },
  { title: '规格型号', field: 'spec', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '数量', field: 'quantity', minWidth: 80, align: 'center', sortable: true, editRender: { name: 'input', props: { type: 'number' } } },
  { title: '存放位置', field: 'location', minWidth: 150, align: 'center', showOverflow: 'tooltip' },
  { title: '责任人', field: 'responsible_person', minWidth: 100, align: 'center' },
  { title: '状态', field: 'status', minWidth: 90, align: 'center', sortable: true, slots: { default: 'status' } },
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
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.emergencyMaterialsDesc')"
    :title="$t('page.hse.emergencyMaterials')"
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
        <NStatistic label="物资总数" :value="statTotal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="正常" :value="statNormal" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="临期(30天内)" :value="statExpiring" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="已过期" :value="statExpired" />
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="物资名称/规格/存放位置"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.category"
          placeholder="物资类别"
          clearable
          :options="CATEGORY_OPTIONS"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="[
            { label: '正常', value: 'normal' },
            { label: '临期', value: 'expiring' },
            { label: '过期', value: 'expired' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      ref="gridRef"
      :columns="materialColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      :editable="true"
      :edit-rules="editRules"
      @page-change="onPageChange"
      @sort-change="onSortChange"
      @edit-save="onEditSave"
      @edit-cancel="onEditCancel"
    >
      <template #category="{ row }">
        <HseStatusTag :type="CATEGORY_TAG[row.category] || 'neutral'">
          {{ row.category || '-' }}
        </HseStatusTag>
      </template>
      <template #status="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_LABEL[row.status] || row.status || '-' }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace v-if="String(row.id) !== rowEditingId" justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">
            查看
          </NButton>
          <NButton size="small" type="primary" quaternary @click="startEdit(row)">
            编辑
          </NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该物资吗？
          </NPopconfirm>
        </NSpace>
        <NSpace v-else justify="center">
          <NButton size="small" type="primary" @click="gridRef?.saveEdit(row)">
            保存
          </NButton>
          <NButton size="small" @click="gridRef?.cancelEdit(row)">
            取消
          </NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增 / 编辑 / 查看 弹窗 -->
    <NModal
      v-model:show="formOpen"
      :title="
        formMode === 'create'
          ? '新增应急物资'
          : formMode === 'edit'
            ? '编辑应急物资'
            : '物资详情'
      "
      preset="card"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="物资名称" required>
            <NInput v-model:value="formModel.name" placeholder="请输入物资名称" />
          </NFormItem>
          <NFormItem label="类别" required>
            <NSelect
              v-model:value="formModel.category"
              placeholder="请选择类别"
              :options="CATEGORY_OPTIONS"
            />
          </NFormItem>
          <NFormItem label="规格型号">
            <NInput v-model:value="formModel.spec" placeholder="请输入规格型号" />
          </NFormItem>
          <NFormItem label="数量">
            <NInputNumber v-model:value="formModel.quantity" :min="0" style="width: 100%" placeholder="0" />
          </NFormItem>
          <NFormItem label="存放位置">
            <NInput v-model:value="formModel.location" placeholder="请输入存放位置" />
          </NFormItem>
          <NFormItem label="责任人">
            <NInput v-model:value="formModel.responsible_person" placeholder="选填" />
          </NFormItem>
          <NFormItem label="到期日期">
            <NInput v-model:value="formModel.expire_date" placeholder="YYYY-MM-DD" />
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

  </HsePageLayout>
</template>
