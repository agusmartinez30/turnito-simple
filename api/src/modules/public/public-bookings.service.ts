import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  Complex,
  PaymentProofStatus,
  Sport,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computePaymentSummary,
  PaymentStatus,
} from '../../shared/payments/payment-summary';
import { Clock } from '../../shared/time/clock';
import {
  addLocalDays,
  localTimeToUtc,
  toComplexIso,
  todayInTz,
} from '../../shared/time/tz';

/**
 * Minimal public view of a recent booking, so players can find theirs at the venue.
 * Deliberately NO phone, email, notes, user ids or bank data.
 */
export interface PublicBookingListItem {
  id: string;
  court: { name: string; sport: Sport };
  startsAt: string;
  endsAt: string;
  price: number;
  /** Full name of the person who booked; null for counter bookings without customer. */
  customerName: string | null;
  payment: {
    paidAmount: number;
    status: PaymentStatus;
    /** True when a proof is awaiting review by the complex. */
    hasPendingProof: boolean;
  };
}

/** Public list of recent bookings (today + yesterday in the complex timezone). */
@Injectable()
export class PublicBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * Only CONFIRMED, not fully paid bookings: PENDING requests are not yet agreed with the complex (and expire),
   * CANCELLED ones cannot be paid.
   */
  async list(complex: Complex): Promise<PublicBookingListItem[]> {
    const today = todayInTz(this.clock.now(), complex.timezone);
    const from = localTimeToUtc(
      addLocalDays(today, -1),
      '00:00',
      complex.timezone,
    );
    const to = localTimeToUtc(
      addLocalDays(today, 1),
      '00:00',
      complex.timezone,
    );

    const rows = await this.prisma.booking.findMany({
      where: {
        court: { complexId: complex.id },
        status: BookingStatus.CONFIRMED,
        startsAt: { gte: from, lt: to },
      },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        price: true,
        court: { select: { name: true, sport: true } },
        customer: { select: { firstName: true, lastName: true } },
        payments: { select: { amount: true, voidedAt: true } },
        paymentProofs: {
          where: { status: PaymentProofStatus.PENDING },
          select: { id: true },
          take: 1,
        },
      },
    });

    // Fully paid bookings have nothing left to do at the venue: hide them.
    const open = rows.flatMap((b) => {
      const summary = computePaymentSummary(b.price, b.payments);
      return summary.status === 'PAID' ? [] : [{ b, summary }];
    });

    return open.map(({ b, summary }) => {
      return {
        id: b.id,
        court: { name: b.court.name, sport: b.court.sport },
        startsAt: toComplexIso(b.startsAt, complex.timezone),
        endsAt: toComplexIso(b.endsAt, complex.timezone),
        price: b.price,
        customerName: b.customer
          ? [b.customer.firstName, b.customer.lastName]
              .filter(Boolean)
              .join(' ')
          : null,
        payment: {
          paidAmount: summary.paidAmount,
          status: summary.status,
          hasPendingProof: b.paymentProofs.length > 0,
        },
      };
    });
  }
}
