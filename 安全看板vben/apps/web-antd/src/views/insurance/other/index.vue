<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>其他保险管理（公众责任险 / 财产一切险）</span>
          <Space>
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button @click="handleImportPdf">
              <template #icon><IconifyIcon icon="lucide:file-up" /></template>
              导入保单
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增保险
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="保单号 / 保险公司"
            allow-clear
            style="width: 220px"
            @change="fetchData"
          />
        </FormItem>
        <FormItem label="保险类型">
          <Select v-model:value="searchForm.insuranceType" placeholder="全部" allow-clear style="width: 160px" @change="fetchData">
            <SelectOption value="公众责任险">公众责任险</SelectOption>
            <SelectOption value="财产一切险">财产一切险</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select v-model:value="searchForm.expiryStatus" placeholder="全部" allow-clear style="width: 140px" @change="fetchData">
            <SelectOption value="normal">正常</SelectOption>
            <SelectOption value="expiring">临期</SelectOption>
            <SelectOption value="expired">过期</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Row :gutter="16" class="stat-row">
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="保险总数" :value="stats.total" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card :bordered="false" size="small">
            <Statistic title="正常" :value="stats.normal" />
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
        :data-source="dataList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="handleTableChange"
        size="middle"
        :scroll="{ x: 1600 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'insuranceType'">
            <Tag :color="getInsTypeColor(record.insuranceType)">{{ record.insuranceType || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'startDate'">
            {{ record.startDate ? dayjs(record.startDate).format('YYYY-MM-DD') : '-' }}
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="getExpiryBadgeText(record.expiryStatus)"
            />
          </template>
          <template v-else-if="column.key === 'expireDate'">
            <span :class="{ 'expiring-soon': record.expiryStatus === 'expiring' || record.expiryStatus === 'expired' }">
              {{ record.expireDate ? dayjs(record.expireDate).format('YYYY-MM-DD') : '-' }}
            </span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
              <Button v-if="record.pdfFile" type="link" size="small" @click="handleViewFile(record)">查看文档</Button>
              <Popconfirm title="确定要删除吗？" ok-type="danger" @confirm="handleDelete(record)">
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <PdfImportModal
      v-model:visible="pdfImportVisible"
      module-name="其他保险"
      @apply="handlePdfApply"
    />

    <Modal
      v-model:open="formModalVisible"
      :title="editingRecord ? '编辑其他保险' : '新增其他保险'"
      width="720px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保险类型" required>
              <Select v-model:value="otherForm.insuranceType" placeholder="请选择保险类型">
                <SelectOption value="公众责任险">公众责任险</SelectOption>
                <SelectOption value="财产一切险">财产一切险</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保单号">
              <Input v-model:value="otherForm.policyNo" placeholder="请输入保单号" class="policy-no-input" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保险起期">
              <DatePicker v-model:value="otherForm.startDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保险止期">
              <DatePicker v-model:value="otherForm.expireDate" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保额(元)">
              <InputNumber v-model:value="otherForm.coverageAmount" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="保费(元)">
              <InputNumber v-model:value="otherForm.premium" :min="0" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保险公司">
              <Input v-model:value="otherForm.insuranceCompany" placeholder="请输入保险公司" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="联系人">
              <Input v-model:value="otherForm.contactPerson" placeholder="请输入联系人" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="联系电话">
              <Input v-model:value="otherForm.contactPhone" placeholder="请输入联系电话" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="状态">
              <Select v-model:value="otherForm.status" style="width: 100%">
                <SelectOption value="有效">有效</SelectOption>
                <SelectOption value="失效">失效</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <FormItem label="备注">
          <Textarea v-model:value="otherForm.remark" :rows="3" placeholder="请输入备注" />
        </FormItem>
      </Form>
    </Modal>

    <Modal
      v-model:open="viewFileVisible"
      :title="`保单文件预览 - ${viewFileName || ''}`"
      width="80%"
      :footer="null"
      :bodyStyle="{ padding: '0' }"
      @cancel="handleCloseView"
    >
      <div class="file-preview-wrap">
        <div class="file-preview-toolbar">
          <Button size="small" @click="handleOpenFileNewTab">
            <template #icon><IconifyIcon icon="lucide:external-link" /></template>
            新窗口打开
          </Button>
          <span class="file-preview-name">{{ viewFileName }}</span>
        </div>
        <iframe v-if="viewFileUrl" :src="viewFileUrl" class="file-preview-frame"></iframe>
        <div v-else class="file-preview-empty">文件加载中...</div>
      </div>
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
import { getPolicyFile } from '#/api/hse/insurance';
import PdfImportModal from '#/components/hse/PdfImportModal.vue';

const loading = ref(false);
const formLoading = ref(false);
const dataList = ref<any[]>([]);
const total = ref(0);
const stats = ref<any>({ total: 0, normal: 0, expiring: 0, expired: 0 });

const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({ keyword: '', insuranceType: '', expiryStatus: '' });

const formModalVisible = ref(false);
const pdfImportVisible = ref(false);
const editingRecord = ref<any>(null);
const otherForm = reactive<any>({});

const viewFileVisible = ref(false);
const viewFileUrl = ref('');
const viewFileRaw = ref('');
const viewFileName = ref('');
let currentBlobUrl: string | null = null;

const tableColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
  { title: '保险类型', dataIndex: 'insuranceType', key: 'insuranceType', width: 120 },
  { title: '保单号', dataIndex: 'policyNo', key: 'policyNo', width: 180, customCell: () => ({ style: { whiteSpace: 'nowrap' } }) },
  { title: '保额(元)', dataIndex: 'coverageAmount', key: 'coverageAmount', width: 120 },
  { title: '保费(元)', dataIndex: 'premium', key: 'premium', width: 120 },
  { title: '保险起期', dataIndex: 'startDate', key: 'startDate', width: 120 },
  { title: '保险止期', dataIndex: 'expireDate', key: 'expireDate', width: 120 },
  { title: '时效状态', dataIndex: 'expiryStatus', key: 'expiryStatus', width: 100 },
  { title: '保险公司', dataIndex: 'insuranceCompany', key: 'insuranceCompany', width: 140 },
  { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 100 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' },
];

function getInsTypeColor(type: string) {
  const map: Record<string, string> = { '公众责任险': 'blue', '财产一切险': 'purple' };
  return map[type] || 'default';
}

function getExpiryBadgeStatus(s: string) {
  const map: Record<string, any> = { normal: 'success', expiring: 'warning', expired: 'error' };
  return map[s] || 'default';
}

function getExpiryBadgeText(s: string) {
  const map: Record<string, string> = { normal: '正常', expiring: '临期', expired: '过期', unknown: '未知' };
  return map[s] || s;
}

async function fetchData() {
  loading.value = true;
  try {
    const r = await request.get('/insurance/other', { params: { ...searchForm, ...pagination } });
    dataList.value = r.list || [];
    total.value = r.total || 0;
  } catch (e: any) {
    message.error(e?.message || '加载失败');
    dataList.value = [];
    total.value = 0;
  } finally { loading.value = false; }
}

async function fetchStats() {
  try {
    const r = await request.get('/insurance/other/stats');
    stats.value = r.stats || {};
  } catch (e: any) {
    message.error(e?.message || '统计加载失败');
  }
}

function handleTableChange(pg: any) {
  pagination.page = pg.current;
  pagination.pageSize = pg.pageSize;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.insuranceType = '';
  searchForm.expiryStatus = '';
  fetchData();
}

function handleCreate() {
  editingRecord.value = null;
  Object.keys(otherForm).forEach(k => delete otherForm[k]);
  otherForm.status = '有效';
  formModalVisible.value = true;
}

function handleImportPdf() {
  pdfImportVisible.value = true;
}

function handlePdfApply(data: { policyNo: string; insuranceCompany: string; startDate: string | null; expireDate: string | null; fileName: string }) {
  editingRecord.value = null;
  Object.keys(otherForm).forEach(k => delete otherForm[k]);
  otherForm.status = '有效';
  otherForm.policyNo = data.policyNo || '';
  otherForm.insuranceCompany = data.insuranceCompany || '';
  otherForm.startDate = data.startDate ? dayjs(data.startDate) : null;
  otherForm.expireDate = data.expireDate ? dayjs(data.expireDate) : null;
  otherForm.pdfFile = data.fileName || '';
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(otherForm, record);
  if (record.startDate) otherForm.startDate = dayjs(record.startDate);
  if (record.expireDate) otherForm.expireDate = dayjs(record.expireDate);
  otherForm.pdfFile = record.pdfFile || '';
  formModalVisible.value = true;
}

async function handleSave() {
  formLoading.value = true;
  try {
    const payload = { ...otherForm };
    if (payload.startDate) payload.startDate = dayjs(payload.startDate).format('YYYY-MM-DD');
    if (payload.expireDate) payload.expireDate = dayjs(payload.expireDate).format('YYYY-MM-DD');

    if (editingRecord.value) {
      await request.put(`/insurance/other/${editingRecord.value.id}`, payload);
    } else {
      await request.post('/insurance/other', payload);
    }
    message.success(editingRecord.value ? '编辑成功' : '新增成功');
    formModalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (e: any) {
    message.error(e?.message || '操作失败');
  } finally { formLoading.value = false; }
}

async function handleDelete(record: any) {
  try {
    await request.delete(`/insurance/other/${record.id}`);
    message.success('删除成功');
    fetchData();
    fetchStats();
  } catch (e: any) {
    message.error(e?.message || '删除失败');
  }
}

function handleExport() {
  message.info('导出功能开发中');
}

function handleViewFile(record: any) {
  if (!record.id) return;
  viewFileName.value = record.policyNo || record.insuranceType || '保单文件';
  viewFileRaw.value = record.pdfFile ? `/uploads/insurance/${record.pdfFile}` : '';
  viewFileVisible.value = true;
  viewFileUrl.value = '';
  // 受保护文件接口（记录 ID 定位，Bearer Token）获取 Blob，再以 blob: URL 渲染
  (async () => {
    try {
      const blob = await getPolicyFile('other', record.id);
      if (!(blob instanceof Blob)) {
        throw new Error('服务器未返回有效的文件数据');
      }
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = URL.createObjectURL(blob);
      viewFileUrl.value = currentBlobUrl;
    } catch (e: any) {
      message.error(e?.message || '文件加载失败');
    }
  })();
}

function handleOpenFileNewTab() {
  if (viewFileUrl.value) window.open(viewFileUrl.value, '_blank');
}

function handleCloseView() {
  viewFileVisible.value = false;
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  viewFileUrl.value = '';
}

onMounted(() => {
  fetchData();
  fetchStats();
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
.policy-no-input input {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-preview-wrap {
  display: flex;
  flex-direction: column;
  height: 80vh;
}
.file-preview-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.file-preview-name {
  font-size: 13px;
  color: hsl(var(--foreground) / 0.7);
}
.file-preview-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: hsl(var(--muted));
}
.file-preview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground));
}
</style>
