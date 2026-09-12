/**
 * HSE 综合驾驶舱 API - Sprint6.3-B-2
 *
 * 对应后端路由: server/routes/hse-dashboard.js
 * 路由前缀: /hse/dashboard
 * 复用: #/api/request 的 requestClient
 *
 * @deprecated 模块级废弃：Q1 审计（P0-4 / P2-4）确认本文件全部导出函数零调用。
 * 视图层 `views/hse/cockpit/index.vue` 已绕过本文件改用裸 `requestClient.get('/overview/stats' | '/overview/cards')`（前缀不一致），
 * 且 `RiskTop.vue` 为孤儿组件（emit 无人监听）。
 * TODO(Phase 1 / 后端协作): 统一驾驶舱端点前缀并恢复本模块调用，或确认无动态引用后整体删除；
 * 当前仅加注释标注死代码，不改变函数体、不删除。
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/dashboard';

export namespace CockpitApi {
  /** 风险等级配置项 */
  export interface RiskLevelConfig {
    levelCode: string;
    levelName: string;
    levelOrder: number;
    minScore: number;
    maxScore: number;
    colorCode: string;
    description?: string;
  }

  /** 驾驶舱总览数据 */
  export interface OverviewData {
    totalEmployees: number;
    evaluatedCount: number;
    criticalRiskCount: number;
    highRiskCount: number;
    highRiskRatio: number;
    improvementRate: number;
    levelDistribution: Record<string, { name: string; count: number; color: string }>;
    avgScore: number | null;
  }

  /** 风险等级分布数据 */
  export interface LevelDistributionData {
    levels: Array<{
      levelCode: string;
      levelName: string;
      colorCode: string;
      minScore: number;
      maxScore: number;
      count: number;
      ratio: number;
    }>;
    total: number;
  }

  /** 风险类型分析数据 */
  export interface RiskTypeAnalysisData {
    riskTypes: Array<{
      typeCode: string;
      typeName: string;
      avgScore: number;
      highRiskCount: number;
      extra: Record<string, any>;
    }>;
    totalEvaluated: number;
  }

  /** TOP风险员工 */
  export interface TopEmployee {
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    positionName: string;
    finalScore: number;
    riskLevel: string;
    riskLevelCode: string;
    scores: {
      violation: number;
      driverCompliance: number;
      trainingCompliance: number;
      incident: number;
      managementExecution: number;
    };
  }

  /** TOP风险部门 */
  export interface TopDepartment {
    orgId: number;
    orgName: string;
    avgScore: number;
    highRiskCount: number;
    totalCount: number;
  }

  /** TOP风险作业单元 */
  export interface TopOperationUnit {
    unitId: number;
    unitName: string;
    avgScore: number;
    highRiskCount: number;
    totalCount: number;
  }

  /** 风险TOP排行数据 */
  export interface RiskTopData {
    topEmployees: TopEmployee[];
    topDepartments: TopDepartment[];
    topOperationUnits: TopOperationUnit[];
  }

  /** 风险趋势项 */
  export interface TrendItem {
    date: string;
    avgScore: number;
    employeeCount: number;
    highRiskCount: number;
  }

  /** 等级趋势项 */
  export interface LevelTrendItem {
    date: string;
    levelCode: string;
    count: number;
  }

  /** 风险趋势数据 */
  export interface RiskTrendData {
    period: string;
    metric: string;
    trend: TrendItem[];
    levelTrend: LevelTrendItem[];
  }

  /** 管理履职汇总 */
  export interface ManagementSummary {
    totalInspections: number;
    totalProblems: number;
    completedCount: number;
    overdueCount: number;
    problemFoundRate: number;
    rectificationRate: number;
  }

  /** 网格层级指标 */
  export interface GridLevelMetric {
    gridLevel: string;
    actualCount?: number;
    expectedCount?: number;
    completionRate?: number;
    totalInspections?: number;
    problemCount?: number;
    problemFoundRate?: number;
    totalProblems?: number;
    completedCount?: number;
    pendingCount?: number;
    overdueCount?: number;
    rectificationRate?: number;
  }

  /** 管理履职数据 */
  export interface ManagementExecutionData {
    summary: ManagementSummary;
    execution: {
      title: string;
      gridLevels: GridLevelMetric[];
    };
    quality: {
      title: string;
      gridLevels: GridLevelMetric[];
    };
    closure: {
      title: string;
      gridLevels: GridLevelMetric[];
    };
  }

  /** 趋势周期类型 */
  export type TrendPeriod = 'daily' | 'weekly' | 'monthly';

  /** 趋势指标类型 */
  export type TrendMetric = 'total' | 'violation' | 'driver' | 'training' | 'incident' | 'management';
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。改用 `requestClient.get('/overview/stats')` 或恢复统一端点后调用。 */
export function getOverview() {
  return requestClient.get<CockpitApi.OverviewData>(`${BASE}/overview`);
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。 */
export function getLevelDistribution() {
  return requestClient.get<CockpitApi.LevelDistributionData>(`${BASE}/level-distribution`);
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。 */
export function getRiskTypeAnalysis() {
  return requestClient.get<CockpitApi.RiskTypeAnalysisData>(`${BASE}/risk-type-analysis`);
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。风险 TOP 榜单当前由 `RiskTop.vue` 展示但为孤儿组件，未挂载。 */
export function getRiskTop(limit: number = 10) {
  return requestClient.get<CockpitApi.RiskTopData>(`${BASE}/risk-top`, { params: { limit } });
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。注意：同仓 `executive-cockpit.ts` / `analysis-center.ts` 另有同名函数，非本函数。 */
export function getRiskTrend(period: CockpitApi.TrendPeriod = 'daily', metric: CockpitApi.TrendMetric = 'total') {
  return requestClient.get<CockpitApi.RiskTrendData>(`${BASE}/risk-trend`, {
    params: { period, metric },
  });
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。 */
export function getManagementExecution(days: number = 30) {
  return requestClient.get<CockpitApi.ManagementExecutionData>(`${BASE}/management-execution`, {
    params: { days },
  });
}

/** @deprecated 死代码（Q1 P0-4/P2-4，全仓零调用）。 */
export function getRiskLevelConfig() {
  return requestClient.get<CockpitApi.RiskLevelConfig[]>(`${BASE}/risk-level-config`);
}
