/**
 * 文件记录 · 后端 file_records 模块前端封装（web-naive）
 * 端点（挂载于 /api/hse/file-records，无需鉴权）：
 *   GET    /          ?module=&recordId=  列表（按 module 过滤，recordId 客户端再筛）
 *   POST   /upload     FormData(file, module, recordId)  上传并落库（磁盘 + 表）
 *   GET    /download/:id   下载文件流
 *   DELETE /:id        软删除
 * 复用 #/api/request 的 requestClient（与 documents.ts 等一致）。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/file-records';

export interface FileRecordItem {
  id: number;
  originalName: string;
  size: number;
  sizeFormatted?: string;
  mimetype: string;
  module: string;
  recordId: string;
  uploadDate?: string;
  filepath?: string;
}

export interface FileRecordListResult {
  files: FileRecordItem[];
  total: number;
}

/** 列表：后端仅按 module 过滤，recordId 由调用方在客户端再筛 */
export function listFileRecords(params: { module: string; recordId?: string }) {
  return requestClient.get<FileRecordListResult>(BASE, { params });
}

/** 上传：multipart，file + module + recordId，落库后返回记录 */
export function uploadFileRecord(file: File, module: string, recordId: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('module', module);
  formData.append('recordId', recordId);
  return requestClient.post<FileRecordItem>(`${BASE}/upload`, formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

/** 下载：触发浏览器下载（等价于 documents.downloadDocument） */
export function downloadFileRecord(id: number) {
  return requestClient.download(`${BASE}/download/${id}`);
}

/** 删除：软删除 */
export function deleteFileRecord(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}
