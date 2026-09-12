/**
 * HSE 考核分析系统 API - Sprint6.5-B
 * 对应后端路由: server/routes/hse-assessment.js
 * 路由前缀: /hse/assessment
 * 模型版本: v1.1
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/assessment';

export namespace AssessmentApi {
  /** 模型版本信息 */
  export interface ModelVersion {
    version: string;
    effectiveDate: string;
    description: string;
  }

  /** 维度得分 */
  export interface DimensionScore {
    score: number;
    rank: number;
  }

  /** 考核总览数据 */
  export interface OverviewData {
    currentYear: number;
    modelVersion: ModelVersion;
    overallScore: number;
    grade: string;
    scores: {
      safety: DimensionScore;
      risk: DimensionScore;
      accident: DimensionScore;
      rectification: DimensionScore;
      management: DimensionScore;
    };
    summary: {
      accidentCount: number;
      accidentWeightedIndex: number;
      violationCount: number;
      seriousViolationCount: number;
      trainingCompletionRate: number;
      rectificationRate: number;
      demeritRate: number;
      gridInspectionCompliance: number;
      majorRiskCount: number;
      highRiskCount: number;
      avgRiskScore: number;
    };
    trend: Array<{
      year: number;
      accidentCount: number;
      weightedIndex: number;
      overallScore: number;
    }>;
    topDepartments: Array<{
      deptId: number;
      deptName: string;
      overallScore: number;
      rank: number;
    }>;
  }

  /** 扣分项 */
  export interface DeductionItem {
    category: string;
    reason: string;
    deductionPoints: number;
  }

  /** 组织排名项 */
  export interface RankingItem {
    orgId: number;
    orgName: string;
    orgType: string;
    overallScore: number;
    overallRank: number;
    scores: {
      safety: number;
      risk: number;
      accident: number;
      rectification: number;
      management: number;
    };
    ranks: {
      safety: number;
      risk: number;
      accident: number;
      rectification: number;
      management: number;
    };
    topDeductions: DeductionItem[];
    accidentCount: number;
    violationCount: number;
    employeeCount: number;
    majorRiskCount: number;
    highRiskCount: number;
  }

  /** 组织排名数据 */
  export interface RankingData {
    level: string;
    currentYear: number;
    rankings: RankingItem[];
  }

  /** 指标项 */
  export interface IndicatorItem {
    name: string;
    value: number;
    unit?: string;
    target: number;
    score: number;
    status: string;
  }

  /** 指标分类 */
  export interface IndicatorCategory {
    category: string;
    categoryKey: string;
    indicators: IndicatorItem[];
    chartData: {
      labels: string[];
      values: number[];
    };
  }

  /** 指标分析数据 */
  export interface IndicatorAnalysisData {
    currentYear: number;
    categories: IndicatorCategory[];
  }

  /** 目标项 */
  export interface TargetItem {
    id: number;
    name: string;
    category: string;
    targetValue: number;
    targetUnit?: string;
    actualValue: number;
    actualUnit?: string;
    gap: number;
    completionRate: number;
    status: string;
    responsibleUnit: string;
    responsibilityLevel: string;
  }

  /** 目标责任书数据 */
  export interface TargetProgressData {
    currentYear: number;
    contractVersion: {
      id: number;
      name: string;
      version: string;
      effectiveDate: string;
      expiryDate: string;
      status: string;
    } | null;
    targets: TargetItem[];
  }

  /** 数据来源 */
  export interface DataSource {
    table: string;
    recordCount: number;
    description: string;
  }

  /** 责任对象 */
  export interface Responsible {
    type: string;
    id: number;
    name: string;
    contribution: number;
    details: string;
  }

  /** 扣分详情项 */
  export interface DeductionDetailItem {
    indicator: string;
    indicatorCode: string;
    deductionPoints: number;
    dataSources: DataSource[];
    responsibles: Responsible[];
  }

  /** 扣分详情数据 */
  export interface DeductionDetailData {
    category: string;
    currentYear: number;
    totalDeduction: number;
    details: DeductionDetailItem[];
  }
}

/** 公司HSE考核总览 */
export function getAssessmentOverview(year?: number) {
  return requestClient.get<AssessmentApi.OverviewData>(`${BASE}/overview`, { params: { year } });
}

/** 组织考核排名 */
export function getAssessmentRanking(level?: string, year?: number) {
  return requestClient.get<AssessmentApi.RankingData>(`${BASE}/ranking`, { params: { level, year } });
}

/** 指标分析 */
export function getIndicatorAnalysis(category?: string, year?: number) {
  return requestClient.get<AssessmentApi.IndicatorAnalysisData>(`${BASE}/indicator-analysis`, { params: { category, year } });
}

/** 目标责任书完成情况 */
export function getTargetProgress(year?: number) {
  return requestClient.get<AssessmentApi.TargetProgressData>(`${BASE}/target-progress`, { params: { year } });
}

/** 扣分原因分析 */
export function getDeductionDetail(category: string, orgId?: number, year?: number) {
  return requestClient.get<AssessmentApi.DeductionDetailData>(`${BASE}/deduction-detail`, { params: { category, orgId, year } });
}
