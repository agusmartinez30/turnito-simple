import type { QueryClient } from '@tanstack/react-query';
import { adminBookingKeys } from '@/features/admin-bookings/hooks';
import {
  adminPaymentKeys,
  paymentProofKeys,
} from '@/features/admin-payments/hooks';

export type PaymentChangeKind =
  | 'proof_submitted'
  | 'proof_approved'
  | 'proof_rejected'
  | 'payment_registered'
  | 'payment_voided';

export interface PaymentChangedEvent {
  complexId: string;
  bookingId: string;
  kind: PaymentChangeKind;
}

/** Mirrors what the admin approve/confirm mutations invalidate. */
export function invalidatePaymentChanged(
  queryClient: QueryClient,
  event: PaymentChangedEvent,
): void {
  void queryClient.invalidateQueries({
    queryKey: paymentProofKeys.list(event.bookingId),
  });
  void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all });
  void queryClient.invalidateQueries({ queryKey: adminPaymentKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
}
