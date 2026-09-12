/**
 * HSE 员工风险画像详情 API（web-naive）
 *
 * 对应后端路由: /hse/risk/profile
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/risk/profile';

export namespace RiskProfileDetailApi {
  export interface BasicInfo {
    id: number;
    employeeCode: string;
    name: string;
    gender: string;
    department: string;
    position: string;
    operationUnit: string;
    unitType: string;
    status: string;
    personType: string;
    personCategory: string;
    isPublicWelfare: boolean;
    phone: string;
    idCard: string;
    birthDate: string;
  }

  export interface RiskOverview {
    totalScore: number;
    riskLevel: string;
    riskLevelName: string;
    riskLevelColor: string;
    rank: number | null;
    totalEmployees: number;
    calculatedAt: string | null;
  }

  export interface RiskDimension {
    score: number;
    weight: number;
    applicable: boolean;
    rawValue: number;
  }

  export interface RiskComposition {
    violation: RiskDimension;
    driverCompliance: RiskDimension;
    incident: RiskDimension;
    trainingCompliance: RiskDimension;
    managementExecution: RiskDimension;
  }

  export interface ViolationRecord {
    date: string;
    type: string;
    description: string;
    punishment: string;
    amount: number;
    status: string;
    township: string;
  }

  export interface DriverRecord {
    date: string;
    type: string;
    description: string;
    points: number;
    fineAmount: number;
    status: string;
  }

  export interface InspectionRecord {
    date: string;
    type: string;
    result: string;
    description: string;
    inspector: string;
    siteName: string;
  }

  export interface AccidentRecord {
    date: string;
    type: string;
    description: string;
    level: string;
    responsibilityLevel: string;
    status: string;
    casualties: number;
    injuries: number;
    lossAmount: number;
    township: string;
  }

  export interface TrainingRecord {
    date: string;
    name: string;
    type: string;
    durationHours: number;
    result: string;
    expiryDate: string;
    organization: string;
  }

  export interface RiskEvents {
    violations: ViolationRecord[];
    driverRecords: DriverRecord[];
    inspections: InspectionRecord[];
    accidents: AccidentRecord[];
    trainings: TrainingRecord[];
  }

  export interface ProfileDetail {
    basicInfo: BasicInfo;
    riskOverview: RiskOverview;
    riskComposition: RiskComposition | null;
    riskEvents: RiskEvents;
  }

  export type TrendPeriod = 'day' | 'week' | 'month';

  export interface TrendDataPoint {
    periodDate: string;
    avgScore: number;
    maxScore: number;
    minScore: number;
    sampleCount: number;
  }

  export interface TrendData {
    period: TrendPeriod;
    trend: TrendDataPoint[];
  }
}

export async function getProfileDetail(employeeId: number) {
  return requestClient.get<RiskProfileDetailApi.ProfileDetail>(`${BASE}/${employeeId}`);
}

export async function getProfileTrend(
  employeeId: number,
  period: RiskProfileDetailApi.TrendPeriod = 'week',
) {
  return requestClient.get<RiskProfileDetailApi.TrendData>(`${BASE}/${employeeId}/trend`, {
    params: { period },
  });
}
