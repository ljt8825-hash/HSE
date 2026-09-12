<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="6" :lg="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
          :suffix="stat.suffix"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <a-tabs v-model:activeKey="activeTab" @change="handleTabChange">
        <a-tab-pane key="monthly_report" tab="安全生产月报">
          <ReportGeneratorCard
            title="生成安全生产月报"
            category="monthly_report"
            generate-text="生成月报"
            placeholder="选择月份"
            @generated="onReportGenerated"
            @refresh="() => loadList('monthly_report')"
          />
          <ReportListTable
            :list="monthlyList"
            :total="monthlyTotal"
            :page="monthlyPage"
            :page-size="monthlyPageSize"
            :loading="loading"
            @page-change="(p, s) => { monthlyPage = p; monthlyPageSize = s; loadList('monthly_report'); }"
            @view="handleView"
            @export-html="handleExportHtml"
            @export-word="handleExportWord"
            @regenerate="handleRegenerate"
            @archive="handleArchive"
            @delete="handleDelete"
          />
        </a-tab-pane>

        <a-tab-pane key="group_report" tab="公司汇报材料">
          <ReportGeneratorCard
            title="生成公司汇报材料"
            category="group_report"
            generate-text="生成汇报"
            placeholder="选择汇报周期"
            @generated="onReportGenerated"
            @refresh="() => loadList('group_report')"
          />
          <ReportListTable
            :list="groupList"
            :total="groupTotal"
            :page="groupPage"
            :page-size="groupPageSize"
            :loading="loading"
            @page-change="(p, s) => { groupPage = p; groupPageSize = s; loadList('group_report'); }"
            @view="handleView"
            @export-html="handleExportHtml"
            @export-word="handleExportWord"
            @regenerate="handleRegenerate"
            @archive="handleArchive"
            @delete="handleDelete"
          />
        </a-tab-pane>

        <a-tab-pane key="all" tab="全部报告">
          <div class="filter-bar mb-4">
            <a-input-search
              v-model:value="searchKeyword"
              placeholder="搜索报告名称"
              style="width: 260px"
              allow-clear
              @search="loadList('all')"
            />
            <a-select
              v-model:value="filterConfirmStatus"
              placeholder="确认状态"
              style="width: 140px; margin-left: 12px"
              allow-clear
              @change="loadList('all')"
            >
              <Select.Option value="unconfirmed">待确认</Select.Option>
              <Select.Option value="confirmed">已确认</Select.Option>
              <Select.Option value="rejected">已驳回</Select.Option>
            </a-select>
          </div>
          <ReportListTable
            :list="allList"
            :total="allTotal"
            :page="allPage"
            :page-size="allPageSize"
            :loading="loading"
            @page-change="(p, s) => { allPage = p; allPageSize = s; loadList('all'); }"
            @view="handleView"
            @export-html="handleExportHtml"
            @export-word="handleExportWord"
            @regenerate="handleRegenerate"
            @archive="handleArchive"
            @delete="handleDelete"
          />
        </a-tab-pane>
      </a-tabs>
    </Card>

    <ReportViewerDrawer
      :visible="viewerVisible"
      :report-id="currentReportId"
      @close="viewerVisible = false"
      @refresh="loadList(activeTab)"
    />
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { Card, Row, Col, Select, message, Modal } from 'ant-design-vue';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ReportGeneratorCard from './components/ReportGeneratorCard.vue';
import ReportListTable from './components/ReportListTable.vue';
import ReportViewerDrawer from './components/ReportViewerDrawer.vue';
import {
  getReportList,
  regenerateReport,
  archiveReport,
  deleteReport,
  exportReportHtml,
  exportReportWord,
} from '#/api/hse/reports';
import type { ReportsApi } from '#/api/hse/reports';

const activeTab = ref('monthly_report');
const loading = ref(false);

const statItems = reactive([
  { key: 'total', label: '报告总数', value: 0, icon: 'lucide:file-bar-chart', color: 'blue', suffix: '份' },
  { key: 'month', label: '本月生成', value: 0, icon: 'lucide:plus-circle', color: 'green', suffix: '份' },
  { key: 'pending', label: '待确认', value: 0, icon: 'lucide:clock', color: 'orange', suffix: '份' },
  { key: 'templates', label: '可用模板', value: 2, icon: 'lucide:layout-template', color: 'purple', suffix: '个' },
]);

const monthlyList = ref<ReportsApi.ReportItem[]>([]);
const monthlyTotal = ref(0);
const monthlyPage = ref(1);
const monthlyPageSize = ref(10);

const groupList = ref<ReportsApi.ReportItem[]>([]);
const groupTotal = ref(0);
const groupPage = ref(1);
const groupPageSize = ref(10);

const allList = ref<ReportsApi.ReportItem[]>([]);
const allTotal = ref(0);
const allPage = ref(1);
const allPageSize = ref(10);
const searchKeyword = ref('');
const filterConfirmStatus = ref('');

const viewerVisible = ref(false);
const currentReportId = ref<number | null>(null);

async function loadList(tab: string) {
  loading.value = true;
  try {
    let params: ReportsApi.ListParams = {};

    if (tab === 'monthly_report') {
      params = { category: 'monthly_report', page: monthlyPage.value, pageSize: monthlyPageSize.value };
      const result = await getReportList(params);
      monthlyList.value = result.list;
      monthlyTotal.value = result.total;
    } else if (tab === 'group_report') {
      params = { category: 'group_report', page: groupPage.value, pageSize: groupPageSize.value };
      const result = await getReportList(params);
      groupList.value = result.list;
      groupTotal.value = result.total;
    } else {
      params = {
        page: allPage.value,
        pageSize: allPageSize.value,
        keyword: searchKeyword.value || undefined,
        confirmStatus: (filterConfirmStatus.value || undefined) as any,
      };
      const result = await getReportList(params);
      allList.value = result.list;
      allTotal.value = result.total;
    }

    updateStats();
  } catch (err: any) {
    message.error(err.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function updateStats() {
  const all = [...monthlyList.value, ...groupList.value];
  statItems[0]!.value = monthlyTotal.value + groupTotal.value;
  statItems[2]!.value = all.filter(r => r.confirmStatus === 'unconfirmed').length;
}

function handleTabChange(key: string) {
  activeTab.value = key;
  loadList(key);
}

function onReportGenerated(reportId: number) {
  currentReportId.value = reportId;
}

function handleView(record: ReportsApi.ReportItem) {
  currentReportId.value = record.id;
  viewerVisible.value = true;
}

function handleExportHtml(record: ReportsApi.ReportItem) {
  const url = exportReportHtml(record.id);
  window.open(url, '_blank');
}

function handleExportWord(record: ReportsApi.ReportItem) {
  const url = exportReportWord(record.id);
  window.location.href = url;
}

function handleRegenerate(record: ReportsApi.ReportItem) {
  Modal.confirm({
    title: '重新生成',
    content: '确定要重新生成此报告吗？',
    onOk: async () => {
      await regenerateReport(record.id);
      message.success('已开始重新生成');
      setTimeout(() => loadList(activeTab.value), 1000);
    },
  });
}

function handleArchive(record: ReportsApi.ReportItem) {
  Modal.confirm({
    title: '归档报告',
    content: '确定要归档此报告吗？归档后将不在默认列表中显示。',
    onOk: async () => {
      await archiveReport(record.id);
      message.success('归档成功');
      loadList(activeTab.value);
    },
  });
}

function handleDelete(record: ReportsApi.ReportItem) {
  Modal.confirm({
    title: '删除报告',
    content: '确定要删除此报告吗？',
    okType: 'danger',
    onOk: async () => {
      await deleteReport(record.id);
      message.success('删除成功');
      loadList(activeTab.value);
    },
  });
}

onMounted(() => {
  loadList('monthly_report');
});
</script>

<style scoped>
.hse-page {
  padding: 16px;
}
.mb-4 {
  margin-bottom: 16px;
}
.filter-bar {
  display: flex;
  align-items: center;
}
</style>
