import { api } from '@/lib/api/client';
import type {
  AdminBooking,
  PaymentLedger,
  PaymentMethod,
  PaymentProof,
} from '@/types/admin';

/** Revisión de comprobantes del link público de pago (docs/23-public-payment-link.md). */
export function listPaymentProofs(bookingId: string): Promise<PaymentProof[]> {
  return api.get<PaymentProof[]>(`/admin/bookings/${bookingId}/payment-proofs`);
}

/** URL firmada y temporal del PDF del comprobante. */
export function getPaymentProofFileUrl(
  bookingId: string,
  proofId: string,
): Promise<{ url: string }> {
  return api.get<{ url: string }>(
    `/admin/bookings/${bookingId}/payment-proofs/${proofId}/file`,
  );
}

export function approvePaymentProof(
  bookingId: string,
  proofId: string,
  amount?: number,
): Promise<PaymentProof> {
  return api.post<PaymentProof>(
    `/admin/bookings/${bookingId}/payment-proofs/${proofId}/approve`,
    { body: amount === undefined ? {} : { amount } },
  );
}

export function rejectPaymentProof(
  bookingId: string,
  proofId: string,
  reason: string,
): Promise<PaymentProof> {
  return api.post<PaymentProof>(
    `/admin/bookings/${bookingId}/payment-proofs/${proofId}/reject`,
    { body: { reason } },
  );
}

/** Filtros de `GET /admin/payments` (docs/12-admin-payments.md). El rango es sobre `createdAt` del pago. */
export interface PaymentLedgerFilters {
  date?: string;
  from?: string;
  to?: string;
  method?: PaymentMethod;
  q?: string;
  voided?: boolean;
  limit?: number;
}

export function listPayments(
  filters: PaymentLedgerFilters = {},
): Promise<PaymentLedger> {
  return api.get<PaymentLedger>('/admin/payments', { query: { ...filters } });
}

export interface RegisterPaymentPayload {
  amount: number;
  method: PaymentMethod;
  note?: string;
}

/** Ambas devuelven el detalle de la reserva con `payment` y `payments[]` frescos (docs/12-admin-payments.md). */
export function registerPayment(
  bookingId: string,
  payload: RegisterPaymentPayload,
): Promise<AdminBooking> {
  return api.post<AdminBooking>(`/admin/bookings/${bookingId}/payments`, {
    body: payload,
  });
}

export function voidPayment(
  bookingId: string,
  paymentId: string,
  reason?: string,
): Promise<AdminBooking> {
  return api.patch<AdminBooking>(
    `/admin/bookings/${bookingId}/payments/${paymentId}/void`,
    { body: reason ? { reason } : {} },
  );
}
