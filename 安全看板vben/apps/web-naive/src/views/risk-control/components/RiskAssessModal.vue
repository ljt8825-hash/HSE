<script lang="ts" setup>
/**
 * 风险评估工作台弹窗（web-naive 试点 · 阶段04）
 * Naive UI 实现，功能对齐 web-antd 风险评估工作台，禁引 Ant Design。
 * 支持 LEC / LS 两种矩阵法；量表由后端 /rules/assessment-scales 下发，前端不硬编码阈值。
 * 提交经 PUT /risk-control/:id/assess，后端重算 score/level 并写版本履历。
 */
import { ref, computed, watch } from 'vue';
import {
  NButton,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NRadio,
  NRadioGroup,
  NSelect,
  NSpace,
  NText,
} from 'naive-ui';
import {
  assessRisk,
  getAssessmentScales,
  type RiskControlApi,
} from '#/api/risk-control';
import { message } from '#/adapter/naive';

const props = defineProps<{
  open: boolean;
  riskId?: number;
  riskName?: string;
  currentMethod?: string | null;
  currentScore?: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'success'): void;
}>();

const submitting = ref(false);
const scales = ref<RiskControlApi.AssessmentScalesResult | null>(null);
const method = ref<RiskControlApi.AssessMethod>('LEC');
const l = ref<number | null>(null);
const e = ref<number | null>(null);
const c = ref<number | null>(null);
const s = ref<number | null>(null);
const reviewCycle = ref<number>(0);
const assessmentDate = ref<number>(Date.now());
const remark = ref('');

const methodOptions = computed(() =>
  scales.value
    ? (['LEC', 'LS'] as RiskControlApi.AssessMethod[]).map((m) => ({
        label: scales.value!.scales[m]?.label || m,
        value: m,
      }))
    : [],
);

const reviewCycleOptions = computed(() =>
  (scales.value?.reviewCycleOptions ?? []).map((o) => ({
    label: o.label,
    value: o.value,
  })),
);

// 当前方法的量表与因子
const currentScale = computed<RiskControlApi.AssessScale | null>(() =>
  scales.value ? scales.value.scales[method.value] ?? null : null,
);

const factorOptions = (code: string): RiskControlApi.AssessFactorOption[] =>
  currentScale.value?.factors.find((f) => f.code === code)?.options ?? [];

// 因子 symbol 来自因子定义（AssessFactor.symbol），非候选项（AssessFactorOption 只有 value/label）
const factorSymbol = (code: string): string =>
  currentScale.value?.factors.find((f) => f.code === code)?.symbol || '';

// NSelect 只接受 { label, value } 结构，显式转换以匹配 SelectMixedOption
const factorSelectOptions = (code: string): { label: string; value: number }[] =>
  factorOptions(code).map((o) => ({ label: o.label, value: o.value }));

// 预览得分与等级（仅 UI 展示，最终以后端为准）
const preview = computed(() => {
  const sc = currentScale.value;
  if (!sc) return null;
  let score = 0;
  if (method.value === 'LEC') {
    if (l.value == null || e.value == null || c.value == null) return null;
    score = l.value * e.value * c.value;
  } else {
    if (l.value == null || s.value == null) return null;
    score = l.value * s.value;
  }
  const thr = (sc.thresholds ?? [])
    .slice()
    .sort((a, b) => b.min - a.min)
    .find((t) => score >= t.min);
  return { score, level: thr?.level ?? '未知', color: thr?.color ?? '#999' };
});

function formatDate(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadScales() {
  try {
    scales.value = await getAssessmentScales();
    if (props.currentMethod === 'LEC' || props.currentMethod === 'LS') {
      method.value = props.currentMethod;
    }
  } catch {
    /* 拦截器已提示 */
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      l.value = e.value = c.value = s.value = null;
      reviewCycle.value = 0;
      assessmentDate.value = Date.now();
      remark.value = '';
      loadScales();
    }
  },
);

async function handleSubmit() {
  if (!props.riskId) {
    message.warning('缺少风险点信息');
    return;
  }
  if (method.value === 'LEC') {
    if (l.value == null || e.value == null || c.value == null) {
      message.warning('请完整选择 L / E / C 因子');
      return;
    }
  } else if (l.value == null || s.value == null) {
    message.warning('请完整选择 L / S 因子');
    return;
  }

  submitting.value = true;
  try {
    const params: RiskControlApi.AssessParams = {
      method: method.value,
      l: l.value as number,
      reviewCycle: reviewCycle.value,
      assessmentDate: formatDate(assessmentDate.value),
      remark: remark.value || undefined,
    };
    if (method.value === 'LEC') {
      params.e = e.value as number;
      params.c = c.value as number;
    } else {
      params.s = s.value as number;
    }
    const res = await assessRisk(props.riskId, params);
    const lv = res.assessment?.level || '未知';
    message.success(`评估完成：得分 ${res.assessment?.score ?? '-'}，等级 ${lv}`);
    emit('update:open', false);
    emit('success');
  } catch {
    /* 拦截器已提示 */
  } finally {
    submitting.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <NModal
    v-model:show="props.open"
    :title="`风险评估工作台${riskName ? ' - ' + riskName : ''}`"
    preset="card"
    style="width: 640px; max-width: 94vw"
    :mask-closable="false"
    :bordered="false"
  >
    <NForm label-placement="top">
      <!-- 评估方法 -->
      <NFormItem label="评估方法">
        <NRadioGroup v-model:value="method" :disabled="!scales">
          <NSpace>
            <NRadio
              v-for="opt in methodOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>

      <!-- 因子 -->
      <div class="grid grid-cols-3 gap-3">
        <NFormItem :label="`${factorSymbol('l') || 'L'}（可能性）`">
          <NSelect
            v-model:value="l"
            placeholder="选择 L"
            :options="factorSelectOptions('l')"
          />
        </NFormItem>
        <template v-if="method === 'LEC'">
          <NFormItem :label="`${factorSymbol('e') || 'E'}（暴露）`">
            <NSelect
              v-model:value="e"
              placeholder="选择 E"
              :options="factorSelectOptions('e')"
            />
          </NFormItem>
          <NFormItem :label="`${factorSymbol('c') || 'C'}（后果）`">
            <NSelect
              v-model:value="c"
              placeholder="选择 C"
              :options="factorSelectOptions('c')"
            />
          </NFormItem>
        </template>
        <template v-else>
          <NFormItem :label="`${factorSymbol('s') || 'S'}（严重性）`">
            <NSelect
              v-model:value="s"
              placeholder="选择 S"
              :options="factorSelectOptions('s')"
            />
          </NFormItem>
        </template>
      </div>

      <!-- 复评周期 / 评估日期 / 备注 -->
      <div class="grid grid-cols-2 gap-3">
        <NFormItem label="复评周期">
          <NSelect
            v-model:value="reviewCycle"
            :options="reviewCycleOptions"
            placeholder="0 = 长期有效"
          />
        </NFormItem>
        <NFormItem label="评估日期">
          <NDatePicker
            v-model:value="assessmentDate"
            type="date"
            format="yyyy-MM-dd"
            style="width: 100%"
          />
        </NFormItem>
      </div>
      <NFormItem label="评估备注">
        <NInput
          v-model:value="remark"
          type="textarea"
          :rows="2"
          placeholder="选填，将写入版本履历"
        />
      </NFormItem>

      <!-- 预览 -->
      <NFormItem v-if="preview" label="评估结果预览">
        <NSpace align="center">
          <NText>得分：{{ preview.score }}</NText>
          <NText :style="{ color: preview.color, fontWeight: 600 }">
            等级：{{ preview.level }}
          </NText>
          <NText depth="3">（最终以服务端重算为准）</NText>
        </NSpace>
      </NFormItem>
    </NForm>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="handleCancel">取消</NButton>
        <NButton type="primary" :loading="submitting" @click="handleSubmit">
          提交评估
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>
