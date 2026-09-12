/**
 * HSE 智能分析中心 API - Sprint8-A
 *
 * 对应后端路由: server/routes/hse-analysis-center.js
 * 路由前缀: /hse/analysis-center
 *
 * 五大分析模块:
 *   1. 风险趋势分析    - GET /risk-trend, /risk-trend/:target_type/:target_id
 *   2. 事故趋势分析    - GET /accident-trend, /accident-repeat
 *   3. 整改效果分析    - GET /rectification-analysis
 *   4. 组织风险画像    - GET /org-portrait, /org-portrait/:org_type/:org_id
 *   5. 风险预测模型    - POST /predict, GET /predictions, /predictions/:id, /abnormal
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/analysis-center';

export namespace AnalysisCenterApi {
  // ===== 通用类型 =====

  /** 分析周期 */
  export type TrendPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

  /** 对象类型 */
  export type TargetType = 'employee' | 'department' | 'township' | 'area' | 'grid' | 'all';

  /** 预测类型 */
  export type PredictionType = 'risk_trend' | 'accident' | 'risk_level' | 'abnormal';

  /** 预测模型 */
  export type PredictionModel = 'trend' | 'regression' | 'ml';

  /** 预测趋势 */
  export type PredictedTrend = 'up' | 'down' | 'stable';

  // ===== 模块一: 风险趋势分析 =====

  /** 风险趋势数据点 */
  export interface RiskTrendPoint {
    period: string;
    avgEmployeeScore: number | null;
    totalHighRisk: number;
    totalMediumRisk: number;
    totalLowRisk: number;
    avgDriverScore: number | null;
    totalAccidents: number;
    totalMajorAccidents: number;
    avgEffectiveRate: number | null;
    avgRepeatRate: number | null;
    trend: PredictedTrend;
    changeRate: number;
    movingAvg?: number;
  }

  /** 趋势概览汇总 */
  export interface TrendSummary {
    avgEmployeeScore: number;
    latestHighRisk: number;
    totalAccidents: number;
    avgEffectiveRate: number;
  }

  /** 风险趋势响应 */
  export interface RiskTrendResponse {
    period: TrendPeriod;
    startDate: string;
    endDate: string;
    summary: TrendSummary;
    trend: RiskTrendPoint[];
  }

  /** 单对象趋势响应 */
  export interface TargetTrendResponse {
    targetType: TargetType;
    targetId: number;
    targetTypeLabel: string;
    months: number;
    trend: RiskTrendPoint[];
    prediction: {
      predictedScore: number | null;
      trend: PredictedTrend;
      confidence: number;
    };
  }

  // ===== 模块二: 事故趋势分析 =====

  /** 事故趋势数据点 */
  export interface AccidentTrendPoint {
    period: string;
    dimension: string;
    accidentCount: number;
    majorCount: number;
    totalCasualties: number;
    totalInjuries: number;
    totalLoss: number;
    avgSeverity: number;
  }

  /** 事故汇总 */
  export interface AccidentSummary {
    totalAccidents: number;
    majorAccidents: number;
    totalCasualties: number;
    totalInjuries: number;
    totalLoss: number;
    categoryCount: number;
    causeCount: number;
    avgMonthlyRate: number;
  }

  /** 重复事故模式 */
  export interface RepeatAccidentPattern {
    category: string;
    location: string;
    cause: string;
    repeatCount: number;
    firstAccident: string;
    lastAccident: string;
    levels: string[];
    involvedIds: number[];
  }

  /** 重复事故统计 */
  export interface RepeatAccidentStats {
    repeatGroups: number;
    totalGroups: number;
    repeatRatePct: number;
  }

  /** 事故趋势响应 */
  export interface AccidentTrendResponse {
    period: TrendPeriod;
    groupBy: string;
    summary: AccidentSummary;
    trend: AccidentTrendPoint[];
    repeatAccidents: RepeatAccidentPattern[];
  }

  /** 重复事故响应 */
  export interface AccidentRepeatResponse {
    days: number;
    minRepeats: number;
    statistics: RepeatAccidentStats;
    repeatPatterns: RepeatAccidentPattern[];
  }

  // ===== 模块三: 整改效果分析 =====

  /** 整改任务统计 */
  export interface TaskStats {
    totalTasks: number;
    closedTasks: number;
    pendingTasks: number;
    processingTasks: number;
    reviewTasks: number;
    rejectedTasks: number;
    overdueTasks: number;
    avgCycleDays: number;
    onTimeRate: number;
  }

  /** 评价统计 */
  export interface EvaluationStats {
    totalEvaluations: number;
    improvedCount: number;
    avgEffectScore: number;
    avgTimelinessScore: number;
    avgEffectivenessScore: number;
    avgRepeatRate: number;
    improvementRatePct: number;
  }

  /** 月度趋势点 */
  export interface MonthlyTrendPoint {
    month: string;
    totalTasks: number;
    closedTasks: number;
    overdueTasks: number;
    onTimeRate: number;
  }

  /** 按来源统计 */
  export interface BySourceItem {
    sourceType: string;
    sourceTypeLabel: string;
    totalWarnings: number;
    rectificationTasks: number;
    closedTasks: number;
    rectificationRate: number;
  }

  /** 整改分析响应 */
  export interface RectificationAnalysisResponse {
    year: number;
    orgId: number | null;
    orgType: string | null;
    taskStats: TaskStats;
    evaluationStats: EvaluationStats;
    monthlyTrend: MonthlyTrendPoint[];
    bySource: BySourceItem[];
  }

  // ===== 模块四: 组织风险画像 =====

  /** 风险分布 */
  export interface RiskDistribution {
    high: number;
    medium: number;
    low: number;
  }

  /** 风险维度 */
  export interface RiskDimensions {
    violation: number;
    driver: number;
    training: number;
    incident: number;
    management: number;
  }

  /** 预警统计 */
  export interface WarningStats {
    total: number;
    active: number;
    closed: number;
    critical: number;
    major: number;
    escalated: number;
  }

  /** 组织画像 */
  export interface OrgPortrait {
    orgId: number;
    orgName: string;
    orgType: string;
    orgTypeLabel: string;
    parentId: number | null;
    employeeCount: number;
    avgRiskScore: number;
    riskLevel: string;
    riskLevelCode: string;
    riskDistribution: RiskDistribution;
    dimensions: RiskDimensions;
    warningStats: WarningStats;
    accidentStats: {
      totalAccidents: number;
      majorAccidents: number;
      totalCasualties: number;
      totalInjuries: number;
      totalLoss: number;
    };
    children?: Array<{ id: number; name: string; type: string }>;
    trend?: Array<{ month: string; avgScore: number | null }>;
  }

  /** 组织画像列表响应 */
  export interface OrgPortraitListResponse {
    orgType: string | null;
    parentId: number | null;
    total: number;
    portraits: OrgPortrait[];
  }

  /** 组织画像详情响应 */
  export interface OrgPortraitDetailResponse {
    org: { id: number; name: string; type: string; parent_id: number | null };
    portrait: OrgPortrait;
  }

  // ===== 模块五: 风险预测模型 =====

  /** 贡献因子 */
  export interface ContributingFactor {
    factor: string;
    weight: number;
    direction: string;
    value: number | string;
  }

  /** 风险预测记录 */
  export interface RiskPrediction {
    id: number;
    predictionDate: string;
    predictionTarget: string;
    predictionType: PredictionType;
    predictionTypeLabel: string;
    predictionModel: PredictionModel;
    targetType: TargetType;
    targetId: number | null;
    targetName: string | null;
    predictedRiskScore: number | null;
    predictedRiskLevel: string | null;
    predictedAccidents: number | null;
    predictedTrend: PredictedTrend;
    predictedTrendLabel: string;
    predictedConfidence: number;
    trendSlope: number | null;
    trendChangeRate: number | null;
    warningThreshold: number | null;
    isAbnormal: boolean;
    abnormalDegree: number;
    contributingFactors: ContributingFactor[];
    baselineAvg: number | null;
    baselineStddev: number | null;
    predictionNote: string | null;
    modelVersion: string;
    createdBy: number | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 创建预测请求 */
  export interface CreatePredictionRequest {
    prediction_type: PredictionType;
    target_type: TargetType;
    target_id?: number;
    months?: number;
    note?: string;
  }

  /** 创建预测响应 */
  export interface CreatePredictionResponse {
    id: number;
    predictionTypeLabel: string;
    predictedTrendLabel: string;
    predictedRiskScore: number | null;
    predictedRiskLevel: string | null;
    predictedAccidents: number | null;
    predictedTrend: PredictedTrend;
    predictedConfidence: number;
    trendSlope: number | null;
    trendChangeRate: number | null;
    contributingFactors: ContributingFactor[];
    isAbnormal: boolean;
    abnormalDegree: number;
    predictionNote: string | null;
    message: string;
  }

  /** 预测列表响应 */
  export interface PredictionListResponse {
    list: RiskPrediction[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 异常统计 */
  export interface AbnormalStats {
    totalAbnormal: number;
    avgDegree: number;
    severeCount: number;
    moderateCount: number;
    mildCount: number;
    affectedTypes: number;
  }

  /** 异常识别响应 */
  export interface AbnormalResponse {
    statistics: AbnormalStats;
    list: RiskPrediction[];
    total: number;
    page: number;
    pageSize: number;
  }

  // ===== Sprint8-A-1: 预测模型版本管理类型 =====

  /** 模型版本状态 */
  export type ModelVersionStatus = 'active' | 'inactive' | 'deprecated';

  /** 预测模型版本 */
  export interface PredictionModelVersion {
    id: number;
    modelCode: string;
    version: string;
    algorithm: string;
    algorithmLabel: string;
    predictionCycle: number;
    parameters: Record<string, any>;
    confidenceMethod: string;
    confidenceMin: number;
    levelCritical: number;
    levelMajor: number;
    levelMinor: number;
    anomalyStddevThreshold: number;
    anomalySlopeThreshold: number;
    anomalyAccidentSurge: number;
    trendUpThreshold: number;
    trendDownThreshold: number;
    status: ModelVersionStatus;
    statusLabel: string;
    isFrozen: boolean;
    isFrozenLabel: string;
    changeLog: string | null;
    createdBy: number | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 模型版本列表响应 */
  export interface ModelVersionListResponse {
    list: PredictionModelVersion[];
    total: number;
  }

  /** 创建模型版本请求 */
  export interface CreateModelVersionRequest {
    model_code?: string;
    version: string;
    algorithm?: string;
    prediction_cycle?: number;
    parameters?: Record<string, any>;
    confidence_method?: string;
    confidence_min?: number;
    level_critical?: number;
    level_major?: number;
    level_minor?: number;
    anomaly_stddev_threshold?: number;
    anomaly_slope_threshold?: number;
    anomaly_accident_surge?: number;
    trend_up_threshold?: number;
    trend_down_threshold?: number;
    status?: ModelVersionStatus;
    change_log?: string;
  }

  /** 更新模型版本请求 */
  export interface UpdateModelVersionRequest {
    prediction_cycle?: number;
    parameters?: Record<string, any>;
    confidence_method?: string;
    confidence_min?: number;
    level_critical?: number;
    level_major?: number;
    level_minor?: number;
    anomaly_stddev_threshold?: number;
    anomaly_slope_threshold?: number;
    anomaly_accident_surge?: number;
    trend_up_threshold?: number;
    trend_down_threshold?: number;
    status?: ModelVersionStatus;
    change_log?: string;
  }

  // ===== Sprint8-A-1: 预测预警联动类型 =====

  /** 预测预警记录 */
  export interface PredictionWarning {
    id: number;
    warningCode: string;
    ruleId: number | null;
    ruleName: string | null;
    sourceType: string;
    warningLevel: string;
    warningLevelLabel: string;
    targetType: string;
    targetId: number | null;
    targetName: string | null;
    riskReason: string | null;
    riskData: Record<string, any> | null;
    status: string;
    statusLabel: string;
    taskCode: string | null;
    taskStatus: string | null;
    createdAt: string;
  }

  /** 预测预警列表响应 */
  export interface PredictionWarningListResponse {
    list: PredictionWarning[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 预测预警统计 */
  export interface PredictionWarningStats {
    year: number;
    overview: {
      totalWarnings: number;
      pendingCount: number;
      processingCount: number;
      closedCount: number;
      criticalCount: number;
      majorCount: number;
      escalatedCount: number;
      avgCloseHours: number;
    };
    monthlyTrend: Array<{
      month: string;
      total: number;
      criticalCount: number;
      majorCount: number;
    }>;
  }
}

// ===== API 函数 =====

/** 模块一: 风险趋势分析 */

/** 全局风险趋势概览 */
export function getRiskTrend(params?: {
  period?: string;
  start_date?: string;
  end_date?: string;
}) {
  return requestClient.get<AnalysisCenterApi.RiskTrendResponse>(`${BASE}/risk-trend`, { params });
}

/** 单对象风险历史趋势 */
export function getTargetTrend(targetType: string, targetId: number, params?: { months?: number }) {
  return requestClient.get<AnalysisCenterApi.TargetTrendResponse>(
    `${BASE}/risk-trend/${targetType}/${targetId}`,
    { params }
  );
}

/** 模块二: 事故趋势分析 */

/** 事故趋势分析 */
export function getAccidentTrend(params?: {
  period?: string;
  start_date?: string;
  end_date?: string;
  group_by?: string;
}) {
  return requestClient.get<AnalysisCenterApi.AccidentTrendResponse>(`${BASE}/accident-trend`, { params });
}

/** 重复事故专项分析 */
export function getAccidentRepeat(params?: { days?: number; min_repeats?: number }) {
  return requestClient.get<AnalysisCenterApi.AccidentRepeatResponse>(`${BASE}/accident-repeat`, { params });
}

/** 模块三: 整改效果分析 */

/** 整改效果分析 */
export function getRectificationAnalysis(params?: {
  year?: number;
  org_id?: number;
  org_type?: string;
}) {
  return requestClient.get<AnalysisCenterApi.RectificationAnalysisResponse>(
    `${BASE}/rectification-analysis`,
    { params }
  );
}

/** 模块四: 组织风险画像 */

/** 组织风险画像列表 */
export function getOrgPortraits(params?: { org_type?: string; parent_id?: number }) {
  return requestClient.get<AnalysisCenterApi.OrgPortraitListResponse>(`${BASE}/org-portrait`, { params });
}

/** 单个组织画像详情 */
export function getOrgPortraitDetail(orgType: string, orgId: number) {
  return requestClient.get<AnalysisCenterApi.OrgPortraitDetailResponse>(
    `${BASE}/org-portrait/${orgType}/${orgId}`
  );
}

/** 模块五: 风险预测模型 */

/** 执行风险预测 */
export function createPrediction(data: AnalysisCenterApi.CreatePredictionRequest) {
  return requestClient.post<AnalysisCenterApi.CreatePredictionResponse>(`${BASE}/predict`, data);
}

/** 查询历史预测结果 */
export function getPredictions(params?: {
  prediction_type?: string;
  target_type?: string;
  target_id?: number;
  date_from?: string;
  date_to?: string;
  is_abnormal?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<AnalysisCenterApi.PredictionListResponse>(`${BASE}/predictions`, { params });
}

/** 查询单个预测详情 */
export function getPredictionDetail(id: number) {
  return requestClient.get<AnalysisCenterApi.RiskPrediction>(`${BASE}/predictions/${id}`);
}

/** 异常识别结果列表 */
export function getAbnormalList(params?: {
  target_type?: string;
  is_resolved?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<AnalysisCenterApi.AbnormalResponse>(`${BASE}/abnormal`, { params });
}

// ===== Sprint8-A-1: 预测模型版本管理 =====

/** 模型版本列表 */
export function getModelVersions(params?: { model_code?: string; status?: string }) {
  return requestClient.get<AnalysisCenterApi.ModelVersionListResponse>(`${BASE}/model-versions`, { params });
}

/** 模型版本详情 */
export function getModelVersionDetail(id: number) {
  return requestClient.get<AnalysisCenterApi.PredictionModelVersion>(`${BASE}/model-versions/${id}`);
}

/** 获取当前生效的预测模型配置 */
export function getActiveModelVersion() {
  return requestClient.get<AnalysisCenterApi.PredictionModelVersion>(`${BASE}/model-versions/active`);
}

/** 创建模型版本 */
export function createModelVersion(data: AnalysisCenterApi.CreateModelVersionRequest) {
  return requestClient.post<AnalysisCenterApi.PredictionModelVersion>(`${BASE}/model-versions`, data);
}

/** 更新模型版本 */
export function updateModelVersion(id: number, data: AnalysisCenterApi.UpdateModelVersionRequest) {
  return requestClient.put<AnalysisCenterApi.PredictionModelVersion>(`${BASE}/model-versions/${id}`, data);
}

/** 冻结模型版本 */
export function freezeModelVersion(id: number) {
  return requestClient.put<AnalysisCenterApi.PredictionModelVersion>(`${BASE}/model-versions/${id}/freeze`);
}

/** 删除模型版本 */
export function deleteModelVersion(id: number) {
  return requestClient.delete<{ success: boolean }>(`${BASE}/model-versions/${id}`);
}

// ===== Sprint8-A-1: 预测预警联动 =====

/** 生成预测预警（触发联动） */
export function generatePredictionWarning(id: number) {
  return requestClient.post<AnalysisCenterApi.PredictionWarning>(`${BASE}/predictions/${id}/generate-warning`);
}

/** 预测预警列表 */
export function getPredictionWarnings(params?: {
  status?: string;
  warning_level?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<AnalysisCenterApi.PredictionWarningListResponse>(`${BASE}/prediction-warnings`, { params });
}

/** 预测预警统计 */
export function getPredictionWarningStats(params?: { year?: number }) {
  return requestClient.get<AnalysisCenterApi.PredictionWarningStats>(`${BASE}/prediction-warnings/stats`, { params });
}