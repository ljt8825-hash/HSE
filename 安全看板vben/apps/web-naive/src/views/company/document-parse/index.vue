<script lang="ts" setup>
/**
 * SK-002 文档解析（AI-Phase-01-05 · 前端最小验证页）
 *
 * 定位：公司级标准 AI Skill SK-002 的前端入口（复用 SK-005/SK-001 页面形态与请求封装）。
 *
 * 铁律（与后端 SK-002 一致）：
 * - 页面不直接调用任何模型；只调用 POST /api/company/ai/skills/SK-002/parse（multipart），
 *   由后端 SK-002 → 权限 → 确定性解析（docx/pdf/txt/md）→ Evidence → Prompt Registry → AI Gateway 统一收敛。
 * - 结构统计全部来自后端 result（程序确定性解析），AI 文字（answer）仅为解读；
 *   前端不做任何二次计算，数字展示原样透传；后端未可靠识别的字段（null）显示「—」。
 * - Evidence 为 aiEvidenceService 产物（来源于上传文件与确定性解析结果）。
 * - 技术栈：Naive UI + HsePageLayout + #/api/request 封装（不新增 UI 组件体系）。
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
  parseCompanyDocument,
  type CompanyAiApi,
  type CompanyDocumentApi,
} from '#/api/company-ai';
import {
  HsePageLayout,
  HseStatusTag,
  type HseStatusType,
} from '#/components/hse';

defineOptions({ name: 'CompanyDocumentParse' });

/* ────────────────────────────── 常量 ────────────────────────────── */

const CONFIDENCE_MAP: Record<
  CompanyAiApi.SkillConfidence,
  { type: HseStatusType; label: string }
> = {
  high: { type: 'success', label: '高置信度' },
  medium: { type: 'info', label: '中置信度' },
  low: { type: 'warning', label: '低置信度' },
};

const ACCEPT_EXTS = '.pdf,.docx,.txt,.md,.markdown';

const STYLE_LABEL: Record<string, string> = {
  body: '正文',
  list_item: '列表项',
  heading_1: '一级标题',
  heading_2: '二级标题',
  heading_3: '三级标题',
  heading_4: '四级标题',
  heading_5: '五级标题',
  heading_6: '六级标题',
};

/* ────────────────────────────── 状态 ────────────────────────────── */

const fileList = ref<UploadFileInfo[]>([]);
const parseGoal = ref('');
const extractStructure = ref(true);
const extractTables = ref(true);
const extractMetadata = ref(true);
const loading = ref(false);
const result = ref<null | Omit<CompanyDocumentApi.SkillParseResult, 'success'>>(null);
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

const documentInfo = computed(() => result.value?.result?.document);
const structure = computed(() => result.value?.result?.structure);
const quality = computed(() => result.value?.result?.quality);

/** 结构统计卡（null = 该文档类型无可靠来源，如实显示「—」） */
const statCards = computed(() => {
  const s = structure.value;
  if (!s) return [];
  return [
    { label: '标题数量', value: s.heading_count, nullText: '未可靠识别' },
    { label: '段落数量', value: s.paragraph_count, nullText: null },
    {
      label: '表格数量',
      value: s.table_count,
      nullText: '未可靠识别',
    },
    { label: '列表项', value: s.list_item_count, nullText: '—' },
    { label: '图片数量', value: s.image_count, nullText: '—' },
    { label: '文本字符数', value: s.text_chars, nullText: null },
    { label: '页数', value: documentInfo.value?.page_count ?? null, nullText: '无可靠来源' },
  ];
});

/** 段落明细表（仅展示前若干条，统计以结构卡为准） */
const paragraphRows = computed(() => result.value?.result?.paragraphs ?? []);
const paragraphColumns = [
  { title: '#', key: 'index', width: 70 },
  {
    title: '类型',
    key: 'style',
    width: 100,
    render: (row: any) => STYLE_LABEL[row.style] ?? row.style,
  },
  { title: '页码', key: 'page', width: 70, render: (r: any) => (r.page === null || r.page === undefined ? '—' : String(r.page)) },
  { title: '内容', key: 'text', ellipsis: { tooltip: true } },
];

/** 表格明细 */
const tableRows = computed(() => result.value?.result?.tables ?? []);

/* ────────────────────────────── 提交 ────────────────────────────── */

async function onParse() {
  if (loading.value) return;
  errorInfo.value = null;
  result.value = null;

  if (!selectedFile.value) {
    errorInfo.value = {
      code: 'NO_FILE',
      message: '请先选择要解析的文档（.pdf / .docx / .txt / .md，≤20MB）。',
      retryable: false,
      details: null,
    };
    return;
  }

  const form = new FormData();
  form.append('file', selectedFile.value);
  if (parseGoal.value.trim()) form.append('parse_goal', parseGoal.value.trim());
  form.append('extract_structure', String(extractStructure.value));
  form.append('extract_tables', String(extractTables.value));
  form.append('extract_metadata', String(extractMetadata.value));

  loading.value = true;
  try {
    result.value = await parseCompanyDocument(form);
  } catch (e: any) {
    errorInfo.value = {
      code: e?.code || 'AI_UNKNOWN_ERROR',
      message: e?.message || '解析请求失败，请稍后重试。',
      retryable: Boolean(e?.aiRetryable),
      details: e?.aiDetails ?? null,
    };
  } finally {
    loading.value = false;
  }
}

function onReset() {
  fileList.value = [];
  parseGoal.value = '';
  extractStructure.value = true;
  extractTables.value = true;
  extractMetadata.value = true;
  result.value = null;
  errorInfo.value = null;
}

/* ────────────────────────────── 展示辅助 ────────────────────────────── */

function displayText(v: null | number | string | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function fmtBytes(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<template>
  <HsePageLayout
    title="文档解析"
    description="SK-002 文档解析 Skill · 程序确定性解析 + AI 解读（结构统计以程序结果为准，未识别结构如实显示）"
  >
    <div class="flex flex-col gap-4">
      <!-- 上传与解析目标 -->
      <NCard title="上传与解析目标" size="small">
        <NSpace vertical :size="12">
          <NUpload
            v-model:file-list="fileList"
            :max="1"
            :default-upload="false"
            :accept="ACCEPT_EXTS"
            name="file"
          >
            <NButton>选择文件（.pdf / .docx / .txt / .md，≤20MB；.doc 不支持）</NButton>
          </NUpload>

          <NInput
            v-model:value="parseGoal"
            type="textarea"
            :maxlength="500"
            :autosize="{ minRows: 2, maxRows: 4 }"
            show-count
            clearable
            placeholder="解析目标（可选）：例如「解读这份制度文档的结构与主要内容」"
          />

          <NSpace :size="16">
            <NCheckbox v-model:checked="extractStructure">提取标题/段落结构</NCheckbox>
            <NCheckbox v-model:checked="extractTables">提取表格</NCheckbox>
            <NCheckbox v-model:checked="extractMetadata">提取元数据</NCheckbox>
          </NSpace>

          <div class="flex items-center gap-2">
            <NButton type="primary" :loading="loading" @click="onParse">
              开始解析
            </NButton>
            <NButton quaternary :disabled="loading" @click="onReset">
              清空
            </NButton>
          </div>

          <div class="text-xs text-muted-foreground">
            说明：标题/段落/表格统计与页码由程序确定性解析；AI 仅基于解析结果做解读，不会编造文档中不存在的内容。扫描版 PDF 无文本层时将如实返回「无法提取」。
          </div>
        </NSpace>
      </NCard>

      <!-- 加载状态 -->
      <NCard v-if="loading" size="small">
        <div class="flex items-center gap-3">
          <NSpin size="small" />
          <span class="text-sm text-muted-foreground">
            正在确定性解析文档，随后调用 AI 生成解读…
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
      <template v-if="result && documentInfo">
        <!-- 文档概况 -->
        <NCard size="small" title="文档概况">
          <NDescriptions :column="3" size="small" bordered label-placement="left">
            <NDescriptionsItem label="文件">{{ documentInfo.file_name }}</NDescriptionsItem>
            <NDescriptionsItem label="类型">{{ documentInfo.file_type }}</NDescriptionsItem>
            <NDescriptionsItem label="大小">{{ fmtBytes(documentInfo.file_size) }}</NDescriptionsItem>
            <NDescriptionsItem label="页数">
              {{ displayText(documentInfo.page_count) }}
              <span v-if="documentInfo.page_count === null" class="text-xs text-muted-foreground">
                （该类型无可靠页码来源）
              </span>
            </NDescriptionsItem>
            <NDescriptionsItem label="标题">{{ displayText(documentInfo.title) }}</NDescriptionsItem>
            <NDescriptionsItem label="作者">{{ displayText(documentInfo.author) }}</NDescriptionsItem>
            <NDescriptionsItem label="创建时间">{{ displayText(documentInfo.created_at) }}</NDescriptionsItem>
            <NDescriptionsItem label="修改时间">{{ displayText(documentInfo.modified_at) }}</NDescriptionsItem>
            <NDescriptionsItem label="解析引擎">{{ documentInfo.engine }}</NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <!-- 结构统计 -->
        <NCard size="small" title="结构分析（程序确定性统计）">
          <div class="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
            <div
              v-for="card in statCards"
              :key="card.label"
              class="rounded border border-black/10 p-3"
            >
              <div class="text-xs text-muted-foreground">{{ card.label }}</div>
              <div class="mt-1 text-lg font-medium">
                {{ card.value === null || card.value === undefined ? card.nullText || '—' : card.value }}
              </div>
            </div>
          </div>
          <div
            v-if="structure && structure.non_empty_paragraphs !== structure.paragraph_count"
            class="mt-2 text-xs text-muted-foreground"
          >
            其中非空段落 {{ structure.non_empty_paragraphs }}，空段落
            {{ structure.empty_paragraphs }}。
          </div>
        </NCard>

        <!-- 标题结构 -->
        <NCard size="small" title="标题结构">
          <NEmpty
            v-if="!result.result.headings || result.result.headings.length === 0"
            description="程序未能可靠识别标题结构（该类型无可靠标题层级来源，未做猜测）"
          />
          <NDataTable
            v-else
            :columns="[
              { title: '层级', key: 'level', width: 80, render: (r: any) => `H${r.level ?? '—'}` },
              { title: '标题文本', key: 'text' },
            ]"
            :data="result.result.headings"
            :max-height="320"
            size="small"
            striped
          />
        </NCard>

        <!-- 表格 -->
        <NCard size="small" title="表格（程序确定性识别）">
          <NEmpty
            v-if="!tableRows || tableRows.length === 0"
            description="未识别到表格结构（该类型无可靠表格来源或文档无表格，未做猜测）"
          />
          <NCollapse v-else accordion>
            <NCollapseItem
              v-for="(t, i) in tableRows"
              :key="i"
              :name="i"
              :title="`表格 ${i + 1}：${t.rows} 行 × ${t.columns} 列`"
            >
              <div v-if="t.headers && t.headers.length > 0" class="text-xs text-muted-foreground">
                表头：{{ t.headers.join(' | ') }}
              </div>
              <NDataTable
                class="mt-2"
                size="small"
                striped
                :columns="
                  Array.from({ length: t.columns }, (_, ci) => ({
                    title: t.headers?.[ci] || `列${ci + 1}`,
                    key: `c${ci}`,
                    render: (r: any) => r[`c${ci}`] ?? '',
                  }))
                "
                :data="t.sample.map((row) => Object.fromEntries(row.map((c, ci) => [`c${ci}`, c])))"
                :max-height="280"
              />
            </NCollapseItem>
          </NCollapse>
        </NCard>

        <!-- 段落明细 -->
        <NCard size="small" title="段落明细（仅展示解析返回部分）">
          <div v-if="quality && quality.truncated_paragraphs > 0" class="mb-2 text-xs text-muted-foreground">
            段落明细截断 {{ quality.truncated_paragraphs }} 段；统计数字覆盖全部段落。
          </div>
          <NDataTable
            :columns="paragraphColumns"
            :data="paragraphRows"
            :max-height="360"
            size="small"
            striped
          />
        </NCard>

        <!-- AI 解读 -->
        <NCard size="small">
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <span>AI 解读</span>
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
            <NAlert type="info" title="解析质量提示">
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
        <NCard size="small" title="解析依据（Evidence · 来自上传文件与确定性解析）">
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
