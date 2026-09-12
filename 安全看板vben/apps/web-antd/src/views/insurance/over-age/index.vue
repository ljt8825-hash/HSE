<template>
  <Page auto-content-height class="hse-page">
    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>超龄人员管理</span>
          <Space>
            <ImportButtonGroup module="over-age" module-name="超龄人员" @refresh="fetchData" />
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增人员
            </Button>
          </Space>
        </div>
      </template>

      <Row :gutter="16" class="stats-row">
        <Col :span="6">
          <Card class="stat-card">
            <Statistic title="超龄人员总数" :value="statsData.total" :value-style="{ color: '#f5222d' }" />
          </Card>
        </Col>
        <Col :span="6">
          <Card class="stat-card">
            <Statistic title="男性超龄" :value="statsData.byGender['男'] || 0" :value-style="{ color: '#1890ff' }" />
          </Card>
        </Col>
        <Col :span="6">
          <Card class="stat-card">
            <Statistic title="女性超龄" :value="statsData.byGender['女'] || 0" :value-style="{ color: '#eb2f96' }" />
          </Card>
        </Col>
        <Col :span="6">
          <Card class="stat-card">
            <Statistic title="70岁以上" :value="statsData.byAgeGroup['70岁以上'] || 0" :value-style="{ color: '#fa8c16' }" />
          </Card>
        </Col>
      </Row>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="姓名/工号"
            allow-clear
            style="width: 220px"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="性别">
          <Select v-model:value="searchForm.gender" allow-clear placeholder="全部" style="width: 120px" @change="handleSearch">
            <SelectOption value="男">男</SelectOption>
            <SelectOption value="女">女</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Alert
        message="自动识别规则"
        description="系统根据员工出生日期自动计算年龄：男性超过60岁、女性超过55岁自动识别为超龄人员。数据来源于员工档案，无需手动录入。"
        type="info"
        show-icon
        class="rule-alert"
      />

      <Table
        :columns="tableColumns"
        :data-source="overAgeList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 1600 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'age'">
            <Tag :color="getAgeTagColor(record.age)">
              {{ record.age }} 岁
            </Tag>
          </template>
          <template v-else-if="column.key === 'over_age_years'">
            <Tag color="red">
              超龄 {{ record.over_age_years }} 年
            </Tag>
          </template>
          <template v-else-if="column.key === 'birth_date'">
            {{ formatDate(record.birth_date) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleViewDetail(record)">查看</Button>
              <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="formModalVisible"
      :title="editingRecord ? '编辑超龄人员信息' : '新增超龄人员'"
      width="720px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="姓名" required>
              <Input v-model:value="formData.name" placeholder="请输入姓名" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="性别">
              <Select v-model:value="formData.gender">
                <SelectOption value="男">男</SelectOption>
                <SelectOption value="女">女</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="出生日期">
              <DatePicker v-model:value="formData.birth_date" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="身份证号">
              <Input v-model:value="formData.id_card" placeholder="请输入身份证号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="联系方式">
              <Input v-model:value="formData.phone" placeholder="请输入联系电话" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="部门">
              <Input v-model:value="formData.dept" placeholder="请输入部门" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="岗位">
              <Input v-model:value="formData.position" placeholder="请输入岗位" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="超龄人员详情" width="720px">
      <template v-if="currentDetail">
        <Tabs v-model:activeKey="detailActiveTab">
          <Tabs.TabPane key="info" tab="基本信息">
            <Alert
              :message="`年龄阈值：${currentDetail.gender === '女' ? '女性 55岁' : '男性 60岁'}`"
              :description="`当前年龄 ${currentDetail.age} 岁，已超龄 ${currentDetail.over_age_years || currentDetail.overAgeYears || 0} 年`"
              type="warning"
              show-icon
              class="detail-alert"
            />
            <Descriptions :column="2" bordered size="small" class="detail-desc">
              <DescriptionsItem label="姓名">{{ currentDetail.name }}</DescriptionsItem>
              <DescriptionsItem label="性别">{{ currentDetail.gender || '-' }}</DescriptionsItem>
              <DescriptionsItem label="身份证号">{{ currentDetail.id_card || '-' }}</DescriptionsItem>
              <DescriptionsItem label="工号">{{ currentDetail.employee_code || '-' }}</DescriptionsItem>
              <DescriptionsItem label="出生日期">{{ formatDate(currentDetail.birth_date) }}</DescriptionsItem>
              <DescriptionsItem label="年龄">
                <Tag color="red">{{ currentDetail.age }} 岁</Tag>
              </DescriptionsItem>
              <DescriptionsItem label="年龄阈值">{{ currentDetail.age_threshold || (currentDetail.gender === '女' ? 55 : 60) }} 岁</DescriptionsItem>
              <DescriptionsItem label="超龄年数">
                <Tag color="orange">{{ currentDetail.over_age_years || currentDetail.overAgeYears || 0 }} 年</Tag>
              </DescriptionsItem>
              <DescriptionsItem label="部门">{{ currentDetail.dept_name || currentDetail.dept || '-' }}</DescriptionsItem>
              <DescriptionsItem label="岗位">{{ currentDetail.position_name || currentDetail.position || '-' }}</DescriptionsItem>
              <DescriptionsItem label="联系方式">{{ currentDetail.phone || '-' }}</DescriptionsItem>
              <DescriptionsItem label="人员类型">{{ currentDetail.person_type || '-' }}</DescriptionsItem>
              <DescriptionsItem label="人员分类">{{ currentDetail.person_category || '-' }}</DescriptionsItem>
              <DescriptionsItem label="是否公益岗">{{ currentDetail.is_public_welfare ? '是' : '否' }}</DescriptionsItem>
            </Descriptions>
          </Tabs.TabPane>

          <Tabs.TabPane key="attachments" tab="附件列表">
            <div class="attachment-upload">
              <Upload
                :show-upload-list="false"
                :before-upload="(file: File) => handleBeforeUploadAttachment(file)"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              >
                <Button type="primary" size="small">
                  <template #icon><IconifyIcon icon="lucide:upload" /></template>
                  上传附件
                </Button>
              </Upload>
              <span class="upload-tip">支持 PDF/Word/Excel/图片，单文件不超过 10MB</span>
            </div>
            <Table
              :columns="attachmentColumns"
              :data-source="attachmentList"
              :loading="attachmentLoading"
              size="small"
              :pagination="false"
              row-key="id"
              class="mt-4"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'originalName'">
                  <a @click="handleDownloadAttachment(record as any)" class="link-text">
                    {{ record.originalName }}
                  </a>
                </template>
                <template v-else-if="column.key === 'fileSize'">
                  {{ formatFileSize(record.fileSize) }}
                </template>
                <template v-else-if="column.key === 'version'">
                  <Tag color="blue" v-if="record.isLatest">v{{ record.version }} (最新)</Tag>
                  <Tag v-else>v{{ record.version }}</Tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <Space>
                    <Button type="link" size="small" @click="handleDownloadAttachment(record as any)">下载</Button>
                    <Popconfirm title="确定删除该附件？" ok-type="danger" @confirm="handleDeleteAttachment(record as any)">
                      <Button type="link" size="small" danger>删除</Button>
                    </Popconfirm>
                  </Space>
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="versions" tab="历史版本">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              size="small"
              :pagination="false"
              row-key="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'changeType'">
                  <Tag :color="getChangeTypeColor(record.changeType)">
                    {{ getChangeTypeText(record.changeType) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'createdAt'">
                  {{ formatDateTime(record.createdAt) }}
                </template>
              </template>
            </Table>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Drawer>
  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, nextTick } from 'vue';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  DescriptionsItem,
  Drawer,
  Form,
  FormItem,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  SelectOption,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Upload,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import dayjs from 'dayjs';

import { Page } from '@vben/common-ui';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';

import {
  getOverAgeAutoList,
  getOverAgeAutoStats,
  type OverAgeAutoItem,
  type OverAgeAutoStats,
} from '#/api/hse/employee';

import {
  getInsuranceAttachments,
  uploadInsuranceAttachment,
  deleteInsuranceAttachment,
  getInsuranceVersions,
  exportOverAgePersonnel,
  type InsuranceAttachment,
  type InsuranceVersionRecord,
} from '#/api/hse/insurance';

const loading = ref(false);
const overAgeList = ref<OverAgeAutoItem[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 20 });
const searchForm = reactive({ keyword: '', gender: '' });
const statsData = ref<OverAgeAutoStats>({
  total: 0,
  byGender: {},
  byAgeGroup: {},
  topDepartments: [],
  thresholds: { '男': 60, '女': 55 },
});

const tableColumns = ref([
  { title: '序号', key: 'index', width: 60, align: 'center' as const, customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 70, align: 'center' as const },
  { title: '年龄', dataIndex: 'age', key: 'age', width: 90, align: 'center' as const },
  { title: '超龄年数', dataIndex: 'over_age_years', key: 'over_age_years', width: 110, align: 'center' as const },
  { title: '出生日期', dataIndex: 'birth_date', key: 'birth_date', width: 120 },
  { title: '身份证号', dataIndex: 'id_card', key: 'id_card', width: 170 },
  { title: '部门', dataIndex: 'dept_name', key: 'dept_name', width: 140 },
  { title: '岗位', dataIndex: 'position_name', key: 'position_name', width: 120 },
  { title: '联系方式', dataIndex: 'phone', key: 'phone', width: 120 },
  { title: '人员类型', dataIndex: 'person_type', key: 'person_type', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
]);

const formModalVisible = ref(false);
const formLoading = ref(false);
const editingRecord = ref<any>(null);
const formData = reactive({
  name: '',
  id_card: '',
  gender: '',
  birth_date: null as any,
  phone: '',
  dept: '',
  position: '',
});

const detailDrawerVisible = ref(false);
const detailActiveTab = ref('info');
const currentDetail = ref<any>(null);

const attachmentList = ref<InsuranceAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentColumns = ref([
  { title: '文件名', key: 'originalName', dataIndex: 'originalName' },
  { title: '版本', key: 'version', width: 140, align: 'center' as const },
  { title: '大小', key: 'fileSize', width: 100, align: 'center' as const },
  { title: '上传人', key: 'uploadedBy', dataIndex: 'uploadedBy', width: 100 },
  { title: '操作', key: 'action', width: 120, align: 'center' as const },
]);

const versionList = ref<InsuranceVersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = ref([
  { title: '版本号', key: 'version', dataIndex: 'version', width: 100 },
  { title: '变更类型', key: 'changeType', width: 100, align: 'center' as const },
  { title: '变更说明', key: 'changeSummary', dataIndex: 'changeSummary' },
  { title: '操作人', key: 'changedBy', dataIndex: 'changedBy', width: 100 },
  { title: '变更时间', key: 'createdAt', width: 170 },
]);

function formatDate(date: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

function formatDateTime(date: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

function getAgeTagColor(age: number): string {
  if (age >= 70) return 'red';
  if (age >= 65) return 'orange';
  if (age >= 60) return 'gold';
  return 'blue';
}

function getChangeTypeColor(type: string): string {
  switch (type) {
    case 'create': return 'green';
    case 'update': return 'blue';
    case 'import': return 'cyan';
    case 'revise': return 'orange';
    case 'delete': return 'red';
    default: return 'default';
  }
}

function getChangeTypeText(type: string): string {
  switch (type) {
    case 'create': return '新增';
    case 'update': return '更新';
    case 'import': return '导入';
    case 'revise': return '修订';
    case 'delete': return '删除';
    default: return type;
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function fetchStats() {
  try {
    const res = await getOverAgeAutoStats();
    statsData.value = res || statsData.value;
  } catch (err) {
    console.warn('获取超龄统计失败:', err);
  }
}

async function fetchData() {
  loading.value = true;
  try {
    const res = await getOverAgeAutoList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      gender: searchForm.gender || undefined,
    });
    overAgeList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取超龄人员列表失败:', err);
    overAgeList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.gender = '';
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingRecord.value = null;
  Object.assign(formData, {
    name: '', id_card: '', gender: '', birth_date: null, phone: '', dept: '', position: '',
  });
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingRecord.value = record;
  Object.assign(formData, {
    name: record.name,
    id_card: record.id_card,
    gender: record.gender,
    birth_date: record.birth_date ? dayjs(record.birth_date) : null,
    phone: record.phone,
    dept: record.dept_name || record.dept,
    position: record.position_name || record.position,
  });
  formModalVisible.value = true;
}

async function handleSave() {
  if (!formData.name) {
    message.error('请输入姓名');
    return;
  }
  formLoading.value = true;
  try {
    message.success('保存成功（演示模式）');
    formModalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    formLoading.value = false;
  }
}

async function handleViewDetail(record: any) {
  currentDetail.value = record;
  detailActiveTab.value = 'info';
  detailDrawerVisible.value = true;
  nextTick(() => {
    fetchAttachments(record.id);
    fetchVersions(record.id);
  });
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getInsuranceAttachments('overage', id);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getInsuranceVersions('overage', id);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取版本履历失败:', err);
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

function handleBeforeUploadAttachment(file: File) {
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isLt10M) {
    message.error('文件大小不能超过 10MB');
    return false;
  }
  if (!currentDetail.value) return false;
  uploadInsuranceAttachment('overage', currentDetail.value.id, file, { uploadedBy: 'admin' })
    .then(() => {
      message.success('上传成功');
      fetchAttachments(currentDetail.value!.id);
    })
    .catch(() => message.error('上传失败'));
  return false;
}

function handleDownloadAttachment(record: InsuranceAttachment) {
  if (record.fileUrl) window.open(record.fileUrl, '_blank');
}

async function handleDeleteAttachment(record: InsuranceAttachment) {
  if (!currentDetail.value) return;
  try {
    await deleteInsuranceAttachment('overage', currentDetail.value.id, record.id);
    message.success('删除成功');
    fetchAttachments(currentDetail.value.id);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除失败');
  }
}

async function handleExport() {
  try {
    const blob = await exportOverAgePersonnel();
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `超龄人员清单_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出失败:', err);
    message.error('导出失败');
  }
}

onMounted(() => {
  fetchStats();
  fetchData();
});
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .stats-row {
    margin-bottom: 16px;

    .stat-card {
      text-align: center;
    }
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .rule-alert {
    margin-bottom: 16px;
  }

  .detail-alert {
    margin-bottom: 16px;
  }

  .detail-desc {
    margin-top: 16px;
  }

  .attachment-upload {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    .upload-tip {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }
  }

  .link-text {
    color: hsl(var(--primary));
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }

  .mt-4 {
    margin-top: 16px;
  }
}
</style>
