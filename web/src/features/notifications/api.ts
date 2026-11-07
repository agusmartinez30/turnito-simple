import { api } from '@/lib/api/client';
import type { AdminNotification } from './types';

export function listNotifications(): Promise<AdminNotification[]> {
  return api.get<AdminNotification[]>('/admin/notifications');
}

export function getUnreadCount(): Promise<{ count: number }> {
  return api.get<{ count: number }>('/admin/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<AdminNotification> {
  return api.post<AdminNotification>(`/admin/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return api.post<{ updated: number }>('/admin/notifications/read-all');
}
