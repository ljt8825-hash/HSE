<script lang="ts" setup>
/**
 * 责任制及考核（web-naive · 阶段06B-2，路由 hideInMenu）
 * 契约来源：apps/web-antd/src/views/objectives/assessment/index.vue + apps/web-antd/src/api/hse/goals.ts
 * 列表端点 /hse/assessment，写入端点 /objectives/responsibility（既有契约，禁止修正/合并/改后端）。
 * 旧版为「全量拉取 + 前端过滤/分页」行为（pageSize 9999 + filteredData/pagedData），本页保持一致。
 * 员工选择必须保存员工 ID（NSelect remote 检索 getEmployeeSelectorList），并自动带出姓名/部门/岗位。
 * 边界：不伪造写入成功（旧版 catch 中 message.success + 本地假更新的行为不迁移，错误如实提示）。
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
  NProgress,
  NSelect,
  NSpace,
  NStatistic,
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
  createAssessment,
  deleteAssessment,
  getAssessmentList,
  updateAssessment,
  type AssessmentApi,
} from '#/api/hse/goals';
import { getEmployeeSelectorList, type EmployeeSelectorItem } from '#/api/hse/employee';
import { useGenericImport } from '#/views/hse/_shared/useGenericImport';
import { message } from '#/adapter/naive';

defineOptions({ name: 'ObjectivesAssessment' });

// ===================== 数据（旧版：全量拉取 + 前端过滤分页） =====================
const loading = ref(false);
const assessmentList = ref<AssessmentApi.AssessmentItem[]>([]);

const searchForm = reactive({
  keyword: '',
  year: undefined as number | undefined,
  status: undefined as string | undefined,
});
const pagination = reactive({ page: 1, pageSize: 10 });
const sortBy = ref<string | undefined>(undefined);
const sortOrder = ref<'asc' | 'desc' | undefined>(undefined);

const yearOptions = computed(() => {
  const years: number[] = [];
  const currentYear = new Date().getFullYear();
  for (let y = 2024; y <= currentYear + 1; y += 1) {
    years.push(y);
  }
  return years;
});

const departmentOptions = [
  '安全环保部',
  '生产运营部',
  '设备管理部',
  '人力资源部',
  '技术质量部',
  '综合管理部',
  '车队',
];

const LEVEL_TAG: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  优秀: 'success',
  良好: 'info',
  合格: 'warning',
  一般: 'neutral',
};
const STATUS_TAG: Record<string, 'success' | 'danger'> = {
  有效: 'success',
  失效: 'danger',
};

const filteredData = computed(() => {
  let data = assessmentList.value;
  if (searchForm.keyword) {
    const kw = searchForm.keyword.toLowerCase();
    data = data.filter(
      (i) =>
        i.person.toLowerCase().includes(kw) ||
        i.department.toLowerCase().includes(kw) ||
        (i.remark || '').toLowerCase().includes(kw),
    );
  }
  if (searchForm.year) {
    data = data.filter((i) => i.year === searchForm.year);
  }
  if (searchForm.status) {
    data = data.filter((i) => i.status === searchForm.status);
  }
  // 客户端排序
  if (sortBy.value && sortOrder.value) {
    const field = sortBy.value as keyof AssessmentApi.AssessmentItem;
    const dir = sortOrder.value === 'asc' ? 1 : -1;
    data = [...data].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir * aVal.localeCompare(bVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir * (aVal - bVal);
      }
      return dir * String(aVal).localeCompare(String(bVal));
    });
  }
  return data;
});

const pagedData = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize;
  return filteredData.value.slice(start, start + pagination.pageSize);
});

const statItems = computed(() => {
  const list = filteredData.value;
  const total = list.length;
  const excellent = list.filter((i) => i.level === '优秀').length;
  const avg = total > 0 ? Math.round(list.reduce((sum, i) => sum + i.score, 0) / total) : 0;
  const passRate = total > 0 ? Math.round((list.filter((i) => i.score >= 60).length / total) * 100) : 0;
  return [
    { key: 'total', label: '考核总数', value: total, color: 'blue', icon: 'lucide:clipboard-list' },
    { key: 'excellent', label: '优秀数', value: excellent, color: 'green', icon: 'lucide:award' },
    { key: 'avg', label: '平均分', value: avg, color: 'orange', icon: 'lucide:bar-chart-3' },
    { key: 'passRate', label: '合格率', value: `${passRate}%`, color: 'cyan', icon: 'lucide:percent' },
  ];
});

async function fetchData() {
  loading.value = true;
  try {
    const res = await getAssessmentList({ page: 1, pageSize: 9999 });
    assessmentList.value = res.list || [];
  } catch {
    assessmentList.value = [];
  } finally {
    loading.value = false;
  }
}
function onSearch() {
  pagination.page = 1;
}
function onReset() {
  Object.assign(searchForm, { keyword: '', year: undefined, status: undefined });
  pagination.page = 1;
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  pagination.page = payload.currentPage;
  pagination.pageSize = payload.pageSize;
}

function onSortChange(payload: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  sortBy.value = payload.sortBy;
  sortOrder.value = payload.sortOrder;
  pagination.page = 1;
}

const columns: VxeTableGridColumns = [
  {
    title: '序号',
    field: 'index',
    width: 70,
    align: 'center',
    formatter: (params: any) => (pagination.page - 1) * pagination.pageSize + (params?.rowIndex ?? 0) + 1,
  },
  { title: '年份', field: 'year', width: 80, align: 'center', sortable: true },
  {
    title: '季度',
    field: 'quarter',
    width: 100,
    align: 'center',
    sortable: true,
    formatter: (params: any) => (params?.row?.quarter ? `第${params.row.quarter}季度` : '-'),
  },
  { title: '部门', field: 'department', width: 120, align: 'left', showOverflow: 'tooltip' },
  { title: '考核对象', field: 'person', width: 120, align: 'center' },
  {
    title: '考核分数',
    field: 'score',
    width: 180,
    align: 'center',
    slots: { default: 'scoreCell' },
  },
  { title: '考核等级', field: 'level', width: 100, align: 'center', slots: { default: 'levelCell' } },
  { title: '状态', field: 'status', width: 90, align: 'center', slots: { default: 'statusCell' } },
  { title: '操作', field: 'action', width: 180, align: 'center', fixed: 'right', slots: { default: 'action' } },
];

function formatScore(percent: number): string {
  return `${percent}分`;
}
function scoreStatus(score: number): 'success' | 'info' | 'warning' | 'error' {
  if (score >= 85) return 'success';
  if (score >= 60) return 'info';
  return 'error';
}

// ===================== 新增/编辑 =====================
const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRecord = ref<AssessmentApi.AssessmentItem | null>(null);
const employeeOptions = ref<{ label: string; value: number; name: string; orgName?: string; positionName?: string }[]>([]);
const employeeLoading = ref(false);

const assessmentForm = reactive({
  year: new Date().getFullYear(),
  quarter: undefined as number | undefined,
  department: undefined as string | undefined,
  employeeId: undefined as number | undefined,
  person: '',
  position: '',
  score: undefined as number | undefined,
  level: undefined as string | undefined,
  status: '有效',
  remark: '',
});

const formRules = {
  year: [{ required: true, message: '请选择年份', trigger: 'change' }],
  quarter: [{ required: true, message: '请选择季度', trigger: 'change' }],
  department: [{ required: true, message: '请选择部门', trigger: 'change' }],
  person: [{ required: true, message: '请选择考核对象', trigger: 'change' }],
  score: [
    { required: true, message: '请输入考核分数', trigger: 'change' },
    { type: 'number' as const, min: 0, max: 100, message: '分数范围为0-100', trigger: 'change' },
  ],
} as any;

function resetForm() {
  Object.assign(assessmentForm, {
    year: new Date().getFullYear(),
    quarter: undefined,
    department: undefined,
    employeeId: undefined,
    person: '',
    position: '',
    score: undefined,
    level: undefined,
    status: '有效',
    remark: '',
  });
  employeeOptions.value = [];
}

function handleCreate() {
  editingRecord.value = null;
  resetForm();
  modalVisible.value = true;
}

function handleEdit(record: AssessmentApi.AssessmentItem) {
  editingRecord.value = record;
  Object.assign(assessmentForm, {
    year: record.year,
    quarter: record.quarter,
    department: record.department,
    employeeId: record.employeeId ?? undefined,
    person: record.person,
    position: record.position ?? '',
    score: record.score,
    level: record.level,
    status: record.status,
    remark: record.remark,
  });
  if (record.employeeId) {
    employeeOptions.value = [
      { label: record.person, value: record.employeeId, name: record.person, orgName: record.department, positionName: record.position },
    ];
  }
  modalVisible.value = true;
}

/** 员工远程检索（保存员工 ID；不得以自由文本替代） */
async function handleEmpSearch(keyword: string) {
  if (!keyword) {
    employeeOptions.value = [];
    return;
  }
  employeeLoading.value = true;
  try {
    const res = await getEmployeeSelectorList({ keyword, limit: 30 });
    employeeOptions.value = (res || []).map((e: EmployeeSelectorItem) => ({
      label: `${e.name}（${e.employee_code || e.employee_id}）${e.org_name ? ` - ${e.org_name}` : ''}`,
      value: e.employee_id,
      name: e.name,
      orgName: e.org_name,
      positionName: e.position_name,
    }));
  } catch {
    employeeOptions.value = [];
  } finally {
    employeeLoading.value = false;
  }
}

/** Naive NSelect @update:value 真实签名 (value, option)；自动带出姓名/部门/岗位 */
function onPersonChange(value: number | null, option: any) {
  assessmentForm.employeeId = value ?? undefined;
  assessmentForm.person = option?.name || '';
  assessmentForm.department = option?.orgName || assessmentForm.department;
  assessmentForm.position = option?.positionName || '';
}

async function handleSave() {
  if (!assessmentForm.person) {
    message.warning('请选择考核对象');
    return;
  }
  if (assessmentForm.score == null || assessmentForm.score < 0 || assessmentForm.score > 100) {
    message.warning('请输入 0-100 的考核分数');
    return;
  }
  modalLoading.value = true;
  try {
    const data: Partial<AssessmentApi.AssessmentItem> = {
      year: assessmentForm.year,
      quarter: assessmentForm.quarter,
      department: assessmentForm.department,
      employeeId: assessmentForm.employeeId,
      person: assessmentForm.person,
      position: assessmentForm.position,
      score: assessmentForm.score ?? 0,
      level: assessmentForm.level,
      status: assessmentForm.status,
      remark: assessmentForm.remark,
    };
    if (editingRecord.value) {
      await updateAssessment(editingRecord.value.id, data);
      message.success('更新成功');
    } else {
      await createAssessment(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch {
    /* 拦截器已提示（不伪造成功） */
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: AssessmentApi.AssessmentItem) {
  try {
    await deleteAssessment(record.id);
    message.success('删除成功');
    fetchData();
  } catch {
    /* 拦截器已提示 */
  }
}

// ===================== 详情 =====================
const detailDrawerVisible = ref(false);
const currentRecord = ref<AssessmentApi.AssessmentItem | null>(null);
function handleView(record: AssessmentApi.AssessmentItem) {
  currentRecord.value = record;
  detailDrawerVisible.value = true;
}

// ===================== 工具栏 / 导入（module=assessment 通用端点已核实 200） =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  export: { hidden: true },
});
const {
  importOpen,
  importPreviewColumns,
  importPreviewData,
  importPreviewError,
  importConfirming,
  importResult,
  bindRefresh: bindImportRefresh,
  onDownloadTemplate: onImportTemplate,
  onUpload: onImportUpload,
  onConfirmImport: onImportConfirm,
  onImportClose: onImportDialogClose,
} = useGenericImport('assessment');
bindImportRefresh(onRefresh);

async function onRefresh() {
  fetchData();
}

onMounted(() => {
  fetchData();
});
</script>

<template>
  <HsePageLayout title="责任制及考核">
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NCard v-for="s in statItems" :key="s.key" :bordered="false">
        <NStatistic :label="s.label" :value="s.value" />
      </NCard>
    </div>

    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @download-template="onImportTemplate"
        @import="() => (importOpen = true)"
        @create="handleCreate"
      />
    </template>

    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="考核对象 / 部门 / 备注" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.year"
          placeholder="年份"
          clearable
          :options="yearOptions.map((y) => ({ label: `${y} 年`, value: y }))"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态"
          clearable
          :options="[
            { label: '有效', value: '有效' },
            { label: '失效', value: '失效' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <HseDataGrid
      :columns="columns"
      :data="pagedData"
      :loading="loading"
      :pager="true"
      :total="filteredData.length"
      scroll-x="1100"
      @page-change="onPageChange"
      @sort-change="onSortChange"
    >
      <template #scoreCell="{ row }">
        <NSpace :size="6" align="center">
          <NProgress
            type="line"
            :percentage="row.score"
            :status="scoreStatus(row.score)"
            :height="8"
            style="width: 90px"
            :show-indicator="false"
          />
          <span>{{ formatScore(row.score) }}</span>
        </NSpace>
      </template>
      <template #levelCell="{ row }">
        <HseStatusTag :type="LEVEL_TAG[row.level] || 'neutral'">{{ row.level || '-' }}</HseStatusTag>
      </template>
      <template #statusCell="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">{{ row.status || '-' }}</HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace :size="8">
          <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
          <NButton size="small" type="primary" quaternary @click="handleEdit(row)">编辑</NButton>
          <NPopconfirm @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" quaternary type="error">删除</NButton>
            </template>
            确认删除该考核记录？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 新增/编辑 -->
    <NModal
      v-model:show="modalVisible"
      :title="editingRecord ? '编辑考核记录' : '新增考核记录'"
      preset="card"
      style="width: 720px; max-width: 94vw"
    >
      <NForm label-placement="top" :rules="formRules">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="年份" required>
            <NSelect
              v-model:value="assessmentForm.year"
              placeholder="请选择年份"
              :options="yearOptions.map((y) => ({ label: `${y} 年`, value: y }))"
            />
          </NFormItem>
          <NFormItem label="季度" required>
            <NSelect
              v-model:value="assessmentForm.quarter"
              placeholder="请选择季度"
              :options="[
                { label: '第一季度', value: 1 },
                { label: '第二季度', value: 2 },
                { label: '第三季度', value: 3 },
                { label: '第四季度', value: 4 },
              ]"
            />
          </NFormItem>
          <NFormItem label="部门" required>
            <NSelect
              v-model:value="assessmentForm.department"
              placeholder="请选择部门"
              :options="departmentOptions.map((d) => ({ label: d, value: d }))"
            />
          </NFormItem>
          <NFormItem label="考核对象" required>
            <NSelect
              v-model:value="assessmentForm.employeeId"
              placeholder="选择被考核人（输入姓名/工号检索）"
              clearable
              filterable
              remote
              :loading="employeeLoading"
              :options="employeeOptions"
              @search="handleEmpSearch"
              @update:value="onPersonChange"
            />
          </NFormItem>
          <NFormItem label="考核分数" required>
            <NInputNumber
              v-model:value="assessmentForm.score"
              :min="0"
              :max="100"
              style="width: 100%"
              placeholder="0-100"
            />
          </NFormItem>
          <NFormItem label="考核等级">
            <NSelect
              v-model:value="assessmentForm.level"
              placeholder="请选择等级"
              :options="[
                { label: '优秀', value: '优秀' },
                { label: '良好', value: '良好' },
                { label: '合格', value: '合格' },
                { label: '一般', value: '一般' },
              ]"
            />
          </NFormItem>
          <NFormItem label="状态">
            <NSelect
              v-model:value="assessmentForm.status"
              placeholder="请选择状态"
              :options="[
                { label: '有效', value: '有效' },
                { label: '失效', value: '失效' },
              ]"
            />
          </NFormItem>
        </div>
        <NFormItem label="备注">
          <NInput v-model:value="assessmentForm.remark" placeholder="请输入备注" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="modalVisible = false">取消</NButton>
          <NButton type="primary" :loading="modalLoading" @click="handleSave">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="detailDrawerVisible" title="考核详情" :width="560">
      <NDrawerContent>
        <NDescriptions v-if="currentRecord" :column="1" bordered label-placement="left" size="small">
          <NDescriptionsItem label="年份">{{ currentRecord.year ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="季度">
            {{ currentRecord.quarter ? `第${currentRecord.quarter}季度` : '-' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="部门">{{ currentRecord.department || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="考核对象">{{ currentRecord.person || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="岗位">{{ currentRecord.position || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="考核分数">{{ currentRecord.score ?? '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="考核等级">
            <HseStatusTag :type="LEVEL_TAG[currentRecord.level] || 'neutral'">
              {{ currentRecord.level || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <HseStatusTag :type="STATUS_TAG[currentRecord.status] || 'neutral'">
              {{ currentRecord.status || '-' }}
            </HseStatusTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="备注">{{ currentRecord.remark || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </NDrawerContent>
    </NDrawer>

    <!-- 通用导入（assessment 模块，后端端点已核实 /import/template/assessment=200） -->
    <HseImportDialog
      v-model:open="importOpen"
      title="导入责任制考核"
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
