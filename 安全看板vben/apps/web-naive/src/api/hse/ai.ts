/**
 * HSE AI 最小 API 层（web-naive / AI-02）
 *
 * 对应后端路由: server/routes/ai.js + server/routes/ai-enhanced.js
 * 路由前缀: /hse/ai（requestClient baseURL = /api）
 *
 * AI-02 仅建立「基础能力适配」（任务书 §21/§22）：
 * - provider status（AI-02 增强：返回全量 Provider 健康状态，不伪造成功）
 * - AI request（非流式 generate-report）
 * - AI stream（SSE 流式消费：fetch + ReadableStream，正确结束/异常处理）
 *
 * 不新建大型 AI UI 组件体系；页面级能力（报告/聊天/视觉/RAG）留后续阶段。
 */
import { requestClient } from '#/api/request';

export namespace AiApi {
  /** Provider 健康状态（AI-02 任务书 §8） */
  export type ProviderHealthStatus =
    | 'AVAILABLE'
    | 'NOT_CONFIGURED'
    | 'UNREACHABLE'
    | 'AUTH_ERROR'
    | 'MODEL_NOT_FOUND'
    | 'TIMEOUT'
    | 'ERROR'
    | 'DISABLED';

  /** 单个 Provider 健康状态项 */
  export interface ProviderStatusItem {
    provider: string;
    type: string;
    status: ProviderHealthStatus;
    model: string | null;
    configured: boolean;
    available: boolean;
    reason: string | null;
  }

  /** GET /hse/ai/provider/status 响应 */
  export interface ProviderStatusResult {
    provider: string;
    model: string;
    baseUrl: string;
    available: boolean;
    apiKeyConfigured: boolean;
    timeoutMs: number;
    maxRetries: number;
    timestamp: string;
    /** AI-02 新增：AI_ENABLE 开关 */
    aiEnabled: boolean;
    /** AI-02 新增：当前活动 Provider */
    activeProvider: string | null;
    /** AI-02 新增：全量 Provider 真实健康状态 */
    providers: ProviderStatusItem[];
  }

  /** 报告生成参数（对齐后端 generate-report 契约） */
  export interface GenerateReportParams {
    type: 'hazard' | 'accident' | 'training' | 'patrol';
    dataId: number;
    customPrompt?: string;
    format?: string;
  }

  /** 非流式生成结果（对齐后端响应） */
  export interface GenerateReportResult {
    content: string;
    model?: string;
    provider?: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    [k: string]: any;
  }

  // ============ AI-03：/api/hse/ai/v2 统一 API 层（真实可用，Provider 状态如实呈现） ============

  /** v2 Provider 明细项（GET /hse/ai/v2/providers） */
  export interface V2ProviderInfo {
    provider: string;
    type: string;
    status: ProviderHealthStatus;
    model: string | null;
    baseUrl: string | null;
    configured: boolean;
    available: boolean;
    reason: string | null;
    capabilities: Record<string, boolean>;
  }

  /** v2 统一健康（GET /hse/ai/v2/health） */
  export interface V2HealthResult {
    requestId: string | null;
    aiEnabled: boolean;
    activeProvider: string | null;
    providers: V2ProviderInfo[];
    timestamp: string;
  }

  /** v2 模型项（GET /hse/ai/v2/models）——不可用状态如实返回 NOT_CONFIGURED/UNREACHABLE */
  export interface V2ModelInfo {
    provider: string;
    model: string | null;
    available: boolean;
    status: ProviderHealthStatus;
    capabilities: string[];
  }

  /** v2 统一请求体（promptKey 优先；否则 prompt 直传） */
  export interface V2RequestParams {
    promptKey?: string;
    promptVersion?: string;
    prompt?: string;
    systemPrompt?: string;
    provider?: string;
    input?: Record<string, any>;
    source?: { domain?: string; recordId?: number | string };
    options?: Record<string, any>;
  }

  /** v2 generate/analyze 统一响应 */
  export interface V2GenerateResult {
    success: boolean;
    requestId: string;
    traceId: string;
    provider: string;
    model: string | null;
    promptKey: string | null;
    promptVersion: string | null;
    content: string;
    usage: { inputTokens: number; outputTokens: number; durationMs: number };
    evidence: any[];
    recordId: number | null;
    recordSaved: boolean;
    data?: any; // analyze 结构化输出
    confidence?: number | null;
    error?: { code: string; message: string; provider: string | null; retryable: boolean; requestId?: string };
  }

  /** v2 统一 SSE 事件回调（AI-03 §9：start / chunk / end / error） */
  export interface V2StreamHandlers {
    onStart?: (meta: { requestId: string; traceId: string; provider: string | null; model: string | null }) => void;
    onChunk?: (delta: string) => void;
    onEnd?: (meta: { requestId: string; provider: string; model: string | null; durationMs: number }) => void;
    onError?: (err: { code: string; message: string; provider: string | null; retryable: boolean; requestId: string }) => void;
  }
}

/** GET /hse/ai/provider/status —— Provider 健康状态（AI-02 统一增强版） */
export function getProviderStatus() {
  return requestClient.get<AiApi.ProviderStatusResult>('/hse/ai/provider/status');
}

/** POST /hse/ai/generate-report —— AI 报告生成（非流式） */
export function generateReport(data: AiApi.GenerateReportParams) {
  return requestClient.post<AiApi.GenerateReportResult>('/hse/ai/generate-report', data);
}

/** SSE 流式处理回调 */
export interface StreamHandlers {
  onChunk?: (delta: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

/**
 * POST /hse/ai/generate-report?stream=true —— SSE 流式消费（最小实现）
 * 链路：Backend SSE → fetch → ReadableStream 分块 → onChunk → [DONE] → onDone
 */
export async function streamGenerateReport(
  data: AiApi.GenerateReportParams,
  handlers: StreamHandlers = {},
) {
  const params = new URLSearchParams({ stream: 'true' });
  const resp = await fetch(`/api/hse/ai/generate-report?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!resp.ok || !resp.body) {
    handlers.onError?.(`SSE 连接失败（HTTP ${resp.status}）`);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let doneEmitted = false;

  const emitDone = () => {
    if (!doneEmitted) {
      doneEmitted = true;
      handlers.onDone?.();
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          emitDone();
          continue;
        }
        try {
          const json = JSON.parse(payload);
          if (json.content) handlers.onChunk?.(json.content);
          if (json.error) handlers.onError?.(json.error);
        } catch {
          // 非 JSON 数据块（如保活行），忽略
        }
      }
    }
    emitDone();
  } catch (err) {
    handlers.onError?.(err instanceof Error ? err.message : String(err));
  }
}

// ============ AI-03：v2 统一 API（真实可用；Provider 不可用时如实返回状态码） ============

/** GET /hse/ai/v2/health —— 统一健康（AI enabled / active provider / provider 状态） */
export function getHealth() {
  return requestClient.get<AiApi.V2HealthResult>('/hse/ai/v2/health');
}

/** GET /hse/ai/v2/providers —— Provider 能力明细 */
export function getProviders() {
  return requestClient.get<{ providers: AiApi.V2ProviderInfo[] }>('/hse/ai/v2/providers');
}

/** GET /hse/ai/v2/models —— 统一模型列表（不可用状态如实呈现） */
export function getModels() {
  return requestClient.get<{ models: AiApi.V2ModelInfo[] }>('/hse/ai/v2/models');
}

/** POST /hse/ai/v2/generate —— 统一非流式生成（经 AI Gateway） */
export function generate(data: AiApi.V2RequestParams) {
  return requestClient.post<AiApi.V2GenerateResult>('/hse/ai/v2/generate', data);
}

/** POST /hse/ai/v2/analyze —— 统一结构化分析（经 AI Gateway） */
export function analyze(data: AiApi.V2RequestParams) {
  return requestClient.post<AiApi.V2GenerateResult>('/hse/ai/v2/analyze', data);
}

/**
 * POST /hse/ai/v2/stream —— 统一 SSE（event: start / chunk / end / error）
 * 真实 Provider 不可用时后端发 event:error（如 AI_PROVIDER_NOT_CONFIGURED），
 * 前端必须走 onError 停止加载，不得一直 loading 或假装成功（AI-03 §22）。
 */
export async function stream(data: AiApi.V2RequestParams, handlers: AiApi.V2StreamHandlers = {}) {
  const resp = await fetch('/api/hse/ai/v2/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!resp.ok || !resp.body) {
    handlers.onError?.({
      code: 'AI_INVALID_REQUEST',
      message: `SSE 连接失败（HTTP ${resp.status}）`,
      provider: null,
      retryable: false,
      requestId: '',
    });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let event = 'message';
  let settled = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('event:')) {
          event = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          event = 'message';
          continue;
        }
        let json: any = null;
        try {
          json = JSON.parse(payload);
        } catch {
          event = 'message';
          continue;
        }
        if (event === 'start') {
          handlers.onStart?.({
            requestId: json.requestId ?? '',
            traceId: json.traceId ?? '',
            provider: json.provider ?? null,
            model: json.model ?? null,
          });
        } else if (event === 'end') {
          handlers.onEnd?.({
            requestId: json.requestId ?? '',
            provider: json.provider ?? '',
            model: json.model ?? null,
            durationMs: json.durationMs ?? 0,
          });
          settled = true;
        } else if (event === 'error') {
          handlers.onError?.({
            code: json.code ?? 'AI_INTERNAL_ERROR',
            message: json.message ?? 'AI 未知错误',
            provider: json.provider ?? null,
            retryable: !!json.retryable,
            requestId: json.requestId ?? '',
          });
          settled = true;
        } else if (json.content != null) {
          handlers.onChunk?.(String(json.content));
        }
        event = 'message';
        if (settled) break;
      }
      if (settled) break;
    }
  } catch (err) {
    handlers.onError?.({
      code: 'AI_INTERNAL_ERROR',
      message: err instanceof Error ? err.message : String(err),
      provider: null,
      retryable: true,
      requestId: '',
    });
  }
}

// ============ AI-07：analysis-tasks 异步分析任务（AI-08 PC 端正式接入） ============
//
// 后端 /api/hse/ai/v2/* 统一信封为 { success: true, ...payload } / { success: false, error: {...} }，
// 与业务 API 的 { code:0, data } 信封不同。因此本段方法必须使用 responseReturn:'body'
// 获取原始响应体，再经 unwrapAiEnvelope 解包：success=false 时抛出携带 error.code 的 Error。
// 错误响应为 HTTP 200 + 错误体（AI 统一错误模型）；401/403 等 HTTP 错误仍走 requestClient 标准拦截器。

/** AI-07 任务状态 */
export type AnalysisTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRYING';

/**
 * AI-09 数据范围（截断可见，随 statisticsSnapshot.dataScope 返回）：
 *  - totalAvailable：同一过滤条件下数据库 COUNT(*) 总量（不加载全部记录）
 *  - analyzedRecords：本次实际 LIMIT 拉取并参与统计的条数
 *  - limit：本次读取上限（默认 1000，上限 2000）
 *  - truncated：true 表示仅分析了部分数据，结果可能无法代表全部
 */
export interface AiDataScope {
  totalAvailable: number;
  analyzedRecords: number;
  limit: number;
  truncated: boolean;
}

/** 分析任务对象（与后端 toApiTask 序列化一致） */
export interface AiAnalysisTask {
  id: number;
  taskType: string;
  domain: string;
  status: AnalysisTaskStatus;
  priority: number;
  requestHash: string;
  requestPayload: {
    domain: string;
    timeRange: { start: string | null; end: string | null } | null;
    filters: Record<string, any>;
    analysisTypes: string[];
    useRag: boolean;
    provider: string | null;
    model: string | null;
    limit: number | null;
  } | null;
  statisticsSnapshot: any | null;
  aiResult: any | null;
  evidence: any[];
  generationRecordId: number | null;
  provider: string | null;
  model: string | null;
  degraded: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  errorRetryable: boolean;
  cancelRequestedAt: string | null;
  createdBy: number | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

/** 创建分析任务请求体（对齐后端 validateCreateRequest） */
export interface CreateAnalysisTaskParams {
  taskType?: string; // 默认 DATA_ANALYSIS
  domain: string;
  timeRange?: { start?: string; end?: string } | null;
  filters?: Record<string, any>;
  analysisTypes?: string[];
  useRag?: boolean;
  provider?: string | null;
  model?: string | null;
  limit?: number | null;
}

/** POST /analysis-tasks 响应（解包后） */
export interface CreateAnalysisTaskResult {
  task: { id: number; status: string; taskType: string; domain: string };
  reused: boolean;
}

/** GET /analysis-tasks 列表参数 */
export interface ListAnalysisTasksParams {
  page?: number;
  pageSize?: number;
  status?: string;
  domain?: string;
}

/** GET /analysis-tasks 响应（解包后） */
export interface ListAnalysisTasksResult {
  list: AiAnalysisTask[];
  total: number;
  page: number;
  pageSize: number;
}

/** POST /analysis-tasks/:id/cancel 响应（解包后） */
export interface CancelAnalysisTaskResult {
  task: AiAnalysisTask;
  cancelled: boolean;
  cancelRequested?: boolean;
  note: string;
}

interface AiV2Envelope {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    provider?: string | null;
    retryable?: boolean;
    requestId?: string;
  };
  [k: string]: any;
}

/** 解包 AI v2 信封：success=true 返回 payload；success=false 抛出携带 code 的 Error */
function unwrapAiEnvelope<T>(body: AiV2Envelope): T {
  if (!body || body.success !== true) {
    const err = body?.error ?? {};
    const e = new Error(err.message || 'AI 请求失败');
    (e as any).code = err.code || 'AI_UNKNOWN_ERROR';
    (e as any).aiProvider = err.provider ?? null;
    (e as any).aiRetryable = Boolean(err.retryable);
    throw e;
  }
  const { success: _success, error: _error, ...rest } = body;
  return rest as T;
}

/** POST /hse/ai/v2/analysis-tasks —— 创建分析任务（同步返回 PENDING，不等待 AI 执行） */
export function createAnalysisTask(data: CreateAnalysisTaskParams) {
  return requestClient
    .post<AiV2Envelope>('/hse/ai/v2/analysis-tasks', data, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<CreateAnalysisTaskResult>(body));
}

/** GET /hse/ai/v2/analysis-tasks/:id —— 任务详情 */
export function getAnalysisTask(id: number) {
  return requestClient
    .get<AiV2Envelope>(`/hse/ai/v2/analysis-tasks/${id}`, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<{ task: AiAnalysisTask }>(body));
}

/** GET /hse/ai/v2/analysis-tasks —— 任务列表（服务端分页；仅当前登录用户创建的任务） */
export function listAnalysisTasks(params: ListAnalysisTasksParams = {}) {
  return requestClient
    .get<AiV2Envelope>('/hse/ai/v2/analysis-tasks', {
      responseReturn: 'body',
      params,
    })
    .then((body) => unwrapAiEnvelope<ListAnalysisTasksResult>(body));
}

/** POST /hse/ai/v2/analysis-tasks/:id/cancel —— 取消任务（PENDING→CANCELLED；RUNNING 仅记录取消请求） */
export function cancelAnalysisTask(id: number) {
  return requestClient
    .post<AiV2Envelope>(`/hse/ai/v2/analysis-tasks/${id}/cancel`, {}, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<CancelAnalysisTaskResult>(body));
}

// ============ AI-10：管理建议（AI 分析结果 → 结构化管理建议 → 人工确认） ============

/** 管理建议结构化协议（AI-10 任务书 §6） */
export interface ManagementSuggestion {
  overall_assessment: string;
  priority_issues: string[];
  management_actions: string[];
  monitoring_points: string[];
  follow_up_suggestions: string[];
  limitations: string[];
}

/**
 * 管理建议结果（POST/GET /analysis-tasks/:id/management-suggestions 解包后）：
 *  - available=false 时不伪造成功：AI 不可用（AI_UNAVAILABLE）或未生成（AI_SUGGESTION_NOT_GENERATED）
 *  - 原 AI-09 统计结果通过 statistics 保留展示
 */
export interface ManagementSuggestionResult {
  taskId: number;
  available: boolean;
  structured?: boolean | null;
  suggestion?: ManagementSuggestion | null;
  code?: string | null;
  message?: string | null;
  provider?: string | null;
  model?: string | null;
  promptKey?: string | null;
  promptVersion?: string | null;
  durationMs?: number | null;
  recordId?: number | null;
  recordSaved?: boolean;
  recordError?: string;
  evidence?: any[];
  statistics?: any | null;
  cached?: boolean;
  degraded?: boolean;
  createdAt?: string | null;
}

/** POST 生成管理建议参数 */
export interface GenerateManagementSuggestionParams {
  provider?: string | null;
  force?: boolean;
}

/** POST /hse/ai/v2/analysis-tasks/:id/management-suggestions —— 生成管理建议（写：admin/safety_manager） */
export function generateManagementSuggestion(
  id: number,
  params: GenerateManagementSuggestionParams = {},
) {
  return requestClient
    .post<AiV2Envelope>(`/hse/ai/v2/analysis-tasks/${id}/management-suggestions`, params, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<ManagementSuggestionResult>(body));
}

/** GET /hse/ai/v2/analysis-tasks/:id/management-suggestions —— 查询已生成的管理建议（不触发生成） */
export function getManagementSuggestion(id: number) {
  return requestClient
    .get<AiV2Envelope>(`/hse/ai/v2/analysis-tasks/${id}/management-suggestions`, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<ManagementSuggestionResult>(body));
}

// ============ AI-11：管理建议人工审核（Human Review 闭环，独立于 AI 输出） ============
//
// 人工审核记录独立存于 ai_generation_reviews 表（追加式历史，latest 行 = 当前有效状态）；
// AI 原始建议（ai_generation_records.result）永不被审核覆盖，人工修改内容以 humanModified
// 独立保存并明确标注为「人工修改」，不伪装成 AI 输出。
// 审核接口不经过 AI Gateway，不受 AI 生成超时影响。

/** 人工审核状态（latest 审核记录 = 当前有效状态） */
export type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'MODIFIED';

/** 人工审核动作（APPROVE→APPROVED / REJECT→REJECTED / MODIFY→MODIFIED） */
export type ReviewAction = 'APPROVE' | 'REJECT' | 'MODIFY';

/** 单条人工审核记录（GET /analysis-tasks/:id/management-suggestions/reviews） */
export interface AiReviewRecord {
  id: number;
  generationRecordId: number;
  taskId: number;
  reviewStatus: ReviewStatus;
  previousStatus: ReviewStatus | null;
  action: ReviewAction | null;
  reviewedBy: number | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  humanRemark: string | null;
  humanModified: ManagementSuggestion | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** GET /analysis-tasks/:id/management-suggestions/reviews 响应（解包后） */
export interface ManagementSuggestionReviewsResult {
  taskId: number;
  generationRecordId: number | null;
  currentStatus: ReviewStatus | null;
  reviews: AiReviewRecord[];
}

/** POST /analysis-tasks/:id/management-suggestions/review 请求体 */
export interface SubmitReviewParams {
  action: ReviewAction;
  /** 人工意见（可空；最长 2000 字） */
  humanRemark?: string | null;
  /** MODIFY 时的人工修改六字段建议（独立存储，不覆盖 AI 原始输出） */
  humanModified?: ManagementSuggestion | null;
  /** 乐观并发：客户端所见当前状态；与服务器不一致时后端返回 AI_REVIEW_STATE_CONFLICT */
  previousStatus?: ReviewStatus | null;
}

/** POST review 响应（解包后；idempotent=true 表示重复提交未新增历史） */
export interface SubmitReviewResult {
  idempotent: boolean;
  review: AiReviewRecord;
  taskId: number;
  generationRecordId: number;
}

/** POST /hse/ai/v2/analysis-tasks/:id/management-suggestions/review —— 提交人工审核（写：admin/safety_manager） */
export function submitManagementSuggestionReview(id: number, params: SubmitReviewParams) {
  return requestClient
    .post<AiV2Envelope>(`/hse/ai/v2/analysis-tasks/${id}/management-suggestions/review`, params, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<SubmitReviewResult>(body));
}

/** GET /hse/ai/v2/analysis-tasks/:id/management-suggestions/reviews —— 查询人工审核历史（任意登录用户） */
export function getManagementSuggestionReviews(id: number) {
  return requestClient
    .get<AiV2Envelope>(`/hse/ai/v2/analysis-tasks/${id}/management-suggestions/reviews`, {
      responseReturn: 'body',
    })
    .then((body) => unwrapAiEnvelope<ManagementSuggestionReviewsResult>(body));
}
