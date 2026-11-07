'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './api';
import type { AdminNotification } from './types';

export const notificationKeys = {
  all: ['admin', 'notifications'] as const,
  list: ['admin', 'notifications', 'list'] as const,
  unreadCount: ['admin', 'notifications', 'unread-count'] as const,
};

/** Polling stays as the fallback when the realtime socket is down. */
export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => (await getUnreadCount()).count,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

/** Only fetched while the popover is open (`enabled`). */
export function useNotifications(enabled: boolean) {
  return useQuery<AdminNotification[]>({
    queryKey: notificationKeys.list,
    queryFn: listNotifications,
    enabled,
    staleTime: 10_000,
  });
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
  });
}
