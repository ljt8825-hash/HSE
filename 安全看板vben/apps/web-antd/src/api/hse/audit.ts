import { requestClient } from '#/api/request';

export namespace AuditApi {
  export interface AuditLogItem {
    id: number;
    userId: number;
    username: string;
    action: string;
    module: string;
    description: string;
    ipAddress?: string;
    userAgent?: string;
    statusCode: number;
    detail?: Record<string, any>;
    createdAt: string;
  }

  export interface AuditLogParams {
    page?: number;
    pageSize?: number;
    operator?: string;
    actionType?: string;
    startTime?: string;
    endTime?: string;
    keyword?: string;
    module?: string;
  }

  export interface AuditStats {
    totalCount: number;
    todayCount: number;
    weekCount: number;
    topUsers: { username: string; count: number }[];
    topModules: { module: string; count: number }[];
  }
}

export async function getAuditLogs(params: AuditApi.AuditLogParams) {
  return requestClient.get<{ list: AuditApi.AuditLogItem[]; total: number }>('/hse/audit/logs', {
    params,
  });
}

export async function getAuditStats() {
  return requestClient.get<AuditApi.AuditStats>('/hse/audit/stats');
}

export async function exportAuditLogs(params: AuditApi.AuditLogParams) {
  return requestClient.get('/hse/audit/export', { params, responseType: 'blob' });
}
