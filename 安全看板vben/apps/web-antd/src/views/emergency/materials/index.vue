<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>应急物资管理</span>
          <Space>
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增物资
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="search.form.keyword"
            placeholder="物资名称/规格/存放位置"
            allow-clear
            style="width: 220px"
            @change="table.handleReset"
          />
        </FormItem>
        <FormItem label="类别">
          <Select v-model:value="search.form.category" placeholder="全部" allow-clear style="width: 160px" @change="table.handleReset">
            <SelectOption value="救援装备">救援装备</SelectOption>
            <SelectOption value="个人防护">个人防护</SelectOption>
            <SelectOption value="医疗急救">医疗急救</SelectOption>
            <SelectOption value="消防器材">消防器材</SelectOption>
            <SelectOption value="通讯设备">通讯设备</SelectOption>
            <SelectOption value="应急照明">应急照明</SelectOption>
            <SelectOption value="其他物资">其他物资</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select v-model:value="search.form.status" placeholder="全部" allow-clear style="width: 140px" @change="table.handleReset">
            <SelectOption value="normal">正常</SelectOption>
            <SelectOption value="expiring">临期</SelectOption>
            <SelectOption value="expired">过期</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="search.reset">重置</Button>
        </FormItem>
      </Form>

      <Row :gutter="16" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="物资总数" :value="stats.total" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="正常" :value="(stats.total || 0) - (stats.expiring || 0) - (stats.expired || 0)" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="临期(30天内)" :value="stats.expiring" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="已过期" :value="stats.expired" />
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
          <template v-if="column.key === 'category'">
            <Tag :color="getCategoryColor(record.category)">{{ record.category || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Badge
              :status="getStatusBadgeStatus(record.status)"
              :text="getStatusBadgeText(record.status)"
            />
          </template>
          <template v-else-if="column.key === 'expire_date'">
            <span :class="{ 'expiring-soon': record.status === 'expiring' || record.status === 'expired' }">
              {{ record.expire_date || '-' }}
            </span>
          </template>
          <template v-else-if="column.key === 'responsible_person'">
            <EmployeeName v-if="record.responsiblePersonId" :employee-id="record.responsiblePersonId" />
            <span v-else>{{ record.responsible_person || '-' }}</span>
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
      :title="editingRecord ? '编辑应急物资' : '新增应急物资'"
      width="720px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="物资名称" required>
              <Input v-model:value="materialForm.name" placeholder="请输入物资名称" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="类别" required>
              <Select v-model:value="materialForm.category" placeholder="请选择类别" style="width: 100%">
                <SelectOption value="救援装备">救援装备</SelectOption>
                <SelectOption value="个人防护">个人防护</SelectOption>
                <SelectOption value="医疗急救">医疗急救</SelectOption>
                <SelectOption value="消防器材">消防器材</SelectOption>
                <SelectOption value="通讯设备">通讯设备</SelectOption>
                <SelectOption value="应急照明">应急照明</SelectOption>
                <SelectOption value="其他物资">其他物资</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="规格型号">
              <Input v-model:value="materialForm.spec" placeholder="请输入规格型号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="数量">
              <InputNumber v-model:value="materialForm.quantity" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="存放位置">
              <Input v-model:value="materialForm.location" placeholder="请输入存放位置" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="责任人">
              <EmployeeSelector v-model:value="materialForm.responsiblePersonId" mode="single" placeholder="选择责任人" @change="onResponsiblePersonChange" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="到期日期">
              <DatePicker v-model:value="materialForm.expire_date" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="备注">
          <Textarea v-model:value="materialForm.remark" :rows="3" placeholder="请输入备注" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  Card, Table, Button, Space, Input, Select, Form, FormItem, Modal, DatePicker,
  InputNumber, Textarea, Row, Col, Statistic, Tag, Badge, Popconfirm, SelectOption,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import dayjs from 'dayjs';
import request from '#/api/request';
import { useSearchForm, useDataTable, EmployeeName } from '#/composables/hse';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { getEmployeeSelectorList } from '#/api/hse/employee-selector';

const API_BASE = '/emergency/materials';

const formLoading = ref(false);
const stats = ref<any>({ total: 0, expiring: 0, expired: 0 });

const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const materialForm = reactive<any>({ responsiblePersonId: null, responsible_person: '' });

const employeeList = ref<any[]>([]);

async function fetchEmployees() {
  try {
    const res = await getEmployeeSelectorList({ limit: 999 });
    employeeList.value = res || [];
  } catch (e) { /* ignore */ }
}

const search = useSearchForm<{ keyword: string; category: string; status: string }>({
  defaults: { keyword: '', category: '', status: '' },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    const r: any = await request.get('/emergency/materials/list', { params: { ...search.form, page, pageSize } });
    return { list: r?.list || [], total: r?.total || 0 };
  },
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));

const tableColumns = [
  { title: '物资名称', dataIndex: 'name', key: 'name', width: 180 },
  { title: '类别', dataIndex: 'category', key: 'category', width: 120 },
  { title: '规格型号', dataIndex: 'spec', key: 'spec', width: 140 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80 },
  { title: '存放位置', dataIndex: 'location', key: 'location', width: 160 },
  { title: '责任人', dataIndex: 'responsible_person', key: 'responsible_person', width: 100 },
  { title: '到期日期', dataIndex: 'expire_date', key: 'expire_date', width: 120 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
];

function getCategoryColor(category: string) {
  const map: Record<string, string> = {
    '救援装备': 'red',
    '个人防护': 'blue',
    '医疗急救': 'green',
    '消防器材': 'orange',
    '通讯设备': 'purple',
    '应急照明': 'gold',
    '其他物资': 'default',
  };
  return map[category] || 'default';
}

function getStatusBadgeStatus(s: string) {
  const map: Record<string, any> = { normal: 'success', expiring: 'warning', expired: 'error' };
  return map[s] || 'default';
}

function getStatusBadgeText(s: string) {
  const map: Record<string, string> = { normal: '正常', expiring: '临期', expired: '过期' };
  return map[s] || s;
}

async function fetchStats() {
  try {
    const r = await request.get(`${API_BASE}/stats`);
    stats.value = r || {};
  } catch (e) { /* ignore */ }
}

function handleCreate() {
  editingRecord.value = null;
  Object.keys(materialForm).forEach(k => delete materialForm[k]);
  materialForm.responsiblePersonId = null;
  materialForm.responsible_person = '';
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(materialForm, record);
  if (record.expire_date) materialForm.expire_date = dayjs(record.expire_date);
  materialForm.responsiblePersonId = record.responsiblePersonId || null;
  formModalVisible.value = true;
}

function onResponsiblePersonChange(item: any) {
  // R5: 责任人改用 EmployeeSelector，选中后同步姓名到兼容字段 responsible_person
  materialForm.responsible_person = item?.name ?? '';
}

async function handleSave() {
  formLoading.value = true;
  try {
    const payload = { ...materialForm };
    if (payload.expire_date) payload.expire_date = dayjs(payload.expire_date).format('YYYY-MM-DD');

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
    const blob = (await request.get('/emergency/materials/export', { responseType: 'blob' })) as any;
    downloadBlob(blob, '应急物资列表.csv');
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
  fetchEmployees();
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
.expiring-soon {
  color: #faad14;
  font-weight: 500;
}
</style>
