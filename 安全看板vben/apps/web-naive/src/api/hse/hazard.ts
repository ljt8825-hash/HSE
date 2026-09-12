/**
 * 隐患排查治理 API（web-naive）
 *
 * 对应后端路由: server/routes/hazards.js (或 insurance.js 中的 hazards 部分)
 * 路由前缀: /hazards
 */
import { requestClient } from '#/api/request';

export namespace HazardApi {
  /** 隐患状态 */
  export type HazardStatus = 'discovered' | 'processing' | 'pending_review' | 'closed';

  /** 风险等级 */
  export type RiskLevel = '重大' | '一级' | '二级' | '三级';

  /** 隐患类型 */
  export type HazardType = '设施设备' | '作业环境' | '管理体系' | '人员行为' | '其他';

  /** 时效状态 */
  export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'resolved' | 'unknown';

  /** 隐患列表项 */
  export interface HazardItem {
    id: number;
    no?: number | null;
    description: string;
    measure?: string;
    hazardType?: string | null;
    riskLevel?: string | null;
    location?: string;
    checkDate?: string | null;
    fixDate?: string | null;
    rectification?: string;
    rectifyDate?: string | null;
    reviewDate?: string | null;
    reviewResult?: string | null;
    deadlineDays?: number;
    status?: HazardStatus | string;
    expiryStatus?: ExpiryStatus | string;
    checker?: string;
    fixer?: string;
    finderId?: number | null;
    responsibleId?: number | null;
    correctorId?: number | null;
    reviewerId?: number | null;
    checkerId?: number | null;
    fixerId?: number | null;
    remark?: string;
    relatedRiskId?: number | null;
    createdAt?: string;
    updatedAt?: string;
  }

  /** 隐患列表查询参数 */
  export interface HazardListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    hazardType?: string;
    riskLevel?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  /** 隐患表单数据 */
  export interface HazardFormData {
    description: string;
    measure?: string;
    hazardType?: string;
    riskLevel?: string;
    location?: string;
    checkDate?: string;
    fixDate?: string | null;
    rectification?: string;
    rectifyDate?: string | null;
    reviewDate?: string | null;
    deadlineDays?: number;
    status?: string;
    checker?: string;
    fixer?: string;
    remark?: string;
  }

  /** 隐患统计 */
  export interface HazardStats {
    total: number;
    discovered: number;
    processing: number;
    pendingReview: number;
    closed: number;
    highRiskCount: number;
    overdueCount?: number;
    resolved?: number;
    unresolved?: number;
  }

  /** 隐患增强统计（统计分析抽屉：总体 + 部门/岗位/区域排行 + 重复隐患） */
  export interface HazardStatsEnhanced extends HazardStats {
    byDepartment: { departmentName: string; total: number }[];
    byPosition: { positionName: string; total: number }[];
    byRegion: { region: string; total: number }[];
    repeatedHazards: {
      description: string;
      repeatCount: number;
      firstDiscovered: string;
      lastDiscovered: string;
    }[];
  }

  /** 隐患附件 */
  export interface HazardAttachment {
    id: number;
    hazardId: number;
    filename: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    version: string;
    uploadedBy?: string;
    isLatest: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
  }

  /** 隐患版本履历 */
  export interface HazardVersionRecord {
    id: number;
    hazardId: number;
    version: string;
    changeType: 'create' | 'update' | 'import' | 'revise' | 'delete';
    changeSummary?: string;
    changedBy?: string;
    createdAt: string;
  }

  /** 隐患关联风险点（详情抽屉联动展示） */
  export interface RelatedRisk {
    id: number;
    name: string;
    level: string;
    type?: string;
    location?: string;
    area?: string;
    status?: string;
    measures?: string;
    assessmentDate?: string | null;
    reviewCycle?: number | null;
    lastHazardCheckDate?: string | null;
    hazardCount?: number;
  }
}

// 顶层类型别名（与 web-antd 基线 insurance.ts 顶层导出保持一致，供视图按名引用）
export type HazardAttachment = HazardApi.HazardAttachment;
export type HazardVersionRecord = HazardApi.HazardVersionRecord;
export type HazardStatsEnhanced = HazardApi.HazardStatsEnhanced;

const BASE = '/hazards';

/** 隐患列表（服务端分页） */
export async function getHazardList(params: HazardApi.HazardListParams) {
  return requestClient.get<{
    list: HazardApi.HazardItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(BASE, { params });
}

/** 隐患统计（含部门/岗位/区域排行与重复隐患，供统计分析抽屉） */
export async function getHazardStats() {
  return requestClient.get<HazardApi.HazardStatsEnhanced>(`${BASE}/stats`);
}

/** 隐患详情 */
export async function getHazardDetail(id: number) {
  return requestClient.get<HazardApi.HazardItem>(`${BASE}/${id}`);
}

/** 新增隐患 */
export async function createHazard(data: HazardApi.HazardFormData) {
  return requestClient.post<HazardApi.HazardItem>(BASE, data);
}

/** 更新隐患 */
export async function updateHazard(
  id: number,
  data: Partial<HazardApi.HazardFormData>,
) {
  return requestClient.put<HazardApi.HazardItem>(`${BASE}/${id}`, data);
}

/** 删除隐患 */
export async function deleteHazard(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}

/** 导出隐患列表（CSV） */
export async function exportHazards() {
  return requestClient.download(`${BASE}/export`);
}

// ========== 隐患附件（基线 web-antd insurance.ts 1:1） ==========

/** 附件列表 */
export async function getHazardAttachments(hazardId: number, version?: string) {
  return requestClient.get<HazardApi.HazardAttachment[]>(
    `${BASE}/${hazardId}/attachments`,
    { params: version ? { version } : {} },
  );
}

/** 上传附件（multipart，与后端 uploadDocument.single('file') 对齐） */
export async function uploadHazardAttachment(
  hazardId: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<HazardApi.HazardAttachment>(
    `${BASE}/${hazardId}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as unknown as string } },
  );
}

/** 删除附件 */
export async function deleteHazardAttachment(hazardId: number, attachmentId: number) {
  return requestClient.delete(`${BASE}/${hazardId}/attachments/${attachmentId}`);
}

// ========== 版本履历（基线额外项） ==========

/** 隐患版本履历 */
export async function getHazardVersions(hazardId: number) {
  return requestClient.get<HazardApi.HazardVersionRecord[]>(
    `${BASE}/${hazardId}/versions`,
  );
}

// ========== 隐患 → 风险 反向联动 ==========

/** 查询隐患关联的风险点信息（无关联返回 null） */
export async function getRelatedRisk(hazardId: number) {
  return requestClient.get<HazardApi.RelatedRisk | null>(
    `${BASE}/${hazardId}/related-risk`,
  );
}

// ========== 隐患治理闭环流程（discovered → processing → pending_review → (pass|fail) → closed） ==========

/** 整改提交 */
export async function rectifyHazard(
  id: number,
  data: { correctorId?: number; rectification?: string; rectifyDate?: string },
) {
  return requestClient.put<HazardApi.HazardItem>(`${BASE}/${id}/rectify`, data);
}

/** 提交复查 */
export async function submitReviewHazard(id: number) {
  return requestClient.put<HazardApi.HazardItem>(`${BASE}/${id}/submit-review`);
}

/** 复查确认（pass 合格关闭 / fail 不合格重新整改） */
export async function reviewHazard(
  id: number,
  data: {
    reviewerId?: number;
    reviewResult: 'pass' | 'fail';
    reviewNote?: string;
    reviewDate?: string;
  },
) {
  return requestClient.put<HazardApi.HazardItem>(`${BASE}/${id}/review`, data);
}

/** 关闭隐患 */
export async function closeHazard(id: number, data?: { closeNote?: string }) {
  return requestClient.put<HazardApi.HazardItem>(`${BASE}/${id}/close`, data);
}

// ========== 隐患提醒 ==========

export interface HighRiskReminderResult {
  list: HazardApi.HazardItem[];
  total: number;
}

export interface OverdueReminderResult {
  list: (HazardApi.HazardItem & { responsibleName?: string; overdueDays?: number })[];
  total: number;
}

export interface ResponsibleOverdueItem {
  responsibleId: number;
  responsibleName: string;
  department?: string;
  position?: string;
  totalHazards: number;
  closedHazards: number;
  overdueHazards: number;
}

export interface ResponsibleOverdueResult {
  list: ResponsibleOverdueItem[];
  total: number;
}

/** 重大隐患提醒 */
export async function getHighRiskReminders() {
  return requestClient.get<HighRiskReminderResult>(`${BASE}/reminders/high-risk`);
}

/** 超期隐患提醒 */
export async function getOverdueReminders() {
  return requestClient.get<OverdueReminderResult>(`${BASE}/reminders/overdue`);
}

/** 责任人超期统计 */
export async function getResponsibleOverdueAnalysis() {
  return requestClient.get<ResponsibleOverdueResult>(
    `${BASE}/analysis/responsible-overdue`,
  );
}
