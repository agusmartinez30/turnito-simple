import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  BookingStatus,
  Complex,
  PaymentProofStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { computePaymentSummary } from '../../shared/payments/payment-summary';
import { toComplexIso } from '../../shared/time/tz';
import {
  detectPaymentProofType,
  PaymentProofType,
} from '../storage/payment-proof-type';
import { STORAGE_PROVIDER_TOKEN } from '../storage/providers/storage-provider.interface';
import type { IStorageProvider } from '../storage/providers/storage-provider.interface';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { CreatePaymentProofDto } from './dto/create-payment-proof.dto';

export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;
export const PAYMENT_PROOF_FIELD = 'file';

export const PUBLIC_PAYMENT_MESSAGES = {
  notFound: 'Reserva no encontrada.',
  notPayable: 'Esta reserva no admite pagos.',
  alreadyPaid: 'Esta reserva ya está paga.',
  fileRequired: 'Elegí un archivo',
  unsupportedType: 'El comprobante tiene que ser un PDF, JPG o PNG.',
  validation: 'Datos inválidos.',
  amountOverRemaining: (remaining: number) =>
    `El monto no puede superar el saldo restante ($${remaining}).`,
};

/**
 * Public view of a booking's payment. Per-payer data (names, individual amounts, reject
 * reasons) is deliberately NOT exposed: the booking UUID is the only key of this endpoint.
 */
export interface PublicPaymentResponse {
  bank: {
    cbu: string | null;
    alias: string | null;
    holderName: string | null;
  };
  booking: {
    id: string;
    courtName: string;
    startsAt: string;
    endsAt: string;
    price: number;
    /** Σ non-voided payments registered by the club. */
    paidAmount: number;
    /** price - paidAmount (min 0); ignores proofs awaiting review. */
    pendingAmount: number;
    /** Σ declared amounts of PENDING proofs (visual discount only). */
    pendingProofsAmount: number;
    /** price - paidAmount - pendingProofsAmount (min 0): what can still be declared. */
    remaining: number;
    /** True when paid + pending proofs already cover the price. */
    fullyCovered: boolean;
  };
  proofs: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
  };
}

interface ProofTotals {
  pendingAmount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

type PaymentRows = ReadonlyArray<{ amount: number; voidedAt?: Date | null }>;

/** Public payment link of a booking (docs/23-public-payment-link.md). The booking UUID is the key. */
@Injectable()
export class PublicPaymentService {
  private readonly logger = new Logger(PublicPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storage: IStorageProvider,
    @Optional() private readonly realtime?: RealtimeEmitter,
  ) {}

  async view(
    complex: Complex,
    bookingId: string,
  ): Promise<PublicPaymentResponse> {
    const booking = await this.findPayableOrThrow(complex, bookingId);
    const totals = await this.proofTotals(this.prisma, bookingId);
    return this.toResponse(complex, booking, totals);
  }

  async uploadProof(
    complex: Complex,
    bookingId: string,
    dto: CreatePaymentProofDto,
    file?: Express.Multer.File,
  ): Promise<PublicPaymentResponse> {
    const booking = await this.findPayableOrThrow(complex, bookingId);
    this.assertFile(file);
    const type = this.detectType(file);
    // Early (lock-free) check so an invalid amount never uploads a file.
    this.assertAmountFits(
      booking.price,
      booking.payments,
      await this.proofTotals(this.prisma, bookingId),
      dto.amount,
    );

    const key = `payment-proofs/${bookingId}/${randomBytes(8).toString('hex')}.${type.extension}`;
    await this.storage.uploadPrivate({
      key,
      body: file.buffer,
      contentType: type.contentType,
      bucket: 'paymentProofs',
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        // Row lock: uploads for this booking are serialized, so racing requests
        // cannot both pass the remaining check below.
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
        const fresh = await tx.booking.findUniqueOrThrow({
          where: { id: bookingId },
          select: {
            status: true,
            price: true,
            payments: { select: { amount: true, voidedAt: true } },
          },
        });
        if (fresh.status === BookingStatus.CANCELLED) {
          throw new AppException(
            ErrorCode.BOOKING_NOT_PAYABLE,
            PUBLIC_PAYMENT_MESSAGES.notPayable,
          );
        }
        this.assertAmountFits(
          fresh.price,
          fresh.payments,
          await this.proofTotals(tx, bookingId),
          dto.amount,
        );
        await tx.paymentProof.create({
          data: {
            bookingId,
            fileKey: key,
            payerName: dto.payerName,
            playersCount: dto.playersCount ?? null,
            declaredAmount: dto.amount,
          },
        });
      });
    } catch (error) {
      await this.removeQuietly(key);
      throw error;
    }
    this.realtime?.paymentChanged({
      complexId: complex.id,
      bookingId,
      kind: 'proof_submitted',
    });
    return this.view(complex, bookingId);
  }

  /** remaining <= 0 -> not payable; amount above remaining -> field validation error. */
  private assertAmountFits(
    price: number,
    payments: PaymentRows,
    totals: ProofTotals,
    amount: number,
  ): void {
    const remaining = this.remaining(price, payments, totals);
    if (remaining <= 0) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_PAYABLE,
        PUBLIC_PAYMENT_MESSAGES.alreadyPaid,
      );
    }
    if (amount > remaining) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        PUBLIC_PAYMENT_MESSAGES.validation,
        { amount: [PUBLIC_PAYMENT_MESSAGES.amountOverRemaining(remaining)] },
      );
    }
  }

  private remaining(
    price: number,
    payments: PaymentRows,
    totals: ProofTotals,
  ): number {
    const { paidAmount } = computePaymentSummary(price, payments);
    return Math.max(0, price - paidAmount - totals.pendingAmount);
  }

  private async proofTotals(
    db: Prisma.TransactionClient | PrismaService,
    bookingId: string,
  ): Promise<ProofTotals> {
    const groups = await db.paymentProof.groupBy({
      by: ['status'],
      where: { bookingId },
      _count: { _all: true },
      _sum: { declaredAmount: true },
    });
    const totals: ProofTotals = {
      pendingAmount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    };
    for (const g of groups) {
      if (g.status === PaymentProofStatus.PENDING) {
        totals.pendingCount = g._count._all;
        totals.pendingAmount = g._sum.declaredAmount ?? 0;
      } else if (g.status === PaymentProofStatus.APPROVED) {
        totals.approvedCount = g._count._all;
      } else {
        totals.rejectedCount = g._count._all;
      }
    }
    return totals;
  }

  private assertFile(
    file?: Express.Multer.File,
  ): asserts file is Express.Multer.File {
    if (!file?.buffer?.length || !file.originalname) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        PUBLIC_PAYMENT_MESSAGES.validation,
        { [PAYMENT_PROOF_FIELD]: [PUBLIC_PAYMENT_MESSAGES.fileRequired] },
      );
    }
  }

  /** Extension AND magic bytes must agree; returns the real type to store. */
  private detectType(file: Express.Multer.File): PaymentProofType {
    const type = detectPaymentProofType(file.originalname, file.buffer);
    if (!type) {
      throw new AppException(
        ErrorCode.UNSUPPORTED_FILE_TYPE,
        PUBLIC_PAYMENT_MESSAGES.unsupportedType,
      );
    }
    return type;
  }

  private async findPayableOrThrow(complex: Complex, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, court: { complexId: complex.id } },
      include: {
        court: { select: { name: true } },
        payments: { select: { amount: true, voidedAt: true } },
      },
    });
    if (!booking) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        PUBLIC_PAYMENT_MESSAGES.notFound,
      );
    }
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_PAYABLE,
        PUBLIC_PAYMENT_MESSAGES.notPayable,
      );
    }
    return booking;
  }

  private toResponse(
    complex: Complex,
    booking: Awaited<ReturnType<PublicPaymentService['findPayableOrThrow']>>,
    totals: ProofTotals,
  ): PublicPaymentResponse {
    const summary = computePaymentSummary(booking.price, booking.payments);
    const remaining = this.remaining(booking.price, booking.payments, totals);
    return {
      bank: {
        cbu: complex.bankCbu,
        alias: complex.bankAlias,
        holderName: complex.bankHolderName,
      },
      booking: {
        id: booking.id,
        courtName: booking.court.name,
        startsAt: toComplexIso(booking.startsAt, complex.timezone),
        endsAt: toComplexIso(booking.endsAt, complex.timezone),
        price: booking.price,
        paidAmount: summary.paidAmount,
        pendingAmount: Math.max(0, summary.balance),
        pendingProofsAmount: totals.pendingAmount,
        remaining,
        fullyCovered: remaining <= 0,
      },
      proofs: {
        pendingCount: totals.pendingCount,
        approvedCount: totals.approvedCount,
        rejectedCount: totals.rejectedCount,
      },
    };
  }

  /** Best-effort: an orphaned private file must not mask the original DB error. */
  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.removePrivate(key, 'paymentProofs');
    } catch (error) {
      this.logger.warn(`No se pudo borrar ${key}: ${String(error)}`);
    }
  }
}
