import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  PaymentMethod,
  PaymentProofStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { Clock } from '../../shared/time/clock';
import {
  addLocalMonths,
  localTimeToUtc,
  todayInTz,
} from '../../shared/time/tz';
import {
  COMPLEX_NOT_FOUND_MESSAGE,
  ComplexService,
} from '../complex/complex.service';

/** Complex summary for the platform panel (docs/26-super-admin.md). */
export interface SuperAdminComplexResponse {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  /** null = active. */
  suspendedAt: Date | null;
  /** Month the stats refer to (YYYY-MM, complex timezone). */
  month: string;
  /** Non-cancelled bookings starting in the month. */
  bookingsCount: number;
  /** Payment proofs (any status) attached to those bookings. */
  proofsCount: number;
  approvedProofsCount: number;
  /** null when there are no bookings. */
  proofsPerBooking: number | null;
  approvedProofsPerBooking: number | null;
}

/** Revenue of one complex in a month, per booking (docs/26-super-admin.md). */
export interface SuperAdminRevenueBooking {
  id: string;
  startsAt: string;
  courtName: string;
  customerName: string | null;
  price: number;
  /** Non-voided TRANSFER payments (approved payment proofs). */
  transferAmount: number;
  /** Non-voided CASH payments. */
  cashAmount: number;
  paidTotal: number;
  /** price - paidTotal (negative when overpaid). */
  balance: number;
}

export interface SuperAdminRevenueResponse {
  complex: {
    id: string;
    name: string;
    slug: string;
    suspendedAt: Date | null;
    timezone: string;
  };
  /** YYYY-MM, complex timezone. */
  month: string;
  bookings: SuperAdminRevenueBooking[];
  totals: {
    bookingsCount: number;
    transferTotal: number;
    cashTotal: number;
    paidTotal: number;
  };
}

const COMPLEX_SELECT = {
  id: true,
  slug: true,
  name: true,
  timezone: true,
  createdAt: true,
  suspendedAt: true,
  courts: { select: { id: true } },
} satisfies Prisma.ComplexSelect;

type ComplexRow = Prisma.ComplexGetPayload<{ select: typeof COMPLEX_SELECT }>;

interface Counts {
  bookings: number;
  proofs: number;
  approved: number;
}

const EMPTY: Counts = { bookings: 0, proofs: 0, approved: 0 };

const ratio = (n: number, d: number): number | null =>
  d === 0 ? null : Math.round((n / d) * 100) / 100;

/** Platform-wide complex management for SUPER_ADMIN. */
@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly complex: ComplexService,
  ) {}

  /**
   * Every complex with its monthly stats. Month bounds depend on each complex timezone, so the
   * stats queries run once per distinct timezone (typically one), never once per complex.
   */
  async listComplexes(month?: string): Promise<SuperAdminComplexResponse[]> {
    const rows = await this.prisma.complex.findMany({
      select: COMPLEX_SELECT,
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
    return this.summarize(rows, month);
  }

  /** Sets or clears `suspendedAt`. Suspending an already suspended complex keeps its date. */
  async setSuspension(
    id: string,
    suspended: boolean,
  ): Promise<SuperAdminComplexResponse> {
    const current = await this.prisma.complex.findUnique({
      where: { id },
      select: COMPLEX_SELECT,
    });
    if (!current) {
      throw new AppException(ErrorCode.NOT_FOUND, COMPLEX_NOT_FOUND_MESSAGE);
    }
    const suspendedAt = suspended
      ? (current.suspendedAt ?? this.clock.now())
      : null;
    const updated = await this.prisma.complex.update({
      where: { id },
      data: { suspendedAt },
      select: COMPLEX_SELECT,
    });
    // Public endpoints read the cached complex: drop it so the change applies immediately.
    this.complex.invalidate(id);
    const [summary] = await this.summarize([updated]);
    return summary;
  }

  /** Per-booking revenue split into transfer vs cash for one complex and month. */
  async revenueFor(
    id: string,
    month?: string,
  ): Promise<SuperAdminRevenueResponse> {
    const complex = await this.prisma.complex.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        suspendedAt: true,
      },
    });
    if (!complex) {
      throw new AppException(ErrorCode.NOT_FOUND, COMPLEX_NOT_FOUND_MESSAGE);
    }
    const targetMonth =
      month ?? todayInTz(this.clock.now(), complex.timezone).slice(0, 7);
    const first = `${targetMonth}-01`;

    const rows = await this.prisma.booking.findMany({
      where: {
        court: { complexId: id },
        status: { not: BookingStatus.CANCELLED },
        startsAt: {
          gte: localTimeToUtc(first, '00:00', complex.timezone),
          lt: localTimeToUtc(
            addLocalMonths(first, 1),
            '00:00',
            complex.timezone,
          ),
        },
      },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        startsAt: true,
        price: true,
        court: { select: { name: true } },
        customer: { select: { firstName: true, lastName: true } },
        payments: {
          where: { voidedAt: null },
          select: { amount: true, method: true },
        },
      },
    });

    const totals = {
      bookingsCount: rows.length,
      transferTotal: 0,
      cashTotal: 0,
      paidTotal: 0,
    };
    const bookings = rows.map((b): SuperAdminRevenueBooking => {
      let transferAmount = 0;
      let cashAmount = 0;
      for (const p of b.payments) {
        if (p.method === PaymentMethod.TRANSFER) transferAmount += p.amount;
        else cashAmount += p.amount;
      }
      const paidTotal = transferAmount + cashAmount;
      totals.transferTotal += transferAmount;
      totals.cashTotal += cashAmount;
      totals.paidTotal += paidTotal;
      const customerName = b.customer
        ? [b.customer.firstName, b.customer.lastName].filter(Boolean).join(' ')
        : null;
      return {
        id: b.id,
        startsAt: b.startsAt.toISOString(),
        courtName: b.court.name,
        customerName,
        price: b.price,
        transferAmount,
        cashAmount,
        paidTotal,
        balance: b.price - paidTotal,
      };
    });

    return {
      complex: {
        id: complex.id,
        name: complex.name,
        slug: complex.slug,
        suspendedAt: complex.suspendedAt,
        timezone: complex.timezone,
      },
      month: targetMonth,
      bookings,
      totals,
    };
  }

  private async summarize(
    rows: ComplexRow[],
    month?: string,
  ): Promise<SuperAdminComplexResponse[]> {
    const byTimezone = new Map<string, ComplexRow[]>();
    for (const row of rows) {
      byTimezone.set(row.timezone, [
        ...(byTimezone.get(row.timezone) ?? []),
        row,
      ]);
    }

    const countsByComplex = new Map<string, Counts>();
    const monthByComplex = new Map<string, string>();
    for (const [timezone, group] of byTimezone) {
      const groupMonth =
        month ?? todayInTz(this.clock.now(), timezone).slice(0, 7);
      const counts = await this.countsFor(group, timezone, groupMonth);
      for (const row of group) {
        monthByComplex.set(row.id, groupMonth);
        countsByComplex.set(row.id, counts.get(row.id) ?? EMPTY);
      }
    }

    return rows.map((row) => {
      const counts = countsByComplex.get(row.id) ?? EMPTY;
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        createdAt: row.createdAt,
        suspendedAt: row.suspendedAt,
        month: monthByComplex.get(row.id) as string,
        bookingsCount: counts.bookings,
        proofsCount: counts.proofs,
        approvedProofsCount: counts.approved,
        proofsPerBooking: ratio(counts.proofs, counts.bookings),
        approvedProofsPerBooking: ratio(counts.approved, counts.bookings),
      };
    });
  }

  private async countsFor(
    group: ComplexRow[],
    timezone: string,
    month: string,
  ): Promise<Map<string, Counts>> {
    const complexByCourt = new Map<string, string>();
    for (const row of group) {
      for (const court of row.courts) complexByCourt.set(court.id, row.id);
    }
    const result = new Map<string, Counts>();
    const courtIds = [...complexByCourt.keys()];
    if (courtIds.length === 0) return result;

    const first = `${month}-01`;
    const bookingWhere: Prisma.BookingWhereInput = {
      courtId: { in: courtIds },
      status: { not: BookingStatus.CANCELLED },
      startsAt: {
        gte: localTimeToUtc(first, '00:00', timezone),
        lt: localTimeToUtc(addLocalMonths(first, 1), '00:00', timezone),
      },
    };

    const [bookings, proofs] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['courtId'],
        where: bookingWhere,
        _count: { _all: true },
      }),
      // Prisma cannot groupBy across a relation, so proofs are read as (status, courtId) pairs.
      this.prisma.paymentProof.findMany({
        where: { booking: bookingWhere },
        select: { status: true, booking: { select: { courtId: true } } },
      }),
    ]);

    const entry = (courtId: string): Counts | undefined => {
      const complexId = complexByCourt.get(courtId);
      if (!complexId) return undefined;
      let counts = result.get(complexId);
      if (!counts) {
        counts = { bookings: 0, proofs: 0, approved: 0 };
        result.set(complexId, counts);
      }
      return counts;
    };
    for (const b of bookings) {
      const counts = entry(b.courtId);
      if (counts) counts.bookings += b._count._all;
    }
    for (const p of proofs) {
      const counts = entry(p.booking.courtId);
      if (!counts) continue;
      counts.proofs += 1;
      if (p.status === PaymentProofStatus.APPROVED) counts.approved += 1;
    }
    return result;
  }
}
