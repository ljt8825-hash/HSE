import { requestClient } from '#/api/request';

export namespace InspectionApi {
  export interface InspectionRecord {
    id: number;
    title: string;
    type: 'routine' | 'special' | 'periodic' | 'temporary';
    area: string;
    inspector: string;
    inspectDate: string;
    status: 'pending' | 'completed' | 'issues_found';
    issuesCount: number;
    resolvedCount: number;
    score?: number;
    findings: string;
    remark?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface RectificationItem {
    id: number;
    inspectionId: number;
    inspectionTitle: string;
    issue: string;
    level: 'critical' | 'high' | 'medium' | 'low';
    status: 'pending' | 'processing' | 'completed' | 'overdue';
    responsiblePerson: string;
    deadline: string;
    completedAt?: string;
    measure: string;
    remark?: string;
    createdAt: string;
  }

  export interface InspectionListParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    type?: string;
    status?: string;
    area?: string;
    startDate?: string;
    endDate?: string;
  }

  export interface InspectionStats {
    totalInspections: number;
    completed: number;
    issuesFound: number;
    totalIssues: number;
    pendingRectification: number;
    overdue: number;
    avgScore: number;
  }
}

export async function getInspectionList(params: InspectionApi.InspectionListParams) {
  return requestClient.get<{ list: InspectionApi.InspectionRecord[]; total: number }>(
    '/site-mgmt',
    { params },
  );
}

export async function getInspectionStats() {
  return requestClient.get<InspectionApi.InspectionStats>('/site-mgmt/stats');
}

export async function getInspectionDetail(id: number) {
  return requestClient.get<InspectionApi.InspectionRecord>(`/site-mgmt/${id}`);
}

export async function createInspection(data: Partial<InspectionApi.InspectionRecord>) {
  return requestClient.post<InspectionApi.InspectionRecord>('/site-mgmt', data);
}

export async function updateInspection(id: number, data: Partial<InspectionApi.InspectionRecord>) {
  return requestClient.put<InspectionApi.InspectionRecord>(`/site-mgmt/${id}`, data);
}

export async function deleteInspection(id: number) {
  return requestClient.delete(`/site-mgmt/${id}`);
}

export async function getRectifications(inspectionId: number) {
  return requestClient.get<InspectionApi.RectificationItem[]>(
    `/site-mgmt/${inspectionId}/rectifications`,
  );
}
