<template>
  <div class="report-list-table">
    <Table
      :columns="columns"
      :data-source="list"
      :pagination="paginationConfig"
      :loading="loading"
      :row-key="(record: any) => record.id"
      size="middle"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'aiStatus'">
          <a-tag v-if="record.aiStatus === 'completed'" color="green">已完成</a-tag>
          <a-tag v-else-if="record.aiStatus === 'processing'" color="blue">处理中</a-tag>
          <a-tag v-else-if="record.aiStatus === 'failed'" color="red">失败</a-tag>
          <a-tag v-else color="default">未启用</a-tag>
        </template>

        <template v-if="column.key === 'generationStatus'">
          <a-tag v-if="record.generationStatus === 'completed'" color="green">已完成</a-tag>
          <a-tag v-else-if="record.generationStatus === 'failed'" color="red">失败</a-tag>
          <a-tag v-else color="processing">生成中</a-tag>
        </template>

        <template v-if="column.key === 'confirmStatus'">
          <a-tag v-if="record.confirmStatus === 'confirmed'" color="green">已确认</a-tag>
          <a-tag v-else-if="record.confirmStatus === 'rejected'" color="red">已驳回</a-tag>
          <a-tag v-else color="orange">待确认</a-tag>
        </template>

        <template v-if="column.key === 'action'">
          <a-button type="link" size="small" @click="$emit('view', record as any)">查看</a-button>
          <a-dropdown>
            <a-button type="link" size="small">更多 <IconifyIcon icon="lucide:chevron-down" class="inline" /></a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item key="export-html" @click="$emit('exportHtml', record as any)">
                  <IconifyIcon icon="lucide:file-text" class="mr-1" /> 导出 HTML
                </a-menu-item>
                <a-menu-item key="export-word" @click="$emit('exportWord', record as any)">
                  <IconifyIcon icon="lucide:file-type-docx" class="mr-1" /> 导出 Word
                </a-menu-item>
                <a-menu-divider />
                <a-menu-item key="regenerate" @click="$emit('regenerate', record as any)">
                  <IconifyIcon icon="lucide:refresh-cw" class="mr-1" /> 重新生成
                </a-menu-item>
                <a-menu-item key="archive" @click="$emit('archive', record as any)">
                  <IconifyIcon icon="lucide:archive" class="mr-1" /> 归档
                </a-menu-item>
                <a-menu-item key="delete" danger @click="$emit('delete', record as any)">
                  <IconifyIcon icon="lucide:trash-2" class="mr-1" /> 删除
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>
    </Table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Table } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import type { ReportsApi } from '#/api/hse/reports';

const props = defineProps<{
  list: ReportsApi.ReportItem[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'pageChange', page: number, pageSize: number): void;
  (e: 'view', record: ReportsApi.ReportItem): void;
  (e: 'exportHtml', record: ReportsApi.ReportItem): void;
  (e: 'exportWord', record: ReportsApi.ReportItem): void;
  (e: 'regenerate', record: ReportsApi.ReportItem): void;
  (e: 'archive', record: ReportsApi.ReportItem): void;
  (e: 'delete', record: ReportsApi.ReportItem): void;
}>();

const columns = [
  { title: '报告名称', dataIndex: 'reportName', key: 'reportName', ellipsis: true },
  { title: '周期', dataIndex: 'reportPeriod', key: 'reportPeriod', width: 120 },
  { title: '生成状态', dataIndex: 'generationStatus', key: 'generationStatus', width: 100 },
  { title: 'AI', dataIndex: 'aiStatus', key: 'aiStatus', width: 90 },
  { title: '确认状态', dataIndex: 'confirmStatus', key: 'confirmStatus', width: 100 },
  { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const },
];

const paginationConfig = computed(() => ({
  current: props.page,
  pageSize: props.pageSize,
  total: props.total,
  showSizeChanger: true,
  showQuickJumper: true,
  showTotal: (total: number) => `共 ${total} 条`,
}));

function handleTableChange(pag: any) {
  emit('pageChange', pag.current, pag.pageSize);
}
</script>

<style scoped>
.report-list-table {
  width: 100%;
}
.inline {
  display: inline-block;
  vertical-align: middle;
}
.mr-1 {
  margin-right: 4px;
}
</style>
