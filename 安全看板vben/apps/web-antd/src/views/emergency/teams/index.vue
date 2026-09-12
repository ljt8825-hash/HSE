<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>应急队伍管理</span>
          <Space>
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增队伍
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="search.form.keyword"
            placeholder="队伍名称/队长/部门"
            allow-clear
            style="width: 220px"
            @change="table.handleReset"
          />
        </FormItem>
        <FormItem label="队伍类型">
          <Select v-model:value="search.form.type" placeholder="全部" allow-clear style="width: 160px" @change="table.handleReset">
            <SelectOption value="专职应急队">专职应急队</SelectOption>
            <SelectOption value="兼职应急队">兼职应急队</SelectOption>
            <SelectOption value="志愿消防队">志愿消防队</SelectOption>
            <SelectOption value="专家顾问组">专家顾问组</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="所属部门">
          <Input
            v-model:value="search.form.department"
            placeholder="请输入部门"
            allow-clear
            style="width: 160px"
            @change="table.handleReset"
          />
        </FormItem>
        <FormItem>
          <Button @click="search.reset">重置</Button>
        </FormItem>
      </Form>

      <Row :gutter="16" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="队伍总数" :value="stats.total" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="队伍人员数" :value="stats.memberCount" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="专职队数" :value="stats.fullTime" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="兼职队数" :value="stats.partTime" />
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
        :scroll="{ x: 1400 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'leader_name'">
            <EmployeeName v-if="record.leaderId" :employee-id="record.leaderId" />
            <span v-else>{{ record.leader_name || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'type'">
            <Tag :color="getTypeColor(record.type)">{{ record.type || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'member_ids'">
            {{ Array.isArray(record.member_ids) ? record.member_ids.length : 0 }}
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
      :title="editingRecord ? '编辑应急队伍' : '新增应急队伍'"
      width="720px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="队伍名称" required>
              <Input v-model:value="teamForm.name" placeholder="请输入队伍名称" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="队伍类型" required>
              <Select v-model:value="teamForm.type" placeholder="请选择类型" style="width: 100%">
                <SelectOption value="专职应急队">专职应急队</SelectOption>
                <SelectOption value="兼职应急队">兼职应急队</SelectOption>
                <SelectOption value="志愿消防队">志愿消防队</SelectOption>
                <SelectOption value="专家顾问组">专家顾问组</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="所属部门">
              <Input v-model:value="teamForm.department" placeholder="请输入所属部门" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="队长">
              <EmployeeSelector v-model:value="teamForm.leaderId" mode="single" placeholder="选择队长" @change="onLeaderChange" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="联系电话">
              <Input v-model:value="teamForm.contact_phone" placeholder="请输入联系电话" />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="队员">
          <Select
            v-model:value="teamForm.member_ids"
            mode="multiple"
            placeholder="请选择队员（支持多选）"
            style="width: 100%"
            :filter-option="true"
          >
            <SelectOption v-for="emp in employeeList" :key="emp.employee_id" :value="emp.employee_id">
              {{ emp.name }} ({{ emp.org_name }})
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem label="描述">
          <Textarea v-model:value="teamForm.description" :rows="3" placeholder="请输入队伍描述" />
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import {
  Card, Table, Button, Space, Input, Select, Form, FormItem, Modal,
  Textarea, Row, Col, Statistic, Tag, Popconfirm, SelectOption,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import request from '#/api/request';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { getEmployeeSelectorList } from '#/api/hse/employee-selector';
import { useSearchForm, useDataTable, EmployeeName } from '#/composables/hse';

const API_BASE = '/emergency/teams';

const formLoading = ref(false);
const stats = ref<any>({ total: 0, memberCount: 0, fullTime: 0, partTime: 0 });
const employeeList = ref<any[]>([]);

const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const teamForm = reactive<any>({ member_ids: [], leaderId: null, leader_name: '' });

const search = useSearchForm<{ keyword: string; type: string; department: string }>({
  defaults: { keyword: '', type: '', department: '' },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    const r: any = await request.get('/emergency/teams/list', { params: { ...search.form, page, pageSize } });
    return { list: r?.list || [], total: r?.total || 0 };
  },
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));

const tableColumns = [
  { title: '队伍名称', dataIndex: 'name', key: 'name', width: 200 },
  { title: '队伍类型', dataIndex: 'type', key: 'type', width: 140 },
  { title: '所属部门', dataIndex: 'department', key: 'department', width: 140 },
  { title: '队长', dataIndex: 'leader_name', key: 'leader_name', width: 100 },
  { title: '联系电话', dataIndex: 'contact_phone', key: 'contact_phone', width: 140 },
  { title: '队员人数', dataIndex: 'member_ids', key: 'member_ids', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' },
];

function getTypeColor(type: string) {
  const map: Record<string, string> = {
    '专职应急队': 'red',
    '兼职应急队': 'blue',
    '志愿消防队': 'orange',
    '专家顾问组': 'purple',
  };
  return map[type] || 'default';
}

async function fetchStats() {
  try {
    const r = await request.get(`${API_BASE}/stats`);
    stats.value = r || {};
  } catch (e) { /* ignore */ }
}

async function fetchEmployees() {
  try {
    // Q4 修复：原 /system/employees 为非 HSE 主数据独立源（id 空间不可考证），改用主数据选择器 API
    const res = await getEmployeeSelectorList({ limit: 999 });
    employeeList.value = res || [];
  } catch (e) { /* ignore */ }
}

function handleCreate() {
  editingRecord.value = null;
  Object.keys(teamForm).forEach(k => delete teamForm[k]);
  teamForm.member_ids = [];
  teamForm.leaderId = null;
  teamForm.leader_name = '';
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(teamForm, record);
  teamForm.member_ids = record.member_ids || [];
  teamForm.leaderId = record.leaderId || null;
  teamForm.leader_name = record.leader_name || '';
  formModalVisible.value = true;
}

function onLeaderChange(item: any) {
  // Q4 修复：队长改用 EmployeeSelector，选中后同步姓名到兼容字段 leader_name
  teamForm.leader_name = item?.name ?? '';
}

async function handleSave() {
  formLoading.value = true;
  try {
    const payload = { ...teamForm };

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
    const blob = (await request.get('/emergency/teams/export', { responseType: 'blob' })) as any;
    downloadBlob(blob, '应急队伍列表.csv');
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
</style>
