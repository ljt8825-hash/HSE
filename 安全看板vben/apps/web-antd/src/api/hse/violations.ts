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
  }

  export interface ViolationStats {
    total: number;
    pending: number;
    processed: number;
    level1Month: number;
    level2Month: number;
    level3Month: number;
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

export function getViolationList(params?: ViolationApi.ViolationListParams) {
  return requestClient.get<{ list: ViolationApi.ViolationItem[]; total: number; page?: number; pageSize?: number }>(BASE, { params });
}

export function getViolationStats() {
  return requestClient.get<ViolationApi.ViolationStats>(`${BASE}/stats`);
}

export function getViolationDetail(id: number) {
  return requestClient.get<ViolationApi.ViolationItem>(`${BASE}/${id}`);
}

export function createViolation(data: Partial<ViolationApi.ViolationItem>) {
  return requestClient.post<ViolationApi.ViolationItem>(BASE, data);
}

export function updateViolation(id: number, data: Partial<ViolationApi.ViolationItem>) {
  return requestClient.put<ViolationApi.ViolationItem>(`${BASE}/${id}`, data);
}

export function deleteViolation(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}

export function batchDeleteViolations(ids: number[]) {
  return requestClient.delete(`${BASE}/batch`, { data: { ids } });
}

export function exportViolations() {
  return requestClient.get(`${BASE}/export/csv`, { responseType: 'blob' });
}

export function rectifyViolation(id: number, data: ViolationApi.RectifyRequest) {
  return requestClient.put<ViolationApi.ViolationItem>(`${BASE}/${id}/rectify`, data);
}

export function reviewViolation(id: number, data: ViolationApi.ReviewRequest) {
  return requestClient.put<ViolationApi.ViolationItem>(`${BASE}/${id}/review`, data);
}

export function getEmployeeViolationCount(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.EmployeeViolationCount[]>(`${BASE}/statistics/employee-count`, { params });
}

export function getHighRiskEmployees(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.HighRiskEmployee[]>(`${BASE}/statistics/high-risk`, { params });
}

export function getDepartmentRanking(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.DepartmentRanking[]>(`${BASE}/statistics/department-ranking`, { params });
}

export function getPositionRanking(params?: { startDate?: string; endDate?: string }) {
  return requestClient.get<ViolationApi.PositionRanking[]>(`${BASE}/statistics/position-ranking`, { params });
}

export function getViolationFilterOptions() {
  return requestClient.get<{ areaTeams: string[]; gridLevels: string[] }>(`${BASE}/filter-options`);
}