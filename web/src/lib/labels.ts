import type { BookingActor, BookingStatus, Sport, UserRole } from '@/types';
import type {
  BookingSource,
  PaymentMethod,
  PaymentStatus,
} from '@/types/admin';

/** Orden canónico del enum `Sport`; se usa para ordenar chips y filtros. */
export const SPORT_ORDER: readonly Sport[] = [
  'PADEL',
  'FOOTBALL_5',
  'FOOTBALL_7',
  'TENNIS',
];

export const SPORT_LABELS: Record<Sport, string> = {
  PADEL: 'Pádel',
  FOOTBALL_5: 'Fútbol 5',
  FOOTBALL_7: 'Fútbol 7',
  TENNIS: 'Tenis',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
};

export function isSport(value: unknown): value is Sport {
  return typeof value === 'string' && (SPORT_ORDER as string[]).includes(value);
}

export function indoorLabel(isIndoor: boolean): string {
  return isIndoor ? 'Techada' : 'Descubierta';
}

/** Etiquetas del panel de administración (docs/05-admin-overview.md). */
export const BOOKING_SOURCE_LABELS: Record<BookingSource, string> = {
  PLAYER: 'Web',
  ADMIN: 'Mostrador',
  PUBLIC: 'Web sin cuenta',
};

export const BOOKING_ACTOR_LABELS: Record<BookingActor, string> = {
  ADMIN: 'por el complejo',
  SYSTEM: 'por vencimiento',
};

/** Turno de mostrador sin cliente (docs/06-admin-agenda.md). */
export const CUSTOMERLESS_LABEL = 'Sin cliente';

export function customerDisplayName(
  customer: { name: string } | null | undefined,
): string {
  return customer?.name ?? CUSTOMERLESS_LABEL;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PLAYER: 'Jugador',
  ADMIN: 'Administrador',
  SUPER_ADMIN: 'Superadministrador',
};

/** Pagos por turno (docs/12-admin-payments.md). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Sin pagar',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
};

/** Cantidad de jugadores típica por deporte: default del atajo "Dividir entre N". */
export const SPLIT_DEFAULT_BY_SPORT: Record<Sport, number> = {
  PADEL: 4,
  FOOTBALL_5: 10,
  FOOTBALL_7: 14,
  TENNIS: 2,
};
