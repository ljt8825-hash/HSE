<script lang="ts" setup>
/**
 * SK-001 Excel 数据分析（AI-Phase-01-04 · 前端最小验证页）
 *
 * 定位：公司级标准 AI Skill SK-001 的前端入口（复用 SK-005 页面形态与请求封装）。
 *
 * 铁律（与后端 SK-001 一致）：
 * - 页面不直接调用任何模型；只调用 POST /api/company/ai/skills/SK-001/analyze（multipart），
 *   由后端 SK-001 → 权限 → 确定性解析/统计 → Evidence → Prompt Registry → AI Gateway 统一收敛。
 * - 统计数字全部来自后端 result（程序确定性计算），AI 文字（answer）仅为解读；
 *   前端不做任何二次计算，数字展示原样透传。
 * - Evidence 为 aiEvidenceService 产物（来源于上传文件与确定性计算结果），字段缺失显示「—」。
 * - 技术栈：Naive UI + HsePageLayout + #/api/request 封装（不新增 UI 组件体系）。
 */
import { computed, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NEmpty,
  NInput,
  NSpace,
  NSpin,
  NTag,
  NUpload,
  type UploadFileInfo,
} from 'naive-ui';

import {
  analyzeCompanyExcel,
  type CompanyAiApi,
  type CompanyExcelApi,
} from '#/api/company-ai';
import {
  HsePageLayout,
  HseStatusTag,
  type HseStatusType,
} from '#/components/hse';

defineOptions({ name: 'CompanyExcelAnalysis' });

/* ────────────────────────────── 常量 ────────────────────────────── */

const CONFIDENCE_MAP: Record<
  CompanyAiApi.SkillConfidence,
  { type: HseStatusType; label: string }
> = {
  high: { type: 'success', label: '高置信度' },
  medium: { type: 'info', label: '中置信度' },
  low: { type: 'warning', label: '低置信度' },
};

const ACCEPT_EXTS = '.xlsx,.xls,.xlsm,.csv';

const TYPE_LABEL: Record<string, string> = {
  number: '数值',
  date: '日期',
  string: '文本',
  mixed: '混合',
};

/* ────────────────────────────── 状态 ────────────────────────────── */

const fileList = ref<UploadFileInfo[]>([]);
const analysisGoal = ref('');
const sheetName = ref('');
const loading = ref(false);
const result = ref<null | Omit<CompanyExcelApi.SkillAnalyzeResult, 'success'>>(null);
const errorInfo = ref<null | {
  code: string;
  message: string;
  retryable: boolean;
  details: null | any;
}>(null);

const selectedFile = computed(
  () => fileList.value.find((f) => f.file instanceof File)?.file as null | File,
);

const confidenceTag = computed(() => {
  const c = result.value?.confidence;
  return c ? CONFIDENCE_MAP[c] : null;
});

const dataset = computed(() => result.value?.result?.dataset);
const quality = computed(() => result.value?.result?.quality);

/** 列与质量表 */
const columnRows = computed(() => result.value?.result?.columns ?? []);
const columnColumns = [
  { title: '列名', key: 'name', minWidth: 120 },
  {
    title: '类型',
    key: 'type',
    width: 80,
    render: (row: any) => TYPE_LABEL[row.type] ?? row.type,
  },
  { title: '非空', key: 'non_empty', width: 70 },
  { title: '空值', key: 'empty', width: 70 },
  {
    title: '空值率',
    key: 'empty_rate',
    width: 90,
    render: (row: any) => `${(Number(row.empty_rate) * 100).toFixed(1)}%`,
  },
  {
    title: '类型异常',
    key: 'invalid',
    width: 90,
    render: (row: any) => (row.invalid > 0 ? String(row.invalid) : '—'),
  },
];

/** 数值统计表 */
const statRows = computed(() => result.value?.result?.statistics ?? []);
const statColumns = [
  { title: '数值列', key: 'column', minWidth: 120 },
  { title: '有效数', key: 'count', width: 80 },
  { title: '空/异常', key: 'empty_or_invalid', width: 90, render: (r: any) => (r.empty_or_invalid > 0 ? String(r.empty_or_invalid) : '—') },
  { title: '总和', key: 'sum' },
  { title: '均值', key: 'mean', render: (r: any) => fmtNum(r.mean) },
  { title: '最小', key: 'min', render: (r: any) => fmtNum(r.min) },
  { title: '最大', key: 'max', render: (r: any) => fmtNum(r.max) },
];

/* ────────────────────────────── 提交 ────────────────────────────── */

async function onAnalyze() {
  if (loading.value) return;
  errorInfo.value = null;
  result.value = null;

  if (!selectedFile.value) {
    errorInfo.value = {
      code: 'NO_FILE',
      message: '请先选择要分析的 Excel/CSV 文件。',
      retryable: false,
      details: null,
    };
    return;
  }

  const form = new FormData();
  form.append('file', selectedFile.value);
  if (analysisGoal.value.trim()) form.append('analysis_goal', analysisGoal.value.trim());
  if (sheetName.value.trim()) form.append('sheet_name', sheetName.value.trim());

  loading.value = true;
  try {
    result.value = await analyzeCompanyExcel(form);
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
  fileList.value = [];
  analysisGoal.value = '';
  sheetName.value = '';
  result.value = null;
  errorInfo.value = null;
}

/* ────────────────────────────── 展示辅助 ────────────────────────────── */

function displayText(v: null | number | string | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function fmtNum(v: null | number | undefined): string {
  return v === null || v === undefined ? '—' : String(v);
}

function pct(v: number): string {
  return `${(Number(v) * 100).toFixed(1)}%`;
}
</script>

<template>
  <HsePageLayout
    title="Excel 数据分析"
    description="SK-001 Excel 数据分析 Skill · 程序确定性统计 + AI 解读（统计数字以程序结果为准）"
  >
    <div class="flex flex-col gap-4">
      <!-- 上传与目标 -->
      <NCard title="上传与分析目标" size="small">
        <NSpace vertical :size="12">
          <NUpload
            v-model:file-list="fileList"
            :max="1"
            :default-upload="false"
            accept=".xlsx,.xls,.xlsm,.csv"
            name="file"
          >
            <NButton>选择文件（.xlsx / .xls / .xlsm / .csv，≤20MB）</NButton>
          </NUpload>

          <NInput
            v-model:value="analysisGoal"
            type="textarea"
            :maxlength="500"
            :autosize="{ minRows: 2, maxRows: 4 }"
            show-count
            clearable
            placeholder="分析目标（可选）：例如「分析9月各乡镇检查数量分布与重点人员」"
          />

          <NInput
            v-model:value="sheetName"
            clearable
            placeholder="工作表名（可选）：默认取第一个非空工作表"
            style="max-width: 320px"
          />

          <div class="flex items-center gap-2">
            <NButton type="primary" :loading="loading" @click="onAnalyze">
              开始分析
            </NButton>
            <NButton quaternary :disabled="loading" @click="onReset">
              清空
            </NButton>
          </div>

          <div class="text-xs text-muted-foreground">
            说明：总数、均值、分组、排名、趋势等统计由程序确定性计算；AI 仅基于统计结果做解读，不会重新计算。
          </div>
        </NSpace>
      </NCard>

      <!-- 加载状态 -->
      <NCard v-if="loading" size="small">
        <div class="flex items-center gap-3">
          <NSpin size="small" />
          <span class="text-sm text-muted-foreground">
            正在解析文件并进行确定性统计，随后调用 AI 生成解读…
          </span>
        </div>
      </NCard>

      <!-- 错误状态 -->
      <NCard v-if="errorInfo" title="请求失败" size="small">
        <NAlert type="error" :title="`错误码：${errorInfo.code}`">
          <div class="flex flex-col gap-1">
            <span>{{ errorInfo.message }}</span>
            <span class="text-xs">
              {{ errorInfo.retryable ? '该错误可重试。' : '该错误不可重试，请核对文件或联系管理员。' }}
            </span>
          </div>
        </NAlert>
      </NCard>

      <!-- 结果区 -->
      <template v-if="result && dataset">
        <!-- 数据概况 -->
        <NCard size="small" title="数据概况">
          <NDescriptions :column="3" size="small" bordered label-placement="left">
            <NDescriptionsItem label="文件">{{ dataset.file_name }}</NDescriptionsItem>
            <NDescriptionsItem label="工作表">
              {{ dataset.sheet_name }}（共 {{ dataset.sheet_count }} 个）
            </NDescriptionsItem>
            <NDescriptionsItem label="规模">
              {{ dataset.row_count }} 行 × {{ dataset.column_count }} 列
            </NDescriptionsItem>
            <NDescriptionsItem label="空单元格">
              {{ quality?.empty_cells }}（{{ pct(quality?.empty_rate ?? 0) }}）
            </NDescriptionsItem>
            <NDescriptionsItem label="重复行">{{ displayText(quality?.duplicate_rows) }}</NDescriptionsItem>
            <NDescriptionsItem label="解析时间">{{ dataset.parsed_at }}</NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <!-- 列与质量 -->
        <NCard size="small" title="列识别与数据质量">
          <NDataTable
            :columns="columnColumns"
            :data="columnRows"
            :max-height="300"
            size="small"
            striped
          />
        </NCard>

        <!-- 数值统计 -->
        <NCard v-if="statRows.length > 0" size="small" title="数值统计（确定性计算）">
          <NDataTable :columns="statColumns" :data="statRows" size="small" striped />
        </NCard>

        <!-- 分组 / 排名 / 趋势 / 异常 -->
        <NCard
          v-if="
            (result.result.group_by?.length ?? 0) > 0 ||
            (result.result.ranking?.length ?? 0) > 0 ||
            (result.result.trend?.length ?? 0) > 0 ||
            (result.result.anomalies?.zscore?.length ?? 0) > 0
          "
          size="small"
          title="分组 · 排名 · 趋势 · 异常"
        >
          <NCollapse accordion>
            <NCollapseItem
              v-for="g in result.result.group_by"
              :key="`g-${g.column}`"
              :name="`g-${g.column}`"
              :title="`分组统计：${g.column}`"
            >
              <div class="text-xs text-muted-foreground">
                不同取值 {{ g.distinct }} 个{{ g.truncated ? '（仅展示前 10）' : '' }}
              </div>
              <NDataTable
                class="mt-2"
                size="small"
                striped
                :columns="[
                  { title: '取值', key: 'value' },
                  { title: '记录数', key: 'count', width: 100 },
                  { title: '占比', key: 'share', width: 100, render: (r: any) => pct(r.share) },
                ]"
                :data="g.items"
                :max-height="280"
              />
            </NCollapseItem>
            <NCollapseItem
              v-for="r in result.result.ranking"
              :key="`r-${r.by}-${r.of}`"
              :name="`r-${r.by}-${r.of}`"
              :title="`排名：按「${r.of}」的「${r.by}」合计`"
            >
              <div class="text-xs text-muted-foreground">{{ r.note }}</div>
              <NDataTable
                class="mt-2"
                size="small"
                striped
                :columns="[
                  { title: '名称', key: 'value' },
                  { title: '合计', key: 'sum', render: (x: any) => fmtNum(x.sum) },
                  { title: '均值', key: 'mean', render: (x: any) => fmtNum(x.mean) },
                  { title: '记录数', key: 'count', width: 90 },
                ]"
                :data="r.items"
                :max-height="280"
              />
            </NCollapseItem>
            <NCollapseItem
              v-for="t in result.result.trend"
              :key="`t-${t.column}`"
              :name="`t-${t.column}`"
              :title="`趋势：${t.column}（${t.granularity === 'day' ? '按日' : '按月'}）`"
            >
              <div class="text-xs text-muted-foreground">
                跨度 {{ t.span.from }} ~ {{ t.span.to }}（{{ t.span.days }} 天）；无效日期
                {{ t.invalid_dates }} 个
              </div>
              <NDataTable
                class="mt-2"
                size="small"
                striped
                :columns="[
                  { title: '期间', key: 'period' },
                  { title: '记录数', key: 'count', width: 100 },
                  {
                    title: '数值合计',
                    key: 'sums',
                    render: (p: any) =>
                      Object.keys(p.sums ?? {}).length > 0
                        ? Object.entries(p.sums).map(([k, v]) => `${k}=${v}`).join('，')
                        : '—',
                  },
                ]"
                :data="t.points"
                :max-height="320"
              />
            </NCollapseItem>
            <NCollapseItem
              v-if="(result.result.anomalies?.zscore?.length ?? 0) > 0"
              name="anomaly"
              title="数值异常（z-score |z|≥3）"
            >
              <NDataTable
                size="small"
                striped
                :columns="[
                  { title: '列', key: 'column' },
                  { title: '数据行号', key: 'row', width: 100 },
                  { title: '值', key: 'value' },
                  { title: 'z', key: 'z' },
                ]"
                :data="result.result.anomalies.zscore"
                :max-height="280"
              />
            </NCollapseItem>
          </NCollapse>
        </NCard>

        <!-- AI 分析 -->
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

          <template v-if="result.warnings.length > 0">
            <NDivider class="my-3" />
            <NAlert type="info" title="提示">
              <ul class="list-disc pl-5 text-sm">
                <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
              </ul>
            </NAlert>
          </template>

          <!-- 执行元信息 -->
          <NDivider class="my-3" />
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
            <NDescriptionsItem label="执行记录">
              {{
                result.metadata.record_saved
                  ? `已记录（#${displayText(result.metadata.record_id)}）`
                  : '未记录'
              }}
            </NDescriptionsItem>
            <NDescriptionsItem label="request_id" :span="3">
              {{ result.request_id }}
            </NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <!-- Evidence -->
        <NCard size="small" title="分析依据（Evidence · 来自上传文件与确定性计算）">
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

        <!-- 人机边界声明 -->
        <NAlert type="default" title="使用声明">
          {{ result.metadata.disclaimer }}
        </NAlert>
      </template>
    </div>
  </HsePageLayout>
</template>
