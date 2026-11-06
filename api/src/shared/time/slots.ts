import { addMinutes } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { addLocalDays, localDateInTz, localTimeToUtc } from './tz';

export interface SlotInput {
  date: string; // YYYY-MM-DD, día local del complejo (día de agenda)
  timezone: string;
  openTime: string; // HH:mm local
  closeTime: string; // HH:mm local; menor que openTime = cierra al día siguiente
  slotDurationMinutes: number;
}

export interface SlotInterval {
  startsAt: Date;
  endsAt: Date;
}

export type CourtHours = Pick<SlotInput, 'openTime' | 'closeTime'>;

/** `true` si la cancha cierra después de medianoche (turnos trasnoche, docs/03-courts.md). */
export function closesNextDay({ openTime, closeTime }: CourtHours): boolean {
  return closeTime < openTime;
}

/**
 * Devuelve los intervalos [start, end) en UTC de todos los slots completos del día de agenda
 * (docs/03-courts.md §"Generación de slots"). Si `closeTime < openTime`, el cierre es del
 * día siguiente: la grilla del día `date` termina de madrugada de `date + 1`.
 *
 * La única conversión local→UTC es en `open` y `close`; el resto es aritmética sobre `open`.
 * Un cambio de horario (DST) en el medio del día produce slots de duración fija en UTC.
 */
export function generateSlots(input: SlotInput): SlotInterval[] {
  const { date, timezone, openTime, closeTime, slotDurationMinutes } = input;
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0)
    return [];

  const open = localTimeToUtc(date, openTime, timezone);
  const closeDate = closesNextDay({ openTime, closeTime })
    ? addLocalDays(date, 1)
    : date;
  const close = localTimeToUtc(closeDate, closeTime, timezone);
  if (open >= close) return [];

  const slots: SlotInterval[] = [];
  let cursor = open;
  for (;;) {
    const endsAt = addMinutes(cursor, slotDurationMinutes);
    if (endsAt > close) break;
    slots.push({ startsAt: cursor, endsAt });
    cursor = endsAt;
  }
  return slots;
}

/**
 * Día de agenda (YYYY-MM-DD) al que pertenece un instante: el día cuya grilla lo contiene.
 * En una cancha que cierra al día siguiente, un turno de madrugada (antes de `closeTime`)
 * pertenece al día anterior. Para el resto coincide con el día calendario local.
 */
export function businessDateOf(
  startsAt: Date,
  court: CourtHours,
  timezone: string,
): string {
  const calendarDate = localDateInTz(startsAt, timezone);
  if (!closesNextDay(court)) return calendarDate;
  const time = formatInTimeZone(startsAt, timezone, 'HH:mm');
  return time < court.closeTime ? addLocalDays(calendarDate, -1) : calendarDate;
}
