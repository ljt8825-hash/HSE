import { requestClient } from '#/api/request';

export namespace TrainingApi {
  /** 表单用：培训记录新增/编辑（提示词-134 T2：原 TrainingPlan 重命名为 TrainingPlanForm） */
  export interface TrainingPlanForm {
    id: number;
    title: string;
    type: 'safety' | 'skills' | 'emergency' | 'induction' | 'regular';
    status: 'draft' | 'planned' | 'ongoing' | 'completed' | 'cancelled';
    targetAudience: string;
    trainer: string;
    plannedAttendees: number;
    actualAttendees?: number;
    startDate: string;
    endDate: string;
    location: string;
    duration: number;
    content: string;
    examRequired: boolean;
    passScore?: number;
    remark?: string;
    createdAt: string;
    updatedAt: string;
  }

  /** 列表展示用：匹配 /training/records 实际返回的「记录型」字段（提示词-134 T2） */
  export interface TrainingPlanItem {
    id: number;
    name: string;              // 对应旧 title
    trainingType: string;       // 对应旧 type
    result: string;             // 对应旧 status（培训结果）
    trainer: string;
    supervisorId?: number | null;
    supervisorName?: string | null;
    employeeId?: number | null;
    trainingPlanId?: number | null;
    idCard?: string;
    department: string;
    position: string;
    gridLevel?: string;
    frequency?: string;
    trainingDate: string;
    durationMinutes: number;
    content: string;
    score: number | null;
    remark?: string;
    expiryStatus?: string;
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

  export interface TrainingListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
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

// ========== 时效状态 ==========
export type ExpiryStatus = 'normal' | 'expiring' | 'expired' | 'unknown';

// ========== 培训附件 ==========
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

// ========== 培训版本履历 ==========
export interface TrainingVersionRecord {
  id: number;
  recordId: number;
  version: string;
  changeType: 'create' | 'update' | 'import' | 'revise' | 'delete';
  changeSummary?: string;
  changedBy?: string;
  createdAt: string;
}

export async function getTrainingPlanList(params: TrainingApi.TrainingListParams) {
  return requestClient.get<{ list: TrainingApi.TrainingPlanItem[]; total: number }>(
    '/training/records',
    { params },
  );
}

export async function getTrainingStats() {
  return requestClient.get<TrainingApi.TrainingStats>('/training/stats');
}

export async function getTrainingPlanDetail(id: number) {
  return requestClient.get<TrainingApi.TrainingPlanForm>(`/training/records/${id}`);
}

export async function createTrainingPlan(data: Partial<TrainingApi.TrainingPlanForm>) {
  return requestClient.post<TrainingApi.TrainingPlanForm>('/training/records', data);
}

export async function updateTrainingPlan(id: number, data: Partial<TrainingApi.TrainingPlanForm>) {
  return requestClient.put<TrainingApi.TrainingPlanForm>(`/training/records/${id}`, data);
}

export async function deleteTrainingPlan(id: number) {
  return requestClient.delete(`/training/records/${id}`);
}

export async function getTrainingRecords(_planId: number) {
  return requestClient.get<TrainingApi.TrainingRecord[]>(`/training/records`);
}

// ========== 培训台账 (ledger) ==========
export namespace LedgerApi {
  export interface LedgerItem {
    id: number;
    employeeId?: number;
    /** 提示词-57 v2：受训人直接上级员工 ID */
    supervisorId?: number | null;
    /** 提示词-57 v2：受训人直接上级姓名 */
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
    remark: string;
    expiryStatus?: ExpiryStatus;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface LedgerListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    result?: string;
  }
}

export async function getLedgerList(params: LedgerApi.LedgerListParams) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number }>('/training/ledger', { params });
}

// ========== 培训记录页面改造：按培训人员月度汇总 ==========
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
    inpostNames?: string;
    departedNames?: string;
    untrainedInpost?: number;
    untrainedDeparted?: number;
  }

  export interface UntrainedItem {
    id: number;
    name: string;
    deptName: string;
    status: 'inpost' | 'departed';
    employeeId: number | null;
    trainerName: string;
    createdAt: string;
  }
}

export async function getTrainingPersonnelSummary(month?: string, params: Record<string, any> = {}) {
  return requestClient.get<{ list: TrainingPersonnelApi.SummaryItem[]; total: number; month: string }>(
    '/training/ledger/personnel-summary',
    { params: { ...params, month } },
  );
}

export async function getTrainingPersonnelRecords(
  employeeId: number,
  month?: string,
  pageCur = 1,
  pageSize = 10,
) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number; page: number; pageSize: number }>(
    `/training/ledger/personnel-summary/${employeeId}/records`,
    { params: { month, page: pageCur, pageSize } },
  );
}

/** 缺少人数弹窗：某培训人员当月未培训名单（含离职/在岗状态） */
export async function getTrainingPersonnelSummaryUntrained(
  employeeId: number,
  month?: string,
) {
  return requestClient.get<{
    list: TrainingPersonnelApi.UntrainedItem[];
    month: string;
    total: number;
  }>(`/training/ledger/personnel-summary/${employeeId}/untrained`, {
    params: { month },
  });
}

/** 人员月度汇总导出（CSV，含未培训姓名及在岗/离职状态） */
export async function exportTrainingPersonnelSummary(month?: string) {
  return requestClient.get<Blob>('/training/ledger/personnel-summary/export', {
    params: { month },
    responseType: 'blob',
  });
}

/** 月度培训台账导入（Excel「月度培训台账」工作表 → 覆盖式写入指定月份汇总） */
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

export async function createLedger(data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.post<LedgerApi.LedgerItem>('/training/ledger', data);
}

export async function updateLedger(id: number, data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.put<LedgerApi.LedgerItem>(`/training/ledger/${id}`, data);
}

export async function deleteLedger(id: number) {
  return requestClient.delete(`/training/ledger/${id}`);
}

// ========== 新员工培训 (new-employees) ==========
export async function getNewEmployeeList(params: LedgerApi.LedgerListParams) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number }>('/training/new-employees', { params });
}

export async function createNewEmployee(data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.post<LedgerApi.LedgerItem>('/training/new-employees', data);
}

export async function updateNewEmployee(id: number, data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.put<LedgerApi.LedgerItem>(`/training/new-employees/${id}`, data);
}

export async function deleteNewEmployee(id: number) {
  return requestClient.delete(`/training/new-employees/${id}`);
}

// ========== 驾驶员实操 (driver) ==========
export async function getDriverList(params: LedgerApi.LedgerListParams) {
  return requestClient.get<{ list: LedgerApi.LedgerItem[]; total: number }>('/training/driver', { params });
}

export async function createDriver(data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.post<LedgerApi.LedgerItem>('/training/driver', data);
}

export async function updateDriver(id: number, data: Partial<LedgerApi.LedgerItem>) {
  return requestClient.put<LedgerApi.LedgerItem>(`/training/driver/${id}`, data);
}

export async function deleteDriver(id: number) {
  return requestClient.delete(`/training/driver/${id}`);
}

// ========== 培训附件管理 ==========
export async function getTrainingAttachments(recordId: number, version?: string) {
  return requestClient.get<TrainingAttachment[]>(
    `/training/records/${recordId}/attachments`,
    { params: version ? { version } : {} },
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
  return requestClient.post<TrainingAttachment>(
    `/training/records/${recordId}/attachments`,
    formData,
    { headers: { 'Content-Type': undefined as any } },
  );
}

export async function deleteTrainingAttachment(recordId: number, attachmentId: number) {
  return requestClient.delete(
    `/training/records/${recordId}/attachments/${attachmentId}`,
  );
}

// ========== 培训版本履历 ==========
export async function getTrainingVersions(recordId: number) {
  return requestClient.get<TrainingVersionRecord[]>(
    `/training/records/${recordId}/versions`,
  );
}

// ========== 培训报表导出 ==========
export async function exportTrainingRecords() {
  return requestClient.get<Blob>('/training/records/export', {
    responseType: 'blob',
  });
}

export async function exportTrainingLedger() {
  return requestClient.get<Blob>('/training/ledger/export', {
    responseType: 'blob',
  });
}

// ========== Sprint5.10: 培训要求管理 ==========
export namespace TrainingRequirementApi {
  export interface TrainingRequirement {
    id: number;
    positionId: number;
    positionName: string;
    trainingName: string;
    trainingCycle: string;
    isRequired: boolean;
    durationMinutes: number;
    remark?: string;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export interface RequirementListParams {
    page?: number;
    pageSize?: number;
    positionId?: number;
    keyword?: string;
  }
}

export async function getTrainingRequirements(params: TrainingRequirementApi.RequirementListParams) {
  return requestClient.get<{ list: TrainingRequirementApi.TrainingRequirement[]; total: number }>(
    '/training/requirements',
    { params },
  );
}

export async function getTrainingRequirement(id: number) {
  return requestClient.get<TrainingRequirementApi.TrainingRequirement>(
    `/training/requirements/${id}`,
  );
}

export async function createTrainingRequirement(data: Partial<TrainingRequirementApi.TrainingRequirement>) {
  return requestClient.post<TrainingRequirementApi.TrainingRequirement>(
    '/training/requirements',
    data,
  );
}

export async function updateTrainingRequirement(id: number, data: Partial<TrainingRequirementApi.TrainingRequirement>) {
  return requestClient.put<TrainingRequirementApi.TrainingRequirement>(
    `/training/requirements/${id}`,
    data,
  );
}

export async function deleteTrainingRequirement(id: number) {
  return requestClient.delete(`/training/requirements/${id}`);
}

// ========== Sprint5.10: 培训计划管理（独立表） ==========
export namespace TrainingPlanApi {
  export interface TrainingPlanItem {
    id: number;
    title: string;
    planType: 'annual' | 'special' | 'new_employee';
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
    status: 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
    remark?: string;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
  }

  export interface PlanListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    planType?: string;
    status?: string;
  }
}

export async function getTrainingPlanItems(params: TrainingPlanApi.PlanListParams) {
  return requestClient.get<{ list: TrainingPlanApi.TrainingPlanItem[]; total: number }>(
    '/training/plans',
    { params },
  );
}

export async function getTrainingPlanItem(id: number) {
  return requestClient.get<TrainingPlanApi.TrainingPlanItem>(
    `/training/plans/${id}`,
  );
}

export async function createTrainingPlanItem(data: Partial<TrainingPlanApi.TrainingPlanItem>) {
  return requestClient.post<TrainingPlanApi.TrainingPlanItem>(
    '/training/plans',
    data,
  );
}

export async function updateTrainingPlanItem(id: number, data: Partial<TrainingPlanApi.TrainingPlanItem>) {
  return requestClient.put<TrainingPlanApi.TrainingPlanItem>(
    `/training/plans/${id}`,
    data,
  );
}

export async function deleteTrainingPlanItem(id: number) {
  return requestClient.delete(`/training/plans/${id}`);
}

// ========== Sprint5.10: 培训统计增强 ==========
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
  employeeCompletionRate: Record<string, {}>;
}

export async function getEnhancedTrainingStats() {
  return requestClient.get<EnhancedTrainingStats>('/training/stats/enhanced');
}

// ========== Sprint5.11: 从培训计划生成培训记录 ==========
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

export async function executeTrainingPlan(planId: number, params: ExecutePlanParams) {
  return requestClient.post<ExecutePlanResult>(
    `/training/plans/${planId}/execute`,
    params,
  );
}

// ========== Sprint5.11: 培训到期检查 ==========
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

// ========== Sprint5.11: 新员工培训自动识别 ==========
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

// ========== Sprint5.11: 培训分析增强 ==========
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

// ========== 培训考核规则配置（只读影子数据，提示词-135 R4：从 /rules/* 动态拉取） ==========
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

export interface AssessmentGradeRule {
  code: string;
  label: string;
  minScore: number;
  maxScore: number;
  semanticColor?: string;
}

export interface PlanStatusFlowRule {
  statuses: PlanStatusRule[];
  transitions: Array<{ from: string; to: string; action: string; role: string }>;
}

/** 培训类型枚举（training-assessment-rule.json → /rules/training-types） */
export async function getTrainingTypes() {
  return requestClient.get<TrainingTypeRule[]>('/training-assessment/rules/training-types');
}

/** 培训计划状态流转（training-assessment-rule.json → /rules/plan-status-flow） */
export async function getPlanStatusFlow() {
  return requestClient.get<PlanStatusFlowRule>('/training-assessment/rules/plan-status-flow');
}

/** 考核等级枚举（training-assessment-rule.json → /rules/assessment-grades） */
export async function getAssessmentGrades() {
  return requestClient.get<AssessmentGradeRule[]>('/training-assessment/rules/assessment-grades');
}
