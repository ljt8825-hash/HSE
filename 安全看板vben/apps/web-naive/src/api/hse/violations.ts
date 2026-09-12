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
