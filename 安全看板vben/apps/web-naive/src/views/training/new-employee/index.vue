<script lang="ts" setup>
/**
 * 新员工培训（web-naive）
 * 统一使用 HSE 公共组件栈；接入真实 API
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
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
  NDatePicker,
} from 'naive-ui';

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
  createNewEmployee,
  deleteNewEmployee,
  getNewEmployeeList,
  updateNewEmployee,
  type LedgerApi,
} from '#/api/hse/training';
import { getEmployeeSelectorList } from '#/api/hse/employee';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'TrainingNewEmployee' });

// ===================== 部门选项 =====================
const departmentOptions = [
  '安全环保部',
  '生产运营部',
  '设备管理部',
  '车队',
  '综合管理部',
];

// ===================== 结果状态映射 =====================
function getResultTag(result?: string): { type: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; label: string } {
  if (result === '合格') return { type: 'success', label: '合格' };
  if (result === '不合格') return { type: 'danger', label: '不合格' };
  if (result === '缺勤') return { type: 'warning', label: '缺勤' };
  return { type: 'neutral', label: result || '-' };
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<LedgerApi.LedgerItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const searchForm = reactive({
  keyword: '',
  result: '' as string | undefined,
});

async function loadData() {
  loading.value = true;
  try {
    const params: LedgerApi.LedgerListParams = {
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      result: searchForm.result || undefined,
      sortField: sortBy.value,
      sortOrder: sortOrder.value,
    };
    const res = await getNewEmployeeList(params);
    data.value = res.list || [];
    total.value = res.total || 0;
    updateStats();
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
  searchForm.result = undefined;
  currentPage.value = 1;
  loadData();
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

// ===================== 统计 =====================
const statItems = computed(() => {
  const list = data.value;
  const passCount = list.filter((r) => r.result === '合格').length;
  const failCount = list.filter((r) => r.result === '不合格').length;
  const totalCount = total.value;
  const rate = passCount + failCount > 0 ? Math.round((passCount / (passCount + failCount)) * 100) : 0;
  return [
    { key: 'total', label: '培训总数', value: totalCount, suffix: '条', type: 'info' as const },
    { key: 'pass', label: '合格数', value: passCount, suffix: '人', type: 'success' as const },
    { key: 'fail', label: '不合格数', value: failCount, suffix: '人', type: 'danger' as const },
    { key: 'rate', label: '合格率', value: `${rate}%`, suffix: '', type: 'warning' as const },
  ];
});

function updateStats() {
  // stats are computed
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
  onImportClose,
  bindRefresh: bindImportRefresh,
} = useGenericImport('training-new-employee');
bindImportRefresh(onRefresh);

async function onRefresh() {
  await loadData();
}

// ===================== 新增/编辑/查看 =====================
const formOpen = ref(false);
const formMode = ref<'create' | 'edit' | 'view'>('create');
const formLoading = ref(false);
const editingId = ref<number | null>(null);

const formModel = reactive({
  employeeId: null as number | null,
  name: '',
  idCard: '',
  department: undefined as string | undefined,
  position: '',
  trainingDate: '',
  durationMinutes: 0,
  content: '',
  score: null as number | null,
  result: undefined as string | undefined,
  remark: '',
});

// NDatePicker 使用时间戳，与表单中的字符串日期互转
const trainingDateTs = computed<number | null>({
  get: () => (formModel.trainingDate ? new Date(formModel.trainingDate).getTime() : null),
  set: (val) => {
    formModel.trainingDate = val ? new Date(val).toISOString().slice(0, 10) : '';
  },
});

// 新员工选择（员工选择器，远程搜索姓名/工号）
// 选中记录 employeeId 并以花名册标准姓名回写 name；未选中可手填姓名，由后端按姓名唯一匹配解析
const employeeOptions = ref<{ label: string; value: number }[]>([]);
async function searchEmployees(keyword: string) {
  try {
    const res = await getEmployeeSelectorList({ keyword: keyword || undefined, limit: 30 });
    employeeOptions.value = (res ?? []).map((e: any) => ({
      label: `${e.name ?? e.label ?? ''}（${e.employee_code ?? e.id ?? ''}）`,
      value: Number(e.id ?? e.value ?? 0),
    }));
  } catch {
    employeeOptions.value = [];
  }
}
function onEmployeeSelect(id: number | null) {
  if (!id) return;
  const hit = employeeOptions.value.find((o) => o.value === id);
  if (hit) formModel.name = String(hit.label).replace(/（[^）]*）$/, '');
}

function resetForm() {
  formModel.employeeId = null;
  formModel.name = '';
  formModel.idCard = '';
  formModel.department = undefined;
  formModel.position = '';
  formModel.trainingDate = '';
  formModel.durationMinutes = 0;
  formModel.content = '';
  formModel.score = null;
  formModel.result = undefined;
  formModel.remark = '';
}

function openCreate() {
  resetForm();
  formMode.value = 'create';
  editingId.value = null;
  formOpen.value = true;
}

function openEdit(row: LedgerApi.LedgerItem) {
  resetForm();
  formMode.value = 'edit';
  editingId.value = row.id;
  Object.assign(formModel, {
    employeeId: row.employeeId ?? null,
    name: row.name,
    idCard: row.idCard || '',
    department: row.department,
    position: row.position || '',
    trainingDate: row.trainingDate || '',
    durationMinutes: row.durationMinutes ?? 0,
    content: row.content || '',
    score: row.score ?? null,
    result: row.result,
    remark: row.remark || '',
  });
  // 编辑已落键的历史记录：预置选择器选项，保证回显正确
  employeeOptions.value = row.employeeId
    ? [{ label: `${row.name}（${row.employeeId}）`, value: row.employeeId }]
    : [];
  formOpen.value = true;
}

// 查看抽屉
const detailVisible = ref(false);
const currentRecord = ref<LedgerApi.LedgerItem | null>(null);

function openView(row: LedgerApi.LedgerItem) {
  currentRecord.value = row;
  detailVisible.value = true;
}

function formatDate(date: string): string {
  if (!date) return '-';
  try {
    return date.slice(0, 10);
  } catch {
    return date;
  }
}

function maskIdCard(idCard?: string): string {
  if (!idCard) return '-';
  if (idCard.length <= 8) return idCard;
  return idCard.slice(0, 4) + '**********' + idCard.slice(-4);
}

async function onSubmit() {
  // 已用选择器选中人员时，姓名由后端按主数据同步，可不手填
  if (!formModel.name && !formModel.employeeId) {
    message.warning('请选择新员工或填写姓名');
    return;
  }
  if (!formModel.department) {
    message.warning('请选择部门');
    return;
  }
  formLoading.value = true;
  try {
    const data: Partial<LedgerApi.LedgerItem> = {
      employeeId: formModel.employeeId ?? undefined,
      name: formModel.name,
      idCard: formModel.idCard || undefined,
      department: formModel.department,
      position: formModel.position,
      trainingDate: formModel.trainingDate,
      durationMinutes: formModel.durationMinutes ?? 0,
      content: formModel.content,
      score: formModel.score,
      result: formModel.result,
      remark: formModel.remark,
    };
    if (formMode.value === 'edit' && editingId.value != null) {
      await updateNewEmployee(editingId.value, data);
      message.success('更新成功');
    } else {
      await createNewEmployee(data);
      message.success('创建成功');
    }
    formOpen.value = false;
    loadData();
  } catch {
    // 拦截器已提示
  } finally {
    formLoading.value = false;
  }
}

async function onDelete(row: LedgerApi.LedgerItem) {
  try {
    await deleteNewEmployee(row.id);
    message.success('删除成功');
    loadData();
  } catch {
    // 拦截器已提示
  }
}

// ===================== 表格列 =====================
const columns = computed<VxeTableGridColumns>(() => [
  { title: '序号', field: '_index', width: 60, align: 'center' },
  { title: '姓名', field: 'name', width: 100, align: 'center' },
  { title: '部门', field: 'department', width: 130, align: 'center' },
  { title: '岗位', field: 'position', width: 120, align: 'center', showOverflow: 'tooltip' },
  { title: '身份证号', field: 'idCard', width: 160, align: 'center', slots: { default: 'idCard' } },
  { title: '培训日期', field: 'trainingDate', width: 120, align: 'center', slots: { default: 'trainingDate' }, sortable: true },
  { title: '时长(分钟)', field: 'durationMinutes', width: 100, align: 'center', sortable: true },
  { title: '培训内容', field: 'content', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '成绩', field: 'score', width: 80, align: 'center', sortable: true },
  { title: '结果', field: 'result', width: 90, align: 'center', slots: { default: 'result' }, sortable: true },
  {
    title: '操作',
    field: '_action',
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
  <HsePageLayout title="新员工培训" description="新员工入职安全培训记录管理">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @create="openCreate"
      />
    </template>

    <!-- 统计卡片 -->
    <div class="stat-row mb-4">
      <NCard v-for="s in statItems" :key="s.key" size="small" class="stat-card">
        <div class="stat-card-inner">
          <div class="stat-value">
            {{ s.value }}<span class="stat-suffix">{{ s.suffix }}</span>
          </div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </NCard>
    </div>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="搜索姓名/岗位/培训内容"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.result"
          placeholder="培训结果"
          clearable
          :options="[
            { label: '合格', value: '合格' },
            { label: '不合格', value: '不合格' },
            { label: '缺勤', value: '缺勤' },
          ]"
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
      <template #_index="{ rowIndex }">
        <span>{{ (currentPage - 1) * pageSize + rowIndex + 1 }}</span>
      </template>
      <template #idCard="{ row }">
        <span>{{ maskIdCard(row.idCard) }}</span>
      </template>
      <template #trainingDate="{ row }">
        <span>{{ formatDate(row.trainingDate) }}</span>
      </template>
      <template #result="{ row }">
        <HseStatusTag :type="getResultTag(row.result).type" size="small">
          {{ getResultTag(row.result).label }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="openView(row)">查看</NButton>
          <NButton size="small" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="onDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确定删除该培训记录吗？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增/编辑弹窗 -->
    <NModal
      v-model:show="formOpen"
      preset="card"
      :title="formMode === 'create' ? '新增培训记录' : '编辑培训记录'"
      style="width: 680px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm :disabled="formMode === 'view'" label-placement="top">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="新员工（员工选择器）">
            <NSelect
              v-model:value="formModel.employeeId"
              placeholder="搜索并选择新员工（姓名/工号）"
              clearable
              filterable
              remote
              :options="employeeOptions"
              @search="searchEmployees"
              @update:value="onEmployeeSelect"
            />
          </NFormItem>
          <NFormItem label="姓名">
            <NInput
              v-model:value="formModel.name"
              placeholder="选中人员后自动带出；未选择时可手填（后端按姓名唯一匹配解析）"
            />
          </NFormItem>
          <NFormItem label="身份证号">
            <NInput v-model:value="formModel.idCard" placeholder="可选，用于自动关联员工档案" :maxlength="18" />
          </NFormItem>
          <NFormItem label="部门" required>
            <NSelect v-model:value="formModel.department" placeholder="请选择部门" :options="departmentOptions.map(d => ({ label: d, value: d }))" />
          </NFormItem>
          <NFormItem label="岗位">
            <NInput v-model:value="formModel.position" placeholder="请输入岗位" />
          </NFormItem>
          <NFormItem label="培训日期">
            <NDatePicker v-model:value="trainingDateTs" style="width: 100%" />
          </NFormItem>
          <NFormItem label="时长(分钟)">
            <NInputNumber v-model:value="formModel.durationMinutes" :min="0" placeholder="请输入时长" style="width: 100%" />
          </NFormItem>
          <NFormItem label="成绩">
            <NInputNumber v-model:value="formModel.score" :min="0" :max="100" placeholder="0-100" style="width: 100%" />
          </NFormItem>
          <NFormItem label="培训结果">
            <NSelect
              v-model:value="formModel.result"
              placeholder="请选择结果"
              :options="[
                { label: '合格', value: '合格' },
                { label: '不合格', value: '不合格' },
                { label: '缺勤', value: '缺勤' },
              ]"
            />
          </NFormItem>
        </div>
        <NFormItem label="培训内容">
          <NInput v-model:value="formModel.content" type="textarea" :rows="3" placeholder="请输入培训内容" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="formModel.remark" placeholder="其他说明" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="formOpen = false">关闭</NButton>
          <NButton v-if="formMode !== 'view'" type="primary" :loading="formLoading" @click="onSubmit">
            保存
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 查看抽屉 -->
    <NDrawer v-model:show="detailVisible" title="培训记录详情" width="560">
      <NDrawerContent v-if="currentRecord">
        <NDescriptions :column="1" bordered size="small">
          <NDescriptionsItem label="姓名">{{ currentRecord.name }}</NDescriptionsItem>
          <NDescriptionsItem label="部门">{{ currentRecord.department }}</NDescriptionsItem>
          <NDescriptionsItem label="岗位">{{ currentRecord.position || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="培训日期">{{ formatDate(currentRecord.trainingDate) }}</NDescriptionsItem>
          <NDescriptionsItem label="培训时长">
            {{ currentRecord.durationMinutes }} 分钟
          </NDescriptionsItem>
          <NDescriptionsItem label="培训内容">{{ currentRecord.content || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="成绩">
            {{ currentRecord.score === null || currentRecord.score === undefined ? '-' : currentRecord.score }}
          </NDescriptionsItem>
          <NDescriptionsItem label="培训结果">
            <HseStatusTag :type="getResultTag(currentRecord.result).type" size="small">
              {{ getResultTag(currentRecord.result).label }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem v-if="currentRecord.remark" label="备注">
            {{ currentRecord.remark }}
          </NDescriptionsItem>
        </NDescriptions>
        <div class="detail-actions">
          <NButton type="primary" @click="openEdit(currentRecord)">编辑</NButton>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- 通用导入 -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入新员工培训记录"
      :preview-columns="importPreviewColumns"
      :preview-data="importPreviewData"
      :preview-error="importPreviewError"
      :confirming="importConfirming"
      :result="importResult"
      @download-template="onImportTemplate"
      @upload="onImportUpload"
      @confirm="onImportConfirm"
      @close="onImportClose"
    />
  </HsePageLayout>
</template>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card-inner {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.stat-suffix {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  margin-left: 4px;
}

.stat-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.mb-4 {
  margin-bottom: 16px;
}

.detail-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.grid {
  display: grid;
}

.grid-cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.gap-x-4 {
  column-gap: 16px;
}

@media (max-width: 900px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
