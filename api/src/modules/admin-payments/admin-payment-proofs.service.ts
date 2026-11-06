import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentProofStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { computePaymentSummary } from '../../shared/payments/payment-summary';
import { Clock } from '../../shared/time/clock';
import { STORAGE_PROVIDER_TOKEN } from '../storage/providers/storage-provider.interface';
import type { IStorageProvider } from '../storage/providers/storage-provider.interface';
import { AdminPaymentsService } from './admin-payments.service';

/** Receipts are private; the signed URL lives only as long as the viewer needs it. */
export const PROOF_SIGNED_URL_TTL_SEC = 10 * 60;

export const ADMIN_PROOF_MESSAGES = {
  notFound: 'Comprobante no encontrado.',
  bookingNotFound: 'Reserva no encontrada.',
  notPending: 'Este comprobante ya fue revisado.',
  alreadyPaid: 'Esta reserva ya está paga.',
  approvedNote: 'Comprobante de transferencia aprobado',
};

export interface PaymentProofResponse {
  id: string;
  status: PaymentProofStatus;
  payerName: string;
  playersCount: number | null;
  /** Pesos the payer says the receipt supports (0 on legacy rows). */
  declaredAmount: number;
  /** Amount approved by the admin; null until approval. */
  amount: number | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
}

interface ProofRow {
  id: string;
  status: PaymentProofStatus;
  payerName: string;
  playersCount: number | null;
  declaredAmount: number;
  amount: number | null;
  createdAt: Date;
  reviewedAt: Date | null;
  rejectReason: string | null;
}

const toResponse = (p: ProofRow): PaymentProofResponse => ({
  id: p.id,
  status: p.status,
  payerName: p.payerName,
  playersCount: p.playersCount,
  declaredAmount: p.declaredAmount,
  amount: p.amount,
  createdAt: p.createdAt.toISOString(),
  reviewedAt: p.reviewedAt?.toISOString() ?? null,
  rejectReason: p.rejectReason,
});

/** Admin review of the receipts uploaded from the public payment link (docs/23-public-payment-link.md). */
@Injectable()
export class AdminPaymentProofsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: AdminPaymentsService,
    private readonly clock: Clock,
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storage: IStorageProvider,
  ) {}

  async list(
    complexId: string,
    bookingId: string,
  ): Promise<PaymentProofResponse[]> {
    await this.assertBooking(complexId, bookingId);
    const rows = await this.prisma.paymentProof.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toResponse);
  }

  async fileUrl(
    complexId: string,
    bookingId: string,
    proofId: string,
  ): Promise<{ url: string }> {
    const proof = await this.findProofOrThrow(complexId, bookingId, proofId);
    return {
      url: await this.storage.signedUrl(
        proof.fileKey,
        PROOF_SIGNED_URL_TTL_SEC,
        'paymentProofs',
      ),
    };
  }

  /** Marks the proof APPROVED and registers the TRANSFER payment in one transaction. */
  async approve(
    complexId: string,
    adminId: string,
    bookingId: string,
    proofId: string,
    amount?: number,
  ): Promise<PaymentProofResponse> {
    const proof = await this.findProofOrThrow(complexId, bookingId, proofId);
    this.assertPending(proof.status);

    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        price: true,
        payments: { select: { amount: true, voidedAt: true } },
      },
    });
    const pending = computePaymentSummary(booking.price, booking.payments);
    // Default = what the receipt declares, never above the current balance (the club may have
    // registered cash meanwhile). Legacy rows (declaredAmount 0) fall back to the balance.
    const balance = Math.max(0, pending.balance);
    const approvedAmount =
      amount ??
      (proof.declaredAmount > 0
        ? Math.min(proof.declaredAmount, balance)
        : balance);
    if (approvedAmount <= 0) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_PAYABLE,
        ADMIN_PROOF_MESSAGES.alreadyPaid,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Conditional update: a concurrent review makes count 0 and aborts before any payment.
      const { count } = await tx.paymentProof.updateMany({
        where: { id: proofId, status: PaymentProofStatus.PENDING },
        data: {
          status: PaymentProofStatus.APPROVED,
          amount: approvedAmount,
          reviewedAt: this.clock.now(),
          reviewedById: adminId,
        },
      });
      if (count === 0) this.throwNotPending();

      await this.payments.createPayment(tx, complexId, adminId, bookingId, {
        amount: approvedAmount,
        method: PaymentMethod.TRANSFER,
        note: ADMIN_PROOF_MESSAGES.approvedNote,
        payerName: proof.payerName,
        proofId: proof.id,
      });
      return tx.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
    });
    return toResponse(updated);
  }

  async reject(
    complexId: string,
    adminId: string,
    bookingId: string,
    proofId: string,
    reason: string,
  ): Promise<PaymentProofResponse> {
    const proof = await this.findProofOrThrow(complexId, bookingId, proofId);
    this.assertPending(proof.status);

    const { count } = await this.prisma.paymentProof.updateMany({
      where: { id: proofId, status: PaymentProofStatus.PENDING },
      data: {
        status: PaymentProofStatus.REJECTED,
        rejectReason: reason,
        reviewedAt: this.clock.now(),
        reviewedById: adminId,
      },
    });
    if (count === 0) this.throwNotPending();

    return toResponse(
      await this.prisma.paymentProof.findUniqueOrThrow({
        where: { id: proofId },
      }),
    );
  }

  private assertPending(status: PaymentProofStatus): void {
    if (status !== PaymentProofStatus.PENDING) this.throwNotPending();
  }

  private throwNotPending(): never {
    throw new AppException(
      ErrorCode.PAYMENT_PROOF_NOT_PENDING,
      ADMIN_PROOF_MESSAGES.notPending,
    );
  }

  private async assertBooking(
    complexId: string,
    bookingId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, court: { complexId } },
      select: { id: true },
    });
    if (!booking) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        ADMIN_PROOF_MESSAGES.bookingNotFound,
      );
    }
  }

  /** Proof of a booking of this complex, or 404 (same answer for unknown and foreign). */
  private async findProofOrThrow(
    complexId: string,
    bookingId: string,
    proofId: string,
  ) {
    const proof = await this.prisma.paymentProof.findFirst({
      where: { id: proofId, bookingId, booking: { court: { complexId } } },
    });
    if (!proof) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        ADMIN_PROOF_MESSAGES.notFound,
      );
    }
    return proof;
  }
}
