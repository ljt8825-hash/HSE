/**
 * HSE 三违管理 API 适配层（web-naive · 阶段06B-1）
 *
 * 契约来源：apps/web-antd/src/api/hse/violations.ts（唯一契约来源）。
 * 保持既有 URL、HTTP 方法、请求参数与响应结构，不改服务端。
 * requestClient baseURL = /api（VITE_GLOB_API_URL），完整路径 /api/violations/...
 */
import { requestClient } from '#/api/request';

const BASE = '/violations';

export namespace ViolationApi {
  export interface ViolationItem {
    id: number;
    no?: string;
    violationType: string;
    violationLevel: string;
    riskLevel?: string;
    description: string;
    location?: string;
    violationDate: string;
    occurTime?: string;
    violatorName?: string;
    violatorId?: number;
    violatorIdCard?: string;
    inspectorName?: string;
    inspectorId?: number;
    handlerName?: string;
    handlerId?: number;
    punisherName?: string;
    punisherId?: number;
    punishmentType?: string;
    punishmentAmount?: number;
    rectification?: string;
    rectificationTime?: string;
    reviewResult?: string;
    reviewTime?: string;
    needRetraining?: boolean;
    trainingPlanId?: number;
    status: string;
    remark?: string;
    areaTeam?: string;
    uploadTime?: string;
    gridLevel?: string;
    position?: string;
    violatorGender?: string;
    violatorAge?: number;
    vehicleTypeOrCleaner?: string;
    reportStatus?: string;
    imageContent?: string;
    violationBehavior?: string;
    violationTypeResult?: string;
    nickname?: string;
    mark?: string;
    isSupplementary?: string;
    needRectification?: string;
    rectificationExecutor?: string;
    rectificationPhotos?: string;
    schematicDiagram?: string;
    createdAt?: string;
    updatedAt?: string;
    /**
     * 阶段2a 新增：查处来源。
     * 字典：company=公司查处（阶段3 计 5 分/次）/ township=乡镇查处 / self=自查自纠；
     * null=未标注（历史数据默认）。
     */
    checkSource?: CheckSource | null;
    /**
     * E-08-01 新增：记录来源（正式字段 source_type）。
     * 'grid_candidate'=网格候选确认；null=历史正式三违。禁止弱字段猜测。
     */
    sourceType?: 'grid_candidate' | null;
    /** E-08-01：原始巡查记录回指（grid_inspection_records.id） */
    sourceRecordId?: number | null;
    /** E-08-01：候选回指（grid_violation_candidates.id，一对一） */
    candidateId?: number | null;
    /** E-08-01：人工确认人（users.id） */
    confirmedBy?: number | null;
    confirmedAt?: string | null;
    /** E-08-01：是否已软删（撤销） */
    isDeleted?: boolean;
    /** E-08-01：关联扣分条数（deduction，未软删） */
    deductionCount?: number | null;
    /** E-08-02：扣分状态（服务端派生，七态） */
    deductionStatus?: DeductionStatus | null;
    /** E-08-02：扣分合计分值（COALESCE(confirmed, suggested) 之和，未软删） */
    deductionTotalScore?: number | null;
  }

  /** E-08-02：扣分状态（服务端由真实字段/结构化外键派生，非 DB 字段） */
  export type DeductionStatus =
    | 'deducted'
    | 'pending_deduct'
    | 'no_deduct'
    | 'unresolved'
    | 'pending_review'
    | 'revoked'
    | 'history';

  /** E-08-02：扣分状态标签 */
  export const DEDUCTION_STATUS_TEXT: Record<DeductionStatus, string> = {
    deducted: '已扣分',
    pending_deduct: '应扣未扣',
    no_deduct: '不扣分',
    unresolved: '身份未解析',
    pending_review: '待核验',
    revoked: '已撤销',
    history: '历史正式记录',
  };

  /** E-08-02：详情/证据链返回的扣分状态解释 */
  export interface DeductionStatusInfo {
    status: DeductionStatus;
    label: string;
    explanation: string;
    ruleActive?: boolean;
    ruleScore?: number | null;
    deductions?: Array<{
      id: number;
      metricCode?: string;
      deductionItem?: string;
      deductionSource?: string;
      confirmedScore?: string | number | null;
      suggestedScore?: string | number | null;
      targetEmployeeName?: string | null;
      cycleName?: string | null;
      isDeleted?: boolean;
      createdAt?: string;
    }>;
  }

  /** 查处来源字典值 */
  export type CheckSource = 'company' | 'township' | 'self';

  /** 查处来源下拉项 */
  export interface CheckSourceOption {
    value: CheckSource;
    label: string;
  }

  export interface ViolationListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    violationType?: string;
    areaTeam?: string;
    gridLevel?: string;
    startDate?: string;
    endDate?: string;
    /** 阶段2a 新增：按查处来源筛选（company / township / self） */
    checkSource?: CheckSource;
    /**
     * E-08-01 新增：按记录来源筛选（白名单两态，基于正式字段 source_type）。
     * 'grid_candidate'=网格候选确认；'history'=历史正式（source_type IS NULL）。
     */
    sourceType?: 'grid_candidate' | 'history';
    /** E-08-01：'1'=包含已撤销/软删记录（默认仅未删除） */
    includeDeleted?: string;
    /** E-08-02：按扣分状态筛选（白名单七态，服务端派生） */
    deductionStatus?: DeductionStatus;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  export interface ViolationStats {
    total: number;
    pending: number;
    processed: number;
    level1Month: number;
    level2Month: number;
    level3Month: number;
  }

  export interface ViolationFilterOptions {
    areaTeams: string[];
    gridLevels: string[];
    /** 阶段2a 新增：查处来源为固定字典（非从数据派生），可选字段以兼容旧后端 */
    checkSources?: CheckSourceOption[];
  }

  export interface EmployeeViolationCount {
    employeeId?: number;
    employeeName?: string;
    violationCount: number;
  }

  export interface HighRiskEmployee {
    employeeId?: number;
    employeeName?: string;
    highRiskCount: number;
  }

  export interface DepartmentRanking {
    department: string;
    violationCount: number;
  }

  export interface PositionRanking {
    position: string;
    violationCount: number;
  }

  export interface RectifyRequest {
    rectification: string;
    handlerName?: string;
    handlerId?: number;
  }

  export interface ReviewRequest {
    reviewResult: string;
    remark?: string;
  }
}

/** 服务端列表（分页） */
export function getViolationList(params?: ViolationApi.ViolationListParams) {
  return requestClient.get<{ list: ViolationApi.ViolationItem[]; total: number; page?: number; pageSize?: number }>(
    BASE,
    { params },
  );
}

/** 统计（违章总数 / 网格长本月） */
export function getViolationStats() {
  return requestClient.get<ViolationApi.ViolationStats>(`${BASE}/stats`);
}

/** 详情 */
export function getViolationDetail(id: number) {
  return requestClient.get<ViolationApi.ViolationItem>(`${BASE}/${id}`);
}

/** E-08-01：证据链（vr→candidate→gir→deduction→audit，全部结构化外键追溯） */
export interface ViolationEvidenceChain {
  violation: ViolationApi.ViolationItem;
  candidate?: {
    id: number;
    gridRecordId: number;
    behaviorId: number;
    behaviorText: string;
    rawViolationBehavior: string;
    candidateType: string;
    candidateReason?: string;
    inspectionSource: string;
    candidateStatus: string;
    suggestedScore?: string | number;
    confirmedViolationId?: number | null;
    confirmedBy?: number | null;
    confirmedAt?: string | null;
    revokedAt?: string | null;
    revokeReason?: string | null;
    createdAt?: string;
    behaviorCode?: string;
    dictBehaviorName?: string;
  } | null;
  gridRecord?: {
    id: number;
    serialNo?: string;
    inspectionDate?: string;
    violatorName?: string;
    personnelName?: string;
    areaTeam?: string;
    gridLevel?: string;
    position?: string;
    imageContent?: string;
    violationBehavior?: string;
    inspectorEmployeeId?: number | null;
  } | null;
  deductions?: Record<string, unknown>[];
  /** E-08-02：扣分状态解释（状态/文案/deduction 明细含软删） */
  deductionStatusInfo?: ViolationApi.DeductionStatusInfo;
  audits?: Record<string, unknown>[];
}
export function getViolationEvidenceChain(id: number) {
  return requestClient.get<ViolationEvidenceChain>(`${BASE}/${id}/evidence-chain`);
}

/** 创建 */
export function createViolation(data: Partial<ViolationApi.ViolationItem>) {
  return requestClient.post<ViolationApi.ViolationItem>(BASE, data);
}

/** 编辑 */
export function updateViolation(id: number, data: Partial<ViolationApi.ViolationItem>) {
  return requestClient.put<ViolationApi.ViolationItem>(`${BASE}/${id}`, data);
}

/** 删除 */
export function deleteViolation(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}

/** 批量删除 */
export function batchDeleteViolations(ids: number[]) {
  return requestClient.delete(`${BASE}/batch`, { data: { ids } });
}

/** 导出 CSV（Blob） */
export function exportViolations() {
  return requestClient.get(`${BASE}/export/csv`, { responseType: 'blob' });
}

/** 整改 */
export function rectifyViolation(id: number, data: ViolationApi.RectifyRequest) {
  return requestClient.put<ViolationApi.ViolationItem>(`${BASE}/${id}/rectify`, data);
}

/** 复查 */
export function reviewViolation(id: number, data: ViolationApi.ReviewRequest) {
  return requestClient.put<ViolationApi.ViolationItem>(`${BASE}/${id}/review`, data);
}

/** 筛选选项（分组名称 / 网格等级） */
export function getViolationFilterOptions() {
  return requestClient.get<ViolationApi.ViolationFilterOptions>(`${BASE}/filter-options`);
}

// ===================== 统计分析（旧版既有接口，统计分析弹窗 4 页签数据源） =====================

/** 员工三违次数（可带日期范围） */
export function getEmployeeViolationCount(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.EmployeeViolationCount[]>(`${BASE}/statistics/employee-count`, { params });
}

/** 高风险人员（可带日期范围） */
export function getHighRiskEmployees(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.HighRiskEmployee[]>(`${BASE}/statistics/high-risk`, { params });
}

/** 部门排行（可带日期范围） */
export function getDepartmentRanking(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.DepartmentRanking[]>(`${BASE}/statistics/department-ranking`, { params });
}

/** 岗位排行（可带日期范围） */
export function getPositionRanking(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.PositionRanking[]>(`${BASE}/statistics/position-ranking`, { params });
}
