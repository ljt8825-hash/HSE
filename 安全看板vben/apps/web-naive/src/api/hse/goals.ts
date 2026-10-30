/**
 * HSE 目标职责 API 适配层（web-naive · 阶段06B-2）
 * 契约来源：apps/web-antd/src/api/hse/goals.ts（唯一契约来源，逐项保持 URL/方法/参数/响应结构；
 *           baseRequestClient Blob 下载与 multipart 上传行为不变；不得更改服务端契约）。
 */
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { baseRequestClient, requestClient } from '#/api/request';

// 与旧版 apps/web-antd/src/api/request.ts 一致：为 baseRequestClient（Blob 下载/受保护文件预览）补充认证头。
// 该客户端不启用业务 JSON 响应拦截器，响应保持原始 Blob 格式；拦截器在模块加载时注册一次。
function formatToken(token: null | string) {
  return token ? `Bearer ${token}` : null;
}
baseRequestClient.addRequestInterceptor({
  fulfilled: async (config) => {
    const accessStore = useAccessStore();
    config.headers.Authorization = formatToken(accessStore.accessToken);
    config.headers['Accept-Language'] = preferences.app.locale;
    return config;
  },
});

// ========== 目标责任书签订台账（员工花名册 × 签订状态） ==========
export namespace ResponsibilityRosterApi {
  export interface RosterItem {
    employeeId: number;
    employeeCode: string;
    name: string;
    department: string;
    team: string;
    position: string;
    hireDate: string | null;
    supervisor: string | null;
    contractId?: number | null;
    contractStatus?: string | null;
    contractTitle?: string | null;
    signDate?: string | null;
    signStatus: 'signed' | 'unsigned';
    /** 在职但责任书系统查无记录（源文件未覆盖）：用于在「未签订」中细分 */
    noSourceRecord?: boolean;
  }

  export interface RosterListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    department?: string;
    signStatus?: 'signed' | 'unsigned' | 'unsigned_no_source' | '';
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface RosterStats {
    total: number;
    signed: number;
    unsigned: number;
    signRate: number;
  }

  export interface EmployeeOption {
    employeeId: number;
    employeeCode: string;
    name: string;
    idCard: string | null;
    department: string | null;
    position: string | null;
  }

  export interface ResponsibilityCreate {
    employeeId?: number;
    employeeCode?: string;
    name?: string;
    idCard?: string;
    title?: string;
    contractType?: string;
    status: 'signed' | 'unsigned';
    signDate?: string | null;
  }

  export interface ResponsibilityDetail {
    contractId: number;
    title: string;
    contractType: string;
    status: 'signed' | 'unsigned';
    signDate: string | null;
    employeeId: number;
    employeeCode: string;
    name: string;
    department: string;
    team: string;
    position: string;
    hireDate: string | null;
    supervisor: string | null;
  }

  export interface ImportResult {
    inserted: number;
    updated: number;
    unmatched: number;
    total: number;
    unmatchedSamples: Array<{ employeeCode?: string; name?: string; idCard?: string }>;
  }

  export interface UnmatchedItem {
    employeeCode: string;
    name: string;
    idCard: string | null;
    sourceTargetValue: string | null;
    sourceSigned: boolean;
    reason: string;
    importedAt: string;
  }
}

/** 责任书签订台账分页列表 */
export function getResponsibilityRoster(params: ResponsibilityRosterApi.RosterListParams) {
  return requestClient.get<{ list: ResponsibilityRosterApi.RosterItem[]; total: number }>(
    '/objectives/employees/responsibility-status',
    { params },
  );
}

/** 责任书签订统计（随筛选联动） */
export function getResponsibilityRosterStats(params?: { keyword?: string; department?: string; signStatus?: string }) {
  return requestClient.get<ResponsibilityRosterApi.RosterStats>(
    '/objectives/employees/responsibility-stats',
    { params },
  );
}

/** 花名册部门动态选项（供签订情况筛选下拉使用） */
export function getRosterDepartments() {
  return requestClient.get<string[]>('/objectives/roster-departments');
}

/** 员工检索（录入责任书弹窗远程搜索） */
export function lookupEmployees(keyword?: string) {
  return requestClient.get<ResponsibilityRosterApi.EmployeeOption[]>(
    '/objectives/employees/lookup',
    { params: { keyword } },
  );
}

/** 新增/录入责任书（按员工关联，自动 upsert 最新一条） */
export function createResponsibility(data: ResponsibilityRosterApi.ResponsibilityCreate) {
  return requestClient.post<{ id: number }>('/objectives/employees/responsibility', data);
}

/** 查看责任书记录详情 */
export function getResponsibility(contractId: number) {
  return requestClient.get<ResponsibilityRosterApi.ResponsibilityDetail>(
    `/objectives/employees/responsibility/${contractId}`,
  );
}

/** 更新责任书记录（仅维护签订信息） */
export function updateResponsibility(
  contractId: number,
  data: Partial<ResponsibilityRosterApi.ResponsibilityCreate>,
) {
  return requestClient.put<{ id: number }>(`/objectives/employees/responsibility/${contractId}`, data);
}

/** 删除责任书记录（软删除） */
export function deleteResponsibility(contractId: number) {
  return requestClient.delete(`/objectives/employees/responsibility/${contractId}`);
}

/** 下载责任书签订台账导入模板（xlsx Blob，baseRequestClient 专用文件客户端，与旧版一致） */
export async function downloadResponsibilityTemplate(): Promise<Blob> {
  const response = await baseRequestClient.get<Blob>('/objectives/employees/responsibility-template', {
    responseType: 'blob',
  });
  return (response as any).data || response;
}

/** 导入责任书签订数据（xlsx/csv，按姓名/身份证/员工编号匹配） */
export function importResponsibility(file: File): Promise<ResponsibilityRosterApi.ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<ResponsibilityRosterApi.ImportResult>(
    '/objectives/employees/responsibility-import',
    formData,
    { headers: { 'Content-Type': undefined as any }, timeout: 120000 },
  );
}

/** 对账差异（源文件有、但不在职花名册，按口径视为已离职） */
export function getResponsibilityUnmatched() {
  return requestClient.get<{ list: ResponsibilityRosterApi.UnmatchedItem[]; total: number }>(
    '/objectives/employees/responsibility-unmatched',
  );
}

// ========== 安全人员及安委会 (org-personnel) ==========
export namespace CommitteeApi {
  export interface PersonnelItem {
    id: number;
    name: string;
    position?: string;
    department?: string;
    township?: string;
    phone?: string;
    status?: string;
    memberType?: string;
    employeeNo?: string;
    titleInCommittee?: string;
    dutyDesc?: string;
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface PersonnelListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    year?: number;
  }
}

export function getCommitteeList(params: CommitteeApi.PersonnelListParams) {
  return requestClient.get<{ list: CommitteeApi.PersonnelItem[]; total: number }>(
    '/objectives/org-personnel',
    { params },
  );
}

export function createCommittee(data: Partial<CommitteeApi.PersonnelItem>) {
  return requestClient.post<CommitteeApi.PersonnelItem>('/objectives/org-personnel', data);
}

export function updateCommittee(id: number, data: Partial<CommitteeApi.PersonnelItem>) {
  return requestClient.put<CommitteeApi.PersonnelItem>(`/objectives/org-personnel/${id}`, data);
}

export function deleteCommittee(id: number) {
  return requestClient.delete(`/objectives/org-personnel/${id}`);
}

// ========== 安委会组织开展活动 (committee-activities) ==========
export namespace CommitteeActivityApi {
  /** 活动类型枚举（与后端 activity_type 对齐） */
  export type ActivityType =
    | '安委会会议'
    | '安全例会'
    | '专项检查'
    | '应急演练'
    | '教育培训'
    | '其他';

  export interface ActivityItem {
    id: number;
    activityName: string;
    activityType: ActivityType | string;
    activityDate: string;
    hostDepartment: string;
    participants: number;
    location: string;
    summary: string;
    /** 服务端存储文件名（磁盘文件名，与前端上传返回的 storedName 一致） */
    pdfFile: string;
    /** 原始文件名（用于展示 / 下载） */
    originalName: string;
    remark: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface ActivityListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    activityType?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  /** import-pdf 返回 */
  export interface ActivityPdfUploadResult {
    storedName: string;
    originalName: string;
    fileSize: number;
  }
}

export function getCommitteeActivityList(params: CommitteeActivityApi.ActivityListParams) {
  return requestClient.get<{ list: CommitteeActivityApi.ActivityItem[]; total: number }>(
    '/objectives/committee-activities',
    { params },
  );
}

export function createCommitteeActivity(data: Partial<CommitteeActivityApi.ActivityItem>) {
  return requestClient.post<CommitteeActivityApi.ActivityItem>('/objectives/committee-activities', data);
}

export function updateCommitteeActivity(id: number, data: Partial<CommitteeActivityApi.ActivityItem>) {
  return requestClient.put<CommitteeActivityApi.ActivityItem>(`/objectives/committee-activities/${id}`, data);
}

export function deleteCommitteeActivity(id: number) {
  return requestClient.delete(`/objectives/committee-activities/${id}`);
}

/** 上传安委会活动 PDF（落在 uploads/committee/ 下），返回服务端存储文件名 */
export function importCommitteeActivityPdf(file: File): Promise<CommitteeActivityApi.ActivityPdfUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<CommitteeActivityApi.ActivityPdfUploadResult>(
    '/objectives/committee-activities/import-pdf',
    formData,
    { headers: { 'Content-Type': undefined as any }, timeout: 120000 },
  );
}

/** 受保护文件读取（按记录 ID 定位），返回 Blob，由调用方创建临时 Blob URL 预览（baseRequestClient，与旧版一致） */
export async function getCommitteeActivityFile(id: number | string): Promise<Blob> {
  const response = await baseRequestClient.get<Blob>(`/objectives/committee-activities/${id}/file`, {
    responseType: 'blob',
  });
  return (response as any).data || response;
}

/** 下载安委会活动导入模板（xlsx Blob，baseRequestClient，与旧版一致） */
export async function downloadCommitteeActivityTemplate(): Promise<Blob> {
  const response = await baseRequestClient.get<Blob>('/objectives/committee-activities/template', {
    responseType: 'blob',
  });
  return (response as any).data || response;
}

/** 导入安委会活动 Excel（按台账结构批量写入，返回导入条数） */
export function importCommitteeActivityExcel(file: File): Promise<{ inserted: number; total: number }> {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<{ inserted: number; total: number }>(
    '/objectives/committee-activities/import',
    formData,
    { headers: { 'Content-Type': undefined as any }, timeout: 120000 },
  );
}

// ========== 责任制及考核 (responsibility) ==========
export namespace AssessmentApi {
  export interface AssessmentItem {
    id: number;
    /** 被考核人员工 ID */
    employeeId?: number | null;
    /** 员工编号 */
    employeeNo?: string;
    year: number;
    quarter: number;
    department: string;
    /** 考核对象姓名（映射自 employee_name） */
    person: string;
    /** 岗位（选人时自动带出） */
    position?: string;
    /** 组织单元 ID */
    orgUnitId?: number | null;
    /** 乡镇/片区 */
    township?: string;
    score: number;
    level: string;
    status: string;
    remark: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface AssessmentListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    year?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }
}

/** 考核列表使用 /hse/assessment；写入端点使用 /objectives/responsibility（既有契约，禁止修正/合并） */
export function getAssessmentList(params: AssessmentApi.AssessmentListParams) {
  return requestClient.get<{ list: AssessmentApi.AssessmentItem[]; total: number }>('/hse/assessment', { params });
}

export function createAssessment(data: Partial<AssessmentApi.AssessmentItem>) {
  return requestClient.post<AssessmentApi.AssessmentItem>('/objectives/responsibility', data);
}

export function updateAssessment(id: number, data: Partial<AssessmentApi.AssessmentItem>) {
  return requestClient.put<AssessmentApi.AssessmentItem>(`/objectives/responsibility/${id}`, data);
}

export function deleteAssessment(id: number) {
  return requestClient.delete(`/objectives/responsibility/${id}`);
}

// ========== 安全费用预算及支出 (safety-budget) ==========
export namespace BudgetApi {
  export interface BudgetItem {
    id: number;
    budgetYear: number;
    year: number;
    item: string;
    itemName: string;
    projectName: string;
    budgetAmount: number;
    usedAmount: number;
    spentAmount: number;
    category: string;
    measureItem: string;
    budgetSubject: string;
    purpose: string;
    planTime: string;
    location: string;
    spec: string;
    planQuantity: number;
    planUnitPrice: number;
    planTotal: number;
    actualQuantity: number;
    actualUnitPrice: number;
    actualExpenditureQuantity: number;
    actualExpenditureUnitPrice: number;
    actualExpenditureTotal: number;
    useStatus: string;
    department: string;
    status: string;
    executionStatus?: string;
    remark: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface BudgetListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    year?: number;
    category?: string;
    status?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface BudgetStats {
    total: number;
    planTotal: number;
    spentTotal: number;
    executionRate: number;
    warningItems: number;
  }
}

export function getBudgetList(params: BudgetApi.BudgetListParams) {
  return requestClient.get<{ list: BudgetApi.BudgetItem[]; total: number }>('/objectives/safety-budget', { params });
}

export function getBudgetStats(params?: BudgetApi.BudgetListParams) {
  return requestClient.get<BudgetApi.BudgetStats>('/objectives/safety-budget/stats', { params });
}

export function createBudget(data: Partial<BudgetApi.BudgetItem>) {
  return requestClient.post<BudgetApi.BudgetItem>('/objectives/safety-budget', data);
}

export function updateBudget(id: number, data: Partial<BudgetApi.BudgetItem>) {
  return requestClient.put<BudgetApi.BudgetItem>(`/objectives/safety-budget/${id}`, data);
}

export function deleteBudget(id: number) {
  return requestClient.delete(`/objectives/safety-budget/${id}`);
}
