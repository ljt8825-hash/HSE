/**
 * 通知中心 API（web-naive）
 *
 * 对应后端路由前缀: /hse/notifications
 * requestClient baseURL = /api，完整请求路径为 /api/hse/notifications/...
 */
import { requestClient } from '#/api/request';

export namespace NotificationsApi {
  export type NotificationType = 'system' | 'alert' | 'workflow' | 'task';
  export type NotificationPriority = 'normal' | 'warning' | 'urgent';
  export type NotificationModule =
    | 'regulations'
    | 'emergency'
    | 'training'
    | 'hazards'
    | 'insurance'
    | 'inspection'
    | 'accidents'
    | 'system'
    | 'workflow';

  export interface NotificationItem {
    id: number;
    userId: number;
    title: string;
    content: string;
    type: NotificationType;
    priority: NotificationPriority;
    bizType?: string;
    bizId?: string | number;
    isRead: boolean;
    readAt?: string;
    createdAt: string;
    relatedId?: number;
    relatedType?: string;
  }

  export interface NotificationParams {
    page?: number;
    pageSize?: number;
    isRead?: boolean;
    type?: string;
    module?: string;
    priority?: string;
    keyword?: string;
  }

  export interface NotificationResult {
    list: NotificationItem[];
    total: number;
    unreadCount: number;
  }

  export interface NotificationStats {
    total: number;
    unread: number;
    byModule: Record<string, number>;
    byPriority: Record<string, number>;
  }
}

/** 通知列表 */
export async function getNotifications(params: NotificationsApi.NotificationParams) {
  return requestClient.get<NotificationsApi.NotificationResult>('/hse/notifications', {
    params,
  });
}

/** 通知详情 */
export async function getNotificationDetail(id: number) {
  return requestClient.get<NotificationsApi.NotificationItem>(
    `/hse/notifications/${id}`,
  );
}

/** 通知统计 */
export async function getNotificationStats() {
  return requestClient.get<NotificationsApi.NotificationStats>(
    '/hse/notifications/stats',
  );
}

/** 未读数量 */
export async function getUnreadCount() {
  return requestClient.get<{ count: number }>('/hse/notifications/unread-count');
}

/** 标记单条已读 */
export async function markAsRead(id: number) {
  return requestClient.put(`/hse/notifications/${id}/read`);
}

/** 全部标记已读 */
export async function markAllAsRead() {
  return requestClient.put('/hse/notifications/mark-all-read');
}

/** 删除单条通知 */
export async function deleteNotification(id: number) {
  return requestClient.delete(`/hse/notifications/${id}`);
}

/** 清空所有通知 */
export async function clearNotifications() {
  return requestClient.delete('/hse/notifications/clear');
}

/**
 * 导出通知记录（CSV）。
 * 使用 requestClient.download() 正确返回 Blob，调用方需使用 async/await。
 */
export async function exportNotifications(params?: {
  isRead?: boolean;
  type?: string;
  module?: string;
}) {
  return requestClient.download('/hse/notifications/export', { params });
}
