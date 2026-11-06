import { addLocalDays } from './tz';

/**
 * Ventana de días reservables: `[today, today + maxDaysAhead - 1]`, ambos días locales del complejo.
 * Compartida por `GET /courts/:id/availability` y `POST /bookings`.
 */
export function isDateInBookingWindow(
  date: string,
  today: string,
  maxDaysAhead: number,
): boolean {
  const last = addLocalDays(today, maxDaysAhead - 1);
  return date >= today && date <= last;
}
