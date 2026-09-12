import { requestClient } from '#/api/request';

export namespace RiskControlApi {
  /** 时效状态：normal 正常 / expiring 临期 / expired 过期 / permanent 长期有效 / unknown 未知 */
  export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'permanent' | 'unknown';

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
    /** 关联隐患 ID（可选） */
    relatedHazardId?: number | null;
    /** 关联制度 ID（可选） */
    relatedRegulationId?: number | null;
    /** 最近隐患检查日期（Phase 14 联动字段） */
    lastHazardCheckDate?: string | null;
    /** 关联隐患数量（Phase 14 联动字段） */
    hazardCount?: number;
    /** 评估方法（LEC / LS，提示词-206 风险评估工作台） */
    assessmentMethod?: string | null;
    /** 评估得分（LEC 的 D 值 / LS 的 L×S） */
    assessmentScore?: number | string | null;
    dataPeriod?: string | null;
    sourceFileId?: number | null;
    importJobId?: number | null;
    rowHash?: string | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 关联隐患记录（Phase 14 正向联动） */
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
    /** 关联类型：manual / auto / expiring */
    linkType?: string;
    /** 关联创建时间 */
    linkedAt?: string;
    /** 风险等级（同步自风险点） */
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

  // ========== 风险评估工作台（提示词-206） ==========

  /** 评估方法枚举 */
  export type AssessMethod = 'LEC' | 'LS';

  /** 单个评估因子的候选项（由后端 /rules/assessment-scales 下发） */
  export interface AssessFactorOption {
    value: number;
    label: string;
  }

  /** 评估因子定义（L / E / C 或 L / S） */
  export interface AssessFactor {
    /** 提交参数名，如 'l' / 'e' / 'c' / 's' */
    code: string;
    /** 展示符号，如 'L' */
    symbol: string;
    /** 因子中文名 */
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
    /** 评估方法 */
    method: AssessMethod;
    /** L 因子：LEC 为事故可能性，LS 为发生可能性 */
    l: number;
    /** E 因子：暴露频繁程度（仅 LEC） */
    e?: number;
    /** C 因子：后果严重度（仅 LEC） */
    c?: number;
    /** S 因子：后果严重性（仅 LS） */
    s?: number;
    /** 复评周期（月），0 表示长期有效 */
    reviewCycle?: number;
    /** 评估日期（YYYY-MM-DD），缺省取当天 */
    assessmentDate?: string;
    /** 评估备注，写入版本履历 change_summary */
    remark?: string;
    /** 变更人 */
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

  export interface RiskListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    level?: string;
    type?: string;
    area?: string;
    /** 时效状态筛选 */
    expiryStatus?: ExpiryStatus | '';
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
    /** 关联隐患总数（Phase 14 联动统计） */
    linkedHazards?: number;
    /** 已关联隐患的风险点数（Phase 14 联动统计） */
    riskWithHazards?: number;
  }
}

export async function getRiskList(params: RiskControlApi.RiskListParams) {
  return requestClient.get<{ list: RiskControlApi.RiskSource[]; total: number }>(
    '/risk-control',
    { params },
  );
}

export async function getRiskStats() {
  return requestClient.get<RiskControlApi.RiskStats>('/risk-control/stats/all');
}

export async function getRiskDetail(id: number) {
  return requestClient.get<RiskControlApi.RiskSource>(`/risk-control/${id}`);
}

export async function createRisk(data: Partial<RiskControlApi.RiskSource>) {
  return requestClient.post<RiskControlApi.RiskSource>('/risk-control', data);
}

export async function updateRisk(id: number, data: Partial<RiskControlApi.RiskSource>) {
  return requestClient.put<RiskControlApi.RiskSource>(`/risk-control/${id}`, data);
}

export async function deleteRisk(id: number) {
  return requestClient.delete(`/risk-control/${id}`);
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

// ========== 报表导出 ==========
export async function exportRisks() {
  return requestClient.get<Blob>('/risk-control/export', {
    responseType: 'blob',
  });
}

// ========== 风险 ↔ 隐患 联动（Phase 14） ==========

/**
 * 从风险点生成隐患记录（正向联动）
 * - 预填 description/measure/checkDate/risk_level/related_risk_id
 * - 自动创建 risk_hazard_links 关联记录
 * - 更新 risk_sources.hazard_count
 */
export async function generateHazardFromRisk(
  id: number,
  params: RiskControlApi.GenerateHazardParams = {},
) {
  return requestClient.post<Record<string, any>>(
    `/risk-control/${id}/generate-hazard`,
    params,
  );
}

/**
 * 查询风险点关联的隐患列表
 */
export async function getRelatedHazards(id: number) {
  return requestClient.get<{ list: RiskControlApi.RelatedHazard[]; total: number }>(
    `/risk-control/${id}/related-hazards`,
  );
}

// ========== 风险评估工作台（提示词-206） ==========

/**
 * 获取评估量表（LEC / LS 因子选项、中文标签、等级阈值、复评周期候选）
 * - 规则由后端单点维护，前端不得硬编码阈值
 */
export async function getAssessmentScales() {
  return requestClient.get<RiskControlApi.AssessmentScalesResult>(
    '/risk-control/rules/assessment-scales',
  );
}

/**
 * 提交风险评估（LEC 或 LS 矩阵法）
 * - 后端按量表重算 score 与 level（不信任前端计算结果）
 * - 写入 assessment_method / assessment_score / level / assessment_date / review_cycle
 * - 自动记录版本履历（change_type = 'assess'）
 * - 等级变化时推送通知中心
 */
export async function assessRisk(id: number, params: RiskControlApi.AssessParams) {
  return requestClient.put<RiskControlApi.AssessResult>(
    `/risk-control/${id}/assess`,
    params,
  );
}
