import { parseISO } from 'date-fns';
import { dateParamOf } from '@/lib/date';
import type { AdminBooking } from '@/types/admin';

/**
 * Turno en curso (docs/13-turn-progress.md). El cronómetro corre desde `startedAt`
 * (inicio manual) y el turno "termina" al cumplirse la duración pactada (`endsAt − startsAt`),
 * no al llegar a `endsAt`: si empezó tarde, tiene su tiempo completo. "Finalizar" (`finishedAt`)
 * lo congela en el tiempo total que llevó.
 */
export type TurnState = 'running' | 'overtime' | 'finished';

export interface TurnProgress {
  state: TurnState;
  /** Hasta `now`, o hasta `finishedAt` si se finalizó. */
  elapsedMs: number;
  durationMs: number;
  /** ≥ 0 en `running`; 0 en los demás estados. */
  remainingMs: number;
  /** Cuánto se pasó de la duración (también en `finished`, si se pasó). */
  overtimeMs: number;
}

export type StartedBooking = AdminBooking & { startedAt: string };

export function turnProgress(
  booking: Pick<AdminBooking, 'startsAt' | 'endsAt' | 'finishedAt'> & {
    startedAt: string;
  },
  now: Date,
): TurnProgress {
  const durationMs =
    parseISO(booking.endsAt).getTime() - parseISO(booking.startsAt).getTime();
  const end = booking.finishedAt ? parseISO(booking.finishedAt) : now;
  const elapsedMs = Math.max(
    0,
    end.getTime() - parseISO(booking.startedAt).getTime(),
  );
  const over = elapsedMs >= durationMs;
  return {
    state: booking.finishedAt ? 'finished' : over ? 'overtime' : 'running',
    elapsedMs,
    durationMs,
    remainingMs: over ? 0 : durationMs - elapsedMs,
    overtimeMs: over ? elapsedMs - durationMs : 0,
  };
}

/** "mm:ss", o "h:mm:ss" a partir de una hora. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Solo CONFIRMED de hoy (día local del complejo) y no iniciada. Misma regla que la API.
 */
export function canStartTurn(
  booking: AdminBooking,
  today: string,
  timezone: string,
): boolean {
  return (
    booking.status === 'CONFIRMED' &&
    !booking.startedAt &&
    dateParamOf(booking.startsAt, timezone) === today
  );
}

/** Iniciada (en curso o ya finalizada). */
export function isStarted(booking: AdminBooking): booking is StartedBooking {
  return (
    booking.status === 'CONFIRMED' && typeof booking.startedAt === 'string'
  );
}

/** Iniciada y sin finalizar: el cronómetro sigue corriendo. */
export function isInProgress(booking: AdminBooking): booking is StartedBooking {
  return isStarted(booking) && !booking.finishedAt;
}

export function isFinished(booking: AdminBooking): booking is StartedBooking {
  return isStarted(booking) && !!booking.finishedAt;
}
