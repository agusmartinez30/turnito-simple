import { isValid, parse } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Helpers de timezone (docs/00-overview.md §"Tiempo y timezone"). Código puro, sin Nest.
 * El único timezone de negocio es `Complex.timezone`; el del servidor no participa.
 */

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * `true` si el runtime conoce el ID IANA (alias incluidos, p. ej. "America/Argentina/Buenos_Aires").
 * `Intl.supportedValuesOf('timeZone')` no sirve: devuelve solo los canónicos de CLDR y omite alias.
 */
export function isValidTimezone(timezone: string): boolean {
  if (typeof timezone !== 'string' || timezone === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Día actual (YYYY-MM-DD) en el timezone dado. Nunca usar `toISOString().slice(0, 10)`. */
export function todayInTz(now: Date, timezone: string): string {
  return formatInTimeZone(now, timezone, 'yyyy-MM-dd');
}

/** Día local (YYYY-MM-DD) al que pertenece un instante en el timezone dado. */
export function localDateInTz(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd');
}

/** ISO-8601 con el offset del complejo, ej. "2026-09-13T18:00:00-03:00". Es lo que espera la web. */
export function toComplexIso(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Instante UTC correspondiente a `date` + `time` ("HH:mm") en hora local del complejo. */
export function localTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date {
  if (!LOCAL_DATE_RE.test(date))
    throw new RangeError(`Fecha inválida: ${date}`);
  if (!LOCAL_TIME_RE.test(time)) throw new RangeError(`Hora inválida: ${time}`);
  return fromZonedTime(`${date}T${time}:00`, timezone);
}

/** `true` si `date` es YYYY-MM-DD y representa un día real (rechaza 2026-02-30). */
export function isValidLocalDate(date: string): boolean {
  if (!LOCAL_DATE_RE.test(date)) return false;
  const parsed = parse(date, 'yyyy-MM-dd', new Date(0));
  return isValid(parsed);
}

/** Suma `days` a una fecha local YYYY-MM-DD (aritmética de calendario, sin timezone). */
export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Días de calendario entre dos fechas locales (`b - a`). Negativo si `b` es anterior. */
export function diffLocalDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

/** Día 1 del mes de una fecha local YYYY-MM-DD. */
export function startOfLocalMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Último día del mes de una fecha local YYYY-MM-DD. */
export function endOfLocalMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Suma `months` al día 1 del mes de una fecha local (el día se descarta). */
export function addLocalMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo … 6 = sábado) de una fecha local YYYY-MM-DD. */
export function weekdayOfLocalDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lunes de la semana de una fecha local YYYY-MM-DD (aritmética de calendario, sin timezone). */
export function startOfLocalWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addLocalDays(date, weekday === 0 ? -6 : 1 - weekday);
}
