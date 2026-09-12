/**
 * 培训考核 API（web-naive）
 *
 * 对应后端路由: server/routes/training.js
 * 路由前缀: /training
 * requestClient baseURL = /api，完整请求路径为 /api/training/...
 *
 * 06C-2 整改对齐基线（契约来源 apps/web-antd/src/api/hse/training.ts）：
 * - 文件位置 src/api/training.ts → src/api/hse/training.ts
 * - 补全 getTrainingRequirement（GET /training/requirements/{id}）
 * - 删除非基线导出 exportTrainingPlans / exportTrainingRequirements（基线无此端点）
 * - 类型语义对齐：TrainingRequirement/TrainingPlanItem 补 isDeleted；
 *   trainingCycle/planType/status 修回 string（运行态为动态枚举）；
 *   uploadTrainingAttachment 补 uploadedBy（uploaded_by）
 * - 保留 driver / new-employee 相关 API 函数（基线契约保留，仅路由层不暴露页面）
 */
import { requestClient } from '#/api/request';

// ==================== 培训计划（plans） ====================
export namespace TrainingPlanApi {
  export type PlanType = 'annual' | 'special' | 'new_employee';
  export type PlanStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

  export interface TrainingPlanItem {
    id: number;
    /** 序号（对齐附件1《安全培训教育实施计划表》的序号列） */
    planNo?: string;
    planName?: string;
    title: string;
    planType: PlanType;
    trainingType: string;
    targetAudience?: string;
    trainerName?: string;
    trainerId?: number;
    plannedAttendees: number;
    actualAttendees: number;
    startDate: string;
    endDate: string;
    location?: string;
    durationHours: number;
    content?: string;
    examRequired: boolean;
    passScore: number;
    status: PlanStatus;
    remark?: string;
    /** 培训学时（对齐附件1的「培训学时」列，numeric） */
    planHours?: number | null;
    /** 培训时间（对齐附件1的「培训时间」列，如"1月"/"每季度"等文本） */
    trainingTime?: string;
    /** 责任部门（人）（对齐附件1的「责任部门（人）」列） */
    responsibleDept?: string;
    isDeleted: boolean;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface PlanListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    /** 动态枚举（/training-assessment/rules/*），基线为 string，不收敛为窄联合 */
    planType?: string;
    status?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface PlanFormData {
    title: string;
    planType: PlanType;
    trainingType: string;
    targetAudience?: string;
    trainerName?: string;
    trainerId?: number | null;
    plannedAttendees: number;
    actualAttendees?: number;
    startDate: string;
    endDate: string;
    location?: string;
    durationHours: number;
    content?: string;
    examRequired: boolean;
    passScore?: number;
    status: PlanStatus;
    remark?: string;
    /** 序号（对齐附件1） */
    planNo?: string;
    /** 培训学时（对齐附件1，numeric） */
    planHours?: number | null;
    /** 培训时间（对齐附件1，文本） */
    trainingTime?: string;
    /** 责任部门（人）（对齐附件1） */
    responsibleDept?: string;
  }
}

export async function getTrainingPlanItems(
  params: TrainingPlanApi.PlanListParams,
) {
  return requestClient.get<{
    list: TrainingPlanApi.TrainingPlanItem[];
    total: number;
  }>('/training/plans', { params });
}

export async function getTrainingPlanItem(id: number) {
  return requestClient.get<TrainingPlanApi.TrainingPlanItem>(
    `/training/plans/${id}`,
  );
}

export async function createTrainingPlanItem(
  data: TrainingPlanApi.PlanFormData,
) {
  return requestClient.post('/training/plans', data);
}

export async function updateTrainingPlanItem(
  id: number,
  data: Partial<TrainingPlanApi.PlanFormData>,
) {
  return requestClient.put(`/training/plans/${id}`, data);
}

export async function deleteTrainingPlanItem(id: number) {
  return requestClient.delete(`/training/plans/${id}`);
}

// ==================== 培训台账（ledger） ====================
export namespace LedgerApi {
  export type ResultType = string; // 动态从考核等级规则获取

  export interface LedgerItem {
    id: number;
    employeeId?: number;
    // 阶段5（提示词-05）：与 employeeId 同值，保留历史字段语义
    personnelId?: number | null;
    supervisorId?: number | null;
    supervisorName?: string | null;
    trainerId?: number;
    idCard?: string;
    name: string;
    department: string;
    position: string;
    trainingType: string;
    trainingDate: string;
    durationMinutes: number;
    content: string;
    result: string;
    score: number | null;
    trainer: string;
    remark?: string;
    expiryStatus?: string;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface LedgerListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    result?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface LedgerFormData {
    employeeId?: number | null;
    // 阶段5（提示词-05）：与 employeeId 同值，保留历史字段语义
    personnelId?: number | null;
    trainerId?: number | null;
    name?: string;
    department?: string;
    position?: string;
    trainingType?: string;
    trainingDate?: string;
    durationMinutes?: number;
    content?: string;
    score?: number | null;
    result?: string;
    remark?: string;
  }
}

export async function getLedgerList(params: LedgerApi.LedgerListParams) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number }>(
    '/training/ledger',
    { params },
  );
}

export async function createLedger(data: LedgerApi.LedgerFormData) {
  return requestClient.post('/training/ledger', data);
}

export async function updateLedger(
  id: number,
  data: Partial<LedgerApi.LedgerFormData>,
) {
  return requestClient.put(`/training/ledger/${id}`, data);
}

export async function deleteLedger(id: number) {
  return requestClient.delete(`/training/ledger/${id}`);
}

export async function exportTrainingLedger() {
  return requestClient.download('/training/ledger/export');
}

// ==================== 按培训人员月度汇总（人员汇总页） ====================
export namespace TrainingPersonnelApi {
  export interface SummaryItem {
    employeeId: number;
    name: string;
    department: string;
    position: string;
    orgType: string;
    month: string;
    expectedCount: number;
    actualCount: number;
    missingCount: number;
    /** 资料不完整（月度培训台账导入值，未导入时为 0） */
    incompleteCount?: number;
    /** 签到表导入登记的在岗/已离职未培训人数与姓名（规则5/6） */
    untrainedInpost?: number;
    untrainedDeparted?: number;
    inpostNames?: string;
    departedNames?: string;
  }

  export interface PersonnelRecordItem extends LedgerApi.LedgerItem {
    supervisorId?: number | null;
    supervisorName?: string | null;
  }
}

export async function getTrainingPersonnelSummary(
  month?: string,
  params: Record<string, any> = {},
) {
  return requestClient.get<{
    list: TrainingPersonnelApi.SummaryItem[];
    total: number;
    month: string;
  }>('/training/ledger/personnel-summary', { params: { ...params, month } });
}

// 有月度培训台账数据的月份（倒序），用于月份下拉补充展示更早月份
export async function getTrainingLedgerMonths() {
  return requestClient.get<{ months: string[] }>('/training/ledger/months');
}

// 月度培训台账导入（覆盖式：先清空该月数据再写入）
export async function importTrainingLedgerMonthly(file: File, month?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (month) formData.append('month', month);
  return requestClient.post<{
    month: string;
    sheet: string;
    trainers: number;
    unmatched: string[];
    expectedTotal: number;
    actualTotal: number;
    missingTotal: number;
    incompleteTotal: number;
  }>('/training/ledger/monthly-import', formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

export async function getTrainingPersonnelRecords(
  employeeId: number,
  month?: string,
  pageCur = 1,
  pageSize = 10,
) {
  return requestClient.get<{
    list: TrainingPersonnelApi.PersonnelRecordItem[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/training/ledger/personnel-summary/${employeeId}/records`, {
    params: { month, page: pageCur, pageSize },
  });
}

// 培训计划内容下拉（新增/批量弹窗的「培训内容」来源）
export interface PlanContentOption {
  id: number;
  label: string;
  content: string;
  trainingType: string;
  startDate: string | null;
  status: string;
}

export async function getTrainingPlanContentOptions(month?: string) {
  return requestClient.get<{ list: PlanContentOption[] }>(
    '/training/ledger/plan-content-options',
    { params: { month } },
  );
}

// 培训类型动态选项（开放式：取自 training_records 已出现的类型，随数据变化）
export async function getTrainingTypeOptions() {
  return requestClient.get<{ list: string[] }>('/training/ledger/training-type-options');
}

// 批量录入：对所选培训人员各补录一条当月培训记录，内容/类型/日期统一带入
export interface BatchCreateTrainingPayload {
  trainerIds: number[];
  name?: string;
  trainingType?: string;
  trainingDate: string;
  durationMinutes?: number;
  content?: string;
  score?: number | null;
  result?: string;
  trainingPlanId?: number | null;
}

export async function batchCreateTrainingPersonnelRecords(
  data: BatchCreateTrainingPayload,
) {
  return requestClient.post<{ created: number }>(
    '/training/ledger/personnel-summary/batch-create',
    data,
  );
}

// 批量删除：删除所选培训人员在指定月份内的培训记录（传 [employeeId] 即单行删除）
export async function batchDeleteTrainingPersonnelRecords(
  trainerIds: number[],
  month?: string,
) {
  return requestClient.post<{ deleted: number }>(
    '/training/ledger/personnel-summary/batch-delete',
    { trainerIds, month },
  );
}

// ==================== 培训要求/考核管理（requirements） ====================
export namespace TrainingRequirementApi {
  /** 周期运行值为动态枚举（与 /training-assessment/rules 一致），基线为 string */
  export type TrainingCycle = string;

  export interface TrainingRequirement {
    id: number;
    positionId: number;
    positionName: string;
    trainingName: string;
    trainingCycle: TrainingCycle;
    isRequired: boolean;
    durationMinutes: number;
    remark?: string;
    isDeleted: boolean;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface RequirementListParams {
    page?: number;
    pageSize?: number;
    positionId?: number;
    keyword?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface RequirementFormData {
    positionId?: number;
    positionName?: string;
    trainingName: string;
    trainingCycle: TrainingCycle;
    isRequired: boolean;
    durationMinutes: number;
    remark?: string;
  }
}

export async function getTrainingRequirements(
  params: TrainingRequirementApi.RequirementListParams,
) {
  return requestClient.get<{
    list: TrainingRequirementApi.TrainingRequirement[];
    total: number;
  }>('/training/requirements', { params });
}

/** 考核要求详情（06C-2 补全，基线契约） */
export async function getTrainingRequirement(id: number) {
  return requestClient.get<TrainingRequirementApi.TrainingRequirement>(
    `/training/requirements/${id}`,
  );
}

export async function createTrainingRequirement(
  data: TrainingRequirementApi.RequirementFormData,
) {
  return requestClient.post('/training/requirements', data);
}

export async function updateTrainingRequirement(
  id: number,
  data: Partial<TrainingRequirementApi.RequirementFormData>,
) {
  return requestClient.put(`/training/requirements/${id}`, data);
}

export async function deleteTrainingRequirement(id: number) {
  return requestClient.delete(`/training/requirements/${id}`);
}

// ==================== 培训记录/证书管理（records/certificates） ====================
export namespace TrainingRecordApi {
  export type TrainingType = string; // 动态从规则获取
  export type ResultStatus = string; // 动态从规则获取
  export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'unknown';

  export interface TrainingRecordItem {
    id: number;
    name: string;
    trainingType: string;
    result: string;
    trainer: string;
    supervisorId?: number | null;
    supervisorName?: string | null;
    employeeId?: number | null;
    trainingPlanId?: number | null;
    idCard?: string;
    department: string;
    position: string;
    trainingDate: string;
    durationMinutes: number;
    content: string;
    score: number | null;
    remark?: string;
    expiryStatus?: ExpiryStatus;
    certificateNo?: string;
    // 证书管理扩展字段
    personnelType?: string;
    validity?: string;
    isPinned?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface TrainingRecord {
    id: number;
    planId: number;
    planTitle: string;
    traineeName: string;
    traineeId: string;
    department: string;
    attendStatus: 'attended' | 'absent' | 'late' | 'early_leave';
    examScore?: number;
    examResult?: 'pass' | 'fail' | 'pending';
    certificateNo?: string;
    remark?: string;
    createdAt: string;
  }

  export interface TrainingAttachment {
    id: number;
    recordId: number;
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

  export interface TrainingVersionRecord {
    id: number;
    recordId: number;
    version: string;
    changeType: 'create' | 'update' | 'import' | 'revise' | 'delete';
    changeSummary?: string;
    changedBy?: string;
    createdAt: string;
  }

  export interface RecordListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    status?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  export interface RecordFormData {
    title?: string;
    type?: string;
    targetAudience?: string;
    trainer?: string;
    plannedAttendees?: number;
    startDate?: string;
    endDate?: string;
    location?: string;
    duration?: number;
    content?: string;
    examRequired?: boolean;
    passScore?: number;
    remark?: string;
    // 证书管理扩展字段
    personnelType?: string;
    validity?: string;
    isPinned?: boolean;
  }

  export interface TrainingStats {
    totalPlans: number;
    ongoing: number;
    completed: number;
    totalAttendees: number;
    passRate: number;
    byType: Record<string, number>;
  }
}

export async function getTrainingPlanList(
  params: TrainingRecordApi.RecordListParams,
) {
  return requestClient.get<{
    list: TrainingRecordApi.TrainingRecordItem[];
    total: number;
  }>('/training/records', { params });
}

export async function getTrainingStats() {
  return requestClient.get<TrainingRecordApi.TrainingStats>('/training/stats');
}

export async function getTrainingPlanDetail(id: number) {
  return requestClient.get<TrainingRecordApi.TrainingRecordItem>(
    `/training/records/${id}`,
  );
}

export async function createTrainingPlan(
  data: TrainingRecordApi.RecordFormData,
) {
  return requestClient.post('/training/records', data);
}

export async function updateTrainingPlan(
  id: number,
  data: Partial<TrainingRecordApi.RecordFormData>,
) {
  return requestClient.put(`/training/records/${id}`, data);
}

export async function deleteTrainingPlan(id: number) {
  return requestClient.delete(`/training/records/${id}`);
}

export async function getTrainingRecords(planId: number) {
  return requestClient.get<TrainingRecordApi.TrainingRecord[]>(
    `/training/records`,
    { params: { planId } },
  );
}

export async function getTrainingAttachments(recordId: number) {
  return requestClient.get<TrainingRecordApi.TrainingAttachment[]>(
    `/training/records/${recordId}/attachments`,
  );
}

export async function uploadTrainingAttachment(
  recordId: number,
  file: File,
  options: { version?: string; uploadedBy?: string } = {},
) {
  const formData = new FormData();
  formData.append('file', file);
  if (options.version) formData.append('version', options.version);
  if (options.uploadedBy) formData.append('uploaded_by', options.uploadedBy);
  return requestClient.post<TrainingRecordApi.TrainingAttachment>(
    `/training/records/${recordId}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteTrainingAttachment(
  recordId: number,
  attachmentId: number,
) {
  return requestClient.delete(
    `/training/records/${recordId}/attachments/${attachmentId}`,
  );
}

export async function getTrainingVersions(recordId: number) {
  return requestClient.get<TrainingRecordApi.TrainingVersionRecord[]>(
    `/training/records/${recordId}/versions`,
  );
}

export async function exportTrainingRecords() {
  return requestClient.download('/training/records/export');
}

// ==================== 综合考核统计（stats） ====================
export interface EnhancedTrainingStats {
  byPosition: Record<string, { required: number; completed: number }>;
  byEmployee: Record<string, number>;
  overdueEmployees: Array<{
    name: string;
    employeeCode: string;
    positionName: string;
    orgName: string;
    trainingDate: string;
    trainingType: string;
    expiryStatus: string;
  }>;
  positionCompletionRate: Record<string, number>;
  employeeCompletionRate: Record<string, unknown>;
}

export async function getEnhancedTrainingStats() {
  return requestClient.get<EnhancedTrainingStats>('/training/stats/enhanced');
}

// ==================== 培训规则（动态枚举） ====================
export interface TrainingTypeRule {
  code: string;
  label: string;
  defaultHours?: number;
  semanticColor?: string;
}

export interface PlanStatusRule {
  code: string;
  label: string;
  semanticColor?: string;
}

export interface PlanStatusFlowRule {
  statuses: PlanStatusRule[];
  transitions: Array<{ from: string; to: string; action: string; role: string }>;
}

export interface AssessmentGradeRule {
  code: string;
  label: string;
  minScore: number;
  maxScore: number;
  semanticColor?: string;
}

export async function getTrainingTypes() {
  return requestClient.get<TrainingTypeRule[]>(
    '/training-assessment/rules/training-types',
  );
}

export async function getPlanStatusFlow() {
  return requestClient.get<PlanStatusFlowRule>(
    '/training-assessment/rules/plan-status-flow',
  );
}

export async function getAssessmentGrades() {
  return requestClient.get<AssessmentGradeRule[]>(
    '/training-assessment/rules/assessment-grades',
  );
}

// ==================== 新员工培训（new-employees，基线契约保留） ====================
export async function getNewEmployeeList(params: LedgerApi.LedgerListParams) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number }>(
    '/training/new-employees',
    { params },
  );
}

export async function createNewEmployee(data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.post<LedgerApi.LedgerItem>('/training/new-employees', data);
}

export async function updateNewEmployee(
  id: number,
  data: Partial<LedgerApi.LedgerItem>,
) {
  return requestClient.put<LedgerApi.LedgerItem>(
    `/training/new-employees/${id}`,
    data,
  );
}

export async function deleteNewEmployee(id: number) {
  return requestClient.delete(`/training/new-employees/${id}`);
}

// ==================== 驾驶员实操（driver，基线契约保留） ====================
export async function getDriverList(params: LedgerApi.LedgerListParams) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number }>(
    '/training/driver',
    { params },
  );
}

export async function createDriver(data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.post<LedgerApi.LedgerItem>('/training/driver', data);
}

export async function updateDriver(
  id: number,
  data: Partial<LedgerApi.LedgerItem>,
) {
  return requestClient.put<LedgerApi.LedgerItem>(
    `/training/driver/${id}`,
    data,
  );
}

export async function deleteDriver(id: number) {
  return requestClient.delete(`/training/driver/${id}`);
}

// ==================== 培训计划执行（execute） ====================
export interface ExecutePlanParams {
  employeeIds: number[];
  trainingDate?: string;
  result?: string;
  score?: number | null;
  remark?: string;
  trainerId?: number | null;
}

export interface ExecutePlanResult {
  created: LedgerApi.LedgerItem[];
  count: number;
}

export async function executeTrainingPlan(
  planId: number,
  params: ExecutePlanParams,
) {
  return requestClient.post<ExecutePlanResult>(
    `/training/plans/${planId}/execute`,
    params,
  );
}

// ==================== 培训到期提醒（reminders） ====================
export interface ExpiryReminderItem {
  employeeId: number;
  name: string;
  employeeCode: string;
  positionName: string;
  orgName: string;
  isDriver: boolean;
  trainingDate: string;
  expiryDate: string;
  trainingType: string;
  expiryStatus: 'expired' | 'expiring' | 'missing';
}

export interface ExpiryReminderResult {
  expiring: ExpiryReminderItem[];
  expired: ExpiryReminderItem[];
  missing: ExpiryReminderItem[];
  summary: {
    expiringCount: number;
    expiredCount: number;
    missingCount: number;
    total: number;
  };
  note: string;
}

export async function getExpiryReminders(days = 30) {
  return requestClient.get<ExpiryReminderResult>('/training/reminders/expiry', {
    params: { days },
  });
}

// ==================== 新员工培训自动识别 ====================
export interface NewEmployeeIncompleteItem {
  employeeId: number;
  name: string;
  employeeCode: string;
  positionName: string;
  orgName: string;
  hireDate: string;
  daysSinceHire: number;
  lastTrainingDate: string;
  lastTrainingResult: string;
  status: '未培训' | '未合格';
}

export interface NewEmployeeReminderResult {
  incomplete: NewEmployeeIncompleteItem[];
  requirements: TrainingRequirementApi.TrainingRequirement[];
  summary: {
    totalCount: number;
    incompleteCount: number;
    completedCount: number;
  };
}

export async function getNewEmployeeReminders() {
  return requestClient.get<NewEmployeeReminderResult>(
    '/training/reminders/new-employee',
  );
}

// ==================== 培训分析增强 ====================
export interface TrainingAnalysisResult {
  highRiskPosition: { total: number; completed: number; rate: number };
  driver: { total: number; completed: number; rate: number };
  newEmployee: { total: number; completed: number; rate: number };
  summary: { overallRate: number };
}

export async function getTrainingAnalysis() {
  return requestClient.get<TrainingAnalysisResult>(
    '/training/analysis/enhanced',
  );
}
