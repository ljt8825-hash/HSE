/**
 * 告警中心 API（web-naive）
 *
 * 对应后端路由前缀: /hse/alerts
 * requestClient baseURL = /api，完整请求路径为 /api/hse/alerts/...
 */
import { requestClient } from '#/api/request';

export namespace AlertsApi {
  /** 告警级别 */
  export type AlertLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** 告警状态 */
  export type AlertStatus = 'new' | 'processing' | 'resolved';

  export interface AlertItem {
    id: number;
    title: string;
    description: string;
    level: AlertLevel;
    status: AlertStatus;
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

/** 告警列表 */
export async function getAlertList(params: AlertsApi.AlertListParams) {
  return requestClient.get<AlertsApi.AlertListResult>('/hse/alerts', { params });
}

/** 告警统计 */
export async function getAlertStats() {
  return requestClient.get<AlertsApi.AlertStats>('/hse/alerts/stats');
}

/** 告警详情 */
export async function getAlertDetail(id: number) {
  return requestClient.get<AlertsApi.AlertItem>(`/hse/alerts/${id}`);
}

/** 处置单条告警 */
export async function resolveAlert(
  id: number,
  data: { remark?: string; handler?: string },
) {
  return requestClient.put(`/hse/alerts/${id}/resolve`, data);
}

/** 批量处置告警 */
export async function batchResolveAlerts(params: AlertsApi.BatchResolveParams) {
  return requestClient.put('/hse/alerts/batch-resolve', params);
}

/**
 * 导出告警列表（CSV）。
 * 使用 requestClient.download() 正确返回 Blob，调用方需使用 async/await。
 */
export async function exportAlerts(params?: AlertsApi.AlertListParams) {
  return requestClient.download('/hse/alerts/export', { params });
}
