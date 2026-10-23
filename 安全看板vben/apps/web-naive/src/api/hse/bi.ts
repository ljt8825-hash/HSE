/**
 * BI 数据看板 API（web-naive，挂载于「安全总览」模块下）
 * 对应后端路由: server/routes/bi.js
 * 路由前缀: /hse/bi
 * 契约：全部只读；year 缺省（undefined）为历年累计；year+month=单月快照；
 * trend 累计模式截断到当前月，单月模式仅返回选中月。
 * requestClient 已解包 { code, data }，各 getX 直接返回 data。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/bi';

export namespace BiApi {
  /** 10 维汇总（公司级，与领导视角看板 Summary10 结构一致） */
  export interface Summary {
    accidents: { count: number; major: number; weightedIndex: number };
    drivers: {
      personCount: number;
      demeritCount: number;
      vehicleCheckCount: number;
      driverCheckCount: number;
      violationCount: number;
    };
    risks: { count: number };
    hazards: { count: number };
    transferStations: { checkCount: number };
    violations: { count: number; serious: number };
    inspections: { count: number };
    trainings: { recordCount: number; personCount: number };
    emergencies: { count: number; passed: number };
    assessments: { targetCount: number; avgScore: number; gradeGood: number };
  }

  /** GET /overview */
  export interface OverviewData {
    year: number | null;
    month: number | null;
    cumulative: boolean;
    timestamp: string;
    summary: Summary;
  }

  /** 各维度按月数组（风险静态台账恒 null，不入月度） */
  export interface TrendRows {
    accidents: { count: number[]; major: number[]; weightedIndex: number[] };
    drivers: {
      demeritCount: number[];
      vehicleCheckCount: number[];
      driverCheckCount: number[];
      violationCount: number[];
    };
    hazards: { count: number[] };
    transferStations: { checkCount: number[] };
    violations: { count: number[]; serious: number[] };
    inspections: { count: number[] };
    trainings: { recordCount: number[]; personCount: number[] };
    emergencies: { count: number[]; passed: number[] };
    assessments: { targetCount: number[]; gradeGood: number[]; avgScore: number[] };
    risks: null;
  }

  /** GET /trend */
  export interface TrendData {
    year: number | null;
    month: number | null;
    cumulative: boolean;
    months: string[];
    rows: TrendRows;
  }

  export type RankingMetricKey =
    | 'violations'
    | 'hazards'
    | 'accidents'
    | 'inspections'
    | 'trainings'
    | 'emergencies'
    | 'companyChecks';

  /** 乡镇排行行：10 维指标为组织结构（id/orgName/shortName）；companyChecks 为 {name,value} 归因桶 */
  export interface RankingRow {
    id?: number;
    orgName?: string;
    shortName?: string;
    orgType?: string;
    name?: string;
    value: number;
  }

  /** GET /ranking */
  export interface RankingData {
    metricKey: RankingMetricKey;
    order: 'asc' | 'desc';
    top: number;
    year: number | null;
    month: number | null;
    cumulative: boolean;
    rows: RankingRow[];
  }

  export interface MapRow {
    name: string;
    value: number;
  }

  export type MapType = 'hazards' | 'accidents' | 'emergencies';

  /** GET /map */
  export interface MapData {
    type: MapType;
    label: string;
    year: number | null;
    month: number | null;
    cumulative: boolean;
    total: number;
    rows: MapRow[];
  }
}

/** 公司级 10 维汇总（year 缺省=历年累计；year+month=单月快照） */
export function getBiOverview(year?: number, month?: number) {
  return requestClient.get<BiApi.OverviewData>(`${BASE}/overview`, { params: { year, month } });
}

/** 公司级逐月趋势（year 缺省=累计截断当前月；month 传入=单月截断） */
export function getBiTrend(year?: number, month?: number) {
  return requestClient.get<BiApi.TrendData>(`${BASE}/trend`, { params: { year, month } });
}

/** 乡镇排行（metricKey 必传；order/top/year/month 可选） */
export function getBiRanking(
  metricKey: BiApi.RankingMetricKey,
  opts: { order?: 'asc' | 'desc'; top?: number; year?: number; month?: number } = {},
) {
  return requestClient.get<BiApi.RankingData>(`${BASE}/ranking`, {
    params: { metricKey, ...opts },
  });
}

/** 隐患乡镇 / 事故等级 / 演练乡镇 分布（year+month=单月快照） */
export function getBiMap(type: BiApi.MapType, year?: number, month?: number) {
  return requestClient.get<BiApi.MapData>(`${BASE}/map`, { params: { type, year, month } });
}
