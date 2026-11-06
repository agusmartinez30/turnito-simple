'use client';

import { CircleCheck, Timer, TimerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatElapsed,
  type StartedBooking,
  turnProgress,
} from '../lib/turn-progress';

/** Fila / card de un turno que ya se pasó de su duración (docs/13-turn-progress.md). */
export const OVERTIME_ROW_CLASS =
  'bg-destructive-subtle hover:bg-destructive-subtle/70 focus-visible:bg-destructive-subtle/70';

export const OVERTIME_CARD_CLASS =
  'border-destructive bg-destructive-subtle ring-destructive/40 ring-2';

interface Props {
  booking: StartedBooking;
  /** Reloj; puede ser `null` solo para un turno finalizado (el tiempo ya está congelado). */
  now: Date | null;
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * Cronómetro del turno: verde mientras corre; al cumplirse la duración pasa a "Terminado" en
 * rojo pulsante con el tiempo excedido; al finalizarlo a mano queda "Finalizado" en gris con el total.
 */
export function TurnTimer({ booking, now, size = 'sm', className }: Props) {
  const progress = turnProgress(booking, now ?? new Date());
  const large = size === 'lg';

  if (progress.state === 'finished') {
    return (
      <span
        role="status"
        className={cn(
          'bg-muted text-muted-foreground inline-flex flex-wrap items-center gap-x-1.5 rounded-md font-medium tabular-nums',
          large ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-xs',
          className,
        )}
      >
        <CircleCheck className={large ? 'size-5' : 'size-3.5'} aria-hidden />
        <span className="whitespace-nowrap">
          Finalizado · {formatElapsed(progress.elapsedMs)}
        </span>
        {progress.overtimeMs > 0 && (
          <span className="text-destructive-subtle-foreground">
            (+{formatElapsed(progress.overtimeMs)})
          </span>
        )}
      </span>
    );
  }

  if (progress.state === 'overtime') {
    return (
      <span
        role="status"
        className={cn(
          'bg-destructive text-destructive-foreground inline-flex animate-pulse items-center gap-1.5 rounded-md font-semibold tabular-nums',
          large ? 'px-3 py-1.5 text-lg' : 'px-2 py-0.5 text-xs',
          className,
        )}
      >
        <TimerOff className={large ? 'size-5' : 'size-3.5'} aria-hidden />
        Terminado · +{formatElapsed(progress.overtimeMs)}
      </span>
    );
  }

  return (
    <span
      role="status"
      className={cn(
        'text-success inline-flex items-center gap-1.5 font-semibold tabular-nums',
        large ? 'text-3xl' : 'text-xs',
        className,
      )}
    >
      <span className="relative flex size-2.5" aria-hidden>
        <span className="bg-success absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
        <span className="bg-success relative inline-flex size-2.5 rounded-full" />
      </span>
      {large && <Timer className="size-6" aria-hidden />}
      <span>{formatElapsed(progress.elapsedMs)}</span>
      {!large && (
        <span className="text-muted-foreground font-normal">
          / {Math.round(progress.durationMs / 60_000)} min
        </span>
      )}
    </span>
  );
}
