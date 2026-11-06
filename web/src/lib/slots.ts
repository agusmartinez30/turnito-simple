/**
 * Aritmética de turnos, solo informativa para la UI del panel (docs/08-admin-courts.md).
 * La API sigue siendo la fuente de verdad: genera los slots con la misma regla.
 */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHHmm(value: string): boolean {
  return HHMM_RE.test(value);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos → "HH:mm"; pasado 24:00 vuelve a empezar (cierre del día siguiente). */
function toHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `true` si la cancha cierra después de medianoche: `closeTime < openTime` (docs/08-admin-courts.md). */
export function closesNextDay(open: string, close: string): boolean {
  return close < open;
}

export interface SlotSummary {
  count: number;
  /** "20:00 – 21:30" del último turno completo; `null` si no entra ninguno. */
  last: { start: string; end: string } | null;
}

/** Cantidad de turnos completos entre `open` y `close` en pasos de `duration` minutos. */
export function countSlots(
  open: string,
  close: string,
  duration: number,
): number {
  return summarizeSlots(open, close, duration).count;
}

export function summarizeSlots(
  open: string,
  close: string,
  duration: number,
): SlotSummary {
  if (
    !isHHmm(open) ||
    !isHHmm(close) ||
    !Number.isInteger(duration) ||
    duration <= 0
  ) {
    return { count: 0, last: null };
  }
  const start = toMinutes(open);
  // Cierre menor que apertura = día siguiente; igual = inválido (0 turnos).
  const end = toMinutes(close) + (closesNextDay(open, close) ? 1440 : 0);
  if (start >= end) return { count: 0, last: null };
  const count = Math.floor((end - start) / duration);
  if (count === 0) return { count: 0, last: null };
  const lastStart = start + (count - 1) * duration;
  return {
    count,
    last: { start: toHHmm(lastStart), end: toHHmm(lastStart + duration) },
  };
}
