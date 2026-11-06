import {
  Booking,
  BookingStatus,
  Court,
  Customer,
  PaymentProof,
  PaymentProofStatus,
  Prisma,
} from '@prisma/client';
import { toComplexIso } from '../time/tz';
import { toBookingCustomer } from './booking.serializer';
import { BookingCustomerResponse } from './customer.serializer';
import {
  CourtSummaryResponse,
  toCourtSummaryResponse,
} from './court.serializer';
import {
  PAYMENT_INCLUDE,
  PaymentResponse,
  PaymentWithRelations,
  toPaymentResponse,
} from './payment.serializer';

/** Fila del listado de pagos: el pago más el turno al que pertenece (docs/11-admin-payments.md). */
export const PAYMENT_LEDGER_INCLUDE = {
  ...PAYMENT_INCLUDE,
  booking: { include: { court: true, customer: true } },
} satisfies Prisma.PaymentInclude;

export type PaymentLedgerRow = PaymentWithRelations & {
  booking: Booking & { court: Court; customer: Customer | null };
};

export interface LedgerBookingResponse {
  id: string;
  status: BookingStatus;
  price: number;
  startsAt: string;
  endsAt: string;
  court: CourtSummaryResponse;
  customer: BookingCustomerResponse | null;
}

export interface PaymentLedgerRowResponse extends PaymentResponse {
  booking: LedgerBookingResponse;
}

/** Proof row of the unified ledger: the receipt plus the booking it belongs to. */
export const PAYMENT_PROOF_LEDGER_INCLUDE = {
  booking: { include: { court: true, customer: true } },
} satisfies Prisma.PaymentProofInclude;

export type PaymentProofLedgerRow = PaymentProof & {
  booking: Booking & { court: Court; customer: Customer | null };
};

export interface PaymentProofLedgerRowResponse {
  id: string;
  status: PaymentProofStatus;
  payerName: string;
  playersCount: number | null;
  /** Pesos the payer says the receipt supports; NOT collected money and never in totals. */
  declaredAmount: number;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  booking: LedgerBookingResponse;
}

export interface PaymentLedgerTotals {
  collected: number; // cash + transfer
  cash: number;
  transfer: number;
  count: number;
}

export interface PaymentLedgerResponse {
  range: { from: string; to: string }; // YYYY-MM-DD, días locales inclusive
  totals: PaymentLedgerTotals; // nunca incluyen anulados; independientes de `limit`
  payments: PaymentLedgerRowResponse[]; // createdAt desc
  /** PENDING always (any date); REJECTED only with `voided`. Never in totals. createdAt desc. */
  proofs: PaymentProofLedgerRowResponse[];
}

function toLedgerBooking(
  booking: PaymentLedgerRow['booking'],
  timezone: string,
): LedgerBookingResponse {
  return {
    id: booking.id,
    status: booking.status,
    price: booking.price,
    startsAt: toComplexIso(booking.startsAt, timezone),
    endsAt: toComplexIso(booking.endsAt, timezone),
    court: toCourtSummaryResponse(booking.court),
    customer: toBookingCustomer(booking),
  };
}

export function toPaymentLedgerRowResponse(
  row: PaymentLedgerRow,
  timezone: string,
): PaymentLedgerRowResponse {
  return {
    ...toPaymentResponse(row, timezone),
    booking: toLedgerBooking(row.booking, timezone),
  };
}

export function toPaymentProofLedgerRowResponse(
  row: PaymentProofLedgerRow,
  timezone: string,
): PaymentProofLedgerRowResponse {
  return {
    id: row.id,
    status: row.status,
    payerName: row.payerName,
    playersCount: row.playersCount,
    declaredAmount: row.declaredAmount,
    createdAt: toComplexIso(row.createdAt, timezone),
    reviewedAt: row.reviewedAt ? toComplexIso(row.reviewedAt, timezone) : null,
    rejectReason: row.rejectReason,
    booking: toLedgerBooking(row.booking, timezone),
  };
}
