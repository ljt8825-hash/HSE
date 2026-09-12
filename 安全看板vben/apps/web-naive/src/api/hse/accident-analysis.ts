/**
 * HSE 事故分析中心 API - Sprint6.4-C
 *
 * 对应后端路由: server/routes/hse-accident-analysis.js
 * 路由前缀: /hse/accident-analysis
 * 复用: #/api/request 的 requestClient
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/accident-analysis';

export namespace AccidentAnalysisApi {
  export interface TypeDistributionItem {
    category: string;
    count: number;
    casualties: number;
    injuries: number;
    lossAmount: number;
  }

  export interface LevelDistributionItem {
    level: string;
    count: number;
  }

  export interface StatusDistributionItem {
    status: string;
    count: number;
  }

  export interface OverviewData {
    totalCount: number;
    involvedCount: number;
    responsibleCount: number;
    majorCount: number;
    totalCasualties: number;
    totalInjuries: number;
    totalLoss: number;
    typeDistribution: TypeDistributionItem[];
    levelDistribution: LevelDistributionItem[];
    statusDistribution: StatusDistributionItem[];
  }

  export type TrendPeriod = 'year' | 'month';

  export interface YearlyTrendItem {
    year: number;
    count: number;
    responsibleCount: number;
    casualties: number;
    injuries: number;
    lossAmount: number;
  }

  export interface TypeYearlyTrendItem {
    year: number;
    category: string;
    count: number;
  }

  export interface MonthlyTrendItem {
    month: number;
    count: number;
    responsibleCount: number;
    casualties: number;
    injuries: number;
    lossAmount: number;
  }

  export interface TypeMonthlyTrendItem {
    month: number;
    category: string;
    count: number;
  }

  export interface TrendData {
    period: TrendPeriod;
    year?: number;
    yearly?: YearlyTrendItem[];
    typeYearly?: TypeYearlyTrendItem[];
    monthly?: MonthlyTrendItem[];
    typeMonthly?: TypeMonthlyTrendItem[];
  }

  export interface CategoryDetail {
    category: string;
    count: number;
    responsibleCount: number;
    casualties: number;
    injuries: number;
    lossAmount: number;
    majorCount: number;
  }

  export interface TypeDetail {
    accidentType: string;
    count: number;
    responsibleCount: number;
    casualties: number;
    injuries: number;
    lossAmount: number;
  }

  export interface TownshipDistributionItem {
    township: string;
    count: number;
    responsibleCount: number;
  }

  export interface ClassificationData {
    categories: CategoryDetail[];
    typeDetails: TypeDetail[];
    levelDetails: LevelDistributionItem[];
    townshipDistribution: TownshipDistributionItem[];
  }

  export interface TopResponsiblePerson {
    personName: string;
    accidentCount: number;
    responsibleCount: number;
    majorCount: number;
    casualties: number;
    injuries: number;
    latestAccidentDate: string;
  }

  export interface PositionDistributionItem {
    positionName: string;
    personCount: number;
    accidentCount: number;
    responsibleCount: number;
  }

  export interface DepartmentDistributionItem {
    departmentName: string;
    personCount: number;
    accidentCount: number;
    responsibleCount: number;
  }

  export interface LinkedEmployee {
    employeeId: number;
    name: string;
    employeeCode: string;
    positionName: string;
    orgName: string;
    accidentCount: number;
    responsibleCount: number;
    latestAccidentDate: string;
  }

  export interface ResponsibleData {
    topResponsible: TopResponsiblePerson[];
    positionDistribution: PositionDistributionItem[];
    departmentDistribution: DepartmentDistributionItem[];
    linkedEmployees: {
      list: LinkedEmployee[];
      total: number;
      page: number;
      pageSize: number;
    };
  }

  export interface ResponsibleParams {
    page?: number;
    pageSize?: number;
  }
}

export function getAccidentOverview() {
  return requestClient.get<AccidentAnalysisApi.OverviewData>(`${BASE}/overview`);
}

export function getAccidentTrend(params?: { period?: AccidentAnalysisApi.TrendPeriod; year?: number }) {
  return requestClient.get<AccidentAnalysisApi.TrendData>(`${BASE}/trend`, { params });
}

export function getAccidentClassification() {
  return requestClient.get<AccidentAnalysisApi.ClassificationData>(`${BASE}/classification`);
}

export function getAccidentResponsible(params?: AccidentAnalysisApi.ResponsibleParams) {
  return requestClient.get<AccidentAnalysisApi.ResponsibleData>(`${BASE}/responsible`, { params });
}