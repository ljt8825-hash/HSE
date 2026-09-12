/**
 * HSE 智能预警与整改闭环中心 API - Sprint7
 * 对应后端路由: server/routes/hse-warning-center.js
 * 路由前缀: /hse/warning-center
 *
 * 四大模块: 风险预警中心 / 整改任务中心 / 整改闭环分析 / 预警规则管理
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/warning-center';

export namespace WarningCenterApi {
  // ===== 通用类型 =====

  /** 预警来源 */
  export type SourceType = 'employee_risk' | 'driver_risk' | 'accident' | 'assessment' | 'management';

  /** 预警等级 */
  export type WarningLevel = 'critical' | 'major' | 'minor' | 'info';

  /** 预警状态 */
  export type WarningStatus = 'pending' | 'processing' | 'resolved' | 'closed' | 'ignored';

  /** 任务状态 */
  export type TaskStatus = 'pending' | 'dispatched' | 'processing' | 'pending_review' | 'closed' | 'rejected';

  /** 优先级 */
  export type Priority = 'low' | 'normal' | 'high' | 'urgent';

  /** 对象类型 */
  export type TargetType = 'employee' | 'organization';

  // ===== 模块一: 风险预警中心 =====

  /** 预警记录 */
  export interface WarningRecord {
    id: number;
    warningCode: string;
    ruleId: number | null;
    ruleName: string | null;
    ruleVersion: string | null;
    sourceType: SourceType;
    sourceTypeLabel: string;
    warningLevel: WarningLevel;
    warningLevelLabel: string;
    warningLevelColor: string;
    targetType: TargetType;
    targetId: number | null;
    targetName: string | null;
    orgId: number | null;
    orgName: string | null;
    riskReason: string | null;
    riskData: Record<string, any> | null;
    status: WarningStatus;
    statusLabel: string;
    rectificationTaskId: number | null;
    taskCode: string | null;
    taskStatus: TaskStatus | null;
    handledBy: number | null;
    handledAt: string | null;
    closedBy: number | null;
    closedAt: string | null;
    closeRemark: string | null;
    /** v1.1新增：升级相关字段 */
    isEscalated: boolean;
    escalatedAt: string | null;
    originalLevel: string | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 预警列表响应 */
  export interface WarningListResponse {
    list: WarningRecord[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 预警统计 */
  export interface WarningStats {
    overall: {
      total: number;
      pendingCount: number;
      processingCount: number;
      resolvedCount: number;
      closedCount: number;
      ignoredCount: number;
      criticalCount: number;
      majorCount: number;
      minorCount: number;
      infoCount: number;
    };
    bySource: Array<{
      sourceType: SourceType;
      sourceTypeLabel: string;
      total: number;
      activeCount: number;
      closedCount: number;
    }>;
  }

  /** 预警扫描结果 */
  export interface ScanResult {
    totalGenerated: number;
    rulesScanned: number;
    details: Array<{
      ruleCode: string;
      ruleName: string;
      generated: number;
    }>;
  }

  /** 预警升级结果（v1.1新增） */
  export interface EscalationResult {
    totalEscalated: number;
    criticalEscalated: number;
    majorEscalated: number;
    details: Array<{
      warningId: number;
      warningCode: string;
      originalLevel: string;
      escalatedLevel: string;
      pendingHours: number;
      targetName: string;
    }>;
  }

  // ===== 模块二: 整改任务中心 =====

  /** 整改任务 */
  export interface WarningTask {
    id: number;
    taskCode: string;
    warningId: number | null;
    warningCode: string | null;
    wrCode: string | null;
    taskTitle: string;
    description: string | null;
    responsibleId: number | null;
    responsibleName: string | null;
    orgId: number | null;
    orgName: string | null;
    deadlineDate: string;
    actualCompletionDate: string | null;
    status: TaskStatus;
    statusLabel: string;
    statusColor: string;
    progress: number;
    priority: Priority;
    priorityLabel: string;
    processNote: string | null;
    processAttachment: any[] | null;
    processedAt: string | null;
    reviewBy: number | null;
    reviewName: string | null;
    reviewNote: string | null;
    reviewResult: 'approved' | 'rejected' | null;
    reviewedAt: string | null;
    closedAt: string | null;
    closedBy: number | null;
    closeNote: string | null;
    warningLevel: WarningLevel | null;
    warningLevelLabel: string;
    sourceType: SourceType | null;
    sourceTypeLabel: string;
    overdueStatus: 'overdue' | 'expiring' | 'normal';
    daysRemaining: number | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 任务列表响应 */
  export interface TaskListResponse {
    list: WarningTask[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 创建任务请求 */
  export interface CreateTaskRequest {
    warning_id?: number;
    task_title: string;
    description?: string;
    responsible_id: number;
    responsible_name?: string;
    org_id?: number;
    org_name?: string;
    deadline_date: string;
    priority?: Priority;
  }

  /** 提交证明请求 */
  export interface SubmitProofRequest {
    process_note: string;
    process_attachment?: any[];
    progress?: number;
  }

  /** 复核请求 */
  export interface ReviewRequest {
    review_result: 'approved' | 'rejected';
    review_note?: string;
    review_attachment?: any[];
  }

  // ===== 模块三: 整改闭环分析 =====

  /** 分析数据 */
  export interface AnalysisData {
    currentYear: number;
    overall: {
      totalTasks: number;
      closedTasks: number;
      overdueTasks: number;
      pendingTasks: number;
      dispatchedTasks: number;
      processingTasks: number;
      reviewTasks: number;
      rejectedTasks: number;
      avgCloseDays: number;
      rectificationRate: number;
      overdueRate: number;
    };
    bySource: Array<{
      sourceType: SourceType;
      sourceTypeLabel: string;
      total: number;
      closed: number;
      overdue: number;
      rectificationRate: number;
      overdueRate: number;
    }>;
    byLevel: Array<{
      level: WarningLevel;
      levelLabel: string;
      total: number;
      closed: number;
      rate: number;
    }>;
    monthlyTrend: Array<{
      month: string;
      total: number;
      closed: number;
      overdue: number;
      rate: number;
    }>;
    repeatRiskRate: number;
    repeatTargets: number;
    totalTargets: number;
  }

  // ===== 模块四: 预警规则管理 =====

  /** 预警规则 */
  export interface WarningRule {
    id: number;
    ruleCode: string;
    ruleName: string;
    sourceType: SourceType;
    sourceTypeLabel: string;
    warningLevel: WarningLevel;
    warningLevelLabel: string;
    targetType: TargetType;
    conditionConfig: Record<string, any>;
    actionConfig: Record<string, any>;
    description: string | null;
    status: 'active' | 'inactive';
    version: string;
    parentVersionId: number | null;
    createdBy: number | null;
    createdAt: string;
    updatedAt: string;
    versions?: RuleVersion[];
  }

  /** 规则版本 */
  export interface RuleVersion {
    id: number;
    ruleId: number;
    version: string;
    snapshot: Record<string, any>;
    changeLog: string | null;
    status: 'active' | 'expired';
    createdBy: number | null;
    createdAt: string;
  }

  /** 规则列表响应 */
  export interface RuleListResponse {
    list: WarningRule[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 创建规则请求 */
  export interface CreateRuleRequest {
    rule_name: string;
    source_type: SourceType;
    warning_level: WarningLevel;
    target_type?: TargetType;
    condition_config?: Record<string, any>;
    action_config?: Record<string, any>;
    description?: string;
    status?: 'active' | 'inactive';
  }

  /** 更新规则请求 */
  export interface UpdateRuleRequest {
    rule_name?: string;
    source_type?: SourceType;
    warning_level?: WarningLevel;
    target_type?: TargetType;
    condition_config?: Record<string, any>;
    action_config?: Record<string, any>;
    description?: string;
    change_log?: string;
  }

  // ===== Sprint7-C: 整改效果评价 =====

  /** 整改效果评价结果 */
  export interface EvaluationResult {
    id: number;
    taskId: number;
    warningId: number | null;
    beforeRiskLevel: string;
    beforeRiskLevelLabel: string;
    beforeRiskScore: number;
    afterRiskLevel: string;
    afterRiskLevelLabel: string;
    afterRiskScore: number;
    riskDelta: number;
    levelImproved: boolean;
    timelinessScore: number;
    effectivenessScore: number;
    repeatRate: number;
    effectScore: number;
    evaluationNote: string | null;
    evaluator: number | null;
    evaluatorName: string | null;
    evaluationTime: string;
  }

  /** 整改效果评价统计 */
  export interface EvaluationStats {
    totalEvaluations: number;
    improvedCount: number;
    avgEffectScore: number;
    avgTimelinessScore: number;
    avgEffectivenessScore: number;
    avgRepeatRate: number;
    avgRiskDelta: number;
    improvementRate: number;
  }

  // ===== Sprint7-C: 预警调度管理 =====

  /** 扫描类型 */
  export type ScanType = 'all' | 'employee_risk' | 'driver_risk' | 'accident' | 'assessment' | 'management';

  /** 调度任务 */
  export interface Scheduler {
    id: number;
    taskName: string;
    scanType: ScanType;
    scanTypeLabel: string;
    cronExpression: string;
    description: string | null;
    status: 'active' | 'inactive';
    lastExecuteTime: string | null;
    nextExecuteTime: string | null;
    lastResult: Record<string, any> | null;
    createdAt: string;
    updatedAt: string;
  }

  /** 调度任务列表响应 */
  export interface SchedulerListResponse {
    list: Scheduler[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 创建调度任务请求 */
  export interface CreateSchedulerRequest {
    task_name: string;
    scan_type: ScanType;
    cron_expression: string;
    description?: string;
    status?: 'active' | 'inactive';
  }

  /** 更新调度任务请求 */
  export interface UpdateSchedulerRequest {
    task_name?: string;
    scan_type?: ScanType;
    cron_expression?: string;
    description?: string;
    status?: 'active' | 'inactive';
  }

  /** 执行结果 */
  export interface ExecuteResult {
    totalGenerated: number;
    scannedRules: number;
    scanType: string;
  }
}

// ===== API 函数 =====

/** 模块一: 风险预警中心 */

/** 预警列表 */
export function getWarnings(params?: {
  source_type?: string;
  warning_level?: string;
  status?: string;
  target_type?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<WarningCenterApi.WarningListResponse>(`${BASE}/warnings`, { params });
}

/** 预警统计 */
export function getWarningStats() {
  return requestClient.get<WarningCenterApi.WarningStats>(`${BASE}/warnings/stats`);
}

/** 预警详情 */
export function getWarningDetail(id: number) {
  return requestClient.get<WarningCenterApi.WarningRecord>(`${BASE}/warnings/${id}`);
}

/** 手动触发预警扫描 */
export function scanWarnings() {
  return requestClient.post<{ code: number; data: WarningCenterApi.ScanResult; message: string }>(`${BASE}/warnings/scan`);
}

/** 手动触发预警升级检查（v1.1新增） */
export function checkEscalation() {
  return requestClient.post<{ code: number; data: WarningCenterApi.EscalationResult; message: string }>(`${BASE}/warnings/escalate`);
}

/** 模块二: 整改任务中心 */

/** 任务列表 */
export function getTasks(params?: {
  status?: string;
  priority?: string;
  responsible_id?: number;
  org_id?: number;
  warning_id?: number;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<WarningCenterApi.TaskListResponse>(`${BASE}/tasks`, { params });
}

/** 任务详情 */
export function getTaskDetail(id: number) {
  return requestClient.get<WarningCenterApi.WarningTask>(`${BASE}/tasks/${id}`);
}

/** 创建任务 */
export function createTask(data: WarningCenterApi.CreateTaskRequest) {
  return requestClient.post<WarningCenterApi.WarningTask>(`${BASE}/tasks`, data);
}

/** 下发任务 */
export function dispatchTask(id: number) {
  return requestClient.put<WarningCenterApi.WarningTask>(`${BASE}/tasks/${id}/dispatch`);
}

/** 开始处理 */
export function processTask(id: number) {
  return requestClient.put<WarningCenterApi.WarningTask>(`${BASE}/tasks/${id}/process`);
}

/** 提交整改证明 */
export function submitProof(id: number, data: WarningCenterApi.SubmitProofRequest) {
  return requestClient.put<WarningCenterApi.WarningTask>(`${BASE}/tasks/${id}/submit-proof`, data);
}

/** 复核 */
export function reviewTask(id: number, data: WarningCenterApi.ReviewRequest) {
  return requestClient.put<WarningCenterApi.WarningTask>(`${BASE}/tasks/${id}/review`, data);
}

/** 关闭任务 */
export function closeTask(id: number, close_note?: string) {
  return requestClient.put<WarningCenterApi.WarningTask>(`${BASE}/tasks/${id}/close`, { close_note });
}

/** 模块三: 整改闭环分析 */

/** 分析数据 */
export function getAnalysis(year?: number) {
  return requestClient.get<WarningCenterApi.AnalysisData>(`${BASE}/analysis`, { params: { year } });
}

/** 模块四: 预警规则管理 */

/** 规则列表 */
export function getRules(params?: {
  source_type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<WarningCenterApi.RuleListResponse>(`${BASE}/rules`, { params });
}

/** 规则详情 */
export function getRuleDetail(id: number) {
  return requestClient.get<WarningCenterApi.WarningRule>(`${BASE}/rules/${id}`);
}

/** 创建规则 */
export function createRule(data: WarningCenterApi.CreateRuleRequest) {
  return requestClient.post<WarningCenterApi.WarningRule>(`${BASE}/rules`, data);
}

/** 更新规则 */
export function updateRule(id: number, data: WarningCenterApi.UpdateRuleRequest) {
  return requestClient.put<WarningCenterApi.WarningRule>(`${BASE}/rules/${id}`, data);
}

/** 启停规则 */
export function toggleRule(id: number) {
  return requestClient.put<WarningCenterApi.WarningRule>(`${BASE}/rules/${id}/toggle`);
}

/** 规则版本列表 */
export function getRuleVersions(ruleId: number) {
  return requestClient.get<WarningCenterApi.RuleVersion[]>(`${BASE}/rules/versions`, { params: { rule_id: ruleId } });
}

// ===== Sprint7-C: 整改效果验证 =====

/** 整改效果评价 */
export function evaluateTask(taskId: number, data?: { evaluation_note?: string }) {
  return requestClient.post<WarningCenterApi.EvaluationResult>(`${BASE}/tasks/${taskId}/evaluate`, data);
}

/** 获取整改效果评价 */
export function getTaskEvaluation(taskId: number) {
  return requestClient.get<WarningCenterApi.EvaluationResult | null>(`${BASE}/tasks/${taskId}/evaluation`);
}

/** 整改效果评价统计 */
export function getEvaluationStats(year?: number) {
  return requestClient.get<{ overall: WarningCenterApi.EvaluationStats }>(`${BASE}/evaluations/stats`, { params: { year } });
}

// ===== Sprint7-C: 预警调度管理 =====

/** 调度任务列表 */
export function getSchedulers(params?: {
  status?: string;
  scan_type?: string;
  page?: number;
  pageSize?: number;
}) {
  return requestClient.get<WarningCenterApi.SchedulerListResponse>(`${BASE}/schedulers`, { params });
}

/** 创建调度任务 */
export function createScheduler(data: WarningCenterApi.CreateSchedulerRequest) {
  return requestClient.post<WarningCenterApi.Scheduler>(`${BASE}/schedulers`, data);
}

/** 更新调度任务 */
export function updateScheduler(id: number, data: WarningCenterApi.UpdateSchedulerRequest) {
  return requestClient.put<WarningCenterApi.Scheduler>(`${BASE}/schedulers/${id}`, data);
}

/** 启停调度任务 */
export function toggleScheduler(id: number) {
  return requestClient.put<WarningCenterApi.Scheduler>(`${BASE}/schedulers/${id}/toggle`);
}

/** 手动执行调度任务 */
export function executeScheduler(id: number) {
  return requestClient.post<{ code: number; data: WarningCenterApi.ExecuteResult; message: string }>(`${BASE}/schedulers/${id}/execute`);
}
