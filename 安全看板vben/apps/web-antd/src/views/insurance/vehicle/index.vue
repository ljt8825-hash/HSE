<template>
  <Page auto-content-height class="hse-page">
    <!-- V1/V2：统计卡片 + 点击联动筛选器 -->
    <Row :gutter="16" class="stat-row">
      <template v-if="statsLoading">
        <Col :xs="24" :sm="12" :md="6" v-for="i in 4" :key="`skel-${i}`">
          <Card :bordered="false">
            <Skeleton active :paragraph="{ rows: 2 }" />
          </Card>
        </Col>
      </template>
      <template v-else>
        <Col :xs="24" :sm="12" :md="6" v-for="stat in statItems" :key="stat.key">
          <HseStatCard
            :title="stat.label"
            :value="stat.value"
            :icon="stat.icon"
            :color="stat.color"
            :clickable="true"
            @click="handleStatClick(stat.key)"
          />
        </Col>
      </template>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>车辆保险管理</span>
          <Space>
            <ImportButtonGroup module="vehicle" module-name="车辆保险" @refresh="fetchData" />
            <Button @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增车辆
            </Button>
          </Space>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="车牌号/车主/车型"
            allow-clear
            style="width: 220px"
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="保险时效状态">
          <Select
            v-model:value="searchForm.insuranceStatus"
            placeholder="全部状态"
            allow-clear
            style="width: 160px"
            @change="handleSearch"
          >
            <SelectOption value="normal">正常</SelectOption>
            <SelectOption value="expiring">即将到期</SelectOption>
            <SelectOption value="expired">已过期</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="车辆类型">
          <Select
            v-model:value="searchForm.vehicleType"
            placeholder="全部类型"
            allow-clear
            :loading="vehicleTypeLoading"
            style="width: 160px"
            @change="handleSearch"
          >
            <SelectOption v-for="vt in vehicleTypes" :key="vt" :value="vt">
              {{ vt }}
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="tableColumns"
        :data-source="vehicleList"
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
        :scroll="{ x: 2300 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="getExpiryBadgeText(record.expiryStatus)"
            />
          </template>
          <template v-else-if="column.key === 'commercial_end'">
            <span :class="{ 'expiring-soon': isExpiringSoon(record.commercial_end) }">
              {{ record.commercial_end ? formatDate(record.commercial_end) : '-' }}
            </span>
          </template>
          <template v-else-if="column.key === 'compulsory_end'">
            <span :class="{ 'expiring-soon': isExpiringSoon(record.compulsory_end) }">
              {{ record.compulsory_end ? formatDate(record.compulsory_end) : '-' }}
            </span>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="record.status === '在用' ? 'green' : 'default'">
              {{ record.status || '-' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'total_premium'">
            <span class="total-premium">{{ record.total_premium || 0 }} 元</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button type="link" size="small" @click="handleViewDetail(record)">查看</Button>
              <Button type="link" size="small" @click="handleEdit(record)">编辑</Button>
              <Popconfirm
                title="确定要删除吗？"
                ok-type="danger"
                @confirm="handleDelete(record)"
              >
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="formModalVisible"
      :title="editingVehicle ? '编辑车辆保险' : '新增车辆保险'"
      width="800px"
      @ok="handleSave"
      :confirm-loading="formLoading"
    >
      <Form layout="vertical">
        <Divider orientation="left">车辆信息</Divider>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="车牌号" required>
              <Input v-model:value="vehicleForm.plate" placeholder="请输入车牌号" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="厂牌车型">
              <Input v-model:value="vehicleForm.model" placeholder="请输入厂牌车型" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="车辆类型">
              <Input v-model:value="vehicleForm.vehicle_type" placeholder="请输入车辆类型" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="投保人、被保险人">
              <Input v-model:value="vehicleForm.policy_holder" placeholder="请输入投保人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="行驶证车主">
              <Input v-model:value="vehicleForm.registered_owner" placeholder="请输入行驶证车主" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="车架号">
              <Input v-model:value="vehicleForm.vin" placeholder="请输入车架号" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发动机号">
              <Input v-model:value="vehicleForm.engine_no" placeholder="请输入发动机号" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="初次登记年月">
              <DatePicker v-model:value="vehicleForm.reg_date" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="状态">
              <Select v-model:value="vehicleForm.status">
                <SelectOption value="在用">在用</SelectOption>
                <SelectOption value="停用">停用</SelectOption>
                <SelectOption value="报废">报废</SelectOption>
              </Select>
            </FormItem>
          </Col>
        </Row>

        <Divider orientation="left">保险期限</Divider>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="交强险保险起期">
              <DatePicker v-model:value="vehicleForm.compulsory_start" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="交强险保险止期">
              <DatePicker v-model:value="vehicleForm.compulsory_end" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="商业险保险起期">
              <DatePicker v-model:value="vehicleForm.commercial_start" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="商业险保险止期">
              <DatePicker v-model:value="vehicleForm.commercial_end" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>

        <Divider orientation="left">险种明细</Divider>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="车损险保额">
              <InputNumber v-model:value="vehicleForm.vehicle_damage_amount" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="车损险保费">
              <InputNumber v-model:value="vehicleForm.vehicle_damage_premium" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="三者险保额">
              <Input v-model:value="vehicleForm.third_party_amount" placeholder="如：200万" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="三者险保费">
              <InputNumber v-model:value="vehicleForm.third_party_premium" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
        </Row>
        <Row :gutter="16">
          <Col :span="8">
            <FormItem label="司乘险保额">
              <Input v-model:value="vehicleForm.passenger_amount" placeholder="如：5万/座" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="司乘险保费">
              <InputNumber v-model:value="vehicleForm.passenger_premium" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
        </Row>

        <Divider orientation="left">保费合计</Divider>
        <Row :gutter="16">
          <Col :span="6">
            <FormItem label="商业险合计">
              <InputNumber v-model:value="vehicleForm.commercial_total" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem label="交强险">
              <InputNumber v-model:value="vehicleForm.compulsory_premium" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem label="车船税">
              <InputNumber v-model:value="vehicleForm.vehicle_tax" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem label="合计">
              <InputNumber v-model:value="vehicleForm.total_premium" style="width: 100%" :min="0" />
            </FormItem>
          </Col>
        </Row>

        <FormItem label="备注">
          <Input.TextArea v-model:value="vehicleForm.remark" :rows="2" placeholder="请输入备注..." />
        </FormItem>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="车辆保险详情" width="720px">
      <template v-if="currentDetail">
        <Tabs v-model:activeKey="detailActiveTab">
          <Tabs.TabPane key="info" tab="基本信息">
            <Descriptions :column="2" bordered size="small">
              <DescriptionsItem label="车牌号">{{ currentDetail.plate }}</DescriptionsItem>
              <DescriptionsItem label="厂牌车型">{{ currentDetail.model || '-' }}</DescriptionsItem>
              <DescriptionsItem label="投保人、被保险人">{{ currentDetail.policy_holder || '-' }}</DescriptionsItem>
              <DescriptionsItem label="行驶证车主">{{ currentDetail.registered_owner || '-' }}</DescriptionsItem>
              <DescriptionsItem label="车架号">{{ currentDetail.vin || '-' }}</DescriptionsItem>
              <DescriptionsItem label="发动机号">{{ currentDetail.engine_no || '-' }}</DescriptionsItem>
              <DescriptionsItem label="初次登记年月">{{ formatDate(currentDetail.reg_date) }}</DescriptionsItem>
              <DescriptionsItem label="车辆类型">{{ currentDetail.vehicle_type || '-' }}</DescriptionsItem>
              <DescriptionsItem label="状态">
                <Tag :color="currentDetail.status === '在用' ? 'green' : 'default'">
                  {{ currentDetail.status || '-' }}
                </Tag>
              </DescriptionsItem>
              <DescriptionsItem label="到期提醒">
                <Badge
                  :status="getExpiryBadgeStatus(currentDetail.expiryStatus)"
                  :text="getExpiryBadgeText(currentDetail.expiryStatus)"
                />
              </DescriptionsItem>
            </Descriptions>

            <Divider orientation="left">保险期限</Divider>
            <Descriptions :column="2" bordered size="small">
              <DescriptionsItem label="交强险起期">{{ formatDate(currentDetail.compulsory_start) }}</DescriptionsItem>
              <DescriptionsItem label="交强险止期">{{ formatDate(currentDetail.compulsory_end) }}</DescriptionsItem>
              <DescriptionsItem label="商业险起期">{{ formatDate(currentDetail.commercial_start) }}</DescriptionsItem>
              <DescriptionsItem label="商业险止期">{{ formatDate(currentDetail.commercial_end) }}</DescriptionsItem>
            </Descriptions>

            <Divider orientation="left">险种明细</Divider>
            <Descriptions :column="2" bordered size="small">
              <DescriptionsItem label="车损险保额">{{ currentDetail.vehicle_damage_amount || 0 }} 元</DescriptionsItem>
              <DescriptionsItem label="车损险保费">{{ currentDetail.vehicle_damage_premium || 0 }} 元</DescriptionsItem>
              <DescriptionsItem label="三者险保额">{{ currentDetail.third_party_amount || '-' }}</DescriptionsItem>
              <DescriptionsItem label="三者险保费">{{ currentDetail.third_party_premium || 0 }} 元</DescriptionsItem>
              <DescriptionsItem label="司乘险保额">{{ currentDetail.passenger_amount || '-' }}</DescriptionsItem>
              <DescriptionsItem label="司乘险保费">{{ currentDetail.passenger_premium || 0 }} 元</DescriptionsItem>
            </Descriptions>

            <Divider orientation="left">保费合计</Divider>
            <Descriptions :column="2" bordered size="small">
              <DescriptionsItem label="商业险合计">{{ currentDetail.commercial_total || 0 }} 元</DescriptionsItem>
              <DescriptionsItem label="交强险">{{ currentDetail.compulsory_premium || 0 }} 元</DescriptionsItem>
              <DescriptionsItem label="车船税">{{ currentDetail.vehicle_tax || 0 }} 元</DescriptionsItem>
              <DescriptionsItem label="合计"><span class="total-premium">{{ currentDetail.total_premium || 0 }} 元</span></DescriptionsItem>
            </Descriptions>

            <Divider v-if="currentDetail.remark" orientation="left">备注</Divider>
            <p v-if="currentDetail.remark" class="remark-text">{{ currentDetail.remark }}</p>
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
import { onMounted, reactive, ref, computed, nextTick } from 'vue';
import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  DescriptionsItem,
  Divider,
  Drawer,
  Form,
  FormItem,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  SelectOption,
  Skeleton,
  Space,
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
import HseStatCard from '#/components/hse/StatCard.vue';

import {
  getVehicleList,
  getVehicleStats,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getInsuranceAttachments,
  uploadInsuranceAttachment,
  deleteInsuranceAttachment,
  getInsuranceVersions,
  exportVehicleInsurance,
  type InsuranceAttachment,
  type InsuranceVersionRecord,
} from '#/api/hse/insurance';

const loading = ref(false);
const vehicleList = ref<any[]>([]);
const total = ref(0);
const pagination = reactive({ page: 1, pageSize: 10 });
const searchForm = reactive({
  keyword: '',
  insuranceStatus: undefined as string | undefined,
  vehicleType: undefined as string | undefined,
});

// V1/V2：统计卡片数据
const statsLoading = ref(false);
const vehicleStats = ref<{ total: number; active: number; expired: number; expiring: number; totalPremium: number } | null>(null);
const vehicleTypes = ref<string[]>([]);
const vehicleTypeLoading = ref(false);

const statItems = computed(() => {
  const s = vehicleStats.value;
  return [
    { key: 'total', label: '车辆总数', value: s?.total ?? total.value, icon: 'lucide:truck', color: 'blue' as const },
    { key: 'active', label: '保险有效', value: s?.active ?? 0, icon: 'lucide:shield-check', color: 'green' as const },
    { key: 'expiring', label: '即将到期', value: s?.expiring ?? 0, icon: 'lucide:clock', color: 'orange' as const },
    { key: 'expired', label: '已过期', value: s?.expired ?? 0, icon: 'lucide:alert-circle', color: 'red' as const },
  ];
});

const tableColumns = ref([
  { title: '序号', key: 'index', width: 60, align: 'center' as const, fixed: 'left' as const,
    customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1 },
  {
    title: '车辆信息',
    key: 'vehicleInfo',
    align: 'center' as const,
    children: [
      { title: '车牌号', dataIndex: 'plate', key: 'plate', width: 120 },
      { title: '初次登记年月', dataIndex: 'reg_date', key: 'reg_date', width: 120 },
      { title: '厂牌车型', dataIndex: 'model', key: 'model', width: 220 },
    ]
  },
  {
    title: '交强险',
    key: 'compulsory',
    align: 'center' as const,
    children: [
      { title: '保险起期', dataIndex: 'compulsory_start', key: 'compulsory_start', width: 120 },
      { title: '保险止期', dataIndex: 'compulsory_end', key: 'compulsory_end', width: 120 },
    ]
  },
  {
    title: '商业险',
    key: 'commercial',
    align: 'center' as const,
    children: [
      { title: '保险起期', dataIndex: 'commercial_start', key: 'commercial_start', width: 120 },
      { title: '保险止期', dataIndex: 'commercial_end', key: 'commercial_end', width: 120 },
    ]
  },
  {
    title: '三者险',
    key: 'thirdParty',
    align: 'center' as const,
    children: [
      { title: '保额', dataIndex: 'third_party_amount', key: 'third_party_amount', width: 110 },
      { title: '保费', dataIndex: 'third_party_premium', key: 'third_party_premium', width: 110 },
    ]
  },
  {
    title: '保费合计',
    key: 'premiumTotal',
    align: 'center' as const,
    children: [
      { title: '商业险合计', dataIndex: 'commercial_total', key: 'commercial_total', width: 110,
        customRender: ({ text }: { text: number }) => text ? `${text} 元` : '-' },
      { title: '交强险', dataIndex: 'compulsory_premium', key: 'compulsory_premium', width: 90,
        customRender: ({ text }: { text: number }) => text ? `${text} 元` : '-' },
      { title: '车船税', dataIndex: 'vehicle_tax', key: 'vehicle_tax', width: 90,
        customRender: ({ text }: { text: number }) => text ? `${text} 元` : '-' },
      { title: '合计', key: 'total_premium', width: 120 },
    ]
  },
  { title: '保险时效状态', key: 'expiryStatus', width: 110, align: 'center' as const },
  { title: '状态', key: 'status', width: 80, align: 'center' as const, fixed: 'right' as const },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const },
]);

const formModalVisible = ref(false);
const formLoading = ref(false);
const editingVehicle = ref<any>(null);
const vehicleForm = reactive({
  plate: '',
  vin: '',
  engine_no: '',
  reg_date: null as any,
  model: '',
  vehicle_type: '',
  policy_holder: '',
  registered_owner: '',
  compulsory_start: null as any,
  compulsory_end: null as any,
  commercial_start: null as any,
  commercial_end: null as any,
  vehicle_damage_amount: undefined as number | undefined,
  vehicle_damage_premium: undefined as number | undefined,
  third_party_amount: '',
  third_party_premium: undefined as number | undefined,
  passenger_amount: '',
  passenger_premium: undefined as number | undefined,
  commercial_total: undefined as number | undefined,
  compulsory_premium: undefined as number | undefined,
  vehicle_tax: undefined as number | undefined,
  total_premium: undefined as number | undefined,
  status: '在用',
  remark: '',
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

function isExpiringSoon(date?: string): boolean {
  if (!date) return false;
  const diff = dayjs(date).diff(dayjs(), 'day');
  return diff >= 0 && diff <= 30;
}

function getExpiryBadgeStatus(status?: string): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'normal': return 'success';
    case 'expiring': return 'warning';
    case 'expired': return 'error';
    default: return 'default';
  }
}

function getExpiryBadgeText(status?: string): string {
  switch (status) {
    case 'normal': return '正常';
    case 'expiring': return '临期';
    case 'expired': return '过期';
    default: return '未知';
  }
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

async function fetchData() {
  loading.value = true;
  try {
    const res = await getVehicleList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      insuranceStatus: searchForm.insuranceStatus,
      model: searchForm.vehicleType,
    });
    vehicleList.value = res.list || [];
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取车辆列表失败:', err);
    vehicleList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getVehicleStats();
    vehicleStats.value = res.stats || null;
    vehicleTypes.value = res.vehicle_types || [];
  } catch (err) {
    console.warn('获取车辆统计失败:', err);
    vehicleStats.value = null;
    vehicleTypes.value = [];
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
  searchForm.insuranceStatus = undefined;
  searchForm.vehicleType = undefined;
  pagination.page = 1;
  fetchData();
}

// V2：统计卡片点击联动筛选器（total 清空筛选，其余按时效状态过滤）
function handleStatClick(key: string) {
  searchForm.keyword = '';
  searchForm.vehicleType = undefined;
  if (key === 'total') {
    searchForm.insuranceStatus = undefined;
  } else {
    searchForm.insuranceStatus = key; // active / expired / expiring
  }
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function resetForm() {
  Object.assign(vehicleForm, {
    plate: '', vin: '', engine_no: '', reg_date: null, model: '', vehicle_type: '',
    policy_holder: '', registered_owner: '',
    compulsory_start: null, compulsory_end: null,
    commercial_start: null, commercial_end: null,
    vehicle_damage_amount: undefined, vehicle_damage_premium: undefined,
    third_party_amount: '', third_party_premium: undefined,
    passenger_amount: '', passenger_premium: undefined,
    commercial_total: undefined, compulsory_premium: undefined,
    vehicle_tax: undefined, total_premium: undefined,
    status: '在用', remark: '',
  });
}

function handleCreate() {
  editingVehicle.value = null;
  resetForm();
  formModalVisible.value = true;
}

function handleEdit(record: any) {
  editingVehicle.value = record;
  resetForm();
  Object.assign(vehicleForm, {
    ...record,
    reg_date: record.reg_date ? dayjs(record.reg_date) : null,
    compulsory_start: record.compulsory_start ? dayjs(record.compulsory_start) : null,
    compulsory_end: record.compulsory_end ? dayjs(record.compulsory_end) : null,
    commercial_start: record.commercial_start ? dayjs(record.commercial_start) : null,
    commercial_end: record.commercial_end ? dayjs(record.commercial_end) : null,
  });
  formModalVisible.value = true;
}

async function handleSave() {
  if (!vehicleForm.plate) {
    message.error('请输入车牌号');
    return;
  }
  formLoading.value = true;
  try {
    const data = {
      ...vehicleForm,
      reg_date: vehicleForm.reg_date ? dayjs(vehicleForm.reg_date).format('YYYY-MM-DD') : null,
      compulsory_start: vehicleForm.compulsory_start ? dayjs(vehicleForm.compulsory_start).format('YYYY-MM-DD') : null,
      compulsory_end: vehicleForm.compulsory_end ? dayjs(vehicleForm.compulsory_end).format('YYYY-MM-DD') : null,
      commercial_start: vehicleForm.commercial_start ? dayjs(vehicleForm.commercial_start).format('YYYY-MM-DD') : null,
      commercial_end: vehicleForm.commercial_end ? dayjs(vehicleForm.commercial_end).format('YYYY-MM-DD') : null,
    };
    if (editingVehicle.value) {
      await updateVehicle(editingVehicle.value.id, data);
      message.success('更新成功');
    } else {
      await createVehicle(data);
      message.success('创建成功');
    }
    formModalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    formLoading.value = false;
  }
}

async function handleDelete(record: any) {
  try {
    await deleteVehicle(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

function handleViewDetail(record: any) {
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
    const res = await getInsuranceAttachments('vehicle', id);
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
    const res = await getInsuranceVersions('vehicle', id);
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
  uploadInsuranceAttachment('vehicle', currentDetail.value.id, file, { uploadedBy: 'admin' })
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
    await deleteInsuranceAttachment('vehicle', currentDetail.value.id, record.id);
    message.success('删除成功');
    fetchAttachments(currentDetail.value.id);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除失败');
  }
}

async function handleExport() {
  try {
    const blob = await exportVehicleInsurance();
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `车辆保险台账_${dayjs().format('YYYYMMDD')}.csv`);
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

  .stat-row {
    margin-bottom: 16px;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .expiring-soon {
    color: hsl(var(--warning));
    font-weight: 500;
  }

  .total-premium {
    font-weight: 600;
    color: hsl(var(--primary));
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

  .remark-text {
    margin: 0;
    padding: 8px 12px;
    background: hsl(var(--muted) / 0.3);
    border-radius: 4px;
    color: hsl(var(--muted-foreground));
  }

  .mt-4 {
    margin-top: 16px;
  }
}
</style>
