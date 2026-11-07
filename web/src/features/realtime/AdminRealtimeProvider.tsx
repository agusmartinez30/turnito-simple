'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { notificationKeys } from '@/features/notifications/hooks';
import type { NotificationCreatedEvent } from '@/features/notifications/types';
import { API_BASE_URL } from '@/lib/api/client';
import { getAccessToken } from '@/lib/api/session-token';
import { formatPrice } from '@/lib/date';
import {
  invalidatePaymentChanged,
  type PaymentChangedEvent,
} from './invalidate-payment-changed';

const TOAST_DEDUPE_MS = 5_000;

function resolveNamespaceUrl(): string | null {
  try {
    return `${new URL(API_BASE_URL).origin}/admin`;
  } catch {
    return null;
  }
}

/**
 * Opens one Socket.IO connection to the API `/admin` namespace and refreshes
 * payment-related queries on `payment.changed`. Polling stays as a fallback,
 * so any failure here is silent and never affects the UI.
 */
export function AdminRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const url = resolveNamespaceUrl();
    if (!url) return;

    const lastToastAt = new Map<string, number>();
    let socket: ReturnType<typeof io> | null = null;

    try {
      socket = io(url, {
        // Callback form: the current token is read on every (re)connect.
        auth: (cb) => {
          getAccessToken()
            .then((token) => cb({ token: token ?? '' }))
            .catch(() => cb({ token: '' }));
        },
      });

      socket.on('payment.changed', (event: PaymentChangedEvent) => {
        try {
          // The detailed toast for a new proof comes from `notification.created`.
          invalidatePaymentChanged(queryClient, event);
        } catch {
          // Polling will catch up.
        }
      });

      socket.on('notification.created', (event: NotificationCreatedEvent) => {
        try {
          void queryClient.invalidateQueries({
            queryKey: notificationKeys.all,
          });
          const now = Date.now();
          const last = lastToastAt.get(event.notificationId) ?? 0;
          if (now - last <= TOAST_DEDUPE_MS) return;
          lastToastAt.set(event.notificationId, now);
          toast.info('Nuevo comprobante recibido', {
            description: `${event.payerName} declaró ${formatPrice(event.declaredAmount)}`,
            action: {
              label: 'Ver reserva',
              onClick: () =>
                routerRef.current.push(`/admin/bookings/${event.bookingId}`),
            },
          });
        } catch {
          // Polling will catch up.
        }
      });

      // Auth rejection is definitive (no token / not admin): stop retrying.
      socket.on('connect_error', (err) => {
        if (/unauthor|forbidden|token/i.test(err.message)) socket?.disconnect();
      });
    } catch {
      // Realtime is best-effort.
    }

    return () => {
      socket?.removeAllListeners();
      socket?.disconnect();
    };
  }, [queryClient]);

  return <>{children}</>;
}
