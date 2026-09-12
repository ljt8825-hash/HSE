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

  /** 考核节点（由各模块生效方案推算的下一次统计节点） */
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

/** 方案列表（含 items 与模块 meta） */
export async function getAssessmentPlans(moduleCode?: string) {
  return requestClient.get<AssessmentPlanApi.PlanListResult>('/hse/todos/plans', {
    params: { moduleCode },
  });
}

/** 考核节点：各模块生效方案的下一次统计节点（供"我的待办"） */
export async function getTodoNodes() {
  return requestClient.get<AssessmentPlanApi.PlanNodeResult>('/hse/todos/plans/nodes');
}

/** 新建方案（后端固定保存为草稿） */
export async function createAssessmentPlan(payload: AssessmentPlanApi.PlanPayload) {
  return requestClient.post<AssessmentPlanApi.AssessmentPlan>('/hse/todos/plans', payload);
}

/** 更新草稿方案 */
export async function updateAssessmentPlan(id: number, payload: AssessmentPlanApi.PlanPayload) {
  return requestClient.put<AssessmentPlanApi.AssessmentPlan>(`/hse/todos/plans/${id}`, payload);
}

/** 切换生效（同模块旧 active 自动归档） */
export async function activateAssessmentPlan(id: number) {
  return requestClient.post(`/hse/todos/plans/${id}/activate`);
}

/** 删除草稿方案 */
export async function deleteAssessmentPlan(id: number) {
  return requestClient.delete(`/hse/todos/plans/${id}`);
}
