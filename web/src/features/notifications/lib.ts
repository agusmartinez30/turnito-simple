import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';

/** Badge text: caps at 99+ so it never overflows the bell. */
export function formatUnreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Accessible name of the bell, including the unread count. */
export function bellLabel(count: number): string {
  if (count <= 0) return 'Notificaciones';
  return `Notificaciones, ${count} sin leer`;
}

/** "hace 5 minutos" */
export function relativeTime(iso: string, now: Date = new Date()): string {
  return formatDistanceToNowStrict(new Date(iso), {
    addSuffix: true,
    locale: es,
    now,
  } as Parameters<typeof formatDistanceToNowStrict>[1]);
}
