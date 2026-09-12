import { requestClient } from '#/api/request';

export namespace AlertsApi {
  export interface AlertItem {
    id: number;
    title: string;
    description: string;
    level: 'critical' | 'high' | 'medium' | 'low' | 'info';
    status: 'new' | 'processing' | 'resolved';
    source: string;
    sourceId: string;
    location?: string;
    occurredAt: string;
    resolvedAt?: string;
    handler?: string;
    remark?: string;
  }

  export interface AlertListParams {
    page?: number;
    pageSize?: number;
    level?: string;
    status?: string;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  }

  export interface AlertListResult {
    list: AlertItem[];
    total: number;
  }

  export interface AlertStats {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    newCount: number;
    processingCount: number;
    resolvedCount: number;
  }

  export interface BatchResolveParams {
    ids: number[];
    remark?: string;
    handler?: string;
  }
}

export async function getAlertList(params: AlertsApi.AlertListParams) {
  return requestClient.get<AlertsApi.AlertListResult>('/hse/alerts', { params });
}

export async function getAlertStats() {
  return requestClient.get<AlertsApi.AlertStats>('/hse/alerts/stats');
}

export async function getAlertDetail(id: number) {
  return requestClient.get<AlertsApi.AlertItem>(`/hse/alerts/${id}`);
}

export async function resolveAlert(id: number, data: { remark?: string; handler?: string }) {
  return requestClient.put(`/hse/alerts/${id}/resolve`, data);
}

export async function batchResolveAlerts(params: AlertsApi.BatchResolveParams) {
  return requestClient.put('/hse/alerts/batch-resolve', params);
}

export async function exportAlerts(params: AlertsApi.AlertListParams) {
  return requestClient.get('/hse/alerts/export', { params, responseType: 'blob' });
}
