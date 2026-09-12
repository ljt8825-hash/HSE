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
  /** 'record'：普通培训台账识别；'signin'：培训签到表 */
  mode?: 'record' | 'signin';
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
  };
}

/** 确认入库返回 */
export interface OcrConfirmResult {
  inserted: number;
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

/** 确认入库（body: rows） */
export async function ocrConfirm(rows: Record<string, any>[]): Promise<OcrConfirmResult> {
  return requestClient.post<OcrConfirmResult>(`${BASE}/confirm`, { rows }, {
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