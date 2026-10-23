/**
 * HSE 现场管理 API 适配层（web-naive · 阶段06B-1）
 *
 * 契约来源：apps/web-antd/src/api/hse/site.ts（唯一契约来源）。
 * 保持既有 URL、HTTP 方法、请求参数与响应结构，不改服务端。
 * 覆盖：消防设施（fire-equipment）、网格区域（grid-areas）、动态筛选项、站点统计 及本批页面实际使用的 CRUD 方法。
 * 注：旧版 site.ts 另含 /site-mgmt/violations 系列（SiteApi.Violation），本批三个页面均不使用（三违页面走 /violations 契约），
 *     为保持契约来源完整性，此处保留类型但不导出站点违章方法；如需使用请以旧版文件为基准补全。
 */
import { requestClient } from '#/api/request';

export namespace SiteApi {
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
    /** 月巡查次数（当前/所选月，台账按姓名计数） */
    monthPatrolCount: number;
    /** 年巡查次数（当前/所选年） */
    yearPatrolCount: number;
    riskLevel: string;
    remarks: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface FireEquipmentListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    status?: string;
    location?: string;
    year?: string;
    month?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
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
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 网格管理动态筛选选项 */
  export interface GridAreaFilterOptions {
    gridLevels: string[];
    townships: string[];
    statuses: string[];
    years: number[];
    months: number[];
    /** 单月度下拉（YYYY-MM）：按巡查日期聚合，最新在前 */
    monthOptions?: string[];
  }

  /** 网格长巡查台账（grid_inspection_records）行 */
  export interface GridInspectionRecord {
    id: string | number; // number(PG) | string(WPS Record ID)
    areaTeam: string;
    uploadTime: string;
    inspectionDate: string | null;
    personnelName: string;
    gridLevel: string;
    position: string;
    violatorName: string;
    violatorGender: string;
    violatorAge: string;
    /** 违章人所属部门：已确认部门名；unmatched/unselected 场景为 ''（后端归属解析后返回） */
    violatorDept?: string;
    /** 违章人所属部门归属状态：matched=自动归属 / manual=人工确认落库(可选，选错可改) / unmatched=未匹配 / unselected=待人工选择（公司级重名） */
    violatorDeptStatus?: 'matched' | 'manual' | 'unmatched' | 'unselected';
    vehicleType: string;
    reportStatus: string;
    imageContent: string;
    violationBehavior: string;
    violationTypeResult: string;
    needRectification: string;
    rectifier: string;
    rectifiedPhoto: string;
    schematic: string;
    gridId: number | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 网格长巡查台账筛选参数（服务端分页：每页 pageSize，默认 20） */
  export interface GridInspectionListParams {
    keyword?: string;
    areaTeam?: string;
    gridLevel?: string;
    reportStatus?: string;
    /** 按巡查日期所属月（YYYY-MM）筛选明细 */
    month?: string;
    /** 仅含真实三违行为（排除「无三违行为」），供三违台账使用 */
    hasViolation?: boolean;
    /** 仅含整改后照片有内容的记录（排除占位符），供三违台账使用 */
    hasRectifiedPhoto?: boolean;
    /** 违章人所属部门筛选：具体部门名 / 'unmatched'(未匹配) / 'unselected'(未选择) */
    attDept?: string;
    /** 单条定位：按台账记录主键过滤（配合「点击扣分明细 → 定位网格台账原始记录」用） */
    recordId?: string | number;
    page?: number;
    pageSize?: number;
    /** 服务端排序字段（白名单列）；默认不传按巡查日期倒序 */
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  /** 网格长巡查台账筛选选项 */
  export interface GridInspectionFilterOptions {
    areaTeams: string[];
    gridLevels: string[];
    reportStatuses: string[];
    /** 月份选项（YYYY-MM）：按巡查日期聚合，最新在前 */
    months?: string[];
    /** 「违章人所属部门」具体部门选项（来自花名册 dept 口径） */
    attDepartments?: string[];
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
    assessmentType: string;
    controlMeasures: string;
    status: string;
    expiryDate: string | null;
    phone: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface DriverViolation {
    id: number;
    seq: number | null;
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
    /** 花名册人员 ID：用于「生成固定人员」后按人员自动更新姓名；手工新增为空 */
    personnelId?: number | null;
    /** 考核列（数值计数，2026-09 新增） */
    threeCheckManagement?: number;
    lampDirty?: number;
    lampFailure?: number;
    safetyMonitor?: number;
    fireManagement?: number;
    remark: string;
    createdAt: string;
    updatedAt: string;
    // 以下为旧评分字段：界面已移除，仅用于兼容历史数据
    safetyScore?: number;
    disciplineScore?: number;
    trainingScore?: number;
    totalScore?: number;
    assessmentLevel?: string;
    mainProblem?: string;
    assessor?: string;
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

// ===================== 消防设施 =====================

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

// ===================== 驾驶员管理（评估档案 / 违章记录 / 月度考核） =====================
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

/** 交通安全评估档案重新编号（按在册驾驶员姓名稳定排序，驾驶证 DA / 三违 SW 同人同号） */
export async function renumberDriverAssessments() {
  return requestClient.post<{ total: number; seqCount: number }>(
    '/site-mgmt/driver-assessments/renumber',
    {},
  );
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

// ===================== 三违扣分记录 =====================
// 数据源：独立表 driver_three_violation（与驾驶证违章字段结构一致，数据完全隔离）
// 复用 DriverViolation / DriverViolationListParams 类型
export async function getDriverThreeViolationList(params: SiteApi.DriverViolationListParams) {
  return requestClient.get<{ list: SiteApi.DriverViolation[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/driver-three-violations',
    { params },
  );
}

export async function getDriverThreeViolationDetail(id: number) {
  return requestClient.get<SiteApi.DriverViolation>(`/site-mgmt/driver-three-violations/${id}`);
}

export async function createDriverThreeViolation(data: Partial<SiteApi.DriverViolation>) {
  return requestClient.post<SiteApi.DriverViolation>('/site-mgmt/driver-three-violations', data);
}

export async function updateDriverThreeViolation(id: number, data: Partial<SiteApi.DriverViolation>) {
  return requestClient.put<SiteApi.DriverViolation>(`/site-mgmt/driver-three-violations/${id}`, data);
}

export async function deleteDriverThreeViolation(id: number) {
  return requestClient.delete(`/site-mgmt/driver-three-violations/${id}`);
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

// ===================== 网格区域 =====================

export async function getGridAreaList(params: SiteApi.GridAreaListParams) {
  return requestClient.get<{ list: SiteApi.GridArea[]; total: number; page: number; pageSize: number }>(
    '/site-mgmt/grid-areas',
    { params },
  );
}

export async function getGridAreaFilterOptions() {
  return requestClient.get<SiteApi.GridAreaFilterOptions>('/site-mgmt/grid-areas/filter-options');
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

// ===================== 网格长巡查台账 =====================

export async function getGridInspectionList(params: SiteApi.GridInspectionListParams) {
  return requestClient.get<{
    list: SiteApi.GridInspectionRecord[];
    total: number;
    truncated: boolean;
  }>('/site-mgmt/grid-records', { params });
}

export async function getGridInspectionFilterOptions() {
  return requestClient.get<SiteApi.GridInspectionFilterOptions>('/site-mgmt/grid-records/filter-options');
}

/** 台账单元格编辑保存：仅提交变化的 DB snake_case 字段
 * 记录 id 支持 number（PG）与 string（WPS Record ID，Sprint-WPS-02-A 阻断项7整改）
 */
export async function updateGridInspectionRecord(
  id: string | number,
  data: Partial<Record<string, string | number | null>>,
) {
  return requestClient.put<SiteApi.GridInspectionRecord>(`/site-mgmt/grid-records/${id}`, data);
}

/** 新增台账记录（工具条「+新增」） */
export async function createGridInspectionRecord(data: Partial<SiteApi.GridInspectionRecord>) {
  return requestClient.post<SiteApi.GridInspectionRecord>('/site-mgmt/grid-records', data);
}

/** 批量删除台账记录（工具条「批量删除」；id 支持 number(PG)/string(WPS)） */
export async function deleteGridInspectionRecords(ids: Array<string | number>) {
  return requestClient.delete<{ deleted: number }>('/site-mgmt/grid-records', { data: { ids } });
}

/** 清空全部台账记录（调试用，不可恢复） */
export async function clearGridInspectionRecords() {
  return requestClient.delete<{ deleted: number }>('/site-mgmt/grid-records/all');
}

// ===================== 站点统计 =====================

export async function getSiteStats(params?: { year?: number; month?: number }) {
  return requestClient.get<SiteApi.SiteStats>('/site-mgmt/stats', { params });
}
