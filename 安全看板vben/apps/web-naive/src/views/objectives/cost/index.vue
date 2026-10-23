<script setup lang="ts">
/**
 * 安全生产费用业务域（P2）—— 预算概览（计算财务状态）+ 费用申请（含成本归因）
 * 复用既有 Naive UI 组件；不引入 Ant Design Vue。
 */
import { h, onMounted, reactive, ref } from 'vue';
import { NButton, NTag, useMessage } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import {
  getBudgetOverview,
  getCostStats,
  getCostRequests,
  createCostRequest,
  deleteCostRequest,
  getBizDomains,
  getOpTypes,
  getInvestCategories,
} from '#/api/hse/cost';
import type { CostApi } from '#/api/hse/cost';

const message = useMessage();

const budgets = ref<CostApi.BudgetOverviewItem[]>([]);
const budgetsTotal = ref(0);
const requests = ref<CostApi.CostRequestItem[]>([]);
const requestsTotal = ref(0);
const stats = ref<CostApi.CostStats>({ totalActual: 0, byDomain: [], byCategory: [] });

const bizDomains = ref<{ label: string; value: number }[]>([]);
const opTypes = ref<{ label: string; value: number }[]>([]);
const investCategories = ref<{ label: string; value: number }[]>([]);
const budgetOptions = ref<{ label: string; value: number }[]>([]);

const sourceTypeOptions = [
  { label: '隐患', value: 'hazard' },
  { label: '事故', value: 'accident' },
  { label: '检查', value: 'inspection' },
  { label: '风险控制', value: 'risk_control' },
  { label: '培训需求', value: 'training_need' },
  { label: '应急需求', value: 'emergency' },
  { label: '年度安全计划', value: 'annual_plan' },
  { label: '日常安全投入', value: 'routine' },
  { label: '其他', value: 'other' },
];

const objectTypeOptions = [
  { label: '公司', value: 'company' },
  { label: '作业中心', value: 'center' },
  { label: '乡镇', value: 'township' },
  { label: '作业单位', value: 'unit' },
  { label: '车辆', value: 'vehicle' },
  { label: '设备', value: 'equipment' },
  { label: '地点', value: 'location' },
  { label: '业务事件', value: 'event' },
];

const loading = ref(false);
const showModal = ref(false);
const submitting = ref(false);

const form = reactive<CostApi.CostRequestCreate & { bizDomainId?: number | null; opTypeId?: number | null; investCategoryId?: number | null; objectType?: string | null; objectName?: string | null; eventType?: string | null; eventId?: number | null; amount?: number | null }>({
  budgetId: null,
  title: '',
  sourceType: 'hazard',
  sourceId: null,
  applicantName: '',
  applyAmount: 0,
  purpose: '',
  bizDomainId: null,
  opTypeId: null,
  investCategoryId: null,
  objectType: 'transfer_station',
  objectName: '',
  eventType: 'hazard',
  eventId: null,
  amount: 0,
});

async function loadAll() {
  loading.value = true;
  try {
    const [b, r, s] = await Promise.all([
      getBudgetOverview({ pageSize: 100 }),
      getCostRequests({ pageSize: 100 }),
      getCostStats({}),
    ]);
    budgets.value = b.list;
    budgetsTotal.value = b.total;
    requests.value = r.list;
    requestsTotal.value = r.total;
    stats.value = s;
    budgetOptions.value = b.list.map((x) => ({ label: `${x.projectName}-${x.itemName}`, value: x.budgetId }));
  } catch (e) {
    message.error('数据加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadRefs() {
  try {
    const [d, c] = await Promise.all([getBizDomains(), getInvestCategories()]);
    bizDomains.value = d.map((x) => ({ label: x.name, value: x.id }));
    investCategories.value = c.map((x) => ({ label: x.name, value: x.id }));
  } catch (e) { /* ignore */ }
}

async function onBizDomainChange(v: number | null) {
  form.opTypeId = null;
  opTypes.value = [];
  if (!v) return;
  const r = await getOpTypes(v);
  opTypes.value = r.map((x) => ({ label: x.name, value: x.id }));
}

function openCreate() {
  form.budgetId = null;
  form.title = '';
  form.sourceType = 'hazard';
  form.sourceId = null;
  form.applicantName = '';
  form.applyAmount = 0;
  form.purpose = '';
  form.bizDomainId = null;
  form.opTypeId = null;
  form.investCategoryId = null;
  form.objectType = 'transfer_station';
  form.objectName = '';
  form.eventType = 'hazard';
  form.eventId = null;
  form.amount = 0;
  opTypes.value = [];
  showModal.value = true;
}

async function submitCreate() {
  if (!form.title) { message.warning('请填写申请标题'); return; }
  if (!form.applyAmount || form.applyAmount <= 0) { message.warning('请填写申请金额'); return; }
  submitting.value = true;
  try {
    const payload: CostApi.CostRequestCreate = {
      budgetId: form.budgetId,
      title: form.title,
      sourceType: form.sourceType,
      sourceId: form.sourceId,
      applicantName: form.applicantName,
      applyAmount: form.applyAmount,
      purpose: form.purpose,
      allocations: [
        {
          bizDomainId: form.bizDomainId,
          opTypeId: form.opTypeId,
          investCategoryId: form.investCategoryId,
          objectType: form.objectType,
          objectName: form.objectName,
          eventType: form.eventType,
          eventId: form.eventId,
          amount: form.amount || form.applyAmount,
        },
      ],
    };
    await createCostRequest(payload);
    message.success('费用申请已创建');
    showModal.value = false;
    await loadAll();
  } catch (e) {
    message.error('创建失败');
  } finally {
    submitting.value = false;
  }
}

async function removeRequest(id: number) {
  try {
    await deleteCostRequest(id);
    message.success('已删除');
    await loadAll();
  } catch (e) {
    message.error('删除失败');
  }
}

function statusTag(status: string) {
  const map: Record<string, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
    draft: 'default',
    submitted: 'info',
    approved: 'success',
    rejected: 'error',
    closed: 'warning',
  };
  return map[status] ?? 'default';
}

const budgetRowKey = (r: CostApi.BudgetOverviewItem) => r.budgetId;
const requestRowKey = (r: CostApi.CostRequestItem) => r.id;

const budgetColumns: DataTableColumns<CostApi.BudgetOverviewItem> = [
  { title: '年度', key: 'budgetYear', width: 80 },
  { title: '项目', key: 'projectName' },
  { title: '事项', key: 'itemName' },
  { title: '预算金额', key: 'budgetAmount', render: (r) => `¥${r.budgetAmount?.toLocaleString()}` },
  { title: '已承诺', key: 'committed', render: (r) => `¥${r.committed?.toLocaleString()}` },
  { title: '实际支出', key: 'actual', render: (r) => `¥${r.actual?.toLocaleString()}` },
  { title: '余额', key: 'balance', render: (r) => `¥${r.balance?.toLocaleString()}` },
  { title: '执行率', key: 'executionRate', render: (r) => `${r.executionRate}%` },
  { title: '状态', key: 'status', render: (r) => h(NTag, null, { default: () => r.status }) },
];

const requestColumns: DataTableColumns<CostApi.CostRequestItem> = [
  { title: '单号', key: 'requestNo', width: 160 },
  { title: '标题', key: 'title' },
  { title: '来源', key: 'sourceType' },
  { title: '申请人', key: 'applicantName' },
  { title: '申请金额', key: 'applyAmount', render: (r) => `¥${r.applyAmount?.toLocaleString()}` },
  {
    title: '状态',
    key: 'status',
    render: (r) => h(NTag, { type: statusTag(r.status) }, { default: () => r.status }),
  },
  {
    title: '操作',
    key: 'actions',
    render: (r) =>
      h(
        NButton,
        { size: 'small', type: 'error', quaternary: true, onClick: () => removeRequest(r.id) },
        { default: () => '删除' },
      ),
  },
];

onMounted(() => {
  loadAll();
  loadRefs();
});
</script>

<template>
  <div class="cost-page">
    <n-h2>安全生产费用业务域</n-h2>

    <n-card title="费用统计（按实际支出归集）" :bordered="false" class="mb">
      <n-space>
        <n-statistic label="实际支出合计" :value="stats.totalActual" />
        <n-statistic
          v-for="d in stats.byDomain"
          :key="d.bizDomain"
          :label="`领域：${d.bizDomain}`"
          :value="d.amount"
        />
        <n-statistic
          v-for="c in stats.byCategory"
          :key="c.investCategory"
          :label="`类别：${c.investCategory}`"
          :value="c.amount"
        />
      </n-space>
    </n-card>

    <n-card title="预算概览（余额/执行率由交易表计算）" :bordered="false" class="mb">
      <n-data-table
        :columns="budgetColumns"
        :data="budgets"
        :loading="loading"
        :row-key="budgetRowKey"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <n-card title="费用申请（关联隐患/事故/检查等来源）" :bordered="false">
      <template #header-extra>
        <n-button type="primary" @click="openCreate">新建申请</n-button>
      </template>
      <n-data-table
        :columns="requestColumns"
        :data="requests"
        :loading="loading"
        :row-key="requestRowKey"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <n-modal v-model:show="showModal" title="新建费用申请" preset="card" style="width: 640px">
      <n-form label-placement="left" :label-width="110">
        <n-form-item label="关联预算">
          <n-select v-model:value="form.budgetId" :options="budgetOptions" clearable placeholder="可选" />
        </n-form-item>
        <n-form-item label="标题" required>
          <n-input v-model:value="form.title" placeholder="如：转运站警示标识整改费用" />
        </n-form-item>
        <n-form-item label="来源类型">
          <n-select v-model:value="form.sourceType" :options="sourceTypeOptions" />
        </n-form-item>
        <n-form-item label="来源ID">
          <n-input-number v-model:value="form.sourceId" :min="0" clearable />
        </n-form-item>
        <n-form-item label="申请人">
          <n-input v-model:value="form.applicantName" />
        </n-form-item>
        <n-form-item label="申请金额" required>
          <n-input-number v-model:value="form.applyAmount" :min="0" />
        </n-form-item>
        <n-form-item label="成本归因-领域">
          <n-select v-model:value="form.bizDomainId" :options="bizDomains" clearable placeholder="环卫/市政园林/公司层面" @update:value="onBizDomainChange" />
        </n-form-item>
        <n-form-item label="成本归因-作业类型">
          <n-select v-model:value="form.opTypeId" :options="opTypes" clearable placeholder="随领域联动" />
        </n-form-item>
        <n-form-item label="成本归因-投入类别">
          <n-select v-model:value="form.investCategoryId" :options="investCategories" clearable placeholder="隐患整改/劳保用品/..." />
        </n-form-item>
        <n-form-item label="具体对象类型">
          <n-select v-model:value="form.objectType" :options="objectTypeOptions" />
        </n-form-item>
        <n-form-item label="具体对象名称">
          <n-input v-model:value="form.objectName" placeholder="如：某转运站" />
        </n-form-item>
        <n-form-item label="关联事件类型">
          <n-input v-model:value="form.eventType" placeholder="如：hazard/accident" />
        </n-form-item>
        <n-form-item label="关联事件ID">
          <n-input-number v-model:value="form.eventId" :min="0" clearable />
        </n-form-item>
        <n-form-item label="归因金额">
          <n-input-number v-model:value="form.amount" :min="0" />
        </n-form-item>
        <n-form-item label="用途/说明">
          <n-input v-model:value="form.purpose" type="textarea" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="submitting" @click="submitCreate">提交</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.cost-page { padding: 16px; }
.mb { margin-bottom: 16px; }
</style>
