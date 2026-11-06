/** Socket.IO namespace admin clients connect to. */
export const REALTIME_NAMESPACE = '/admin';

/** Event pushed to admins when a payment-related record of their complex changed. */
export const PAYMENT_CHANGED_EVENT = 'payment.changed';

export const PAYMENT_CHANGE_KINDS = [
  'proof_submitted',
  'proof_approved',
  'proof_rejected',
  'payment_registered',
  'payment_voided',
] as const;

export type PaymentChangeKind = (typeof PAYMENT_CHANGE_KINDS)[number];

/** Ids and kind only: a "something changed" signal, never PII, amounts or file keys. */
export interface PaymentChangedPayload {
  complexId: string;
  bookingId: string;
  kind: PaymentChangeKind;
}

/** One room per complex: a socket only ever joins the room of its own complex. */
export const complexRoom = (complexId: string): string =>
  `complex:${complexId}`;
