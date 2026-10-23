/**
 * 领导视角统一看板 API（M2 前端，挂载于「安全总览」模块下）
 * 对应后端路由: server/routes/hse-leader-dashboard.js
 * 路由前缀: /hse/leader-dashboard
 * 契约：全部只读，year 缺省（undefined）为历年累计；requestClient 已解包 { code, data }。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/leader-dashboard';

export namespace LeaderDashboardApi {
  /** 乡镇/公园节点 */
  export interface TownNode {
    id: number;
    orgName: string;
    shortName: string;
  }

  /** 作业中心 */
  export interface CenterNode {
    id: number;
    orgName: string;
    orgType: string;
    townCount: number;
    towns: TownNode[];
  }

  /** 1. 作业中心列表 */
  export interface CentersData {
    centers: CenterNode[];
    townTotal: number;
  }

  /** 10 维汇总（环卫线全量；园林线前端按维度集渲染，drivers/transferStations 恒 0） */
  export interface Summary10 {
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

  /** 单月明细单元格（风险为静态台账、驾驶人员数为时点台账 → 不入月度） */
  export interface MonthCell {
    accidents: { count: number; major: number; weightedIndex: number };
    drivers: {
      demeritCount: number;
      vehicleCheckCount: number;
      driverCheckCount: number;
      violationCount: number;
    };
    hazards: { count: number };
    transferStations: { checkCount: number };
    violations: { count: number; serious: number };
    inspections: { count: number };
    trainings: { recordCount: number; personCount: number };
    emergencies: { count: number; passed: number };
    assessments: { targetCount: number; gradeGood: number; avgScore: number };
  }

  /** 2. 作业中心 → 乡镇汇总行 */
  export interface TownSummaryRow {
    id: number;
    orgName: string;
    shortName: string;
    orgType: string;
    summary: Summary10;
  }

  export interface TownsData {
    center: { id: number; orgName: string; orgType: string };
    year: number | null;
    cumulative: boolean;
    towns: TownSummaryRow[];
  }

  /** 3. 乡镇 → 角色分组 */
  export interface EmployeeBrief {
    employeeId: number;
    employeeCode: string;
    name: string;
    positionName: string;
    summary: {
      violations: number;
      accidents: number;
      inspections: number;
      trainings: number;
      assessmentCount: number;
      assessmentAvgScore: number;
    };
  }

  export type RoleType = 'manager' | 'admin' | 'driver' | 'other';

  export interface RoleGroup {
    role: RoleType;
    label: string;
    count: number;
    employees: EmployeeBrief[];
  }

  export interface RolesData {
    town: { id: number; orgName: string; shortName: string };
    year: number;
    employeeCount: number;
    roles: RoleGroup[];
  }

  /** 4. 员工个人跨模块明细 */
  export interface EmployeeInfo {
    employeeId: number;
    employeeCode: string;
    name: string;
    positionName: string;
    orgName: string;
    orgType: string;
    supervisorName: string | null;
  }

  export interface AssessmentItem {
    id: number;
    month: string;
    cycleName: string;
    scoreTotal: number;
    grade: string;
    rankTownship: string | null;
  }

  export interface AccidentItem {
    id: number;
    accidentNo: string;
    title: string;
    level: string;
    accidentDate: string;
    township: string;
  }

  export interface ViolationItem {
    id: number;
    violationDate: string;
    violationType: string;
    violationLevel: string;
    violatorName: string;
  }

  export interface InspectionItem {
    id: number;
    inspectionDate: string;
    areaTeam: string;
    gridLevel: string;
  }

  export interface TrainingItem {
    id: number;
    trainingDate: string;
    trainingType: string;
    result: string;
    trainer: string;
  }

  export interface InsuranceItem {
    id: number;
    personName: string;
    insuranceType: string;
    startDate: string;
    expireDate: string;
    premium: number;
    isCurrent: boolean;
  }

  export interface EmployeeDetailData {
    employee: EmployeeInfo;
    year: number;
    assessment: AssessmentItem[];
    accidents: AccidentItem[];
    violations: ViolationItem[];
    inspections: InspectionItem[];
    trainings: TrainingItem[];
    insurance: InsuranceItem[];
  }

  /** 5. 乡镇/公园逐月趋势（P2） */
  export interface TrendData {
    center: { id: number; orgName: string; orgType: string };
    org: { id: number; orgName: string; shortName: string; orgType: string };
    scope: { cumulative: boolean; year: number | null };
    months: string[];
    summary: Summary10;
    rows: {
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
    };
  }

  /** 6. 乡镇/公园经理（管理员）列表（P2） */
  export interface ManagerBrief {
    employeeId: number;
    employeeCode: string;
    name: string;
    positionName: string;
  }

  export interface TownManagersData {
    org: { id: number; orgName: string; shortName: string; orgType: string };
    roleLabel: string;
    managers: ManagerBrief[];
  }

  /** 7. 经理双口径累计（P2） */
  export interface ManagerOverviewData {
    employee: {
      employeeId: number;
      employeeCode: string;
      name: string;
      positionName: string;
      orgName: string;
      orgType: string;
    };
    org: { id: number; orgName: string; shortName: string; orgType: string };
    scope: { cumulative: boolean; year: number | null };
    jurisdiction: Summary10;
    personal: Summary10;
  }

  /** 8. 经理单月明细（P2） */
  export interface ManagerMonthDetailData {
    employee: {
      employeeId: number;
      employeeCode: string;
      name: string;
      positionName: string;
      orgName: string;
      orgType: string;
    };
    org: { id: number; orgName: string; shortName: string; orgType: string };
    month: string;
    jurisdiction: MonthCell;
    personal: MonthCell;
  }

  /** 9. 维度明细下钻（P3，2026-09-28） */
  export interface DimRecordField {
    k: string;
    label: string;
    w?: number;
  }

  export interface DimRecordsData {
    dim: string;
    title: string;
    scope: 'org' | 'personal';
    scopeLabel: string;
    year: number | null;
    month: string | null;
    sub: string | null;
    subLabel: string | null;
    /** 明细数据时间跨度（累计口径下含历史记录，供头部展示） */
    dateSpan: { from: string; to: string } | null;
    count: number;
    truncated: boolean;
    fields: DimRecordField[];
    records: Record<string, any>[];
  }
}

/** 1. 作业中心列表（环卫 / 市政园林 → 乡镇/公园清单） */
export function getLeaderCenters() {
  return requestClient.get<LeaderDashboardApi.CentersData>(`${BASE}/centers`);
}

/** 2. 作业中心 → 乡镇/公园汇总（year 缺省=历年累计） */
export function getLeaderTownsByCenter(centerId: number, year?: number) {
  return requestClient.get<LeaderDashboardApi.TownsData>(
    `${BASE}/centers/${centerId}/towns`,
    { params: { year } },
  );
}

/** 3. 乡镇 → 角色分组汇总（按年） */
export function getLeaderRolesByTown(townId: number, year: number) {
  return requestClient.get<LeaderDashboardApi.RolesData>(
    `${BASE}/towns/${townId}/roles`,
    { params: { year } },
  );
}

/** 4. 员工个人跨模块明细 */
export function getLeaderEmployeeDetail(employeeId: number, year?: number) {
  return requestClient.get<LeaderDashboardApi.EmployeeDetailData>(
    `${BASE}/employees/${employeeId}`,
    { params: { year } },
  );
}

/** 5. 乡镇/公园逐月趋势（P2，year 缺省=历年累计） */
export function getLeaderTownTrend(centerId: number, townId: number, year?: number) {
  return requestClient.get<LeaderDashboardApi.TrendData>(
    `${BASE}/centers/${centerId}/towns/${townId}/trend`,
    { params: { year } },
  );
}

/** 6. 乡镇/公园经理（管理员）列表（P2） */
export function getLeaderTownManagers(townId: number) {
  return requestClient.get<LeaderDashboardApi.TownManagersData>(
    `${BASE}/towns/${townId}/managers`,
  );
}

/** 7. 经理双口径累计（P2，year 缺省=历年累计；townId 必传限定辖区） */
export function getLeaderManagerOverview(
  employeeId: number,
  townId: number,
  year?: number,
) {
  return requestClient.get<LeaderDashboardApi.ManagerOverviewData>(
    `${BASE}/managers/${employeeId}/overview`,
    { params: { townId, year } },
  );
}

/** 8. 经理单月明细（P2，month=YYYY-MM） */
export function getLeaderManagerMonthDetail(
  employeeId: number,
  townId: number,
  month: string,
) {
  return requestClient.get<LeaderDashboardApi.ManagerMonthDetailData>(
    `${BASE}/managers/${employeeId}/month-detail`,
    { params: { townId, month } },
  );
}

/** 9. 维度明细下钻（P3）：scope=org 传 orgId / personal 传 employeeId；month=YYYY-MM 可选收窄；sub=子指标键可选二次过滤 */
export function getLeaderDimRecords(params: {
  scope: 'org' | 'personal';
  orgId?: number;
  employeeId?: number;
  dim: string;
  sub?: string;
  month?: string;
  year?: number;
}) {
  return requestClient.get<LeaderDashboardApi.DimRecordsData>(`${BASE}/dim-records`, {
    params,
  });
}
