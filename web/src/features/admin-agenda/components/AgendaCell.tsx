'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CUSTOMERLESS_LABEL } from '@/lib/labels';
import type { AdminBooking } from '@/types/admin';

const CELL = 'flex h-14 min-w-0 items-center border-b border-l px-2 text-sm';

interface Props {
  booking: AdminBooking | undefined;
  /** The court has no slot at this row (outside its hours). */
  closed: boolean;
  past: boolean;
  completed: boolean;
  onCreate: () => void;
}

/** One court x time cell: closed, free (quick create) or occupied (link to detail). */
export function AgendaCell({
  booking,
  closed,
  past,
  completed,
  onCreate,
}: Props) {
  if (booking) {
    const pending = booking.status === 'PENDING';
    const customer = booking.customer?.name ?? CUSTOMERLESS_LABEL;
    return (
      <Link
        href={`/admin/bookings/${booking.id}`}
        className={cn(
          CELL,
          'flex-col items-start justify-center gap-0.5 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:-outline-offset-2',
          pending
            ? 'bg-warning text-warning-foreground'
            : completed
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground',
        )}
      >
        <span className="w-full truncate font-medium">{customer}</span>
        <span className="w-full truncate text-xs opacity-80">
          {pending ? 'Pendiente' : completed ? 'Completada' : 'Confirmada'}
        </span>
      </Link>
    );
  }

  if (closed) {
    return <div aria-hidden className={cn(CELL, 'bg-muted/40')} />;
  }

  if (past) {
    return <div aria-hidden className={cn(CELL, 'bg-muted/20')} />;
  }

  return (
    <button
      type="button"
      onClick={onCreate}
      aria-label="Crear reserva"
      className={cn(
        CELL,
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground justify-center focus-visible:outline-2 focus-visible:-outline-offset-2',
      )}
    >
      <PlusIcon className="size-4" />
    </button>
  );
}
