import { requestClient } from '#/api/request';

export namespace AccidentsApi {
  /** 时效状态：normal 正常 / expiring 临期 / expired 过期 / permanent 长期有效 / unknown 未知 / closed 已结案 */
  export type ExpiryStatus =
    | 'normal'
    | 'expiring'
    | 'expired'
    | 'permanent'
    | 'unknown'
    | 'closed';

  export interface AccidentItem {
    id: number;
    title: string;
    description: string;
    level: 'major' | 'serious' | 'general' | 'minor';
    type: 'traffic' | 'occupational' | 'equipment' | 'fire' | 'environmental' | 'other';
    status: 'reported' | 'investigating' | 'processing' | 'closed';
    location: string;
    occurredAt: string;
    reportedAt: string;
    reporter: string;
    casualties: number;
    injuries: number;
    economicLoss: number;
    handler?: string;
    handlerId?: number | null;
    /** R1-Phase2：报告人员工 ID（花名册关联） */
    reporterId?: number | null;
    /** 提示词-57：处理人上级员工 ID（花名册关联） */
    handlerSupervisorId?: number | null;
    /** 提示词-57：处理人上级姓名 */
    handlerSupervisorName?: string | null;
    closedAt?: string;
    remark?: string;
    /** 整改期限（天），默认 30 */
    rectificationDeadlineDays?: number;
    /** 时效状态（后端计算返回） */
    expiryStatus?: ExpiryStatus;
    /** 关联隐患 ID（可选） */
    relatedHazardId?: number | null;
    /** 关联应急事件 ID（可选） */
    relatedEmergencyId?: number | null;
    /** 报送集团开关（true=已报送集团 / false=未报送；读取响应用 camelCase） */
    reportGroup?: boolean;
    /** 报送集团开关（提交 payload 用 snake_case，与后端 zod 对齐） */
    report_group?: boolean;
    createdAt: string;
    updatedAt: string;
  }

  /** 附件 */
  export interface Attachment {
    id: number;
    accidentId: number;
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
    accidentId: number;
    version: string;
    changeType: string;
    changeSummary: string;
    changedBy: string;
    createdAt: string;
  }

  export interface AccidentListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    level?: string;
    type?: string;
    status?: string;
    year?: number;
    month?: number;
    startDate?: string;
    endDate?: string;
    /** 时效状态筛选 */
    expiryStatus?: ExpiryStatus | '';
  }

  export interface AccidentStats {
    total: number;
    major: number;
    serious: number;
    general: number;
    minor: number;
    openCount: number;
    closedCount: number;
    totalCasualties: number;
    totalInjuries: number;
    totalEconomicLoss: number;
    /** 临期数量 */
    expiring?: number;
    /** 过期数量 */
    expired?: number;
    byType?: Record<string, number>;
    byLevel?: Record<string, number>;
    byStatus?: Record<string, number>;
  }
}

export async function getAccidentList(params: AccidentsApi.AccidentListParams) {
  return requestClient.get<{ list: AccidentsApi.AccidentItem[]; total: number }>('/accidents', {
    params,
  });
}

export async function getAccidentStats() {
  return requestClient.get<AccidentsApi.AccidentStats>('/accidents/stats');
}

export async function getAccidentDetail(id: number) {
  return requestClient.get<AccidentsApi.AccidentItem>(`/accidents/${id}`);
}

export async function createAccident(data: Partial<AccidentsApi.AccidentItem>) {
  return requestClient.post<AccidentsApi.AccidentItem>('/accidents', data);
}

export async function updateAccident(id: number, data: Partial<AccidentsApi.AccidentItem>) {
  return requestClient.put<AccidentsApi.AccidentItem>(`/accidents/${id}`, data);
}

export async function deleteAccident(id: number) {
  return requestClient.delete(`/accidents/${id}`);
}

// ========== 附件管理 ==========
export async function getAccidentAttachments(id: number, version?: string) {
  return requestClient.get<AccidentsApi.Attachment[]>(
    `/accidents/${id}/attachments`,
    { params: version ? { version } : {} },
  );
}

export async function uploadAccidentAttachment(
  id: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<AccidentsApi.Attachment>(
    `/accidents/${id}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteAccidentAttachment(id: number, aid: number) {
  return requestClient.delete(`/accidents/${id}/attachments/${aid}`);
}

// ========== 版本管理 ==========
export async function getAccidentVersions(id: number) {
  return requestClient.get<AccidentsApi.VersionRecord[]>(
    `/accidents/${id}/versions`,
  );
}

// ========== 报表导出 ==========
export async function exportAccidents() {
  return requestClient.get<Blob>('/accidents/export', {
    responseType: 'blob',
  });
}
