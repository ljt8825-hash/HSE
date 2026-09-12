<template>
  <Page auto-content-height class="hse-page">
    <template #title>预警与整改中心</template>
    <template #description>集中查看、处置和跟踪安全预警</template>
    <Row :gutter="[16, 16]" class="mb-4">
      <template v-if="statsLoading">
        <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
          <Card :bordered="false">
            <Skeleton active :paragraph="{ rows: 2 }" />
          </Card>
        </Col>
      </template>
      <template v-else>
        <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
          <Card :bordered="false">
            <Statistic :title="stat.label" :value="stat.value" :value-style="getStatValueStyle(stat.color)">
              <template #prefix><IconifyIcon :icon="stat.icon" /></template>
            </Statistic>
          </Card>
        </Col>
      </template>
    </Row>

    <Card :bordered="false" class="table-card">
      <template #title>
        <div class="card-header">
          <span>告警列表</span>
          <div class="header-actions">
            <Space :size="8">
              <HelpButton menuCode="HSE_ALERTS" />
              <Button type="primary" @click="handleExport">
                <template #icon><IconifyIcon icon="lucide:download" /></template>
                导出
              </Button>
              <Button
                type="primary"
                danger
                :disabled="selectedRowKeys.length === 0"
                @click="handleBatchResolve"
              >
                <template #icon><IconifyIcon icon="lucide:check-circle-2" /></template>
                批量处置 ({{ selectedRowKeys.length }})
              </Button>
            </Space>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索告警标题/描述"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="级别">
          <Select
            v-model:value="searchForm.level"
            placeholder="全部级别"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option value="critical">严重</Select.Option>
            <Select.Option value="high">高危</Select.Option>
            <Select.Option value="medium">中危</Select.Option>
            <Select.Option value="low">低危</Select.Option>
            <Select.Option value="info">提示</Select.Option>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <Select.Option value="new">待处理</Select.Option>
            <Select.Option value="processing">处理中</Select.Option>
            <Select.Option value="resolved">已关闭</Select.Option>
          </Select>
        </FormItem>
        <FormItem label="时间范围">
          <DatePicker.RangePicker v-model:value="dateRange" @change="handleSearch" />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>
      <Table
        :columns="columns"
        :data-source="alertStore.list"
        :loading="alertStore.loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: alertStore.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }"
        :row-selection="{
          selectedRowKeys: selectedRowKeys,
          onChange: onSelectionChange,
        }"
        :row-key="(record) => record.id"
        @change="(p: any) => handleTableChange(p)"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'level'">
            <Tag :color="getLevelColor(record.level)">{{ getLevelText(record.level) }}</Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ getStatusText(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
              <Button
                v-if="record.status !== 'resolved'"
                type="link"
                size="small"
                @click="handleResolve(record as any)"
              >
                处置
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="resolveModalVisible"
      title="告警处置"
      :confirm-loading="resolveLoading"
      @ok="handleResolveConfirm"
      @cancel="resolveModalVisible = false"
    >
      <Form layout="vertical">
        <FormItem label="处置备注">
          <Input.TextArea
            v-model:value="resolveForm.remark"
            :rows="4"
            placeholder="请输入处置说明..."
          />
        </FormItem>
        <FormItem v-if="isBatchResolve" label="处置数量">
          <Tag color="blue">共 {{ selectedRowKeys.length }} 条告警</Tag>
        </FormItem>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="告警详情" width="600px">
      <template v-if="currentAlert">
        <Descriptions :column="1" bordered size="small">
          <DescriptionsItem label="告警标题">{{ currentAlert.title }}</DescriptionsItem>
          <DescriptionsItem label="告警级别">
            <Tag :color="getLevelColor(currentAlert.level)">
              {{ getLevelText(currentAlert.level) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="告警状态">
            <Tag :color="getStatusColor(currentAlert.status)">
              {{ getStatusText(currentAlert.status) }}
            </Tag>
          </DescriptionsItem>
          <DescriptionsItem label="告警来源">{{ currentAlert.source }}</DescriptionsItem>
          <DescriptionsItem label="发生位置">{{ currentAlert.location || '-' }}</DescriptionsItem>
          <DescriptionsItem label="发生时间">
            {{ formatDate(currentAlert.occurredAt) }}
          </DescriptionsItem>
          <DescriptionsItem v-if="currentAlert.resolvedAt" label="解决时间">
            {{ formatDate(currentAlert.resolvedAt) }}
          </DescriptionsItem>
          <DescriptionsItem label="详细描述">{{ currentAlert.description }}</DescriptionsItem>
        </Descriptions>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import { Button, Card, Col, DatePicker, Descriptions, DescriptionsItem, Drawer, Form, FormItem, Input, Modal, Row, Select, Skeleton, Space, Statistic, Table, Tag, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons'; // [Vben官方] 图标改用 IconifyIcon(icon prop)，参考 @vben/icons 与 layouts/basic.vue
import dayjs from 'dayjs';

import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import { useAlertStore } from '#/store/alerts';
import { batchResolveAlerts, resolveAlert, exportAlerts, type AlertsApi } from '#/api/hse/alerts';

const alertStore = useAlertStore();

const searchForm = reactive({
  keyword: '',
  level: undefined as string | undefined,
  status: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const dateRange = ref<any>(null);
const selectedRowKeys = ref<number[]>([]);
const resolveModalVisible = ref(false);
const resolveLoading = ref(false);
const isBatchResolve = ref(false);
const resolveForm = reactive({
  remark: '',
});
const detailDrawerVisible = ref(false);
const currentAlert = ref<AlertsApi.AlertItem | null>(null);
const statsLoading = ref(false);

const columns = [
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: '告警标题', dataIndex: 'title', key: 'title', width: 200 },
  { title: '级别', dataIndex: 'level', key: 'level', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '来源', dataIndex: 'source', key: 'source', width: 120 },
  { title: '位置', dataIndex: 'location', key: 'location', width: 140 },
  { title: '发生时间', dataIndex: 'occurredAt', key: 'occurredAt', width: 170 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
];

const statItems = computed(() => {
  const stats = alertStore.stats;
  if (!stats) {
    return [
      { key: 'total', label: '告警总数', value: 0, icon: 'lucide:bar-chart-3', color: 'blue' },
      { key: 'critical', label: '严重告警', value: 0, icon: 'lucide:alert-triangle', color: 'red' },
      { key: 'new', label: '待处理', value: 0, icon: 'lucide:clock', color: 'orange' },
      { key: 'resolved', label: '已解决', value: 0, icon: 'lucide:check-circle-2', color: 'green' },
    ];
  }
  return [
    { key: 'total', label: '告警总数', value: stats.total, icon: 'lucide:bar-chart-3', color: 'blue' },
    { key: 'critical', label: '严重告警', value: stats.critical, icon: 'lucide:alert-triangle', color: 'red' },
    { key: 'new', label: '待处理', value: stats.newCount, icon: 'lucide:clock', color: 'orange' },
    { key: 'resolved', label: '已解决', value: stats.resolvedCount, icon: 'lucide:check-circle-2', color: 'green' },
  ];
});

function getLevelColor(level: string): string {
  const map: Record<string, string> = {
    critical: 'red',
    high: 'orange',
    medium: 'gold',
    low: 'blue',
    info: 'default',
  };
  return map[level] || 'default';
}

function getLevelText(level: string): string {
  const map: Record<string, string> = {
    critical: '严重',
    high: '高危',
    medium: '中危',
    low: '低危',
    info: '提示',
  };
  return map[level] || level;
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    new: 'red',
    processing: 'gold',
    resolved: 'green',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    new: '待处理',
    processing: '处理中',
    resolved: '已关闭',
  };
  return map[status] || status;
}

function getStatValueStyle(color: string) {
  const colorMap: Record<string, string> = {
    blue: 'hsl(var(--primary))',
    green: 'hsl(var(--success))',
    orange: 'hsl(var(--warning))',
    red: 'hsl(var(--error))',
  };
  return { color: colorMap[color] || 'hsl(var(--foreground))' };
}

function formatDate(date: string): string {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

async function fetchData() {
  const params: AlertsApi.AlertListParams = {
    page: pagination.page,
    pageSize: pagination.pageSize,
    keyword: searchForm.keyword || undefined,
    level: searchForm.level,
    status: searchForm.status,
  };
  if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
    params.startDate = dateRange.value[0].format('YYYY-MM-DD');
    params.endDate = dateRange.value[1].format('YYYY-MM-DD');
  }
  await alertStore.fetchList(params);
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    await alertStore.fetchStats();
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.level = undefined;
  searchForm.status = undefined;
  dateRange.value = null;
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function onSelectionChange(keys: any[]) {
  selectedRowKeys.value = keys as number[];
}

function handleBatchResolve() {
  if (selectedRowKeys.value.length === 0) return;
  isBatchResolve.value = true;
  resolveForm.remark = '';
  resolveModalVisible.value = true;
}

function handleResolve(record: AlertsApi.AlertItem) {
  isBatchResolve.value = false;
  currentAlert.value = record;
  resolveForm.remark = '';
  resolveModalVisible.value = true;
}

async function handleResolveConfirm() {
  resolveLoading.value = true;
  try {
    if (isBatchResolve.value) {
      await batchResolveAlerts({
        ids: selectedRowKeys.value,
        remark: resolveForm.remark,
      });
      message.success(`成功处置 ${selectedRowKeys.value.length} 条告警`);
      selectedRowKeys.value = [];
    } else if (currentAlert.value) {
      await resolveAlert(currentAlert.value.id, {
        remark: resolveForm.remark,
      });
      message.success('处置成功');
    }
    resolveModalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('处置失败:', err);
    message.error('处置失败，请稍后重试');
  } finally {
    resolveLoading.value = false;
  }
}

function handleView(record: AlertsApi.AlertItem) {
  currentAlert.value = record;
  detailDrawerVisible.value = true;
}

async function handleExport() {
  try {
    const params: AlertsApi.AlertListParams = {
      keyword: searchForm.keyword || undefined,
      level: searchForm.level,
      status: searchForm.status,
    };
    await exportAlerts(params);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出失败:', err);
    message.error('导出失败，请稍后重试');
  }
}

onMounted(() => {
  fetchStats();
  fetchData();
});
</script>

<style scoped lang="scss">
.hse-page {
  .table-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;

      .header-actions {
        display: flex;
        gap: 8px;
      }
    }

    .filter-form {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid hsl(var(--border));
    }
  }
}
</style>
