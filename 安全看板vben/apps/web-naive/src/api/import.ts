/**
 * HSE 通用导入 API（web-naive 试点 · 阶段04）
 *
 * 复用后端通用导入网关 server/routes/import.js：
 *   GET  /import/template/:module  下载模板（Blob）
 *   POST /import/upload            上传 Excel 并解析（multipart file）
 *   POST /import/parse             重新解析（可选勾选 sheet）
 *   POST /import/confirm           确认入库
 *
 * 所有端点 requireRole('admin','safety_manager')。
 * 支持模块（moduleTemplates 部分）：emergency / risk-control / hazards /
 * accidents / training / drill / inspection / violation 等。
 *
 * 请求经 #/api/request 的 requestClient（responseReturn:'data'），
 * 故 success(payload) 的解包结果为 payload 本身。
 */
import { requestClient } from '#/api/request';

/** 单行解析预览（data 已 camelKey 处理，中文表头保持原样） */
export interface ImportPreviewRow {
  rowIndex: number;
  data: Record<string, any>;
  errors: string[];
}

/** 单条行级校验错误明细（与后端 parseExcelNative 的 rowErrors 对齐） */
export interface ImportRowErrorItem {
  field?: string;
  dbField?: string;
  reason?: string;
}

/** 一行（或跨 sheet）的校验错误聚合 */
export interface ImportRowError {
  rowIndex?: number;
  sheetName?: string;
  errors: ImportRowErrorItem[];
}

/** 上传 / 解析返回的预览结构 */
export interface ImportUploadResult {
  jobId?: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  preview: ImportPreviewRow[];
  /** 行级校验错误聚合列表（后端 parseExcelNative 的 allRowErrors） */
  errors?: ImportRowError[];
  moduleType?: string;
  moduleName?: string;
  targetTable?: string;
  sheets?: string[];
}

/** 确认入库返回结果 */
export interface ImportConfirmResult {
  inserted?: number;
  updated?: number;
  skipped?: number;
  outcome?: 'imported' | 'partial' | 'failed';
  [key: string]: any;
}

const BASE = '/import';

/** 下载导入模板（返回 Blob） */
export async function downloadImportTemplate(module: string) {
  return requestClient.download(`${BASE}/template/${module}`);
}

/**
 * 上传 Excel 并解析（POST /upload，multipart form）。
 * 字段：file（文件）+ module（模块标识，如 emergency / risk-control）。
 * 后端 server/routes/import.js 读取 req.body.module 匹配导入配置。
 */
export async function uploadImport(file: File, module: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('module', module);
  return requestClient.post<ImportUploadResult>(`${BASE}/upload`, formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

/** 重新解析（可选勾选 sheet 重解） */
export async function parseImport(
  fileRecordId: string | number,
  sheets?: string[],
) {
  return requestClient.post<ImportUploadResult>(`${BASE}/parse`, {
    fileRecordId,
    sheets,
  });
}

/** 确认入库 */
export async function confirmImport(
  fileRecordId: string | number,
  insuranceType?: string,
) {
  return requestClient.post<ImportConfirmResult>(`${BASE}/confirm`, {
    fileRecordId,
    insuranceType,
  });
}
