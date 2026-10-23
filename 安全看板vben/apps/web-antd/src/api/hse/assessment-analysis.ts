/**
 * HSE 考核分析中心 API - Sprint6.5
 *
 * 对应后端路由: server/routes/hse-assessment-analysis.js
 * 路由前缀: /hse/assessment-analysis
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/assessment-analysis';

export namespace AssessmentAnalysisApi {
  export interface Targets {
    accidentCount: number;
    majorAccidentCount: number;
    accidentWeightedIndex: number;
    violationCount: number;
    trainingCompletionRate: number;
    rectificationRate: number;
    avgRiskScore: number;
    demeritRate: number;
    gridInspectionCompliance: number;
  }

  export interface ActualData {
    accidentCount: number;
    majorAccidentCount: number;
    seriousAccidentCount: number;
    generalAccidentCount: number;
    minorAccidentCount: number;
    accidentClosedCount: number;
    accidentCasualties: number;
    accidentInjuries: number;
    accidentLoss: number;
    accidentWeightedIndex: number;
    violationCount: number;
    violationSeriousCount: number;
    violationGeneralCount: number;
    violationMinorCount: number;
    violationClosedCount: number;
    violationPendingCount: number;
    trainingCount: number;
    trainingQualifiedCount: number;
    trainingUnqualifiedCount: number;
    trainingAvgScore: number;
    hazardCount: number;
    hazardCompletedCount: number;
    hazardOverdueCount: number;
    hazardPendingCount: number;
    hazardInProgressCount: number;
    demeritRecords: number;
    demeritPoints: number;
    demeritDriverCount: number;
    totalDriverCount: number;
    currentYearDemeritRecords: number;
    currentYearDemeritPoints: number;
    demeritRate: number;
    riskTotalEmployees: number;
    riskMajorCount: number;
    riskHighCount: number;
    riskMediumCount: number;
    riskLowCount: number;
    riskAvgScore: number;
    gridInspectionCompliance: number;
    gridChiefStats: Array<{
      gridLevel: string;
      chiefCount: number;
      inspectionCount: number;
    }>;
  }

  export interface CompletionRates {
    accidentTargetRate: number;
    accidentIndexRate: number;
    violationTargetRate: number;
    trainingCompletionRate: number;
    rectificationRate: number;
    demeritRate: number;
    gridInspectionCompliance: number;
  }

  export interface TrendItem {
    year: number;
    accidentCount: number;
    totalLoss: number;
    weightedIndex: number;
  }

  export interface OverviewData {
    currentYear: number;
    targets: Targets;
    actual: ActualData;
    completionRates: CompletionRates;
    trend: TrendItem[];
  }

  export interface DepartmentRankingItem {
    deptId: number;
    deptName: string;
    unitType: string;
    safetyRank: number;
    safetyScore: number;
    riskRank: number;
    riskScore: number;
    accidentRank: number;
    accidentScore: number;
    rectificationRank: number;
    rectificationScore: number;
    managementRank: number;
    managementScore: number;
    overallScore: number;
    accidentCount: number;
    majorAccidentCount: number;
    seriousAccidentCount: number;
    generalAccidentCount: number;
    minorAccidentCount: number;
    accidentClosedCount: number;
    accidentWeightedIndex: number;
    violationCount: number;
    seriousViolationCount: number;
    generalViolationCount: number;
    violationClosedCount: number;
    employeeCount: number;
    majorRiskCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
    avgRiskScore: number;
    taskCount: number;
    completedTaskCount: number;
    overdueTaskCount: number;
    inProgressTaskCount: number;
    gridCompliance: number;
    totalGridChiefCount: number;
    level1GridChiefCount: number;
    level2GridChiefCount: number;
    level3GridChiefCount: number;
    inspectionCount: number;
    driverCount: number;
    demeritCount5y: number;
    demeritPoints5y: number;
    demeritCountCurrent: number;
    demeritPointsCurrent: number;
  }

  export interface DepartmentRankingData {
    currentYear: number;
    rankings: DepartmentRankingItem[];
    scoringWeights: {
      safety: number;
      risk: number;
      accident: number;
      rectification: number;
      management: number;
    };
  }

  export interface TownshipRankingItem {
    targetId: number | null;
    townshipId: number;
    townshipName: string;
    unitType: string;
    managerName: string | null;
    managerEmployeeId: number | null;
    managerCode: string | null;
    position: string | null;
    scoreAuto: number | null;
    scoreTotal: number | null;
    grade: string | null;
    status: string | null;
    reviewStatus: string | null;
    scoreSource: 'manager' | 'admin_aggregate' | null;
    adminCount: number | null;
    adminAvgScore: number | null;
    adminMaxScore: number | null;
    overallRank: number | null;
    hasData: boolean;
  }

  export interface TownshipRankingData {
    currentYear: number;
    cycleId: number | null;
    cycleName: string | null;
    cycleStatus: string | null;
    rankings: TownshipRankingItem[];
    noDataTownships: string[];
  }

  export type GoalStatus = 'completed' | 'in_progress' | 'warning';

  export interface GoalItem {
    id: number;
    name: string;
    category: string;
    targetValue: number;
    targetUnit: string;
    actualValue: number;
    actualUnit: string;
    gap: number;
    completionRate: number;
    status: GoalStatus;
    description: string;
  }

  export interface ContractVersion {
    id: number;
    name: string;
    version: string;
    effectiveDate: string;
    expiryDate: string;
    status: string;
  }

  export interface GoalsData {
    currentYear: number;
    goals: GoalItem[];
    contractVersion: ContractVersion | null;
    allVersions: ContractVersion[];
  }

  export interface ReasonAnalysisItem {
    reasonType: string;
    subReason: string;
    count: number;
    deductionPoints: number;
    severity: string;
  }

  export interface DepartmentDeductionItem {
    deptName: string;
    accidentCount: number;
    violationCount: number;
    overdueCount: number;
    totalDeduction: number;
  }

  export interface PersonDeductionItem {
    employeeId: number;
    employeeName: string;
    employeeCode: string;
    positionName: string;
    deptName: string;
    accidentCount: number;
    violationCount: number;
    demeritCount: number;
    totalDeduction: number;
  }

  export interface RectificationStatus {
    total: number;
    completed: number;
    overdue: number;
    pending: number;
    inProgress: number;
  }

  export interface DeductionData {
    currentYear: number;
    reasonAnalysis: ReasonAnalysisItem[];
    departmentDeduction: DepartmentDeductionItem[];
    personDeduction: PersonDeductionItem[];
    rectificationStatus: RectificationStatus;
  }
}

export function getAssessmentOverview() {
  return requestClient.get<AssessmentAnalysisApi.OverviewData>(`${BASE}/overview`);
}

export function getDepartmentRanking() {
  return requestClient.get<AssessmentAnalysisApi.DepartmentRankingData>(`${BASE}/department-ranking`);
}

export function getTownshipRanking(cycleId?: number | string) {
  return requestClient.get<AssessmentAnalysisApi.TownshipRankingData>(`${BASE}/township-ranking`, {
    params: cycleId != null && cycleId !== '' ? { cycleId } : undefined,
  });
}

export function getAssessmentGoals() {
  return requestClient.get<AssessmentAnalysisApi.GoalsData>(`${BASE}/goals`);
}

export function getAssessmentDeduction() {
  return requestClient.get<AssessmentAnalysisApi.DeductionData>(`${BASE}/deduction`);
}