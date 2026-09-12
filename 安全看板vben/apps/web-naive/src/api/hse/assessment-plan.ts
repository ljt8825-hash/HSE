/**
 * 考核计划 API（web-naive）
 *
 * 对应后端路由: /hse/todos/plans
 */
import { requestClient } from '#/api/request';

export namespace AssessmentPlanApi {
  export type FreqType = 'half-month' | 'month' | 'quarter';
  export type PlanStatus = 'active' | 'draft' | 'expired';

  export interface PlanItem {
    id?: number;
    itemName: string;
    weight: number;
  }

  export interface AssessmentPlan {
    id: number;
    moduleCode: string;
    versionNo: string;
    name: string;
    periodStart: string;
    periodEnd: string;
    freqType: FreqType;
    statDay: string;
    status: PlanStatus;
    updatedAt: string;
    items: PlanItem[];
  }

  export interface ModuleDef {
    code: string;
    name: string;
  }

  export interface PlanListResult {
    list: AssessmentPlan[];
    meta: { modules: ModuleDef[] };
  }

  export interface PlanPayload {
    moduleCode: string;
    name: string;
    periodStart: string;
    periodEnd: string;
    freqType: FreqType;
    statDay: string;
    items: { itemName: string; weight: number }[];
  }

  /** 考核节点 */
  export interface PlanNode {
    planId: number;
    moduleCode: string;
    moduleName: string;
    planName: string;
    freqType: FreqType;
    statDay: string;
    nodeDate: string;
    dueLabel: string;
    daysLeft: number;
    status: 'pending' | 'due';
  }

  export interface PlanNodeResult {
    list: PlanNode[];
    summary: { total: number; due: number };
  }
}

const BASE = '/hse/todos/plans';

/** 获取方案列表 */
export async function getAssessmentPlans(moduleCode?: string) {
  return requestClient.get<AssessmentPlanApi.PlanListResult>(BASE, { params: { moduleCode } });
}

/** 获取考核节点 */
export async function getTodoNodes() {
  return requestClient.get<AssessmentPlanApi.PlanNodeResult>(`${BASE}/nodes`);
}

/** 新建方案（草稿） */
export async function createAssessmentPlan(payload: AssessmentPlanApi.PlanPayload) {
  return requestClient.post<AssessmentPlanApi.AssessmentPlan>(BASE, payload);
}

/** 更新草稿方案 */
export async function updateAssessmentPlan(
  id: number,
  payload: AssessmentPlanApi.PlanPayload,
) {
  return requestClient.put<AssessmentPlanApi.AssessmentPlan>(`${BASE}/${id}`, payload);
}

/** 切换生效 */
export async function activateAssessmentPlan(id: number) {
  return requestClient.post(`${BASE}/${id}/activate`);
}

/** 删除草稿方案 */
export async function deleteAssessmentPlan(id: number) {
  return requestClient.delete(`${BASE}/${id}`);
}
