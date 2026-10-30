/**
 * 安全生产费用业务域 API 适配层（web-naive）
 * 契约：server/routes/cost/main.js（/api/cost）
 */
import { requestClient } from '#/api/request';

export namespace CostApi {
  /** 预算概览（含由交易表计算的财务状态） */
  export interface BudgetOverviewItem {
    budgetId: number;
    budgetCode: string | null;
    budgetYear: number;
    projectName: string;
    itemName: string;
    category: string | null;
    department: string | null;
    status: string;
    budgetAmount: number;
    committed: number;
    pendingCommitted: number;
    actual: number;
    balance: number;
    availableUncommitted: number;
    commitmentRate: number;
    executionRate: number;
  }

  export interface BudgetOverviewParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    budgetYear?: number;
    status?: string;
  }

  export interface CostStats {
    totalActual: number;
    allocatedTotal: number;
    unattributedActual: number;
    byDomain: Array<{ bizDomain: string; amount: number }>;
    byCategory: Array<{ investCategory: string; amount: number }>;
  }

  /** 预算导入预览：单行结果 */
  export interface BudgetImportPreviewRow {
    rowIndex: number;
    data: Record<string, any>;
    errors: string[];
    duplicate: boolean;
    duplicateReason?: string;
    status: 'ok' | 'error' | 'duplicate';
  }

  export interface BudgetImportPreviewResult {
    /** 导入批次号：确认时必须带回，且文件指纹须与预览一致（防「预览A确认B」） */
    batchNo: string;
    total: number;
    errorCount: number;
    duplicateCount: number;
    /** 同一文件（指纹相同）此前已成功导入过 → 提示重复导入 */
    alreadyImported: boolean;
    previousBatchNo?: string | null;
    rows: BudgetImportPreviewRow[];
  }

  export interface BudgetImportConfirmResult {
    batchNo: string;
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    /** 同一批次重复确认时为 true（直接返回首次结果，不会重复插入） */
    duplicateConfirm?: boolean;
    errors?: string[];
  }

  export interface CostRequestItem {
    id: number;
    requestNo: string;
    budgetId?: number | null;
    title: string;
    sourceType?: string | null;
    sourceId?: number | null;
    applicantName?: string | null;
    applyAmount: number;
    status: string;
    approvedAmount?: number | null;
    createdAt?: string;
  }

  export interface CostRequestParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    sourceType?: string;
    budgetId?: number;
  }

  export interface ReferenceOption {
    id: number;
    code: string;
    name: string;
  }

  export interface CostRequestCreate {
    budgetId?: number | null;
    title: string;
    sourceType?: string | null;
    sourceId?: number | null;
    applicantName?: string | null;
    applyAmount: number;
    purpose?: string | null;
    allocations?: Array<{
      bizDomainId?: number | null;
      opTypeId?: number | null;
      investCategoryId?: number | null;
      objectType?: string | null;
      objectName?: string | null;
      eventType?: string | null;
      eventId?: number | null;
      amount?: number | null;
    }>;
  }

  /** 成本分摊（归因）记录 —— 契约：server/routes/cost/main.js /allocations */
  export interface AllocationItem {
    id: number;
    costActualId: number | null;
    requestId: number | null;
    company: string | null;
    bizDomainId: number | null;
    opTypeId: number | null;
    investCategoryId: number | null;
    objectType: string | null;
    objectId: number | null;
    objectName: string | null;
    eventType: string | null;
    eventId: number | null;
    eventName: string | null;
    amount: number;
    recordType: string;
    remark: string | null;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface AllocationParams {
    page?: number;
    pageSize?: number;
    costActualId?: number;
    requestId?: number;
    bizDomainId?: number;
  }

  /**
   * 新增分摊：costActualId + amount 为后端必填（costService.allocationCreate）。
   * request_id 由服务端取「实际支出上的值」（防伪造错挂），不接受前端传入。
   * 后端强制：追加后有效分摊净额必须恰好等于实际支出净额（不足/超额均拒绝）。
   */
  export interface AllocationCreate {
    costActualId: number;
    amount: number;
    bizDomainId?: number | null;
    opTypeId?: number | null;
    investCategoryId?: number | null;
    objectType?: string | null;
    objectName?: string | null;
    remark?: string | null;
  }

  /** 修改分摊：金额可选；后端事务内重算总额一致性，拒绝时原值保持 */
  export interface AllocationUpdate {
    amount?: number;
    bizDomainId?: number | null;
    opTypeId?: number | null;
    investCategoryId?: number | null;
    objectType?: string | null;
    objectName?: string | null;
    remark?: string | null;
  }

  /** 实际支出（分摊的关联对象）—— 契约：/actuals */
  export interface CostActualItem {
    id: number;
    requestId: number | null;
    commitmentId: number | null;
    budgetId: number | null;
    actualAmount: number;
    actualDate: string | null;
    fiscalMonth: string | null;
    paymentMethod: string | null;
    invoiceNo: string | null;
    payee: string | null;
    recordType: string;
    remark: string | null;
  }
}

export function getBudgetOverview(params: CostApi.BudgetOverviewParams) {
  return requestClient.get<{ list: CostApi.BudgetOverviewItem[]; total: number }>('/cost/budgets', { params });
}

export function getCostStats(params?: { budgetYear?: number; sourceType?: string }) {
  return requestClient.get<CostApi.CostStats>('/cost/budgets/stats', { params });
}

export function getBudgetFinancials(budgetId: number) {
  return requestClient.get<CostApi.BudgetOverviewItem>(`/cost/budgets/${budgetId}/financials`);
}

export function getCostRequests(params: CostApi.CostRequestParams) {
  return requestClient.get<{ list: CostApi.CostRequestItem[]; total: number }>('/cost/requests', { params });
}

export function createCostRequest(data: CostApi.CostRequestCreate) {
  return requestClient.post<CostApi.CostRequestItem>('/cost/requests', data);
}

export function updateCostRequest(id: number, data: Partial<CostApi.CostRequestCreate> & { status?: string }) {
  return requestClient.put<CostApi.CostRequestItem>(`/cost/requests/${id}`, data);
}

export function deleteCostRequest(id: number) {
  return requestClient.delete(`/cost/requests/${id}`);
}

export function getBizDomains() {
  return requestClient.get<CostApi.ReferenceOption[]>('/cost/reference/biz-domains');
}

export function getOpTypes(bizDomainId?: number) {
  return requestClient.get<CostApi.ReferenceOption[]>('/cost/reference/op-types', { params: { bizDomainId } });
}

export function getInvestCategories() {
  return requestClient.get<CostApi.ReferenceOption[]>('/cost/reference/invest-categories');
}

/** 预算 Excel 导入：预览（上传文件→识别字段/总数/错误/重复，返回批次号） */
export function previewBudgetImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<CostApi.BudgetImportPreviewResult>('/cost/budgets/import-preview', formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

/**
 * 预算 Excel 导入：确认（再次上传同一文件 + 预览返回的 batchNo → 正式写入）。
 * 服务端会核对文件指纹与预览一致；不一致（文件被替换）将拒绝并要求重新预览。
 */
export function confirmBudgetImport(file: File, batchNo: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('batchNo', batchNo);
  return requestClient.post<CostApi.BudgetImportConfirmResult>('/cost/budgets/import', formData, {
    headers: { 'Content-Type': undefined as any },
  });
}

// ===================== 成本分摊（归因） =====================

/** 分摊列表（可按实际支出/费用申请/业务领域过滤；仅返回未删除记录） */
export function getAllocations(params: CostApi.AllocationParams) {
  return requestClient.get<{ list: CostApi.AllocationItem[]; total: number }>('/cost/allocations', { params });
}

/**
 * 新增分摊：必须关联实际支出(costActualId)。后端为最终裁判——
 * 事务内锁定实际支出，强制「追加后有效分摊净额 == 实际支出净额」，
 * 不足/超额一律拒绝（HTTP 200 + body code<0 + 可读 message）。
 */
export function createAllocation(data: CostApi.AllocationCreate) {
  return requestClient.post<CostApi.AllocationItem>('/cost/allocations', data);
}

/** 修改分摊：后端重算总额一致性；被拒时事务回滚、原值保持 */
export function updateAllocation(id: number, data: CostApi.AllocationUpdate) {
  return requestClient.put<CostApi.AllocationItem>(`/cost/allocations/${id}`, data);
}

/** 删除分摊（软删除）：计划归因可删；已参与实际归因的后端拒绝 */
export function deleteAllocation(id: number) {
  return requestClient.delete(`/cost/allocations/${id}`);
}

// ===================== 实际支出（分摊表单上下文） =====================

/** 实际支出列表：分摊新增时选择关联对象（pageSize 上限 200） */
export function getCostActuals(params: { page?: number; pageSize?: number; requestId?: number } = {}) {
  return requestClient.get<{ list: CostApi.CostActualItem[]; total: number }>('/cost/actuals', { params });
}
