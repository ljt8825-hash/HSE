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

  export interface StartWorkflowParams {
    workflowId: number;
    businessKey: string;
    businessType: string;
    formData?: Record<string, any>;
  }

  export interface ApproveTaskParams {
    taskId: number;
    remark?: string;
    formData?: Record<string, any>;
  }
}

export async function getWorkflowDefinitions(params: WorkflowApi.DefinitionListParams) {
  return requestClient.get<{ list: WorkflowApi.WorkflowDefinition[]; total: number }>(
    '/hse/workflow/definitions',
    { params },
  );
}

export async function getWorkflowDefinition(id: number) {
  return requestClient.get<WorkflowApi.WorkflowDefinition>(`/hse/workflow/definitions/${id}`);
}

export async function createWorkflowDefinition(data: Partial<WorkflowApi.WorkflowDefinition>) {
  return requestClient.post<WorkflowApi.WorkflowDefinition>('/hse/workflow/definitions', data);
}

export async function updateWorkflowDefinition(id: number, data: Partial<WorkflowApi.WorkflowDefinition>) {
  return requestClient.put<WorkflowApi.WorkflowDefinition>(`/hse/workflow/definitions/${id}`, data);
}

export async function deleteWorkflowDefinition(id: number) {
  return requestClient.delete(`/hse/workflow/definitions/${id}`);
}

export async function getWorkflowInstances(params: WorkflowApi.InstanceListParams) {
  return requestClient.get<{ list: WorkflowApi.WorkflowInstance[]; total: number }>(
    '/hse/workflow/instances',
    { params },
  );
}

export async function startWorkflow(data: WorkflowApi.StartWorkflowParams) {
  return requestClient.post<WorkflowApi.WorkflowInstance>('/hse/workflow/instances', data);
}

export async function getWorkflowTasks(params: WorkflowApi.TaskListParams) {
  return requestClient.get<{ list: WorkflowApi.WorkflowTask[]; total: number }>(
    '/hse/workflow/tasks',
    { params },
  );
}

export async function approveTask(data: WorkflowApi.ApproveTaskParams) {
  return requestClient.post(`/hse/workflow/tasks/${data.taskId}/action`, { action: 'approve', remark: data.remark });
}

export async function rejectTask(data: WorkflowApi.ApproveTaskParams) {
  return requestClient.post(`/hse/workflow/tasks/${data.taskId}/action`, { action: 'reject', remark: data.remark });
}

export async function getTaskHistory(instanceId: number) {
  return requestClient.get<WorkflowApi.WorkflowTask[]>(`/hse/workflow/instances/${instanceId}/history`);
}
