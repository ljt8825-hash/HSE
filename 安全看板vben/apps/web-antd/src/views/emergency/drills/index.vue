<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>应急演练管理</span>
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
              新增演练
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="search.form.keyword"
            placeholder="演练名称/地点"
            allow-clear
            style="width: 220px"
            @change="table.handleReset"
          />
        </FormItem>
        <FormItem label="演练类型">
          <Select v-model:value="search.form.drillType" placeholder="全部" allow-clear style="width: 160px" @change="table.handleReset">
            <SelectOption value="桌面演练">桌面演练</SelectOption>
            <SelectOption value="功能演练">功能演练</SelectOption>
            <SelectOption value="实战演练">实战演练</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="结果">
          <Select v-model:value="search.form.result" placeholder="全部" allow-clear style="width: 140px" @change="table.handleReset">
            <SelectOption value="优秀">优秀</SelectOption>
            <SelectOption value="良好">良好</SelectOption>
            <SelectOption value="合格">合格</SelectOption>
            <SelectOption value="不合格">不合格</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="关联预案">
          <Select
            v-model:value="search.form.plan_id"
            placeholder="全部"
            allow-clear
            show-search
            style="width: 200px"
            @change="table.handleReset"
          >
            <SelectOption v-for="p in planOptions" :key="p.id" :value="p.id">
              {{ p.name }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="search.reset">重置</Button>
        </FormItem>
      </Form>

      <Row :gutter="16" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="本年演练次数" :value="stats.yearCount" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="完成率" :value="stats.passRate" suffix="%" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="参与人次" :value="stats.participantsTotal" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="不合格次数" :value="stats.failed" />
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
          <template v-if="column.key === 'drill_type'">
            <Tag :color="getDrillTypeColor(record.drill_type)">{{ record.drill_type || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'result'">
            <Badge :status="getResultBadgeStatus(record.result)" :text="record.result || '-'" />
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
      :title="editingRecord ? '编辑应急演练' : '新增应急演练'"
      width="720px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="关联预案">
              <Select
                v-model:value="drillForm.plan_id"
                placeholder="请选择关联预案"
                show-search
                style="width: 100%"
                @change="(handlePlanSelect as any)"
              >
                <SelectOption v-for="p in planOptions" :key="p.id" :value="p.id">
                  {{ p.name }}
                </SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="演练名称" required>
              <Input v-model:value="drillForm.name" placeholder="请输入演练名称" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="演练类型" required>
              <Select v-model:value="drillForm.drill_type" placeholder="请选择演练类型">
                <SelectOption value="桌面演练">桌面演练</SelectOption>
                <SelectOption value="功能演练">功能演练</SelectOption>
                <SelectOption value="实战演练">实战演练</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="演练日期">
              <DatePicker v-model:value="drillForm.drill_date" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="演练地点">
              <Input v-model:value="drillForm.location" placeholder="请输入演练地点" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="参与人数">
              <InputNumber v-model:value="drillForm.participants" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="时长(分钟)">
              <InputNumber v-model:value="drillForm.duration" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="演练结果">
              <Select v-model:value="drillForm.result" placeholder="请选择演练结果">
                <SelectOption value="优秀">优秀</SelectOption>
                <SelectOption value="良好">良好</SelectOption>
                <SelectOption value="合格">合格</SelectOption>
                <SelectOption value="不合格">不合格</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="演练状态">
              <Select v-model:value="drillForm.status" placeholder="请选择演练状态">
                <SelectOption value="计划中">计划中</SelectOption>
                <SelectOption value="进行中">进行中</SelectOption>
                <SelectOption value="已完成">已完成</SelectOption>
                <SelectOption value="已取消">已取消</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="组织单位">
              <Input v-model:value="drillForm.organizer" placeholder="请输入组织单位" />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="备注">
          <Textarea v-model:value="drillForm.remark" :rows="3" placeholder="请输入备注" />
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
import { useSearchForm, useDataTable } from '#/composables/hse';

const formLoading = ref(false);
const planOptions = ref<any[]>([]);
const stats = ref<any>({ yearCount: 0, passRate: 0, participantsTotal: 0, failed: 0 });

const formModalVisible = ref(false);
const editingRecord = ref<any>(null);
const drillForm = reactive<any>({});

const search = useSearchForm<{ keyword: string; drillType: string; result: string; plan_id: string }>({
  defaults: { keyword: '', drillType: '', result: '', plan_id: '' },
  onSearch: () => table.handleReset(),
});

const table = reactive(useDataTable<any>({
  fetchFn: async ({ page, pageSize }) => {
    await fetchStats();
    const r: any = await request.get('/emergency/drills', { params: { ...search.form, page, pageSize } });
    return { list: r?.list || [], total: r?.total || 0 };
  },
  defaultPageSize: 20,
  paginationExtra: { showSizeChanger: true, showQuickJumper: true, showTotal: (t: number) => `共 ${t} 条记录` },
}));

const tableColumns = [
  { title: '编号', dataIndex: 'no', key: 'no', width: 120 },
  { title: '演练名称', dataIndex: 'name', key: 'name', width: 180 },
  { title: '乡镇', dataIndex: 'township', key: 'township', width: 100 },
  { title: '演练级别', dataIndex: 'drillLevel', key: 'drillLevel', width: 100 },
  { title: '演练类型', dataIndex: 'drillType', key: 'drillType', width: 100 },
  { title: '演练日期', dataIndex: 'drillDate', key: 'drillDate', width: 120 },
  { title: '地点', dataIndex: 'location', key: 'location', width: 120 },
  { title: '组织单位', dataIndex: 'organizer', key: 'organizer', width: 120 },
  { title: '参演人数', dataIndex: 'participants', key: 'participants', width: 90 },
  { title: '时长(分钟)', dataIndex: 'duration', key: 'duration', width: 90 },
  { title: '结果', dataIndex: 'result', key: 'result', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' },
];

function getDrillTypeColor(type: string) {
  const map: Record<string, string> = { '桌面演练': 'blue', '功能演练': 'cyan', '实战演练': 'purple' };
  return map[type] || 'default';
}

function getResultBadgeStatus(s: string) {
  const map: Record<string, any> = { '优秀': 'success', '良好': 'success', '合格': 'info', '不合格': 'error' };
  return map[s] || 'default';
}

async function fetchPlans() {
  try {
    const r = await request.get('/emergency/plans', { params: { page: 1, pageSize: 999 } });
    planOptions.value = r.list || [];
  } catch (e) { /* ignore */ }
}

async function fetchStats() {
  try {
    const r = await request.get('/emergency/drills/stats');
    stats.value = r || {};
  } catch (e) { /* ignore */ }
}

function handlePlanSelect(val: string) {
  const plan = planOptions.value.find((p) => p.id === val);
  if (plan) drillForm.plan_title = plan.name;
}

function handleCreate() {
  editingRecord.value = null;
  Object.keys(drillForm).forEach(k => delete drillForm[k]);
  drillForm.status = '已完成';
  formModalVisible.value = true;
}

function handleView(record: any) {
  editingRecord.value = record;
  Object.assign(drillForm, record);
  if (record.drill_date) drillForm.drill_date = dayjs(record.drill_date);
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(drillForm, record);
  if (record.drill_date) drillForm.drill_date = dayjs(record.drill_date);
  formModalVisible.value = true;
}

async function handleSave() {
  formLoading.value = true;
  try {
    const payload = { ...drillForm };
    if (payload.drill_date) payload.drill_date = dayjs(payload.drill_date).format('YYYY-MM-DD');

    if (editingRecord.value) {
      await request.put(`/emergency/drills/${editingRecord.value.id}`, payload);
    } else {
      await request.post('/emergency/drills', payload);
    }
    message.success(editingRecord.value ? '编辑成功' : '新增成功');
    formModalVisible.value = false;
    table.fetchData();
    fetchStats();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  } finally { formLoading.value = false; }
}

async function handleDelete(record: any) {
  try {
    await request.delete(`/emergency/drills/${record.id}`);
    message.success('删除成功');
    table.fetchData();
    fetchStats();
  } catch (e: any) { message.error(e?.message || '删除失败'); }
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
    const blob = (await request.get('/emergency/drills/export', { responseType: 'blob' })) as any;
    downloadBlob(blob, '应急演练列表.csv');
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

onMounted(() => {
  fetchPlans();
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
