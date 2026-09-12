<script lang="ts" setup>
/**
 * 报表中心（web-naive）
 * 支持安全生产月报、公司汇报材料的生成、查看、导出、归档、删除
 */
import { computed, h, onMounted, reactive, ref } from 'vue';

import { NText } from 'naive-ui';
import { message, dialog } from '#/adapter/naive';
import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  NTabPane,
  NTabs,
} from 'naive-ui';
import {
  BookOpenText,
  CircleX,
  Copy,
  Download,
  Inbox,
  Plus,
  RotateCw,
} from '@vben/icons';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  archiveReport,
  confirmReport,
  deleteReport,
  exportReportHtml,
  exportReportWord,
  generateReport,
  getReportDetail,
  getReportList,
  getReportStatus,
  regenerateReport,
  type ReportsApi,
} from '#/api/hse/reports';

defineOptions({ name: 'HseReports' });

// ===================== 统计 =====================
const statItems = reactive([
  { key: 'total', label: '报告总数', value: 0, icon: 'lucide:file-bar-chart', color: 'blue', suffix: '份' },
  { key: 'month', label: '本月生成', value: 0, icon: 'lucide:plus-circle', color: 'green', suffix: '份' },
  { key: 'pending', label: '待确认', value: 0, icon: 'lucide:clock', color: 'orange', suffix: '份' },
  { key: 'templates', label: '可用模板', value: 2, icon: 'lucide:layout-template', color: 'purple', suffix: '个' },
]);

// ===================== Tab 切换 =====================
const activeTab = ref<'monthly_report' | 'group_report' | 'all'>('monthly_report');

// ===================== 列表数据 =====================
const loading = ref(false);

const monthlyList = ref<ReportsApi.ReportItem[]>([]);
const monthlyTotal = ref(0);
const monthlyPage = ref(1);
const pageSize = ref(10);

const groupList = ref<ReportsApi.ReportItem[]>([]);
const groupTotal = ref(0);
const groupPage = ref(1);

const allList = ref<ReportsApi.ReportItem[]>([]);
const allTotal = ref(0);
const allPage = ref(1);
const searchKeyword = ref('');
const filterConfirmStatus = ref<string | null>(null);

async function loadList(tab: string) {
  loading.value = true;
  try {
    let params: ReportsApi.ListParams = { pageSize: pageSize.value };
    if (tab === 'monthly_report') {
      params.page = monthlyPage.value;
      params.category = 'monthly_report';
      const result = await getReportList(params);
      monthlyList.value = result.list || [];
      monthlyTotal.value = result.total || 0;
    } else if (tab === 'group_report') {
      params.page = groupPage.value;
      params.category = 'group_report';
      const result = await getReportList(params);
      groupList.value = result.list || [];
      groupTotal.value = result.total || 0;
    } else {
      params.page = allPage.value;
      params.keyword = searchKeyword.value || undefined;
      params.confirmStatus = (filterConfirmStatus.value || undefined) as any;
      const result = await getReportList(params);
      allList.value = result.list || [];
      allTotal.value = result.total || 0;
    }
    updateStats();
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false;
  }
}

function updateStats() {
  const all = [...monthlyList.value, ...groupList.value];
  const setStat = (key: string, value: number) => {
    const item = statItems.find((s) => s.key === key);
    if (item) item.value = value;
  };
  setStat('total', monthlyTotal.value + groupTotal.value);
  setStat('pending', all.filter((r) => r.confirmStatus === 'unconfirmed').length);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  setStat('month', all.filter((r) => r.reportPeriod === thisMonth).length);
}

function handleTabChange(key: string) {
  activeTab.value = key as any;
  loadList(key);
}

// ===================== 分页 =====================
function onPageChange(payload: { currentPage: number; pageSize: number }) {
  if (activeTab.value === 'monthly_report') {
    monthlyPage.value = payload.currentPage;
  } else if (activeTab.value === 'group_report') {
    groupPage.value = payload.currentPage;
  } else {
    allPage.value = payload.currentPage;
  }
  pageSize.value = payload.pageSize;
  loadList(activeTab.value);
}

// ===================== 生成报告 =====================
const generateLoading = ref(false);
const generateProgress = ref(0);
const generateStep = ref('');
const selectedPeriod = ref<number | null>(null);
const aiEnabled = ref<'true' | 'false'>('true');
const aiEnabledOptions = [
  { label: '开启', value: 'true' },
  { label: '关闭', value: 'false' },
];
let pollTimer: ReturnType<typeof setInterval> | null = null;

function getCurrentCategory(): ReportsApi.TemplateCategory {
  return activeTab.value === 'group_report' ? 'group_report' : 'monthly_report';
}

function getPeriodPlaceholder(): string {
  return activeTab.value === 'group_report' ? '选择汇报周期' : '选择月份';
}

async function handleGenerate() {
  if (!selectedPeriod.value) {
    message.warning('请选择报告周期');
    return;
  }
  const date = new Date(selectedPeriod.value);
  const periodStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  generateLoading.value = true;
  generateProgress.value = 5;
  generateStep.value = '准备生成...';
  try {
    const result = await generateReport({
      templateCategory: getCurrentCategory(),
      reportPeriod: periodStr,
      aiEnabled: aiEnabled.value === 'true',
    });
    startPolling(result.reportId);
  } catch {
    generateLoading.value = false;
    message.error('生成失败');
  }
}

function startPolling(reportId: number) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const status = await getReportStatus(reportId);
      generateProgress.value = status.progress;
      generateStep.value = status.currentStep;
      if (status.generationStatus === 'completed' || status.generationStatus === 'failed') {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        generateLoading.value = false;
        generateProgress.value = 0;
        generateStep.value = '';
        if (status.generationStatus === 'completed') {
          message.success('报告生成完成');
        } else {
          message.error(status.errorMessage || '生成失败');
        }
        loadList(activeTab.value);
      }
    } catch {
      // ignore poll errors
    }
  }, 2000);
}

// ===================== 报告查看抽屉 =====================
const viewerVisible = ref(false);
const viewerLoading = ref(false);
const currentReport = ref<ReportsApi.ReportDetail | null>(null);
const showSource = ref(false);

async function handleView(record: ReportsApi.ReportItem) {
  viewerVisible.value = true;
  viewerLoading.value = true;
  showSource.value = false;
  try {
    currentReport.value = await getReportDetail(record.id);
  } catch {
    currentReport.value = null;
  } finally {
    viewerLoading.value = false;
  }
}

function handleExportHtml(record: ReportsApi.ReportItem) {
  window.open(exportReportHtml(record.id), '_blank');
}

function handleExportWord(record: ReportsApi.ReportItem) {
  window.location.href = exportReportWord(record.id);
}

function handleRegenerate(record: ReportsApi.ReportItem) {
  dialog.warning({
    title: '重新生成',
    content: '确定要重新生成此报告吗？',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await regenerateReport(record.id);
        message.success('已开始重新生成');
        setTimeout(() => loadList(activeTab.value), 1500);
      } catch {
        // 拦截器已提示
      }
    },
  });
}

function handleArchive(record: ReportsApi.ReportItem) {
  dialog.warning({
    title: '归档报告',
    content: '确定要归档此报告吗？归档后将不在默认列表中显示。',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await archiveReport(record.id);
        message.success('归档成功');
        loadList(activeTab.value);
      } catch {
        // 拦截器已提示
      }
    },
  });
}

function handleDelete(record: ReportsApi.ReportItem) {
  dialog.warning({
    title: '删除报告',
    content: '确定要删除此报告吗？此操作不可恢复。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteReport(record.id);
        message.success('删除成功');
        loadList(activeTab.value);
      } catch {
        // 拦截器已提示
      }
    },
  });
}

async function handleConfirm() {
  if (!currentReport.value) return;
  try {
    await confirmReport(currentReport.value.id, 'confirmed');
    message.success('确认发布成功');
    const detail = await getReportDetail(currentReport.value.id);
    currentReport.value = detail;
    loadList(activeTab.value);
  } catch {
    // 拦截器已提示
  }
}

// ===================== 状态映射 =====================
function genStatusTag(status?: string): { type: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; label: string } {
  const map: Record<string, { type: any; label: string }> = {
    completed: { type: 'success', label: '已完成' },
    failed: { type: 'danger', label: '失败' },
    pending: { type: 'neutral', label: '等待中' },
    collecting: { type: 'info', label: '采集中' },
    ai_generating: { type: 'warning', label: 'AI生成中' },
  };
  return map[status || ''] || { type: 'neutral', label: status || '-' };
}

function aiStatusTag(status?: string): { type: any; label: string } {
  const map: Record<string, { type: any; label: string }> = {
    completed: { type: 'success', label: '已完成' },
    failed: { type: 'danger', label: '失败' },
    processing: { type: 'info', label: '处理中' },
    pending: { type: 'warning', label: '等待中' },
    none: { type: 'neutral', label: '未启用' },
  };
  return map[status || ''] || { type: 'neutral', label: status || '-' };
}

function confirmStatusTag(status?: string): { type: any; label: string } {
  const map: Record<string, { type: any; label: string }> = {
    confirmed: { type: 'success', label: '已确认' },
    rejected: { type: 'danger', label: '已驳回' },
    unconfirmed: { type: 'warning', label: '待确认' },
  };
  return map[status || ''] || { type: 'neutral', label: status || '-' };
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}

// ===================== 表格列 =====================
const reportColumns = computed<VxeTableGridColumns>(() => [
  { title: '报告名称', field: 'reportName', minWidth: 200, align: 'left', showOverflow: 'tooltip' },
  { title: '周期', field: 'reportPeriod', width: 100, align: 'center' },
  { title: '生成状态', field: 'generationStatus', width: 100, align: 'center', slots: { default: 'genStatus' } },
  { title: 'AI', field: 'aiStatus', width: 90, align: 'center', slots: { default: 'aiStatus' } },
  { title: '确认状态', field: 'confirmStatus', width: 100, align: 'center', slots: { default: 'confirmStatus' } },
  { title: '生成时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
  {
    title: '操作',
    field: '_action',
    width: 220,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadList('monthly_report');
});
</script>

<template>
  <HsePageLayout :title="$t('page.hse.reports')" :description="$t('page.hse.reportsDesc')">
    <template #extra>
      <HseActionBar
        :actions="{ create: { hidden: true }, import: { hidden: true }, downloadTemplate: { hidden: true } }"
        @refresh="() => loadList(activeTab)"
        @export="() => {}"
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

    <NTabs v-model:value="activeTab" type="line" @update:value="handleTabChange">
      <!-- 安全生产月报 -->
      <NTabPane name="monthly_report" tab="安全生产月报">
        <!-- 生成卡片 -->
        <NCard size="small" class="mb-4">
          <template #header>
            <div class="card-title">
              <BookOpenText class="title-icon" />
              <span>生成安全生产月报</span>
            </div>
          </template>
          <NForm inline>
            <NFormItem label="报告周期">
              <NDatePicker
                v-model:value="selectedPeriod"
                type="month"
                :placeholder="getPeriodPlaceholder()"
                style="width: 180px"
              />
            </NFormItem>
            <NFormItem label="AI 辅助">
              <NSelect
                v-model:value="aiEnabled"
                :options="aiEnabledOptions"
                style="width: 100px"
              />
            </NFormItem>
            <NFormItem>
              <NButton type="primary" :loading="generateLoading" @click="handleGenerate">
                <template #icon><Plus class="size-4" /></template>
                {{ generateLoading ? '生成中...' : '生成月报' }}
              </NButton>
            </NFormItem>
          </NForm>
          <div v-if="generateLoading" class="mt-3">
            <NProgress :percentage="generateProgress" :show-indicator="false" />
            <div class="progress-text">{{ generateStep }}</div>
          </div>
        </NCard>

        <HseDataGrid
          :columns="reportColumns"
          :data="monthlyList"
          :loading="loading"
          :total="monthlyTotal"
          :pager="{ current: monthlyPage, pageSize }"
          @page-change="onPageChange"
        >
          <template #genStatus="{ row }">
            <HseStatusTag :type="genStatusTag(row.generationStatus).type" size="small">
              {{ genStatusTag(row.generationStatus).label }}
            </HseStatusTag>
          </template>
          <template #aiStatus="{ row }">
            <HseStatusTag :type="aiStatusTag(row.aiStatus).type" size="small">
              {{ aiStatusTag(row.aiStatus).label }}
            </HseStatusTag>
          </template>
          <template #confirmStatus="{ row }">
            <HseStatusTag :type="confirmStatusTag(row.confirmStatus).type" size="small">
              {{ confirmStatusTag(row.confirmStatus).label }}
            </HseStatusTag>
          </template>
          <template #createdAt="{ row }">
            <span>{{ formatDate(row.createdAt) }}</span>
          </template>
          <template #action="{ row }">
            <NSpace justify="center" size="small">
              <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
              <NDropdown
                :options="[
                  { label: '导出 HTML', key: 'html', icon: () => h(Copy) },
                  { label: '导出 Word', key: 'word', icon: () => h(Download) },
                  { label: '重新生成', key: 'regen', icon: () => h(RotateCw) },
                  { label: '归档', key: 'archive', icon: () => h(Inbox) },
                  { label: '删除', key: 'delete', icon: () => h(CircleX) },
                ]"
                @select="(key: string) => {
                  if (key === 'html') handleExportHtml(row);
                  else if (key === 'word') handleExportWord(row);
                  else if (key === 'regen') handleRegenerate(row);
                  else if (key === 'archive') handleArchive(row);
                  else if (key === 'delete') handleDelete(row);
                }"
              >
                <NButton size="small" quaternary>更多</NButton>
              </NDropdown>
            </NSpace>
          </template>
        </HseDataGrid>
      </NTabPane>

      <!-- 公司汇报材料 -->
      <NTabPane name="group_report" tab="公司汇报材料">
        <NCard size="small" class="mb-4">
          <template #header>
            <div class="card-title">
              <BookOpenText class="title-icon" />
              <span>生成公司汇报材料</span>
            </div>
          </template>
          <NForm inline>
            <NFormItem label="汇报周期">
              <NDatePicker
                v-model:value="selectedPeriod"
                type="month"
                placeholder="选择汇报周期"
                style="width: 180px"
              />
            </NFormItem>
            <NFormItem label="AI 辅助">
              <NSelect
                v-model:value="aiEnabled"
                :options="aiEnabledOptions"
                style="width: 100px"
              />
            </NFormItem>
            <NFormItem>
              <NButton type="primary" :loading="generateLoading" @click="handleGenerate">
                <template #icon><Plus class="size-4" /></template>
                {{ generateLoading ? '生成中...' : '生成汇报' }}
              </NButton>
            </NFormItem>
          </NForm>
          <div v-if="generateLoading" class="mt-3">
            <NProgress :percentage="generateProgress" :show-indicator="false" />
            <div class="progress-text">{{ generateStep }}</div>
          </div>
        </NCard>

        <HseDataGrid
          :columns="reportColumns"
          :data="groupList"
          :loading="loading"
          :total="groupTotal"
          :pager="{ current: groupPage, pageSize }"
          @page-change="onPageChange"
        >
          <template #genStatus="{ row }">
            <HseStatusTag :type="genStatusTag(row.generationStatus).type" size="small">
              {{ genStatusTag(row.generationStatus).label }}
            </HseStatusTag>
          </template>
          <template #aiStatus="{ row }">
            <HseStatusTag :type="aiStatusTag(row.aiStatus).type" size="small">
              {{ aiStatusTag(row.aiStatus).label }}
            </HseStatusTag>
          </template>
          <template #confirmStatus="{ row }">
            <HseStatusTag :type="confirmStatusTag(row.confirmStatus).type" size="small">
              {{ confirmStatusTag(row.confirmStatus).label }}
            </HseStatusTag>
          </template>
          <template #createdAt="{ row }">
            <span>{{ formatDate(row.createdAt) }}</span>
          </template>
          <template #action="{ row }">
            <NSpace justify="center" size="small">
              <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
              <NDropdown
                :options="[
                  { label: '导出 HTML', key: 'html' },
                  { label: '导出 Word', key: 'word' },
                  { label: '重新生成', key: 'regen' },
                  { label: '归档', key: 'archive' },
                  { label: '删除', key: 'delete' },
                ]"
                @select="(key: string) => {
                  if (key === 'html') handleExportHtml(row);
                  else if (key === 'word') handleExportWord(row);
                  else if (key === 'regen') handleRegenerate(row);
                  else if (key === 'archive') handleArchive(row);
                  else if (key === 'delete') handleDelete(row);
                }"
              >
                <NButton size="small" quaternary>更多</NButton>
              </NDropdown>
            </NSpace>
          </template>
        </HseDataGrid>
      </NTabPane>

      <!-- 全部报告 -->
      <NTabPane name="all" tab="全部报告">
        <HseSearchPanel @query="() => { allPage = 1; loadList('all'); }" @reset="() => { searchKeyword = ''; filterConfirmStatus = null; allPage = 1; loadList('all'); }">
          <NFormItem label="关键词">
            <NInput v-model:value="searchKeyword" placeholder="搜索报告名称" clearable @keyup.enter="() => { allPage = 1; loadList('all'); }" />
          </NFormItem>
          <NFormItem label="确认状态">
            <NSelect
              v-model:value="filterConfirmStatus"
              placeholder="全部"
              clearable
              :options="[
                { label: '待确认', value: 'unconfirmed' },
                { label: '已确认', value: 'confirmed' },
                { label: '已驳回', value: 'rejected' },
              ]"
              @update:value="() => { allPage = 1; loadList('all'); }"
            />
          </NFormItem>
        </HseSearchPanel>

        <HseDataGrid
          :columns="reportColumns"
          :data="allList"
          :loading="loading"
          :total="allTotal"
          :pager="{ current: allPage, pageSize }"
          @page-change="onPageChange"
        >
          <template #genStatus="{ row }">
            <HseStatusTag :type="genStatusTag(row.generationStatus).type" size="small">
              {{ genStatusTag(row.generationStatus).label }}
            </HseStatusTag>
          </template>
          <template #aiStatus="{ row }">
            <HseStatusTag :type="aiStatusTag(row.aiStatus).type" size="small">
              {{ aiStatusTag(row.aiStatus).label }}
            </HseStatusTag>
          </template>
          <template #confirmStatus="{ row }">
            <HseStatusTag :type="confirmStatusTag(row.confirmStatus).type" size="small">
              {{ confirmStatusTag(row.confirmStatus).label }}
            </HseStatusTag>
          </template>
          <template #createdAt="{ row }">
            <span>{{ formatDate(row.createdAt) }}</span>
          </template>
          <template #action="{ row }">
            <NSpace justify="center" size="small">
              <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
              <NDropdown
                :options="[
                  { label: '导出 HTML', key: 'html' },
                  { label: '导出 Word', key: 'word' },
                  { label: '重新生成', key: 'regen' },
                  { label: '归档', key: 'archive' },
                  { label: '删除', key: 'delete' },
                ]"
                @select="(key: string) => {
                  if (key === 'html') handleExportHtml(row);
                  else if (key === 'word') handleExportWord(row);
                  else if (key === 'regen') handleRegenerate(row);
                  else if (key === 'archive') handleArchive(row);
                  else if (key === 'delete') handleDelete(row);
                }"
              >
                <NButton size="small" quaternary>更多</NButton>
              </NDropdown>
            </NSpace>
          </template>
        </HseDataGrid>
      </NTabPane>
    </NTabs>

    <!-- 报告查看抽屉 -->
    <NDrawer
      v-model:show="viewerVisible"
      :title="currentReport?.reportName || '报告详情'"
      width="900"
      :mask-closable="false"
    >
      <NSpin :show="viewerLoading">
        <div v-if="currentReport" class="report-viewer">
          <div class="status-bar mb-4">
            <NSpace>
              <HseStatusTag :type="genStatusTag(currentReport.generationStatus).type" size="small">
                {{ genStatusTag(currentReport.generationStatus).label }}
              </HseStatusTag>
              <HseStatusTag
                v-if="currentReport.aiStatus !== 'none'"
                :type="aiStatusTag(currentReport.aiStatus).type"
                size="small"
              >
                AI: {{ aiStatusTag(currentReport.aiStatus).label }}
              </HseStatusTag>
              <HseStatusTag :type="confirmStatusTag(currentReport.confirmStatus).type" size="small">
                {{ confirmStatusTag(currentReport.confirmStatus).label }}
              </HseStatusTag>
              <NText depth="3" class="text-sm">
                生成时间：{{ formatDate(currentReport.createdAt) }}
              </NText>
            </NSpace>
          </div>

          <NAlert
            v-if="currentReport.aiSummary"
            type="warning"
            show-icon
            class="mb-4"
          >
            <template #header>AI 辅助生成提示</template>
            本报告部分内容由 AI 辅助生成，仅供参考，请以实际数据为准。
            <NButton text size="small" @click="showSource = !showSource">
              {{ showSource ? '隐藏' : '查看' }}数据来源
            </NButton>

            <div v-if="showSource" class="source-panel mt-3">
              <NDescriptions size="small" bordered :column="2">
                <NDescriptionsItem label="事件总数">
                  {{ currentReport.sourceDataRef?.eventCount ?? 0 }}
                </NDescriptionsItem>
                <NDescriptionsItem label="隐患数">
                  {{ currentReport.sourceDataRef?.hazardCount ?? 0 }}
                </NDescriptionsItem>
                <NDescriptionsItem label="事故数">
                  {{ currentReport.sourceDataRef?.accidentCount ?? 0 }}
                </NDescriptionsItem>
                <NDescriptionsItem label="任务完成率">
                  {{ currentReport.sourceDataRef?.taskCompletionRate ?? 0 }}%
                </NDescriptionsItem>
              </NDescriptions>
            </div>
          </NAlert>

          <div class="report-html-container">
            <iframe
              v-if="currentReport.reportHtml"
              :srcdoc="currentReport.reportHtml"
              class="report-iframe"
              frameborder="0"
            />
            <NEmpty v-else description="暂无报告内容" />
          </div>
        </div>

        <NEmpty v-else-if="!viewerLoading" description="无法加载报告详情" />
      </NSpin>

      <template #footer>
        <NSpace>
          <NButton @click="viewerVisible = false">关闭</NButton>
          <NButton
            v-if="currentReport"
            @click="handleExportHtml(currentReport)"
          >
            <template #icon><Copy class="size-4" /></template>
            导出 HTML
          </NButton>
          <NButton
            v-if="currentReport"
            @click="handleExportWord(currentReport)"
          >
            <template #icon><Download class="size-4" /></template>
            导出 Word
          </NButton>
          <NButton
            v-if="currentReport?.confirmStatus !== 'confirmed'"
            type="primary"
            @click="handleConfirm"
          >
            确认发布
          </NButton>
        </NSpace>
      </template>
    </NDrawer>
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

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.title-icon {
  color: hsl(var(--primary));
}

.progress-text {
  text-align: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 4px;
}

.mb-4 {
  margin-bottom: 16px;
}

.mt-3 {
  margin-top: 12px;
}

.text-sm {
  font-size: 13px;
}

.source-panel {
  padding: 12px;
  background: hsl(var(--muted));
  border-radius: 4px;
}

.report-html-container {
  flex: 1;
  min-height: 400px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  overflow: hidden;
}

.report-iframe {
  width: 100%;
  height: 600px;
  border: 0;
}

.status-bar {
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .stat-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
