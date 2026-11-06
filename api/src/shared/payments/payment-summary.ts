export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

/** Contrato `PaymentSummary` (web/docs/12-admin-payments.md). */
export interface PaymentSummary {
  paidAmount: number; // Σ pagos no anulados
  balance: number; // price - paidAmount; negativo = saldo a favor
  status: PaymentStatus;
}

/** Solo cuentan los pagos con `voidedAt` null. Un turno con price 0 está PAID. */
export function computePaymentSummary(
  price: number,
  payments: ReadonlyArray<{ amount: number; voidedAt?: Date | null }>,
): PaymentSummary {
  let paidAmount = 0;
  for (const payment of payments) {
    if (!payment.voidedAt) paidAmount += payment.amount;
  }
  const balance = price - paidAmount;
  const status: PaymentStatus =
    paidAmount >= price ? 'PAID' : paidAmount === 0 ? 'UNPAID' : 'PARTIAL';
  return { paidAmount, balance, status };
}
