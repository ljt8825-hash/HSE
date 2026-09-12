/**
 * 规章制度管理 API（web-naive）
 *
 * 对应后端路由: server/routes/regulations.js
 * 路由前缀: /regulations
 */
import { requestClient } from '#/api/request';

export namespace RegulationsApi {
  /** 时效状态 */
  export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'permanent' | 'unknown';

  /** 制度分类 */
  export type Category = 'national' | 'provincial' | 'municipal' | 'internal' | 'industry';

  /** 制度类型 */
  export type RegType = 'law' | 'regulation' | 'standard' | 'procedure' | 'guideline';

  /** 制度状态 */
  export type RegStatus = 'active' | 'published' | 'draft' | 'revising' | 'obsolete';

  /** 制度列表项 */
  export interface Regulation {
    id: number;
    title: string;
    category: Category;
    type: RegType;
    documentNo: string;
    version: string;
    status: RegStatus;
    issueDate: string;
    effectiveDate: string;
    validityPeriod?: number;
    expiryStatus?: ExpiryStatus;
    issuer: string;
    department: string;
    summary: string;
    content: string;
    attachments?: string[];
    remark?: string;
    createdAt: string;
    updatedAt: string;
  }

  /** 附件 */
  export interface Attachment {
    id: number;
    regulationId: number;
    filename: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    version: string;
    uploadedBy: string;
    isLatest: boolean;
    createdAt: string;
  }

  /** 版本履历 */
  export interface VersionRecord {
    id: number;
    regulationId: number;
    version: string;
    changeType: string;
    changeSummary: string;
    changedBy: string;
    createdAt: string;
  }

  /** 列表查询参数 */
  export interface RegulationListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    type?: string;
    status?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  /** 列表响应 */
  export interface RegulationListResult {
    list: Regulation[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 统计数据 */
  export interface RegulationStats {
    total: number;
    active: number;
    published: number;
    draft: number;
    revising: number;
    obsolete: number;
    effective: number;
    revised: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
  }

  /** 表单数据 */
  export interface RegulationFormData {
    title: string;
    category: Category;
    type: RegType;
    documentNo: string;
    version: string;
    status: RegStatus;
    issueDate: string;
    effectiveDate: string;
    issuer: string;
    department: string;
    summary: string;
    content: string;
  }
}

const BASE = '/regulations';

/** 制度列表 */
export async function getRegulationList(params: RegulationsApi.RegulationListParams) {
  return requestClient.get<RegulationsApi.RegulationListResult>(BASE, { params });
}

/** 制度统计 */
export async function getRegulationStats() {
  return requestClient.get<RegulationsApi.RegulationStats>(`${BASE}/stats`);
}

/** 制度详情 */
export async function getRegulationDetail(id: number) {
  return requestClient.get<RegulationsApi.Regulation>(`${BASE}/${id}`);
}

/** 新增制度 */
export async function createRegulation(data: Partial<RegulationsApi.RegulationFormData>) {
  return requestClient.post<RegulationsApi.Regulation>(BASE, data);
}

/** 更新制度 */
export async function updateRegulation(id: number, data: Partial<RegulationsApi.RegulationFormData>) {
  return requestClient.put<RegulationsApi.Regulation>(`${BASE}/${id}`, data);
}

/** 删除制度 */
export async function deleteRegulation(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}

/** 获取附件列表 */
export async function getRegulationAttachments(id: number, version?: string) {
  return requestClient.get<RegulationsApi.Attachment[]>(`${BASE}/${id}/attachments`, {
    params: version ? { version } : {},
  });
}

/** 上传附件 */
export async function uploadRegulationAttachment(
  id: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<RegulationsApi.Attachment>(`${BASE}/${id}/attachments`, formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

/** 删除附件 */
export async function deleteRegulationAttachment(id: number, aid: number) {
  return requestClient.delete(`${BASE}/${id}/attachments/${aid}`);
}

/** 获取版本历史 */
export async function getRegulationVersions(id: number) {
  return requestClient.get<RegulationsApi.VersionRecord[]>(`${BASE}/${id}/versions`);
}

/** 导出制度列表 */
export async function exportRegulations() {
  return requestClient.download(`${BASE}/export`);
}
