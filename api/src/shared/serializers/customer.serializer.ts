import { Customer, CustomerSource } from '@prisma/client';
import { toComplexIso } from '../time/tz';

/**
 * El cliente tal como viaja dentro de una reserva (docs/17-admin-customers.md).
 *
 * `name` es derivado y **no** se guarda: mantenerlo es lo que permite que la agenda, el
 * dashboard, el ledger de pagos y WhatsApp sigan mostrando un solo string sin cambios.
 */
export interface BookingCustomerResponse {
  id: string;
  name: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  isActive: boolean;
}

/** Fila del listado de `/admin/customers`, con los agregados que muestra la tabla. */
export interface AdminCustomerResponse extends BookingCustomerResponse {
  note?: string;
  source: CustomerSource;
  createdAt: string; // ISO con offset del complejo
  bookingsCount: number; // no canceladas
  lastBookingAt?: string;
}

export interface CustomerStatsResponse {
  bookings: { confirmed: number; pending: number; cancelled: number };
  /** Σ price de las CONFIRMED: un PENDING todavía no se debe, un CANCELLED tampoco. */
  billed: number;
  /** Σ pagos vigentes de todas sus reservas, incluso las después canceladas. */
  paid: number;
  /** `billed − paid`; negativo = saldo a favor. */
  balance: number;
}

export function customerName(
  customer: Pick<Customer, 'firstName' | 'lastName'>,
): string {
  return `${customer.firstName} ${customer.lastName ?? ''}`.trim();
}

export function toBookingCustomerResponse(
  customer: Customer,
): BookingCustomerResponse {
  return {
    id: customer.id,
    name: customerName(customer),
    firstName: customer.firstName,
    ...(customer.lastName ? { lastName: customer.lastName } : {}),
    ...(customer.phone ? { phone: customer.phone } : {}),
    isActive: customer.isActive,
  };
}

export interface CustomerAggregates {
  bookingsCount: number;
  lastBookingAt: Date | null;
}

export function toAdminCustomerResponse(
  customer: Customer,
  aggregates: CustomerAggregates,
  timezone: string,
): AdminCustomerResponse {
  return {
    ...toBookingCustomerResponse(customer),
    ...(customer.note ? { note: customer.note } : {}),
    source: customer.source,
    createdAt: toComplexIso(customer.createdAt, timezone),
    bookingsCount: aggregates.bookingsCount,
    ...(aggregates.lastBookingAt
      ? { lastBookingAt: toComplexIso(aggregates.lastBookingAt, timezone) }
      : {}),
  };
}
