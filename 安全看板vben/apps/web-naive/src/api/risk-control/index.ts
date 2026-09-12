/**
 * 风险清单 API（web-naive 试点）
 *
 * 对应后端路由: server/routes/risk-control.js
 * 路由前缀: /risk-control
 * requestClient baseURL = /api，完整请求路径为 /api/risk-control/...
 *
 * 字段命名严格对齐 web-antd 同源接口（camelCase：sourceId / accidentType / assessmentDate 等）。
 * 注：风险模块后端返回 camelCase（与人员 / 预案模块的 snake_case 不同，属后端历史差异）。
 */
import { requestClient } from '#/api/request';

export namespace RiskControlApi {
  /** 时效状态：normal 正常 / expiring 临期 / expired 过期 / permanent 长期有效 / unknown 未知 */
  export type ExpiryStatus =
    | 'normal'
    | 'expiring'
    | 'expired'
    | 'permanent'
    | 'unknown';

  export interface RiskSource {
    id: number;
    sourceId?: string;
    name: string;
    type: string;
    category: string;
    location: string;
    accidentType: string;
    level: '一级' | '二级' | '三级' | '四级';
    measures: string;
    emergency: string;
    lat?: number | null;
    lng?: number | null;
    area: string;
    sheet: string;
    polygon?: number[][] | [];
    status: '正常' | '已处置' | '监控中';
    /** 评估日期（YYYY-MM-DD） */
    assessmentDate?: string | null;
    /** 复评周期（月），0 或空表示长期有效 */
    reviewCycle?: number | null;
    /** 时效状态（后端计算返回） */
    expiryStatus?: ExpiryStatus;
    /** 关联隐患数量 */
    hazardCount?: number;
    /** 评估方法（LEC / LS，风险评估工作台） */
    assessmentMethod?: string | null;
    /** 评估得分（LEC 的 D 值 / LS 的 L×S） */
    assessmentScore?: number | string | null;
    /** 关联隐患 ID（可选） */
    relatedHazardId?: number | null;
    createdAt: string;
    updatedAt: string;
  }

  export interface RiskListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    level?: string;
    type?: string;
    area?: string;
    /** 时效状态筛选 */
    expiryStatus?: ExpiryStatus | '';
    /** 排序字段（服务端三态排序透传） */
    sortField?: string;
    /** 排序方向（asc/desc，取消时 undefined） */
    sortOrder?: 'asc' | 'desc';
  }

  export interface RiskStats {
    total: number;
    byLevel: Record<string, number>;
    byType: Record<string, number>;
    byArea: Record<string, number>;
    /** 临期数量 */
    expiring?: number;
    /** 过期数量 */
    expired?: number;
  }

  /** 新建 / 编辑提交字段 */
  export type RiskFormData = Partial<RiskSource>;

  /** 关联隐患记录（风险 ↔ 隐患 联动） */
  export interface RelatedHazard {
    id: number;
    no: number | null;
    description: string;
    measure: string;
    checkDate: string | null;
    checker: string;
    fixer: string;
    fixDate: string | null;
    isResolved: '是' | '否';
    remark?: string;
    linkType?: string;
    linkedAt?: string;
    riskLevel?: string | null;
  }

  /** 从风险点生成隐患的请求参数 */
  export interface GenerateHazardParams {
    description?: string;
    measure?: string;
    checker?: string;
    fixer?: string;
    fixDate?: string | null;
    remark?: string;
    linkType?: 'manual' | 'auto' | 'expiring';
    changedBy?: string;
  }

  /** 附件 */
  export interface Attachment {
    id: number;
    riskId: number;
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
    riskId: number;
    version: string;
    changeType: string;
    changeSummary: string;
    changedBy: string;
    createdAt: string;
  }

  // ========== 风险评估工作台 ==========
  /** 评估方法枚举 */
  export type AssessMethod = 'LEC' | 'LS';

  /** 单个评估因子候选项 */
  export interface AssessFactorOption {
    value: number;
    label: string;
  }

  /** 评估因子定义（L / E / C 或 L / S） */
  export interface AssessFactor {
    code: string;
    symbol: string;
    label: string;
    options: AssessFactorOption[];
  }

  /** 等级阈值定义（min 降序，取首个 score >= min） */
  export interface AssessThreshold {
    min: number;
    level: string;
    color: string;
    alias: string;
    desc: string;
  }

  /** 一套评估量表（LEC 或 LS） */
  export interface AssessScale {
    method: AssessMethod;
    label: string;
    formula: string;
    factors: AssessFactor[];
    thresholds: AssessThreshold[];
  }

  /** 复评周期候选（月），0 表示长期有效 */
  export interface ReviewCycleOption {
    value: number;
    label: string;
  }

  /** GET /rules/assessment-scales 返回体 */
  export interface AssessmentScalesResult {
    scales: Record<AssessMethod, AssessScale>;
    reviewCycleOptions: ReviewCycleOption[];
  }

  /** PUT /:id/assess 请求参数 */
  export interface AssessParams {
    method: AssessMethod;
    l: number;
    e?: number;
    c?: number;
    s?: number;
    reviewCycle?: number;
    assessmentDate?: string;
    remark?: string;
    changedBy?: string;
  }

  /** PUT /:id/assess 返回的评估结果快照 */
  export interface AssessResult extends RiskSource {
    assessment?: {
      method: AssessMethod;
      factors: Record<string, number>;
      score: number;
      level: string;
      color: string;
      alias: string;
      desc: string;
    };
  }
}

/** 风险清单列表（服务端分页 + 三态排序 + 真实 total） */
export async function getRiskList(params: RiskControlApi.RiskListParams) {
  return requestClient.get<{
    list: RiskControlApi.RiskSource[];
    total: number;
  }>('/risk-control', { params });
}

/** 风险统计 */
export async function getRiskStats() {
  return requestClient.get<RiskControlApi.RiskStats>('/risk-control/stats/all');
}

/** 风险详情 */
export async function getRiskDetail(id: number) {
  return requestClient.get<RiskControlApi.RiskSource>(`/risk-control/${id}`);
}

/** 新增风险 */
export async function createRisk(data: RiskControlApi.RiskFormData) {
  return requestClient.post<RiskControlApi.RiskSource>('/risk-control', data);
}

/** 更新风险 */
export async function updateRisk(
  id: number,
  data: RiskControlApi.RiskFormData,
) {
  return requestClient.put<RiskControlApi.RiskSource>(
    `/risk-control/${id}`,
    data,
  );
}

/** 删除风险 */
export async function deleteRisk(id: number) {
  return requestClient.delete(`/risk-control/${id}`);
}

/**
 * 导出风险清单。
 * 使用 RequestClient.download() 正确返回 Blob。
 */
export async function exportRisks() {
  return requestClient.download('/risk-control/export');
}

// ========== 附件管理 ==========
export async function getRiskAttachments(id: number, version?: string) {
  return requestClient.get<RiskControlApi.Attachment[]>(
    `/risk-control/${id}/attachments`,
    { params: version ? { version } : {} },
  );
}

export async function uploadRiskAttachment(
  id: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<RiskControlApi.Attachment>(
    `/risk-control/${id}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteRiskAttachment(id: number, aid: number) {
  return requestClient.delete(`/risk-control/${id}/attachments/${aid}`);
}

// ========== 版本管理 ==========
export async function getRiskVersions(id: number) {
  return requestClient.get<RiskControlApi.VersionRecord[]>(
    `/risk-control/${id}/versions`,
  );
}

// ========== 风险 ↔ 隐患 联动 ==========
export async function generateHazardFromRisk(
  id: number,
  params: RiskControlApi.GenerateHazardParams = {},
) {
  return requestClient.post<Record<string, any>>(
    `/risk-control/${id}/generate-hazard`,
    params,
  );
}

export async function getRelatedHazards(id: number) {
  return requestClient.get<{
    list: RiskControlApi.RelatedHazard[];
    total: number;
  }>(`/risk-control/${id}/related-hazards`);
}

// ========== 风险评估工作台 ==========
export async function getAssessmentScales() {
  return requestClient.get<RiskControlApi.AssessmentScalesResult>(
    '/risk-control/rules/assessment-scales',
  );
}

export async function assessRisk(
  id: number,
  params: RiskControlApi.AssessParams,
) {
  return requestClient.put<RiskControlApi.AssessResult>(
    `/risk-control/${id}/assess`,
    params,
  );
}
