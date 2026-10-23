/**
 * HSE 三违管理考核 台账 API 适配层（web-naive）
 * 契约来源：server/routes/hse-violation-assessment.js（唯一契约来源，逐项保持 URL / 方法 / 参数键名 / 响应结构）。
 * 覆盖：考核对象名单 + 三固定列（网格长巡查考核/三违巡查/三违信息填报）聚合查询；自定义动态列读写。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/violation-assessment';

export namespace ViolationAssessmentApi {
  /** 单行：考核对象 + 三固定列扣分（只读，取自 hse_assessment_deduction 已落库生效值） */
  export interface ListRow {
    targetId: number;
    employeeId: number;
    name: string;
    position: string; // 乡镇作业中心经理 | 管理员
    township: string;
    department: string;
    gridDeduct: number; // 网格长巡查考核
    violationDeduct: number; // 三违巡查
    unrectifiedDeduct: number; // 三违信息填报
    rectifiedDeduct: number; // 未按时整改（真三违未整改条数，每起 1 分，自动）
    driverDeduct: number; // 驾驶员三违（driver_monthly 当月考核分合计）
    /** 公司查处扣分（公司管理总+一级网格长当月查处该乡镇三违；与「三违分析」同口径） */
    companyDeduct: {
      score: number;
      helmetCount: number;
      otherCount: number;
      details: { date: string; violatorName: string; behavior: string; score: number; recordId?: string | number }[];
    };
  }

  export interface ListResult {
    cycleId: number;
    position: string;
    total: number;
    rows: ListRow[];
    kinds: Record<string, string>;
  }

  /** 列池列：预置 auto（自动扣分列，值来自 list）+ manual（人工列，值来自 cells） */
  export interface CustomColumn {
    key: string;
    title: string;
    kind: 'auto' | 'manual';
    /** false 表示隐藏（「删除列」），可经「增加列」恢复 */
    shown: boolean;
  }

  export interface ConfigResult {
    cycleId: number;
    position: string;
    columns: CustomColumn[];
    /** cells[employeeId][colKey] = number（仅 manual 列使用） */
    cells: Record<string, Record<string, number>>;
  }

  /** 单条扣分明细（点击扣分数字弹出用） */
  export interface DeductionDetail {
    deductionId: number;
    /** 扣分日期（YYYY-MM-DD，可能为空） */
    date: string | null;
    /** 扣分原因（deduction_item 文案） */
    item: string;
    /** 生效分值 */
    score: number;
    sourceTable: string | null;
    sourceId: string | null;
    remark: string;
    /** source_detail 解析对象（含 violationDate/violationBehavior/specialItem/checkSourceText 等附加信息） */
    detail: Record<string, any> | null;
    /** 网格长巡查台账原始记录 id（仅「未按时整改」自动拉取明细带，供点击跳转定位） */
    recordId?: string | number;
  }
}

/** 查询考核周期 + 岗位下对象名单与三列扣分 */
export async function getViolationAssessmentList(params: {
  cycleId: number;
  position: string;
}) {
  return requestClient.get<ViolationAssessmentApi.ListResult>(`${BASE}/list`, { params });
}

/** 查询某考核对象在周期内指定 kind 的扣分明细（点击扣分数字后弹出） */
export async function getViolationAssessmentDeductions(params: {
  cycleId: number;
  targetId: number;
  kinds: string[];
}) {
  return requestClient.get<{ list: ViolationAssessmentApi.DeductionDetail[] }>(`${BASE}/deductions`, {
    params: { ...params, kinds: params.kinds.join(',') },
  });
}

/** 「未按时整改」列明细：某考核对象所在乡镇当月的真三违未整改记录（点击扣分数字后弹出） */
export async function getUnrectifiedDeductions(params: { cycleId: number; targetId: number }) {
  return requestClient.get<{ list: ViolationAssessmentApi.DeductionDetail[] }>(`${BASE}/unrectified-detail`, {
    params,
  });
}

/** 单条驾驶员月度考核分（「驾驶员三违」列明细，点击行可跳转驾驶员月度考核页定位） */
export interface DriverDeductDetail {
  driverId: number;
  name: string;
  department: string;
  score: number;
  month: string;
}

/** 「驾驶员三违」列明细：某考核对象所在乡镇 + 周期月份的驾驶员月度考核分逐人列出 */
export async function getDriverDeductions(params: { cycleId: number; targetId: number }) {
  return requestClient.get<{ list: DriverDeductDetail[] }>(`${BASE}/driver-detail`, { params });
}

/** 读取自定义动态列配置 */
export async function getViolationAssessmentConfig(params: {
  cycleId: number;
  position: string;
}) {
  return requestClient.get<ViolationAssessmentApi.ConfigResult>(`${BASE}/config`, { params });
}

/** 保存自定义动态列（列定义 + 单元格数值） */
export async function saveViolationAssessmentConfig(payload: {
  cycleId: number;
  position: string;
  columns: ViolationAssessmentApi.CustomColumn[];
  cells: Record<string, Record<string, number>>;
}) {
  return requestClient.put<{ saved: boolean }>(`${BASE}/config`, payload);
}