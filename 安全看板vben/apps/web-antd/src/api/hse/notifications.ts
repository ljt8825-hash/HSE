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

export async function getNotifications(params: NotificationsApi.NotificationParams) {
  return requestClient.get<NotificationsApi.NotificationResult>('/hse/notifications', { params });
}

export async function getNotificationDetail(id: number) {
  return requestClient.get<NotificationsApi.NotificationItem>(`/hse/notifications/${id}`);
}

export async function getNotificationStats() {
  return requestClient.get<NotificationsApi.NotificationStats>('/hse/notifications/stats');
}

export async function getUnreadCount() {
  return requestClient.get<{ count: number }>('/hse/notifications/unread-count');
}

export async function markAsRead(id: number) {
  return requestClient.put(`/hse/notifications/${id}/read`);
}

export async function markAllAsRead() {
  return requestClient.put('/hse/notifications/mark-all-read');
}

export async function deleteNotification(id: number) {
  return requestClient.delete(`/hse/notifications/${id}`);
}

export async function clearNotifications() {
  return requestClient.delete('/hse/notifications/clear');
}

export async function exportNotifications(params?: {
  isRead?: boolean;
  type?: string;
  module?: string;
}) {
  return requestClient.get<Blob>('/hse/notifications/export', {
    params,
    responseType: 'blob',
  });
}
