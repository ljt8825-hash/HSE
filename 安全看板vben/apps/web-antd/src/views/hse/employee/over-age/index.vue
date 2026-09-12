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
            <Select.Option value="男">男</Select.Option>
            <Select.Option value="女">女</Select.Option>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="resetSearch">重置</Button>
        </FormItem>
      </Form>

      <Alert
        message="自动识别规则"
        :description="ruleDescription"
        type="info"
        show-icon
        class="rule-alert"
      />

      <Table
        :columns="tableColumns"
        :data-source="dataList"
        :loading="loading"
        :pagination="{
          current: pagination.current,
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
              <Button type="link" size="small" @click="openEditDialog(record)">编辑</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="editModalVisible"
      title="编辑保险管控信息"
      width="720px"
      @ok="handleEditSave"
      :confirm-loading="editLoading"
    >
      <Form layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="管控类型">
              <Select v-model:value="editForm.control_type" placeholder="请选择管控类型" allowClear>
                <Select.Option value="重点关注">重点关注</Select.Option>
                <Select.Option value="一般关注">一般关注</Select.Option>
                <Select.Option value="定期复查">定期复查</Select.Option>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="实际保险">
              <Input v-model:value="editForm.actual_insurance" placeholder="如：雇主责任险、意外险" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="工伤险">
              <a-select v-model:value="editForm.has_injury">
                <Select.Option :value="true">有</Select.Option>
                <Select.Option :value="false">无</Select.Option>
              </a-select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="雇主险">
              <a-select v-model:value="editForm.has_employer">
                <Select.Option :value="true">有</Select.Option>
                <Select.Option :value="false">无</Select.Option>
              </a-select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="合规情况">
              <Select v-model:value="editForm.compliance" placeholder="请选择" allowClear>
                <Select.Option value="合规">合规</Select.Option>
                <Select.Option value="不合规">不合规</Select.Option>
                <Select.Option value="待确认">待确认</Select.Option>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="保险到期日">
              <DatePicker v-model:value="editForm.expire_date" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="优化状态">
              <Select v-model:value="editForm.optimize_status">
                <Select.Option value="待处理">待处理</Select.Option>
                <Select.Option value="处理中">处理中</Select.Option>
                <Select.Option value="已完成">已完成</Select.Option>
                <Select.Option value="无需处理">无需处理</Select.Option>
              </Select>
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="优化日期">
              <DatePicker v-model:value="editForm.optimize_date" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="优化备注">
              <Input v-model:value="editForm.optimize_remark" placeholder="备注信息" />
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
              :message="`年龄阈值：${getGenderThresholdText(currentDetail.gender)}`"
              :description="`当前年龄 ${currentDetail.age} 岁，已超龄 ${currentDetail.over_age_years || currentDetail.overAgeYears || 0} 年`"
              type="warning"
              show-icon
              class="detail-alert"
            />
            <Descriptions :column="2" bordered size="small" class="detail-desc">
              <DescriptionsItem label="姓名">{{ currentDetail.name }}</DescriptionsItem>
              <DescriptionsItem label="性别">{{ currentDetail.gender || '-' }}</DescriptionsItem>
              <DescriptionsItem label="身份证号">{{ maskIdCard(currentDetail.id_card) }}</DescriptionsItem>
              <DescriptionsItem label="工号">{{ currentDetail.employee_code || '-' }}</DescriptionsItem>
              <DescriptionsItem label="出生日期">{{ formatDate(currentDetail.birth_date) }}</DescriptionsItem>
              <DescriptionsItem label="年龄">
                <Tag color="red">{{ currentDetail.age }} 岁</Tag>
              </DescriptionsItem>
              <DescriptionsItem label="年龄阈值">{{ currentDetail.age_threshold || getGenderThreshold(currentDetail.gender) }} 岁</DescriptionsItem>
              <DescriptionsItem label="超龄年数">
                <Tag color="orange">{{ currentDetail.over_age_years || currentDetail.overAgeYears || 0 }} 年</Tag>
              </DescriptionsItem>
              <DescriptionsItem label="部门">{{ currentDetail.dept_name || currentDetail.dept || '-' }}</DescriptionsItem>
              <DescriptionsItem label="岗位">{{ currentDetail.position_name || currentDetail.position || '-' }}</DescriptionsItem>
              <DescriptionsItem label="联系方式">{{ maskPhone(currentDetail.phone) }}</DescriptionsItem>
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
import { computed, onMounted, ref, nextTick } from 'vue';
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
import { useSearchForm, useDataTable } from '#/composables/hse';

import {
  getOverAgeAutoList,
  getOverAgeAutoStats,
  exportOverAgeAutoList,
  type OverAgeAutoItem,
  type OverAgeAutoStats,
} from '#/api/hse/employee';

import {
  getInsuranceAttachments,
  uploadInsuranceAttachment,
  deleteInsuranceAttachment,
  getInsuranceVersions,
  getOverAgeDetail,
  updateOverAge,
  createOverAge,
  type InsuranceAttachment,
  type InsuranceVersionRecord,
} from '#/api/hse/insurance';

// F7（提示词-132）：阈值统一由后端 auto-stats.thresholds 下发，前端不再维护独立副本。
// 后端权威来源：config/hseRules/employee-age-rule.json → getOverAgeThresholds()。
// 下面的 60/50 仅为首帧渲染的占位默认值，fetchStats() 返回后即被后端值覆盖。
const DEFAULT_MALE_THRESHOLD = 60;
const DEFAULT_FEMALE_THRESHOLD = 50;

const statsData = ref<OverAgeAutoStats>({
  total: 0,
  byGender: {},
  byAgeGroup: {},
  topDepartments: [],
  thresholds: { 男: DEFAULT_MALE_THRESHOLD, 女: DEFAULT_FEMALE_THRESHOLD },
});

/** 按性别取阈值：优先后端下发值，缺失时回落到占位默认值 */
function getGenderThreshold(gender?: string): number {
  const t = statsData.value.thresholds || {};
  if (gender === '女') return t['女'] ?? DEFAULT_FEMALE_THRESHOLD;
  return t['男'] ?? DEFAULT_MALE_THRESHOLD;
}

function getGenderThresholdText(gender?: string): string {
  const v = getGenderThreshold(gender);
  if (gender === '女') return `女性 ${v}岁`;
  if (gender === '男') return `男性 ${v}岁`;
  return `默认 ${v}岁`;
}

const ruleDescription = computed(() => {
  const t = statsData.value.thresholds || {};
  const male = t['男'] ?? DEFAULT_MALE_THRESHOLD;
  const female = t['女'] ?? DEFAULT_FEMALE_THRESHOLD;
  return `系统根据员工出生日期自动计算年龄：男性超过${male}岁、女性超过${female}岁自动识别为超龄人员。数据来源于员工档案，无需手动录入。规则来源：config/hseRules/employee-age-rule.json。`;
});

/** 身份证号脱敏：保留前4后4，中间替换为 10 个 * */
function maskIdCard(idCard: string | undefined | null): string {
  if (!idCard) return '-';
  if (idCard.length <= 8) return idCard;
  return idCard.slice(0, 4) + '**********' + idCard.slice(-4);
}

/** 手机号脱敏：保留前3后4，中间替换为 4 个 * */
function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '-';
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

// === 统一 composable：数据表格 ===
const {
  loading,
  dataList,
  total,
  pagination,
  fetchData,
  handleTableChange,
  handleReset: tableHandleReset,
} = useDataTable<OverAgeAutoItem>({
  fetchFn: ({ page, pageSize }) =>
    getOverAgeAutoList({
      page,
      pageSize,
      keyword: searchForm.keyword || undefined,
      gender: searchForm.gender || undefined,
    }),
  defaultPageSize: 20,
});

// === 统一 composable：搜索表单 ===
const { form: searchForm, reset: resetSearch } = useSearchForm<{
  keyword: string;
  gender: string;
}>({
  defaults: { keyword: '', gender: '' },
  onSearch: () => tableHandleReset(),
});

// === 编辑弹窗（保险管控字段，走 over-age-personnel.js PUT/POST） ===
const editModalVisible = ref(false);
const editLoading = ref(false);
const editingRecord = ref<any>(null);
const editForm = ref({
  control_type: '',
  actual_insurance: '',
  has_injury: false,
  has_employer: false,
  compliance: '',
  expire_date: null as any,
  optimize_status: '待处理',
  optimize_date: null as any,
  optimize_remark: '',
});

// 打开编辑弹窗：从 over_age_personnel 加载保险管控数据（按 over_age_id）
async function openEditDialog(record: any) {
  editingRecord.value = record;
  editModalVisible.value = true;
  const defaultForm = {
    control_type: '',
    actual_insurance: '',
    has_injury: false,
    has_employer: false,
    compliance: '',
    expire_date: null as any,
    optimize_status: '待处理',
    optimize_date: null as any,
    optimize_remark: '',
  };
  if (record.over_age_id) {
    try {
      const detail = await getOverAgeDetail(record.over_age_id);
      editForm.value = {
        control_type: detail.control_type || '',
        actual_insurance: detail.actual_insurance || '',
        has_injury: detail.has_injury || false,
        has_employer: detail.has_employer || false,
        compliance: detail.compliance || '',
        expire_date: detail.expire_date ? dayjs(detail.expire_date) : null,
        optimize_status: detail.optimize_status || '待处理',
        optimize_date: detail.optimize_date ? dayjs(detail.optimize_date) : null,
        optimize_remark: detail.optimize_remark || '',
      };
      return;
    } catch {
      // 无记录则使用默认值
    }
  }
  editForm.value = defaultForm;
}

// 保存编辑：存在 over_age_id 则更新，否则先创建
async function handleEditSave() {
  editLoading.value = true;
  try {
    const payload = {
      ...editForm.value,
      expire_date: editForm.value.expire_date ? dayjs(editForm.value.expire_date).format('YYYY-MM-DD') : null,
      optimize_date: editForm.value.optimize_date ? dayjs(editForm.value.optimize_date).format('YYYY-MM-DD') : null,
    };
    if (editingRecord.value?.over_age_id) {
      await updateOverAge(editingRecord.value.over_age_id, payload);
    } else {
      await createOverAge({
        personnel_id: editingRecord.value?.id,
        name: editingRecord.value?.name,
        id_card: editingRecord.value?.id_card,
        gender: editingRecord.value?.gender,
        birth_date: editingRecord.value?.birth_date,
        age: editingRecord.value?.age,
        dept: editingRecord.value?.dept_name,
        position: editingRecord.value?.position_name,
        ...payload,
      });
    }
    message.success('保存成功');
    editModalVisible.value = false;
    fetchData();
  } catch (e: any) {
    message.error(e?.message || '保存失败');
  } finally {
    editLoading.value = false;
  }
}

// 搜索输入变化：回到第 1 页并重新拉取（保留原筛选值）
function handleSearch() {
  tableHandleReset();
}

const tableColumns = ref([
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) =>
      (pagination.current - 1) * pagination.pageSize + index + 1,
  },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '性别', dataIndex: 'gender', key: 'gender', width: 70, align: 'center' as const },
  { title: '年龄', dataIndex: 'age', key: 'age', width: 90, align: 'center' as const },
  { title: '超龄年数', dataIndex: 'over_age_years', key: 'over_age_years', width: 110, align: 'center' as const },
  { title: '出生日期', dataIndex: 'birth_date', key: 'birth_date', width: 120 },
  { title: '身份证号', dataIndex: 'id_card', key: 'id_card', width: 170,
    customRender: ({ record }: any) => maskIdCard(record.id_card) },
  { title: '部门', dataIndex: 'dept_name', key: 'dept_name', width: 140 },
  { title: '岗位', dataIndex: 'position_name', key: 'position_name', width: 120 },
  { title: '联系方式', dataIndex: 'phone', key: 'phone', width: 120,
    customRender: ({ record }: any) => maskPhone(record.phone) },
  { title: '人员类型', dataIndex: 'person_type', key: 'person_type', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
]);

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
    if (!res) return;
    // F7：接口未下发 thresholds 时保留占位默认值，避免阈值展示变成 undefined
    statsData.value = {
      ...res,
      thresholds: res.thresholds || statsData.value.thresholds,
    };
  } catch (err) {
    console.warn('获取超龄统计失败:', err);
  }
}

async function handleViewDetail(record: any) {
  currentDetail.value = record;
  detailActiveTab.value = 'info';
  detailDrawerVisible.value = true;
  nextTick(() => {
    // 附件/版本以 over_age_personnel.id 为 biz_id；无对应记录时回退 employee.id
    const bizId = record.over_age_id || record.id;
    fetchAttachments(bizId);
    fetchVersions(bizId);
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
  const bizId = currentDetail.value.over_age_id || currentDetail.value.id;
  uploadInsuranceAttachment('overage', bizId, file, { uploadedBy: 'admin' })
    .then(() => {
      message.success('上传成功');
      fetchAttachments(bizId);
    })
    .catch(() => message.error('上传失败'));
  return false;
}

function handleDownloadAttachment(record: InsuranceAttachment) {
  if (record.fileUrl) window.open(record.fileUrl, '_blank');
}

async function handleDeleteAttachment(record: InsuranceAttachment) {
  if (!currentDetail.value) return;
  const bizId = currentDetail.value.over_age_id || currentDetail.value.id;
  try {
    await deleteInsuranceAttachment('overage', bizId, record.id);
    message.success('删除成功');
    fetchAttachments(bizId);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除失败');
  }
}

async function handleExport() {
  try {
    const blob = await exportOverAgeAutoList();
    // 校验 Content-Type：非 CSV/文本（如 JSON 错误响应）时解析报错提示
    if (blob instanceof Blob && blob.type && !blob.type.includes('csv') && !blob.type.includes('text')) {
      const text = await blob.text();
      try {
        const err = JSON.parse(text);
        message.error(err.message || '导出失败');
        return;
      } catch { /* 非 JSON，继续下载 */ }
    }
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

onMounted(async () => {
  // F7：先取阈值，保证 ruleDescription 与详情抽屉的阈值文案首帧即为后端权威值
  await fetchStats();
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
