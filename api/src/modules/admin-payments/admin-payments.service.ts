import { Injectable } from '@nestjs/common';
import {
  BookingSource,
  BookingStatus,
  PaymentMethod,
  PaymentProofStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { customerSearch } from '../../shared/customers/customer-search';
import {
  BOOKING_DETAIL_INCLUDE,
  BookingWithPayments,
} from '../../shared/serializers/booking.serializer';
import {
  PAYMENT_LEDGER_INCLUDE,
  PAYMENT_PROOF_LEDGER_INCLUDE,
  PaymentLedgerRow,
  PaymentLedgerTotals,
  PaymentProofLedgerRow,
} from '../../shared/serializers/payment-ledger.serializer';
import { Clock } from '../../shared/time/clock';
import {
  addLocalDays,
  isValidLocalDate,
  localTimeToUtc,
  todayInTz,
} from '../../shared/time/tz';
import { ComplexService } from '../complex/complex.service';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';

export const ADMIN_PAYMENT_MESSAGES = {
  bookingNotFound: 'Reserva no encontrada.',
  notPayable: 'Esta reserva está cancelada; no admite pagos.',
  paymentNotFound: 'Pago no encontrado.',
  alreadyVoided: 'Este pago ya fue anulado.',
  validation: 'Revisá los datos ingresados.',
  invalidDate: 'La fecha no es válida',
  rangeInverted: 'El fin del rango no puede ser anterior al inicio',
};

/** Max proofs returned by the ledger (pending ones are not bound by `limit`). */
export const PROOFS_LEDGER_CAP = 200;

export interface PaymentLedger {
  range: { from: string; to: string };
  totals: PaymentLedgerTotals;
  payments: PaymentLedgerRow[];
  proofs: PaymentProofLedgerRow[];
}

/** Pagos por turno y listado de caja (docs/11-admin-payments.md). El estado de pago es derivado. */
@Injectable()
export class AdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complex: ComplexService,
    private readonly clock: Clock,
  ) {}

  /**
   * Caja: pagos por rango de `createdAt` (días locales inclusive; sin fechas → hoy).
   * Los totales salen de un `groupBy` sobre los vigentes de todo el período, independientes de `limit`.
   */
  async list(
    complexId: string,
    query: ListPaymentsDto,
  ): Promise<PaymentLedger> {
    const { timezone } = await this.complex.findByIdOrThrow(complexId);
    const range = this.resolveRange(query, timezone);

    const createdAt: Prisma.DateTimeFilter = {
      gte: localTimeToUtc(range.from, '00:00', timezone),
      lt: localTimeToUtc(addLocalDays(range.to, 1), '00:00', timezone),
    };
    const where: Prisma.PaymentWhereInput = {
      createdAt,
      ...(query.method ? { method: query.method } : {}),
      // Scope del complejo + búsqueda por cliente, ambos sobre la reserva.
      booking: {
        AND: [
          { court: { complexId } },
          ...(query.q ? [customerSearch(query.q)] : []),
        ],
      },
    };

    const [payments, proofs, groups] = await Promise.all([
      this.prisma.payment.findMany({
        where: { ...where, ...(query.voided ? {} : { voidedAt: null }) },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        include: PAYMENT_LEDGER_INCLUDE,
      }),
      this.listProofs(complexId, query, createdAt),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { ...where, voidedAt: null },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const totals: PaymentLedgerTotals = {
      collected: 0,
      cash: 0,
      transfer: 0,
      count: 0,
    };
    for (const group of groups) {
      const sum = group._sum.amount ?? 0;
      if (group.method === PaymentMethod.CASH) totals.cash += sum;
      else totals.transfer += sum;
      totals.collected += sum;
      totals.count += group._count._all;
    }

    return { range, totals, payments, proofs };
  }

  /**
   * Receipts shown next to the payments. PENDING ones always (any date: they need action);
   * REJECTED only with `voided`, inside the date range. APPROVED are skipped (their Payment is
   * already a row). Proofs are TRANSFER-only, so `method=CASH` hides them. `q` also matches the
   * payer name. Capped at PROOFS_LEDGER_CAP; `limit` applies to payments only.
   */
  private async listProofs(
    complexId: string,
    query: ListPaymentsDto,
    createdAt: Prisma.DateTimeFilter,
  ): Promise<PaymentProofLedgerRow[]> {
    if (query.method === PaymentMethod.CASH) return [];
    const statuses: Prisma.PaymentProofWhereInput[] = [
      { status: PaymentProofStatus.PENDING },
      ...(query.voided
        ? [{ status: PaymentProofStatus.REJECTED, createdAt }]
        : []),
    ];
    return this.prisma.paymentProof.findMany({
      where: {
        AND: [
          { booking: { court: { complexId } } },
          { OR: statuses },
          ...(query.q
            ? [
                {
                  OR: [
                    {
                      payerName: { contains: query.q, mode: 'insensitive' },
                    },
                    { booking: customerSearch(query.q) },
                  ],
                } satisfies Prisma.PaymentProofWhereInput,
              ]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PROOFS_LEDGER_CAP,
      include: PAYMENT_PROOF_LEDGER_INCLUDE,
    });
  }

  /** `date` manda; si no, `from`/`to` se completan entre sí; sin nada, hoy. Valida días reales y orden. */
  private resolveRange(
    query: ListPaymentsDto,
    timezone: string,
  ): { from: string; to: string } {
    const invalid = (field: string) =>
      new AppException(
        ErrorCode.VALIDATION_ERROR,
        ADMIN_PAYMENT_MESSAGES.validation,
        { [field]: [ADMIN_PAYMENT_MESSAGES.invalidDate] },
      );

    if (query.date) {
      if (!isValidLocalDate(query.date)) throw invalid('date');
      return { from: query.date, to: query.date };
    }
    if (query.from && !isValidLocalDate(query.from)) throw invalid('from');
    if (query.to && !isValidLocalDate(query.to)) throw invalid('to');

    const from = query.from ?? query.to;
    if (!from) {
      const today = todayInTz(this.clock.now(), timezone);
      return { from: today, to: today };
    }
    const to = query.to ?? from;
    if (to < from) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        ADMIN_PAYMENT_MESSAGES.validation,
        { to: [ADMIN_PAYMENT_MESSAGES.rangeInverted] },
      );
    }
    return { from, to };
  }

  /** PENDING y CONFIRMED aceptan pagos; CANCELLED no. Sin tope: el sobrepago queda como saldo a favor. */
  async register(
    complexId: string,
    adminId: string,
    bookingId: string,
    dto: RegisterPaymentDto,
  ): Promise<BookingWithPayments> {
    await this.createPayment(this.prisma, complexId, adminId, bookingId, dto);
    return this.reloadDetail(bookingId);
  }

  /**
   * Single source of the payment-registration rules (scope, tournament and cancelled guards).
   * `db` lets callers (e.g. proof approval) run it inside their own transaction.
   */
  async createPayment(
    db: Prisma.TransactionClient,
    complexId: string,
    adminId: string,
    bookingId: string,
    data: { amount: number; method: PaymentMethod; note?: string },
  ): Promise<void> {
    const booking = await this.findBookingOrThrow(db, complexId, bookingId);
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_PAYABLE,
        ADMIN_PAYMENT_MESSAGES.notPayable,
      );
    }

    await db.payment.create({
      data: {
        bookingId,
        amount: data.amount,
        method: data.method,
        note: data.note ?? null,
        registeredById: adminId,
        createdAt: this.clock.now(),
      },
    });
  }

  /** Anular es soft y se permite en cualquier estado de la reserva (corrige errores de carga). */
  async void(
    complexId: string,
    adminId: string,
    bookingId: string,
    paymentId: string,
    reason?: string,
  ): Promise<BookingWithPayments> {
    await this.findBookingOrThrow(this.prisma, complexId, bookingId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, bookingId },
    });
    if (!payment) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        ADMIN_PAYMENT_MESSAGES.paymentNotFound,
      );
    }
    if (payment.voidedAt) {
      throw new AppException(
        ErrorCode.PAYMENT_ALREADY_VOIDED,
        ADMIN_PAYMENT_MESSAGES.alreadyVoided,
      );
    }

    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, bookingId, voidedAt: null },
      data: {
        voidedAt: this.clock.now(),
        voidedById: adminId,
        voidReason: reason ?? null,
      },
    });
    if (count === 0) {
      throw new AppException(
        ErrorCode.PAYMENT_ALREADY_VOIDED,
        ADMIN_PAYMENT_MESSAGES.alreadyVoided,
      );
    }

    return this.reloadDetail(bookingId);
  }

  /** Reserva del complejo, o 404 (misma respuesta para una inexistente y para una ajena). */
  private async findBookingOrThrow(
    db: Prisma.TransactionClient,
    complexId: string,
    bookingId: string,
  ): Promise<{ id: string; status: BookingStatus; source: BookingSource }> {
    const booking = await db.booking.findFirst({
      where: { id: bookingId, court: { complexId } },
      select: { id: true, status: true, source: true },
    });
    if (!booking) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        ADMIN_PAYMENT_MESSAGES.bookingNotFound,
      );
    }
    return booking;
  }

  private reloadDetail(bookingId: string): Promise<BookingWithPayments> {
    return this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: BOOKING_DETAIL_INCLUDE,
    });
  }
}
