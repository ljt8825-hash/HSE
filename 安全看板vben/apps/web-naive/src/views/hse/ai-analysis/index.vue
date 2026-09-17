<script lang="ts" setup>
/**
 * HSE AI 智能分析中心（AI-08 正式接入）
 *
 * 数据流：数据 → 分析任务 → 统计（确定性） → AI 解释 → Evidence → 管理建议。
 * 主流程走 AI-07 异步任务（analysis-tasks），创建即返回 PENDING，页面不阻塞；
 * PENDING/RUNNING 轮询（2.5s），终态停止；离开页面清理 timer。
 *
 * 铁律：
 * - 统计是确定性的，AI 是解释层（统计在前，AI 在后）。
 * - AI 不可用时统计照常展示，明确提示降级，不伪装成功。
 * - RUNNING 取消只展示「已提交取消请求」，不显示「已取消」。
 * - 截断警告只依据后端真实返回的 dataScope（totalAvailable/analyzedRecords/limit/truncated，AI-09 暴露），
 *   不硬编码 2000、不根据前端数组长度猜测。
 */
import {
  computed,
  h,
  onMounted,
  onUnmounted,
  reactive,
  ref,
} from 'vue';

import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NGi,
  NGrid,
  NInput,
  NList,
  NListItem,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NStatistic,
  NSwitch,
  NTag,
  NText,
  type DataTableColumns,
} from 'naive-ui';

import { useAccess } from '@vben/access';

import {
  cancelAnalysisTask,
  createAnalysisTask,
  generateManagementSuggestion,
  getAnalysisTask,
  getManagementSuggestion,
  getManagementSuggestionReviews,
  listAnalysisTasks,
  submitManagementSuggestionReview,
  type AiAnalysisTask,
  type AiReviewRecord,
  type ManagementSuggestion,
  type ManagementSuggestionResult,
  type ManagementSuggestionReviewsResult,
  type ReviewAction,
} from '#/api/hse/ai';
import { HsePageLayout, HseStatusTag } from '#/components/hse';
import { dialog, message } from '#/adapter/naive';

defineOptions({ name: 'HseAiAnalysis' });

/* ────────────────────────────── 常量 / 映射 ────────────────────────────── */

const DOMAIN_OPTIONS = [{ label: '隐患分析', value: 'hazard' }];

const ANALYSIS_TYPE_OPTIONS = [
  { label: '趋势分析', value: 'trend' },
  { label: '高频问题', value: 'frequency' },
  { label: '整改情况', value: 'rectification' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '等待执行', value: 'PENDING' },
  { label: '分析中', value: 'RUNNING' },
  { label: '分析完成', value: 'COMPLETED' },
  { label: '分析失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELLED' },
];

const STATUS_MAP: Record<string, { type: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  PENDING: { type: 'info', label: '等待执行' },
  RUNNING: { type: 'warning', label: '分析中' },
  COMPLETED: { type: 'success', label: '分析完成' },
  FAILED: { type: 'danger', label: '分析失败' },
  CANCELLED: { type: 'neutral', label: '已取消' },
  RETRYING: { type: 'warning', label: '重试中' },
};

// AI-11 人工审核状态/动作映射（状态命名与后端 aiReviewService.REVIEW_STATUS 一致）
const REVIEW_STATUS_MAP: Record<string, { type: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  PENDING_REVIEW: { type: 'info', label: '待人工审核' },
  APPROVED: { type: 'success', label: '已确认采纳' },
  REJECTED: { type: 'danger', label: '已驳回' },
  MODIFIED: { type: 'warning', label: '修改后采纳' },
};

const REVIEW_ACTION_MAP: Record<string, string> = {
  APPROVE: '确认采纳',
  REJECT: '驳回',
  MODIFY: '修改后采纳',
};

/** NTag 兼容标签类型（Naive NTag 无 'neutral'/'danger'，映射到 'default'/'error'） */
function reviewTagType(status: string): 'default' | 'error' | 'info' | 'primary' | 'success' | 'warning' {
  const t = REVIEW_STATUS_MAP[status]?.type;
  if (t === 'neutral') return 'default';
  if (t === 'danger') return 'error';
  return t || 'default';
}

/** 审核写权限（沿用 AI-10 惯例：admin / safety_manager），读历史任意登录用户 */
const { hasAccessByRoles } = useAccess();
const canReview = computed(() => hasAccessByRoles(['admin', 'safety_manager']));

const QUICK_OPTIONS = [
  { label: '近7天', value: '7d' },
  { label: '近30天', value: '30d' },
  { label: '本月', value: 'month' },
  { label: '上月', value: 'lastMonth' },
  { label: '近3个月', value: '3m' },
  { label: '近6个月', value: '6m' },
  { label: '自定义', value: 'custom' },
];

const TERMINAL_STATUS = ['COMPLETED', 'FAILED', 'CANCELLED'];
const ACTIVE_STATUS = ['PENDING', 'RUNNING'];

/* ────────────────────────────── 工具函数 ────────────────────────────── */

function domainName(domain?: string | null): string {
  if (domain === 'hazard') return '隐患分析';
  if (domain === 'inspection') return '检查分析';
  return domain || '—';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toDateStr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function dayEnd(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

function timeRangeText(row: AiAnalysisTask): string {
  const tr = row.requestPayload?.timeRange;
  if (!tr || (!tr.start && !tr.end)) return '—';
  return `${tr.start || '…'} ~ ${tr.end || '…'}`;
}

function durationText(row: AiAnalysisTask): string {
  if (!row.completedAt) return '—';
  const from = row.startedAt || row.createdAt;
  if (!from) return '—';
  const ms = new Date(row.completedAt).getTime() - new Date(from).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function evidenceStrengthTag(strength?: string) {
  if (strength === 'high') return h(NTag, { type: 'success', size: 'small', bordered: false }, { default: () => '高' });
  if (strength === 'medium') return h(NTag, { type: 'info', size: 'small', bordered: false }, { default: () => '中' });
  return h(NTag, { size: 'small', bordered: false }, { default: () => '低' });
}

/* ────────────────────────────── 创建任务表单 ────────────────────────────── */

const form = reactive({
  domain: 'hazard',
  range: null as [number, number] | null,
  quickMode: '30d',
  analysisTypes: ['trend', 'frequency', 'rectification'],
  useRag: false,
});

const creating = ref(false);

function applyQuickRange(mode: string) {
  const now = new Date();
  const today = dayStart(now);
  switch (mode) {
    case '7d':
      form.range = [today - 6 * 86400000, dayEnd(now)];
      break;
    case '30d':
      form.range = [today - 29 * 86400000, dayEnd(now)];
      break;
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      form.range = [dayStart(first), dayEnd(now)];
      break;
    }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      form.range = [dayStart(first), dayEnd(last)];
      break;
    }
    case '3m':
      form.range = [today - 89 * 86400000, dayEnd(now)];
      break;
    case '6m':
      form.range = [today - 179 * 86400000, dayEnd(now)];
      break;
    default:
      break;
  }
}

function onQuickChange(mode: string) {
  form.quickMode = mode;
  if (mode !== 'custom') applyQuickRange(mode);
}

applyQuickRange('30d');

async function onCreateTask() {
  if (creating.value) return;
  if (!form.range) {
    message.warning('请选择分析时间范围');
    return;
  }
  creating.value = true;
  try {
    const [s, e] = form.range;
    const res = await createAnalysisTask({
      domain: form.domain,
      timeRange: { start: toDateStr(s), end: toDateStr(e) },
      analysisTypes: form.analysisTypes,
      useRag: form.useRag,
    });
    if (res.reused) {
      message.info(`已复用进行中的相同分析任务（任务ID ${res.task.id}）`);
    } else {
      message.success(`分析任务已创建（任务ID ${res.task.id}），正在等待执行。`);
    }
    await refreshList();
    openDetail(res.task.id);
  } catch (e: any) {
    message.error(e?.message || '任务创建失败');
  } finally {
    creating.value = false;
  }
}

/* ────────────────────────────── 任务列表 ────────────────────────────── */

const listQuery = reactive({ page: 1, pageSize: 10, status: '' });
const listData = ref<AiAnalysisTask[]>([]);
const listTotal = ref(0);
const listLoading = ref(false);
let refreshing = false;

function statusTagRender(status: string) {
  const info = STATUS_MAP[status] || { type: 'neutral', label: status };
  return h(HseStatusTag, { type: info.type, label: info.label });
}

const columns: DataTableColumns<AiAnalysisTask> = [
  { title: '任务ID', key: 'id', width: 90, align: 'center' },
  { title: '分析对象', key: 'domain', width: 110, align: 'center', render: (row) => domainName(row.domain) },
  { title: '时间范围', key: 'range', width: 220, align: 'center', render: (row) => timeRangeText(row) },
  { title: '创建时间', key: 'createdAt', width: 170, align: 'center', render: (row) => fmtDateTime(row.createdAt) },
  { title: '状态', key: 'status', width: 110, align: 'center', render: (row) => statusTagRender(row.status) },
  {
    title: '降级',
    key: 'degraded',
    width: 90,
    align: 'center',
    render: (row) =>
      row.degraded
        ? h(NTag, { type: 'warning', size: 'small', bordered: false }, { default: () => '降级' })
        : '—',
  },
  {
    title: 'Provider / Model',
    key: 'model',
    width: 150,
    align: 'center',
    render: (row) => {
      const p = row.provider || '';
      const m = row.model || '';
      return [p, m].filter(Boolean).join(' / ') || '—';
    },
  },
  { title: '耗时', key: 'duration', width: 90, align: 'center', render: (row) => durationText(row) },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    align: 'center',
    fixed: 'right',
    render: (row) =>
      h(
        NSpace,
        { justify: 'center', size: 4 },
        {
          default: () => [
            h(
              NButton,
              { size: 'small', quaternary: true, type: 'primary', onClick: () => openDetail(row.id) },
              { default: () => '查看' },
            ),
            h(
              NButton,
              {
                size: 'small',
                quaternary: true,
                type: 'error',
                disabled: TERMINAL_STATUS.includes(row.status),
                onClick: () => onCancelTask(row),
              },
              { default: () => '取消' },
            ),
          ],
        },
      ),
  },
];

const pagination = computed(() => ({
  page: listQuery.page,
  pageSize: listQuery.pageSize,
  itemCount: listTotal.value,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  prefix: (info: { itemCount?: number }) => `共 ${info.itemCount ?? 0} 条`,
}));

function onPageChange(page: number) {
  listQuery.page = page;
  refreshList();
}

function onPageSizeChange(size: number) {
  listQuery.pageSize = size;
  listQuery.page = 1;
  refreshList();
}

function onStatusFilterChange() {
  listQuery.page = 1;
  refreshList();
}

async function refreshList() {
  if (refreshing) return;
  refreshing = true;
  listLoading.value = true;
  try {
    const res = await listAnalysisTasks({
      page: listQuery.page,
      pageSize: listQuery.pageSize,
      status: listQuery.status || undefined,
    });
    listData.value = res.list;
    listTotal.value = res.total;
  } catch (e: any) {
    // 轮询期间的瞬时错误不打扰用户；首次加载由页面空态兜底
    if (listData.value.length === 0 && listTotal.value === 0) {
      message.error(e?.message || '任务列表加载失败');
    }
  } finally {
    listLoading.value = false;
    refreshing = false;
    syncPolling();
  }
}

function anyActiveTask(): boolean {
  return listData.value.some((t) => ACTIVE_STATUS.includes(t.status));
}

/* ────────────────────────────── 轮询（单 timer，离开清理） ────────────────────────────── */

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    refreshList();
    if (detailOpen.value && detailId.value) refreshDetail();
  }, 2500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function syncPolling() {
  if (anyActiveTask()) {
    startPolling();
  } else {
    stopPolling();
  }
}

/* ────────────────────────────── 任务详情 ────────────────────────────── */

const detailOpen = ref(false);
const detailId = ref<number | null>(null);
const detailTask = ref<AiAnalysisTask | null>(null);
const detailLoading = ref(false);

// AI-10 管理建议（复用 AI-09 任务结果；AI 不可用/未生成时如实降级展示，不伪造成功）
const suggestionResult = ref<ManagementSuggestionResult | null>(null);
const suggestionLoading = ref(false);
const suggestionGenerating = ref(false);
let suggestionFetchedTaskId: number | null = null;

/** 拉取管理建议（GET，不触发生成；silent 时忽略错误） */
async function refreshSuggestion(silent = true) {
  if (!detailId.value) return;
  const id = detailId.value;
  suggestionLoading.value = true;
  try {
    const res = await getManagementSuggestion(id);
    if (detailId.value === id) {
      suggestionResult.value = res;
      // AI-11：建议可用时同步拉取人工审核历史（待审核/已审核状态展示）
      if (res.available && res.structured && res.suggestion) {
        refreshReviews();
      }
    }
  } catch (e: any) {
    if (!silent) message.error(e?.message || '管理建议加载失败');
  } finally {
    suggestionLoading.value = false;
  }
}

/** 生成管理建议（POST；写权限由后端 requireRole 强制） */
async function onGenerateSuggestion(force = false) {
  if (!detailId.value || suggestionGenerating.value) return;
  suggestionGenerating.value = true;
  try {
    const res = await generateManagementSuggestion(detailId.value, { force });
    suggestionResult.value = res;
    if (res.available && res.structured && res.suggestion) {
      message.success('管理建议已生成（AI 输出仅为建议，最终由管理人员研判）');
    } else {
      message.warning(res.message || 'AI 服务不可用，无法生成管理建议；请根据统计结果由管理人员人工研判。');
    }
  } catch (e: any) {
    message.error(e?.message || '管理建议生成失败');
  } finally {
    suggestionGenerating.value = false;
  }
}

async function refreshDetail() {
  if (!detailId.value) return;
  try {
    const res = await getAnalysisTask(detailId.value);
    detailTask.value = res.task;
    const t = res.task;
    // COMPLETED 且未拉取过建议 → 自动拉取（避免轮询高频重复请求）
    if (t && t.status === 'COMPLETED' && suggestionFetchedTaskId !== t.id) {
      suggestionFetchedTaskId = t.id;
      refreshSuggestion();
    }
  } catch (e: any) {
    // 轮询期间忽略瞬时错误
  }
}

function openDetail(id: number) {
  detailId.value = id;
  detailOpen.value = true;
  detailLoading.value = true;
  suggestionResult.value = null;
  suggestionFetchedTaskId = null;
  reviewResult.value = null;
  getAnalysisTask(id)
    .then((res) => {
      detailTask.value = res.task;
      const t = res.task;
      if (t && t.status === 'COMPLETED') {
        suggestionFetchedTaskId = t.id;
        refreshSuggestion();
      }
    })
    .catch((e: any) => {
      message.error(e?.message || '任务详情加载失败');
    })
    .finally(() => {
      detailLoading.value = false;
    });
}

function onDetailClose() {
  detailOpen.value = false;
  detailId.value = null;
  detailTask.value = null;
  suggestionResult.value = null;
  suggestionFetchedTaskId = null;
  reviewResult.value = null;
  reviewDialog.open = false;
  modifyDialog.open = false;
}

function onDetailShowChange(show: boolean) {
  // 仅在关闭时清理；程序化打开（show=true）不触发清理，避免抽屉刚打开即被重置
  if (!show) onDetailClose();
}

/* ────────────────────────────── 取消 ────────────────────────────── */

function onCancelTask(row: AiAnalysisTask) {
  if (TERMINAL_STATUS.includes(row.status)) return;
  const running = row.status === 'RUNNING';
  dialog.warning({
    title: '取消分析任务',
    content: running
      ? '任务正在执行中。AI 分析调用不可可靠中断，提交后将记录取消请求，任务完成后仍会保存结果。'
      : '确定取消该分析任务吗？取消后任务将不再执行。',
    positiveText: '确认取消',
    negativeText: '再想想',
    onPositiveClick: async () => {
      try {
        const res = await cancelAnalysisTask(row.id);
        if (res.cancelRequested) {
          message.info('已提交取消请求，当前 AI 分析仍在执行，完成后系统将更新任务状态。');
        } else if (res.cancelled) {
          message.success('任务已取消');
        } else {
          message.info(res.note || '任务状态未变化');
        }
        await refreshList();
        if (detailId.value === row.id) await refreshDetail();
      } catch (e: any) {
        message.error(e?.message || '取消失败');
      }
    },
  });
}

/* ────────────────────────────── 详情展示计算 ────────────────────────────── */

const stats = computed(() => detailTask.value?.statisticsSnapshot || null);
const aiResult = computed(() => detailTask.value?.aiResult || null);
const evidenceList = computed(() => detailTask.value?.evidence || []);
const businessEvidence = computed(() =>
  evidenceList.value.filter((e) => e.source_type === 'business_record'),
);
const kbEvidence = computed(() =>
  evidenceList.value.filter((e) => e.source_type === 'knowledge_base'),
);

const trendData = computed(() => {
  const s = stats.value;
  if (!s?.trend) return [];
  const g = s.trend.granularity || 'daily';
  return s.trend[g] || [];
});

const topSections = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: 'TOP 问题分类', rows: s.topCategories || [] },
    { title: 'TOP 来源', rows: s.topSources || [] },
    { title: 'TOP 组织', rows: s.topOrgs || [] },
    { title: 'TOP 区域', rows: s.topAreas || [] },
  ];
});

const duplicates = computed(() => stats.value?.duplicates || []);
const clustering = computed(() => stats.value?.clustering || null);
const unrectifiedRows = computed(() => stats.value?.unrectifiedList || []);
const limitations = computed(() => stats.value?.limitations || []);

const aiBlocks = computed(() => {
  const a = aiResult.value;
  if (!a?.analysis) return [];
  const an = a.analysis;
  return [
    { title: '摘要', items: an.summary ? [an.summary] : [] },
    { title: '关键发现', items: an.key_findings || [] },
    { title: '趋势分析', items: an.trend_analysis || [] },
    { title: '异常情况', items: an.anomalies || [] },
    { title: '高频问题', items: an.high_frequency_issues || [] },
    { title: '可能原因', items: an.possible_causes || [] },
    { title: '管理建议', items: an.management_suggestions || [] },
    { title: '分析局限', items: an.limitations || [] },
  ].filter((b) => b.items.length > 0);
});

/* ────────────────────────────── 管理建议（AI-10） ────────────────────────────── */

/** 管理建议结构化展示块（总体判断单独展示，其余按协议分节） */
const suggestionBlocks = computed(() => {
  const s = suggestionResult.value?.suggestion;
  if (!s) return [];
  return [
    { title: '重点关注', items: s.priority_issues || [] },
    { title: '管理措施建议', items: s.management_actions || [] },
    { title: '持续监测', items: s.monitoring_points || [] },
    { title: '后续建议', items: s.follow_up_suggestions || [] },
    { title: 'AI 限制', items: s.limitations || [] },
  ].filter((b) => b.items.length > 0);
});

/** 建议依据：统计分析依据 vs 制度/知识依据（复用 Evidence 区分，不混为一谈） */
const suggestionEvidence = computed(() => suggestionResult.value?.evidence || []);
const suggestionBusinessEvidence = computed(() =>
  suggestionEvidence.value.filter((e) => e.source_type === 'business_record'),
);
const suggestionKbEvidence = computed(() =>
  suggestionEvidence.value.filter((e) => e.source_type === 'knowledge_base'),
);

/** 建议是否已可用（结构化结果） */
const suggestionReady = computed(
  () =>
    suggestionResult.value?.available === true &&
    suggestionResult.value?.structured === true &&
    !!suggestionResult.value?.suggestion,
);

/* ────────────────────────────── 人工审核（AI-11） ────────────────────────────── */

const reviewResult = ref<ManagementSuggestionReviewsResult | null>(null);
const reviewLoading = ref(false);
const reviewSubmitting = ref(false);

/** 当前有效审核状态（无审核记录时后端返回 PENDING_REVIEW） */
const reviewCurrentStatus = computed(() => reviewResult.value?.currentStatus || null);

/** 最新一条审核记录（latest = 当前状态来源） */
const latestReview = computed<AiReviewRecord | null>(() => {
  const rs = reviewResult.value?.reviews;
  return rs && rs.length ? (rs[rs.length - 1] ?? null) : null;
});

/** MODIFIED 时的人工修改建议展示块（明确标注「人工修改」，与 AI 原始输出区分） */
const humanModifiedBlocks = computed(() => {
  const hm = latestReview.value?.humanModified;
  if (!hm) return [];
  return [
    { title: '重点关注（人工修改）', items: hm.priority_issues || [] },
    { title: '管理措施建议（人工修改）', items: hm.management_actions || [] },
    { title: '持续监测（人工修改）', items: hm.monitoring_points || [] },
    { title: '后续建议（人工修改）', items: hm.follow_up_suggestions || [] },
    { title: '限制说明（人工修改）', items: hm.limitations || [] },
  ].filter((b) => b.items.length > 0);
});

/** 拉取审核历史（GET；silent 时忽略错误） */
async function refreshReviews(silent = true) {
  if (!detailId.value) return;
  const id = detailId.value;
  reviewLoading.value = true;
  try {
    const res = await getManagementSuggestionReviews(id);
    if (detailId.value === id) reviewResult.value = res;
  } catch (e: any) {
    if (!silent) message.error(e?.message || '审核历史加载失败');
  } finally {
    reviewLoading.value = false;
  }
}

/** 提交审核（APPROVE / REJECT / MODIFY；携带 previousStatus 乐观并发，冲突时刷新后重试） */
async function doSubmitReview(
  action: ReviewAction,
  humanRemark: string | null,
  humanModified: ManagementSuggestion | null,
) {
  if (!detailId.value || reviewSubmitting.value) return;
  reviewSubmitting.value = true;
  try {
    const res = await submitManagementSuggestionReview(detailId.value, {
      action,
      humanRemark: humanRemark || null,
      humanModified,
      previousStatus: reviewCurrentStatus.value,
    });
    if (res.idempotent) {
      message.info('该审核结果已提交过，未重复记录');
    } else {
      message.success('审核已提交并记录（人机协同记录已留痕）');
    }
    await refreshReviews();
  } catch (e: any) {
    if (e?.code === 'AI_REVIEW_STATE_CONFLICT') {
      message.warning('审核状态已被他人更新，已刷新最新状态，请重新提交');
      await refreshReviews(false);
    } else {
      message.error(e?.message || '审核提交失败');
    }
  } finally {
    reviewSubmitting.value = false;
  }
}

/* ── 确认采纳 / 驳回：意见弹窗 ── */
const reviewDialog = reactive({ open: false, mode: '' as '' | 'APPROVE' | 'REJECT', remark: '' });

function openReviewDialog(mode: 'APPROVE' | 'REJECT') {
  reviewDialog.mode = mode;
  reviewDialog.remark = '';
  reviewDialog.open = true;
}

async function confirmReviewDialog() {
  if (!reviewDialog.mode) return;
  const mode = reviewDialog.mode;
  reviewDialog.open = false;
  await doSubmitReview(mode, reviewDialog.remark || null, null);
}

/* ── 修改后采纳：六字段修改弹窗（预填 AI 原始建议，修改内容独立存储） ── */
const modifyDialog = reactive({
  open: false,
  remark: '',
  overall: '',
  priorityIssues: '',
  managementActions: '',
  monitoringPoints: '',
  followUpSuggestions: '',
  limitations: '',
});

function openModifyDialog() {
  const s = suggestionResult.value?.suggestion;
  modifyDialog.remark = '';
  modifyDialog.overall = s?.overall_assessment || '';
  modifyDialog.priorityIssues = (s?.priority_issues || []).join('\n');
  modifyDialog.managementActions = (s?.management_actions || []).join('\n');
  modifyDialog.monitoringPoints = (s?.monitoring_points || []).join('\n');
  modifyDialog.followUpSuggestions = (s?.follow_up_suggestions || []).join('\n');
  modifyDialog.limitations = (s?.limitations || []).join('\n');
  modifyDialog.open = true;
}

function splitLines(v: string): string[] {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function confirmModifyDialog() {
  const hm: ManagementSuggestion = {
    overall_assessment: modifyDialog.overall.trim(),
    priority_issues: splitLines(modifyDialog.priorityIssues),
    management_actions: splitLines(modifyDialog.managementActions),
    monitoring_points: splitLines(modifyDialog.monitoringPoints),
    follow_up_suggestions: splitLines(modifyDialog.followUpSuggestions),
    limitations: splitLines(modifyDialog.limitations),
  };
  if (!hm.overall_assessment) {
    message.warning('请填写修改后的总体判断');
    return;
  }
  if (!hm.management_actions.length) {
    message.warning('请至少填写一条管理措施建议');
    return;
  }
  modifyDialog.open = false;
  await doSubmitReview('MODIFY', modifyDialog.remark || null, hm);
}

/* ────────────────────────────── 生命周期 ────────────────────────────── */

onMounted(() => {
  refreshList();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <HsePageLayout
    title="AI 智能分析中心"
    :description="'AI 分析结果仅作为 HSE 管理辅助参考，不替代人工判断、调查、审核和最终决策。'"
    :auto-content-height="false"
  >
    <template #breadcrumb>
      <NSpace size="small">
        <HseStatusTag type="info">AI-08 正式接入</HseStatusTag>
        <HseStatusTag type="neutral">统计为确定性结果，AI 为解释层</HseStatusTag>
      </NSpace>
    </template>

    <!-- 辅助判断定位说明 -->
    <NAlert type="info" :show-icon="true" class="mb-4" style="margin-bottom: 16px">
      AI 分析结果仅作为 HSE 管理辅助参考，不替代人工判断、调查、审核和最终决策。人工仍然是最终决策者。
    </NAlert>

    <!-- 1. 分析任务创建区 -->
    <NCard title="创建分析任务" :bordered="false" class="mb-4" style="margin-bottom: 16px">
      <NGrid :cols="4" :x-gap="16" :y-gap="12" responsive="screen">
        <NGi>
          <div class="field-label">分析对象</div>
          <NSelect v-model:value="form.domain" :options="DOMAIN_OPTIONS" />
        </NGi>
        <NGi :span="2">
          <div class="field-label">时间范围</div>
          <div class="flex items-center gap-2">
            <NRadioGroup v-model:value="form.quickMode" size="small" @update:value="onQuickChange">
              <NRadioButton
                v-for="opt in QUICK_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </NRadioGroup>
          </div>
          <div class="mt-2">
            <span v-if="form.range" class="text-muted-foreground text-sm">
              {{ toDateStr(form.range[0]) }} ~ {{ toDateStr(form.range[1]) }}
            </span>
            <span v-else class="text-muted-foreground text-sm">请选择时间范围</span>
          </div>
        </NGi>
        <NGi>
          <div class="field-label">是否使用知识库</div>
          <div class="flex items-center gap-2">
            <NSwitch v-model:value="form.useRag" />
            <span class="text-sm text-muted-foreground">使用知识库依据</span>
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            开启后 AI 会结合 HSE 知识库提供制度/标准依据；RAG 不可用时自动降级。
          </div>
        </NGi>
      </NGrid>

      <NDivider style="margin: 16px 0" />

      <div class="mb-2 flex items-center gap-2">
        <span class="field-label">分析方向</span>
        <span class="text-xs text-muted-foreground">选择希望重点关注的分析方向</span>
      </div>
      <NCheckboxGroup v-model:value="form.analysisTypes">
        <NSpace>
          <NCheckbox
            v-for="opt in ANALYSIS_TYPE_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </NSpace>
      </NCheckboxGroup>

      <div class="mt-4">
        <NButton
          type="primary"
          :loading="creating"
          @click="onCreateTask"
        >
          开始分析
        </NButton>
      </div>
    </NCard>

    <!-- 2. 任务列表 -->
    <NCard title="分析任务" :bordered="false">
      <template #header-extra>
        <NSpace>
          <NSelect
            v-model:value="listQuery.status"
            :options="STATUS_OPTIONS"
            style="width: 140px"
            size="small"
            @update:value="onStatusFilterChange"
          />
          <NButton size="small" :loading="listLoading" @click="refreshList">刷新</NButton>
        </NSpace>
      </template>
      <NDataTable
        :columns="columns"
        :data="listData"
        :loading="listLoading"
        :pagination="pagination"
        :row-key="(row: AiAnalysisTask) => row.id"
        remote
        :scroll-x="1180"
        @update:page="onPageChange"
        @update:page-size="onPageSizeChange"
      />
    </NCard>

    <!-- 3. 任务详情 Drawer -->
    <NDrawer v-model:show="detailOpen" :width="960" placement="right" resizable @update:show="onDetailShowChange">
      <NDrawerContent title="分析任务详情" closable>
        <NSpin :show="detailLoading">
          <div
            v-if="detailTask"
            class="mb-4 flex items-center gap-2"
            style="margin-bottom: 16px"
          >
            <HseStatusTag
              :type="STATUS_MAP[detailTask.status]?.type ?? 'neutral'"
              :label="STATUS_MAP[detailTask.status]?.label ?? detailTask.status"
            />
            <NTag v-if="detailTask.degraded" type="warning" size="small" :bordered="false">降级</NTag>
            <NButton size="small" @click="refreshDetail">刷新</NButton>
          </div>
          <div v-if="detailTask">
            <!-- 基本信息 -->
            <NCard title="基本信息" :bordered="false" class="mb-4" style="margin-bottom: 16px">
              <NDescriptions :column="3" bordered size="small">
                <NDescriptionsItem label="任务ID">{{ detailTask.id }}</NDescriptionsItem>
                <NDescriptionsItem label="任务类型">{{ detailTask.taskType }}</NDescriptionsItem>
                <NDescriptionsItem label="分析对象">{{ domainName(detailTask.domain) }}</NDescriptionsItem>
                <NDescriptionsItem label="时间范围">{{ timeRangeText(detailTask) }}</NDescriptionsItem>
                <NDescriptionsItem label="创建时间">{{ fmtDateTime(detailTask.createdAt) }}</NDescriptionsItem>
                <NDescriptionsItem label="开始时间">{{ fmtDateTime(detailTask.startedAt) }}</NDescriptionsItem>
                <NDescriptionsItem label="完成时间">{{ fmtDateTime(detailTask.completedAt) }}</NDescriptionsItem>
                <NDescriptionsItem label="耗时">{{ durationText(detailTask) }}</NDescriptionsItem>
                <NDescriptionsItem label="Provider">{{ detailTask.provider || '—' }}</NDescriptionsItem>
                <NDescriptionsItem label="Model">{{ detailTask.model || '—' }}</NDescriptionsItem>
                <NDescriptionsItem label="知识库依据">
                  {{ detailTask.requestPayload?.useRag ? '开启' : '关闭' }}
                </NDescriptionsItem>
                <NDescriptionsItem label="分析方向">
                  {{
                    detailTask.requestPayload?.analysisTypes?.length
                      ? detailTask.requestPayload.analysisTypes.join('、')
                      : '未指定（均衡分析）'
                  }}
                </NDescriptionsItem>
                <NDescriptionsItem label="Generation Record">
                  {{ detailTask.generationRecordId ?? '—' }}
                </NDescriptionsItem>
              </NDescriptions>
            </NCard>

            <!-- 状态提示 -->
            <div v-if="detailTask.status === 'PENDING'" class="mb-4" style="margin-bottom: 16px">
              <NAlert type="info" :show-icon="true">
                分析任务已创建，正在等待执行。页面会自动刷新任务状态。
              </NAlert>
            </div>
            <div v-else-if="detailTask.status === 'RUNNING'" class="mb-4" style="margin-bottom: 16px">
              <NAlert type="warning" :show-icon="true">
                正在执行 AI 分析（CPU 推理可能需要数十秒），页面会在状态变化时自动刷新。
              </NAlert>
            </div>
            <div v-else-if="detailTask.status === 'CANCELLED'" class="mb-4" style="margin-bottom: 16px">
              <NAlert type="default" :show-icon="true">任务已取消。</NAlert>
            </div>
            <div v-else-if="detailTask.status === 'FAILED'" class="mb-4" style="margin-bottom: 16px">
              <NAlert type="error" :show-icon="true">
                <template #header>分析任务执行失败</template>
                错误码：{{ detailTask.errorCode || '—' }}；{{ detailTask.errorMessage || '—' }}
                <template v-if="detailTask.errorRetryable">（可重试）</template>
              </NAlert>
            </div>
            <div v-if="detailTask.cancelRequestedAt" class="mb-4" style="margin-bottom: 16px">
              <NAlert type="warning" :show-icon="true">
                已提交取消请求（{{ fmtDateTime(detailTask.cancelRequestedAt) }}），当前 AI 分析仍在执行，
                完成后系统将更新任务状态。
              </NAlert>
            </div>

            <!-- COMPLETED：统计结果（确定性） -->
            <div v-if="detailTask.status === 'COMPLETED'">
              <NCard title="统计结果" :bordered="false" class="mb-4" style="margin-bottom: 16px">
                <!-- AI-09 截断可见：仅当后端真实返回 truncated=true 时展示警告 -->
                <NAlert
                  v-if="stats?.dataScope?.truncated"
                  type="warning"
                  :show-icon="true"
                  class="mb-4"
                  style="margin-bottom: 16px"
                >
                  本次分析仅使用部分数据。当前分析使用 {{ stats.dataScope.analyzedRecords }} 条记录，
                  符合条件的实际数据共 {{ stats.dataScope.totalAvailable }} 条，结果可能无法完全代表全部数据。
                </NAlert>
                <div v-if="stats">
                  <NGrid :cols="6" :x-gap="12" :y-gap="12" responsive="screen">
                    <NGi>
                      <NStatistic label="总记录数" :value="stats.summary?.total ?? 0" />
                    </NGi>
                    <NGi>
                      <NStatistic label="已整改" :value="stats.summary?.rectifiedCount ?? 0" />
                    </NGi>
                    <NGi>
                      <NStatistic label="未整改" :value="stats.summary?.unrectifiedCount ?? 0" />
                    </NGi>
                    <NGi>
                      <NStatistic label="整改率" :value="stats.summary?.rectificationRate ?? 0" suffix="%" />
                    </NGi>
                    <NGi>
                      <NStatistic label="逾期数" :value="stats.summary?.overdueCount ?? 0" />
                    </NGi>
                    <NGi>
                      <NStatistic label="重复问题" :value="stats.summary?.duplicateCount ?? 0" />
                    </NGi>
                  </NGrid>

                  <NDivider style="margin: 16px 0" />

                  <div class="mb-2">
                    <NText strong>时间趋势（{{ stats.trend?.granularity || 'daily' }}粒度）</NText>
                  </div>
                  <NDataTable
                    v-if="trendData.length"
                    size="small"
                    :bordered="false"
                    :columns="[
                      { title: '周期', key: 'period', align: 'center' },
                      { title: '记录数', key: 'issueCount', align: 'center' },
                      { title: '已整改', key: 'rectified', align: 'center' },
                    ]"
                    :data="trendData"
                    :max-height="220"
                  />
                  <NEmpty v-else description="暂无趋势数据" :size="'small'" />

                  <NDivider style="margin: 16px 0" />

                  <NGrid :cols="2" :x-gap="16" :y-gap="12" responsive="screen">
                    <NGi v-for="sec in topSections" :key="sec.title">
                      <div class="mb-2">
                        <NText strong>{{ sec.title }}</NText>
                      </div>
                      <NList v-if="sec.rows.length" size="small" :bordered="false">
                        <NListItem v-for="(r, i) in sec.rows.slice(0, 5)" :key="i">
                          <div class="flex items-center justify-between gap-2">
                            <span class="truncate">{{ r.name || '—' }}</span>
                            <span class="text-muted-foreground shrink-0">{{ r.count }} 条</span>
                          </div>
                        </NListItem>
                      </NList>
                      <NEmpty v-else description="暂无数据" :size="'small'" />
                    </NGi>
                  </NGrid>

                  <NDivider v-if="duplicates.length" style="margin: 16px 0" />
                  <div v-if="duplicates.length" class="mb-2">
                    <NText strong>重复问题（同分类+组织未整改 ≥2）</NText>
                  </div>
                  <NDataTable
                    v-if="duplicates.length"
                    size="small"
                    :bordered="false"
                    :columns="[
                      { title: '分类', key: 'category', align: 'center' },
                      { title: '组织', key: 'org', align: 'center' },
                      { title: '次数', key: 'count', align: 'center' },
                    ]"
                    :data="duplicates"
                    :max-height="220"
                  />

                  <NDivider v-if="clustering" style="margin: 16px 0" />
                  <div v-if="clustering" class="mb-2">
                    <NText strong>聚集分析</NText>
                  </div>
                  <div v-if="clustering">
                    <div v-if="clustering.topTimePeriods?.length" class="mb-1 text-sm">
                      集中时段：{{ clustering.topTimePeriods.map((p: any) => `${p.period}（${p.count}）`).join('、') }}
                    </div>
                    <div v-if="clustering.topTypes?.length" class="mb-1 text-sm">
                      集中类型：{{ clustering.topTypes.map((t: any) => `${t.type}（${t.count}）`).join('、') }}
                    </div>
                    <div v-if="clustering.topAreas?.length" class="mb-1 text-sm">
                      集中区域：{{ clustering.topAreas.map((a: any) => `${a.area}（${a.count}）`).join('、') }}
                    </div>
                    <div v-if="clustering.note" class="text-xs text-muted-foreground">
                      {{ clustering.note }}
                    </div>
                  </div>

                  <NDivider v-if="unrectifiedRows.length" style="margin: 16px 0" />
                  <div v-if="unrectifiedRows.length" class="mb-2">
                    <NText strong>未整改清单（脱敏，TOP10）</NText>
                  </div>
                  <NDataTable
                    v-if="unrectifiedRows.length"
                    size="small"
                    :bordered="false"
                    :columns="[
                      { title: 'ID', key: 'id', width: 80, align: 'center' },
                      { title: '日期', key: 'date', align: 'center' },
                      { title: '分类', key: 'category', align: 'center' },
                      { title: '组织', key: 'org', align: 'center' },
                      { title: '期限', key: 'deadline', align: 'center' },
                      { title: '逾期天数', key: 'overdueDays', align: 'center' },
                    ]"
                    :data="unrectifiedRows"
                    :max-height="240"
                  />

                  <NAlert
                    v-if="limitations.length"
                    type="warning"
                    :show-icon="true"
                    class="mt-4"
                    style="margin-top: 16px"
                  >
                    <template #header>统计局限</template>
                    <div v-for="(lim, i) in limitations" :key="i" class="text-sm">· {{ lim }}</div>
                  </NAlert>
                </div>
                <NEmpty v-else description="暂无统计数据" />
              </NCard>

              <!-- AI 分析（解释层） -->
              <NCard title="AI 分析" :bordered="false" class="mb-4" style="margin-bottom: 16px">
                <div v-if="aiResult?.available && aiResult?.structured && aiResult?.analysis">
                  <div v-for="block in aiBlocks" :key="block.title" class="mb-3">
                    <div class="mb-1">
                      <NText strong>{{ block.title }}</NText>
                    </div>
                    <div v-for="(item, i) in block.items" :key="i" class="text-sm leading-6">
                      · {{ item }}
                    </div>
                  </div>
                  <NDivider style="margin: 12px 0" />
                  <div class="text-xs text-muted-foreground">
                    Provider：{{ aiResult.provider || '—' }} ｜ Model：{{ aiResult.model || '—' }} ｜
                    耗时：{{ aiResult.durationMs != null ? `${(aiResult.durationMs / 1000).toFixed(1)}s` : '—' }} ｜
                    Prompt：{{ aiResult.promptKey || '—' }} {{ aiResult.promptVersion || '' }}
                  </div>
                </div>
                <template v-else>
                  <NAlert type="warning" :show-icon="true" class="mb-2">
                    <template #header>当前 AI 分析服务暂不可用，以下仍展示确定性统计结果</template>
                    <template v-if="aiResult?.code || aiResult?.message">
                      状态：{{ aiResult.code || '—' }}；{{ aiResult.message || '' }}
                    </template>
                    <template v-else>AI 分析未执行（可能因数据为空或服务降级）。</template>
                  </NAlert>
                  <NEmpty v-if="stats?.totalRecords === 0" description="统计结果为空（0 条记录），未触发 AI 解释" :size="'small'" />
                </template>
              </NCard>

              <!-- AI-10 管理建议（AI 分析结果 → 结构化管理建议 → 人工确认；AI 只建议，人做最终决定） -->
              <NCard title="管理建议" :bordered="false" class="mb-4" style="margin-bottom: 16px">
                <div v-if="suggestionLoading" class="text-sm text-muted-foreground">正在加载管理建议…</div>

                <!-- 已生成：结构化展示 -->
                <div v-else-if="suggestionReady && suggestionResult?.suggestion">
                  <div class="mb-3">
                    <NText strong>总体判断</NText>
                    <div class="mt-1 text-sm leading-6">
                      {{ suggestionResult.suggestion.overall_assessment || '—' }}
                    </div>
                  </div>
                  <div v-for="block in suggestionBlocks" :key="block.title" class="mb-3">
                    <div class="mb-1">
                      <NText strong>{{ block.title }}</NText>
                    </div>
                    <div v-for="(item, i) in block.items" :key="i" class="text-sm leading-6">
                      {{ block.items.length > 1 ? `${i + 1}. ` : '· ' }}{{ item }}
                    </div>
                  </div>

                  <NDivider style="margin: 12px 0" />
                  <div class="mb-1">
                    <NText strong>依据</NText>
                  </div>
                  <div class="mb-2">
                    <div class="text-sm">统计分析依据：</div>
                    <NList v-if="suggestionBusinessEvidence.length" size="small" :bordered="false">
                      <NListItem v-for="(e, i) in suggestionBusinessEvidence" :key="i">
                        <span class="text-sm">{{ e.evidence_text }}</span>
                      </NListItem>
                    </NList>
                    <div v-else class="text-sm text-muted-foreground">无</div>
                  </div>
                  <div>
                    <div class="text-sm">制度/知识依据：</div>
                    <NList v-if="suggestionKbEvidence.length" size="small" :bordered="false">
                      <NListItem v-for="(e, i) in suggestionKbEvidence" :key="i">
                        <div class="min-w-0">
                          <div class="text-sm font-medium">{{ e.source_field || '—' }}</div>
                          <div class="text-xs text-muted-foreground mt-1 line-clamp-3">{{ e.evidence_text }}</div>
                        </div>
                      </NListItem>
                    </NList>
                    <div v-else class="text-sm text-muted-foreground">本任务未使用知识库或暂无知识依据</div>
                  </div>

                  <NDivider style="margin: 12px 0" />
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-xs text-muted-foreground">
                      Provider：{{ suggestionResult.provider || '—' }} ｜ Model：{{ suggestionResult.model || '—' }} ｜
                      耗时：{{ suggestionResult.durationMs != null ? `${(suggestionResult.durationMs / 1000).toFixed(1)}s` : '—' }} ｜
                      Prompt：{{ suggestionResult.promptKey || '—' }} {{ suggestionResult.promptVersion || '' }}
                      <span v-if="suggestionResult.cached">（已缓存）</span>
                    </div>
                    <NButton size="small" :loading="suggestionGenerating" @click="onGenerateSuggestion(true)">
                      重新生成
                    </NButton>
                  </div>

                <!-- AI-11 人工审核闭环（Human Review 独立于 AI 输出；AI 只建议，人做最终决定） -->
                <div class="mt-4" style="margin-top: 16px">
                  <NDivider style="margin: 0 0 12px" />
                  <div class="mb-2 flex items-center gap-2">
                    <NText strong>人工审核</NText>
                    <HseStatusTag
                      :type="REVIEW_STATUS_MAP[reviewCurrentStatus || 'PENDING_REVIEW']?.type ?? 'neutral'"
                      :label="REVIEW_STATUS_MAP[reviewCurrentStatus || 'PENDING_REVIEW']?.label ?? reviewCurrentStatus ?? '—'"
                    />
                    <NSpin v-if="reviewLoading" size="small" />
                  </div>

                  <!-- 无审核记录：等待人工审核提示 -->
                  <div v-if="!latestReview" class="mb-3">
                    <NAlert type="info" :show-icon="true">
                      AI 管理建议已生成，等待管理人员审核确认。AI 输出仅为建议，最终由管理人员研判决策；
                      审核结果将作为可追溯的人机协同记录保存，不覆盖 AI 原始建议。
                    </NAlert>
                  </div>

                  <!-- 最新审核信息（谁、什么时候、做了什么、意见） -->
                  <NDescriptions v-else :column="3" bordered size="small" class="mb-3">
                    <NDescriptionsItem label="审核动作">
                      {{ REVIEW_ACTION_MAP[latestReview.action || ''] || latestReview.action || '—' }}
                    </NDescriptionsItem>
                    <NDescriptionsItem label="审核人">{{ latestReview.reviewedByName || '—' }}</NDescriptionsItem>
                    <NDescriptionsItem label="审核时间">{{ fmtDateTime(latestReview.reviewedAt) }}</NDescriptionsItem>
                    <NDescriptionsItem v-if="latestReview.humanRemark" label="人工意见" :span="3">
                      {{ latestReview.humanRemark }}
                    </NDescriptionsItem>
                  </NDescriptions>

                  <!-- MODIFIED：人工修改建议（明确区分，不伪装成 AI 输出） -->
                  <div v-if="latestReview?.humanModified" class="mb-3">
                    <NAlert type="warning" :show-icon="true" class="mb-3">
                      <template #header>人工修改建议（由管理人员修改，非 AI 原始输出）</template>
                      以下内容为审核人提交的人工修改版建议，仅作为管理人员最终决策参考；
                      上方仍保留 AI 原始建议原文，未被覆盖。
                    </NAlert>
                    <div class="mb-3">
                      <div class="mb-1">
                        <NText strong>总体判断（人工修改）</NText>
                      </div>
                      <div class="text-sm leading-6">
                        {{ latestReview.humanModified.overall_assessment || '—' }}
                      </div>
                    </div>
                    <div v-for="block in humanModifiedBlocks" :key="block.title" class="mb-3">
                      <div class="mb-1">
                        <NText strong>{{ block.title }}</NText>
                      </div>
                      <div v-for="(item, i) in block.items" :key="i" class="text-sm leading-6">
                        {{ block.items.length > 1 ? `${i + 1}. ` : '· ' }}{{ item }}
                      </div>
                    </div>
                  </div>

                  <!-- 审核操作（仅 admin / safety_manager；AI 不可用时不展示审核入口，不伪造「AI建议已确认」） -->
                  <div v-if="canReview" class="mb-3 flex items-center gap-2">
                    <NButton size="small" type="primary" :loading="reviewSubmitting" @click="openReviewDialog('APPROVE')">
                      确认采纳
                    </NButton>
                    <NButton size="small" type="error" :loading="reviewSubmitting" @click="openReviewDialog('REJECT')">
                      驳回
                    </NButton>
                    <NButton size="small" type="warning" :loading="reviewSubmitting" @click="openModifyDialog">
                      修改后采纳
                    </NButton>
                    <span class="text-xs text-muted-foreground">
                      审核结果与人工意见将留痕保存，不覆盖 AI 原始建议。
                    </span>
                  </div>
                  <div v-else-if="latestReview" class="mb-3 text-xs text-muted-foreground">
                    当前账号无审核权限（仅安全管理员与管理员可审核）。
                  </div>

                  <!-- 审核历史（追加式，可追溯） -->
                  <div v-if="reviewResult?.reviews?.length" class="mb-1">
                    <NText strong>审核历史</NText>
                  </div>
                  <NList v-if="reviewResult?.reviews?.length" size="small" :bordered="false">
                    <NListItem v-for="rv in reviewResult.reviews" :key="rv.id">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <div class="text-sm">
                            <NTag
                              size="small"
                              :bordered="false"
                              :type="reviewTagType(rv.reviewStatus)"
                            >
                              {{ REVIEW_STATUS_MAP[rv.reviewStatus]?.label ?? rv.reviewStatus }}
                            </NTag>
                            <span class="ml-1 text-muted-foreground">
                              {{ REVIEW_ACTION_MAP[rv.action || ''] || rv.action || '—' }}
                            </span>
                          </div>
                          <div v-if="rv.humanRemark" class="mt-1 text-xs text-muted-foreground">
                            {{ rv.humanRemark }}
                          </div>
                        </div>
                        <div class="shrink-0 text-xs text-muted-foreground">
                          {{ rv.reviewedByName || '—' }} · {{ fmtDateTime(rv.reviewedAt) }}
                        </div>
                      </div>
                    </NListItem>
                  </NList>
                  <div v-else class="text-xs text-muted-foreground">暂无审核记录（待人工审核）。</div>
                </div>
              </div>

                <!-- 未生成：生成入口 -->
                <div v-else-if="suggestionResult?.code === 'AI_SUGGESTION_NOT_GENERATED'">
                  <NAlert type="info" :show-icon="true" class="mb-3">
                    本任务尚未生成管理建议。AI 将基于本任务的统计分析结果生成结构化管理建议，
                    供管理人员阅读、确认与引用；AI 输出仅为建议，不替代人工判断。
                  </NAlert>
                  <NButton type="primary" :loading="suggestionGenerating" @click="onGenerateSuggestion(false)">
                    生成管理建议
                  </NButton>
                </div>

                <!-- AI 不可用 / 无效缓存：如实降级，不伪造成功 -->
                <div v-else>
                  <NAlert type="warning" :show-icon="true" class="mb-3">
                    <template #header>当前 AI 服务不可用，无法生成管理建议</template>
                    <template v-if="suggestionResult?.code || suggestionResult?.message">
                      状态：{{ suggestionResult.code || '—' }}；{{ suggestionResult.message || '' }}
                    </template>
                    <template v-else>请根据统计结果由管理人员人工研判。</template>
                  </NAlert>
                  <div class="text-sm text-muted-foreground mb-3">
                    原 AI-09 统计分析结果不受影响，仍可在上方查看。
                  </div>
                  <NButton
                    v-if="suggestionResult"
                    size="small"
                    :loading="suggestionGenerating"
                    @click="onGenerateSuggestion(true)"
                  >
                    重新生成
                  </NButton>
                </div>
              </NCard>

              <!-- Evidence -->
              <NCard title="分析依据（Evidence）" :bordered="false" class="mb-4" style="margin-bottom: 16px">
                <div class="mb-2">
                  <NText strong>数据依据</NText>
                </div>
                <NList v-if="businessEvidence.length" size="small" :bordered="false">
                  <NListItem v-for="(e, i) in businessEvidence" :key="i">
                    <div class="flex items-start justify-between gap-2">
                      <span class="text-sm">{{ e.evidence_text }}</span>
                      <span class="shrink-0">
                        {{ evidenceStrengthTag(e.evidence_strength) }}
                      </span>
                    </div>
                  </NListItem>
                </NList>
                <NEmpty v-else description="暂无数据依据" :size="'small'" />

                <NDivider style="margin: 16px 0" />
                <div class="mb-2">
                  <NText strong>知识依据（制度/标准）</NText>
                </div>
                <NList v-if="kbEvidence.length" size="small" :bordered="false">
                  <NListItem v-for="(e, i) in kbEvidence" :key="i">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="text-sm font-medium">{{ e.source_field || '—' }}</div>
                        <div class="text-xs text-muted-foreground mt-1 line-clamp-3">{{ e.evidence_text }}</div>
                      </div>
                      <span class="shrink-0">
                        {{ evidenceStrengthTag(e.evidence_strength) }}
                      </span>
                    </div>
                  </NListItem>
                </NList>
                <NEmpty v-else description="本任务未使用知识库或暂无知识依据" :size="'small'" />
              </NCard>
            </div>
          </div>
          <NEmpty v-else-if="!detailLoading" description="暂无任务数据" />
        </NSpin>
      </NDrawerContent>
    </NDrawer>

    <!-- AI-11 确认采纳 / 驳回：人工意见弹窗（意见可空，留痕不强制） -->
    <NModal
      v-model:show="reviewDialog.open"
      preset="card"
      :title="reviewDialog.mode === 'APPROVE' ? '确认采纳该 AI 管理建议' : '驳回该 AI 管理建议'"
      style="width: 480px"
      :mask-closable="false"
    >
      <div class="mb-2 text-sm text-muted-foreground">
        {{ reviewDialog.mode === 'APPROVE'
          ? '确认采纳后，该 AI 建议将标记为「已确认采纳」，由管理人员据此研判执行。'
          : '驳回后，该 AI 建议将标记为「已驳回」。驳回不影响 AI 原始建议的留存与查看。' }}
      </div>
      <NInput
        v-model:value="reviewDialog.remark"
        type="textarea"
        placeholder="人工意见（可选，最长 2000 字）"
        :rows="4"
        :maxlength="2000"
        show-count
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="reviewDialog.open = false">取消</NButton>
          <NButton size="small" type="primary" :loading="reviewSubmitting" @click="confirmReviewDialog">
            提交审核
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- AI-11 修改后采纳：六字段人工修改弹窗（预填 AI 原始建议，修改内容独立存储并标注「人工修改」） -->
    <NModal
      v-model:show="modifyDialog.open"
      preset="card"
      title="修改后采纳（人工修改版建议）"
      style="width: 720px"
      :mask-closable="false"
    >
      <NAlert type="warning" :show-icon="true" class="mb-3">
        <template #header>修改内容将独立保存为「人工修改建议」，不覆盖 AI 原始输出</template>
        请基于上方 AI 原始建议进行人工修订；修改版仅供管理人员最终决策参考。
      </NAlert>
      <div class="mb-3">
        <div class="field-label">总体判断（必填）</div>
        <NInput
          v-model:value="modifyDialog.overall"
          type="textarea"
          :rows="2"
          :maxlength="1000"
          placeholder="人工修订后的总体判断"
        />
      </div>
      <NGrid :cols="2" :x-gap="16" responsive="screen">
        <NGi>
          <div class="field-label">重点关注</div>
          <NInput
            v-model:value="modifyDialog.priorityIssues"
            type="textarea"
            :rows="4"
            placeholder="每行一条"
          />
        </NGi>
        <NGi>
          <div class="field-label">管理措施建议（必填）</div>
          <NInput
            v-model:value="modifyDialog.managementActions"
            type="textarea"
            :rows="4"
            placeholder="每行一条"
          />
        </NGi>
        <NGi>
          <div class="field-label">持续监测</div>
          <NInput
            v-model:value="modifyDialog.monitoringPoints"
            type="textarea"
            :rows="4"
            placeholder="每行一条"
          />
        </NGi>
        <NGi>
          <div class="field-label">后续建议</div>
          <NInput
            v-model:value="modifyDialog.followUpSuggestions"
            type="textarea"
            :rows="4"
            placeholder="每行一条"
          />
        </NGi>
        <NGi>
          <div class="field-label">限制说明</div>
          <NInput
            v-model:value="modifyDialog.limitations"
            type="textarea"
            :rows="4"
            placeholder="每行一条"
          />
        </NGi>
        <NGi>
          <div class="field-label">人工意见</div>
          <NInput
            v-model:value="modifyDialog.remark"
            type="textarea"
            :rows="4"
            :maxlength="2000"
            placeholder="人工意见（可选，最长 2000 字）"
            show-count
          />
        </NGi>
      </NGrid>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton size="small" @click="modifyDialog.open = false">取消</NButton>
          <NButton size="small" type="primary" :loading="reviewSubmitting" @click="confirmModifyDialog">
            提交修改后采纳
          </NButton>
        </div>
      </template>
    </NModal>
  </HsePageLayout>
</template>

<style scoped>
.field-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.flex {
  display: flex;
}
.items-center {
  align-items: center;
}
.items-start {
  align-items: flex-start;
}
.justify-between {
  justify-content: space-between;
}
.gap-2 {
  gap: 8px;
}
.mb-1 {
  margin-bottom: 4px;
}
.mb-2 {
  margin-bottom: 8px;
}
.mb-3 {
  margin-bottom: 12px;
}
.mb-4 {
  margin-bottom: 16px;
}
.mt-1 {
  margin-top: 4px;
}
.mt-2 {
  margin-top: 8px;
}
.mt-4 {
  margin-top: 16px;
}
.text-sm {
  font-size: 13px;
}
.text-xs {
  font-size: 12px;
}
.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shrink-0 {
  flex-shrink: 0;
}
.min-w-0 {
  min-width: 0;
}
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.leading-6 {
  line-height: 24px;
}
</style>
