'use client';

import { BellIcon, CheckCheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useComplex } from '@/features/complex/hooks';
import { formatDateTime, formatPrice } from '@/lib/date';
import { cn } from '@/lib/utils';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '../hooks';
import { bellLabel, formatUnreadBadge, relativeTime } from '../lib';
import type { AdminNotification } from '../types';

function NotificationItem({
  notification,
  timezone,
  onSelect,
}: {
  notification: AdminNotification;
  timezone: string | undefined;
  onSelect: (n: AdminNotification) => void;
}) {
  const unread = notification.readAt === null;
  const { booking } = notification;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(notification)}
        className={cn(
          'hover:bg-muted focus-visible:ring-ring/50 flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px]',
          unread && 'bg-muted/60',
        )}
      >
        <span className="flex items-center gap-2">
          {unread && (
            <span
              className="bg-highlight size-2 shrink-0 rounded-full"
              aria-hidden
            />
          )}
          <span className={cn('truncate', unread && 'font-semibold')}>
            {notification.payerName}
          </span>
          <span className="ml-auto shrink-0 font-medium tabular-nums">
            {formatPrice(notification.declaredAmount)}
          </span>
        </span>
        <span className="text-muted-foreground text-xs">
          Comprobante · {booking.courtName}
          {timezone && ` · ${formatDateTime(booking.startsAt, timezone)}`}
        </span>
        <span className="text-muted-foreground text-xs">
          {relativeTime(notification.createdAt)}
          {unread && <span className="sr-only"> (sin leer)</span>}
        </span>
      </button>
    </li>
  );
}

/** Bell with unread badge and a popover list of proof notifications (admin header). */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const complex = useComplex();
  const unread = useUnreadNotificationCount();
  const list = useNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const count = unread.data ?? 0;

  const handleSelect = (n: AdminNotification) => {
    if (n.readAt === null) markRead.mutate(n.id);
    setOpen(false);
    router.push(`/admin/bookings/${n.bookingId}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={bellLabel(count)}
            className={cn('relative', className)}
          />
        }
      >
        <BellIcon className="size-5" />
        {count > 0 && (
          <span
            aria-hidden
            className="bg-destructive absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
          >
            {formatUnreadBadge(count)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={count === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheckIcon />
            Marcar todas como leídas
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {list.isPending ? (
            <div className="flex flex-col gap-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : list.isError ? (
            <p className="text-muted-foreground p-4 text-center text-sm">
              No pudimos cargar las notificaciones.
            </p>
          ) : list.data.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">
              No tenés notificaciones.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {list.data.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  timezone={complex.data?.timezone}
                  onSelect={handleSelect}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
