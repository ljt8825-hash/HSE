<script lang="ts" setup>
/**
 * 考核对象管理（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/views/hse/assessment-monthly/targets.vue + assessment-monthly.ts
 * 能力：顶部周期下拉（复用 getAssessmentCycleList page_size 100，默认首条）/ 乡镇(硬编码乡镇1/2/3)·岗位(硬编码安全员/负责人)·
 *      状态(pending/scored/reviewed/frozen)·姓名工号 keyword 筛选（均透传 getAssessmentTargetList）/ 多选行选择 +
 *      同步对象(syncAssessmentTargets) + 添加对象(弹窗逗号分隔 employee_ids) + 单条/批量移除(removeAssessmentTarget)。
 * 列：姓名/工号/岗位/乡镇/网格级别/状态/总分/等级/乡镇排名/总排名/操作。（网格级别取自网格管理 personnel_id 绑定）
 * 乡镇/岗位筛选选项旧版硬编码，原样保留，不请求枚举。写操作不执行（仅证明入口与参数）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
  NForm,
  NFormItem,
  NGi,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
} from 'naive-ui';
import { IconifyIcon } from '@vben/icons';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatusTag, type HseActionKey } from '#/components/hse';
import {
  addAssessmentTargets,
  getAssessmentCycleList,
  getAssessmentTargetList,
  removeAssessmentTarget,
  syncAssessmentTargets,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyTargets' });

const loading = ref(false);
const cycleLoading = ref(false);
const syncing = ref(false);
const adding = ref(false);
const dataSource = ref<AssessmentMonthlyApi.AssessmentTarget[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const cycleList = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const selectedCycleId = ref<number | string | undefined>();
const searchForm = reactive({
  township: undefined as string | undefined,
  position: undefined as string | undefined,
  status: undefined as string | undefined,
  keyword: '',
});

// 岗位/乡镇下拉选项严格对齐后端考核白名单，与 v_employee_org_full 的真实 position_name / org_name 保持一致。
// 市政绿化作业中心公园负责人为预留项——等花名册录入后，后端 syncTargets 白名单会同步追加。
const positionOptions = [
  { label: '乡镇作业中心经理', value: '乡镇作业中心经理' },
  { label: '管理员', value: '管理员' },
  { label: '市政绿化作业中心公园负责人（预留）', value: '市政绿化作业中心公园负责人' },
];

// 12 个乡镇作业中心 + 环卫作业中心（上级中心）
const townshipOptions = [
  { label: '环卫作业中心', value: '环卫作业中心' },
  { label: '宁城街道作业中心', value: '宁城街道作业中心' },
  { label: '津城街道作业中心', value: '津城街道作业中心' },
  { label: '柴胡店镇作业中心', value: '柴胡店镇作业中心' },
  { label: '杜集镇作业中心', value: '杜集镇作业中心' },
  { label: '保店镇作业中心', value: '保店镇作业中心' },
  { label: '长官镇作业中心', value: '长官镇作业中心' },
  { label: '时集镇作业中心', value: '时集镇作业中心' },
  { label: '相衙镇作业中心', value: '相衙镇作业中心' },
  { label: '张大庄镇作业中心', value: '张大庄镇作业中心' },
  { label: '刘营伍乡作业中心', value: '刘营伍乡作业中心' },
  { label: '大曹镇作业中心', value: '大曹镇作业中心' },
  { label: '大柳镇作业中心', value: '大柳镇作业中心' },
];
const statusOptions = [
  { label: '待评分', value: 'pending' },
  { label: '已评分', value: 'scored' },
  { label: '已审核', value: 'reviewed' },
  { label: '已冻结', value: 'frozen' },
];

const STATUS_TEXT: Record<string, string> = {
  pending: '待评分',
  scored: '已评分',
  reviewed: '已审核',
  frozen: '已冻结',
};
const STATUS_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  scored: 'info',
  reviewed: 'success',
  frozen: 'danger',
};
const GRADE_TAG: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  A: 'success',
  B: 'info',
  C: 'warning',
  D: 'danger',
};

const columns = computed<VxeTableGridColumns>(() => [
  { type: 'checkbox', width: 50, align: 'center' },
  { title: '姓名', field: 'employeeName', minWidth: 90, align: 'center' },
  { title: '工号', field: 'employeeCode', minWidth: 110, align: 'center' },
  { title: '岗位', field: 'position', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '乡镇', field: 'township', minWidth: 130, align: 'center', showOverflow: 'tooltip' },
  { title: '网格级别', field: 'gridLevel', minWidth: 120, align: 'center', showOverflow: 'tooltip', slots: { default: 'gridLevelCell' } },
  { title: '状态', field: 'status', minWidth: 90, align: 'center', slots: { default: 'statusCell' } },
  { title: '总分', field: 'scoreTotal', minWidth: 90, align: 'center' },
  { title: '等级', field: 'grade', minWidth: 70, align: 'center', slots: { default: 'gradeCell' } },
  { title: '乡镇排名', field: 'rankTownship', minWidth: 100, align: 'center' },
  { title: '总排名', field: 'rankAll', minWidth: 90, align: 'center' },
  { title: '操作', field: 'action', width: 100, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

const gridRef = ref<{ gridApi: any } | null>(null);
function getCheckedRecords(): AssessmentMonthlyApi.AssessmentTarget[] {
  try {
    return (gridRef.value?.gridApi?.grid?.getCheckboxRecords?.() as AssessmentMonthlyApi.AssessmentTarget[]) ?? [];
  } catch {
    return [];
  }
}

async function loadCycleList() {
  cycleLoading.value = true;
  try {
    const res = await getAssessmentCycleList({
      page: 1,
      page_size: 100,
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    cycleList.value = res.list || [];
    if (cycleList.value.length > 0 && !selectedCycleId.value) {
      selectedCycleId.value = cycleList.value[0]!.id;
      loadData();
    }
  } catch {
    message.error('加载周期列表失败');
  } finally {
    cycleLoading.value = false;
  }
}

async function loadData() {
  if (!selectedCycleId.value) {
    dataSource.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const res = await getAssessmentTargetList(selectedCycleId.value, {
      page: page.value,
      page_size: pageSize.value,
      township: searchForm.township,
      position: searchForm.position,
      status: searchForm.status,
      keyword: searchForm.keyword || undefined,
      sort_by: 'score_total',
      sort_order: 'desc',
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

function handleCycleChange() {
  page.value = 1;
  loadData();
}
function onSearch() {
  page.value = 1;
  loadData();
}
function onReset() {
  searchForm.township = undefined;
  searchForm.position = undefined;
  searchForm.status = undefined;
  searchForm.keyword = '';
  onSearch();
}
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

async function handleSync() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  syncing.value = true;
  try {
    const res = await syncAssessmentTargets(selectedCycleId.value);
    message.success(`同步成功：新增 ${res.added} 人，移除 ${res.removed} 人，共 ${res.total} 人`);
    loadData();
  } catch {
    /* 拦截器已提示 */
  } finally {
    syncing.value = false;
  }
}

const addModalOpen = ref(false);
const addForm = reactive({ employeeIds: '' });
function showAddModal() {
  if (!selectedCycleId.value) {
    message.warning('请先选择考核周期');
    return;
  }
  addForm.employeeIds = '';
  addModalOpen.value = true;
}
async function handleAdd() {
  if (!addForm.employeeIds.trim()) {
    message.warning('请输入员工ID');
    return;
  }
  const ids = addForm.employeeIds
    .split(/[,，\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  if (ids.length === 0) {
    message.warning('请输入有效的员工ID');
    return;
  }
  adding.value = true;
  try {
    await addAssessmentTargets(selectedCycleId.value!, ids);
    message.success('添加成功');
    addModalOpen.value = false;
    loadData();
  } catch {
    /* 拦截器已提示 */
  } finally {
    adding.value = false;
  }
}

async function handleRemove(record: AssessmentMonthlyApi.AssessmentTarget) {
  try {
    await removeAssessmentTarget(record.id);
    message.success('移除成功');
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleBatchRemove() {
  const rows = getCheckedRecords();
  if (rows.length === 0) {
    message.warning('请先勾选要移除的对象');
    return;
  }
  try {
    for (const r of rows) {
      await removeAssessmentTarget(r.id);
    }
    message.success(`已移除 ${rows.length} 个对象`);
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

onMounted(() => {
  loadCycleList();
});
</script>

<template>
  <HsePageLayout title="考核对象管理">
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="loadData" @create="showAddModal" />
    </template>

    <div class="mb-4">
      <NSelect
        v-model:value="selectedCycleId"
        placeholder="请选择考核周期"
        :loading="cycleLoading"
        :options="cycleList.map((c) => ({ label: c.cycleName, value: c.id }))"
        style="max-width: 320px"
        @update:value="handleCycleChange"
      />
    </div>

    <NSpace class="mb-4" :size="8">
      <NButton :loading="syncing" @click="handleSync">
        <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
        同步对象
      </NButton>
      <NPopconfirm @positive-click="handleBatchRemove">
        <template #trigger>
          <NButton type="error" secondary>移除对象</NButton>
        </template>
        确认移除勾选的考核对象？
      </NPopconfirm>
    </NSpace>

    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NSelect v-model:value="searchForm.township" placeholder="乡镇" clearable :options="townshipOptions" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.position" placeholder="岗位" clearable :options="positionOptions" />
      </NGi>
      <NGi>
        <NSelect v-model:value="searchForm.status" placeholder="状态" clearable :options="statusOptions" />
      </NGi>
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="搜索姓名/工号" clearable @keyup.enter="onSearch" />
      </NGi>
    </HseSearchPanel>

    <HseDataGrid
      ref="gridRef"
      :columns="columns"
      :data="dataSource"
      :loading="loading"
      :pager="true"
      :total="total"
      auto-width
      @page-change="onPageChange"
    >
      <template #gridLevelCell="{ row }">
        <span>{{ row.gridLevel || '-' }}</span>
      </template>
      <template #statusCell="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_TEXT[row.status] || row.status }}
        </HseStatusTag>
      </template>
      <template #gradeCell="{ row }">
        <HseStatusTag v-if="row.grade" :type="GRADE_TAG[row.grade] || 'neutral'">
          {{ row.grade }}
        </HseStatusTag>
        <span v-else>-</span>
      </template>
      <template #action="{ row }">
        <NPopconfirm @positive-click="handleRemove(row)">
          <template #trigger>
            <NButton size="small" type="error" quaternary>移除</NButton>
          </template>
          确认移除该考核对象？
        </NPopconfirm>
      </template>
    </HseDataGrid>

    <NModal
      v-model:show="addModalOpen"
      title="添加考核对象"
      preset="card"
      style="width: 600px; max-width: 94vw"
    >
      <NForm label-placement="top">
        <NFormItem label="员工ID列表" required>
          <NInput
            v-model:value="addForm.employeeIds"
            type="textarea"
            :rows="4"
            placeholder="例如：1001,1002,1003（多个用逗号分隔）"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="addModalOpen = false">取消</NButton>
          <NButton type="primary" :loading="adding" @click="handleAdd">添加</NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
