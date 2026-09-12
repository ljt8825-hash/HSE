<script lang="ts" setup>
/**
 * 考核计划（web-naive）
 * 按模块管理考核方案：版本管理、权重配置、生效切换
 */
import { computed, onMounted, reactive, ref } from 'vue';

import {
  NButton,
  NCard,
  NDatePicker,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NProgress,
  NSelect,
  NSpace,
  NSpin,
  NTabs,
  NTabPane,
  NText,
  NStatistic,
} from 'naive-ui';
import { $t } from '#/locales';

import { HseActionBar, HseDataGrid, HsePageLayout, HseStatusTag, type HseActionKey } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';
import {
  activateAssessmentPlan,
  createAssessmentPlan,
  deleteAssessmentPlan,
  getAssessmentPlans,
  updateAssessmentPlan,
  type AssessmentPlanApi,
} from '#/api/hse/assessment-plan';
import { message } from '#/adapter/naive';

defineOptions({ name: 'HseAssessmentPlan' });

type FreqType = AssessmentPlanApi.FreqType;
type PlanStatus = AssessmentPlanApi.PlanStatus;
type AssessmentPlan = AssessmentPlanApi.AssessmentPlan;

// ===================== 常量 =====================
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

const STATUS_META: Record<PlanStatus, { type: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; text: string }> = {
  active: { type: 'success', text: '生效中' },
  draft: { type: 'warning', text: '草稿' },
  expired: { type: 'neutral', text: '已过期' },
};

const WEIGHT_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#534AB7', '#E24B4A'];

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

const DEFAULT_ITEMS = [
  { itemName: '完成率', weight: 30 },
  { itemName: '及时性', weight: 20 },
  { itemName: '整改闭环', weight: 20 },
  { itemName: '台账规范', weight: 15 },
  { itemName: '培训参与', weight: 15 },
];

// ===================== 状态 =====================
const activeModule = ref<string>('risk-control');
const moduleDefs = ref<AssessmentPlanApi.ModuleDef[]>(FALLBACK_MODULES);
const plans = ref<AssessmentPlan[]>([]);
const loading = ref(false);

const modalOpen = ref(false);
const saving = ref(false);
const editingPlan = ref<AssessmentPlan | null>(null);

const form = reactive({
  name: '',
  period: null as [number, number] | null,
  freqType: 'half-month' as FreqType,
  statDay: '1日',
  items: [] as AssessmentPlanApi.PlanItem[],
});

// ===================== 派生 =====================
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

const freqOptions = [
  { label: '每半月（1日 / 16日）', value: 'half-month' },
  { label: '每月（月末）', value: 'month' },
  { label: '每季度（季度末）', value: 'quarter' },
];

// ===================== 数据加载 =====================
async function fetchPlans() {
  loading.value = true;
  try {
    const res = await getAssessmentPlans();
    plans.value = res?.list ?? [];
    if (res?.meta?.modules?.length) {
      moduleDefs.value = res.meta.modules;
      if (!moduleDefs.value.some((m) => m.code === activeModule.value) && moduleDefs.value[0]) {
        activeModule.value = moduleDefs.value[0].code;
      }
    }
  } catch {
    message.error('考核方案加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchPlans();
});

// ===================== 表格列 =====================
const columns = computed<VxeTableGridColumns>(() => [
  { title: '版本', field: 'versionNo', width: 160, align: 'left', slots: { default: 'version' } },
  { title: '状态', field: 'status', width: 100, align: 'center', slots: { default: 'status' } },
  { title: '生效周期', field: 'period', minWidth: 200, align: 'center', slots: { default: 'period' } },
  { title: '统计频率', field: 'freq', width: 150, align: 'center', slots: { default: 'freq' } },
  { title: '考核权重', field: 'weights', minWidth: 200, align: 'left', showOverflow: 'tooltip', slots: { default: 'weights' } },
  { title: '更新时间', field: 'updatedAt', width: 170, align: 'center' },
  { title: '操作', field: 'action', width: 240, align: 'center', fixed: 'right', slots: { default: 'action' } },
]);

function weightSummary(p: AssessmentPlan): string {
  const parts = p.items.map((i) => `${i.itemName} ${i.weight}%`);
  if (parts.length > 3) return `${parts.slice(0, 3).join(' · ')} 等${parts.length}项`;
  return parts.join(' · ');
}

function getStatusType(status: PlanStatus) {
  return STATUS_META[status]?.type ?? 'neutral';
}

function getStatusText(status: PlanStatus) {
  return STATUS_META[status]?.text ?? status;
}

function getFreqLabel(freq: FreqType) {
  return FREQ_LABEL[freq] ?? freq;
}

// ===================== 表单操作 =====================
function resetForm() {
  form.name = '';
  form.period = null;
  form.freqType = 'half-month';
  form.statDay = '1日';
  form.items = DEFAULT_ITEMS.map((i) => ({ ...i }));
}

function openCreate() {
  editingPlan.value = null;
  resetForm();
  modalOpen.value = true;
}

function openEdit(record: AssessmentPlan) {
  editingPlan.value = record;
  form.name = record.name;
  // Convert period dates to timestamps for NDatePicker
  if (record.periodStart && record.periodEnd) {
    form.period = [new Date(record.periodStart).getTime(), new Date(record.periodEnd).getTime()];
  } else {
    form.period = null;
  }
  form.freqType = record.freqType;
  form.statDay = record.statDay;
  form.items = record.items.map((i) => ({ ...i }));
  modalOpen.value = true;
}

function onFreqChange(v: FreqType) {
  form.statDay = STAT_DAY_MAP[v][0] ?? '1日';
}

function addItem() {
  form.items.push({ itemName: '', weight: 10 });
}

function removeItem(idx: number) {
  form.items.splice(idx, 1);
}

function tsToDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
    periodStart: tsToDateStr(form.period[0]),
    periodEnd: tsToDateStr(form.period[1]),
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
    modalOpen.value = false;
    await fetchPlans();
  } catch {
    message.error('保存失败，请检查输入或稍后重试');
  } finally {
    saving.value = false;
  }
}

async function handleActivate(record: AssessmentPlan) {
  try {
    await activateAssessmentPlan(record.id);
    message.success(`「${record.name}」已切换生效，我的待办将按新节点生成任务`);
    await fetchPlans();
  } catch {
    message.error('切换生效失败');
  }
}

async function handleDelete(record: AssessmentPlan) {
  try {
    await deleteAssessmentPlan(record.id);
    message.success('草稿方案已删除');
    await fetchPlans();
  } catch {
    message.error('删除失败');
  }
}

function handleView(record: AssessmentPlan) {
  const weights = record.items.map((i) => `${i.itemName} ${i.weight}%`).join('、');
  message.info(
    `${record.name}（${STATUS_META[record.status].text}）\n生效周期：${record.periodStart} ~ ${record.periodEnd}\n统计频率：${FREQ_LABEL[record.freqType]} · ${record.statDay}\n考核权重：${weights}`,
    { duration: 5000 },
  );
}

// ===================== 操作栏 =====================
const actionState = ref<Partial<Record<HseActionKey, { hidden?: boolean }>>>({
  downloadTemplate: { hidden: true },
  import: { hidden: true },
  export: { hidden: true },
});
</script>

<template>
  <HsePageLayout
    :description="$t('page.hse.assessmentPlanDesc')"
    :title="$t('page.hse.assessmentPlan')"
  >
    <template #extra>
      <HseActionBar :actions="actionState" @refresh="fetchPlans" @create="openCreate" />
    </template>

    <!-- 统计卡 -->
    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <NCard :bordered="false">
        <NStatistic label="生效方案" :value="stats.active" suffix="个">
          <template #suffix>
            <NText depth="3" class="text-xs ml-1">{{ moduleName }}当前考核方案</NText>
          </template>
        </NStatistic>
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="草稿方案" :value="stats.draft" suffix="个">
          <template #suffix>
            <NText depth="3" class="text-xs ml-1">待生效的下一周期方案</NText>
          </template>
        </NStatistic>
      </NCard>
      <NCard :bordered="false">
        <NStatistic label="历史方案" :value="stats.expired" suffix="个">
          <template #suffix>
            <NText depth="3" class="text-xs ml-1">可回看历史考核口径</NText>
          </template>
        </NStatistic>
      </NCard>
      <NCard :bordered="false">
        <template v-if="nextStat">
          <NStatistic label="下次统计" :value="nextStat.date">
            <template #suffix>
              <NText depth="3" class="text-xs ml-1">{{ nextStat.days }}天后</NText>
            </template>
          </NStatistic>
        </template>
        <template v-else>
          <NStatistic label="下次统计" value="--">
            <template #suffix>
              <NText depth="3" class="text-xs ml-1">按生效方案频率自动推算</NText>
            </template>
          </NStatistic>
        </template>
      </NCard>
    </div>

    <NCard :bordered="false">
      <!-- 模块切换 + 新建按钮 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <NTabs v-model:value="activeModule" type="segment">
          <NTabPane
            v-for="m in moduleDefs"
            :key="m.code"
            :name="m.code"
            :tab="m.name"
          />
        </NTabs>
        <NButton type="primary" @click="openCreate">新建方案</NButton>
      </div>

      <NSpin :show="loading">
        <!-- 当前生效方案 -->
        <div
          v-if="activePlan"
          class="mb-4 grid gap-4 rounded-lg border p-4 lg:grid-cols-5"
        >
          <div class="lg:col-span-2">
            <div class="flex items-center gap-2">
              <span class="text-base font-semibold">{{ activePlan.name }}</span>
              <HseStatusTag :type="STATUS_META[activePlan.status].type" size="small">
                {{ STATUS_META[activePlan.status].text }}
              </HseStatusTag>
            </div>
            <div class="mt-3 space-y-2 text-sm text-gray-500">
              <div class="flex items-center gap-2">
                生效周期：{{ activePlan.periodStart }} ~ {{ activePlan.periodEnd }}
              </div>
              <div class="flex items-center gap-2">
                统计频率：{{ FREQ_LABEL[activePlan.freqType] }} · {{ activePlan.statDay }}
              </div>
              <div class="flex items-center gap-2">
                下次统计：
                <strong style="color: #378add">{{ nextStat?.date ?? '--' }}</strong>
                <span v-if="nextStat" class="text-xs text-gray-400">（{{ nextStat.days }} 天后）</span>
              </div>
              <div class="pt-2">
                <NSpace>
                  <NButton size="small" type="primary" ghost @click="openEdit(activePlan)">
                    编辑（生成新版本）
                  </NButton>
                  <NButton size="small" @click="handleView(activePlan)">查看</NButton>
                </NSpace>
              </div>
            </div>
          </div>
          <div class="lg:col-span-3">
            <p class="mb-3 text-sm text-gray-500">
              考核项权重（总和 <strong style="color: #10b981">100%</strong>，我的待办按此口径生成节点任务）
            </p>
            <div
              v-for="(item, idx) in activePlan.items"
              :key="item.itemName"
              class="mb-2 flex items-center gap-3"
            >
              <span class="w-20 shrink-0 text-sm text-gray-600">{{ item.itemName }}</span>
              <NProgress
                class="flex-1"
                :percentage="item.weight"
                :color="WEIGHT_COLORS[idx % WEIGHT_COLORS.length]"
                :show-indicator="false"
                :height="8"
              />
              <span class="w-12 shrink-0 text-right text-sm font-medium">{{ item.weight }}%</span>
            </div>
          </div>
        </div>
        <NEmpty
          v-else
          :description="`${moduleName}暂无生效方案，请新建方案`"
          class="py-6"
        />

        <!-- 版本表格 -->
        <p class="mb-2 mt-4 text-sm text-gray-500">
          方案版本（编辑生效中方案自动生成新版本，历史可回看）
        </p>
        <HseDataGrid
          :columns="columns"
          :data="modulePlans"
          :loading="loading"
          :pager="false"
        >
          <template #version="{ row }">
            <span class="font-medium">{{ row.versionNo }}</span>
            <NText depth="3" class="text-xs ml-1">{{ row.name }}</NText>
          </template>
          <template #status="{ row }">
            <HseStatusTag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </HseStatusTag>
          </template>
          <template #period="{ row }">
            {{ row.periodStart }} ~ {{ row.periodEnd }}
          </template>
          <template #freq="{ row }">
            {{ getFreqLabel(row.freqType) }} · {{ row.statDay }}
          </template>
          <template #weights="{ row }">
            <span class="text-gray-500">{{ weightSummary(row) }}</span>
          </template>
          <template #action="{ row }">
            <NSpace justify="center">
              <NButton size="small" type="primary" quaternary @click="handleView(row)">查看</NButton>
              <NButton size="small" type="primary" quaternary @click="openEdit(row)">编辑</NButton>
              <NPopconfirm v-if="row.status === 'draft'" @positive-click="handleDelete(row)">
                <template #trigger>
                  <NButton size="small" type="error" quaternary>删除</NButton>
                </template>
                确定删除该草稿方案吗？
              </NPopconfirm>
              <NButton
                v-if="row.status === 'draft'"
                size="small"
                type="success"
                quaternary
                @click="handleActivate(row)"
              >
                生效
              </NButton>
            </NSpace>
          </template>
        </HseDataGrid>
      </NSpin>
    </NCard>

    <!-- 新建/编辑弹窗 -->
    <NModal
      v-model:show="modalOpen"
      :title="modalTitle"
      preset="card"
      style="width: 640px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="top">
        <NFormItem label="方案名称" required>
          <NInput v-model:value="form.name" placeholder="如：2026-09考核方案" />
        </NFormItem>
        <NFormItem label="生效周期" required>
          <NDatePicker
            v-model:value="form.period"
            type="daterange"
            value-format="yyyy-MM-dd"
            style="width: 100%"
          />
        </NFormItem>
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="统计频率" required>
            <NSelect
              v-model:value="form.freqType"
              :options="freqOptions"
              @update:value="(v: any) => onFreqChange(v as FreqType)"
            />
          </NFormItem>
          <NFormItem label="统计日" required>
            <NSelect v-model:value="form.statDay" :options="statDayOptions" />
          </NFormItem>
        </div>
        <NFormItem label="考核项权重" required>
          <div v-for="(it, idx) in form.items" :key="idx" class="mb-2 flex items-center gap-2">
            <NInput
              v-model:value="it.itemName"
              placeholder="考核项名称"
              style="width: 220px"
            />
            <NInputNumber
              v-model:value="it.weight"
              :min="0"
              :max="100"
              :precision="0"
              style="width: 130px"
            >
              <template #suffix>%</template>
            </NInputNumber>
            <NButton size="small" type="error" quaternary @click="removeItem(idx)">删除</NButton>
          </div>
          <NButton type="default" dashed block @click="addItem">添加考核项</NButton>
          <p class="mt-2 text-sm" :style="{ color: weightOk ? '#10b981' : '#ef4444' }">
            权重总和：{{ totalWeight }}%（须等于 100% 才可保存）
          </p>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="modalOpen = false">取消</NButton>
          <NButton type="primary" :loading="saving" :disabled="!weightOk" @click="handleSave">
            保存方案
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </HsePageLayout>
</template>
