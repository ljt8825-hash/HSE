<template>
  <Page auto-content-height class="hse-page">
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 4" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <Row v-else :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="12" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="stat.color"
        />
      </Col>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>安全费用预算及支出</span>
          <div class="header-buttons">
            <ImportButtonGroup module="budget" module-name="安全费用预算" @refresh="fetchData" />
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增预算
            </Button>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索项目名称/备注"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="年份">
          <Select
            v-model:value="searchForm.year"
            placeholder="全部年份"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="y in yearOptions" :key="y" :value="y">
              {{ y }} 年
            </SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部状态"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="planning">计划中</SelectOption>
            <SelectOption value="executing">执行中</SelectOption>
            <SelectOption value="completed">已完成</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="budgetList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 1900 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'actualTotal'">
            {{ (record.actualQuantity && record.actualUnitPrice ? (record.actualQuantity * record.actualUnitPrice).toFixed(4) : (record.spentAmount ? (record.spentAmount / 10000).toFixed(4) : '-')) }}
          </template>
          <template v-else-if="column.key === 'actualExpenditureTotal'">
            {{ (record.actualExpenditureQuantity && record.actualExpenditureUnitPrice ? (record.actualExpenditureQuantity * record.actualExpenditureUnitPrice).toFixed(4) : (record.actualExpenditureTotal ? Number(record.actualExpenditureTotal).toFixed(4) : '-')) }}
          </template>
          <template v-else-if="column.key === 'planUnitPrice'">
            {{ record.planUnitPrice !== undefined && record.planUnitPrice !== null ? Number(record.planUnitPrice).toFixed(4) : '-' }}
          </template>
          <template v-else-if="column.key === 'actualUnitPrice'">
            {{ record.actualUnitPrice !== undefined && record.actualUnitPrice !== null ? Number(record.actualUnitPrice).toFixed(4) : '-' }}
          </template>
          <template v-else-if="column.key === 'planTotal'">
            {{ record.planTotal !== undefined && record.planTotal !== null ? Number(record.planTotal).toFixed(4) : (record.planQuantity && record.planUnitPrice ? (record.planQuantity * record.planUnitPrice).toFixed(4) : '-') }}
          </template>
          <template v-else-if="column.key === 'planQuantity'">
            {{ record.planQuantity !== undefined && record.planQuantity !== null ? Number(record.planQuantity).toFixed(0) : '-' }}
          </template>
          <template v-else-if="column.key === 'actualQuantity'">
            {{ record.actualQuantity !== undefined && record.actualQuantity !== null ? Number(record.actualQuantity).toFixed(0) : '-' }}
          </template>
          <template v-else-if="column.key === 'planTime'">
            {{ record.planTime ? record.planTime.substring(0, 10) : '-' }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record as any)">查看</Button>
            <Button type="link" size="small" @click="handleEdit(record as any)">编辑</Button>
            <Popconfirm
              title="确定要删除此预算项目吗？"
              ok-text="删除"
              cancel-text="取消"
              @confirm="handleDelete(record as any)"
            >
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingBudget ? '编辑预算' : '新增预算'"
      :confirm-loading="modalLoading"
      width="640px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="budgetForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="预算年度" name="budgetYear" required>
              <Select v-model:value="budgetForm.budgetYear" placeholder="请选择年份" style="width: 100%">
                <SelectOption v-for="y in yearOptions" :key="y" :value="y">
                  {{ y }} 年
                </SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="预算科目" name="budgetSubject">
              <Select v-model:value="budgetForm.budgetSubject" placeholder="请选择预算科目" style="width: 100%">
                <SelectOption value="费用化">费用化</SelectOption>
                <SelectOption value="资本化">资本化</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="措施项目（安全生产费用类别）" name="measureItem">
              <Input.Textarea v-model:value="budgetForm.measureItem" :rows="2" placeholder="请输入措施项目" />
            </FormItem>
          </Col>
          <Col :span="16">
            <FormItem label="名称" name="itemName" required>
              <Input v-model:value="budgetForm.itemName" placeholder="请输入名称" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="规格/品牌" name="spec">
              <Input v-model:value="budgetForm.spec" placeholder="请输入规格/品牌" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="用途及依据" name="purpose">
              <Input v-model:value="budgetForm.purpose" placeholder="请输入用途及依据" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="使用部门/地点" name="location">
              <Input v-model:value="budgetForm.location" placeholder="请输入使用部门/地点" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="计划-数量" name="planQuantity">
              <InputNumber v-model:value="budgetForm.planQuantity" :min="0" :precision="0" style="width: 100%" placeholder="计划数量" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="计划-单价(万元)" name="planUnitPrice">
              <InputNumber v-model:value="budgetForm.planUnitPrice" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="计划单价" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="计划-总价(万元)" name="planTotal">
              <InputNumber v-model:value="budgetForm.planTotal" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="计划总价" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="OA计划支出-数量" name="actualQuantity">
              <InputNumber v-model:value="budgetForm.actualQuantity" :min="0" :precision="0" style="width: 100%" placeholder="OA计划支出数量" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="OA计划支出-单价(万元)" name="actualUnitPrice">
              <InputNumber v-model:value="budgetForm.actualUnitPrice" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="OA计划支出单价" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="实际支出-数量" name="actualExpenditureQuantity">
              <InputNumber v-model:value="budgetForm.actualExpenditureQuantity" :min="0" :precision="0" style="width: 100%" placeholder="实际支出数量" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="实际支出-单价(万元)" name="actualExpenditureUnitPrice">
              <InputNumber v-model:value="budgetForm.actualExpenditureUnitPrice" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="实际支出单价" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="实际支出-总价(万元)" name="actualExpenditureTotal">
              <InputNumber v-model:value="budgetForm.actualExpenditureTotal" :min="0" :precision="4" :step="0.0001" style="width: 100%" placeholder="实际支出总价" />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem label="使用状态" name="useStatus">
              <Select v-model:value="budgetForm.useStatus" placeholder="请选择使用状态" style="width: 100%">
                <SelectOption value="已支出">已支出</SelectOption>
                <SelectOption value="申请中">申请中</SelectOption>
                <SelectOption value="未支出">未支出</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input v-model:value="budgetForm.remark" placeholder="请输入备注" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="预算详情" width="600px">
      <template v-if="currentBudget">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentBudget.item }}</h3>
          <Tag :color="getStatusColor(currentBudget.status)">
            {{ getStatusText(currentBudget.status) }}
          </Tag>
          <Tag :color="getCategoryColor(currentBudget.category)">
            {{ currentBudget.category }}
          </Tag>
        </div>
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">年份：</span>
            <span class="detail-value">{{ currentBudget.year }} 年</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">预算金额：</span>
            <span class="detail-value">{{ formatMoney(currentBudget.budgetAmount) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">已使用：</span>
            <span class="detail-value">{{ formatMoney(currentBudget.usedAmount) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">剩余：</span>
            <span class="detail-value">
              {{ formatMoney(currentBudget.budgetAmount - currentBudget.usedAmount) }}
            </span>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">执行率</div>
          <Progress
            :percent="getExecutionRate(currentBudget)"
            :status="getProgressStatus(currentBudget.status)"
            :stroke-width="12"
          />
          <div class="progress-text">{{ getExecutionRate(currentBudget) }}%</div>
        </div>
        <div v-if="currentBudget.remark" class="detail-section">
          <div class="detail-label">备注</div>
          <div class="detail-content">{{ currentBudget.remark }}</div>
        </div>
      </template>
    </Drawer>

  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  Select,
  SelectOption,
  Button,
  Modal,
  Drawer,
  Tag,
  message,
  Popconfirm,
  InputNumber,
  Progress,
  Skeleton,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import { $t } from '#/locales';

import {
  getBudgetList,
  getBudgetStats,
  createBudget,
  updateBudget,
  deleteBudget,
  type BudgetApi,
} from '#/api/hse/goals';

const loading = ref(false);
const statsLoading = ref(false);
const budgetList = ref<BudgetApi.BudgetItem[]>([]);
const total = ref(0);
const budgetStats = ref<BudgetApi.BudgetStats | null>(null);

const searchForm = reactive({
  keyword: '',
  year: undefined as number | undefined,
  status: undefined as string | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const yearOptions = computed(() => {
  const years: number[] = [];
  const currentYear = new Date().getFullYear();
  for (let y = 2024; y <= currentYear + 1; y += 1) {
    years.push(y);
  }
  return years;
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingBudget = ref<BudgetApi.BudgetItem | null>(null);
const budgetForm = reactive({
  budgetYear: new Date().getFullYear(),
  year: new Date().getFullYear(),
  item: '',
  itemName: '',
  category: '' as string,
  measureItem: '' as string,
  budgetSubject: '' as string,
  purpose: '' as string,
  planTime: '' as string,
  location: '' as string,
  spec: '' as string,
  planQuantity: undefined as number | undefined,
  planUnitPrice: undefined as number | undefined,
  planTotal: undefined as number | undefined,
  actualQuantity: undefined as number | undefined,
  actualUnitPrice: undefined as number | undefined,
  actualExpenditureQuantity: undefined as number | undefined,
  actualExpenditureUnitPrice: undefined as number | undefined,
  actualExpenditureTotal: undefined as number | undefined,
  useStatus: '' as string,
  budgetAmount: 0 as number | undefined,
  usedAmount: 0 as number | undefined,
  status: 'active' as string,
  remark: '',
});

const formRef = ref<FormInstance>();

const formRules = {
  budgetYear: [{ required: true, message: '请选择年份', trigger: 'change' }],
  itemName: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { min: 1, max: 200, message: '名称长度为1-200字符', trigger: 'blur' },
  ],
};

const detailDrawerVisible = ref(false);
const currentBudget = ref<BudgetApi.BudgetItem | null>(null);

const statItems = computed(() => {
  const stats = budgetStats.value;
  const planTotal = stats?.planTotal ?? 0;
  const spentTotal = stats?.spentTotal ?? 0;
  const executionRate = stats?.executionRate ?? 0;
  const count = stats?.total ?? budgetList.value.length;
  return [
    {
      key: 'total_plan',
      label: '计划总额(万元)',
      value: `${planTotal.toFixed(2)}万`,
      color: 'blue' as const,
      icon: 'lucide:wallet',
    },
    {
      key: 'total_actual',
      label: '已支出(万元)',
      value: `${spentTotal.toFixed(2)}万`,
      color: 'orange' as const,
      icon: 'lucide:trending-up',
    },
    {
      key: 'execution_rate',
      label: '执行率',
      value: `${executionRate}%`,
      color: 'cyan' as const,
      icon: 'lucide:bar-chart-3',
    },
    {
      key: 'count',
      label: '项目数',
      value: count,
      color: 'green' as const,
      icon: 'lucide:clipboard-list',
    },
  ];
});

// 2026 起申请表新增"实际支出"栏，且原"支出"栏对应"OA计划支出"。按年份动态切换列集。
const showActualExpenditure = computed(() => {
  const y = searchForm.year;
  return y === undefined || y === null || y >= 2026;
});

const columns = computed(() => {
  const base = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      align: 'center' as const,
      fixed: 'left' as const,
      customRender: ({ index }: { index: number }) => (pagination.page - 1) * pagination.pageSize + index + 1,
    },
    { title: '措施项目', dataIndex: 'measureItem', key: 'measureItem', width: 260, ellipsis: true },
    { title: '预算科目', dataIndex: 'budgetSubject', key: 'budgetSubject', width: 100 },
    { title: '名称', dataIndex: 'itemName', key: 'itemName', width: 200, ellipsis: true },
    { title: '用途及依据', dataIndex: 'purpose', key: 'purpose', width: 160, ellipsis: true },
    { title: '计划使用时间', dataIndex: 'planTime', key: 'planTime', width: 120 },
    { title: '使用部门/地点', dataIndex: 'location', key: 'location', width: 160, ellipsis: true },
    { title: '规格/品牌', dataIndex: 'spec', key: 'spec', width: 120, ellipsis: true },
    { title: '计划-数量', dataIndex: 'planQuantity', key: 'planQuantity', width: 100, align: 'right' as const },
    { title: '计划-单价(万)', dataIndex: 'planUnitPrice', key: 'planUnitPrice', width: 120, align: 'right' as const },
    { title: '计划-总价(万)', dataIndex: 'planTotal', key: 'planTotal', width: 120, align: 'right' as const },
  ];
  const expend = showActualExpenditure.value
    ? [
        { title: 'OA计划支出-数量', dataIndex: 'actualQuantity', key: 'actualQuantity', width: 120, align: 'right' as const },
        { title: 'OA计划支出-单价(万)', dataIndex: 'actualUnitPrice', key: 'actualUnitPrice', width: 140, align: 'right' as const },
        { title: 'OA计划支出-总价(万)', key: 'actualTotal', width: 140, align: 'right' as const },
        { title: '实际支出-数量', dataIndex: 'actualExpenditureQuantity', key: 'actualExpenditureQuantity', width: 120, align: 'right' as const },
        { title: '实际支出-单价(万)', dataIndex: 'actualExpenditureUnitPrice', key: 'actualExpenditureUnitPrice', width: 140, align: 'right' as const },
        { title: '实际支出-总价(万)', key: 'actualExpenditureTotal', width: 140, align: 'right' as const },
      ]
    : [
        { title: '支出-数量', dataIndex: 'actualQuantity', key: 'actualQuantity', width: 100, align: 'right' as const },
        { title: '支出-单价(万)', dataIndex: 'actualUnitPrice', key: 'actualUnitPrice', width: 120, align: 'right' as const },
        { title: '支出-总价(万)', key: 'actualTotal', width: 120, align: 'right' as const },
      ];
  const tail = [
    { title: '使用状态', dataIndex: 'useStatus', key: 'useStatus', width: 100 },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    { title: '操作', key: 'action', width: 180, fixed: 'right' as const },
  ];
  return [...base, ...expend, ...tail];
});

function formatMoney(val: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
  }).format(val);
}

function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    培训教育: 'blue',
    防护装备: 'cyan',
    设备改造: 'purple',
    应急保障: 'orange',
    检测检验: 'gold',
    职业健康: 'green',
  };
  return map[category] || 'default';
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    planning: 'blue',
    executing: 'orange',
    completed: 'green',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    planning: '计划中',
    executing: '执行中',
    completed: '已完成',
  };
  return map[status] || status;
}

function getExecutionRate(record: BudgetApi.BudgetItem): number {
  if (!record.budgetAmount || record.budgetAmount <= 0) return 0;
  const rate = (record.usedAmount / record.budgetAmount) * 100;
  return Math.min(100, Math.round(rate));
}

function getProgressStatus(status: string): 'active' | 'exception' | 'success' | 'normal' {
  const map: Record<string, 'active' | 'exception' | 'success' | 'normal'> = {
    planning: 'normal',
    executing: 'active',
    completed: 'success',
  };
  return map[status] || 'normal';
}

async function fetchData() {
  loading.value = true;
  statsLoading.value = true;
  try {
    const params: BudgetApi.BudgetListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      year: searchForm.year,
    };
    const statsParams: BudgetApi.BudgetListParams = {
      keyword: searchForm.keyword || undefined,
      year: searchForm.year ?? new Date().getFullYear(),
    };
    const [res, statsRes] = await Promise.all([
      getBudgetList(params),
      getBudgetStats(statsParams),
    ]);
    budgetList.value = res.list || [];
    total.value = res.total || 0;
    budgetStats.value = statsRes;
  } catch (err) {
    console.warn('获取安全费用列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.module.budget') }));
    budgetList.value = [];
    total.value = 0;
    budgetStats.value = null;
  } finally {
    loading.value = false;
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.year = undefined;
  searchForm.status = undefined;
  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleCreate() {
  editingBudget.value = null;
  Object.assign(budgetForm, {
    budgetYear: new Date().getFullYear(),
    year: new Date().getFullYear(),
    item: '',
    itemName: '',
    category: '',
    measureItem: '',
    budgetSubject: '',
    purpose: '',
    planTime: '',
    location: '',
    spec: '',
    planQuantity: undefined,
    planUnitPrice: undefined,
    planTotal: undefined,
    actualQuantity: undefined,
    actualUnitPrice: undefined,
    actualExpenditureQuantity: undefined,
    actualExpenditureUnitPrice: undefined,
    actualExpenditureTotal: undefined,
    useStatus: '',
    budgetAmount: 0,
    usedAmount: 0,
    status: 'active',
    remark: '',
  });
  modalVisible.value = true;
}

function handleEdit(record: BudgetApi.BudgetItem) {
  editingBudget.value = record;
  Object.assign(budgetForm, {
    budgetYear: record.budgetYear || record.year,
    year: record.budgetYear || record.year,
    item: record.item || record.itemName || record.projectName,
    itemName: record.itemName || record.item || record.projectName,
    category: record.category,
    measureItem: record.measureItem,
    budgetSubject: record.budgetSubject,
    purpose: record.purpose,
    planTime: record.planTime,
    location: record.location,
    spec: record.spec,
    planQuantity: record.planQuantity,
    planUnitPrice: record.planUnitPrice,
    planTotal: record.planTotal,
    actualQuantity: record.actualQuantity,
    actualUnitPrice: record.actualUnitPrice,
    actualExpenditureQuantity: record.actualExpenditureQuantity,
    actualExpenditureUnitPrice: record.actualExpenditureUnitPrice,
    actualExpenditureTotal: record.actualExpenditureTotal,
    useStatus: record.useStatus,
    budgetAmount: record.budgetAmount,
    usedAmount: record.usedAmount || record.spentAmount,
    status: record.status || 'active',
    remark: record.remark || '',
  });
  modalVisible.value = true;
}

function handleView(record: BudgetApi.BudgetItem) {
  currentBudget.value = record;
  detailDrawerVisible.value = true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!budgetForm.itemName) {
    message.warning('请填写名称');
    return;
  }
  modalLoading.value = true;
  try {
    const spentAmount = budgetForm.actualQuantity && budgetForm.actualUnitPrice
      ? budgetForm.actualQuantity * budgetForm.actualUnitPrice * 10000
      : (budgetForm.usedAmount || 0);
    const data: Partial<BudgetApi.BudgetItem> = {
      budgetYear: budgetForm.budgetYear,
      year: budgetForm.budgetYear,
      item: budgetForm.itemName,
      itemName: budgetForm.itemName,
      projectName: budgetForm.itemName,
      category: budgetForm.category,
      measureItem: budgetForm.measureItem,
      budgetSubject: budgetForm.budgetSubject,
      purpose: budgetForm.purpose,
      planTime: budgetForm.planTime,
      location: budgetForm.location,
      spec: budgetForm.spec,
      planQuantity: budgetForm.planQuantity,
      planUnitPrice: budgetForm.planUnitPrice,
      planTotal: budgetForm.planTotal,
      actualQuantity: budgetForm.actualQuantity,
      actualUnitPrice: budgetForm.actualUnitPrice,
      actualExpenditureQuantity: budgetForm.actualExpenditureQuantity,
      actualExpenditureUnitPrice: budgetForm.actualExpenditureUnitPrice,
      actualExpenditureTotal: budgetForm.actualExpenditureTotal,
      useStatus: budgetForm.useStatus,
      budgetAmount: budgetForm.planTotal ? budgetForm.planTotal * 10000 : (budgetForm.budgetAmount || 0),
      usedAmount: spentAmount,
      spentAmount: spentAmount,
      status: budgetForm.status,
      remark: budgetForm.remark,
    };
    if (editingBudget.value) {
      await updateBudget(editingBudget.value.id, data);
      message.success('更新成功');
    } else {
      await createBudget(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败，请重试');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: BudgetApi.BudgetItem) {
  try {
    await deleteBudget(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败，请重试');
  }
}

onMounted(() => {
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

  .header-buttons {
    display: flex;
    gap: 8px;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .detail-section {
    margin-bottom: 24px;

    .detail-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .detail-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid hsl(var(--border));

      .detail-label {
        width: 100px;
        color: hsl(var(--foreground) / 0.45);
        flex-shrink: 0;
      }

      .detail-value {
        flex: 1;
        color: hsl(var(--foreground));
      }
    }

    .detail-label {
      color: hsl(var(--foreground) / 0.45);
      margin-bottom: 8px;
    }

    .detail-content {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 6px;
      color: hsl(var(--foreground));
      line-height: 1.6;
    }

    .progress-text {
      margin-top: 8px;
      text-align: right;
      color: hsl(var(--foreground) / 0.65);
    }
  }
}
</style>
