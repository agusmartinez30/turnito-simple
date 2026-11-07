import { parseISO } from 'date-fns';
import type { BookingStatus } from '@/types';
import type { AdminBooking } from '@/types/admin';

/** Una reserva no cancelada admite pagos (docs/12-admin-payments.md). */
export function canRegisterPayment(booking: AdminBooking): boolean {
  return booking.status !== 'CANCELLED';
}

/**
 * Una reserva activa (CONFIRMED o PENDING) cuyo turno no terminó se puede cancelar / rechazar.
 */
export function canAdminCancel(
  booking: AdminBooking,
  now = new Date(),
): boolean {
  return (
    (booking.status === 'CONFIRMED' || booking.status === 'PENDING') &&
    parseISO(booking.endsAt) > now
  );
}

/** Una solicitud PENDING vigente se puede confirmar. */
export function canAdminConfirm(
  booking: AdminBooking,
  now = new Date(),
): boolean {
  return (
    booking.status === 'PENDING' &&
    (!booking.expiresAt || parseISO(booking.expiresAt) > now)
  );
}

/**
 * Solo presentación: el modelo no tiene COMPLETED, pero una confirmada cuyo turno
 * ya terminó se lee mejor como "Completada" que como "Confirmada".
 */
export function isBookingCompleted(
  booking: AdminBooking,
  now: Date | null,
): boolean {
  return (
    now !== null &&
    booking.status === 'CONFIRMED' &&
    parseISO(booking.endsAt) <= now
  );
}

/** Variante de Badge por estado; PENDING usa el ámbar de "sin confirmar". */
export const BOOKING_STATUS_BADGE_VARIANT = {
  CONFIRMED: 'default',
  PENDING: 'warning',
  CANCELLED: 'secondary',
} as const satisfies Record<BookingStatus, string>;
