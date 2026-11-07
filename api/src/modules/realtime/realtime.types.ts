import type { NotificationType } from '@prisma/client';

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

/** Event pushed to admins when a new notification-center entry is created for their complex. */
export const NOTIFICATION_CREATED_EVENT = 'notification.created';

/**
 * Display detail for the toast (payer and declared amount). Safe because the event only goes to
 * the authenticated admin room of the complex; never includes file keys.
 */
export interface NotificationCreatedPayload {
  notificationId: string;
  complexId: string;
  bookingId: string;
  type: NotificationType;
  payerName: string;
  declaredAmount: number;
  /** ISO-8601 UTC instant. */
  createdAt: string;
}

/** One room per complex: a socket only ever joins the room of its own complex. */
export const complexRoom = (complexId: string): string =>
  `complex:${complexId}`;
