<script lang="ts" setup>
/**
 * 考核周期管理（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/views/hse/assessment-monthly/cycles.vue + assessment-monthly.ts
 * 能力：服务端分页列表 / 状态筛选（not_started/in_progress/pending_review/reviewed/frozen）/
 *      新建周期（年份·月份·名称留空自动生成·备注）/ 启动（仅 not_started）/ 删除（frozen 不可删）/ 详情（占位「详情页开发中」）。
 * 注意：旧版 keyword 搜索框未真正传入请求；迁移保留该搜索框但同样不传 keyword（以旧版实际请求为准，不新增服务端参数）。
 * 列：周期编码/周期名称/考核年月/状态/考核对象数/已评分/创建人/创建时间/操作。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

import {
  NButton,
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
} from 'naive-ui';

import { HseActionBar, HseDataGrid, HsePageLayout, HseSearchPanel, HseStatusTag, ASSESSMENT_CYCLE_STATUS_TAG as STATUS_TAG, type HseActionKey } from '#/components/hse';
import {
  autoGenerateAssessmentCycle,
  createAssessmentCycle,
  deleteAssessmentCycle,
  getAssessmentCycle,
  getAssessmentCycleList,
  startAssessmentCycle,
  type AssessmentMonthlyApi,
} from '#/api/hse/assessment-monthly';
import { message } from '#/adapter/naive';

defineOptions({ name: 'AssessmentMonthlyCycles' });

const loading = ref(false);
const creating = ref(false);
const dataSource = ref<AssessmentMonthlyApi.AssessmentCycle[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const searchForm = reactive({
  keyword: '',
  status: undefined as string | undefined,
});

const statusOptions = [
  { label: '未开始', value: 'not_started' },
  { label: '进行中', value: 'in_progress' },
  { label: '待审核', value: 'pending_review' },
  { label: '已审核', value: 'reviewed' },
  { label: '已冻结', value: 'frozen' },
];

const STATUS_TEXT: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  pending_review: '待审核',
  reviewed: '已审核',
  frozen: '已冻结',
};

const createModalOpen = ref(false);
const createForm = reactive({
  assessment_year: new Date().getFullYear(),
  assessment_month: new Date().getMonth() + 1,
  cycle_name: '',
  remark: '',
});

const viewDrawerOpen = ref(false);
const viewLoading = ref(false);
const viewData = ref<AssessmentMonthlyApi.AssessmentCycle | null>(null);

const columns = computed<VxeTableGridColumns>(() => [
  { title: '周期编码', field: 'cycleCode', minWidth: 140, align: 'center', showOverflow: 'tooltip' },
  { title: '周期名称', field: 'cycleName', minWidth: 160, align: 'center', showOverflow: 'tooltip' },
  {
    title: '考核年月',
    field: 'period',
    minWidth: 110,
    align: 'center',
    formatter: (params: any) => `${params.row.assessmentYear}年${params.row.assessmentMonth}月`,
  },
  { title: '状态', field: 'status', minWidth: 90, align: 'center', slots: { default: 'statusCell' } },
  { title: '考核对象数', field: 'targetCount', minWidth: 120, align: 'center' },
  { title: '已评分', field: 'scoredCount', minWidth: 90, align: 'center' },
  { title: '创建人', field: 'createdByName', minWidth: 100, align: 'center', showOverflow: 'tooltip' },
  {
    title: '创建时间',
    field: 'createdAt',
    minWidth: 130,
    align: 'center',
    formatter: ({ row }: any) => {
      if (!row.createdAt) return '-';
      const d = new Date(row.createdAt);
      if (Number.isNaN(d.getTime())) return row.createdAt;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
  },
  { title: '操作', field: 'action', width: 180, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

async function loadData() {
  loading.value = true;
  try {
    const res = await getAssessmentCycleList({
      page: page.value,
      page_size: pageSize.value,
      status: searchForm.status,
      sort_by: 'created_at',
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

function onSearch() {
  page.value = 1;
  loadData();
}
function onReset() {
  searchForm.keyword = '';
  searchForm.status = undefined;
  onSearch();
}
async function onPageChange(payload: { currentPage: number; pageSize: number }) {
  page.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

/** 当月（YYYY，M）是否已有考核周期 */
function hasCurrentMonthCycle(): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return dataSource.value.some((c) => c.assessmentYear === y && c.assessmentMonth === m);
}

/**
 * 自动生成本月考核周期 + 同步对象（幂等）。
 * 满足「每个月自动生成延续上月的页面，人工可在系统里改，不靠 Excel 导入」：
 * 后端复用 assessmentScheduler.autoCreateAndSyncCycle —— 周期不存在则建并按花名册同步本月考核对象，
 * 已存在则返回 created=false 不重复建。
 */
const autoGenerating = ref(false);
async function handleAutoGenerate() {
  if (autoGenerating.value) return;
  autoGenerating.value = true;
  try {
    const res = await autoGenerateAssessmentCycle();
    if (res.created) {
      message.success(`已自动生成 ${new Date().getFullYear()}年${new Date().getMonth() + 1}月考核周期并同步对象 ${res.targetCount} 人，可在系统里手工填写/审核`);
    } else {
      message.info('本月考核周期已存在，无需重复生成');
    }
    loadData();
  } catch {
    /* 拦截器已提示 */
  } finally {
    autoGenerating.value = false;
  }
}

function showCreateModal() {
  createForm.assessment_year = new Date().getFullYear();
  createForm.assessment_month = new Date().getMonth() + 1;
  createForm.cycle_name = '';
  createForm.remark = '';
  createModalOpen.value = true;
}

async function handleCreate() {
  creating.value = true;
  try {
    await createAssessmentCycle({ ...createForm });
    message.success('创建成功');
    createModalOpen.value = false;
    loadData();
  } catch {
    /* 拦截器已提示（不伪造成功） */
  } finally {
    creating.value = false;
  }
}

async function handleStart(record: AssessmentMonthlyApi.AssessmentCycle) {
  try {
    await startAssessmentCycle(record.id);
    message.success('考核周期已启动');
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

async function handleDelete(record: AssessmentMonthlyApi.AssessmentCycle) {
  try {
    await deleteAssessmentCycle(record.id);
    message.success('删除成功');
    loadData();
  } catch {
    /* 拦截器已提示 */
  }
}

// 详情：开抽屉异步拉取周期详情
async function handleView(record: AssessmentMonthlyApi.AssessmentCycle) {
  viewDrawerOpen.value = true;
  viewLoading.value = true;
  viewData.value = null;
  try {
    viewData.value = await getAssessmentCycle(record.id);
  } catch {
    viewData.value = null;
  } finally {
    viewLoading.value = false;
  }
}

function formatDate(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});

onMounted(async () => {
  await loadData();
  // 月度自动生成：打开页面时若当月周期尚未创建（如调度未跑/部署当天），自动补齐，
  // 保证每月页面已就绪，人工直接在系统里填分/审核，无需手动新建周期或导入 Excel。
  if (!hasCurrentMonthCycle()) {
    await handleAutoGenerate();
  }
});
</script>

<template>
  <HsePageLayout title="考核周期管理">
    <template #extra>
      <NSpace>
        <NButton :loading="autoGenerating" @click="handleAutoGenerate">自动生成本月周期</NButton>
        <HseActionBar
          :actions="actionState"
          @refresh="loadData"
          @create="showCreateModal"
        />
      </NSpace>
    </template>

    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput v-model:value="searchForm.keyword" placeholder="搜索周期名称" clearable @keyup.enter="onSearch" />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.status"
          placeholder="状态筛选"
          clearable
          :options="statusOptions"
        />
      </NGi>
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
      <template #statusCell="{ row }">
        <HseStatusTag :type="STATUS_TAG[row.status] || 'neutral'">
          {{ STATUS_TEXT[row.status] || row.status }}
        </HseStatusTag>
      </template>
      <template #action="{ row }">
        <NSpace justify="center" :size="4">
          <NButton
            v-if="row.status === 'not_started'"
            size="small"
            type="primary"
            quaternary
            @click="handleStart(row)"
          >
            启动
          </NButton>
          <NButton size="small" quaternary @click="handleView(row)">详情</NButton>
          <NPopconfirm v-if="row.status !== 'frozen'" @positive-click="handleDelete(row)">
            <template #trigger>
              <NButton size="small" type="error" quaternary>删除</NButton>
            </template>
            确认删除该考核周期？
          </NPopconfirm>
        </NSpace>
      </template>
    </HseDataGrid>

    <NModal
      v-model:show="createModalOpen"
      title="新建考核周期"
      preset="card"
      style="width: 520px; max-width: 92vw"
    >
      <NForm label-placement="top">
        <NFormItem label="考核年份" required>
          <NInputNumber v-model:value="createForm.assessment_year" :min="2020" :max="2099" style="width: 100%" />
        </NFormItem>
        <NFormItem label="考核月份" required>
          <NInputNumber v-model:value="createForm.assessment_month" :min="1" :max="12" style="width: 100%" />
        </NFormItem>
        <NFormItem label="周期名称">
          <NInput v-model:value="createForm.cycle_name" placeholder="留空则自动生成" />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="createForm.remark" type="textarea" :rows="3" />
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
      <NDrawerContent :loading="viewLoading" closable title="考核周期详情">
        <template v-if="viewData">
          <NDescriptions label-placement="left" :column="1" bordered>
            <NDescriptionsItem label="周期编码">{{ viewData.cycleCode }}</NDescriptionsItem>
            <NDescriptionsItem label="周期名称">{{ viewData.cycleName }}</NDescriptionsItem>
            <NDescriptionsItem label="考核年月">
              {{ viewData.assessmentYear }} 年 {{ viewData.assessmentMonth }} 月
            </NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <HseStatusTag :type="STATUS_TAG[viewData.status] || 'neutral'">
                {{ STATUS_TEXT[viewData.status] || viewData.status }}
              </HseStatusTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="考核对象数">{{ viewData.targetCount ?? 0 }}</NDescriptionsItem>
            <NDescriptionsItem label="已评分">{{ viewData.scoredCount ?? 0 }}</NDescriptionsItem>
            <NDescriptionsItem label="已审核">{{ viewData.reviewedCount ?? 0 }}</NDescriptionsItem>
            <NDescriptionsItem label="已冻结">{{ viewData.frozenCount ?? 0 }}</NDescriptionsItem>
            <NDescriptionsItem label="周期开始">{{ formatDate(viewData.startTime) }}</NDescriptionsItem>
            <NDescriptionsItem label="周期结束">{{ formatDate(viewData.endTime) }}</NDescriptionsItem>
            <NDescriptionsItem label="创建人">{{ viewData.createdByName }}</NDescriptionsItem>
            <NDescriptionsItem label="创建时间">{{ formatDate(viewData.createdAt) }}</NDescriptionsItem>
            <NDescriptionsItem label="更新时间">{{ formatDate(viewData.updatedAt) }}</NDescriptionsItem>
            <NDescriptionsItem label="备注">{{ viewData.remark || '-' }}</NDescriptionsItem>
          </NDescriptions>
        </template>
        <template v-else-if="!viewLoading">
          <div class="py-12 text-center text-muted-foreground">暂无可展示的数据</div>
        </template>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
