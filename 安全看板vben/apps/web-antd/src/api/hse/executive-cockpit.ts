/**
 * HSE 安全总览 API - Sprint6.5-C
 * 对应后端路由: server/routes/hse-executive-cockpit.js
 * 路由前缀: /hse/executive-cockpit
 * 模型版本: v1.1
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/executive-cockpit';

export namespace ExecutiveCockpitApi {
  /** 模型版本信息 */
  export interface ModelVersion {
    version: string;
    effectiveDate: string | null;
    description: string;
  }

  /** KPI卡片 */
  export interface KpiCard {
    key: string;
    title: string;
    value: number | string;
    unit: string;
    status: 'excellent' | 'good' | 'warning' | 'danger';
    trend: number | null;
    description: string;
  }

  /** 维度得分 */
  export interface DimensionScores {
    safety: number;
    risk: number;
    accident: number;
    rectification: number;
    management: number;
  }

  /** 1. 公司HSE安全态势 */
  export interface OverviewData {
    currentYear: number;
    modelVersion: ModelVersion;
    overallScore: number;
    grade: string;
    riskLevel: string;
    kpiCards: KpiCard[];
    scores: DimensionScores;
    summary: {
      accidentCount: number;
      majorAccidentCount: number;
      violationCount: number;
      majorRiskCount: number;
      highRiskCount: number;
      rectificationRate: number;
      gridCompliance: number;
      avgRiskScore: number;
    };
  }

  /** 2. 组织安全排名 */
  export interface OrgRankingItem {
    orgId: number;
    orgName: string;
    orgType: string;
    overallScore: number;
    grade: string;
    status: 'green' | 'yellow' | 'red';
    rank: number;
    scores: DimensionScores;
    accidentCount: number;
    majorAccidentCount: number;
    violationCount: number;
    employeeCount: number;
    majorRiskCount: number;
    highRiskCount: number;
  }

  export interface OrgRankingData {
    level: string;
    currentYear: number;
    rankings: OrgRankingItem[];
    statusStats: {
      green: number;
      yellow: number;
      red: number;
    };
  }

  /** 3. 风险态势分析 */
  export interface EmployeeRiskTrend {
    title: string;
    months: string[];
    avgScores: number[];
    majorCount: number[];
    highCount: number[];
    mediumCount: number[];
    lowCount: number[];
    totalCount: number[];
  }

  export interface DriverRiskTrend {
    title: string;
    months: string[];
    totalPoints: number[];
    driverCount: number[];
    recordCount: number[];
  }

  export interface AccidentTrend {
    title: string;
    periods: string[];
    accidentCount: number[];
    majorCount: number[];
    weightedIndex: number[];
  }

  export interface RiskTrendData {
    currentYear: number;
    employeeRisk: EmployeeRiskTrend;
    driverRisk: DriverRiskTrend;
    accident: AccidentTrend;
  }

  /** 4. 考核指标完成情况 */
  export interface TargetItem {
    id: number;
    name: string;
    category: string;
    targetValue: number;
    targetUnit: string;
    actualValue: number;
    actualUnit: string;
    isReverse: boolean;
    dataSource: string;
    completionRate: number;
    status: 'excellent' | 'good' | 'warning' | 'danger';
  }

  export interface IndicatorCategory {
    category: string;
    total: number;
    completed: number;
    completionRate: number;
  }

  export interface IndicatorCompletionData {
    currentYear: number;
    contractVersion: {
      id: number;
      name: string;
      version: string;
      effectiveDate: string;
      expiryDate: string;
      status: string;
    } | null;
    contractCompletionRate: number;
    keyIndicatorRate: number;
    categories: IndicatorCategory[];
    indicators: TargetItem[];
  }

  /** 5. 重大风险预警 */
  export interface HighRiskOrg {
    orgId: number;
    orgName: string;
    orgType: string;
    riskLevel: string;
    overallScore: number;
    accidentCount: number;
    majorAccidentCount: number;
    highRiskCount: number;
    employeeCount: number;
    warningReasons: string[];
  }

  export interface HighRiskEmployee {
    employeeId: number;
    employeeName: string;
    employeeCode: string;
    positionName: string;
    deptName: string;
    totalScore: number;
    riskLevel: string;
    riskLevelCode: string;
  }

  export interface MajorAccidentRisk {
    accidentId: number;
    title: string;
    level: string;
    accidentDate: string;
    personnelName: string;
    deptName: string;
    lossAmount: number;
    casualties: number;
    injuries: number;
  }

  export interface OverdueRectification {
    taskId: number;
    taskTitle: string;
    status: string;
    createdAt: string;
    dueDate: string;
    responsiblePerson: string;
    deptName: string;
    priorityLevel: string;
  }

  export interface MajorRiskWarningData {
    currentYear: number;
    warningStats: {
      highRiskOrgCount: number;
      highRiskEmployeeCount: number;
      majorAccidentCount: number;
      overdueCount: number;
    };
    highRiskOrgs: HighRiskOrg[];
    highRiskEmployees: HighRiskEmployee[];
    majorAccidentRisks: MajorAccidentRisk[];
    overdueRectifications: OverdueRectification[];
  }

  /** 6. 管理履职分析 */
  export interface ManagementKpi {
    key: string;
    title: string;
    value: number;
    unit: string;
    target: number;
    status: 'excellent' | 'good' | 'warning' | 'danger';
    description: string;
  }

  export interface InspectionCompletion {
    gridLevel: string;
    chiefCount: number;
    actualCount: number;
    expectedCount: number;
    completionRate: number;
  }

  export interface LevelPerformance {
    gridLevel: string;
    inspectionCount: number;
    hazardCount: number;
    hazardDiscoveryRate: number;
    completedCount: number;
    closureRate: number;
  }

  export interface ManagementPerformanceData {
    days: number;
    kpiMetrics: ManagementKpi[];
    inspectionCompletion: InspectionCompletion[];
    byLevelPerformance: LevelPerformance[];
    summary: {
      totalChiefs: number;
      totalInspections: number;
      totalHazards: number;
      totalTasks: number;
      completedTasks: number;
      overallInspectionRate: number;
      hazardDiscoveryRate: number;
      closureRate: number;
    };
  }
}

/** 公司HSE安全态势 */
export function getExecutiveOverview(year?: number) {
  return requestClient.get<ExecutiveCockpitApi.OverviewData>(`${BASE}/overview`, { params: { year } });
}

/** 组织安全排名 */
export function getOrgRanking(level?: string, year?: number) {
  return requestClient.get<ExecutiveCockpitApi.OrgRankingData>(`${BASE}/org-ranking`, { params: { level, year } });
}

/** 风险态势分析 */
export function getRiskTrend(year?: number) {
  return requestClient.get<ExecutiveCockpitApi.RiskTrendData>(`${BASE}/risk-trend`, { params: { year } });
}

/** 考核指标完成情况 */
export function getIndicatorCompletion(year?: number) {
  return requestClient.get<ExecutiveCockpitApi.IndicatorCompletionData>(`${BASE}/indicator-completion`, { params: { year } });
}

/** 重大风险预警 */
export function getMajorRiskWarning(year?: number) {
  return requestClient.get<ExecutiveCockpitApi.MajorRiskWarningData>(`${BASE}/major-risk-warning`, { params: { year } });
}

/** 管理履职分析 */
export function getManagementPerformance(days?: number) {
  return requestClient.get<ExecutiveCockpitApi.ManagementPerformanceData>(`${BASE}/management-performance`, { params: { days } });
}
