import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  isValid,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Helpers de fecha. Todo lo que se muestra al usuario se formatea en el timezone
 * del complejo (`complex.timezone`), nunca en el del navegador (docs/00-overview.md).
 *
 * Convención: `iso` = instante ISO-8601 con offset (viene de la API);
 * `dateParam` = día `YYYY-MM-DD` en el timezone del complejo (va en la URL / query).
 */

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateParam(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DATE_PARAM_RE.test(value) &&
    isValid(parseISO(value))
  );
}

/** Día `YYYY-MM-DD` de un instante, visto desde `tz`. */
export function dateParamOf(iso: string | Date, tz: string): string {
  return formatInTimeZone(iso, tz, 'yyyy-MM-dd');
}

export function todayInTz(tz: string, now: Date = new Date()): string {
  return dateParamOf(now, tz);
}

/** Instante UTC (ISO) de las 00:00 de `dateParam` en el timezone `tz`. */
export function startOfDayIso(dateParam: string, tz: string): string {
  return fromZonedTime(`${dateParam}T00:00:00`, tz).toISOString();
}

export function addDaysToParam(dateParam: string, days: number): string {
  return format(addDays(parseISO(dateParam), days), 'yyyy-MM-dd');
}

/** Lunes de la semana de un `dateParam` (dashboard: "Esta semana"). */
export function startOfWeekParam(dateParam: string): string {
  return format(
    startOfWeek(parseISO(dateParam), { weekStartsOn: 1 }),
    'yyyy-MM-dd',
  );
}

/** Día 1 del mes de un `dateParam` (dashboard: "Este mes"). */
export function startOfMonthParam(dateParam: string): string {
  return `${dateParam.slice(0, 7)}-01`;
}

/** Suma `months` al día 1 del mes de un `dateParam` (el día se descarta). */
export function addMonthsToParam(dateParam: string, months: number): string {
  return format(
    addMonths(parseISO(startOfMonthParam(dateParam)), months),
    'yyyy-MM-dd',
  );
}

/** "septiembre 2026" a partir de un `dateParam` (rótulo del dashboard en modo mes). */
export function formatMonthParam(dateParam: string): string {
  return format(parseISO(dateParam), 'MMMM yyyy', { locale: es });
}

/** Diferencia en días calendario entre dos `dateParam` (b - a). */
export function diffDateParams(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

/** "sábado 13 de septiembre" a partir de un instante. */
export function formatBookingDate(iso: string, tz: string): string {
  return formatInTimeZone(iso, tz, "EEEE d 'de' MMMM", { locale: es });
}

/** "sábado 13 de septiembre" a partir de un `dateParam`. */
export function formatLongDate(dateParam: string): string {
  return format(parseISO(dateParam), "EEEE d 'de' MMMM", { locale: es });
}

/** "Sábado 13 de septiembre" (primera letra en mayúscula). */
export function formatBookingDateCapitalized(iso: string, tz: string): string {
  const s = formatBookingDate(iso, tz);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "18:00 – 19:30" */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  tz: string,
): string {
  return `${formatInTimeZone(startIso, tz, 'HH:mm')} – ${formatInTimeZone(endIso, tz, 'HH:mm')}`;
}

/** "sáb 13/09" — listados del panel. */
export function formatShortDate(iso: string, tz: string): string {
  const s = formatInTimeZone(iso, tz, 'EEE dd/MM', { locale: es }).replace(
    '.',
    '',
  );
  return s;
}

/** "lun 14/09" a partir de un `dateParam` (encabezados del dashboard). */
export function formatShortDateParam(dateParam: string): string {
  return format(parseISO(dateParam), 'EEE dd/MM', { locale: es }).replace(
    '.',
    '',
  );
}

/** "13/09/2026 10:30" — para "Reservado el" / "Cancelado el". */
export function formatDateTime(iso: string, tz: string): string {
  return formatInTimeZone(iso, tz, 'dd/MM/yyyy HH:mm');
}

/** "Hoy" | "Mañana" | "Ayer" | "En N días" | "Hace N días", en días calendario de `tz`. */
export function formatRelativeDay(
  iso: string,
  tz: string,
  now: Date = new Date(),
): string {
  const diff = diffDateParams(dateParamOf(now, tz), dateParamOf(iso, tz));
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  if (diff > 1) return `En ${diff} días`;
  return `Hace ${Math.abs(diff)} días`;
}

/** Chip del selector de fecha: { weekday: "Sáb", day: "13" }. */
export function formatDayChip(dateParam: string): {
  weekday: string;
  day: string;
} {
  const date = parseISO(dateParam);
  const weekday = format(date, 'EEE', { locale: es }).replace('.', '');
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    day: format(date, 'd'),
  };
}

export function durationMinutes(startIso: string, endIso: string): number {
  return differenceInMinutes(parseISO(endIso), parseISO(startIso));
}

const priceFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** "$ 12.000" */
export function formatPrice(amount: number): string {
  return priceFormatter.format(amount);
}
