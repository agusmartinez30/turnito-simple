/** Mirrors `NotificationResponse` of the API (`GET /admin/notifications`). */
export interface AdminNotification {
  id: string;
  type: 'PROOF_SUBMITTED';
  bookingId: string;
  proofId: string | null;
  payerName: string;
  declaredAmount: number;
  createdAt: string;
  /** null = unread (shared by every admin of the complex). */
  readAt: string | null;
  booking: {
    courtName: string;
    startsAt: string;
    customerName: string | null;
    price: number;
    paidAmount: number;
    balance: number;
  };
}

/** Payload of the `notification.created` realtime event. */
export interface NotificationCreatedEvent {
  notificationId: string;
  complexId: string;
  bookingId: string;
  type: AdminNotification['type'];
  payerName: string;
  declaredAmount: number;
  createdAt: string;
}
