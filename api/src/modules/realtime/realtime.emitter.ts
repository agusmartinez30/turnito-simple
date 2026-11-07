import { Injectable, Logger } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import {
  NotificationCreatedPayload,
  PaymentChangedPayload,
} from './realtime.types';

/**
 * Publisher used by the business services. Fire-and-forget: it never throws and never awaits
 * the network, so a realtime failure cannot fail or slow the HTTP request that triggered it.
 * Call it only AFTER the DB transaction committed.
 */
@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  paymentChanged(payload: PaymentChangedPayload): void {
    try {
      // Rebuild the payload so extra properties can never leak to clients.
      const { complexId, bookingId, kind } = payload;
      this.gateway.emitPaymentChanged({ complexId, bookingId, kind });
    } catch (error) {
      this.logger.warn(`payment.changed not emitted: ${String(error)}`);
    }
  }

  notificationCreated(payload: NotificationCreatedPayload): void {
    try {
      // Rebuild the payload so extra properties can never leak to clients.
      const {
        notificationId,
        complexId,
        bookingId,
        type,
        payerName,
        declaredAmount,
        createdAt,
      } = payload;
      this.gateway.emitNotificationCreated({
        notificationId,
        complexId,
        bookingId,
        type,
        payerName,
        declaredAmount,
        createdAt,
      });
    } catch (error) {
      this.logger.warn(`notification.created not emitted: ${String(error)}`);
    }
  }
}
