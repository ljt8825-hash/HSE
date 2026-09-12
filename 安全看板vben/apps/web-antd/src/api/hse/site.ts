import { requestClient } from '#/api/request';

export namespace SiteApi {
  export interface Violation {
    id: number;
    title: string;
    type: string;
    level: string;
    status: string;
    department: string;
    violator: string;
    area: string;
    discoverer: string;
    discoverDate: string;
    description: string;
    rectificationMeasure: string;
    deadline: string;
    rectifier: string;
    rectificationDate: string | null;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface FireEquipment {
    id: number;
    name: string;
    type: string;
    model: string;
    location: string;
    status: string;
    quantity: number;
    installDate: string | null;
    expiryDate: string | null;
    lastCheckDate: string | null;
    nextCheckDate: string | null;
    manager: string;
    phone: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface GridArea {
    id: number;
    gridCode: string;
    gridLevel: string;
    name: string;
    personnelId: number | null;
    position: string;
    area: string;
    township: string;
    patrolFrequency: string;
    phone: string;
    completionRate: number;
    riskLevel: string;
    remarks: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface ViolationListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    level?: string;
    status?: string;
    department?: string;
    area?: string;
  }

  export interface FireEquipmentListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    status?: string;
    location?: string;
  }

  export interface GridAreaListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    gridLevel?: string;
    township?: string;
    status?: string;
    /** 按检查记录年份筛选（阶段4 完成率按年/月计算时生效） */
    year?: string;
    /** 按检查记录月份筛选（1-12） */
    month?: string;
  }

  /** 网格管理动态筛选选项 */
  export interface GridAreaFilterOptions {
    /** 网格级别去重值 */
    gridLevels: string[];
    /** 所属乡镇去重值 */
    townships: string[];
    /** 状态去重值 */
    statuses: string[];
    /** 检查记录年份（来自 grid_inspection_records，阶段4 填充） */
    years: number[];
    /** 检查记录月份 1-12 */
    months: number[];
  }

  export interface SiteStats {
    totalViolations: number;
    pendingViolations: number;
    rectifiedViolations: number;
    seriousViolations: number;
    violationByType: Record<string, number>;
    totalFireEquipment: number;
    normalFireEquipment: number;
    abnormalFireEquipment: number;
    expiredFireEquipment: number;
    fireByType: Record<string, number>;
    totalGridAreas: number;
    onDutyGridPersonnel: number;
    avgCompletionRate: number;
  }

  // [DEPRECATED] 驾驶员管理（antd 版已被淘汰，功能已迁移至 web-naive）— 请勿维护 ============
  // ============ 驾驶员管理 ============
  export interface DriverAssessment {
    id: number;
    archiveNo: string;
    name: string;
    idCard: string;
    licenseType: string;
    department: string;
    vehicleNo: string;
    assessmentDate: string | null;
    assessmentResult: string;
    assessmentLevel: string;
    expiryDate: string | null;
    phone: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
    /** 前端派生状态：有效 / 已过期 / 待复检 */
    status?: string;
  }

  export interface DriverViolation {
    id: number;
    name: string;
    plateNo: string;
    violationTime: string | null;
    violationLocation: string;
    violationType: string;
    violationDesc: string;
    demeritPoints: number;
    fineAmount: number;
    handleStatus: string;
    handleMethod: string;
    handleResult: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface DriverMonthly {
    id: number;
    month: string;
    name: string;
    department: string;
    safetyScore: number;
    disciplineScore: number;
    trainingScore: number;
    totalScore: number;
    assessmentLevel: string;
    mainProblem: string;
    assessor: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface DriverAssessmentListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    department?: string;
    archiveYear?: string | number;
  }

  export interface DriverViolationListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    handleStatus?: string;
    violationType?: string;
  }

  export interface DriverMonthlyListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    department?: string;
    month?: string;
    assessmentLevel?: string;
  }
}

export async function getViolationList(params: SiteApi.ViolationListParams) {
  return requestClient.get<{ list: SiteApi.Violation[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/violations',
    { params },
  );
}

export async function getViolationDetail(id: number) {
  return requestClient.get<SiteApi.Violation>(`/site-mgmt/violations/${id}`);
}

export async function createViolation(data: Partial<SiteApi.Violation>) {
  return requestClient.post<SiteApi.Violation>('/site-mgmt/violations', data);
}

export async function updateViolation(id: number, data: Partial<SiteApi.Violation>) {
  return requestClient.put<SiteApi.Violation>(`/site-mgmt/violations/${id}`, data);
}

export async function deleteViolation(id: number) {
  return requestClient.delete(`/site-mgmt/violations/${id}`);
}

export async function getFireEquipmentList(params: SiteApi.FireEquipmentListParams) {
  return requestClient.get<{ list: SiteApi.FireEquipment[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/fire-equipment',
    { params },
  );
}

export async function getFireEquipmentDetail(id: number) {
  return requestClient.get<SiteApi.FireEquipment>(`/site-mgmt/fire-equipment/${id}`);
}

export async function createFireEquipment(data: Partial<SiteApi.FireEquipment>) {
  return requestClient.post<SiteApi.FireEquipment>('/site-mgmt/fire-equipment', data);
}

export async function updateFireEquipment(id: number, data: Partial<SiteApi.FireEquipment>) {
  return requestClient.put<SiteApi.FireEquipment>(`/site-mgmt/fire-equipment/${id}`, data);
}

export async function deleteFireEquipment(id: number) {
  return requestClient.delete(`/site-mgmt/fire-equipment/${id}`);
}

export async function getGridAreaList(params: SiteApi.GridAreaListParams) {
  return requestClient.get<{ list: SiteApi.GridArea[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/grid-areas',
    { params },
  );
}

export async function getGridAreaFilterOptions() {
  return requestClient.get<SiteApi.GridAreaFilterOptions>(
    '/site-mgmt/grid-areas/filter-options',
  );
}

export async function getGridAreaDetail(id: number) {
  return requestClient.get<SiteApi.GridArea>(`/site-mgmt/grid-areas/${id}`);
}

export async function createGridArea(data: Partial<SiteApi.GridArea>) {
  return requestClient.post<SiteApi.GridArea>('/site-mgmt/grid-areas', data);
}

export async function updateGridArea(id: number, data: Partial<SiteApi.GridArea>) {
  return requestClient.put<SiteApi.GridArea>(`/site-mgmt/grid-areas/${id}`, data);
}

export async function deleteGridArea(id: number) {
  return requestClient.delete(`/site-mgmt/grid-areas/${id}`);
}

export async function getSiteStats(params?: { year?: number; month?: number }) {
  return requestClient.get<SiteApi.SiteStats>('/site-mgmt/stats', { params });
}

// ============ 驾驶员管理 CRUD [DEPRECATED] antd 版已淘汰 ============
export async function getDriverAssessmentList(params: SiteApi.DriverAssessmentListParams) {
  return requestClient.get<{ list: SiteApi.DriverAssessment[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/driver-assessments',
    { params },
  );
}

export async function getDriverAssessmentDetail(id: number) {
  return requestClient.get<SiteApi.DriverAssessment>(`/site-mgmt/driver-assessments/${id}`);
}

export async function createDriverAssessment(data: Partial<SiteApi.DriverAssessment>) {
  return requestClient.post<SiteApi.DriverAssessment>('/site-mgmt/driver-assessments', data);
}

export async function updateDriverAssessment(id: number, data: Partial<SiteApi.DriverAssessment>) {
  return requestClient.put<SiteApi.DriverAssessment>(`/site-mgmt/driver-assessments/${id}`, data);
}

export async function deleteDriverAssessment(id: number) {
  return requestClient.delete(`/site-mgmt/driver-assessments/${id}`);
}

export async function getDriverViolationList(params: SiteApi.DriverViolationListParams) {
  return requestClient.get<{ list: SiteApi.DriverViolation[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/driver-violations',
    { params },
  );
}

export async function getDriverViolationDetail(id: number) {
  return requestClient.get<SiteApi.DriverViolation>(`/site-mgmt/driver-violations/${id}`);
}

export async function createDriverViolation(data: Partial<SiteApi.DriverViolation>) {
  return requestClient.post<SiteApi.DriverViolation>('/site-mgmt/driver-violations', data);
}

export async function updateDriverViolation(id: number, data: Partial<SiteApi.DriverViolation>) {
  return requestClient.put<SiteApi.DriverViolation>(`/site-mgmt/driver-violations/${id}`, data);
}

export async function deleteDriverViolation(id: number) {
  return requestClient.delete(`/site-mgmt/driver-violations/${id}`);
}

export async function getDriverMonthlyList(params: SiteApi.DriverMonthlyListParams) {
  return requestClient.get<{ list: SiteApi.DriverMonthly[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/driver-monthly',
    { params },
  );
}

export async function getDriverMonthlyDetail(id: number) {
  return requestClient.get<SiteApi.DriverMonthly>(`/site-mgmt/driver-monthly/${id}`);
}

export async function createDriverMonthly(data: Partial<SiteApi.DriverMonthly>) {
  return requestClient.post<SiteApi.DriverMonthly>('/site-mgmt/driver-monthly', data);
}

export async function updateDriverMonthly(id: number, data: Partial<SiteApi.DriverMonthly>) {
  return requestClient.put<SiteApi.DriverMonthly>(`/site-mgmt/driver-monthly/${id}`, data);
}

export async function deleteDriverMonthly(id: number) {
  return requestClient.delete(`/site-mgmt/driver-monthly/${id}`);
}
