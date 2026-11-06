import { addDaysToParam } from '@/lib/date';
import { fromZonedTime } from 'date-fns-tz';

export interface SlotStart {
  /** ISO-8601 instant, as expected by `POST /admin/bookings`. */
  startsAt: string;
  /** "HH:mm" local start, used to build the option label. */
  startLabel: string;
  endLabel: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localLabel(totalMinutes: number): string {
  const inDay = totalMinutes % 1440;
  return `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}`;
}

/**
 * Start instants of the court grid for a business day (`date`, `YYYY-MM-DD` in the complex
 * timezone). A court that closes after midnight (`close < open`) keeps its small-hours slots in
 * the previous day's grid, the same rule the API uses. The API stays the source of truth: it
 * rejects any start that is not an exact slot or that is already in the past.
 */
export function slotStartsFor(
  date: string,
  court: { openTime: string; closeTime: string; slotDurationMinutes: number },
  timezone: string,
): SlotStart[] {
  const open = toMinutes(court.openTime);
  const closeRaw = toMinutes(court.closeTime);
  const close = closeRaw < open ? closeRaw + 1440 : closeRaw;
  const duration = court.slotDurationMinutes;
  if (duration <= 0 || close <= open) return [];

  const slots: SlotStart[] = [];
  for (let start = open; start + duration <= close; start += duration) {
    const day = addDaysToParam(date, Math.floor(start / 1440));
    const startLabel = localLabel(start);
    slots.push({
      startsAt: fromZonedTime(
        `${day}T${startLabel}:00`,
        timezone,
      ).toISOString(),
      startLabel,
      endLabel: localLabel(start + duration),
    });
  }
  return slots;
}
