<script lang="ts" setup>
/**
 * SK-003 检查数据分析（AI-Phase-01-06 · 前端最小验证页）
 *
 * 定位：公司级标准 AI Skill SK-003 的前端入口（复用 SK-001 页面形态与请求封装）。
 *
 * 铁律（与后端 SK-003 一致）：
 * - 页面不直接调用任何模型；只调用 POST /api/company/ai/skills/SK-003/analyze（JSON），
 *   由后端 SK-003 → 权限 → 数据来源（HSE Adapter 只读 / 调用方数据）→ 字段语义映射 →
 *   确定性统计 → Evidence → Prompt Registry → AI Gateway 统一收敛。
 * - 统计数字全部来自后端 result（程序确定性计算），AI 文字（answer）仅为解读；
 *   前端不做任何二次计算，数字展示原样透传。
 * - 异常条目均含依据（basis）；无数据期为数据完整性问题，不等于检查量为 0 或检查未发生。
 * - 四区块布局：数据分析结果 / AI 分析解读 / Evidence / 执行信息（不得混为一个文本框）。
 * - 技术栈：Naive UI + HsePageLayout + #/api/request 封装（不新增 UI 组件体系）。
 */
import { computed, h, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NDatePicker,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NEmpty,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui';

import {
  analyzeCompanyInspection,
  type CompanyAiApi,
  type CompanyInspectionApi,
} from '#/api/company-ai';
import {
  HsePageLayout,
  HseStatusTag,
  type HseStatusType,
} from '#/components/hse';

defineOptions({ name: 'CompanyInspectionAnalysis' });

/* ────────────────────────────── 常量 ────────────────────────────── */

const CONFIDENCE_MAP: Record<
  CompanyAiApi.SkillConfidence,
  { type: HseStatusType; label: string }
> = {
  high: { type: 'success', label: '高置信度' },
  medium: { type: 'info', label: '中置信度' },
  low: { type: 'warning', label: '低置信度' },
};

/** 数据来源（与后端 DATA_SOURCES 对齐） */
const SOURCE_OPTIONS = [
  { value: 'hse_grid', label: 'HSE 检查记录库（只读）' },
  { value: 'inline', label: '粘贴 JSON 数据' },
];

/** 分组维度候选（通用语义键，与后端 GENERIC_FIELDS 对齐；date/metric 不参与分组） */
const DIM_OPTIONS = [
  { value: 'organization', label: '组织（片区/部门）' },
  { value: 'category', label: '类别' },
  { value: 'type', label: '类型' },
  { value: 'status', label: '状态' },
  { value: 'location', label: '地点/网格' },
  { value: 'project', label: '项目' },
  { value: 'inspector', label: '检查人' },
  { value: 'subject', label: '对象/人员' },
];

const ANOMALY_TYPE_LABEL: Record<string, string> = {
  concentration: '分布集中',
  metric_zscore: '指标离群',
  missing_periods: '无数据期（数据问题）',
  trend_drop: '趋势突降',
  trend_spike: '趋势突增',
};

const GRANULARITY_LABEL: Record<string, string> = {
  day: '按日',
  month: '按月',
  quarter: '按季',
  week: '按周',
  year: '按年',
};

const CHECK_STATUS_TYPE: Record<string, 'default' | 'success' | 'warning'> = {
  fail: 'warning',
  info: 'default',
  pass: 'success',
  warn: 'warning',
};

/* ────────────────────────────── 状态 ────────────────────────────── */

const sourceType = ref('hse_grid');
const inlineJson = ref('');
const analysisGoal = ref('');
const dateFrom = ref<null | string>(null);
const dateTo = ref<null | string>(null);
const groupDims = ref<string[]>([]);
const topN = ref<null | number>(null);
const compareMom = ref(true);
const compareYoy = ref(true);
const loading = ref(false);
const result = ref<null | Omit<CompanyInspectionApi.SkillAnalyzeResult, 'success'>>(null);
const errorInfo = ref<null | {
  code: string;
  message: string;
  retryable: boolean;
  details: null | any;
}>(null);

const confidenceTag = computed(() => {
  const c = result.value?.confidence;
  return c ? CONFIDENCE_MAP[c] : null;
});

const det = computed(() => result.value?.result ?? null);

/* ────────────────────────────── 提交 ────────────────────────────── */

async function onAnalyze() {
  if (loading.value) return;
  errorInfo.value = null;
  result.value = null;

  const params: CompanyInspectionApi.SkillAnalyzeParams = {};
  if (analysisGoal.value.trim()) params.analysis_goal = analysisGoal.value.trim();
  if (dateFrom.value || dateTo.value) {
    params.time_range = { from: dateFrom.value, to: dateTo.value };
  }
  if (groupDims.value.length > 0) params.group_by = [...groupDims.value];
  if (topN.value != null) params.top_n = topN.value;
  const compare: Array<'mom' | 'yoy'> = [];
  if (compareMom.value) compare.push('mom');
  if (compareYoy.value) compare.push('yoy');
  if (compare.length > 0 && compare.length < 2) params.compare = compare;

  if (sourceType.value === 'hse_grid') {
    params.source = { type: 'hse_grid' };
  } else {
    const text = inlineJson.value.trim();
    if (!text) {
      errorInfo.value = {
        code: 'NO_DATA',
        message: '已选择「粘贴 JSON 数据」，请粘贴结构化行数组（对象数组）。',
        retryable: false,
        details: null,
      };
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        errorInfo.value = {
          code: 'INVALID_JSON',
          message: 'JSON 必须是行数组（对象数组），例如 [{"检查日期":"2026-09-01","片区":"A乡镇",…}]。',
          retryable: false,
          details: null,
        };
        return;
      }
      params.data = parsed;
    } catch {
      errorInfo.value = {
        code: 'INVALID_JSON',
        message: 'JSON 解析失败，请检查格式。',
        retryable: false,
        details: null,
      };
      return;
    }
  }

  loading.value = true;
  try {
    result.value = await analyzeCompanyInspection(params);
  } catch (e: any) {
    errorInfo.value = {
      code: e?.code || 'AI_UNKNOWN_ERROR',
      message: e?.message || '分析请求失败，请稍后重试。',
      retryable: Boolean(e?.aiRetryable),
      details: e?.aiDetails ?? null,
    };
  } finally {
    loading.value = false;
  }
}

function onReset() {
  sourceType.value = 'hse_grid';
  inlineJson.value = '';
  analysisGoal.value = '';
  dateFrom.value = null;
  dateTo.value = null;
  groupDims.value = [];
  topN.value = null;
  compareMom.value = true;
  compareYoy.value = true;
  result.value = null;
  errorInfo.value = null;
}

/* ────────────────────────────── 展示辅助 ────────────────────────────── */

function displayText(v: null | number | string | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function pct(v: null | number | undefined): string {
  return v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1)}%`;
}

function fmtSigned(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

function fmtSignedPct(v: null | number): string {
  if (v === null || v === undefined) return '—';
  const s = (Number(v) * 100).toFixed(1);
  return Number(v) > 0 ? `+${s}%` : `${s}%`;
}

/** 映射表行（语义键 ← 原始字段） */
const mappingRows = computed(() => {
  const m = det.value?.mapping;
  if (!m) return [];
  return Object.entries(m.labels)
    .filter(([k]) => k in (m.resolved as Record<string, any>) || k === 'metric')
    .map(([k, label]) => ({
      key: k,
      label,
      source: (m.resolved as Record<string, any>)[k] ?? null,
    }));
});

const mappingColumns = [
  { title: '语义字段', key: 'label', width: 160 },
  { title: '数据源字段', key: 'source', render: (r: any) => displayText(r.source) },
];

const qualityRows = computed(() => det.value?.quality.checks ?? []);
const qualityColumns = [
  { title: '检查项', key: 'check', width: 200 },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (r: any) => {
      const type = CHECK_STATUS_TYPE[r.status] ?? 'default';
      const label = r.status === 'pass' ? '通过' : r.status === 'warn' ? '关注' : r.status;
      return h(
        NTag,
        { size: 'small', type: type === 'default' ? 'default' : type, bordered: false },
        { default: () => label },
      );
    },
  },
  { title: '说明', key: 'detail' },
];

const groupColumns = [
  { title: '取值', key: 'value', minWidth: 140 },
  { title: '记录条数', key: 'count', width: 100 },
  { title: '占比', key: 'share', width: 100, render: (r: any) => pct(r.share) },
];

const rankingColumns = [
  { title: '名次', key: 'rank', width: 70 },
  { title: '取值', key: 'value', minWidth: 140 },
  { title: '记录条数', key: 'count', width: 100 },
  { title: '占比', key: 'share', width: 100, render: (r: any) => pct(r.share) },
];

const trendColumns = computed(() => {
  const cols: any[] = [
    { title: '期间', key: 'period' },
    { title: '记录条数', key: 'count', width: 110 },
  ];
  if ((det.value?.metric_columns.length ?? 0) > 0) {
    cols.push({
      title: '指标合计',
      key: 'sums',
      render: (p: any) =>
        Object.keys(p.sums ?? {}).length > 0
          ? Object.entries(p.sums)
              .map(([k, v]) => `${k}=${v}`)
              .join('，')
          : '—',
    });
  }
  return cols;
});

const anomalyRows = computed(() => det.value?.anomalies ?? []);
const anomalyColumns = [
  {
    title: '类型',
    key: 'type',
    width: 150,
    render: (r: any) => ANOMALY_TYPE_LABEL[r.type] ?? r.type,
  },
  { title: '对象', key: 'target', width: 200 },
  { title: '数值', key: 'value', width: 90 },
  { title: '基准', key: 'baseline', width: 90 },
  {
    title: '偏离',
    key: 'deviation_pct',
    width: 100,
    render: (r: any) => (r.type === 'metric_zscore' ? `z=${fmtSigned(r.deviation_pct)}` : pct(r.deviation_pct)),
  },
  { title: '异常依据', key: 'basis', minWidth: 260 },
];

const extremeRows = computed(() => det.value?.extremes ?? []);
const extremeColumns = [
  { title: '维度', key: 'label', width: 150 },
  {
    title: '最多',
    key: 'max',
    render: (r: any) => `${r.max.value}（${r.max.count} 条）${r.max.tied ? '，并列' : ''}`,
  },
  {
    title: '最少',
    key: 'min',
    render: (r: any) => `${r.min.value}（${r.min.count} 条）${r.min.tied ? '，并列' : ''}`,
  },
];
</script>

<template>
  <HsePageLayout
    title="检查数据分析"
    description="SK-003 检查数据分析 Skill · 程序确定性统计 + AI 解读（统计数字以程序结果为准；异常均含依据，无数据期≠检查量为 0）"
  >
    <div class="flex flex-col gap-4">
      <!-- 分析输入 -->
      <NCard title="分析输入" size="small">
        <NSpace vertical :size="12">
          <div class="flex flex-wrap items-center gap-2">
            <NRadioGroup v-model:value="sourceType" size="small">
              <NRadioButton
                v-for="o in SOURCE_OPTIONS"
                :key="o.value"
                :value="o.value"
                :label="o.label"
              />
            </NRadioGroup>
          </div>

          <NInput
            v-if="sourceType === 'inline'"
            v-model:value="inlineJson"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 10 }"
            placeholder='粘贴结构化行数组（JSON）：[{"检查日期":"2026-09-01","片区":"A乡镇","检查人":"张三","类别":"日常检查",…}]。字段映射由后端同义词自动识别，也可通过 API field_mapping 显式指定。'
          />

          <NInput
            v-model:value="analysisGoal"
            type="textarea"
            :maxlength="500"
            :autosize="{ minRows: 2, maxRows: 4 }"
            show-count
            clearable
            placeholder="分析目标（可选）：例如「分析近3月各片区检查数量分布、重点检查人排名与月度趋势」"
          />

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">时间范围：</span>
            <NDatePicker
              v-model:formatted-value="dateFrom"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              size="small"
              style="width: 150px"
              placeholder="开始日期"
            />
            <span class="text-sm text-muted-foreground">至</span>
            <NDatePicker
              v-model:formatted-value="dateTo"
              type="date"
              value-format="yyyy-MM-dd"
              clearable
              size="small"
              style="width: 150px"
              placeholder="结束日期"
            />
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">分组维度：</span>
            <NSelect
              v-model:value="groupDims"
              multiple
              clearable
              size="small"
              max-tag-count="responsive"
              :options="DIM_OPTIONS"
              placeholder="不选=自动选择（最多 4 个）"
              style="min-width: 320px; max-width: 560px"
            />
            <span class="text-sm text-muted-foreground">TOP N：</span>
            <NInputNumber
              v-model:value="topN"
              size="small"
              :min="1"
              :max="50"
              style="width: 110px"
              placeholder="默认 10"
            />
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">同比环比：</span>
            <NCheckbox v-model:checked="compareMom">环比</NCheckbox>
            <NCheckbox v-model:checked="compareYoy">同比</NCheckbox>
          </div>

          <div class="flex items-center gap-2">
            <NButton type="primary" :loading="loading" @click="onAnalyze">
              开始分析
            </NButton>
            <NButton quaternary :disabled="loading" @click="onReset">
              清空
            </NButton>
          </div>

          <div class="text-xs text-muted-foreground">
            说明：总量、分组、排名、趋势、同比环比、极值、异常等统计由程序确定性计算；
            AI 仅基于统计结果做解读，不会重新计算；异常条目均附带异常依据；
            数据来源为 HSE 检查记录库时后端以只读 SELECT 取数。
          </div>
        </NSpace>
      </NCard>

      <!-- 加载状态 -->
      <NCard v-if="loading" size="small">
        <div class="flex items-center gap-3">
          <NSpin size="small" />
          <span class="text-sm text-muted-foreground">
            正在进行确定性统计（数据来源取数/映射/分组/趋势/同比环比），随后调用 AI 生成解读…
          </span>
        </div>
      </NCard>

      <!-- 错误状态 -->
      <NCard v-if="errorInfo" title="请求失败" size="small">
        <NAlert type="error" :title="`错误码：${errorInfo.code}`">
          <div class="flex flex-col gap-1">
            <span>{{ errorInfo.message }}</span>
            <span class="text-xs">
              {{ errorInfo.retryable ? '该错误可重试。' : '该错误不可重试，请核对输入或联系管理员。' }}
            </span>
          </div>
        </NAlert>
      </NCard>

      <template v-if="result && det">
        <!-- 区块 1：数据分析结果 -->
        <NCard size="small">
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <span>数据分析结果（程序确定性统计）</span>
              <NTag size="small" :bordered="false">数据：{{ displayText(det.dataset.source) }}</NTag>
            </div>
          </template>

          <NDescriptions :column="3" size="small" bordered label-placement="left">
            <NDescriptionsItem label="记录总数">{{ det.dataset.row_count }}</NDescriptionsItem>
            <NDescriptionsItem label="有效记录">{{ det.dataset.valid_rows }}</NDescriptionsItem>
            <NDescriptionsItem label="无效记录">{{ det.dataset.invalid_rows }}</NDescriptionsItem>
            <NDescriptionsItem label="时间范围外">{{ det.totals.outside_time_range }}</NDescriptionsItem>
            <NDescriptionsItem label="时间跨度">
              {{
                det.dataset.time_span
                  ? `${det.dataset.time_span.from} ~ ${det.dataset.time_span.to}（${det.dataset.time_span.days} 天）`
                  : '—'
              }}
            </NDescriptionsItem>
            <NDescriptionsItem label="统计引擎">{{ det.dataset.engine }}</NDescriptionsItem>
          </NDescriptions>

          <NDivider class="my-3" title-placement="left" style="font-size: 13px">
            字段映射（语义 ← 数据源）
          </NDivider>
          <NDataTable
            :columns="mappingColumns"
            :data="mappingRows"
            size="small"
            striped
            :max-height="260"
          />

          <NDivider class="my-3" title-placement="left" style="font-size: 13px">
            数据质量检查
          </NDivider>
          <NDataTable
            :columns="qualityColumns"
            :data="qualityRows"
            size="small"
            striped
            :max-height="320"
          />

          <template v-if="det.groups.length > 0 || det.rankings.length > 0">
            <NDivider class="my-3" title-placement="left" style="font-size: 13px">
              分组 · 排名（口径=记录条数）
            </NDivider>
            <NCollapse accordion>
              <NCollapseItem
                v-for="g in det.groups"
                :key="`g-${g.dimension}`"
                :name="`g-${g.dimension}`"
                :title="`分组：${g.label}（不同取值 ${g.distinct} 个）`"
              >
                <div v-if="g.truncated" class="text-xs text-muted-foreground">
                  取值数超过展示上限，仅显示前 {{ g.items.length }} 个。
                </div>
                <NDataTable
                  class="mt-2"
                  :columns="groupColumns"
                  :data="g.items"
                  size="small"
                  striped
                  :max-height="300"
                />
              </NCollapseItem>
              <NCollapseItem
                v-for="rk in det.rankings"
                :key="`r-${rk.dimension}`"
                :name="`r-${rk.dimension}`"
                :title="`排名：${rk.label}（TOP ${rk.top_n}，按记录条数）`"
              >
                <NDataTable
                  :columns="rankingColumns"
                  :data="rk.items"
                  size="small"
                  striped
                  :max-height="300"
                />
              </NCollapseItem>
            </NCollapse>
          </template>

          <template v-if="det.trend">
            <NDivider class="my-3" title-placement="left" style="font-size: 13px">
              时间趋势（{{ GRANULARITY_LABEL[det.trend.granularity] ?? det.trend.granularity }}）
            </NDivider>
            <div class="mb-2 text-xs text-muted-foreground">
              跨度 {{ det.trend.span?.from }} ~ {{ det.trend.span?.to }}（{{ det.trend.span?.days }} 天）；
              无效日期 {{ det.trend.invalid_dates }} 个{{ det.trend.truncated ? '；期数超上限，仅保留首尾各 6 期' : '' }}
            </div>
            <NDataTable
              :columns="trendColumns"
              :data="det.trend.points"
              size="small"
              striped
              :max-height="360"
            />
            <NAlert
              v-if="det.trend.missing_periods.length > 0"
              class="mt-2"
              type="warning"
              title="无数据期（数据完整性提示）"
            >
              <div class="text-sm">
                {{ det.trend.missing_periods.map((m) => m.period).join('、') }}
              </div>
              <div class="mt-1 text-xs">
                {{ det.trend.missing_periods[0]?.note }}——数据缺失不代表当期检查量为 0 或检查未发生，建议核实数据采集完整性。
              </div>
            </NAlert>
          </template>

          <template v-if="det.compare && (det.compare.mom || det.compare.yoy)">
            <NDivider class="my-3" title-placement="left" style="font-size: 13px">
              同比 / 环比
            </NDivider>
            <div class="flex flex-col gap-2 text-sm">
              <div v-if="det.compare.mom">
                <NTag size="small" :bordered="false" class="mr-2">环比</NTag>
                <template v-if="det.compare.mom.available">
                  <span>
                    {{ det.compare.mom.against.period }}（{{ det.compare.mom.against.count }} 条）→
                    {{ det.compare.mom.base.period }}（{{ det.compare.mom.base.count }} 条），
                    变化 {{ fmtSigned(det.compare.mom.change) }} 条（{{ fmtSignedPct(det.compare.mom.change_pct) }}）
                  </span>
                  <div class="mt-1 text-xs text-muted-foreground">依据：{{ det.compare.mom.basis }}</div>
                </template>
                <span v-else class="text-muted-foreground">不可用：{{ det.compare.mom.reason }}</span>
              </div>
              <div v-if="det.compare.yoy">
                <NTag size="small" :bordered="false" class="mr-2">同比</NTag>
                <template v-if="det.compare.yoy.available">
                  <span>
                    {{ det.compare.yoy.against.period }}（{{ det.compare.yoy.against.count }} 条）→
                    {{ det.compare.yoy.base.period }}（{{ det.compare.yoy.base.count }} 条），
                    变化 {{ fmtSigned(det.compare.yoy.change) }} 条（{{ fmtSignedPct(det.compare.yoy.change_pct) }}）
                  </span>
                  <div class="mt-1 text-xs text-muted-foreground">依据：{{ det.compare.yoy.basis }}</div>
                </template>
                <span v-else class="text-muted-foreground">不可用：{{ det.compare.yoy.reason }}</span>
              </div>
            </div>
          </template>

          <template v-if="extremeRows.length > 0">
            <NDivider class="my-3" title-placement="left" style="font-size: 13px">极值</NDivider>
            <NDataTable
              :columns="extremeColumns"
              :data="extremeRows"
              size="small"
              striped
              :max-height="240"
            />
          </template>

          <template v-if="anomalyRows.length > 0">
            <NDivider class="my-3" title-placement="left" style="font-size: 13px">
              异常识别（均含依据；仅描述数据现象，不下业务结论）
            </NDivider>
            <NDataTable
              :columns="anomalyColumns"
              :data="anomalyRows"
              size="small"
              striped
              :max-height="360"
            />
          </template>

          <template v-if="result.warnings.length > 0">
            <NDivider class="my-3" />
            <NAlert type="info" title="处理提示">
              <ul class="list-disc pl-5 text-sm">
                <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
              </ul>
            </NAlert>
          </template>
        </NCard>

        <!-- 区块 2：AI 分析解读 -->
        <NCard size="small">
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <span>AI 分析解读</span>
              <HseStatusTag
                v-if="confidenceTag"
                :type="confidenceTag.type"
                :label="confidenceTag.label"
                size="small"
              />
              <NTag v-if="!result.metadata.ai_called" size="small" :bordered="false" type="warning">
                未调用 AI
              </NTag>
            </div>
          </template>

          <div class="whitespace-pre-wrap text-sm leading-relaxed">
            {{ result.answer }}
          </div>

          <template v-if="result.suggestions.length > 0">
            <NDivider class="my-3" />
            <div class="text-sm font-medium">建议</div>
            <ul class="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              <li v-for="(s, i) in result.suggestions" :key="i">{{ s }}</li>
            </ul>
          </template>
        </NCard>

        <!-- 区块 3：Evidence -->
        <NCard size="small" title="分析依据（Evidence · 来自数据来源与确定性计算）">
          <NEmpty
            v-if="result.evidence.length === 0"
            description="无可追溯证据"
          />
          <NCollapse v-else accordion>
            <NCollapseItem
              v-for="(item, idx) in result.evidence"
              :key="idx"
              :name="idx"
              :title="`[${item.source_field || '证据'}] ${item.evidence_text.slice(0, 48)}…`"
            >
              <template #header-extra>
                <span class="text-xs text-muted-foreground">
                  强度 {{ displayText(item.evidence_strength) }}
                </span>
              </template>
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>来源类型：{{ displayText(item.source_type) }}</span>
                  <span>来源：{{ displayText(item.source_id) }}</span>
                  <span>来源域：{{ displayText(item.source_domain) }}</span>
                </div>
                <div class="rounded bg-black/5 p-3 text-sm whitespace-pre-wrap">
                  {{ item.evidence_text }}
                </div>
              </div>
            </NCollapseItem>
          </NCollapse>
        </NCard>

        <!-- 区块 4：执行信息 -->
        <NCard size="small" title="执行信息">
          <NDescriptions :column="3" size="small" bordered label-placement="left">
            <NDescriptionsItem label="Skill">
              {{ result.skill.id }} · {{ result.skill.version }}
              <NTag v-if="result.skill.status" size="tiny" :bordered="false" class="ml-1">
                {{ result.skill.status }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem label="Prompt">
              {{ result.metadata.prompt_key }} · {{ result.metadata.prompt_version }}
            </NDescriptionsItem>
            <NDescriptionsItem label="Provider / Model">
              {{ displayText(result.metadata.provider) }} /
              {{ displayText(result.metadata.model) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="总耗时">
              {{ result.metadata.duration_ms }} ms
            </NDescriptionsItem>
            <NDescriptionsItem label="AI 上下文">
              {{ result.metadata.ai_called ? `${result.metadata.ai_context_chars} 字符` : '未调用' }}
            </NDescriptionsItem>
            <NDescriptionsItem label="Token 用量">
              输入 {{ result.metadata.usage.input_tokens }} / 输出 {{ result.metadata.usage.output_tokens }}
            </NDescriptionsItem>
            <NDescriptionsItem label="数据来源">
              {{ result.metadata.source.description }}
            </NDescriptionsItem>
            <NDescriptionsItem label="取数方式">
              {{ result.metadata.source.access_mode }}
            </NDescriptionsItem>
            <NDescriptionsItem label="执行记录">
              {{
                result.metadata.record_saved
                  ? `已记录（#${displayText(result.metadata.record_id)}）`
                  : '未记录'
              }}
            </NDescriptionsItem>
            <NDescriptionsItem label="request_id" :span="2">
              {{ result.request_id }}
            </NDescriptionsItem>
            <NDescriptionsItem label="trace_id">
              {{ displayText(result.metadata.trace_id) }}
            </NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <!-- 人机边界声明 -->
        <NAlert type="default" title="使用声明">
          {{ result.metadata.disclaimer }}
        </NAlert>
      </template>
    </div>
  </HsePageLayout>
</template>
