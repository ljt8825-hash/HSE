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
    actual: number;
    balance: number;
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
    byDomain: Array<{ bizDomain: string; amount: number }>;
    byCategory: Array<{ investCategory: string; amount: number }>;
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
