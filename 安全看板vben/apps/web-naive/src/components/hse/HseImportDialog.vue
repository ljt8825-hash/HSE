<script lang="ts" setup>
/**
 * HseImportDialog —— HSE 通用导入弹窗（仅 UI 状态与事件，不绑定真实导入 API）
 *
 * 固定流程（见 01-强制设计约束.md 第 6 节）：
 *   下载模板 → 上传文件 → 解析/校验预览 → 确认导入 → 导入结果
 *
 * 文案固定使用「下载模板」与「导入」，禁止「导入数据」等替代文案。
 * 预览表格复用 HseDataGrid；所有状态由调用方通过 props 驱动，所有动作通过事件外抛。
 */
import { computed, ref, watch } from 'vue';

import {
  NAlert,
  NButton,
  NModal,
  NSpin,
  NUpload,
  NUploadDragger,
  NSpace,
  NTag,
  NText,
} from 'naive-ui';
import { $t } from '#/locales';

import { HseDataGrid } from '#/components/hse';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

/** 签到表识别校验预览结构（与后端 /ledger/signin/recognize 对齐） */
interface SigninPreviewData {
  month: string;
  header: Record<string, string>;
  infoIncomplete: boolean;
  headerIssues: string[];
  contentMissing: boolean;
  expectedCount: number | null;
  signedCount: number;
  untrained?: { name: string; status: 'inpost' | 'departed'; deptName?: string }[];
  counts: { inpost: number; departed: number };
}

interface Props {
  /** 双向绑定：弹窗开关 */
  open: boolean;
  /** 标题，默认「导入」 */
  title?: string;
  /** 接受的文件类型，默认 .xlsx,.xls,.csv */
  accept?: string;
  /** 启用 PDF/图片 OCR 识别（自动扩展 accept 并显示「下载识别Excel」） */
  ocrEnabled?: boolean;
  /** 当前处于 OCR 识别结果状态 */
  ocrActive?: boolean;
  /** 签到表模式：渲染未培训登记面板（替代通用预览表格） */
  signinActive?: boolean;
  signinPreview?: SigninPreviewData | null;
  /** 预览列定义（复用 HseDataGrid） */
  previewColumns?: VxeTableGridColumns;
  /** 预览数据（解析/校验后的有效行） */
  previewData?: any[];
  /** 校验失败信息；非空时进入校验失败态 */
  previewError?: string | null;
  /** OCR 识别进行中（上传后到出结果期间的加载态） */
  ocrLoading?: boolean;
  /** AI 识图逐页进度：已识别 / 总页数（识别期间实时展示） */
  ocrProgress?: { done: number; total: number } | null;
  /** OCR 识别后的引导建议：照片/超大归档等质量受限时提示改用 Excel 模板 */
  ocrAdvice?: string | null;
  /** 确认导入中（loading） */
  confirming?: boolean;
  /** 导入结果 */
  result?: { success: boolean; message: string } | null;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  accept: '.xlsx,.xls,.csv',
  ocrEnabled: false,
  ocrActive: false,
  signinActive: false,
  signinPreview: null,
  previewData: () => [],
  previewError: null,
  ocrLoading: false,
  ocrAdvice: null,
  ocrProgress: null,
  confirming: false,
  result: null,
});

const emit = defineEmits<{
  'update:open': [value: boolean];
  'download-template': [];
  upload: [file: File];
  confirm: [];
  'export-ocr': [];
  close: [];
}>();

const uploadedFileName = ref('');
// 文件类型不匹配的本地提示（不向外抛上传事件）
const typeError = ref('');

// OCR 模式下扩展 accept，允许 PDF/图片
const OCR_EXTRA = '.pdf,.png,.jpg,.jpeg,.bmp,.webp';
const resolvedAccept = computed(() => {
  if (!props.ocrEnabled) return props.accept;
  const list = props.accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const e of OCR_EXTRA.split(',').map((s) => s.trim().toLowerCase())) {
    if (!list.includes(e)) list.push(e);
  }
  return list.join(',');
});

// 校验文件名是否匹配 accept（拖拽可绕过 <input> 的 accept 过滤，需手动判断）
function isAccepted(name: string, accept: string): boolean {
  if (!accept) {
    return true;
  }
  const lower = name.toLowerCase();
  return accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((ext) => lower.endsWith(ext));
}

// 当前步骤（0 下载模板 / 1 上传文件 / 2 解析校验预览 / 3 确认导入 / 4 结果）
const currentStep = computed(() => {
  if (props.result) return 4;
  if (props.confirming) return 3;
  if (props.previewError || (props.previewData && props.previewData.length > 0)) {
    return 2;
  }
  if (uploadedFileName.value) return 1;
  return 0;
});

const steps = [
  $t('page.hse.import.stepDownload'),
  $t('page.hse.import.stepUpload'),
  $t('page.hse.import.stepPreview'),
  $t('page.hse.import.stepConfirm'),
  $t('page.hse.import.stepResult'),
];

// 签到模式下【未培训 0 人】不算校验失败：只要识别出签到预览即可登记/闭合，
// 不受未培训名单是否为空影响，避免「应到缺失 → 未培训空 → 按钮禁用 → 无法下一步」。
const canConfirm = computed(() => {
  if (props.confirming) return false;
  if (props.previewError) return false;
  if (props.signinActive && props.signinPreview) return true;
  return props.previewData && props.previewData.length > 0;
});

function onOpenChange(value: boolean) {
  emit('update:open', value);
  if (!value) {
    handleClose();
  }
}

function handleClose() {
  emit('close');
  uploadedFileName.value = '';
  typeError.value = '';
}

/**
 * NUpload 手动上传：:default-upload="false" 禁止组件自动上传到未知地址；
 * 点击与拖拽均经此回调，各触发一次 upload(file)。
 * 文件类型不匹配时不向外抛出上传事件，仅本地提示。
 */
function handleUploadChange({ file }: { file?: any }) {
  // file 为 Naive UploadFileInfo；原始 File 在 file.file
  const raw: File | undefined = file?.file ?? file;
  if (!raw || !(raw instanceof File)) {
    // 拖拽过程中可能产生的空事件，忽略
    return;
  }
  if (!isAccepted(raw.name, resolvedAccept.value)) {
    typeError.value = $t('page.hse.import.typeError', { accept: resolvedAccept.value });
    return;
  }
  typeError.value = '';
  uploadedFileName.value = raw.name;
  emit('upload', raw);
}

function onDownloadTemplate() {
  emit('download-template');
}

function onConfirm() {
  emit('confirm');
}

watch(
  () => props.open,
  (val) => {
    if (!val) {
      uploadedFileName.value = '';
      typeError.value = '';
    }
  },
);
</script>

<template>
  <NModal
    :show="open"
    :title="title || $t('page.hse.import.title')"
    preset="card"
    style="width: 720px; max-width: 92vw"
    :mask-closable="false"
    @update:show="onOpenChange"
  >
    <!-- 步骤指示 -->
    <div class="mb-4 flex flex-wrap items-center gap-1 text-xs">
      <template v-for="(s, i) in steps" :key="i">
        <span
          class="rounded px-2 py-1"
          :class="[
            i === currentStep
              ? 'bg-[var(--vxe-ui-font-primary-color)] text-white'
              : i < currentStep
                ? 'bg-[rgba(45,212,140,0.15)] text-[hsl(144_57%_35%)]'
                : 'bg-muted text-muted-foreground',
          ]"
        >
          {{ i + 1 }}. {{ s }}
        </span>
        <span v-if="i < steps.length - 1" class="text-muted-foreground">→</span>
      </template>
    </div>

    <!-- 1. 下载模板 -->
    <div class="mb-3 flex items-center justify-between rounded bg-muted/50 px-3 py-2">
      <NText depth="2">{{ $t('page.hse.import.downloadHint') }}</NText>
      <NButton tertiary type="primary" @click="onDownloadTemplate">
        {{ $t('page.hse.import.downloadTemplate') }}
      </NButton>
    </div>

    <!-- 调用方可选注入区（如导入单位选择等），出现在上传区上方 -->
    <slot name="header-extra" />

    <!-- 2. 上传文件（点击与拖拽均经 NUpload 手动上传，禁止自动上传到未知地址） -->
    <div class="mb-3">
      <NAlert v-if="typeError" type="warning" class="mb-2">
        {{ typeError }}
      </NAlert>
      <NUpload
        :default-upload="false"
        :accept="resolvedAccept"
        :show-file-list="false"
        @change="handleUploadChange"
      >
        <NUploadDragger>
          <div class="py-4 text-center">
            <div class="text-sm font-medium">
              {{ uploadedFileName || $t('page.hse.import.dropOrClick') }}
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ $t('page.hse.import.acceptHint', { accept: resolvedAccept }) }}
            </div>
          </div>
        </NUploadDragger>
      </NUpload>
    </div>

    <!-- 3. 解析 / 校验预览 -->
    <div class="min-h-[120px]">
      <!-- OCR 识别中：loading 提示（扫描件逐页识别需几分钟，避免误以为卡死） -->
      <div
        v-if="ocrLoading"
        class="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-border py-8 text-muted-foreground"
      >
        <NSpin size="small" />
        <NText depth="3" class="text-sm">
          正在识别文件，扫描件逐页解析可能需要几分钟，请耐心等待…
        </NText>
        <NText v-if="ocrProgress" class="text-sm">
          已识别
          <span class="font-semibold text-[hsl(158_64%_38%)]">{{ ocrProgress.done }}</span>
          <template v-if="ocrProgress.total"> / {{ ocrProgress.total }} 页</template>
          <template v-else> 页</template>
        </NText>
      </div>

      <template v-else>
        <!-- OCR 引导建议（独立横条，与下方预览/签到面板并存）：照片/超大归档等质量受限时提示改用 Excel 模板 -->
        <NAlert
          v-if="ocrAdvice"
          type="warning"
          class="mb-2"
          :title="'识别受限'"
        >
          {{ ocrAdvice }}
        </NAlert>

        <NAlert
          v-if="previewError"
          type="error"
          :title="$t('page.hse.import.validateFail')"
          class="mb-2"
        >
          {{ previewError }}
        </NAlert>

        <!-- 签到表：未培训登记面板 -->
        <div
          v-else-if="signinActive && signinPreview"
          class="space-y-3"
        >
        <div
          v-if="signinPreview.infoIncomplete || signinPreview.contentMissing"
          class="rounded border border-yellow-400/60 bg-yellow-50 px-3 py-2 text-xs text-yellow-700"
        >
          <div v-if="signinPreview.infoIncomplete" class="font-medium">
            提示：以下表头字段缺失（不影响未培训登记与统计）：{{ (signinPreview.headerIssues || []).join('、') }}
          </div>
          <div v-if="signinPreview.contentMissing" class="font-medium">
            提示：培训内容未填写
          </div>
        </div>
        <div class="rounded border border-dashed border-border px-3 py-2 text-xs leading-relaxed">
          <div class="mb-1 font-medium">签到表信息（{{ signinPreview.month }}）</div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <span>培训日期：{{ signinPreview.header?.training_date || '—' }}</span>
            <span>培训地点：{{ signinPreview.header?.location || '—' }}</span>
            <span>主持人：{{ signinPreview.header?.host || '—' }}</span>
            <span>记录人：{{ signinPreview.header?.recorder || '—' }}</span>
            <span>部门：{{ signinPreview.header?.dept || '—' }}</span>
            <span>参加人数：{{ signinPreview.header?.attendee || '—' }}</span>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 text-xs">
          <NTag type="success" round>
            应到 {{ signinPreview.expectedCount ?? '—' }} 人
          </NTag>
          <NTag type="info" round>
            已签到 {{ signinPreview.signedCount }} 人
          </NTag>
          <NTag type="warning" round>
            在岗未培训 {{ signinPreview.counts?.inpost ?? 0 }} 人
          </NTag>
          <NTag round>
            已离职未培训 {{ signinPreview.counts?.departed ?? 0 }} 人
          </NTag>
        </div>

        <div v-if="signinPreview.untrained && signinPreview.untrained.length">
          <div class="mb-1 text-xs font-medium text-muted-foreground">
            未培训名单（登记后将计入当月缺少数）：
          </div>
          <div class="max-h-48 overflow-auto rounded border border-border">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-muted/50">
                <tr class="text-left">
                  <th class="px-2 py-1 font-medium">姓名</th>
                  <th class="px-2 py-1 font-medium">状态</th>
                  <th class="px-2 py-1 font-medium">所属部门</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="u in signinPreview.untrained"
                  :key="u.name + u.status"
                  class="border-t border-border"
                >
                  <td class="px-2 py-1">{{ u.name }}</td>
                  <td class="px-2 py-1">
                    <NTag
                      size="small"
                      :type="u.status === 'inpost' ? 'warning' : 'default'"
                    >
                      {{ u.status === 'inpost' ? '在岗' : '已离职' }}
                    </NTag>
                  </td>
                  <td class="px-2 py-1">{{ u.deptName || (u.status === 'departed' ? signinPreview.header?.dept : '') || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <NText v-else depth="3" class="text-xs">
          未登记未培训人员（应到人员均已在签到名单中）。
        </NText>
      </div>

      <!-- 普通预览（含 OCR 识别表格） -->
      <template v-else>
        <NAlert
          v-if="!previewData || previewData.length === 0"
          type="warning"
          :title="$t('page.hse.import.emptyTitle')"
        >
          {{ $t('page.hse.import.emptyHint') }}
        </NAlert>
        <HseDataGrid
          v-else
          :columns="previewColumns || []"
          :data="previewData"
          :pager="false"
          :loading="confirming"
          row-key="_id"
        />
      </template>
    </template>
    </div>

    <!-- 4. 结果 -->
    <NAlert
      v-if="result"
      class="mb-3"
      :type="result.success ? 'success' : 'error'"
      :title="result.success ? $t('page.hse.import.resultSuccess') : $t('page.hse.import.resultFail')"
    >
      {{ result.message }}
    </NAlert>

    <!-- 操作区 -->
    <template #footer>
      <NSpace justify="end">
        <NButton
          v-if="!result"
          :disabled="confirming"
          @click="handleClose"
        >
          {{ $t('common.cancel') }}
        </NButton>
        <NButton
          v-if="!result && ocrEnabled && ocrActive && !signinActive && previewData && previewData.length > 0"
          secondary
          type="primary"
          :disabled="confirming"
          @click="emit('export-ocr')"
        >
          {{ '下载识别Excel' }}
        </NButton>
        <NButton
          v-if="!result"
          type="primary"
          :disabled="!canConfirm"
          :loading="confirming"
          @click="onConfirm"
        >
          {{ signinActive ? '登记未培训' : $t('page.hse.import.confirm') }}
        </NButton>
        <NButton v-else type="primary" @click="handleClose">
          {{ $t('common.close') }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>
