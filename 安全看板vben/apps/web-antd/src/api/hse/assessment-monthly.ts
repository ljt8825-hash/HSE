/**
 * HSE月度安全履职考核 API - Sprint10-D-2-1
 * 对应后端路由: server/routes/hse-assessment-monthly.js
 * 路由前缀: /hse/assessment-monthly
 * 模型版本: v1.0
 */

import { requestClient } from '#/api/request';

const BASE = '/hse/assessment-monthly';

export namespace AssessmentMonthlyApi {
  /** 考核周期 */
  export interface AssessmentCycle {
    id: number;
    cycleCode: string;
    cycleName: string;
    assessmentYear: number;
    assessmentMonth: number;
    startTime: string;
    endTime: string;
    status: 'not_started' | 'in_progress' | 'pending_review' | 'reviewed' | 'frozen';
    targetCount: number;
    scoredCount: number;
    reviewedCount: number;
    frozenCount: number;
    createdBy: number;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
    remark?: string;
  }

  /** 考核对象 */
  export interface AssessmentTarget {
    id: number;
    cycleId: number;
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    position: string;
    township: string;
    department: string;
    status: 'pending' | 'scored' | 'reviewed' | 'frozen';
    reviewStatus: 'pending' | 'approved' | 'rejected';
    scoreAuto: number;
    scoreManual: number;
    scoreTotal: number;
    grade: string;
    rankTownship: number;
    rankAll: number;
    currentVersion: number;
    createdAt: string;
    updatedAt: string;
  }

  /** 考核指标 */
  export interface AssessmentMetric {
    id: number;
    metric_code: string;
    metric_name: string;
    category: string;
    target_post: string;
    base_score: number;
    scoring_rule: string;
    data_source: string;
    sort_order: number;
    status: string;
  }

  /** 扣分明细 */
  export interface DeductionItem {
    id: number;
    cycleId: number;
    targetId: number;
    metricId: number;
    /** 考核对象姓名/编码（列表接口联动 t.employee_name / t.employee_code） */
    employeeName?: string;
    employeeCode?: string;
    deductionType: string;
    deductionItem: string;
    ruleCode: string;
    ruleVersion: string;
    suggestedScore: number;
    confirmedScore: number | null;
    reviewStatus: 'pending' | 'approved' | 'rejected' | 'adjusted';
    deductionSource?: string;
    /** 溯源明细（网格未巡查等通路：kind/deductKey/summary/expected/actual/missing） */
    sourceDetail?: {
      kind?: string;
      deductKey?: string;
      summary?: string;
      expected?: number;
      actual?: number;
      missing?: number;
      [key: string]: unknown;
    };
    /** 考核对象状态（frozen 时不可解锁/调整） */
    targetStatus?: string;
    evidence: string;
    currentVersion: number;
    createdAt: string;
    updatedAt: string;
    remark?: string;
  }

  /** 扣分调整记录 */
  export interface DeductionAdjustment {
    id: number;
    deductionId: number;
    targetId: number;
    versionNo: number;
    oldScore: number;
    newScore: number;
    operationType: string;
    adjustmentReason: string;
    adjustedBy: number;
    adjustedByName: string;
    adjustedAt: string;
    isCurrent: boolean;
  }

  /** 评分记录 */
  export interface AssessmentScore {
    id: number;
    target_id: number;
    metric_id: number;
    base_score: number;
    deduction_score: number;
    final_score: number;
    scoring_method: string;
    version_no: number;
  }

  /** 分页结果 */
  export interface PageResult<T> {
    list: T[];
    total: number;
    page: number;
    page_size: number;
  }

  /** 考核结果详情 */
  export interface ResultDetail {
    target: AssessmentTarget;
    scores: AssessmentScore[];
    deductions: DeductionItem[];
  }

  /** 评分进度 */
  export interface ScoringProgress {
    cycleId: number;
    totalTargets: number;
    scoredCount: number;
    reviewedCount: number;
    frozenCount: number;
    progressPercent: number;
    cycleStatus: string;
  }

  /** 健康检查 */
  export interface HealthData {
    status: string;
    module: string;
    version: string;
    database: string;
    timestamp: string;
  }
}

/** 健康检查 */
export function getAssessmentHealth() {
  return requestClient.get<AssessmentMonthlyApi.HealthData>(`${BASE}/health`);
}

// ==================== 考核周期 ====================

/** 创建考核周期 */
export function createAssessmentCycle(data: {
  assessment_year: number;
  assessment_month: number;
  cycle_name?: string;
  remark?: string;
}) {
  return requestClient.post<AssessmentMonthlyApi.AssessmentCycle>(`${BASE}/cycles`, data);
}

/** 查询考核周期列表 */
export function getAssessmentCycleList(params: {
  page?: number;
  page_size?: number;
  status?: string;
  year?: number;
  month?: number;
  sort_by?: string;
  sort_order?: string;
}) {
  return requestClient.get<AssessmentMonthlyApi.PageResult<AssessmentMonthlyApi.AssessmentCycle>>(
    `${BASE}/cycles`,
    { params },
  );
}

/** 获取考核周期详情 */
export function getAssessmentCycle(cycleId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.AssessmentCycle>(`${BASE}/cycles/${cycleId}`);
}

/** 更新考核周期 */
export function updateAssessmentCycle(
  cycleId: number | string,
  data: { cycle_name?: string; remark?: string; status?: string },
) {
  return requestClient.put<AssessmentMonthlyApi.AssessmentCycle>(`${BASE}/cycles/${cycleId}`, data);
}

/** 删除考核周期 */
export function deleteAssessmentCycle(cycleId: number | string) {
  return requestClient.delete<void>(`${BASE}/cycles/${cycleId}`);
}

/** 启动考核周期 */
export function startAssessmentCycle(cycleId: number | string) {
  return requestClient.post<{
    cycle_id: number;
    status: string;
    target_count: number;
  }>(`${BASE}/cycles/${cycleId}/start`);
}

// ==================== 考核对象 ====================

/** 查询考核对象列表 */
export function getAssessmentTargetList(
  cycleId: number | string,
  params: {
    page?: number;
    page_size?: number;
    township?: string;
    position?: string;
    status?: string;
    keyword?: string;
    sort_by?: string;
    sort_order?: string;
  },
) {
  return requestClient.get<AssessmentMonthlyApi.PageResult<AssessmentMonthlyApi.AssessmentTarget>>(
    `${BASE}/cycles/${cycleId}/targets`,
    { params },
  );
}

/** 获取考核对象详情 */
export function getAssessmentTarget(targetId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.AssessmentTarget>(`${BASE}/targets/${targetId}`);
}

/** 添加考核对象 */
export function addAssessmentTargets(cycleId: number | string, employee_ids: number[]) {
  return requestClient.post<{ added: number; total: number }>(`${BASE}/cycles/${cycleId}/targets`, {
    employee_ids,
  });
}

/** 移除考核对象 */
export function removeAssessmentTarget(targetId: number | string) {
  return requestClient.delete<void>(`${BASE}/targets/${targetId}`);
}

/** 同步考核对象 */
export function syncAssessmentTargets(cycleId: number | string) {
  return requestClient.post<{ added: number; removed: number; total: number }>(
    `${BASE}/cycles/${cycleId}/targets/sync`,
  );
}

// ==================== 考核指标 ====================

/** 查询指标列表 */
export function getMetricList(params?: { category?: string; target_post?: string; status?: string }) {
  return requestClient.get<AssessmentMonthlyApi.PageResult<AssessmentMonthlyApi.AssessmentMetric>>(
    `${BASE}/metrics`,
    { params },
  );
}

/** 获取指标详情 */
export function getMetric(metricId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.AssessmentMetric>(`${BASE}/metrics/${metricId}`);
}

// ==================== 自动评分 ====================

/** 执行自动评分 */
export function executeScoring(cycle_id: number | string) {
  return requestClient.post<{
    cycle_id: number | string;
    scored_count: number;
    status: string;
    message: string;
  }>(`${BASE}/scoring/execute`, { cycle_id });
}

/** 查询评分进度 */
export function getScoringProgress(cycleId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.ScoringProgress>(`${BASE}/scoring/progress/${cycleId}`);
}

// ==================== 扣分审核 ====================

/** 查询扣分明细列表 */
export function getDeductionList(params: {
  page?: number;
  page_size?: number;
  cycle_id?: number | string;
  target_id?: number | string;
  review_status?: string;
  deduction_type?: string;
}) {
  return requestClient.get<AssessmentMonthlyApi.PageResult<AssessmentMonthlyApi.DeductionItem>>(
    `${BASE}/deductions`,
    { params },
  );
}

/** 审核扣分明细（通过） */
export function reviewDeduction(data: {
  deduction_id: number | string;
  confirmed_score?: number;
  review_comment?: string;
}) {
  return requestClient.post<void>(`${BASE}/deductions/review/approve`, data);
}

/** 驳回扣分明细 */
export function rejectDeduction(data: { deduction_id: number | string; reject_reason: string }) {
  return requestClient.post<void>(`${BASE}/deductions/review/reject`, data);
}

/** 批量审核通过（原子事务，按目标去重重算分数） */
export function batchApproveDeductions(data: { deduction_ids: (number | string)[] }) {
  return requestClient.post<{ approved: number; skipped: number; total: number; message: string }>(
    `${BASE}/deductions/batch-approve`,
    data,
  );
}

// ==================== 扣分调整 ====================

/** 新增扣分调整 */
export function adjustDeduction(data: {
  deduction_id: number | string;
  new_score: number;
  adjustment_reason: string;
}) {
  return requestClient.post<AssessmentMonthlyApi.DeductionAdjustment>(`${BASE}/deductions/adjust`, data);
}

/** 查询扣分调整历史 */
export function getDeductionAdjustments(deductionId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.PageResult<AssessmentMonthlyApi.DeductionAdjustment>>(
    `${BASE}/deductions/${deductionId}/adjustments`,
  );
}

/** 恢复自动计算（解锁）：仅已锁定（approved/adjusted）的「网格未巡查」自动明细 */
export function unlockDeduction(deductionId: number | string) {
  return requestClient.post<void>(`${BASE}/deductions/${deductionId}/unlock`, {});
}

// ==================== 冻结 ====================

/** 冻结考核周期 */
export function freezeAssessmentCycle(cycleId: number | string) {
  return requestClient.post<{
    cycle_id: number;
    status: string;
    frozen_count: number;
  }>(`${BASE}/freeze/cycle/${cycleId}`);
}

/** 解冻考核周期 */
export function unfreezeAssessmentCycle(data: {
  cycle_id: number | string;
  unfreeze_reason: string;
}) {
  return requestClient.post<{ cycle_id: number | string; status: string }>(
    `${BASE}/freeze/unfreeze`,
    data,
  );
}

// ==================== 结果查询 ====================

/** 查询考核结果列表 */
export function getAssessmentResultList(params: {
  page?: number;
  page_size?: number;
  cycle_id?: number | string;
  township?: string;
  position?: string;
  grade?: string;
  sort_by?: string;
  sort_order?: string;
}) {
  return requestClient.get<AssessmentMonthlyApi.PageResult<AssessmentMonthlyApi.AssessmentTarget>>(
    `${BASE}/results`,
    { params },
  );
}

/** 获取考核结果详情 */
export function getAssessmentResultDetail(targetId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.ResultDetail>(`${BASE}/results/${targetId}`);
}

// ==================== Excel导入导出 ====================

/** 导出考核结果 */
export function exportAssessmentResults(cycleId: number | string) {
  return requestClient.get<{
    cycle: AssessmentMonthlyApi.AssessmentCycle;
    total: number;
    data: AssessmentMonthlyApi.AssessmentTarget[];
    message: string;
  }>(`${BASE}/export/results/${cycleId}`);
}

/** 导入扣分明细 */
export function importDeductions(data: {
  cycle_id: number | string;
  items: any[];
}) {
  return requestClient.post<{ imported: number; failed: number; total: number; message: string }>(
    `${BASE}/import/deductions`,
    data,
  );
}
