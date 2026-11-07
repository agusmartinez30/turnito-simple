import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { computePaymentSummary } from '../../shared/payments/payment-summary';
import { Clock } from '../../shared/time/clock';
import { toComplexIso } from '../../shared/time/tz';
import { ComplexService } from '../complex/complex.service';

export const NOTIFICATIONS_LIST_LIMIT = 30;

export const NOTIFICATION_MESSAGES = {
  notFound: 'Notificación no encontrada.',
};

const NOTIFICATION_INCLUDE = {
  booking: {
    select: {
      startsAt: true,
      price: true,
      court: { select: { name: true } },
      customer: { select: { firstName: true, lastName: true } },
      payments: { select: { amount: true, voidedAt: true } },
    },
  },
} satisfies Prisma.NotificationInclude;

type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

export interface NotificationResponse {
  id: string;
  type: NotificationType;
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
    /** price - paidAmount; negative = credit balance. */
    balance: number;
  };
}

/** Admin notification center, always scoped to the caller's complex. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complex: ComplexService,
    private readonly clock: Clock,
  ) {}

  async list(complexId: string): Promise<NotificationResponse[]> {
    const [rows, { timezone }] = await Promise.all([
      this.prisma.notification.findMany({
        where: { complexId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATIONS_LIST_LIMIT,
        include: NOTIFICATION_INCLUDE,
      }),
      this.complex.findByIdOrThrow(complexId),
    ]);
    return rows.map((row) => this.toResponse(row, timezone));
  }

  async unreadCount(complexId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { complexId, readAt: null },
    });
    return { count };
  }

  /** Idempotent: an already read notification keeps its original `readAt`. */
  async markRead(complexId: string, id: string): Promise<NotificationResponse> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, complexId },
      include: NOTIFICATION_INCLUDE,
    });
    if (!existing) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        NOTIFICATION_MESSAGES.notFound,
      );
    }
    const { timezone } = await this.complex.findByIdOrThrow(complexId);
    if (existing.readAt) return this.toResponse(existing, timezone);
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: this.clock.now() },
      include: NOTIFICATION_INCLUDE,
    });
    return this.toResponse(updated, timezone);
  }

  async markAllRead(complexId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { complexId, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return { updated: count };
  }

  private toResponse(
    row: NotificationRow,
    timezone: string,
  ): NotificationResponse {
    const { booking } = row;
    const { paidAmount, balance } = computePaymentSummary(
      booking.price,
      booking.payments,
    );
    const customerName = booking.customer
      ? [booking.customer.firstName, booking.customer.lastName]
          .filter(Boolean)
          .join(' ')
      : null;
    return {
      id: row.id,
      type: row.type,
      bookingId: row.bookingId,
      proofId: row.proofId,
      payerName: row.payerName,
      declaredAmount: row.declaredAmount,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      booking: {
        courtName: booking.court.name,
        startsAt: toComplexIso(booking.startsAt, timezone),
        customerName,
        price: booking.price,
        paidAmount,
        balance,
      },
    };
  }
}
