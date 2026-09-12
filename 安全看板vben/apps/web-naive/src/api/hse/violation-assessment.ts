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
    driverDeduct: number; // 驾驶员三违（driver_monthly 当月考核分合计）
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
}

/** 查询考核周期 + 岗位下对象名单与三列扣分 */
export async function getViolationAssessmentList(params: {
  cycleId: number;
  position: string;
}) {
  return requestClient.get<ViolationAssessmentApi.ListResult>(`${BASE}/list`, { params });
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