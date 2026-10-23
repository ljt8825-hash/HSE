<script lang="ts" setup>
/**
 * SK-004 报告生成（AI-Phase-01-07 · 前端最小验证页）
 *
 * 定位：公司级标准 AI Skill SK-004 的前端入口（复用 SK-003 页面形态与请求封装）。
 *
 * 铁律（与后端 SK-004 一致）：
 * - 页面不直接调用任何模型；只调用 POST /api/company/ai/skills/SK-004/generate（JSON），
 *   由后端 SK-004 → 权限 → 事实锁定 → 章节规划 → 确定性表格 → Prompt Registry →
 *   AI Gateway → 事实一致性检查统一收敛。
 * - 「事实先于文字」：确定性表格由后端程序从 facts/analysis 直接组装，AI 只写文字、不得改数；
 *   页面不做任何二次计算，数字展示原样透传。
 * - 报告正文与事实分离（§三十八）：四区块展示 报告配置 / 数据来源 / 报告预览 / 事实与Evidence，
 *   领导审核时可以看到「这句话从哪里来」（facts.used/unresolved + evidence + consistency）。
 * - 技术栈：Naive UI + HsePageLayout + #/api/request 封装（不新增 UI 组件体系 / Office 依赖）。
 */
import { computed, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui';

import {
  generateCompanyReport,
  type CompanyAiApi,
  type CompanyReportApi,
} from '#/api/company-ai';
import {
  HsePageLayout,
  HseStatusTag,
  type HseStatusType,
} from '#/components/hse';

defineOptions({ name: 'CompanyReportGenerate' });

/* ────────────────────────────── 常量 ────────────────────────────── */

const CONFIDENCE_MAP: Record<
  CompanyAiApi.SkillConfidence,
  { type: HseStatusType; label: string }
> = {
  high: { type: 'success', label: '高置信度' },
  medium: { type: 'info', label: '中置信度' },
  low: { type: 'warning', label: '低置信度' },
};

const REPORT_TYPE_OPTIONS = [
  { value: 'inspection_monthly', label: '检查月度分析' },
  { value: 'inspection_summary', label: '检查工作总结' },
  { value: 'business_analysis', label: '业务分析' },
  { value: 'management_report', label: '管理汇报' },
  { value: 'custom', label: '自定义报告' },
];

const FORMALITY_OPTIONS = [
  { value: '', label: '默认（正式、客观）' },
  { value: '正式汇报', label: '正式汇报' },
  { value: '简明扼要', label: '简明扼要' },
  { value: '技术说明', label: '技术说明' },
];

const CONSISTENCY_MAP: Record<string, { type: HseStatusType; label: string }> = {
  pass: { type: 'success', label: '一致性通过' },
  failed: { type: 'warning', label: '存在不一致（需人工审核）' },
  degraded: { type: 'warning', label: '结构降级（需人工整理）' },
  not_applicable: { type: 'info', label: '未触发（无有效数据）' },
};

/* ────────────────────────────── 状态 ────────────────────────────── */

// 报告配置
const reportType = ref<string>('inspection_monthly');
const reportTitle = ref('');
const reportGoal = ref('');
const sectionMode = ref<'auto' | 'custom'>('auto');
const customSections = ref('');
const templateJson = ref('');
const requireCitation = ref(true);
const formality = ref('');

// 数据来源（可选，JSON）
const analysisJson = ref('');
const factsJson = ref('');
const documentJson = ref('');
const evidenceJson = ref('');

const loading = ref(false);
const result =
  ref<null | Omit<CompanyReportApi.SkillGenerateResult, 'success'>>(null);
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
const consistencyTag = computed(() => {
  const s = result.value?.metadata?.consistency_status;
  return s ? CONSISTENCY_MAP[s] || null : null;
});
const report = computed(() => result.value?.report ?? null);

/* ────────────────────────────── JSON 输入解析 ────────────────────────────── */

function parseJsonField(
  text: string,
  label: string,
  expect: 'array' | 'object',
  errors: string[],
): null | any {
  const t = text.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t);
    if (expect === 'array' && !Array.isArray(v)) {
      errors.push(`${label} 必须是 JSON 数组`);
      return null;
    }
    if (expect === 'object' && (Array.isArray(v) || typeof v !== 'object')) {
      errors.push(`${label} 必须是 JSON 对象`);
      return null;
    }
    return v;
  } catch {
    errors.push(`${label} JSON 解析失败`);
    return null;
  }
}

/* ────────────────────────────── 提交 ────────────────────────────── */

async function onGenerate() {
  if (loading.value) return;
  errorInfo.value = null;
  result.value = null;

  const errors: string[] = [];
  const params: CompanyReportApi.SkillGenerateParams = {};
  params.report_type = reportType.value as CompanyReportApi.ReportType;
  if (reportTitle.value.trim()) params.title = reportTitle.value.trim();
  if (reportGoal.value.trim()) params.report_goal = reportGoal.value.trim();
  params.require_citation = requireCitation.value;

  const analysis = parseJsonField(analysisJson.value, '分析结果', 'object', errors);
  if (analysis) params.analysis = analysis;
  const facts = parseJsonField(factsJson.value, '事实 facts', 'object', errors);
  if (facts) params.facts = facts;
  const document = parseJsonField(documentJson.value, '参考文档', 'object', errors);
  if (document) params.document = document;
  const evidence = parseJsonField(evidenceJson.value, 'Evidence', 'array', errors);
  if (evidence) params.evidence = evidence;

  if (sectionMode.value === 'custom') {
    const lines = customSections.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 0) params.sections = lines;
  }
  const tpl = parseJsonField(templateJson.value, '报告模板', 'object', errors);
  if (tpl) params.template = tpl;

  const style: Record<string, string> = {};
  if (formality.value) style.formality = formality.value;
  if (Object.keys(style).length > 0) params.style = style;

  if (errors.length > 0) {
    errorInfo.value = {
      code: 'INVALID_INPUT',
      message: errors.join('；'),
      retryable: false,
      details: null,
    };
    return;
  }
  if (!params.analysis && !params.facts && !params.document && !params.evidence) {
    errorInfo.value = {
      code: 'NO_SOURCE',
      message:
        '报告需要至少一个内容来源：分析结果（analysis）/ 事实（facts）/ 参考文档（document）/ Evidence，请至少填写一项。',
      retryable: false,
      details: null,
    };
    return;
  }

  loading.value = true;
  try {
    result.value = await generateCompanyReport(params);
  } catch (e: any) {
    errorInfo.value = {
      code: e?.code || 'AI_UNKNOWN_ERROR',
      message: e?.message || '报告生成请求失败，请稍后重试。',
      retryable: Boolean(e?.aiRetryable),
      details: e?.aiDetails ?? null,
    };
  } finally {
    loading.value = false;
  }
}

function onReset() {
  reportTitle.value = '';
  reportGoal.value = '';
  customSections.value = '';
  templateJson.value = '';
  analysisJson.value = '';
  factsJson.value = '';
  documentJson.value = '';
  evidenceJson.value = '';
  formality.value = '';
  sectionMode.value = 'auto';
  requireCitation.value = true;
  result.value = null;
  errorInfo.value = null;
}

/* ────────────────────────────── 表格 / 导出 ────────────────────────────── */

function tableColumns(t: CompanyReportApi.SectionTable) {
  return t.columns.map((c, i) => ({ key: `c${i}`, title: c }));
}
function tableData(t: CompanyReportApi.SectionTable) {
  return t.rows.map((row) => {
    const o: Record<string, any> = {};
    row.forEach((v, i) => {
      o[`c${i}`] = v;
    });
    return o;
  });
}

/** 结构化报告 → Markdown（可复制/导出基础能力，§三十九：不做 Word/PDF 排版系统） */
function buildMarkdown(): string {
  const r = report.value;
  if (!r) return '';
  const lines: string[] = [`# ${r.title}`, ''];
  if (r.summary) lines.push(r.summary, '');
  for (const s of r.sections) {
    lines.push(`## ${s.title}`, '');
    if (s.content) lines.push(s.content, '');
    for (const t of s.tables) {
      lines.push(`**${t.title}**`, '');
      lines.push(`| ${t.columns.join(' | ')} |`);
      lines.push(`| ${t.columns.map(() => '---').join(' | ')} |`);
      for (const row of t.rows) {
        lines.push(`| ${row.join(' | ')} |`);
      }
      lines.push('');
    }
    if (s.evidence_ids.length > 0) {
      lines.push(`> 证据引用：${s.evidence_ids.join('、')}`, '');
    }
  }
  if (result.value?.suggestions?.length) {
    lines.push('## 建议', '');
    for (const s of result.value.suggestions) lines.push(`- ${s}`);
    lines.push('');
  }
  if (r.disclaimer) lines.push('---', '', `*${r.disclaimer}*`);
  return lines.join('\n');
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(buildMarkdown());
    window.$message?.success('报告全文已复制到剪贴板');
  } catch {
    window.$message?.error('复制失败，请手动选择文本复制');
  }
}

function onDownload() {
  const blob = new Blob([buildMarkdown()], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.value?.title || '报告'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <HsePageLayout
    title="报告生成"
    description="SK-004 报告生成 Skill · 事实先于文字（确定性表格由程序组装，AI 只写文字；报告正文与事实依据分离展示，发布前必须人工审核）"
  >
    <div class="flex flex-col gap-4">
      <!-- 区块一：报告配置 -->
      <NCard title="报告配置" size="small">
        <NSpace vertical :size="12">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">报告类型：</span>
            <NSelect
              v-model:value="reportType"
              size="small"
              :options="REPORT_TYPE_OPTIONS"
              style="width: 220px"
            />
            <span class="text-sm text-muted-foreground">正式程度：</span>
            <NSelect
              v-model:value="formality"
              size="small"
              :options="FORMALITY_OPTIONS"
              style="width: 200px"
            />
            <NCheckbox v-model:checked="requireCitation">
              要求 Evidence 引用
            </NCheckbox>
          </div>

          <NInput
            v-model:value="reportTitle"
            clearable
            :maxlength="200"
            placeholder="报告标题（可选）：例如「2026年9月份检查情况分析报告」；不填按报告类型自动命名"
          />

          <NInput
            v-model:value="reportGoal"
            type="textarea"
            :maxlength="500"
            :autosize="{ minRows: 2, maxRows: 4 }"
            show-count
            clearable
            placeholder="报告生成目标（可选）：例如「分析9月份检查情况、识别主要变化、总结重点问题、提出下一步核查建议」"
          />

          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-muted-foreground">章节规划：</span>
            <NRadioGroup v-model:value="sectionMode" size="small">
              <NRadioButton value="auto">按报告类型自动</NRadioButton>
              <NRadioButton value="custom">自定义章节</NRadioButton>
            </NRadioGroup>
          </div>

          <NInput
            v-if="sectionMode === 'custom'"
            v-model:value="customSections"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            placeholder="自定义章节：每行一个章节标题，按输入顺序生成（最多 20 个）。例如：&#10;总体情况&#10;重点问题&#10;整改情况&#10;下一步工作"
          />

          <NCollapse>
            <NCollapseItem title="报告模板（可选，JSON：{template_key, version, sections}）" name="tpl">
              <NInput
                v-model:value="templateJson"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 8 }"
                placeholder='{"template_key":"inspection_monthly","version":"v1.0.0","sections":["overview","trend","ranking","problems","suggestions"]}'
              />
            </NCollapseItem>
          </NCollapse>

          <div class="flex items-center gap-2">
            <NButton type="primary" :loading="loading" @click="onGenerate">
              生成报告
            </NButton>
            <NButton quaternary :disabled="loading" @click="onReset">
              清空
            </NButton>
          </div>

          <div class="text-xs text-muted-foreground">
            说明：确定性表格由后端程序从事实/分析结果直接组装，AI 只撰写文字、不得修改任何数字；
            数字/时间/维度一致性由后端双层检查（生成前事实锁定 + 生成后一致性校验），
            不一致会自动重试并在「事实与 Evidence」区标注，发布前必须人工审核。
          </div>
        </NSpace>
      </NCard>

      <!-- 区块二：数据来源 -->
      <NCard title="数据来源（至少填写一项；JSON 格式）" size="small">
        <NSpace vertical :size="8">
          <NCollapse>
            <NCollapseItem name="analysis">
              <template #header>
                分析结果 analysis
                <NTag size="small" type="info" :bordered="false" class="ml-2">
                  可直接粘贴 SK-003「检查数据分析」返回的 result
                </NTag>
              </template>
              <NInput
                v-model:value="analysisJson"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 12 }"
                placeholder='SK-003 analyze 返回的 result（对象），或任意确定性分析结果（含 dataset/totals/groups/rankings/trend/compare/anomalies 等字段）'
              />
            </NCollapseItem>
            <NCollapseItem name="facts">
              <template #header>
                确定性事实 facts
                <NTag size="small" :bordered="false" class="ml-2">
                  如 {"total":172,"valid":170,"invalid":2}
                </NTag>
              </template>
              <NInput
                v-model:value="factsJson"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 10 }"
                placeholder='{"total":172,"valid":170,"invalid":2}'
              />
            </NCollapseItem>
            <NCollapseItem name="document">
              <template #header>
                参考文档 document
                <NTag size="small" :bordered="false" class="ml-2">
                  SK-002「文档解析」返回结果（制度/会议材料/历史报告）
                </NTag>
              </template>
              <NInput
                v-model:value="documentJson"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 10 }"
                placeholder="SK-002 parse 返回结果（对象）；后端会做摘要裁剪后供 AI 参考"
              />
            </NCollapseItem>
            <NCollapseItem name="evidence">
              <template #header>
                Evidence
                <NTag size="small" :bordered="false" class="ml-2">
                  aiEvidenceService 产物数组（不传时后端自动登记素材来源）
                </NTag>
              </template>
              <NInput
                v-model:value="evidenceJson"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 10 }"
                placeholder='[{"source_type":"business_record","source_id":"...","source_domain":"...","evidence_text":"...","evidence_strength":"high"}]'
              />
            </NCollapseItem>
          </NCollapse>
        </NSpace>
      </NCard>

      <!-- 加载状态 -->
      <NCard v-if="loading" size="small">
        <div class="flex items-center gap-3">
          <NSpin size="small" />
          <span class="text-sm text-muted-foreground">
            正在生成报告（事实锁定 → 章节规划 → 确定性表格 → AI 文字生成 → 事实一致性检查）…
            本地模型可能需要 1~5 分钟，请勿关闭页面。
          </span>
        </div>
      </NCard>

      <!-- 错误 -->
      <NCard v-if="errorInfo" title="请求失败" size="small">
        <NAlert :type="errorInfo.retryable ? 'warning' : 'error'" :bordered="false">
          <div class="font-medium">[{{ errorInfo.code }}] {{ errorInfo.message }}</div>
          <div v-if="errorInfo.retryable" class="mt-1 text-xs">
            该错误可重试，请稍后再次尝试。
          </div>
        </NAlert>
      </NCard>

      <template v-if="result && report">
        <!-- 区块三：报告预览 -->
        <NCard size="small">
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <span>报告预览</span>
              <HseStatusTag v-if="confidenceTag" v-bind="confidenceTag" />
              <HseStatusTag v-if="consistencyTag" v-bind="consistencyTag" />
              <NTag size="small" :bordered="false">
                {{ report.report_type }} · {{ report.report_version }}
              </NTag>
            </div>
          </template>
          <template #header-extra>
            <NSpace :size="8">
              <NButton size="small" @click="onCopy">复制全文</NButton>
              <NButton size="small" @click="onDownload">下载 Markdown</NButton>
            </NSpace>
          </template>
          <NSpace vertical :size="16">
            <div>
              <div class="mb-1 text-lg font-semibold">{{ report.title }}</div>
              <div v-if="report.summary" class="text-sm leading-6">
                {{ report.summary }}
              </div>
            </div>

            <NCard
              v-for="s in report.sections"
              :key="s.key"
              size="small"
              :title="s.title"
              class="border-l-2 border-solid border-l-primary"
            >
              <NSpace vertical :size="8">
                <div class="whitespace-pre-wrap text-sm leading-6">{{ s.content }}</div>
                <NDataTable
                  v-for="t in s.tables"
                  :key="t.title"
                  size="small"
                  :columns="tableColumns(t)"
                  :data="tableData(t)"
                  :bordered="true"
                  :single-line="false"
                />
                <div v-if="s.evidence_ids.length > 0" class="flex flex-wrap items-center gap-1">
                  <span class="text-xs text-muted-foreground">证据引用：</span>
                  <NTag
                    v-for="id in s.evidence_ids"
                    :key="id"
                    size="small"
                    type="info"
                    :bordered="false"
                  >
                    {{ id }}
                  </NTag>
                </div>
              </NSpace>
            </NCard>

            <div v-if="result.suggestions.length > 0">
              <div class="mb-1 text-sm font-medium">建议（现象 → 关注点 → 建议核查）</div>
              <ul class="ml-4 list-disc text-sm leading-6">
                <li v-for="(s, i) in result.suggestions" :key="i">{{ s }}</li>
              </ul>
            </div>

            <NAlert type="info" :bordered="false">{{ report.disclaimer }}</NAlert>
          </NSpace>
        </NCard>

        <!-- 区块四：事实与 Evidence -->
        <NCard size="small" title="事实与 Evidence（报告正文的事实依据 · §三十八 正文与事实分离）">
          <NSpace vertical :size="12">
            <NAlert
              v-for="(w, i) in result.warnings"
              :key="i"
              type="warning"
              :bordered="false"
            >
              {{ w }}
            </NAlert>

            <NDescriptions
              v-if="result.facts.used.length > 0 || result.facts.unresolved.length > 0"
              size="small"
              :column="1"
              bordered
              label-placement="left"
            >
              <NDescriptionsItem label="关键事实（已引用）">
                <ul class="ml-4 list-disc text-xs leading-5">
                  <li v-for="(f, i) in result.facts.used" :key="i">{{ f }}</li>
                </ul>
              </NDescriptionsItem>
              <NDescriptionsItem v-if="result.facts.unresolved.length > 0" label="未被引用的事实">
                <ul class="ml-4 list-disc text-xs leading-5">
                  <li v-for="(f, i) in result.facts.unresolved" :key="i">{{ f }}</li>
                </ul>
              </NDescriptionsItem>
            </NDescriptions>
            <NEmpty
              v-else
              size="small"
              description="本次未结构化提取到数字事实（无有效数据或仅文档来源）"
            />

            <NCard
              v-if="result.evidence.length > 0"
              size="small"
              title="Evidence（aiEvidenceService 同源 · ev_001 为输出层引用索引）"
            >
              <div class="flex flex-col gap-2">
                <div
                  v-for="e in result.evidence"
                  :key="e.id"
                  class="rounded border border-solid border-border p-2 text-xs leading-5"
                >
                  <div class="mb-1 flex flex-wrap items-center gap-1">
                    <NTag size="small" type="info" :bordered="false">{{ e.id }}</NTag>
                    <NTag size="small" :bordered="false">{{ e.source_type }}</NTag>
                    <NTag
                      size="small"
                      :type="e.evidence_strength === 'high' ? 'success' : 'default'"
                      :bordered="false"
                    >
                      {{ e.evidence_strength }}
                    </NTag>
                    <span class="text-muted-foreground">{{ e.source_domain }}</span>
                  </div>
                  <div>{{ e.evidence_text }}</div>
                </div>
              </div>
            </NCard>

            <NCard size="small" title="执行信息">
              <NDescriptions size="small" :column="2" bordered label-placement="left">
                <NDescriptionsItem label="Skill">
                  {{ result.skill.id }} · {{ result.skill.key }} ·
                  {{ result.skill.version }}
                </NDescriptionsItem>
                <NDescriptionsItem label="request_id">
                  {{ result.request_id }}
                </NDescriptionsItem>
                <NDescriptionsItem label="Provider / Model">
                  {{ result.metadata.provider || '-' }} /
                  {{ result.metadata.model || '-' }}
                </NDescriptionsItem>
                <NDescriptionsItem label="耗时">
                  {{ (result.metadata.duration_ms / 1000).toFixed(1) }}s
                </NDescriptionsItem>
                <NDescriptionsItem label="Prompt">
                  {{ result.metadata.prompt_key }} ·
                  {{ result.metadata.prompt_version }}
                </NDescriptionsItem>
                <NDescriptionsItem label="生成记录">
                  {{ result.metadata.record_saved ? `#${result.metadata.record_id}` : '未落库' }}
                </NDescriptionsItem>
                <NDescriptionsItem label="事实数">
                  {{ result.metadata.fact_count ?? '-' }}（已引用
                  {{ result.metadata.fact_used_count ?? '-' }}）
                </NDescriptionsItem>
                <NDescriptionsItem label="Evidence 数">
                  {{ result.metadata.evidence_count ?? '-' }}
                </NDescriptionsItem>
                <NDescriptionsItem label="一致性检查">
                  {{ result.metadata.consistency_status }}
                  <template v-if="result.metadata.consistency_violations">
                    （{{ result.metadata.consistency_violations }} 处不一致）
                  </template>
                </NDescriptionsItem>
                <NDescriptionsItem label="章节规划来源">
                  {{ result.metadata.section_plan_source }}
                </NDescriptionsItem>
              </NDescriptions>
            </NCard>
          </NSpace>
        </NCard>
      </template>
    </div>
  </HsePageLayout>
</template>
