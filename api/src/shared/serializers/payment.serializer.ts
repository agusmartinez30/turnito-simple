import { Payment, PaymentMethod, Prisma, User } from '@prisma/client';
import { toComplexIso } from '../time/tz';

/** Pagos completos (incl. anulados) con quién los cargó / anuló. Solo el detalle de una reserva. */
export const PAYMENT_INCLUDE = {
  registeredBy: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Payment & {
  registeredBy: Pick<User, 'id' | 'name'>;
  voidedBy: Pick<User, 'id' | 'name'> | null;
};

/** Contrato `Payment` (web/docs/12-admin-payments.md). */
export interface PaymentResponse {
  id: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  createdAt: string; // ISO con offset del complejo
  registeredBy: { id: string; name: string };
  voidedAt?: string;
  voidedBy?: { id: string; name: string };
  voidReason?: string;
}

export function toPaymentResponse(
  payment: PaymentWithRelations,
  timezone: string,
): PaymentResponse {
  return {
    id: payment.id,
    amount: payment.amount,
    method: payment.method,
    ...(payment.note ? { note: payment.note } : {}),
    createdAt: toComplexIso(payment.createdAt, timezone),
    registeredBy: {
      id: payment.registeredBy.id,
      name: payment.registeredBy.name,
    },
    ...(payment.voidedAt
      ? { voidedAt: toComplexIso(payment.voidedAt, timezone) }
      : {}),
    ...(payment.voidedBy
      ? { voidedBy: { id: payment.voidedBy.id, name: payment.voidedBy.name } }
      : {}),
    ...(payment.voidReason ? { voidReason: payment.voidReason } : {}),
  };
}
