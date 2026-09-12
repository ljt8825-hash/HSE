/**
 * 工作流引擎 API（web-naive）
 *
 * 对应后端路由: /hse/workflow
 */
import { requestClient } from '#/api/request';

export namespace WorkflowApi {
  export interface WorkflowDefinition {
    id: number;
    code: string;
    name: string;
    description?: string;
    definition?: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: string;
    createdBy?: string;
  }

  export interface WorkflowInstance {
    id: number;
    workflowId: number;
    workflowName: string;
    businessKey: string;
    businessType: string;
    status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled';
    currentNode?: string;
    initiator: string;
    startedAt: string;
    endedAt?: string;
  }

  export interface WorkflowTask {
    id: number;
    instanceId: number;
    nodeName: string;
    assignee?: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    approvedAt?: string;
    remark?: string;
  }

  export interface DefinitionListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }

  export interface InstanceListParams {
    page?: number;
    pageSize?: number;
    status?: string;
    workflowId?: number;
    initiator?: string;
  }

  export interface TaskListParams {
    page?: number;
    pageSize?: number;
    status?: string;
    assignee?: string;
  }

  export interface ApproveTaskParams {
    taskId: number;
    remark?: string;
  }
}

export async function getWorkflowDefinitions(params?: WorkflowApi.DefinitionListParams) {
  return requestClient.get<{ list: WorkflowApi.WorkflowDefinition[]; total: number }>(
    '/hse/workflow/definitions',
    { params },
  );
}

export async function getWorkflowInstances(params?: WorkflowApi.InstanceListParams) {
  return requestClient.get<{ list: WorkflowApi.WorkflowInstance[]; total: number }>(
    '/hse/workflow/instances',
    { params },
  );
}

export async function getWorkflowTasks(params?: WorkflowApi.TaskListParams) {
  return requestClient.get<{ list: WorkflowApi.WorkflowTask[]; total: number }>(
    '/hse/workflow/tasks',
    { params },
  );
}

export async function approveTask(data: WorkflowApi.ApproveTaskParams) {
  return requestClient.post(`/hse/workflow/tasks/${data.taskId}/action`, {
    action: 'approve',
    remark: data.remark,
  });
}

export async function rejectTask(data: WorkflowApi.ApproveTaskParams) {
  return requestClient.post(`/hse/workflow/tasks/${data.taskId}/action`, {
    action: 'reject',
    remark: data.remark,
  });
}

export async function getTaskHistory(instanceId: number) {
  return requestClient.get<WorkflowApi.WorkflowTask[]>(
    `/hse/workflow/instances/${instanceId}/history`,
  );
}
