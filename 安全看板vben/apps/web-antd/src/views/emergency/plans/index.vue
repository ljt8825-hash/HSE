<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>应急预案管理</span>
          <Space>
            <Button @click="handleImport">
              <template #icon><IconifyIcon icon="lucide:upload" /></template>
              导入
            </Button>
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增预案
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="search.form.keyword"
            placeholder="预案名称/负责人"
            allow-clear
            style="width: 220px"
            @change="table.handleReset"
          />
        </FormItem>
        <FormItem label="类型">
          <Select v-model:value="search.form.type" placeholder="全部" allow-clear style="width: 160px" @change="table.handleReset">
            <SelectOption value="comprehensive">综合预案</SelectOption>
            <SelectOption value="special">专项预案</SelectOption>
            <SelectOption value="site">现场处置方案</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select v-model:value="search.form.status" placeholder="全部" allow-clear style="width: 140px" @change="table.handleReset">
            <SelectOption value="active">生效中</SelectOption>
            <SelectOption value="published">已发布</SelectOption>
            <SelectOption value="pending">待审核</SelectOption>
            <SelectOption value="review">复审中</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="search.reset">重置</Button>
        </FormItem>
      </Form>

      <Row :gutter="16" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="预案总数" :value="stats.total" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="已发布" :value="stats.published" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="待复审" :value="stats.pendingReview" />
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
          <template v-if="column.key === 'type'">
            <Tag :color="getTypeColor(record.type)">{{ record.type || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Badge :status="getStatusBadgeStatus(record.status)" :text="record.status || '-'" />
          </template>
          <template v-else-if="column.key === 'responsible_person'">
            <EmployeeName v-if="record.responsiblePersonId" :employee-id="record.responsiblePersonId" />
            <span v-else>{{ record.responsible_person || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge :status="getExpiryBadgeStatus(record.expiryStatus)" :text="getExpiryText(record.expiryStatus)" />
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleView(record)">查看</Button>
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
      :title="editingRecord ? '编辑应急预案' : '新增应急预案'"
      width="720px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="预案名称" required>
              <Input v-model:value="planForm.name" placeholder="请输入预案名称" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="预案类型" required>
              <Select v-model:value="planForm.type" placeholder="请选择预案类型">
                <SelectOption value="comprehensive">综合预案</SelectOption>
                <SelectOption value="special">专项预案</SelectOption>
                <SelectOption value="site">现场处置方案</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="级别">
              <Select v-model:value="planForm.level" placeholder="请选择级别">
                <SelectOption value="一级">一级</SelectOption>
                <SelectOption value="二级">二级</SelectOption>
                <SelectOption value="三级">三级</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="负责部门">
              <Input v-model:value="planForm.responsible_dept" placeholder="请输入负责部门" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="负责人">
              <EmployeeSelector v-model:value="planForm.responsiblePersonId" placeholder="选择负责人" @change="onResponsiblePersonChange" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="联系电话">
              <Input v-model:value="planForm.contact_phone" placeholder="请输入联系电话" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="状态">
              <Select v-model:value="planForm.status" placeholder="请选择状态">
                <SelectOption value="active">生效中</SelectOption>
                <SelectOption value="published">已发布</SelectOption>
                <SelectOption value="pending">待审核</SelectOption>
                <SelectOption value="review">复审中</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="生效日期">
              <DatePicker v-model:value="planForm.effective_date" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="到期日期">
              <DatePicker v-model:value="planForm.expiry_date" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="预案描述">
          <Textarea v-model:value="planForm.description" :rows="2" placeholder="请输入预案描述" />
        </FormItem>
        <FormItem label="预案内容">
          <Textarea v-model:value="planForm.plan_content" :rows="4" placeholder="请输入预案详细内容" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  Card, Table, Button, Space, Input, Select, Form, FormItem, Modal, DatePicker,
  Textarea, Row, Col, Statistic, Tag, Badge, Popconfirm, SelectOption,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import dayjs from 'dayjs';
import request from '#/api/request';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { EmployeeName, useSearchForm, useDataTable } from '#/composables/hse';

const formLoading = ref(false);
const stats = ref<any>({ total: 0, published: 0, pendingReview: 0 });

const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const planForm = reactive<any>({});

const search = useSearchForm<{ keyword: string; type: string; status: string }>({
  defaults: { keyword: '', type: '', status: '' },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    const r: any = await request.get('/emergency/plans', { params: { ...search.form, page, pageSize } });
    return { list: r?.list || [], total: r?.total || 0 };
  },
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));

const tableColumns = [
  { title: '预案名称', dataIndex: 'name', key: 'name', width: 200, sorter: true },
  { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '负责部门', dataIndex: 'responsible_dept', key: 'responsible_dept', width: 140 },
  { title: '负责人', dataIndex: 'responsible_person', key: 'responsible_person', width: 100 },
  { title: '生效日期', dataIndex: 'effective_date', key: 'effective_date', width: 120, sorter: true },
  { title: '到期日期', dataIndex: 'expiry_date', key: 'expiry_date', width: 120, sorter: true },
  { title: '时效状态', dataIndex: 'expiryStatus', key: 'expiryStatus', width: 110 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
];

function getTypeColor(type: string) {
  const map: Record<string, string> = { comprehensive: 'blue', special: 'cyan', site: 'purple' };
  return map[type] || 'default';
}

function getStatusBadgeStatus(s: string) {
  const map: Record<string, any> = { active: 'success', published: 'success', pending: 'warning', review: 'info' };
  return map[s] || 'default';
}

function getExpiryBadgeStatus(s: string) {
  const map: Record<string, any> = { valid: 'success', expiring: 'warning', expired: 'error', permanent: 'default', unknown: 'default' };
  return map[s] || 'default';
}

function getExpiryText(s: string) {
  const map: Record<string, string> = { valid: '正常', expiring: '临期', expired: '已过期', permanent: '长期有效', unknown: '未知' };
  return map[s] || '未知';
}

async function fetchStats() {
  try {
    const r = await request.get('/emergency/plans/stats');
    stats.value = r || {};
  } catch (e) { /* ignore */ }
}

function handleCreate() {
  editingRecord.value = null;
  Object.keys(planForm).forEach(k => delete planForm[k]);
  planForm.status = 'pending';
  formModalVisible.value = true;
}

function handleView(record: any) {
  editingRecord.value = record;
  Object.assign(planForm, record);
  if (record.effective_date) planForm.effective_date = dayjs(record.effective_date);
  if (record.expiry_date) planForm.expiry_date = dayjs(record.expiry_date);
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(planForm, record);
  if (record.effective_date) planForm.effective_date = dayjs(record.effective_date);
  if (record.expiry_date) planForm.expiry_date = dayjs(record.expiry_date);
  formModalVisible.value = true;
}

async function handleSave() {
  formLoading.value = true;
  try {
    const payload = { ...planForm };
    if (payload.effective_date) payload.effective_date = dayjs(payload.effective_date).format('YYYY-MM-DD');
    if (payload.expiry_date) payload.expiry_date = dayjs(payload.expiry_date).format('YYYY-MM-DD');

    if (editingRecord.value) {
      await request.put(`/emergency/plans/${editingRecord.value.id}`, payload);
    } else {
      await request.post('/emergency/plans', payload);
    }
    message.success(editingRecord.value ? '编辑成功' : '新增成功');
    formModalVisible.value = false;
    table.fetchData();
    fetchStats();
  } finally { formLoading.value = false; }
}

async function handleDelete(record: any) {
  try {
    await request.delete(`/emergency/plans/${record.id}`);
    message.success('删除成功');
    table.fetchData();
    fetchStats();
  } catch (e) { message.error('删除失败'); }
}

function handleImport() {
  message.info('导入功能开发中');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

async function handleExport() {
  try {
    const blob = (await request.get('/emergency/plans/export', { responseType: 'blob' })) as any;
    downloadBlob(blob, '应急预案列表.csv');
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

function onResponsiblePersonChange(item: any) {
  planForm.responsible_person = item?.name ?? '';
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
