/**
 * 审计日志 API（web-naive 适配）
 *
 * 对应后端路由: server/routes/hse/audit.js
 * 路由前缀: /hse/audit
 * requestClient baseURL = /api，完整请求路径为 /api/hse/audit/...
 *
 * 字段命名对齐后端返回（camelCase：userId/username/ipAddress/statusCode/createdAt 等），
 * 与 web-antd 审计日志页（views/security/audit/index.vue）实际调用保持一致。
 */
import { requestClient } from '#/api/request';

export namespace AuditApi {
  /** 审计日志条目 */
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

  /** 审计日志查询参数 */
  export interface AuditLogParams {
    page?: number;
    pageSize?: number;
    operator?: string;
    actionType?: string;
    startTime?: string;
    endTime?: string;
    keyword?: string;
    module?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }

  /** 审计统计 */
  export interface AuditStats {
    totalCount: number;
    todayCount: number;
    weekCount: number;
    topUsers: { username: string; count: number }[];
    topModules: { module: string; count: number }[];
  }
}

/** 审计日志列表（分页） */
export async function getAuditLogs(params: AuditApi.AuditLogParams) {
  return requestClient.get<{ list: AuditApi.AuditLogItem[]; total: number }>('/hse/audit/logs', {
    params,
  });
}

/** 审计统计 */
export async function getAuditStats() {
  return requestClient.get<AuditApi.AuditStats>('/hse/audit/stats');
}

/**
 * 导出审计日志（CSV/Excel）。
 * 使用 requestClient.download() 正确返回 Blob，调用方需使用 async/await。
 */
export async function exportAuditLogs(params: AuditApi.AuditLogParams) {
  return requestClient.download('/hse/audit/export', { params });
}
