/**
 * HSE 驾驶员专项风险中心 API - Sprint6.4-B
 *
 * 对应后端路由: server/routes/hse-driver-risk-center.js
 * 路由前缀: /hse/driver-risk-center
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/driver-risk-center';

export namespace DriverRiskCenterApi {
  export interface LevelDistributionItem {
    levelCode: string;
    levelName: string;
    colorCode: string;
    count: number;
  }

  export interface OverviewData {
    driverCount: number;
    levelDistribution: LevelDistributionItem[];
    highRiskCount: number;
    demeritStatistics: {
      demeritDriverCount: number;
      demeritTotalCount: number;
      totalPoints: number;
    };
    accidentStatistics: {
      accidentDriverCount: number;
      accidentTotalCount: number;
    };
    inspectionStatistics: {
      inspectionDriverCount: number;
      inspectionTotalCount: number;
      failedCount: number;
    };
    trainingStatistics: {
      trainedDriverCount: number;
      avgComplianceRate: number;
    };
  }

  export interface DriverListItem {
    employeeId: number;
    employeeCode: string;
    name: string;
    gender: string;
    orgName: string;
    unitName: string;
    unitType: string;
    positionName: string;
    totalScore: number;
    riskLevel: string;
    riskLevelName: string;
    riskLevelColor: string;
    demeritPoints: number;
    demeritCount: number;
    accidentCount: number;
  }

  export interface DriverListData {
    list: DriverListItem[];
    total: number;
    page: number;
    pageSize: number;
  }

  export interface DemeritPointsDistributionItem {
    range: string;
    count: number;
  }

  export interface TopDemeritDriver {
    employeeId: number;
    name: string;
    employeeCode: string;
    positionName: string;
    totalPoints: number;
    demeritCount: number;
  }

  export interface MonthlyDemeritTrendItem {
    month: string;
    count: number;
    totalPoints: number;
  }

  export interface DemeritStatisticsData {
    period: string;
    overall: {
      demeritDriverCount: number;
      demeritTotalCount: number;
      totalPoints: number;
      avgPointsPerRecord: number;
    };
    pointsDistribution: DemeritPointsDistributionItem[];
    topDrivers: TopDemeritDriver[];
    monthlyTrend: MonthlyDemeritTrendItem[];
  }

  export interface AccidentLevelDistributionItem {
    level: string;
    count: number;
  }

  export interface YearlyAccidentTrendItem {
    year: string;
    count: number;
  }

  export interface ResponsibleDriver {
    employeeId: number;
    name: string;
    employeeCode: string;
    positionName: string;
    accidentCount: number;
    responsibleCount: number;
  }

  export interface AccidentStatisticsData {
    overall: {
      accidentDriverCount: number;
      accidentTotalCount: number;
      responsibleCount: number;
    };
    levelDistribution: AccidentLevelDistributionItem[];
    yearlyTrend: YearlyAccidentTrendItem[];
    responsibleDrivers: ResponsibleDriver[];
  }

  export interface DriverListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    risk_level?: string;
    org_unit_id?: number;
    operation_unit_id?: number;
  }
}

export function getDriverRiskOverview() {
  return requestClient.get<DriverRiskCenterApi.OverviewData>(`${BASE}/overview`);
}

export function getDriverList(params?: DriverRiskCenterApi.DriverListParams) {
  return requestClient.get<DriverRiskCenterApi.DriverListData>(`${BASE}/drivers`, { params });
}

export function getDemeritStatistics() {
  return requestClient.get<DriverRiskCenterApi.DemeritStatisticsData>(`${BASE}/demerit/statistics`);
}

export function getAccidentStatistics() {
  return requestClient.get<DriverRiskCenterApi.AccidentStatisticsData>(`${BASE}/accident/statistics`);
}
