<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>应急事件管理</span>
          <Space>
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增事件
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="search.form.keyword"
            placeholder="事件标题/地点/报告人"
            allow-clear
            style="width: 220px"
            @change="table.handleReset"
          />
        </FormItem>
        <FormItem label="事件等级">
          <Select v-model:value="search.form.event_level" placeholder="全部" allow-clear style="width: 140px" @change="table.handleReset">
            <SelectOption value="一级">一级</SelectOption>
            <SelectOption value="二级">二级</SelectOption>
            <SelectOption value="三级">三级</SelectOption>
            <SelectOption value="四级">四级</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select v-model:value="search.form.status" placeholder="全部" allow-clear style="width: 140px" @change="table.handleReset">
            <SelectOption value="已接报">已接报</SelectOption>
            <SelectOption value="响应中">响应中</SelectOption>
            <SelectOption value="处置中">处置中</SelectOption>
            <SelectOption value="已结案">已结案</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="search.reset">重置</Button>
        </FormItem>
      </Form>

      <Row :gutter="16" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="本年事件数" :value="stats.total" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="处置中" :value="stats.handling" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="已结案" :value="stats.closed" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="平均处置时长(小时)" :value="stats.avgDuration" />
          </Card>
        </Col>
      </Row>

      <Table
        :columns="(tableColumns as any)"
        :data-source="table.dataList"
        :loading="table.loading"
        :pagination="table.pagination"
        :row-key="(record) => record.id"
        @change="table.handleTableChange"
        size="middle"
        :scroll="{ x: 1600 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'event_level'">
            <Tag :color="getLevelColor(record.event_level)">{{ record.event_level || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">{{ record.status || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'happen_time'">
            {{ record.happen_time || '-' }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
              <Popconfirm title="确定要删除吗？" ok-type="danger" @confirm="handleDelete(record)">
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="formModalVisible"
      :title="editingRecord ? '编辑应急事件' : '新增应急事件'"
      width="760px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="事件标题" required>
              <Input v-model:value="eventForm.title" placeholder="请输入事件标题" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="事件类型">
              <Input v-model:value="eventForm.event_type" placeholder="请输入事件类型" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="事件等级" required>
              <Select v-model:value="eventForm.event_level" placeholder="请选择等级" style="width: 100%">
                <SelectOption value="一级">一级</SelectOption>
                <SelectOption value="二级">二级</SelectOption>
                <SelectOption value="三级">三级</SelectOption>
                <SelectOption value="四级">四级</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="状态">
              <Select v-model:value="eventForm.status" placeholder="请选择状态" style="width: 100%">
                <SelectOption value="已接报">已接报</SelectOption>
                <SelectOption value="响应中">响应中</SelectOption>
                <SelectOption value="处置中">处置中</SelectOption>
                <SelectOption value="已结案">已结案</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="发生时间">
              <DatePicker
                v-model:value="eventForm.happen_time"
                show-time
                style="width: 100%"
                format="YYYY-MM-DD HH:mm:ss"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="地点">
              <Input v-model:value="eventForm.location" placeholder="请输入发生地点" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="报告人">
              <Input v-model:value="eventForm.reporter" placeholder="请输入报告人" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="关联人员">
              <EmployeeSelector v-model:value="eventForm.personnelId" mode="single" placeholder="选择关联人员（可选）" />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="响应过程">
          <Textarea v-model:value="eventForm.response_process" :rows="3" placeholder="请输入响应过程" />
        </FormItem>
        <FormItem label="处置措施">
          <Textarea v-model:value="eventForm.handling_measures" :rows="3" placeholder="请输入处置措施" />
        </FormItem>
        <FormItem label="处置结果">
          <Textarea v-model:value="eventForm.result" :rows="3" placeholder="请输入处置结果" />
        </FormItem>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="关联预案ID">
              <Input v-model:value="eventForm.related_plan_id" placeholder="请输入关联预案ID" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="关联演练ID">
              <Input v-model:value="eventForm.related_drill_id" placeholder="请输入关联演练ID" />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="备注">
          <Textarea v-model:value="eventForm.remark" :rows="2" placeholder="请输入备注" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  Card, Table, Button, Space, Input, Select, Form, FormItem, Modal, DatePicker,
  Textarea, Row, Col, Statistic, Tag, Popconfirm, SelectOption,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import dayjs from 'dayjs';
import request from '#/api/request';
import { useSearchForm, useDataTable } from '#/composables/hse';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';

const API_BASE = '/emergency/events';

const formLoading = ref(false);
const stats = ref<any>({ total: 0, handling: 0, closed: 0, avgDuration: 0 });

const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const eventForm = reactive<any>({});

const search = useSearchForm<{ keyword: string; event_level: string; status: string }>({
  defaults: { keyword: '', event_level: '', status: '' },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    const r: any = await request.get('/emergency/events/list', { params: { ...search.form, page, pageSize } });
    return { list: r?.list || [], total: r?.total || 0 };
  },
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));

const tableColumns = [
  { title: '事件标题', dataIndex: 'title', key: 'title', width: 220 },
  { title: '事件等级', dataIndex: 'event_level', key: 'event_level', width: 100 },
  { title: '发生时间', dataIndex: 'happen_time', key: 'happen_time', width: 160 },
  { title: '地点', dataIndex: 'location', key: 'location', width: 160 },
  { title: '报告人', dataIndex: 'reporter', key: 'reporter', width: 100 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
];

function getLevelColor(level: string) {
  const map: Record<string, string> = {
    '一级': 'red',
    '二级': 'red',
    '三级': 'gold',
    '四级': 'blue',
  };
  return map[level] || 'default';
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    '已接报': 'blue',
    '响应中': 'gold',
    '处置中': 'orange',
    '已结案': 'green',
  };
  return map[status] || 'default';
}

async function fetchStats() {
  try {
    const r = await request.get(`${API_BASE}/stats`);
    stats.value = r || {};
  } catch (e) { /* ignore */ }
}

function handleCreate() {
  editingRecord.value = null;
  Object.keys(eventForm).forEach(k => delete eventForm[k]);
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(eventForm, record);
  if (record.happen_time) eventForm.happen_time = dayjs(record.happen_time);
  formModalVisible.value = true;
}

async function handleSave() {
  formLoading.value = true;
  try {
    const payload = { ...eventForm };
    if (payload.happen_time) payload.happen_time = dayjs(payload.happen_time).format('YYYY-MM-DD HH:mm:ss');

    if (editingRecord.value) {
      await request.put(`${API_BASE}/${editingRecord.value.id}`, payload);
    } else {
      await request.post(API_BASE, payload);
    }
    message.success(editingRecord.value ? '编辑成功' : '新增成功');
    formModalVisible.value = false;
    table.fetchData();
  } finally { formLoading.value = false; }
}

async function handleDelete(record: any) {
  try {
    await request.delete(`${API_BASE}/${record.id}`);
    message.success('删除成功');
    table.fetchData();
  } catch (e) { message.error('删除失败'); }
}

async function handleExport() {
  try {
    const blob = (await request.get('/emergency/events/export', { responseType: 'blob' })) as any;
    downloadBlob(blob, '应急事件列表.csv');
    message.success('导出成功');
  } catch (e) {
    message.error('导出失败');
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

onMounted(() => {
  table.fetchData();
});
</script>

<style lang="less" scoped>
.hse-page {
  padding: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-form {
  margin-bottom: 16px;
}
.stat-row {
  margin-bottom: 16px;
}
</style>
