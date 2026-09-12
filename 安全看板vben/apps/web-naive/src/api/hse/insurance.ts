/**
 * 保险管理 API（web-naive）
 *
 * 对应后端路由: server/routes/insurance.js
 * 路由前缀: /insurance
 * requestClient baseURL = /api，完整请求路径为 /api/insurance/...
 *
 * 三个子模块：
 *   - personnel  人员保险（雇主责任险 / 工伤保险）
 *   - vehicle    车辆保险
 *   - other      其他保险（公众责任险 / 财产一切险）
 *
 * 导入网关模块名：insurance-personnel / insurance-vehicle / insurance-other
 * （通过 #/views/hse/_shared/useGenericImport 接入通用导入）
 */
import { requestClient } from '#/api/request';

export namespace InsuranceApi {
  // ==================== 人员保险 ====================

  /** 人员保险类型 */
  export type PersonnelInsuranceType = '雇主责任险' | '工伤保险';

  /** 人员合规状态 */
  export type ComplianceStatus = 'compliant' | 'noncompliant' | 'unknown' | string;

  /** 参保状态 */
  export type InsuranceStatus = 'insured' | 'expiring' | 'expired' | 'uninsured';

  /** 单个险种信息（透视行内嵌） */
  export interface InsTypeInfo {
    id: number | null;
    recordExists: boolean;
    hasInsurance: boolean;
    isCurrent: boolean;
    policyNo: string;
    startDate: string | null;
    expireDate: string | null;
    premium: number;
    coverage: number;
    status: InsuranceStatus;
  }

  /** 人员保险列表项（透视行：一行一人，含雇主险/工伤险两个子对象） */
  export interface PersonnelItemPivoted {
    rowKey: string;
    employeeId: number | null;
    personName: string;
    idCard: string;
    phone?: string;
    department: string;
    position: string;
    workType: string;
    /** 入职日期（花名册当前主岗位 start_date，YYYY-MM-DD） */
    entryDate?: string | null;
    personnelId: number | null;
    employer: InsTypeInfo;
    injury: InsTypeInfo;
    complianceStatus?: ComplianceStatus;
    syncStatus?: 'synced' | 'unsynced' | 'missing';
  }

  /** 人员保险列表查询参数 */
  export interface PersonnelListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    department?: string;
    insuranceStatus?: string;
    complianceStatus?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 人员保险新增/编辑表单 */
  export interface PersonnelFormData {
    employeeId?: number;
    insuranceType: string;
    coverageAmount?: number;
    premium?: number;
    startDate?: string | null;
    expireDate?: string | null;
    isCurrent?: boolean;
    policyNo?: string;
    remark?: string;
  }

  /** 人员保险统计 */
  export interface PersonnelStats {
    total: number;
    active: number;
    expiring30d: number;
    expired: number;
    highRisk?: number;
    noncompliant?: number;
    byType?: Record<string, number>;
    byDepartment?: Record<string, number>;
  }

  // ==================== 车辆保险 ====================

  /** 车辆保险时效状态 */
  export type VehicleExpiryStatus = 'normal' | 'expiring' | 'expired' | 'unknown';

  /** 车辆保险列表项 */
  export interface VehicleItem {
    id: number;
    plate: string;
    vin?: string;
    engine_no?: string;
    reg_date?: string;
    model?: string;
    vehicle_type?: string;
    policy_holder?: string;
    registered_owner?: string;
    compulsory_start?: string | null;
    compulsory_end?: string | null;
    commercial_start?: string | null;
    commercial_end?: string | null;
    vehicle_damage_amount?: number;
    vehicle_damage_premium?: number;
    third_party_amount?: string;
    third_party_premium?: number;
    passenger_amount?: string;
    passenger_premium?: number;
    commercial_total?: number;
    compulsory_premium?: number;
    vehicle_tax?: number;
    total_premium?: number;
    status?: string;
    expiryStatus?: VehicleExpiryStatus;
    remark?: string;
  }

  /** 车辆保险列表查询参数 */
  export interface VehicleListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    insuranceStatus?: string;
    vehicleType?: string;
    model?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 车辆保险表单 */
  export interface VehicleFormData {
    plate: string;
    vin?: string;
    engine_no?: string;
    reg_date?: string | null;
    model?: string;
    vehicle_type?: string;
    policy_holder?: string;
    registered_owner?: string;
    compulsory_start?: string | null;
    compulsory_end?: string | null;
    commercial_start?: string | null;
    commercial_end?: string | null;
    vehicle_damage_amount?: number;
    vehicle_damage_premium?: number;
    third_party_amount?: string;
    third_party_premium?: number;
    passenger_amount?: string;
    passenger_premium?: number;
    commercial_total?: number;
    compulsory_premium?: number;
    vehicle_tax?: number;
    total_premium?: number;
    status?: string;
    remark?: string;
  }

  /** 车辆保险统计（后端可能返回扁平结构或嵌套在 stats 中） */
  export interface VehicleStats {
    stats?: {
      total: number;
      active: number;
      expired: number;
      expiring: number;
      totalPremium: number;
    };
    vehicle_types?: string[];
    total?: number;
    active?: number;
    expired?: number;
    expiring?: number;
    totalPremium?: number;
  }

  // ==================== 其他保险 ====================

  /** 其他保险类型 */
  export type OtherInsuranceType = '公众责任险' | '财产一切险';

  /** 其他保险时效状态 */
  export type OtherExpiryStatus = 'normal' | 'expiring' | 'expired' | 'unknown';

  /** 其他保险列表项 */
  export interface OtherInsuranceItem {
    id: number;
    insuranceType: OtherInsuranceType | string;
    policyNo?: string;
    coverageAmount?: number;
    premium?: number;
    startDate?: string | null;
    expireDate?: string | null;
    insuranceCompany?: string;
    contactPerson?: string;
    contactPhone?: string;
    status?: string;
    expiryStatus?: OtherExpiryStatus;
    pdfFile?: string;
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  /** 其他保险列表查询参数 */
  export interface OtherListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    insuranceType?: string;
    expiryStatus?: string;
    /** 排序字段 */
    sortField?: string;
    /** 排序方向（asc/desc） */
    sortOrder?: 'asc' | 'desc';
  }

  /** 其他保险表单 */
  export interface OtherFormData {
    insuranceType: string;
    policyNo?: string;
    coverageAmount?: number;
    premium?: number;
    startDate?: string | null;
    expireDate?: string | null;
    insuranceCompany?: string;
    contactPerson?: string;
    contactPhone?: string;
    status?: string;
    pdfFile?: string;
    remark?: string;
  }

  /** 其他保险统计 */
  export interface OtherStats {
    total: number;
    normal: number;
    expiring: number;
    expired: number;
    stats?: {
      total: number;
      normal: number;
      expiring: number;
      expired: number;
    };
  }

  // ==================== 通用附件/版本（预留） ====================

  /** 保险附件 */
  export interface InsuranceAttachment {
    id: number;
    bizType: 'vehicle' | 'personnel' | 'other';
    bizId: number;
    filename: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    version: string;
    uploadedBy?: string;
    isLatest: boolean;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
  }

  /** 保险版本履历 */
  export interface InsuranceVersionRecord {
    id: number;
    bizType: 'vehicle' | 'personnel' | 'other';
    bizId: number;
    version: string;
    changeType: 'create' | 'update' | 'import' | 'revise' | 'delete';
    changeSummary?: string;
    changedBy?: string;
    createdAt: string;
  }
}

// ==================== 人员保险 API ====================

/** 人员保险列表（分页） */
export async function getPersonnelList(
  params: InsuranceApi.PersonnelListParams,
) {
  return requestClient.get<{
    list: InsuranceApi.PersonnelItemPivoted[];
    total: number;
  }>('/insurance/personnel', { params });
}

/** 人员保险详情 */
export async function getPersonnelDetail(id: number) {
  return requestClient.get<InsuranceApi.PersonnelItemPivoted>(
    `/insurance/personnel/${id}`,
  );
}

/** 新增人员保险 */
export async function createPersonnel(data: InsuranceApi.PersonnelFormData) {
  return requestClient.post('/insurance/personnel', data);
}

/** 更新人员保险 */
export async function updatePersonnel(
  id: number,
  data: Partial<InsuranceApi.PersonnelFormData>,
) {
  return requestClient.put(`/insurance/personnel/${id}`, data);
}

/** 删除人员保险记录 */
export async function deletePersonnel(id: number) {
  return requestClient.delete(`/insurance/personnel/${id}`);
}

/** 人员保险统计 */
export async function getPersonnelStats() {
  const res = await requestClient.get<any>('/insurance/personnel/stats');
  // 后端可能返回 { stats: {...}, byType, byDepartment } 或扁平结构
  if (res?.stats) {
    return {
      total: res.stats.total || 0,
      active: res.stats.covered || res.stats.active || 0,
      expiring30d: res.stats.expiring30d || 0,
      expired: res.stats.expired || 0,
      highRisk: res.stats.highRisk || 0,
      noncompliant: res.stats.noncompliant || 0,
      byType: res.byType || {},
      byDepartment: res.byDepartment || {},
    } as InsuranceApi.PersonnelStats;
  }
  return res as InsuranceApi.PersonnelStats;
}

/** 人员保险部门列表（动态筛选） */
export async function getPersonnelDepartments() {
  return requestClient.get<{ departments: string[] }>(
    '/insurance/personnel/departments',
  );
}

/** 导出人员保险（CSV） */
export async function exportPersonnelInsurance() {
  return requestClient.download('/insurance/personnel/export');
}

// ==================== 车辆保险 API ====================

/** 车辆保险列表（分页） */
export async function getVehicleList(params: InsuranceApi.VehicleListParams) {
  return requestClient.get<{ list: any[]; total: number }>('/insurance/vehicle', {
    params,
  });
}

/** 车辆保险详情 */
export async function getVehicleDetail(id: number) {
  return requestClient.get<any>(`/insurance/vehicle/${id}`);
}

/** 新增车辆保险 */
export async function createVehicle(data: InsuranceApi.VehicleFormData) {
  return requestClient.post('/insurance/vehicle', data);
}

/** 更新车辆保险 */
export async function updateVehicle(
  id: number,
  data: Partial<InsuranceApi.VehicleFormData>,
) {
  return requestClient.put(`/insurance/vehicle/${id}`, data);
}

/** 删除车辆保险 */
export async function deleteVehicle(id: number) {
  return requestClient.delete(`/insurance/vehicle/${id}`);
}

/** 车辆保险统计 */
export async function getVehicleStats() {
  return requestClient.get<InsuranceApi.VehicleStats>('/insurance/vehicle/stats');
}

/** 导出车辆保险（CSV） */
export async function exportVehicleInsurance() {
  return requestClient.download('/insurance/vehicle/export');
}

// ==================== 其他保险 API ====================

/** 其他保险列表（分页） */
export async function getOtherInsuranceList(
  params: InsuranceApi.OtherListParams,
) {
  return requestClient.get<{
    list: InsuranceApi.OtherInsuranceItem[];
    total: number;
  }>('/insurance/other', { params });
}

/** 其他保险详情 */
export async function getOtherInsuranceDetail(id: number) {
  return requestClient.get<InsuranceApi.OtherInsuranceItem>(
    `/insurance/other/${id}`,
  );
}

/** 新增其他保险 */
export async function createOtherInsurance(data: InsuranceApi.OtherFormData) {
  return requestClient.post('/insurance/other', data);
}

/** 更新其他保险 */
export async function updateOtherInsurance(
  id: number,
  data: Partial<InsuranceApi.OtherFormData>,
) {
  return requestClient.put(`/insurance/other/${id}`, data);
}

/** 删除其他保险 */
export async function deleteOtherInsurance(id: number) {
  return requestClient.delete(`/insurance/other/${id}`);
}

/** 其他保险统计 */
export async function getOtherInsuranceStats() {
  return requestClient.get<InsuranceApi.OtherStats>('/insurance/other/stats');
}

/** 导出其他保险（CSV）—— 后端端点若不存在则由调用方捕获 */
export async function exportOtherInsurance() {
  return requestClient.download('/insurance/other/export');
}

/**
 * 受保护保单文件读取（记录 ID 定位，绕过默认 JSON 拦截器）。
 * @param kind 'policies'（人员主保单）| 'other'（其他保险）
 * @param id   保险记录 ID
 */
export async function getPolicyFile(
  kind: 'policies' | 'other',
  id: number | string,
): Promise<Blob> {
  // 必须使用 requestClient.download（含 Authorization 头），baseRequestClient 不带 token 会 401
  return requestClient.download<Blob>(`/insurance/${kind}/${id}/file`);
}

// ==================== 保单管理（人员保险 主保单文档） ====================

/** 保单文档（雇主责任险 / 工伤保险 主保单 PDF） */
export interface InsurancePolicyDocument {
  id: number;
  name: string;
  type: string;
  policyNo?: string;
  year?: string;
  fileName: string;
  originalName: string;
  createdAt?: string;
}

/** 查询保单文档列表 */
export async function getPolicyDocuments(params?: { type?: string }) {
  return requestClient.get<{ list: InsurancePolicyDocument[]; total: number }>(
    '/insurance/policies',
    { params },
  );
}

/** 导入保单 PDF（multipart：name / type / policyNo / year / file） */
export async function importPolicyPdf(
  file: File,
  meta: { name?: string; type?: string; policyNo?: string; year?: string },
) {
  const formData = new FormData();
  formData.append('file', file);
  if (meta.name) formData.append('name', meta.name);
  if (meta.type) formData.append('type', meta.type);
  if (meta.policyNo) formData.append('policyNo', meta.policyNo);
  if (meta.year) formData.append('year', meta.year);
  return requestClient.post<InsurancePolicyDocument>(
    '/insurance/policies/import-pdf',
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

/** 编辑保单信息（保单号 / 年份 / 名称 / 类型；不更换文件） */
export async function updatePolicy(
  id: number,
  data: { name?: string; type?: string; policyNo?: string; year?: string },
) {
  return requestClient.put<InsurancePolicyDocument>(
    `/insurance/policies/${id}`,
    data,
  );
}

/** 删除保单 */
export async function deletePolicy(id: number) {
  return requestClient.delete(`/insurance/policies/${id}`);
}

// ==================== 其他保险 PDF 导入（OCR 识别） ====================

/** 其他保险 PDF 导入返回（OCR 抽取字段 + 可信度） */
export interface OtherPdfOcrResult {
  fileName: string;
  storedName: string;
  fileSize: number;
  totalPages: number;
  pagesRead: number;
  textPreview: string;
  extracted: {
    policyNo?: string;
    startDate?: string | null;
    expireDate?: string | null;
    insuranceCompany?: string;
  };
  confidence: number;
  tempPath?: string;
}

/** 其他保险 PDF 导入（后端 OCR 识别，返回抽取字段，不直接落库） */
export async function importOtherInsurancePdf(
  file: File,
): Promise<OtherPdfOcrResult> {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<OtherPdfOcrResult>(
    '/insurance/other/import-pdf',
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

// ==================== 保险通用附件 API ====================

/** 查询保险附件列表 */
export async function getInsuranceAttachments(
  bizType: string,
  bizId: number,
) {
  return requestClient.get<InsuranceApi.InsuranceAttachment[]>(
    `/insurance/${bizType}/${bizId}/attachments`,
  );
}

/** 上传保险附件 */
export async function uploadInsuranceAttachment(
  bizType: string,
  bizId: number,
  file: File,
  options: { uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<InsuranceApi.InsuranceAttachment>(
    `/insurance/${bizType}/${bizId}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

/** 删除保险附件 */
export async function deleteInsuranceAttachment(
  bizType: string,
  bizId: number,
  attachmentId: number,
) {
  return requestClient.delete(
    `/insurance/${bizType}/${bizId}/attachments/${attachmentId}`,
  );
}

/** 查询保险版本履历 */
export async function getInsuranceVersions(bizType: string, bizId: number) {
  return requestClient.get<InsuranceApi.InsuranceVersionRecord[]>(
    `/insurance/${bizType}/${bizId}/versions`,
  );
}

// ==================== 超龄人员保险管控 API ====================
// 端点权威来源：server/routes/insurance.js 的 /overage（requireRole('admin','safety_manager')）
// 与基线 web-antd 的 api/hse/insurance.ts 1:1 对齐；仅补充此前缺失的 4 个函数。

/** 查询超龄人员保险管控记录详情 */
export async function getOverAgeDetail(id: number) {
  return requestClient.get<any>(`/insurance/overage/${id}`);
}

/** 新建超龄人员保险管控记录 */
export async function createOverAge(data: Record<string, any>) {
  return requestClient.post<any>('/insurance/overage', data);
}

/** 更新超龄人员保险管控记录 */
export async function updateOverAge(id: number, data: Record<string, any>) {
  return requestClient.put<any>(`/insurance/overage/${id}`, data);
}

/** 删除超龄人员保险管控记录 */
export async function deleteOverAge(id: number) {
  return requestClient.delete(`/insurance/overage/${id}`);
}
