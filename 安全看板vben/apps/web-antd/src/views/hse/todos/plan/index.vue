<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import {
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  FormItem,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';

import dayjs from 'dayjs';

import {
  activateAssessmentPlan,
  createAssessmentPlan,
  deleteAssessmentPlan,
  getAssessmentPlans,
  updateAssessmentPlan,
  type AssessmentPlanApi,
} from '#/api/hse/assessment-plan';

const RangePicker = DatePicker.RangePicker;

type FreqType = AssessmentPlanApi.FreqType;
type PlanStatus = AssessmentPlanApi.PlanStatus;
type AssessmentPlan = AssessmentPlanApi.AssessmentPlan;

// ==================== 常量 ====================
const FREQ_LABEL: Record<FreqType, string> = {
  'half-month': '每半月',
  month: '每月',
  quarter: '每季度',
};

const STAT_DAY_MAP: Record<FreqType, string[]> = {
  'half-month': ['1日', '16日'],
  month: ['月末'],
  quarter: ['季度末'],
};

const STATUS_META: Record<PlanStatus, { color: string; text: string }> = {
  active: { color: 'green', text: '生效中' },
  draft: { color: 'orange', text: '草稿' },
  expired: { color: 'default', text: '已过期' },
};

const WEIGHT_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#534AB7', '#E24B4A'];

const freqOptions = [
  { label: '每半月（1日 / 16日）', value: 'half-month' },
  { label: '每月（月末）', value: 'month' },
  { label: '每季度（季度末）', value: 'quarter' },
];

// 新建表单默认考核项模板
const DEFAULT_ITEMS = [
  { itemName: '完成率', weight: 30 },
  { itemName: '及时性', weight: 20 },
  { itemName: '整改闭环', weight: 20 },
  { itemName: '台账规范', weight: 15 },
  { itemName: '培训参与', weight: 15 },
];

// 模块兜底（接口 meta 返回前先渲染）
const FALLBACK_MODULES: AssessmentPlanApi.ModuleDef[] = [
  { code: 'risk-control', name: '风险管控' },
  { code: 'hazards', name: '隐患排查' },
  { code: 'emergency', name: '应急管理' },
  { code: 'training', name: '培训管理' },
  { code: 'insurance', name: '保险管理' },
  { code: 'objectives', name: '目标职责' },
  { code: 'grid', name: '网格管理' },
  { code: 'violations', name: '三违管理' },
];

// ==================== 状态 ====================
const activeModule = ref<string>('risk-control');
const moduleDefs = ref<AssessmentPlanApi.ModuleDef[]>(FALLBACK_MODULES);
const plans = ref<AssessmentPlan[]>([]);
const loading = ref(false);

const modalVisible = ref(false);
const saving = ref(false);
const editingPlan = ref<AssessmentPlan | null>(null);

const form = reactive({
  name: '',
  period: [] as string[],
  freqType: 'half-month' as FreqType,
  statDay: '1日',
  items: [] as AssessmentPlanApi.PlanItem[],
});

// ==================== 派生 ====================
const moduleOptions = computed(() =>
  moduleDefs.value.map((m) => ({ label: m.name, value: m.code })),
);

const modulePlans = computed(() => plans.value.filter((p) => p.moduleCode === activeModule.value));

const activePlan = computed(() => modulePlans.value.find((p) => p.status === 'active'));

const moduleName = computed(
  () => moduleDefs.value.find((m) => m.code === activeModule.value)?.name ?? activeModule.value,
);

const stats = computed(() => {
  const list = modulePlans.value;
  return {
    active: list.filter((p) => p.status === 'active').length,
    draft: list.filter((p) => p.status === 'draft').length,
    expired: list.filter((p) => p.status === 'expired').length,
  };
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 下次统计日（按频率从今天推算）
const nextStat = computed(() => {
  const plan = activePlan.value;
  if (!plan) return null;
  const now = new Date();
  let d: Date;
  if (plan.freqType === 'half-month') {
    d =
      now.getDate() < 16
        ? new Date(now.getFullYear(), now.getMonth(), 16)
        : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (plan.freqType === 'month') {
    d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else {
    d = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);
  }
  const days = Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86400000));
  return { date: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, days };
});

const totalWeight = computed(() => form.items.reduce((s, i) => s + (Number(i.weight) || 0), 0));

const weightOk = computed(() => totalWeight.value === 100);

const modalTitle = computed(() => {
  if (!editingPlan.value) return '新建考核方案';
  return editingPlan.value.status === 'active'
    ? '编辑生效中方案（保存后生成新版本草稿）'
    : '编辑草稿方案';
});

const statDayOptions = computed(() =>
  STAT_DAY_MAP[form.freqType].map((d) => ({ label: d, value: d })),
);

// ==================== 数据加载 ====================
async function fetchPlans() {
  loading.value = true;
  try {
    const res = await getAssessmentPlans();
    plans.value = res?.list ?? [];
    if (res?.meta?.modules?.length) {
      moduleDefs.value = res.meta.modules;
      if (!moduleDefs.value.some((m) => m.code === activeModule.value)) {
        activeModule.value = moduleDefs.value[0].code;
      }
    }
  } catch (e) {
    console.error('[assessment-plan] fetch fail:', e);
    message.error('考核方案加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchPlans();
});

// ==================== 表格 ====================
const columns = [
  { title: '版本', key: 'version', width: 110 },
  { title: '状态', key: 'status', width: 90 },
  { title: '生效周期', key: 'period', width: 200 },
  { title: '统计频率', key: 'freq', width: 130 },
  { title: '考核权重', key: 'weights' },
  { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 140 },
  { title: '操作', key: 'action', width: 260, fixed: 'right' as const },
];

function weightSummary(p: AssessmentPlan): string {
  const parts = p.items.map((i) => `${i.itemName} ${i.weight}%`);
  if (parts.length > 3) return `${parts.slice(0, 3).join(' · ')} 等${parts.length}项`;
  return parts.join(' · ');
}

// ==================== 表单操作 ====================
function nowStr(): string {
  return dayjs().format('YYYY-MM-DD HH:mm');
}

function resetForm() {
  form.name = '';
  form.period = [];
  form.freqType = 'half-month';
  form.statDay = '1日';
  form.items = DEFAULT_ITEMS.map((i) => ({ ...i }));
}

function openCreate() {
  editingPlan.value = null;
  resetForm();
  modalVisible.value = true;
}

function openEdit(record: AssessmentPlan) {
  editingPlan.value = record;
  form.name = record.name;
  form.period = [record.periodStart, record.periodEnd];
  form.freqType = record.freqType;
  form.statDay = record.statDay;
  form.items = record.items.map((i) => ({ ...i }));
  modalVisible.value = true;
}

function onFreqChange(v: FreqType) {
  form.statDay = STAT_DAY_MAP[v][0];
}

function addItem() {
  form.items.push({ itemName: '', weight: 10 });
}

function removeItem(idx: number) {
  form.items.splice(idx, 1);
}

async function handleSave() {
  if (!form.name.trim()) {
    message.warning('请填写方案名称');
    return;
  }
  if (!form.period || form.period.length !== 2) {
    message.warning('请选择生效周期');
    return;
  }
  const items = form.items
    .filter((i) => i.itemName.trim() && Number(i.weight) > 0)
    .map((i) => ({ itemName: i.itemName.trim(), weight: Number(i.weight) }));
  if (items.length === 0) {
    message.warning('请至少添加一项考核指标');
    return;
  }
  if (totalWeight.value !== 100) {
    message.warning('考核项权重总和须等于 100%');
    return;
  }
  const payload: AssessmentPlanApi.PlanPayload = {
    moduleCode: activeModule.value,
    name: form.name.trim(),
    periodStart: form.period[0],
    periodEnd: form.period[1],
    freqType: form.freqType,
    statDay: form.statDay,
    items,
  };
  saving.value = true;
  try {
    const isCloneFromActive = editingPlan.value?.status === 'active';
    if (editingPlan.value && !isCloneFromActive) {
      await updateAssessmentPlan(editingPlan.value.id, payload);
      message.success('草稿方案已更新');
    } else {
      await createAssessmentPlan(payload);
      message.success(isCloneFromActive ? '已基于生效中方案生成新版本草稿' : '新方案已保存为草稿');
    }
    modalVisible.value = false;
    await fetchPlans();
  } catch (e) {
    console.error('[assessment-plan] save fail:', e);
    message.error('保存失败，请检查输入或稍后重试');
  } finally {
    saving.value = false;
  }
}

function activatePlan(record: AssessmentPlan) {
  Modal.confirm({
    title: '切换生效方案',
    content: `确定将「${record.name}」设为生效？当前生效方案将自动归档为历史版本。`,
    okText: '切换生效',
    cancelText: '取消',
    onOk: async () => {
      try {
        await activateAssessmentPlan(record.id);
        message.success(`「${record.name}」已切换生效，我的待办将按新节点生成任务`);
        await fetchPlans();
      } catch (e) {
        console.error('[assessment-plan] activate fail:', e);
        message.error('切换生效失败');
      }
    },
  });
}

function handleDelete(record: AssessmentPlan) {
  Modal.confirm({
    title: '删除草稿方案',
    content: `确定删除「${record.name}」？该操作不可恢复。`,
    okText: '删除',
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteAssessmentPlan(record.id);
        message.success('草稿方案已删除');
        await fetchPlans();
      } catch (e) {
        console.error('[assessment-plan] delete fail:', e);
        message.error('删除失败');
      }
    },
  });
}

function handleView(record: AssessmentPlan) {
  const weights = record.items.map((i) => `${i.itemName} ${i.weight}%`).join('、');
  Modal.info({
    title: `${record.name}（${STATUS_META[record.status].text}）`,
    content: `生效周期：${record.periodStart} ~ ${record.periodEnd}\n统计频率：${FREQ_LABEL[record.freqType]} · ${record.statDay}\n考核权重：${weights}`,
  });
}
</script>

<template>
  <Page auto-content-height class="hse-page">
    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div class="flex flex-col rounded-lg border border-border bg-card p-4">
        <span class="text-sm text-foreground/60">生效方案</span>
        <strong class="mt-1 text-2xl" style="color: #10b981">{{ stats.active }}</strong>
        <span class="mt-1 text-xs text-foreground/40">{{ moduleName }}当前考核方案</span>
      </div>
      <div class="flex flex-col rounded-lg border border-border bg-card p-4">
        <span class="text-sm text-foreground/60">草稿方案</span>
        <strong class="mt-1 text-2xl" style="color: #f59e0b">{{ stats.draft }}</strong>
        <span class="mt-1 text-xs text-foreground/40">待生效的下一周期方案</span>
      </div>
      <div class="flex flex-col rounded-lg border border-border bg-card p-4">
        <span class="text-sm text-foreground/60">历史方案</span>
        <strong class="mt-1 text-2xl" style="color: #6b7280">{{ stats.expired }}</strong>
        <span class="mt-1 text-xs text-foreground/40">可回看历史考核口径</span>
      </div>
      <div class="flex flex-col rounded-lg border border-border bg-card p-4">
        <span class="text-sm text-foreground/60">下次统计</span>
        <strong v-if="nextStat" class="mt-1 text-2xl" style="color: #378add">
          {{ nextStat.date }}<span class="ml-1 text-sm font-normal text-foreground/50">{{ nextStat.days }}天后</span>
        </strong>
        <strong v-else class="mt-1 text-2xl text-foreground/30">--</strong>
        <span class="mt-1 text-xs text-foreground/40">按生效方案频率自动推算</span>
      </div>
    </div>

    <Card :bordered="false">
      <template #title>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Segmented v-model:value="activeModule" :options="moduleOptions" />
          <Button type="primary" @click="openCreate">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            新建方案
          </Button>
        </div>
      </template>

      <!-- 当前生效方案 -->
      <div
        v-if="activePlan"
        class="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-5"
      >
        <div class="lg:col-span-2">
          <div class="flex items-center gap-2">
            <span class="text-base font-semibold">{{ activePlan.name }}</span>
            <Tag :color="STATUS_META[activePlan.status].color">{{ STATUS_META[activePlan.status].text }}</Tag>
          </div>
          <div class="mt-3 space-y-2 text-sm text-foreground/70">
            <div class="flex items-center gap-2">
              <IconifyIcon icon="lucide:calendar-range" class="size-4 text-foreground/40" />
              生效周期：{{ activePlan.periodStart }} ~ {{ activePlan.periodEnd }}
            </div>
            <div class="flex items-center gap-2">
              <IconifyIcon icon="lucide:refresh-cw" class="size-4 text-foreground/40" />
              统计频率：{{ FREQ_LABEL[activePlan.freqType] }} · {{ activePlan.statDay }}
            </div>
            <div class="flex items-center gap-2">
              <IconifyIcon icon="lucide:clock" class="size-4 text-foreground/40" />
              下次统计：<strong style="color: #378add">{{ nextStat?.date ?? '--' }}</strong>
              <span v-if="nextStat" class="text-xs text-foreground/40">（{{ nextStat.days }} 天后）</span>
            </div>
            <div class="pt-2">
              <Space>
                <Button size="small" type="primary" ghost @click="openEdit(activePlan)">
                  <template #icon><IconifyIcon icon="lucide:copy-plus" /></template>
                  编辑（生成新版本）
                </Button>
                <Button size="small" @click="handleView(activePlan)">查看</Button>
              </Space>
            </div>
          </div>
        </div>
        <div class="lg:col-span-3">
          <p class="mb-3 text-sm text-foreground/60">
            考核项权重（总和 <strong style="color: #10b981">100%</strong>，我的待办按此口径生成节点任务）
          </p>
          <div
            v-for="(item, idx) in activePlan.items"
            :key="item.itemName"
            class="mb-2 flex items-center gap-3"
          >
            <span class="w-20 shrink-0 text-sm text-foreground/80">{{ item.itemName }}</span>
            <Progress
              class="flex-1"
              :percent="item.weight"
              :stroke-color="WEIGHT_COLORS[idx % WEIGHT_COLORS.length]"
              :show-info="false"
            />
            <span class="w-12 shrink-0 text-right text-sm font-medium">{{ item.weight }}%</span>
          </div>
        </div>
      </div>
      <Empty
        v-else
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="`${moduleName}暂无生效方案，请新建方案`"
      />

      <!-- 版本时间线 -->
      <p class="mb-2 mt-4 text-sm text-foreground/60">
        方案版本（编辑生效中方案自动生成新版本，历史可回看）
      </p>
      <Table
        :columns="columns"
        :data-source="modulePlans"
        :pagination="false"
        :loading="loading"
        :row-key="(record: AssessmentPlan) => record.id"
        size="middle"
        :scroll="{ x: 980 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'version'">
            <span class="font-medium">{{ record.versionNo }}</span>
            <span class="ml-1 text-xs text-foreground/40">{{ record.name }}</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="STATUS_META[record.status].color">{{ STATUS_META[record.status].text }}</Tag>
          </template>
          <template v-else-if="column.key === 'period'">
            {{ record.periodStart }} ~ {{ record.periodEnd }}
          </template>
          <template v-else-if="column.key === 'freq'">
            {{ FREQ_LABEL[record.freqType] }} · {{ record.statDay }}
          </template>
          <template v-else-if="column.key === 'weights'">
            <span class="text-foreground/70">{{ weightSummary(record) }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="4">
              <Button type="link" size="small" @click="handleView(record)">查看</Button>
              <Button type="link" size="small" @click="openEdit(record)">编辑</Button>
              <Button
                v-if="record.status === 'draft'"
                type="link"
                size="small"
                style="color: #10b981"
                @click="activatePlan(record)"
              >
                设为生效
              </Button>
              <Button
                v-if="record.status === 'draft'"
                type="link"
                size="small"
                danger
                @click="handleDelete(record)"
              >
                删除
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <!-- 新建/编辑方案 Modal -->
    <Modal
      v-model:open="modalVisible"
      :title="modalTitle"
      width="640px"
      :confirm-loading="saving"
      :ok-button-props="{ disabled: !weightOk }"
      ok-text="保存方案"
      @ok="handleSave"
    >
      <Form layout="vertical" class="pt-2">
        <FormItem label="方案名称" required>
          <Input v-model:value="form.name" placeholder="如：2026-09考核方案" />
        </FormItem>
        <FormItem label="生效周期" required>
          <RangePicker
            v-model:value="form.period"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </FormItem>
        <FormItem label="统计频率" required>
          <Select
            v-model:value="form.freqType"
            :options="freqOptions"
            style="width: 240px"
            @change="onFreqChange"
          />
        </FormItem>
        <FormItem label="统计日" required>
          <Select v-model:value="form.statDay" :options="statDayOptions" style="width: 200px" />
        </FormItem>
        <FormItem label="考核项权重" required>
          <div v-for="(it, idx) in form.items" :key="idx" class="mb-2 flex items-center gap-2">
            <Input
              v-model:value="it.itemName"
              placeholder="考核项名称"
              style="width: 220px"
            />
            <InputNumber
              v-model:value="it.weight"
              :min="0"
              :max="100"
              :precision="0"
              addon-after="%"
              style="width: 130px"
            />
            <Button type="text" danger @click="removeItem(idx)">
              <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
            </Button>
          </div>
          <Button type="dashed" block @click="addItem">
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            添加考核项
          </Button>
          <p class="mt-2 text-sm" :style="{ color: weightOk ? '#10b981' : '#ef4444' }">
            权重总和：{{ totalWeight }}%（须等于 100% 才可保存）
          </p>
        </FormItem>
      </Form>
    </Modal>
  </Page>
</template>
