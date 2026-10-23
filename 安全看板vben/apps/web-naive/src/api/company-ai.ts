/**
 * 公司级 AI Skill API（web-naive / AI-Phase-01-02）
 *
 * 对应后端路由：server/routes/company-ai.js（前缀 /api/company/ai，requestClient baseURL = /api）
 * 首个 Skill：SK-005 企业知识问答（company.knowledge.answer）。
 *
 * 信封差异（与 #/api/hse/ai 一致的处理方式）：
 * 后端 /api/company/ai/* 返回 AI 统一信封 { success:true, ...payload } / { success:false, error:{...} }，
 * 与业务 API 的 { code:0, data } 不同，故使用 responseReturn:'body' + unwrap 解包；
 * success=false 时抛出携带 error.code 的 Error（错误仍为 HTTP 200 + 结构化错误体）。
 * 401/403 等 HTTP 错误仍走 requestClient 标准拦截器。
 */
import { requestClient } from '#/api/request';

/**
 * SK-005 回答为同步模型调用（本地 Ollama 实测约 12~25s），
 * 必须覆盖 requestClient 默认的 10s 超时，否则必然报 timeout of 10000ms exceeded
 * （与 #/api/trainingOcr.ts 的 OCR_TIME_OUT 同一处理范式）。
 */
const KNOWLEDGE_ANSWER_TIMEOUT = 120 * 1000;
/**
 * SK-003 上下文预算（3200 字符）大于 SK-005/SK-001/SK-002，本地 qwen2.5:7b CPU prefill
 * 实测约 105~140s，120s 预算不够；后端 AI_TIMEOUT_MS=300000，前端对齐放宽到 240s。
 */
const INSPECTION_ANALYSIS_TIMEOUT = 240 * 1000;

export namespace CompanyAiApi {
  /** 置信度（后端 confidence 协议） */
  export type SkillConfidence = 'high' | 'low' | 'medium';

  /** 技能标识块 */
  export interface SkillRef {
    id: string;
    name: string;
    key: string;
    version: string;
    domain: string;
    type: string;
  }

  /** 可追溯引用（字段缺失为 null，后端不伪造） */
  export interface SkillEvidence {
    citation_id: number;
    chunk_id: number | string | null;
    document_id: number | string | null;
    document_name: string | null;
    source_id: number | string | null;
    source_name: string | null;
    source_type: string | null;
    page: number | null;
    section: string | null;
    content: string;
    score: number | null;
    evidence_strength: 'high' | 'low' | 'medium' | null;
  }

  /** SK-005 统一输出协议 metadata */
  export interface SkillAnswerMetadata {
    skill_key: string;
    skill_id: string;
    skill_version: string;
    model_policy: string;
    prompt_key: string;
    prompt_version: string;
    provider: string | null;
    model: string | null;
    duration_ms: number;
    retrieval: {
      mode: string;
      available: boolean;
      top_k: number;
      filters: Record<string, any>;
      scope: { requested: string[]; applied: string; acl: boolean };
      count: number;
      best_score: number | null;
      embedding_model: string | null;
      embedding_dimension: number | null;
    };
    record_id: number | null;
    record_saved: boolean;
    gateway_request_id: string | null;
    trace_id: string | null;
    usage: { input_tokens: number; output_tokens: number };
    citation_required: boolean;
    conversation_id: string | null;
    permission_model: string;
    disclaimer: string;
  }

  /** SK-005 统一输出协议 */
  export interface SkillAnswerResult {
    success: boolean;
    skill: SkillRef;
    request_id: string;
    answer: string;
    evidence: SkillEvidence[];
    confidence: SkillConfidence;
    warnings: string[];
    suggestions: string[];
    metadata: SkillAnswerMetadata;
  }

  /** POST /company/ai/skills/SK-005/answer 入参 */
  export interface SkillAnswerParams {
    question: string;
    /** all | sourceType:<类型> | sourceId:<ID>（当前检索层仅支持单一 sourceType / 单一 sourceId） */
    knowledge_scope?: string[];
    conversation_id?: null | string;
    top_k?: number;
    require_citation?: boolean;
  }

  /** Skill 元数据（GET /company/ai/skills/SK-005） */
  export interface SkillManifest {
    id: string;
    name: string;
    key: string;
    version: string;
    domain: string;
    type: string;
    allowed_roles: string[];
    model_policy: string;
    prompt_key: string;
    prompt_version: string;
    input_schema: Record<string, any>;
    output_schema: Record<string, any>;
  }
}

interface CompanyAiEnvelope {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    provider?: null | string;
    retryable?: boolean;
    requestId?: string;
    details?: any;
  };
  [k: string]: any;
}

/** 解包 AI 信封：success=true 返回 payload；success=false 抛出携带 code 的 Error */
function unwrapEnvelope<T>(body: CompanyAiEnvelope): T {
  if (!body || body.success !== true) {
    const err = body?.error ?? {};
    const e = new Error(err.message || 'AI 请求失败');
    (e as any).code = err.code || 'AI_UNKNOWN_ERROR';
    (e as any).aiProvider = err.provider ?? null;
    (e as any).aiRetryable = Boolean(err.retryable);
    (e as any).aiDetails = err.details ?? null;
    throw e;
  }
  const { success: _success, error: _error, ...rest } = body;
  return rest as T;
}

/** POST /company/ai/skills/SK-005/answer —— SK-005 企业知识问答 */
export function answerCompanyKnowledge(params: CompanyAiApi.SkillAnswerParams) {
  return requestClient
    .post<CompanyAiEnvelope>('/company/ai/skills/SK-005/answer', params, {
      responseReturn: 'body',
      timeout: KNOWLEDGE_ANSWER_TIMEOUT,
    })
    .then((body) =>
      unwrapEnvelope<Omit<CompanyAiApi.SkillAnswerResult, 'success'>>(body),
    );
}

/** GET /company/ai/skills/SK-005 —— SK-005 元数据（Prompt 版本 / 模型策略 / 输入输出协议） */
export function getCompanyKnowledgeManifest() {
  return requestClient
    .get<CompanyAiEnvelope>('/company/ai/skills/SK-005', {
      responseReturn: 'body',
    })
    .then((body) => unwrapEnvelope<{ skill: CompanyAiApi.SkillManifest }>(body));
}

/* ══════════════════════════════════════════════════════════════
 * SK-001 Excel 数据分析（company.excel.analysis · AI-Phase-01-04）
 * multipart/form-data：file + analysis_goal + sheet_name（可选）
 * 同步模型调用，必须覆盖默认 10s 超时（与 SK-005 同一处理范式）。
 * ══════════════════════════════════════════════════════════════ */

export namespace CompanyExcelApi {
  /** 确定性分析结果（后端 result 字段；数字全部由程序计算） */
  export interface AnalysisResult {
    dataset: {
      file_name: string;
      sheet_name: string;
      sheet_count: number;
      row_count: number;
      column_count: number;
      total_rows_in_file: number;
      parsed_at: string;
      engine: string;
    };
    quality: {
      total_rows: number;
      non_empty_rows: number;
      empty_cells: number;
      empty_rate: number;
      duplicate_rows: number;
      duplicate_samples: Array<{ dup_row: number; first_row: number }>;
      truncated_rows: number;
      truncated_cols: number;
    };
    columns: Array<{
      name: string;
      type: 'date' | 'mixed' | 'number' | 'string';
      non_empty: number;
      empty: number;
      empty_rate: number;
      invalid: number;
    }>;
    statistics: Array<{
      column: string;
      count: number;
      empty_or_invalid: number;
      sum: number;
      mean: null | number;
      min: null | number;
      max: null | number;
    }>;
    group_by: Array<{
      column: string;
      distinct: number;
      truncated: boolean;
      items: Array<{ value: string; count: number; share: number }>;
    }>;
    ranking: Array<{
      by: string;
      of: string;
      items: Array<{ value: string; sum: number; mean: null | number; count: number }>;
      note: string;
    }>;
    trend: Array<{
      column: string;
      granularity: string;
      span: { days: number; from: string; to: string };
      invalid_dates: number;
      truncated: boolean;
      points: Array<{ period: string; count: number; sums: Record<string, number> }>;
    }>;
    anomalies: {
      zscore: Array<{ column: string; row: number; value: number; z: number }>;
      high_empty_cols: Array<{ column: string; empty_rate: number }>;
      duplicates: null | number;
    };
    sample_rows: Array<Record<string, null | string>>;
  }

  /** SK-001 Evidence（aiEvidenceService.createEvidence 产物，snake_case） */
  export interface ExcelEvidence {
    source_type: string;
    source_id: null | number | string;
    source_domain: string;
    source_field: null | string;
    evidence_text: string;
    evidence_strength: 'high' | 'low' | 'medium';
    created_at: string;
  }

  /** SK-001 统一输出协议 */
  export interface SkillAnalyzeResult {
    success: boolean;
    skill: SkillRef & { status?: string };
    request_id: string;
    result: AnalysisResult;
    answer: string;
    evidence: ExcelEvidence[];
    confidence: SkillConfidence;
    warnings: string[];
    suggestions: string[];
    metadata: {
      skill_key: string;
      skill_id: string;
      skill_version: string;
      model_policy: string;
      prompt_key: string;
      prompt_version: string;
      provider: null | string;
      model: null | string;
      duration_ms: number;
      record_id: null | number;
      record_saved: boolean;
      gateway_request_id: null | string;
      trace_id: null | string;
      usage: { input_tokens: number; output_tokens: number };
      file: {
        file_name: string;
        sheet_name: string;
        sheet_count: number;
        row_count: number;
        column_count: number;
      };
      permission_model: string;
      disclaimer: string;
      ai_called: boolean;
      ai_context_chars?: number;
    };
  }
}

/** POST /company/ai/skills/SK-001/analyze —— SK-001 Excel 数据分析（multipart） */
export function analyzeCompanyExcel(form: FormData) {
  return requestClient
    .post<CompanyAiEnvelope>('/company/ai/skills/SK-001/analyze', form, {
      responseReturn: 'body',
      timeout: KNOWLEDGE_ANSWER_TIMEOUT,
      // multipart 上传必须清掉 requestClient 默认的 JSON Content-Type，
      // 否则后端 multer 解析不到文件（与 hse/batch-import.ts 同一处理范式）
      headers: { 'Content-Type': undefined as any },
    })
    .then((body) =>
      unwrapEnvelope<Omit<CompanyExcelApi.SkillAnalyzeResult, 'success'>>(body),
    );
}

/* ══════════════════════════════════════════════════════════════
 * SK-002 文档解析（company.document.parse · AI-Phase-01-05）
 * multipart/form-data：file + parse_goal + extract_structure/tables/metadata（可选，默认 true）
 * 同步模型调用，必须覆盖默认 10s 超时（与 SK-005/SK-001 同一处理范式）。
 * ══════════════════════════════════════════════════════════════ */

export namespace CompanyDocumentApi {
  /** 确定性解析结果（后端 result 字段；结构统计全部由程序计算，未可靠识别的字段为 null） */
  export interface DocumentResult {
    document: {
      file_name: string;
      file_type: string;
      file_size: number;
      page_count: null | number;
      title: null | string;
      author: null | string;
      created_at: null | string;
      modified_at: null | string;
      parsed_at: string;
      engine: string;
    };
    structure: {
      heading_count: null | number;
      heading_count_by_level: null | Record<string, number>;
      paragraph_count: number;
      total_paragraph_in_doc: number;
      non_empty_paragraphs: number;
      empty_paragraphs: number;
      list_item_count: null | number;
      table_count: null | number;
      table_total_rows: null | number;
      table_total_cols_max: null | number;
      image_count: null | number;
      text_chars: number;
    };
    headings: null | Array<{ level: null | number; text: string }>;
    paragraphs: Array<{
      index: number;
      text: string;
      style: string;
      page: null | number;
      section: null;
    }>;
    tables: null | Array<{
      rows: number;
      columns: number;
      headers: string[];
      sample: string[][];
    }>;
    quality: {
      extractable: boolean;
      truncated: boolean;
      truncated_paragraphs: number;
      truncated_tables: number;
      warnings: string[];
    };
  }

  /** SK-002 Evidence（aiEvidenceService.createEvidence 产物，snake_case） */
  export interface DocumentEvidence {
    source_type: string;
    source_id: null | number | string;
    source_domain: string;
    source_field: null | string;
    evidence_text: string;
    evidence_strength: 'high' | 'low' | 'medium';
    created_at: string;
  }

  /** SK-002 统一输出协议 */
  export interface SkillParseResult {
    success: boolean;
    skill: SkillRef & { status?: string };
    request_id: string;
    result: DocumentResult;
    answer: string;
    evidence: DocumentEvidence[];
    confidence: SkillConfidence;
    warnings: string[];
    suggestions: string[];
    metadata: {
      skill_key: string;
      skill_id: string;
      skill_version: string;
      model_policy: string;
      prompt_key: string;
      prompt_version: string;
      provider: null | string;
      model: null | string;
      duration_ms: number;
      record_id: null | number;
      record_saved: boolean;
      gateway_request_id: null | string;
      trace_id: null | string;
      usage: { input_tokens: number; output_tokens: number };
      file: {
        file_name: string;
        file_type: string;
        file_size: number;
        page_count: null | number;
      };
      permission_model: string;
      disclaimer: string;
      ai_called: boolean;
      ai_context_chars?: number;
    };
  }
}

/** POST /company/ai/skills/SK-002/parse —— SK-002 文档解析（multipart） */
export function parseCompanyDocument(form: FormData) {
  return requestClient
    .post<CompanyAiEnvelope>('/company/ai/skills/SK-002/parse', form, {
      responseReturn: 'body',
      timeout: KNOWLEDGE_ANSWER_TIMEOUT,
      // multipart 上传必须清掉 requestClient 默认的 JSON Content-Type（同 SK-001 范式）
      headers: { 'Content-Type': undefined as any },
    })
    .then((body) =>
      unwrapEnvelope<Omit<CompanyDocumentApi.SkillParseResult, 'success'>>(body),
    );
}

/* ══════════════════════════════════════════════════════════════
 * SK-003 检查数据分析（company.inspection.analysis · AI-Phase-01-06）
 * JSON body：data（结构化行数组）或 source（数据来源，如 hse_grid）二选一。
 * 公司级通用检查数据分析：确定性统计（总量/分组/排名/趋势/同比环比/极值/异常）+ AI 解读；
 * 统计数字全部来自后端 result（程序确定性计算），AI 文字仅为解读。
 * ══════════════════════════════════════════════════════════════ */

export namespace CompanyInspectionApi {
  /** 字段语义映射（resolved：语义键 ← 原始字段名） */
  export type FieldMapping = Partial<
    Record<
      | 'category'
      | 'date'
      | 'description'
      | 'inspector'
      | 'location'
      | 'metric'
      | 'organization'
      | 'project'
      | 'status'
      | 'subject'
      | 'type',
      string
    >
  >;

  /** 质量检查项 */
  export interface QualityCheck {
    check: string;
    status: string;
    detail: string;
  }

  /** 分组统计 */
  export interface Group {
    dimension: string;
    label: string;
    source_field: null | string;
    distinct: number;
    truncated: boolean;
    items: Array<{
      value: string;
      count: number;
      share: number;
      metric_sums?: Record<string, number>;
    }>;
  }

  /** 排名 */
  export interface Ranking {
    dimension: string;
    label: string;
    top_n: number;
    truncated: boolean;
    items: Array<{ rank: number; value: string; count: number; share: number }>;
  }

  /** 时间趋势 */
  export interface Trend {
    dimension: 'date';
    label: string;
    source_field: null | string;
    granularity: 'day' | 'month' | 'quarter' | 'week' | 'year';
    span: null | { days: number; from: string; to: string };
    invalid_dates: number;
    truncated: boolean;
    points: Array<{
      period: string;
      period_start: string;
      count: number;
      sums: Record<string, number>;
    }>;
    missing_periods: Array<{ period: string; note: string }>;
  }

  /** 同比 / 环比 */
  export interface Compare {
    granularity: null | string;
    latest?: { period: string; count: number };
    mom: null | CompareItem;
    yoy: null | CompareItem;
  }

  export type CompareItem =
    | {
        available: false;
        reason: string;
      }
    | {
        available: true;
        base: { period: string; count: number };
        against: { period: string; count: number };
        change: number;
        change_pct: null | number;
        basis: string;
      };

  /** 极值 */
  export interface Extreme {
    dimension: string;
    label: string;
    max: { value: string; count: number; tied: boolean };
    min: { value: string; count: number; tied: boolean };
  }

  /** 异常（必须含依据 basis；missing_periods 为数据问题而非业务结论） */
  export interface Anomaly {
    type: 'concentration' | 'metric_zscore' | 'missing_periods' | 'trend_drop' | 'trend_spike';
    target: string;
    value: number;
    baseline: number;
    deviation_pct: null | number;
    basis: string;
    note: string;
  }

  /** 确定性分析结果（后端 result 字段；数字全部由程序计算） */
  export interface AnalysisResult {
    dataset: {
      source: null | string;
      row_count: number;
      total_rows_in_input: number;
      valid_rows: number;
      invalid_rows: number;
      time_span: null | { days: number; from: string; to: string };
      parsed_at: string;
      engine: string;
    };
    mapping: {
      resolved: FieldMapping;
      unresolved: string[];
      labels: Record<string, string>;
    };
    quality: {
      checks: QualityCheck[];
      duplicates: number;
      duplicate_samples: Array<{ dup_row: number; first_row: number }>;
      unparseable_dates: number;
      unparseable_samples: Array<{ row: number; value: string }>;
      outside_time_range: number;
      null_rates: Record<string, number>;
      high_null_fields: Array<{ field: string; label: string; null_rate: number }>;
      metric_type_invalid: number;
      metric_empty: number;
    };
    totals: { invalid: number; outside_time_range: number; total: number; valid: number };
    groups: Group[];
    rankings: Ranking[];
    trend: null | Trend;
    compare: Compare;
    extremes: Extreme[];
    anomalies: Anomaly[];
    metric_columns: Array<{ key: string; source_field: null | string }>;
    sample_rows: Array<Record<string, null | string>>;
  }

  /** SK-003 Evidence（aiEvidenceService.createEvidence 产物，snake_case） */
  export interface InspectionEvidence {
    source_type: string;
    source_id: null | number | string;
    source_domain: string;
    source_field: null | string;
    evidence_text: string;
    evidence_strength: 'high' | 'low' | 'medium';
    created_at: string;
  }

  /** SK-003 统一输出协议 */
  export interface SkillAnalyzeResult {
    success: boolean;
    skill: SkillRef & { status?: string };
    request_id: string;
    result: AnalysisResult;
    answer: string;
    evidence: InspectionEvidence[];
    confidence: SkillConfidence;
    warnings: string[];
    suggestions: string[];
    metadata: {
      skill_key: string;
      skill_id: string;
      skill_version: string;
      model_policy: string;
      prompt_key: string;
      prompt_version: string;
      provider: null | string;
      model: null | string;
      duration_ms: number;
      record_id: null | number;
      record_saved: boolean;
      gateway_request_id: null | string;
      trace_id: null | string;
      usage: { input_tokens: number; output_tokens: number };
      source: {
        type: string;
        description: string;
        row_count: number;
        access_mode: string;
        filters: Record<string, any>;
      };
      permission_model: string;
      disclaimer: string;
      ai_called: boolean;
      ai_context_chars?: number;
    };
  }

  /** POST /company/ai/skills/SK-003/analyze 入参（data 与 source 二选一） */
  export interface SkillAnalyzeParams {
    /** 结构化行数组（与 source 二选一） */
    data?: Array<Record<string, any>>;
    /** 数据来源（hse_grid：HSE 检查记录库，只读 SELECT） */
    source?: { type: string };
    /** 分析目标（可选，≤500 字） */
    analysis_goal?: string;
    /** 时间范围过滤（YYYY-MM-DD） */
    time_range?: { from?: null | string; to?: null | string };
    /** 分组维度（通用语义键，不填=自动） */
    group_by?: string[];
    /** 排名 TOP N（默认 10，上限 50） */
    top_n?: number;
    /** 分组/排名排序：name=按名称 count=按条数（默认 count） */
    sort?: 'count' | 'name';
    /** 同比环比：mom / yoy（不填=都算） */
    compare?: Array<'mom' | 'yoy'>;
    /** 显式字段映射（语义键 ← 原始字段名） */
    field_mapping?: Record<string, string>;
    require_citation?: boolean;
  }
}

/** POST /company/ai/skills/SK-003/analyze —— SK-003 检查数据分析（JSON，同步模型调用） */
export function analyzeCompanyInspection(
  params: CompanyInspectionApi.SkillAnalyzeParams,
) {
  return requestClient
    .post<CompanyAiEnvelope>('/company/ai/skills/SK-003/analyze', params, {
      responseReturn: 'body',
      timeout: INSPECTION_ANALYSIS_TIMEOUT,
    })
    .then((body) =>
      unwrapEnvelope<
        Omit<CompanyInspectionApi.SkillAnalyzeResult, 'success'>
      >(body),
    );
}

/* ══════════════════════════════════════════════════════════════
 * SK-004 报告生成（company.report.generate · AI-Phase-01-07）
 * JSON body：facts / analysis（可直接传 SK-003 result）/ document（SK-002 结果）/ evidence 至少其一。
 * 「事实先于文字」：确定性表格由后端程序从 facts/analysis 直接组装，AI 只写文字、不得改数；
 * 报告正文与事实依据分离展示（sections + facts + evidence + warnings + consistency）。
 * ══════════════════════════════════════════════════════════════ */

/**
 * SK-004 为同步模型调用：maxTokens=2600，本地 qwen2.5:7b CPU 单次可达 ~200s；
 * 一致性不通过会自动重试一次（最多 2 次生成），后端 AI_TIMEOUT_MS=600000，前端对齐放宽到 600s。
 */
const REPORT_GENERATE_TIMEOUT = 600 * 1000;

export namespace CompanyReportApi {
  export type ReportType =
    | 'business_analysis'
    | 'custom'
    | 'inspection_monthly'
    | 'inspection_summary'
    | 'management_report';

  /** 确定性表格（后端从 facts/analysis 直接组装，AI 不得改数） */
  export interface SectionTable {
    title: string;
    columns: string[];
    rows: any[][];
  }

  /** 报告章节（content=AI 文字；tables=确定性表格；evidence_ids=输出层引用 ev_001…） */
  export interface ReportSection {
    key: string;
    title: string;
    content: string;
    tables: SectionTable[];
    evidence_ids: string[];
  }

  /** SK-004 Evidence（aiEvidenceService 产物 + 输出层引用 id） */
  export interface ReportEvidence {
    id: string;
    source_type: string;
    source_id: null | number | string;
    source_domain: string;
    source_field: null | string;
    evidence_text: string;
    evidence_strength: 'high' | 'low' | 'medium';
    created_at: string;
  }

  /** SK-004 统一输出协议 */
  export interface SkillGenerateResult {
    success: boolean;
    skill: SkillRef & { status?: string };
    request_id: string;
    report: {
      title: string;
      report_type: string;
      report_version: string;
      summary: string;
      sections: ReportSection[];
      disclaimer: string;
    };
    /** 事实 → 报告文本追踪（§十三） */
    facts: { unresolved: string[]; used: string[] };
    evidence: ReportEvidence[];
    warnings: string[];
    suggestions: string[];
    confidence: SkillConfidence;
    metadata: {
      skill_key: string;
      skill_id: string;
      skill_version: string;
      model_policy: string;
      report_type: string;
      template_key: null | string;
      section_plan_source: string;
      prompt_key: string;
      prompt_version: string;
      provider: null | string;
      model: null | string;
      duration_ms: number;
      record_id: null | number;
      record_saved: boolean;
      gateway_request_id: null | string;
      trace_id: null | string;
      usage: { input_tokens: number; output_tokens: number };
      ai_called: boolean;
      ai_context_chars?: number;
      evidence_count?: number;
      fact_count?: number;
      fact_used_count?: number;
      fact_unresolved_count?: number;
      consistency_status: string;
      consistency_violations?: number;
      permission_model: string;
      disclaimer: string;
    };
  }

  /** POST /company/ai/skills/SK-004/generate 入参 */
  export interface SkillGenerateParams {
    /** 报告类型（缺省 custom） */
    report_type?: ReportType;
    /** 报告标题（用户指定优先，缺省按类型生成） */
    title?: string;
    /** 报告生成目标（≤500 字） */
    report_goal?: string;
    /** 确定性事实（如 {total:172, valid:170}） */
    facts?: Record<string, any>;
    /** 确定性分析结果（可直接传 SK-003 analyze 的返回 result） */
    analysis?: Record<string, any>;
    /** Evidence（aiEvidenceService 产物或上游 Skill evidence 数组；不传时后端自动登记素材来源） */
    evidence?: Array<Record<string, any>>;
    /** 参考文档（SK-002 parse 结果） */
    document?: Record<string, any>;
    /** 报告模板 {template_key, version, sections} */
    template?: {
      sections?: Array<string | { key: string; title?: string }>;
      template_key?: string;
      version?: string;
    };
    /** 用户指定章节（字符串或 {key,title}），优先级高于模板/自动 */
    sections?: Array<string | { key: string; title?: string }>;
    /** 风格控制（只影响文字表达，不得改变事实） */
    style?: Record<string, string>;
    /** 是否要求 Evidence 引用（默认 true） */
    require_citation?: boolean;
  }
}

/** POST /company/ai/skills/SK-004/generate —— SK-004 报告生成（JSON，同步模型调用） */
export function generateCompanyReport(
  params: CompanyReportApi.SkillGenerateParams,
) {
  return requestClient
    .post<CompanyAiEnvelope>('/company/ai/skills/SK-004/generate', params, {
      responseReturn: 'body',
      timeout: REPORT_GENERATE_TIMEOUT,
    })
    .then((body) =>
      unwrapEnvelope<Omit<CompanyReportApi.SkillGenerateResult, 'success'>>(
        body,
      ),
    );
}