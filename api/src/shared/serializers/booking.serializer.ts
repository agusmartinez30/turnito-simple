import {
  Booking,
  BookingSource,
  BookingStatus,
  Court,
  Customer,
  Prisma,
  User,
} from '@prisma/client';
import {
  computePaymentSummary,
  PaymentSummary,
} from '../payments/payment-summary';
import { toComplexIso } from '../time/tz';
import {
  CourtSummaryResponse,
  toCourtSummaryResponse,
} from './court.serializer';
import {
  BookingCustomerResponse,
  toBookingCustomerResponse,
} from './customer.serializer';
import {
  PAYMENT_INCLUDE,
  PaymentResponse,
  PaymentWithRelations,
  toPaymentResponse,
} from './payment.serializer';

/**
 * Relaciones que cargan todos los reads de reservas (jugador y admin). Sin N+1.
 * `payments` trae solo los montos vigentes: alcanza para el resumen `payment` del panel.
 */
export const BOOKING_INCLUDE = {
  court: true,
  customer: true,
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  startedBy: { select: { id: true, name: true } },
  finishedBy: { select: { id: true, name: true } },
  payments: { where: { voidedAt: null }, select: { amount: true } },
} satisfies Prisma.BookingInclude;

export type BookingWithRelations = Booking & {
  court: Court;
  customer: Customer | null;
  createdBy: Pick<User, 'id' | 'name'> | null;
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  startedBy: Pick<User, 'id' | 'name'> | null;
  finishedBy: Pick<User, 'id' | 'name'> | null;
  payments: Array<{ amount: number }>;
};

/** Detalle admin: pagos completos (incl. anulados) para el historial (docs/11-admin-payments.md). */
export const BOOKING_DETAIL_INCLUDE = {
  ...BOOKING_INCLUDE,
  payments: { orderBy: { createdAt: 'desc' }, include: PAYMENT_INCLUDE },
} satisfies Prisma.BookingInclude;

export type BookingWithPayments = Omit<BookingWithRelations, 'payments'> & {
  payments: PaymentWithRelations[];
};

/** @deprecated alias histórico; los services nuevos usan BookingWithRelations. */
export type BookingWithCourt = BookingWithRelations;

/** SYSTEM = vencimiento automático de una solicitud pendiente. */
export type BookingActor = 'ADMIN' | 'SYSTEM';

/** Contrato `AdminBooking` (web/docs/05-admin-overview.md). */
export interface AdminBookingResponse {
  id: string;
  courtId: string;
  status: BookingStatus;
  price: number;
  startsAt: string; // ISO con offset del complejo
  endsAt: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: BookingActor;
  cancellationReason?: string;
  court: CourtSummaryResponse;
  customer: BookingCustomerResponse | null;
  source: BookingSource;
  note?: string;
  createdBy?: { id: string; name: string };
  expiresAt?: string;
  confirmedAt?: string;
  confirmedBy?: { id: string; name: string };
  /** Inicio manual del turno desde el panel (docs/12-turn-progress.md). */
  startedAt?: string;
  startedBy?: { id: string; name: string };
  /** Fin manual: congela el cronómetro. Solo si se inició. */
  finishedAt?: string;
  finishedBy?: { id: string; name: string };
  payment: PaymentSummary;
  payments?: PaymentResponse[]; // solo detalle y respuestas de pagos
}

/** Atajo para los serializers que ya tienen la reserva con su cliente cargado. */
export function toBookingCustomer(booking: {
  customer: Customer;
}): BookingCustomerResponse;

export function toBookingCustomer(booking: {
  customer: Customer | null;
}): BookingCustomerResponse | null;

export function toBookingCustomer(booking: {
  customer: Customer | null;
}): BookingCustomerResponse | null {
  return booking.customer ? toBookingCustomerResponse(booking.customer) : null;
}

/**
 * Derivado sin columna extra: con `cancelledById` la canceló un admin; sin él, el cron de
 * vencimiento de solicitudes públicas. El actor `PLAYER` desapareció con el flujo de cuenta.
 */
export function cancelledByOf(booking: Booking): BookingActor {
  return booking.cancelledById ? 'ADMIN' : 'SYSTEM';
}

function cancellationFields(booking: Booking, timezone: string) {
  if (!booking.cancelledAt) return {};
  return {
    cancelledAt: toComplexIso(booking.cancelledAt, timezone),
    cancelledBy: cancelledByOf(booking),
    ...(booking.cancellationReason
      ? { cancellationReason: booking.cancellationReason }
      : {}),
  };
}

function baseFields(booking: BookingWithRelations, timezone: string) {
  return {
    id: booking.id,
    courtId: booking.courtId,
    status: booking.status,
    price: booking.price,
    startsAt: toComplexIso(booking.startsAt, timezone),
    endsAt: toComplexIso(booking.endsAt, timezone),
    createdAt: toComplexIso(booking.createdAt, timezone),
    ...cancellationFields(booking, timezone),
    court: toCourtSummaryResponse(booking.court),
  };
}

export function toAdminBookingResponse(
  booking: BookingWithRelations | BookingWithPayments,
  timezone: string,
): AdminBookingResponse {
  return {
    ...baseFields(booking, timezone),
    payment: computePaymentSummary(booking.price, booking.payments),
    customer: toBookingCustomer(booking),
    source: booking.source,
    ...(booking.note ? { note: booking.note } : {}),
    ...(booking.createdBy
      ? {
          createdBy: { id: booking.createdBy.id, name: booking.createdBy.name },
        }
      : {}),
    ...(booking.status === 'PENDING' && booking.expiresAt
      ? { expiresAt: toComplexIso(booking.expiresAt, timezone) }
      : {}),
    ...(booking.confirmedAt
      ? { confirmedAt: toComplexIso(booking.confirmedAt, timezone) }
      : {}),
    ...(booking.confirmedBy
      ? {
          confirmedBy: {
            id: booking.confirmedBy.id,
            name: booking.confirmedBy.name,
          },
        }
      : {}),
    ...(booking.startedAt
      ? { startedAt: toComplexIso(booking.startedAt, timezone) }
      : {}),
    ...(booking.startedBy
      ? {
          startedBy: {
            id: booking.startedBy.id,
            name: booking.startedBy.name,
          },
        }
      : {}),
    ...(booking.finishedAt
      ? { finishedAt: toComplexIso(booking.finishedAt, timezone) }
      : {}),
    ...(booking.finishedBy
      ? {
          finishedBy: {
            id: booking.finishedBy.id,
            name: booking.finishedBy.name,
          },
        }
      : {}),
  };
}

/** Detalle admin: el resumen más el historial de pagos, más reciente primero. */
export function toAdminBookingDetailResponse(
  booking: BookingWithPayments,
  timezone: string,
): AdminBookingResponse {
  return {
    ...toAdminBookingResponse(booking, timezone),
    payments: booking.payments.map((p) => toPaymentResponse(p, timezone)),
  };
}
