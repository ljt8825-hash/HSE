<script lang="ts" setup>
/**
 * 超龄人员保险管理（web-naive）
 * 服务端分页 / 搜索 / 统计卡 / 自动识别超龄人员 / 导出
 */
import { computed, reactive, ref, onMounted } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NGi,
  NInput,
  NSelect,
  NSpace,
  NStatistic,
  NTabPane,
  NTabs,
  NTag,
} from 'naive-ui';

import {
  HseActionBar,
  HseDataGrid,
  HsePageLayout,
  HseSearchPanel,
  HseStatusTag,
  type HseActionKey,
} from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  getOverAgeAutoList,
  getOverAgeAutoStats,
  exportOverAgeAutoList,
  type EmployeeApi,
} from '#/api/hse/employee';
import {
  getInsuranceAttachments,
  getInsuranceVersions,
  type InsuranceApi,
} from '#/api/hse/insurance';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseInsuranceOverAge' });

// ===================== 工具函数 =====================
function formatDate(date?: string | null): string {
  if (!date) return '-';
  try {
    return new Date(date).toISOString().slice(0, 10);
  } catch {
    return date;
  }
}

function maskIdCard(idCard?: string): string {
  if (!idCard) return '-';
  if (idCard.startsWith('ENC:')) return '***加密数据***';
  return idCard.replace(/^(.{6}).*(.{4})$/, '$1********$2');
}

function maskPhone(phone?: string): string {
  if (!phone) return '-';
  if (phone.startsWith('ENC:')) return '***加密数据***';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function getAgeTagType(age: number): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (age >= 70) return 'danger';
  if (age >= 65) return 'warning';
  if (age >= 60) return 'info';
  return 'success';
}

function toNType(type: string): 'primary' | 'default' | 'error' | 'success' | 'warning' | 'info' {
  switch (type) {
    case 'danger':
      return 'error';
    case 'neutral':
      return 'default';
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ===================== 列表数据 =====================
const loading = ref(false);
const data = ref<EmployeeApi.OverAgeAutoItem[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const stats = ref<EmployeeApi.OverAgeAutoStats>({
  total: 0,
  byGender: {},
  byAgeGroup: {},
  topDepartments: [],
  thresholds: { male: 60, female: 50 },
});

const searchForm = reactive({
  keyword: '',
  gender: '' as string | null,
});

async function loadData() {
  loading.value = true;
  try {
    const res = await getOverAgeAutoList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchForm.keyword || undefined,
      gender: searchForm.gender || undefined,
    });
    data.value = res.list ?? [];
    total.value = res.total ?? 0;
  } catch {
    data.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    const s = await getOverAgeAutoStats();
    if (s) {
      stats.value = s;
    }
  } catch {
    // ignore
  }
}

function onSearch() {
  currentPage.value = 1;
  loadData();
}

function onReset() {
  searchForm.keyword = '';
  searchForm.gender = null;
  onSearch();
}

function onPageChange(payload: { currentPage: number; pageSize: number }) {
  currentPage.value = payload.currentPage;
  pageSize.value = payload.pageSize;
  loadData();
}

async function onRefresh() {
  await Promise.all([loadData(), loadStats()]);
}

async function onExport() {
  try {
    const blob = await exportOverAgeAutoList();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    triggerDownload(blob as Blob, `超龄人员清单_${date}.csv`);
    message.success('导出成功');
  } catch {
    message.error('导出失败');
  }
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  create: { hidden: true },
  downloadTemplate: { hidden: true },
  import: { hidden: true },
});

// ===================== 规则说明 =====================
const ruleDescription = computed(() => {
  const maleThreshold = stats.value.thresholds?.male ?? 60;
  const femaleThreshold = stats.value.thresholds?.female ?? 50;
  return `系统根据员工出生日期自动计算年龄：男性超过${maleThreshold}岁、女性超过${femaleThreshold}岁自动识别为超龄人员。数据来源于员工档案，无需手动录入。超龄人员需重点关注保险管控与岗位适配情况。`;
});

// ===================== 详情抽屉 =====================
const detailDrawerVisible = ref(false);
const detailActiveTab = ref('info');
const currentDetail = ref<EmployeeApi.OverAgeAutoItem | null>(null);
const attachmentList = ref<InsuranceApi.InsuranceAttachment[]>([]);
const attachmentLoading = ref(false);
const versionList = ref<InsuranceApi.InsuranceVersionRecord[]>([]);
const versionLoading = ref(false);

async function handleViewDetail(row: EmployeeApi.OverAgeAutoItem) {
  currentDetail.value = row;
  detailActiveTab.value = 'info';
  detailDrawerVisible.value = true;
  // Load attachments and versions
  await Promise.all([
    fetchAttachments(row.id),
    fetchVersions(row.id),
  ]);
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getInsuranceAttachments('overage', id);
    attachmentList.value = res ?? [];
  } catch {
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getInsuranceVersions('overage', id);
    versionList.value = res ?? [];
  } catch {
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(date?: string): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleString('zh-CN');
  } catch {
    return date;
  }
}

function getChangeTypeColor(type: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (type) {
    case 'create': return 'success';
    case 'update': return 'info';
    case 'import': return 'default';
    case 'revise': return 'warning';
    case 'delete': return 'error';
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

// ===================== 表格列 =====================
const overAgeColumns = ref<VxeTableGridColumns>([
  { title: '序号', field: '_index', type: 'seq', width: 60, align: 'center' },
  { title: '姓名', field: 'name', width: 100, align: 'center' },
  { title: '性别', field: 'gender', width: 70, align: 'center' },
  { title: '年龄', field: 'age', width: 90, align: 'center', slots: { default: 'age' } },
  { title: '超龄年数', field: 'over_age_years', width: 110, align: 'center', slots: { default: 'overAge' } },
  { title: '出生日期', field: 'birth_date', width: 120, align: 'center', slots: { default: 'birthDate' } },
  { title: '身份证号', field: 'id_card', width: 170, align: 'center', slots: { default: 'idCard' } },
  { title: '部门', field: 'dept_name', minWidth: 140, align: 'left', showOverflow: 'tooltip' },
  { title: '岗位', field: 'position_name', width: 130, align: 'left', showOverflow: 'tooltip' },
  { title: '联系方式', field: 'phone', width: 130, align: 'center', slots: { default: 'phone' } },
  { title: '人员类型', field: 'person_type', width: 100, align: 'center' },
  {
    title: '操作',
    field: 'action',
    width: 100,
    align: 'center',
    fixed: 'right',
    slots: { default: 'action' },
  },
]);

onMounted(() => {
  loadData();
  loadStats();
});
</script>

<template>
  <HsePageLayout title="超龄人员保险管理" description="超龄人员保险管控与跟踪">
    <template #extra>
      <HseActionBar
        :actions="actionState"
        @refresh="onRefresh"
        @export="onExport"
      />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <NCard :bordered="false">
        <NStatistic label="超龄人员总数" :value="stats.total" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="男性超龄" :value="stats.byGender['男'] || stats.byGender['1'] || 0" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="女性超龄" :value="stats.byGender['女'] || stats.byGender['2'] || 0" />
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="70岁以上" :value="stats.byAgeGroup['70岁以上'] || 0" />
      </NCard>
    </div>

    <!-- 规则说明 -->
    <NAlert type="info" :show-icon="true" class="mb-4">
      <template #header>自动识别规则</template>
      {{ ruleDescription }}
    </NAlert>

    <!-- 搜索 -->
    <HseSearchPanel @query="onSearch" @reset="onReset">
      <NGi>
        <NInput
          v-model:value="searchForm.keyword"
          placeholder="姓名/工号"
          clearable
          @keyup.enter="onSearch"
        />
      </NGi>
      <NGi>
        <NSelect
          v-model:value="searchForm.gender"
          placeholder="性别"
          clearable
          :options="[
            { label: '男', value: '男' },
            { label: '女', value: '女' },
          ]"
        />
      </NGi>
    </HseSearchPanel>

    <!-- 表格 -->
    <HseDataGrid
      :columns="overAgeColumns"
      :data="data"
      :loading="loading"
      :pager="true"
      :total="total"
      @page-change="onPageChange"
    >
      <template #age="{ row }">
        <HseStatusTag :type="getAgeTagType(row.age)">
          {{ row.age }} 岁
        </HseStatusTag>
      </template>
      <template #overAge="{ row }">
        <NTag type="error" size="small" round>超龄 {{ row.over_age_years }} 年</NTag>
      </template>
      <template #birthDate="{ row }">
        {{ formatDate(row.birth_date) }}
      </template>
      <template #idCard="{ row }">
        {{ maskIdCard(row.id_card) }}
      </template>
      <template #phone="{ row }">
        {{ maskPhone(row.phone) }}
      </template>
      <template #action="{ row }">
        <NSpace justify="center">
          <NButton size="small" type="primary" quaternary @click="handleViewDetail(row)">
            查看
          </NButton>
        </NSpace>
      </template>
    </HseDataGrid>

    <!-- 详情抽屉 -->
    <NDrawer
      v-model:show="detailDrawerVisible"
      :width="720"
      placement="right"
    >
      <NDrawerContent title="超龄人员详情" closable>
        <NTabs v-model:value="detailActiveTab" type="line">
          <NTabPane name="info" tab="基本信息">
            <template v-if="currentDetail">
              <NAlert type="warning" :show-icon="true" class="mb-4">
                <template #header>年龄阈值提醒</template>
                当前年龄 {{ currentDetail.age }} 岁，已超龄 {{ currentDetail.over_age_years }} 年
              </NAlert>
              <NDescriptions :column="2" bordered label-placement="left" size="small">
                <NDescriptionsItem label="姓名">{{ currentDetail.name }}</NDescriptionsItem>
                <NDescriptionsItem label="性别">{{ currentDetail.gender || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="身份证号">{{ maskIdCard(currentDetail.id_card) }}</NDescriptionsItem>
                <NDescriptionsItem label="工号">{{ currentDetail.employee_code || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="出生日期">{{ formatDate(currentDetail.birth_date) }}</NDescriptionsItem>
                <NDescriptionsItem label="年龄">
                  <NTag :type="toNType(getAgeTagType(currentDetail.age))" size="small">
                    {{ currentDetail.age }} 岁
                  </NTag>
                </NDescriptionsItem>
                <NDescriptionsItem label="超龄年数">
                  <NTag type="error" size="small">{{ currentDetail.over_age_years }} 年</NTag>
                </NDescriptionsItem>
                <NDescriptionsItem label="部门">{{ currentDetail.dept_name || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="岗位">{{ currentDetail.position_name || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="联系方式">{{ maskPhone(currentDetail.phone) }}</NDescriptionsItem>
                <NDescriptionsItem label="人员类型">{{ currentDetail.person_type || '-' }}</NDescriptionsItem>
                <NDescriptionsItem label="人员分类">{{ currentDetail.person_category || '-' }}</NDescriptionsItem>
              </NDescriptions>
            </template>
          </NTabPane>
          <NTabPane name="attachments" tab="附件列表">
            <div v-if="attachmentList.length === 0 && !attachmentLoading" class="text-center py-8 text-gray-400">
              暂无附件
            </div>
            <HseDataGrid
              v-else
              :columns="[
                { title: '文件名', field: 'originalName', minWidth: 200 },
                { title: '大小', field: 'fileSize', width: 120, align: 'center', slots: { default: 'fileSize' } },
                { title: '版本', field: 'version', width: 100, align: 'center' },
                { title: '上传人', field: 'uploadedBy', width: 100, align: 'center' },
                { title: '上传时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
              ]"
              :data="attachmentList"
              :loading="attachmentLoading"
              :pager="false"
              size="small"
            >
              <template #fileSize="{ row }">
                {{ formatFileSize(row.fileSize) }}
              </template>
              <template #createdAt="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </HseDataGrid>
          </NTabPane>
          <NTabPane name="versions" tab="历史版本">
            <div v-if="versionList.length === 0 && !versionLoading" class="text-center py-8 text-gray-400">
              暂无版本记录
            </div>
            <HseDataGrid
              v-else
              :columns="[
                { title: '版本号', field: 'version', width: 100, align: 'center' },
                { title: '变更类型', field: 'changeType', width: 100, align: 'center', slots: { default: 'changeType' } },
                { title: '变更说明', field: 'changeSummary', minWidth: 200 },
                { title: '操作人', field: 'changedBy', width: 100, align: 'center' },
                { title: '变更时间', field: 'createdAt', width: 170, align: 'center', slots: { default: 'createdAt' } },
              ]"
              :data="versionList"
              :loading="versionLoading"
              :pager="false"
              size="small"
            >
              <template #changeType="{ row }">
                <NTag :type="getChangeTypeColor(row.changeType)" size="small">
                  {{ getChangeTypeText(row.changeType) }}
                </NTag>
              </template>
              <template #createdAt="{ row }">
                {{ formatDateTime(row.createdAt) }}
              </template>
            </HseDataGrid>
          </NTabPane>
        </NTabs>
      </NDrawerContent>
    </NDrawer>
  </HsePageLayout>
</template>
