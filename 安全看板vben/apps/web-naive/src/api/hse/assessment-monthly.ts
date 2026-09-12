/**
 * HSE 月度安全履职考核 API 适配层（web-naive · 阶段06B-3）
 * 契约来源：apps/web-antd/src/api/hse/assessment-monthly.ts（唯一契约来源，逐项保持
 *           URL / 方法 / 参数键名（下划线：page_size/sort_by/sort_order/cycle_id/...）/
 *           路径参数位置 / 响应结构与命名空间 AssessmentMonthlyApi 全量类型）。
 * 本模块全部使用 requestClient（JSON），不存在 Blob 下载或 multipart 上传，
 * 不得误用 baseRequestClient。不得更改服务端契约。
 */
import { requestClient } from '#/api/request';

const BASE = '/hse/assessment-monthly';

export namespace AssessmentMonthlyApi {
  /** 考核周期（响应字段为后端 camelCase 风格） */
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

  /** 考核对象（响应字段为后端 camelCase 风格） */
  export interface AssessmentTarget {
    id: number;
    cycleId: number;
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    position: string;
    township: string;
    department: string;
    gridLevel?: string;
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
    /** 各「类别扣分上限」类别在周期内的有效扣分合计，如 { 消防管理: 2 } */
    categoryDeductions?: Record<string, number>;
  }

  /** 考核对象扣分明细（自动评分「查看」用；细化到规则名称） */
  export interface TargetDeduction {
    id: number;
    deductionItem: string;
    deductionType: string;
    deductionSource: string;
    category: string | null;
    ruleName: string | null;
    suggestedScore: number;
    confirmedScore: number | null;
    reviewStatus: string;
    violationDate: string | null;
    createdAt: string | null;
    sourceTable: string | null;
    summary?: string | null;
  }

  /** 考核对象扣分明细响应 */
  export interface TargetDeductionResult {
    cycleId: number;
    targetId: number;
    employeeName: string | null;
    gridLevel: string | null;
    list: TargetDeduction[];
  }

  /** 考核指标 */
  export interface AssessmentMetric {
    id: number;
    metricCode: string;
    metricName: string;
    category: string;
    targetPost: string;
    baseScore: number;
    scoringRule: string;
    dataSource: string;
    sortOrder: number;
    status: string;
  }

  /** 扣分明细（响应字段为后端 camelCase 风格） */
  export interface DeductionItem {
    id: number;
    cycleId: number;
    targetId: number;
    metricId: number;
    deductionType: string;
    deductionItem: string;
    ruleCode: string;
    ruleVersion: string;
    suggestedScore: number;
    confirmedScore: number | null;
    reviewStatus: 'pending' | 'approved' | 'rejected' | 'adjusted';
    evidence: string;
    currentVersion: number;
    createdAt: string;
    updatedAt: string;
    remark?: string;
    /** 扣分来源：auto/auto_deduction/manual/import/chain_transmission */
    deductionSource?: string;
    sourceTable?: string | null;
    /** 溯源明细（网格未巡查等通路携带 kind/deductKey/summary 等） */
    sourceDetail?: {
      kind?: string;
      deductKey?: string;
      ruleName?: string;
      category?: string;
      summary?: string;
      expected?: number;
      actual?: number;
      missing?: number;
      [key: string]: any;
    } | null;
    employeeName?: string | null;
    violatorName?: string | null;
    category?: string | null;
    /** 考核对象状态：frozen 表示已冻结，冻结对象不提供「恢复自动」入口 */
    targetStatus?: string;
  }

  /** 扣分调整记录（响应字段为后端 camelCase 风格） */
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

  /** 评分记录（响应字段为后端 camelCase 风格） */
  export interface AssessmentScore {
    id: number;
    targetId: number;
    metricId: number;
    baseScore: number;
    deductionScore: number;
    finalScore: number;
    scoringMethod: string;
    versionNo: number;
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

  /** 评分进度（响应字段为后端 camelCase 风格） */
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

  /** 考核标准（响应字段为后端 camelCase 风格） */
  export interface AssessmentStandard {
    id: number;
    position: string;
    positionName: string;
    category: string;
    itemName: string;
    deductionRule: string;
    deductionScore: number | null;
    ruleType: 'deduction' | 'bonus' | 'veto';
    remark: string;
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }

  /** 考核标准分组（按岗位） */
  export interface StandardGroup {
    position: string;
    positionName: string;
    items: AssessmentStandard[];
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

/** 自动生成考核周期 + 同步对象（幂等，缺省当月；周期已存在则跳过，返回 created=false） */
export function autoGenerateAssessmentCycle(data?: { year?: number; month?: number }) {
  return requestClient.post<{
    created: boolean;
    cycleId: number;
    synced: { inserted: number; removed: number };
    targetCount: number;
  }>(`${BASE}/cycles/auto-generate`, data ?? {});
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
    grid_level?: string;
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

/** 考核对象扣分明细（自动评分「查看」；细化到规则名称/类别） */
export function getTargetDeductionList(cycleId: number | string, targetId: number | string) {
  return requestClient.get<AssessmentMonthlyApi.TargetDeductionResult>(
    `${BASE}/cycles/${cycleId}/targets/${targetId}/deductions`,
  );
}

/** 导出自动评分扣分明细 xlsx（触发浏览器下载） */
export function exportScoringDeductions(cycleId: number | string) {
  return requestClient.download(`${BASE}/cycles/${cycleId}/export-scoring`);
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

/** 恢复自动计算（解锁人工锁定，仅网格未巡查自动明细） */
export function unlockDeduction(deductionId: number | string) {
  return requestClient.post<void>(`${BASE}/deductions/${deductionId}/unlock`);
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
  return requestClient.post<{
    imported: number;
    failed: number;
    total: number;
    message: string;
    /** 任务A：人工扣分上限提示（纯 advisory）——导入行超类别上限时的警示集合 */
    capWarnings?: Array<{
      row: number;
      employee?: string;
      category: string;
      cap: number;
      currentTotal: number;
      adding: number;
      wouldTotal: number;
    }>;
  }>(
    `${BASE}/import/deductions`,
    data,
  );
}

// ==================== 考核标准配置 ====================

/** 查询考核标准列表（按岗位分组） */
export function getStandardList(params?: {
  position?: string;
  keyword?: string;
  rule_type?: string;
}) {
  return requestClient.get<{ positions: AssessmentMonthlyApi.StandardGroup[]; total: number }>(
    `${BASE}/standards`,
    { params },
  );
}

/** 更新考核标准（可编辑扣分分值/标准/启用状态） */
export function updateStandard(
  id: number | string,
  data: {
    item_name?: string;
    deduction_rule?: string;
    deduction_score?: number;
    rule_type?: string;
    remark?: string;
    is_active?: boolean;
  },
) {
  return requestClient.put<AssessmentMonthlyApi.AssessmentStandard>(`${BASE}/standards/${id}`, data);
}
