/**
 * 培训台账 OCR API（web-naive）
 *
 * 对应后端 server/routes/training-ocr.js，三个端点均 requireRole('admin','safety_manager')。
 * 流程：识别(PDF/图片) → 预览 → 下载Excel / 确认入库。
 */
import { requestClient } from '#/api/request';

/** 识别结果 */
export interface OcrRecognizeResult {
  sourceType: 'pdf_text' | 'pdf_scan' | 'image';
  /** 'record'：普通培训台账识别；'signin'：培训签到表（OCR 通道）；
   *  'ai_signin'：AI 识图签到表「填写完整性」统计（一行一张表，含缺少签字人数/资料不完整） */
  mode?: 'record' | 'signin' | 'ai_signin';
  columns: string[];
  rows: Record<string, any>[];
  /** signin 模式：签到表头部字段 + 已签到人名清单 */
  signin?: { headers: Record<string, string>; attendees: string[] } | null;
  message: string;
  sourceName?: string;
  /** 扫描归档元信息：识别页数 / 跳过的照片页 / 未识别尾页，用于提示改用 Excel 模板 */
  meta?: {
    totalPages?: number;
    photoSkipped?: number;
    untouchedTail?: number;
    signinPages?: number;
    signedTotal?: number;
    /** AI 识图：识别模式 */
    mode?: 'signin' | 'ledger';
    /** AI 识图签到表：跳过的照片/空白页数 */
    skippedPages?: number;
    skipReasons?: { photo?: number; blank?: number; other?: number };
    /** AI 识图签到表：自动重跑后仍未读出内容的页码，需人工核对 */
    weakPages?: number[];
  };
}

/** 确认入库返回 */
export interface OcrConfirmResult {
  inserted: number;
  /** 签到表统计写入月度台账时的归属月份 / 未匹配姓名等 */
  month?: string;
  unmatched?: string[];
  missingTotal?: number;
  incompleteTotal?: number;
  message?: string;
}

/** AI 识图任务提交返回（提交即返回 jobId，识别异步进行） */
export interface AiRecognizeSubmitResult {
  jobId: string;
}

/** AI 识图视觉通道：local=本机 Ollama，dsh=DSH 本地 OpenAI 网关 */
export type AiVisionProvider = 'dsh' | 'local';

/** DSH 网关可选视觉模型（后端白名单，只有真正接受图像输入的模型才会出现在这里） */
export interface AiVisionModelOption {
  id: string;
  label: string;
  /** kilo / eac / custom */
  channel: string;
  note: string;
  /** 网关当前是否真的暴露了该模型 */
  present: boolean;
  /** EAC 渠道可用性；kilo 渠道未知，为 null */
  available: boolean | null;
}

/** 单个通道的探测结果 */
export interface AiProviderStatusItem {
  provider: AiVisionProvider;
  /** ollama-vl / dsh-vl / openai-vl */
  channel: string;
  model: string;
  baseUrl: string;
  /** 网关/服务是否可达 */
  ok: boolean;
  /** 配置的模型是否在该通道的可用清单里 */
  hasModel: boolean;
  /** 仅 dsh：是否找到网关 key */
  hasKey?: boolean;
  /** 仅 dsh：可选模型列表（下拉框数据源） */
  models?: AiVisionModelOption[];
  /** 不可达时的原因 */
  detail: string;
}

export interface AiProviderStatusResult {
  local: AiProviderStatusItem;
  dsh: AiProviderStatusItem;
}

/** AI 识图进度轮询返回：recognizing（进行中）/ done（成功，透传识别结果）/ error（失败） */
export interface AiRecognizeProgressResult {
  status: 'recognizing' | 'done' | 'error';
  /** 总页数 / 已识别页数（recognizing 时用于展示进度） */
  totalPages?: number;
  donePages?: number;
  /** error 时的错误信息 */
  error?: string;
  // ---- done 时透传 OcrRecognizeResult 字段 ----
  mode?: OcrRecognizeResult['mode'];
  columns?: string[];
  rows?: Record<string, any>[];
  message?: string;
  sourceName?: string;
  meta?: OcrRecognizeResult['meta'];
}

/** 签到表识别校验返回 */
export interface SigninRecognizeResult {
  month: string;
  header: Record<string, string>;
  infoIncomplete: boolean;
  headerIssues: string[];
  contentMissing: boolean;
  expectedCount: number | null;
  signedCount: number;
  untrained: SigninUntrained[];
  unassigned: string[];
  counts: { inpost: number; departed: number };
}

export interface SigninUntrained {
  name: string;
  status: 'inpost' | 'departed';
  employeeId: number | null;
  trainerId: number | null;
  trainerName: string;
  deptName: string;
  orgName?: string;
  orgType?: string;
}

const BASE = '/training-ocr';

/**
 * OCR 识别是耗时操作（扫描件逐页识别+手写/照片归档可分多数十页，需数分钟），
 * 此处必须覆盖 requestClient 默认的 10s 超时，否则必然报「timeout of 10000ms exceeded」。
 * 前端侧超时=OCR_SCAN_BUDGET(默认1800s) + 必要余量，取 40 分钟。
 */
const OCR_TIME_OUT = 40 * 60 * 1000;

/** 识别 PDF / 图片为结构化行（multipart file） */
export async function ocrRecognize(file: File): Promise<OcrRecognizeResult> {
  const formData = new FormData();
  formData.append('file', file);
  const r = await requestClient.post<OcrRecognizeResult>(`${BASE}/recognize`, formData, {
    headers: { 'Content-Type': undefined as any },
    timeout: OCR_TIME_OUT,
  });
  return r;
}

/** AI 识图：上传文件提交识别任务，立即返回 jobId（识别异步进行），
 *  再经 aiRecognizeProgress 轮询进度与结果。
 *  mode 缺省 auto：先按「培训会议签到表」做填写完整性检查，识别不到再回退通用台账识别。
 *  provider 缺省 local：使用本机 Ollama；传 dsh 则走 DSH 本地网关的模型。
 *  model 仅 dsh 生效（下拉框选中的免费视觉模型）。
 *  prompt 为用户附加要求，服务端追加到系统提示词尾部（不替换 JSON 约束）。 */
export async function aiRecognize(
  file: File,
  mode?: 'auto' | 'signin' | 'ledger',
  provider?: AiVisionProvider,
  model?: string,
  prompt?: string,
): Promise<AiRecognizeSubmitResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (mode) formData.append('mode', mode);
  if (provider) formData.append('provider', provider);
  if (model) formData.append('model', model);
  if (prompt) formData.append('prompt', prompt);
  const r = await requestClient.post<AiRecognizeSubmitResult>(`${BASE}/ai-recognize`, formData, {
    headers: { 'Content-Type': undefined as any },
    timeout: OCR_TIME_OUT,
  });
  return r;
}

/** 视觉通道状态：本地 Ollama 与 DSH 网关是否可达（给「DSH 识别」开关做状态灯） */
export async function getAiProviderStatus(): Promise<AiProviderStatusResult> {
  return requestClient.get<AiProviderStatusResult>(`${BASE}/ai-provider`, {
    timeout: 15_000,
  });
}

/** AI 识图进度轮询：recognizing（返回总页数/已识别页数）→ done（返回识别结果）/ error（失败） */
export async function aiRecognizeProgress(
  jobId: string,
): Promise<AiRecognizeProgressResult> {
  const r = await requestClient.get<AiRecognizeProgressResult>(
    `${BASE}/ai-recognize/progress/${encodeURIComponent(jobId)}`,
    { timeout: OCR_TIME_OUT },
  );
  return r;
}

/** 导出 Excel（GET，rows/columns 以 base64 JSON 经 query 传入，返回文件流） */
export async function ocrExportExcel(params: {
  rows: Record<string, any>[];
  columns?: string[];
  sourceName?: string;
  fileName?: string;
}): Promise<Blob> {
  const enc = (v: any) =>
    encodeURIComponent(
      btoa(unescape(encodeURIComponent(JSON.stringify(v)))),
    );
  return requestClient.download(`${BASE}/export`, {
    params: {
      rows: enc(params.rows),
      columns: params.columns ? enc(params.columns) : undefined,
      sourceName: params.sourceName,
      fileName: params.fileName,
    },
    timeout: OCR_TIME_OUT,
  });
}

/**
 * 确认入库（body: rows）
 * extra.sourceName 用于 AI 签到表统计推断归属月份（如文件名含「2026年8月」）；
 * extra.month 可显式指定 YYYY-MM，优先级最高。
 */
export async function ocrConfirm(
  rows: Record<string, any>[],
  extra?: { month?: string; sourceName?: string },
): Promise<OcrConfirmResult> {
  return requestClient.post<OcrConfirmResult>(`${BASE}/confirm`, { rows, ...(extra || {}) }, {
    timeout: OCR_TIME_OUT,
  });
}

// ---------- 签到表场次台账（扫描件 OCR，后端 /training-ocr/signin-sessions/*） ----------

/** 场次人员（匹配/状态） */
export interface SigninPerson {
  seq: number;
  row: number;
  group: number;
  nameOcr: string;
  signed: boolean;
  status: 'signed' | 'on_post_untrained' | 'resigned_untrained' | 'newcomer' | 'unknown_untrained';
  match: {
    employeeId: number;
    name: string;
    sim: number;
    deptName: string;
    positionName: string;
    teamId: number | null;
    teamName: string;
    centerName: string;
  } | null;
}

/** 识别预览场次 / 台账场次 */
export interface SigninSession {
  id?: number;
  page: number;
  kind: 'team' | 'company';
  tags: string[];
  missingFields?: string[];
  trainingDateText?: string;
  trainingDate?: string;
  contentText?: string;
  expectedCount: number;
  actualCount: number;
  missingCount: number;
  untrainedCount: number;
  deptName: string;
  teamUnitId?: number | null;
  teamUnitName?: string;
  centerName?: string;
  people?: SigninPerson[];
  groups?: {
    onPostUntrained: { name: string; ocrName?: string; employeeId: number; teamName: string; centerName: string; positionName: string; sim: number }[];
    resignedUntrained: { name: string; sim: number | null }[];
    unknownUntrained: { seq: number; row: number; group: number }[];
    newcomers: { seq: number; row: number; group: number }[];
  };
  sourceName?: string;
  pageNo?: number;
  createdAt?: string;
}

/** 识别返回（mode === 'signin_ledger' 时） */
export interface SigninLedgerResult {
  mode: 'signin_ledger';
  sessions: SigninSession[];
  message: string;
  sourceName: string;
  meta: Record<string, any> | null;
}

/** 场次台账行（列表接口） */
export interface SigninSessionRow {
  id: number;
  source_name: string;
  page_no: number;
  kind: 'team' | 'company';
  dept_name: string;
  team_unit_name: string | null;
  center_name: string | null;
  training_date: string | null;
  expected_count: number;
  actual_count: number;
  missing_count: number;
  untrained_count: number;
  resigned_count: number;
  newcomer_count: number;
  tags: string[];
  created_at: string;
}

/** 确认入库签到场次 */
export async function confirmSigninSessions(params: {
  sourceName: string;
  sessions: SigninSession[];
}): Promise<{ insertedSessions: number; insertedRecords: number }> {
  return requestClient.post(`${BASE}/confirm-signin`, params, { timeout: OCR_TIME_OUT });
}

/** 场次台账列表 */
export async function getSigninSessions(params?: {
  kind?: string;
  dept?: string;
  dateFrom?: string;
  dateTo?: string;
  tag?: string;
}): Promise<{ list: SigninSessionRow[]; total: number }> {
  return requestClient.get(`${BASE}/signin-sessions`, { params });
}

/** 场次明细（含人员分组） */
export async function getSigninSessionDetail(id: number): Promise<SigninSessionRow & {
  detail: { groups: SigninSession['groups']; people: SigninPerson[]; missingFields: string[] };
  content: string | null;
}> {
  return requestClient.get(`${BASE}/signin-sessions/${id}`);
}

/** 导出场次台账（汇总 + 未培训明细两个 sheet，返回文件流） */
export async function exportSigninSessions(): Promise<Blob> {
  return requestClient.download(`${BASE}/export-signin`, { timeout: 60_000 });
}

// ---------- 签到表导入（后端 /training/ledger/signin/*） ----------

/** 签到表识别校验：头部校验(规则1/2) + 花名册匹配未培训预览（不落库） */
export async function signinRecognize(params: {
  headers: Record<string, string>;
  attendees: string[];
  month?: string;
}): Promise<SigninRecognizeResult> {
  return requestClient.post<SigninRecognizeResult>(
    '/training/ledger/signin/recognize',
    params,
    { timeout: OCR_TIME_OUT },
  );
}

/** 签到表确认：将未培训固化到 hse_untrained_log，并按方案A同步生成实际培训记录 */
export async function signinConfirm(params: {
  untrained: SigninUntrained[];
  month?: string;
  headers?: Record<string, string>;
  sessionRef?: string;
  attendees?: string[];
}): Promise<{
  wrote: number;
  updated: number;
  month: string;
  generated: { created: number; attributed: number; skipped: number };
}> {
  return requestClient.post('/training/ledger/signin/confirm', params, { timeout: OCR_TIME_OUT });
}

/** 未培训名单（弹窗）：某培训人员当月未培训人员列表 */
export async function getTrainingUntrained(
  employeeId: number,
  month?: string,
): Promise<{ list: (SigninUntrained & { createdAt: string })[]; month: string; total: number }> {
  return requestClient.get(`/training/ledger/personnel-summary/${employeeId}/untrained`, {
    params: { month },
  });
}