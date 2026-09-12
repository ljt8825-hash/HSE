import { requestClient } from '#/api/request';

export namespace RegulationsApi {
  /** 时效状态：normal 正常 / expiring 临期 / expired 过期 / permanent 长期有效 / unknown 未知 */
  export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'permanent' | 'unknown';

  export interface Regulation {
    id: number;
    title: string;
    category: 'national' | 'provincial' | 'municipal' | 'internal' | 'industry';
    type: 'law' | 'regulation' | 'standard' | 'procedure' | 'guideline';
    documentNo: string;
    version: string;
    status: 'active' | 'published' | 'draft' | 'revising' | 'obsolete';
    issueDate: string;
    effectiveDate: string;
    /** 有效期（月），空表示长期有效 */
    validityPeriod?: number;
    /** 时效状态（后端计算返回） */
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

  export interface RegulationListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    type?: string;
    status?: string;
  }

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
}

export async function getRegulationList(params: RegulationsApi.RegulationListParams) {
  const res = await requestClient.get<{ list: any[]; total: number }>(
    '/regulations',
    { params },
  );
  // 后端已统一返回 camelCase，仅保留 title/name 互备兼容旧数据
  const list = (res.list || []).map((item: any) => ({
    ...item,
    title: item.title || item.name || '',
  }));
  return { list, total: res.total };
}

export async function getRegulationStats() {
  const res = await requestClient.get<any>('/regulations/stats');
  const byStatus = res.byStatus || {};
  return {
    total: res.total || 0,
    active: byStatus.active || 0,
    published: byStatus.published || 0,
    draft: byStatus.draft || 0,
    revising: byStatus.revising || 0,
    obsolete: byStatus.obsolete || 0,
    effective: byStatus.active || byStatus.effective || 0,
    revised: byStatus.revising || byStatus.revised || 0,
    byCategory: res.byCategory || {},
    byType: res.byType || {},
  } as RegulationsApi.RegulationStats;
}

export async function getRegulationDetail(id: number) {
  return requestClient.get<RegulationsApi.Regulation>(`/regulations/${id}`);
}

export async function createRegulation(data: Partial<RegulationsApi.Regulation>) {
  return requestClient.post<RegulationsApi.Regulation>('/regulations', data);
}

export async function updateRegulation(id: number, data: Partial<RegulationsApi.Regulation>) {
  return requestClient.put<RegulationsApi.Regulation>(`/regulations/${id}`, data);
}

export async function deleteRegulation(id: number) {
  return requestClient.delete(`/regulations/${id}`);
}

// ========== 附件管理 ==========
export async function getRegulationAttachments(id: number, version?: string) {
  return requestClient.get<RegulationsApi.Attachment[]>(
    `/regulations/${id}/attachments`,
    { params: version ? { version } : {} },
  );
}

export async function uploadRegulationAttachment(
  id: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<RegulationsApi.Attachment>(
    `/regulations/${id}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteRegulationAttachment(id: number, aid: number) {
  return requestClient.delete(`/regulations/${id}/attachments/${aid}`);
}

// ========== 版本管理 ==========
export async function getRegulationVersions(id: number) {
  return requestClient.get<RegulationsApi.VersionRecord[]>(
    `/regulations/${id}/versions`,
  );
}

// ========== 报表导出 ==========
export async function exportRegulations() {
  return requestClient.get<Blob>('/regulations/export', {
    responseType: 'blob',
  });
}
