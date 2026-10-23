<script lang="ts" setup>
/**
 * SK-005 企业知识问答（AI-Phase-01-02 · 前端最小验证页）
 *
 * 定位：公司级标准 AI Skill 的前端入口（样板工程，后续 SK-001~SK-004 复用同一形态）。
 *
 * 铁律（与后端 SK-005 一致）：
 * - 页面不直接调用任何模型；只调用 POST /api/company/ai/skills/SK-005/answer，
 *   由后端 SK-005 → 权限 → Retriever → Evidence → Prompt Registry → AI Gateway 统一收敛。
 * - 无检索依据时后端返回明确「资料不足」文案（success=true / evidence=[] / confidence=low），
 *   前端照实展示，不做兜底臆测、不用模型常识补答。
 * - 引用来源字段缺失时为 null（后端不伪造），前端显示「—」而不是编造。
 * - 技术栈：Naive UI + 既有 #/components/hse 布局与语义标签 + #/api/request 封装（不新增 UI 组件体系）。
 */
import { computed, reactive, ref } from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NEmpty,
  NInput,
  NInputNumber,
  NList,
  NListItem,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui';

import {
  answerCompanyKnowledge,
  type CompanyAiApi,
} from '#/api/company-ai';
import {
  HsePageLayout,
  HseStatusTag,
  type HseStatusType,
} from '#/components/hse';

defineOptions({ name: 'CompanyKnowledgeQa' });

/* ────────────────────────────── 常量 ────────────────────────────── */

/** 知识范围可选值：与后端 knowledge_scope 令牌一致（all | sourceType:<类型>） */
const SCOPE_OPTIONS = [
  { label: '全部知识（不限范围）', value: 'all' },
  { label: '制度（policy）', value: 'sourceType:policy' },
  { label: '法规（regulation）', value: 'sourceType:regulation' },
  { label: '流程/程序（procedure）', value: 'sourceType:procedure' },
  { label: '系统文档（system_document）', value: 'sourceType:system_document' },
  { label: '手工上传（manual_upload）', value: 'sourceType:manual_upload' },
  { label: '培训资料（training）', value: 'sourceType:training' },
];

/** 置信度 → 语义标签（不硬编码色值，统一走 HSE 主题令牌） */
const CONFIDENCE_MAP: Record<
  CompanyAiApi.SkillConfidence,
  { type: HseStatusType; label: string }
> = {
  high: { type: 'success', label: '高置信度' },
  medium: { type: 'info', label: '中置信度' },
  low: { type: 'warning', label: '低置信度' },
};

const QUESTION_MAX_LENGTH = 1000;

/* ────────────────────────────── 表单 / 状态 ────────────────────────────── */

const form = reactive({
  question: '',
  scope: 'all',
  topK: 5,
  requireCitation: true,
});

const loading = ref(false);
const result = ref<null | Omit<CompanyAiApi.SkillAnswerResult, 'success'>>(null);
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

/** 资料不足（无 Evidence 且低置信度）→ 明确提示，不伪装成功 */
const isNoAnswer = computed(
  () =>
    !!result.value &&
    result.value.evidence.length === 0 &&
    result.value.confidence === 'low',
);

/** 字段级校验明细（后端结构化错误 details） */
const errorDetails = computed<Array<{ field: string; message: string }>>(() => {
  const d = errorInfo.value?.details;
  return Array.isArray(d) ? d : [];
});

/* ────────────────────────────── 提交 ────────────────────────────── */

async function onAsk() {
  if (loading.value) return;
  errorInfo.value = null;

  const question = form.question.trim();
  if (!question) {
    errorInfo.value = {
      code: 'EMPTY_QUESTION',
      message: '请输入要查询的问题。',
      retryable: false,
      details: null,
    };
    return;
  }
  if (question.length > QUESTION_MAX_LENGTH) {
    errorInfo.value = {
      code: 'QUESTION_TOO_LONG',
      message: `问题长度不得超过 ${QUESTION_MAX_LENGTH} 字。`,
      retryable: false,
      details: null,
    };
    return;
  }

  loading.value = true;
  result.value = null;
  try {
    result.value = await answerCompanyKnowledge({
      question,
      knowledge_scope: form.scope === 'all' ? [] : [form.scope],
      conversation_id: null,
      top_k: form.topK ?? 5,
      require_citation: form.requireCitation,
    });
  } catch (e: any) {
    errorInfo.value = {
      code: e?.code || 'AI_UNKNOWN_ERROR',
      message: e?.message || 'AI 请求失败，请稍后重试。',
      retryable: Boolean(e?.aiRetryable),
      details: e?.aiDetails ?? null,
    };
  } finally {
    loading.value = false;
  }
}

function onReset() {
  form.question = '';
  result.value = null;
  errorInfo.value = null;
}

/* ────────────────────────────── 展示辅助 ────────────────────────────── */

function displayText(v: null | number | string | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

function scoreText(score: null | number): string {
  return score === null || score === undefined ? '—' : score.toFixed(3);
}
</script>

<template>
  <HsePageLayout
    title="企业知识问答"
    description="SK-005 企业知识问答 Skill · AI 基于企业知识库检索结果作答，并给出可追溯引用来源"
  >
    <div class="flex flex-col gap-4">
      <!-- 提问区 -->
      <NCard title="提问" size="small">
        <NSpace vertical :size="12">
          <NInput
            v-model:value="form.question"
            type="textarea"
            :maxlength="QUESTION_MAX_LENGTH"
            :autosize="{ minRows: 3, maxRows: 6 }"
            show-count
            clearable
            placeholder="请输入关于公司制度、规程、文件的问题（例如：某制度的具体要求是什么？）"
            @keydown.ctrl.enter="onAsk"
          />

          <div class="flex flex-wrap items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">知识范围</span>
              <NSelect
                v-model:value="form.scope"
                :options="SCOPE_OPTIONS"
                style="width: 240px"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">检索条数</span>
              <NInputNumber v-model:value="form.topK" :min="1" :max="10" style="width: 120px" />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">强制引用</span>
              <NSwitch v-model:value="form.requireCitation" />
            </div>
            <div class="flex items-center gap-2">
              <NButton type="primary" :loading="loading" @click="onAsk">
                提问
              </NButton>
              <NButton quaternary :disabled="loading" @click="onReset">
                清空
              </NButton>
            </div>
          </div>

          <div class="text-xs text-muted-foreground">
            提示：Ctrl + Enter 快速提交。回答仅为 AI 辅助信息获取，不构成正式制度解释、法律意见或管理决定。
          </div>
        </NSpace>
      </NCard>

      <!-- 加载状态 -->
      <NCard v-if="loading" size="small">
        <div class="flex items-center gap-3">
          <NSpin size="small" />
          <span class="text-sm text-muted-foreground">正在检索企业知识并生成回答…</span>
        </div>
      </NCard>

      <!-- 错误状态（结构化错误） -->
      <NCard v-if="errorInfo" title="请求失败" size="small">
        <NAlert type="error" :title="`错误码：${errorInfo.code}`">
          <div class="flex flex-col gap-1">
            <span>{{ errorInfo.message }}</span>
            <span class="text-xs">
              {{ errorInfo.retryable ? '该错误可重试。' : '该错误不可重试，请核对输入或联系管理员。' }}
            </span>
          </div>
        </NAlert>
        <NList v-if="errorDetails.length > 0" class="mt-3" size="small" bordered>
          <NListItem v-for="(d, i) in errorDetails" :key="i">
            <span class="text-sm">{{ d.field }}：{{ d.message }}</span>
          </NListItem>
        </NList>
      </NCard>

      <!-- 结果区 -->
      <template v-if="result">
        <NCard size="small">
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <span>回答</span>
              <HseStatusTag
                v-if="confidenceTag"
                :type="confidenceTag.type"
                :label="confidenceTag.label"
                size="small"
              />
              <NTag v-if="isNoAnswer" size="small" :bordered="false" type="warning">
                资料不足
              </NTag>
            </div>
          </template>

          <NAlert
            v-if="isNoAnswer"
            class="mb-3"
            type="warning"
            title="未检索到足够的企业知识依据"
          >
            该问题在当前知识库中未找到可依据的资料，系统未作推测性回答。
          </NAlert>

          <div class="whitespace-pre-wrap text-sm leading-relaxed">
            {{ result.answer }}
          </div>

          <!-- 建议 -->
          <template v-if="result.suggestions.length > 0">
            <NDivider class="my-3" />
            <div class="text-sm font-medium">建议</div>
            <ul class="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              <li v-for="(s, i) in result.suggestions" :key="i">{{ s }}</li>
            </ul>
          </template>

          <!-- 提示 / 警告 -->
          <template v-if="result.warnings.length > 0">
            <NDivider class="my-3" />
            <NAlert type="info" title="提示">
              <ul class="list-disc pl-5 text-sm">
                <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
              </ul>
            </NAlert>
          </template>

          <!-- 执行元信息（Prompt 版本 / Provider / Model / 耗时 / 记录） -->
          <NDivider class="my-3" />
          <NDescriptions :column="3" size="small" bordered label-placement="left">
            <NDescriptionsItem label="Skill">
              {{ result.skill.id }} · {{ result.skill.version }}
            </NDescriptionsItem>
            <NDescriptionsItem label="Prompt">
              {{ result.metadata.prompt_key }} · {{ result.metadata.prompt_version }}
            </NDescriptionsItem>
            <NDescriptionsItem label="Provider / Model">
              {{ displayText(result.metadata.provider) }} /
              {{ displayText(result.metadata.model) }}
            </NDescriptionsItem>
            <NDescriptionsItem label="耗时">
              {{ result.metadata.duration_ms }} ms
            </NDescriptionsItem>
            <NDescriptionsItem label="检索">
              {{ result.metadata.retrieval.mode }} · 命中
              {{ result.metadata.retrieval.count }} 条 · 最高分
              {{ scoreText(result.metadata.retrieval.best_score) }}
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

        <!-- 引用来源 -->
        <NCard size="small" title="引用来源（Evidence）">
          <NEmpty
            v-if="result.evidence.length === 0"
            description="本次回答未基于企业知识库资料，无可追溯引用"
          />
          <NCollapse v-else accordion>
            <NCollapseItem
              v-for="(item, idx) in result.evidence"
              :key="idx"
              :name="idx"
              :title="`[引用#${item.citation_id}] ${displayText(item.document_name || item.source_name)}`"
            >
              <template #header-extra>
                <span class="text-xs text-muted-foreground">
                  相似度 {{ scoreText(item.score) }}
                </span>
              </template>
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>知识源：{{ displayText(item.source_name) }}（{{ displayText(item.source_type) }}）</span>
                  <span>source_id：{{ displayText(item.source_id) }}</span>
                  <span>document_id：{{ displayText(item.document_id) }}</span>
                  <span>chunk_id：{{ displayText(item.chunk_id) }}</span>
                  <span>章节：{{ displayText(item.section) }}</span>
                  <span>页码：{{ displayText(item.page) }}</span>
                  <span>证据强度：{{ displayText(item.evidence_strength) }}</span>
                </div>
                <div class="rounded bg-black/5 p-3 text-sm whitespace-pre-wrap">
                  {{ item.content }}
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