import { baseRequestClient, requestClient } from '#/api/request';

/**
 * 人员保险规范险种生产常量（任务9，提示词09）。
 * 与后端 services/insuranceTypeDict.js SUPPORTED_INSURANCE_TYPES 对齐：
 * 人员保险透视/统计/合规/表单只支持 雇主责任险/工伤保险；页面下拉与测试必须引用本常量。
 */
export const PERSONNEL_INSURANCE_TYPES = ['雇主责任险', '工伤保险'] as const;

export type PersonnelInsuranceType = (typeof PERSONNEL_INSURANCE_TYPES)[number];

export namespace InsuranceApi {
  /** 人员保险写入契约（任务1：camelCase，严格字段；employeeId 必填） */
  export interface PersonnelInsuranceWritePayload {
    employeeId: number;
    insuranceType: string;
    coverageAmount?: number;
    premium?: number;
    startDate?: string | null;
    expireDate?: string | null;
    isCurrent?: boolean;
    policyNo?: string;
    remark?: string;
  }

  /** 人员保险更新契约（任务1：全部可选；employeeId 出现时才允许换人） */
  export type PersonnelInsuranceUpdatePayload = Partial<
    Omit<PersonnelInsuranceWritePayload, 'employeeId'>
  > & {
    employeeId?: number;
  };

  /** 透视后的人员保险行（一行=一人，含雇主险/工伤险两个子对象） */
  export interface PersonnelItemPivoted {
    /** 后端稳定行键（employee:${employeeId}），不得用姓名+身份证 */
    rowKey: string;
    /** 人员主数据稳定 ID（新契约，关联 employee.id） */
    employeeId: number | null;
    personName: string;
    idCard: string;
    phone?: string;
    department: string;
    position: string;
    workType: string;
    /** deprecated 兼容：旧字段语义含混，新契约统一使用 employeeId */
    personnelId: number | null;
    employer: InsTypeInfo;
    injury: InsTypeInfo;
    /** 人员保险合规状态：compliant=合规 / noncompliant=不合规 / unknown=无法判定 */
    complianceStatus?: 'compliant' | 'noncompliant' | 'unknown' | string;
    syncStatus?: 'synced' | 'unsynced' | 'missing';
  }

  /** 单个险种信息 */
  export interface InsTypeInfo {
    id: number | null;
    /** 是否存在业务记录（历史/停用/未来也可有 ID，仍可进入编辑流程） */
    recordExists: boolean;
    /** 当前有效参保（= status 为 insured/expiring），与 status 同源 */
    hasInsurance: boolean;
    /** 记录真实 is_current 值（编辑回显用，禁止由 hasInsurance 反推） */
    isCurrent: boolean;
    policyNo: string;
    startDate: string | null;
    expireDate: string | null;
    premium: number;
    coverage: number;
    status: 'insured' | 'expiring' | 'expired' | 'uninsured';
  }

  export interface PersonnelItem {
    id: number;
    name: string;
    idCard: string;
    phone?: string;
    department: string;
    position: string;
    workType: string;
    isHighRisk: boolean;
    highRiskCategory?: string;
    employeeType: string;
    entryDate: string;
    insuranceStatus: 'insured' | 'uninsured' | 'expired' | 'expiring';
    insuranceType: string;
    policyNumber?: string;
    policyStartDate?: string;
    policyEndDate?: string;
    premium?: number;
    remark?: string;
    /** C3 提示词-143：与花名册的同步状态 */
    syncStatus?: 'synced' | 'unsynced' | 'missing';
    createdAt: string;
    updatedAt: string;
  }

  export interface PersonnelListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    department?: string;
    workType?: string;
    insuranceStatus?: string;
    employeeType?: string;
    isHighRisk?: boolean;
    highRiskCategory?: string;
    /** C4 提示词-143：同步状态筛选 */
    syncStatus?: string;
    /** C8 提示词-145：险种类型筛选（雇主责任险/工伤保险） */
    insuranceType?: string;
    /** 人员状态（合规/不合规）筛选 */
    complianceStatus?: 'compliant' | 'noncompliant' | string;
  }

  export interface BatchRenewalParams {
    ids: number[];
    policyEndDate: string;
    policyStartDate?: string;
    premium?: number;
    remark?: string;
  }

  export interface HazardItem {
    id: number;
    no: number | null;
    description: string;
    measure: string;
    checkDate: string | null;
    checker: string;
    fixer: string;
    fixDate: string | null;
    isResolved: '是' | '否';
    expiryStatus?: HazardExpiryStatus;
    remark?: string;
    /** 关联风险点 ID（Phase 14 联动字段） */
    relatedRiskId?: number | null;
    /** 风险等级（同步自风险点） */
    riskLevel?: string | null;
    createdAt: string;
    updatedAt?: string;
    /** Sprint5.9: 人员关联字段 */
    finderId?: number | null;
    responsibleId?: number | null;
    correctorId?: number | null;
    /** Sprint5.13: 隐患治理闭环字段 */
    hazardType?: string | null;
    location?: string;
    gridId?: number | null;
    rectification?: string;
    reviewerId?: number | null;
    rectifyDate?: string | null;
    reviewDate?: string | null;
    reviewResult?: string | null;
    deadlineDays?: number;
    status?: string;
  }

  /** 关联风险点信息（Phase 14 反向联动） */
  export interface RelatedRisk {
    id: number;
    name: string;
    level: string;
    type?: string;
    location?: string;
    area?: string;
    status?: string;
    measures?: string;
    assessmentDate?: string | null;
    reviewCycle?: number | null;
    lastHazardCheckDate?: string | null;
    hazardCount?: number;
  }

  export interface HazardListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    isResolved?: string;
    startDate?: string;
    endDate?: string;
  }

  export interface PolicyStats {
    total: number;
    active: number;
    expiring30d: number;
    expired: number;
    highRisk?: number;
    noncompliant?: number;
    byType: Record<string, number>;
    byDepartment: Record<string, number>;
  }

  export const HIGH_RISK_CATEGORIES = [
    { key: 'driver', label: '司机', color: 'orange', keywords: ['司机', '驾驶员', '押运员', '跟车员', '车队'] },
    { key: 'transfer_station', label: '转运站', color: 'cyan', keywords: ['转运站', '中转站', '垃圾站', '压缩站', '转运'] },
    { key: 'high_altitude', label: '高空作业', color: 'purple', keywords: ['高空', '登高', '外墙', '路灯', '亮化', '吊篮', '脚手架'] },
    { key: 'underground', label: '市政井下', color: 'magenta', keywords: ['市政井下', '井下', '窨井', '下水道', '化粪池', '有限空间', '污水'] },
    { key: 'other_special', label: '其他特种', color: 'blue', keywords: ['电工', '焊工', '叉车', '起重机', '特种', '爆破', '挖掘机', '塔吊'] },
  ] as const;

  export function detectHighRiskCategory(position: string): string | null {
    if (!position) return null;
    const pos = position.toLowerCase();
    for (const cat of HIGH_RISK_CATEGORIES) {
      if (cat.keywords.some((kw) => pos.includes(kw.toLowerCase()))) {
        return cat.key;
      }
    }
    return null;
  }

  export function getHighRiskCategoryLabel(key: string): string {
    const cat = HIGH_RISK_CATEGORIES.find((c) => c.key === key);
    return cat?.label || key;
  }

  export function getHighRiskCategoryColor(key: string): string {
    const cat = HIGH_RISK_CATEGORIES.find((c) => c.key === key);
    return cat?.color || 'default';
  }
}

export async function getPersonnelList(params: InsuranceApi.PersonnelListParams) {
  return requestClient.get<{ list: InsuranceApi.PersonnelItemPivoted[]; total: number }>(
    '/insurance/personnel',
    { params },
  );
}

export async function getPersonnelDetail(id: number) {
  return requestClient.get<InsuranceApi.PersonnelItem>(`/insurance/personnel/${id}`);
}

export async function createPersonnel(data: InsuranceApi.PersonnelInsuranceWritePayload) {
  return requestClient.post<InsuranceApi.PersonnelItem>('/insurance/personnel', data);
}

export async function updatePersonnel(id: number, data: InsuranceApi.PersonnelInsuranceUpdatePayload) {
  return requestClient.put<InsuranceApi.PersonnelItem>(`/insurance/personnel/${id}`, data);
}

export async function deletePersonnel(id: number) {
  return requestClient.delete(`/insurance/personnel/${id}`);
}

export async function batchRenewal(data: InsuranceApi.BatchRenewalParams) {
  return requestClient.put('/insurance/personnel/batch-renewal', data);
}

export async function getPolicyStats() {
  const res = await requestClient.get<any>('/insurance/personnel/stats');
  // 后端返回 { stats: { total, covered, expired, pending, highRisk, expiring30d, noncompliant }, byType, byDepartment }
  // 前端统一为 { total, active, expired, expiring30d, highRisk, noncompliant, byType, byDepartment }
  if (res?.stats) {
    return {
      total: res.stats.total || 0,
      active: res.stats.covered || 0,
      expiring30d: res.stats.expiring30d || 0,
      expired: res.stats.expired || 0,
      highRisk: res.stats.highRisk || 0,
      noncompliant: res.stats.noncompliant || 0,
      byType: res.byType || {},
      byDepartment: res.byDepartment || {},
    } as InsuranceApi.PolicyStats;
  }
  // 兼容直接返回扁平结构的情况
  return res as InsuranceApi.PolicyStats;
}

// ========== 人员保险部门列表（U6：部门筛选器动态化） ==========
export async function getPersonnelDepartments() {
  return requestClient.get<{ departments: string[] }>('/insurance/personnel/departments');
}

/**
 * C6/任务5：按人员主数据 ID（employeeIds）批量回写花名册快照。
 * 参数为 v_employee_current.employee_id 列表；不再接收保险记录 ID。
 */
export async function syncPersonnelFromRoster(employeeIds: number[]) {
  return requestClient.post<{ synced: number; failed: number[]; errors: string[] }>(
    '/insurance/personnel/sync-from-roster',
    { employeeIds },
  );
}

export async function getHazardList(params: InsuranceApi.HazardListParams) {
  return requestClient.get<{ list: InsuranceApi.HazardItem[]; total: number }>('/hazards', {
    params,
  });
}

export async function getHazardStats() {
  return requestClient.get<HazardStatsEnhanced>('/hazards/stats');
}

export async function getHazardDetail(id: number) {
  return requestClient.get<InsuranceApi.HazardItem>(`/hazards/${id}`);
}

export async function createHazard(data: Partial<InsuranceApi.HazardItem>) {
  return requestClient.post<InsuranceApi.HazardItem>('/hazards', data);
}

export async function updateHazard(id: number, data: Partial<InsuranceApi.HazardItem>) {
  return requestClient.put<InsuranceApi.HazardItem>(`/hazards/${id}`, data);
}

export async function deleteHazard(id: number) {
  return requestClient.delete(`/hazards/${id}`);
}

// ========== 隐患时效状态 ==========
export type HazardExpiryStatus = 'normal' | 'expiring' | 'expired' | 'resolved' | 'unknown';

// ========== 隐患附件 ==========
export interface HazardAttachment {
  id: number;
  hazardId: number;
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

// ========== 隐患版本履历 ==========
export interface HazardVersionRecord {
  id: number;
  hazardId: number;
  version: string;
  changeType: 'create' | 'update' | 'import' | 'revise' | 'delete';
  changeSummary?: string;
  changedBy?: string;
  createdAt: string;
}

// ========== 隐患附件管理 ==========
export async function getHazardAttachments(hazardId: number, version?: string) {
  return requestClient.get<HazardAttachment[]>(
    `/hazards/${hazardId}/attachments`,
    { params: version ? { version } : {} },
  );
}

export async function uploadHazardAttachment(
  hazardId: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<HazardAttachment>(
    `/hazards/${hazardId}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteHazardAttachment(hazardId: number, attachmentId: number) {
  return requestClient.delete(
    `/hazards/${hazardId}/attachments/${attachmentId}`,
  );
}

// ========== 隐患版本履历 ==========
export async function getHazardVersions(hazardId: number) {
  return requestClient.get<HazardVersionRecord[]>(
    `/hazards/${hazardId}/versions`,
  );
}

// ========== 隐患报表导出 ==========
export async function exportHazards() {
  return requestClient.get<Blob>('/hazards/export', {
    responseType: 'blob',
  });
}

// ========== 隐患 → 风险 反向联动（Phase 14） ==========

/**
 * 查询隐患关联的风险点信息
 * 返回 null 表示无关联风险点
 */
export async function getRelatedRisk(hazardId: number) {
  return requestClient.get<InsuranceApi.RelatedRisk | null>(
    `/hazards/${hazardId}/related-risk`,
  );
}

// ========== Sprint5.13: 隐患治理闭环流程 API ==========

export async function rectifyHazard(id: number, data: { correctorId?: number; rectification?: string; rectifyDate?: string }) {
  return requestClient.put<InsuranceApi.HazardItem>(`/hazards/${id}/rectify`, data);
}

export async function submitReviewHazard(id: number) {
  return requestClient.put<InsuranceApi.HazardItem>(`/hazards/${id}/submit-review`);
}

export async function reviewHazard(id: number, data: { reviewerId?: number; reviewResult: 'pass' | 'fail'; reviewNote?: string; reviewDate?: string }) {
  return requestClient.put<InsuranceApi.HazardItem>(`/hazards/${id}/review`, data);
}

export async function closeHazard(id: number, data?: { closeNote?: string }) {
  return requestClient.put<InsuranceApi.HazardItem>(`/hazards/${id}/close`, data);
}

// ========== Sprint5.13: 联动功能 API ==========

export interface HighRiskReminderResult {
  list: InsuranceApi.HazardItem[];
  total: number;
}

export async function getHighRiskReminders() {
  return requestClient.get<HighRiskReminderResult>('/hazards/reminders/high-risk');
}

export interface OverdueReminderResult {
  list: (InsuranceApi.HazardItem & { responsibleName?: string; overdueDays?: number })[];
  total: number;
}

export async function getOverdueReminders() {
  return requestClient.get<OverdueReminderResult>('/hazards/reminders/overdue');
}

export interface RepeatedHazardItem {
  description: string;
  hazardType?: string;
  riskLevel?: string;
  location?: string;
  repeatCount: number;
  firstDiscovered: string;
  lastDiscovered: string;
  closedCount: number;
}

export interface RepeatedHazardResult {
  list: RepeatedHazardItem[];
  total: number;
}

export async function getRepeatedHazardAnalysis() {
  return requestClient.get<RepeatedHazardResult>('/hazards/analysis/repeated');
}

export interface ResponsibleOverdueItem {
  responsibleId: number;
  responsibleName: string;
  department?: string;
  position?: string;
  totalHazards: number;
  closedHazards: number;
  overdueHazards: number;
}

export interface ResponsibleOverdueResult {
  list: ResponsibleOverdueItem[];
  total: number;
}

export async function getResponsibleOverdueAnalysis() {
  return requestClient.get<ResponsibleOverdueResult>('/hazards/analysis/responsible-overdue');
}

// ========== Sprint5.13: 统计分析类型 ==========

export interface HazardStatsEnhanced {
  total: number;
  discovered: number;
  processing: number;
  pendingReview: number;
  closed: number;
  highRiskCount: number;
  overdueCount: number;
  resolved?: number;
  unresolved?: number;
  byDepartment: { departmentName: string; total: number }[];
  byPosition: { positionName: string; total: number }[];
  byRegion: { region: string; total: number }[];
  repeatedHazards: {
    description: string;
    repeatCount: number;
    firstDiscovered: string;
    lastDiscovered: string;
  }[];
}

export async function downloadTemplate(module: string) {
  return requestClient.get(`/import/template/${module}`, { responseType: 'blob' });
}

export async function uploadFile(data: { module: string; fileData: string }) {
  return requestClient.post('/import/upload', data);
}

/**
 * FormData 方式上传文件（匹配后端 multer multipart 中间件）
 * 用于真实 Excel/CSV 文件导入，避免 readAsText 对二进制的损坏
 * 额外传递 original_filename 参数确保中文文件名编码安全
 */
export async function uploadFileFormData(
  file: File,
  module: string,
): Promise<any> {
  const formData = new FormData();
  const actualFile = (file as any).originFileObj || file;
  formData.append('file', actualFile);
  formData.append('module', module);
  formData.append('original_filename', (actualFile as File).name || (file as File).name || 'unknown.xlsx');
  return requestClient.post('/import/upload', formData, {
    headers: {
      'Content-Type': undefined as any,
    },
    timeout: 120000,
  });
}

/**
 * 上传其他保险 PDF 保单并识别关键字段
 * 后端自动提取前 5 页文本，返回保单号/起期/止期/保险公司
 */
export async function importOtherInsurancePdf(file: File): Promise<any> {
  const formData = new FormData();
  const actualFile = (file as any).originFileObj || file;
  formData.append('file', actualFile);
  return requestClient.post('/insurance/other/import-pdf', formData, {
    headers: {
      'Content-Type': undefined as any,
    },
    timeout: 120000,
  });
}

export async function confirmImport(data: { fileRecordId: string; operator?: string; insuranceType?: string }) {
  return requestClient.post('/import/confirm', data, { timeout: 60000 });
}

/**
 * 解析文件（可指定要导入的工作表）。用于多 sheet 场景下，
 * 用户在前端勾选工作表后，重新解析并合并选中 sheet 的数据。
 */
export async function parseImport(data: { fileRecordId: string; sheets?: string[] }) {
  return requestClient.post('/import/parse', data, { timeout: 60000 });
}

export const HIGH_RISK_CATEGORIES = InsuranceApi.HIGH_RISK_CATEGORIES;
export const detectHighRiskCategory = InsuranceApi.detectHighRiskCategory;
export const getHighRiskCategoryLabel = InsuranceApi.getHighRiskCategoryLabel;
export const getHighRiskCategoryColor = InsuranceApi.getHighRiskCategoryColor;

// ========== 保险时效状态 ==========
export type InsuranceExpiryStatus = 'normal' | 'expiring' | 'expired' | 'unknown';

// ========== 保险通用附件 ==========
export interface InsuranceAttachment {
  id: number;
  bizType: 'vehicle' | 'personnel' | 'overage';
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

// ========== 保险通用版本履历 ==========
export interface InsuranceVersionRecord {
  id: number;
  bizType: 'vehicle' | 'personnel' | 'overage';
  bizId: number;
  version: string;
  changeType: 'create' | 'update' | 'import' | 'revise' | 'delete';
  changeSummary?: string;
  changedBy?: string;
  createdAt: string;
}

// ========== 保险附件管理（通用，bizType: vehicle/personnel/overage） ==========
export async function getInsuranceAttachments(bizType: string, bizId: number) {
  return requestClient.get<InsuranceAttachment[]>(
    `/insurance/${bizType}/${bizId}/attachments`,
  );
}

export async function uploadInsuranceAttachment(
  bizType: string,
  bizId: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<InsuranceAttachment>(
    `/insurance/${bizType}/${bizId}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteInsuranceAttachment(
  bizType: string,
  bizId: number,
  attachmentId: number,
) {
  return requestClient.delete(
    `/insurance/${bizType}/${bizId}/attachments/${attachmentId}`,
  );
}

// ========== 保险版本履历（通用） ==========
export async function getInsuranceVersions(bizType: string, bizId: number) {
  return requestClient.get<InsuranceVersionRecord[]>(
    `/insurance/${bizType}/${bizId}/versions`,
  );
}

// ========== 保险报表导出（CSV） ==========
export async function exportPersonnelInsurance() {
  return requestClient.get<Blob>('/insurance/personnel/export', {
    responseType: 'blob',
  });
}

export async function exportVehicleInsurance() {
  return requestClient.get<Blob>('/insurance/vehicle/export', {
    responseType: 'blob',
  });
}

export async function exportOverAgePersonnel() {
  return requestClient.get<Blob>('/insurance/overage/export', {
    responseType: 'blob',
  });
}

// ========== 保单管理（雇主险 / 工伤险 主保单文档） ==========
export interface PolicyDocument {
  id: number;
  name: string;
  type: string;
  /** 保单号 */
  policyNo?: string;
  /** 保险年份 */
  year?: string;
  fileName: string;
  originalName: string;
  createdAt: string;
}

/** 查询保单文档列表（可按 type 过滤：雇主责任险 / 工伤保险） */
export async function getPolicyDocuments(type?: string) {
  return requestClient.get<{ list: PolicyDocument[]; total: number }>('/insurance/policies', {
    params: type ? { type } : {},
  });
}

/**
 * 受保护保单文件读取（服务端记录 ID 定位，任务0.2）。
 * 客户端只传业务类型与记录 ID；服务端从记录解析文件名并校验，杜绝任意路径。
 * 返回 Blob，由调用方创建临时 Blob URL 预览/下载。
 * @param kind 'policies'（人员主保单）| 'other'（其他保险）
 * @param id   保险记录 ID
 */
export async function getPolicyFile(kind: 'policies' | 'other', id: number | string): Promise<Blob> {
  // 必须使用无默认拦截器的 baseRequestClient：requestClient 启用了 responseReturn:'data' +
  // defaultResponseInterceptor，会把二进制 PDF 流当作 JSON 包装解析，导致 blob 预览失败。
  // 注意：RequestClient.request 直接返回原始 AxiosResponse 对象，因此需要取 .data 才是真正的 Blob。
  const response = await baseRequestClient.get<Blob>(`/insurance/${kind}/${id}/file`, {
    responseType: 'blob',
  });
  return (response as any).data || response;
}

/** 上传保单 PDF（文件落在 /uploads/insurance/ 下） */
export async function importPolicyPdf(
  file: File,
  options: { name?: string; type?: string; policyNo?: string; year?: string } = {},
): Promise<PolicyDocument> {
  const formData = new FormData();
  const actualFile = (file as any).originFileObj || file;
  formData.append('file', actualFile);
  if (options.name) formData.append('name', options.name);
  if (options.type) formData.append('type', options.type);
  if (options.policyNo) formData.append('policyNo', options.policyNo);
  if (options.year) formData.append('year', options.year);
  return requestClient.post<PolicyDocument>('/insurance/policies/import-pdf', formData, {
    headers: {
      'Content-Type': undefined as any,
    },
    timeout: 120000,
  });
}

/** 删除保单文档 */
export async function deletePolicy(id: number) {
  return requestClient.delete(`/insurance/policies/${id}`);
}

/** 更新保单信息（保单号/年份/名称/类型；不更换文件） */
export async function updatePolicy(
  id: number,
  data: { name?: string; type?: string; policyNo?: string; year?: string },
): Promise<PolicyDocument> {
  return requestClient.put<PolicyDocument>(`/insurance/policies/${id}`, data);
}

// ========== 车辆保险 API ==========
export async function getVehicleList(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  /** V3：保险时效状态筛选 normal/expiring/expired/active */
  insuranceStatus?: string;
  /** V4：车辆类型筛选（动态来自 stats.vehicle_types） */
  vehicleType?: string;
  /** 后端 /insurance/vehicle 实际筛选参数名为 model（对应车辆类型） */
  model?: string;
}) {
  return requestClient.get<{ list: any[]; total: number }>(
    '/insurance/vehicle',
    { params },
  );
}

export interface VehicleStats {
  total: number;
  active: number;
  expired: number;
  expiring: number;
  totalPremium: number;
}

export async function getVehicleDetail(id: number) {
  return requestClient.get<any>(`/insurance/vehicle/${id}`);
}

export async function createVehicle(data: Record<string, any>) {
  return requestClient.post<any>('/insurance/vehicle', data);
}

export async function updateVehicle(id: number, data: Record<string, any>) {
  return requestClient.put<any>(`/insurance/vehicle/${id}`, data);
}

export async function deleteVehicle(id: number) {
  return requestClient.delete(`/insurance/vehicle/${id}`);
}

export async function getVehicleStats() {
  return requestClient.get<any>('/insurance/vehicle/stats');
}

// ========== 超龄人员 API ==========
export async function getOverAgeList(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
}) {
  return requestClient.get<{ list: any[]; total: number }>(
    '/insurance/overage',
    { params },
  );
}

export async function getOverAgeDetail(id: number) {
  return requestClient.get<any>(`/insurance/overage/${id}`);
}

export async function createOverAge(data: Record<string, any>) {
  return requestClient.post<any>('/insurance/overage', data);
}

export async function updateOverAge(id: number, data: Record<string, any>) {
  return requestClient.put<any>(`/insurance/overage/${id}`, data);
}

export async function deleteOverAge(id: number) {
  return requestClient.delete(`/insurance/overage/${id}`);
}
