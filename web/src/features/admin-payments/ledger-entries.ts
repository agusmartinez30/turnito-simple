import type { PaymentLedgerRow, PaymentProofLedgerRow } from '@/types/admin';

/** One row of the unified cash ledger: a collected payment or a payment proof. */
export type LedgerEntry =
  | { kind: 'PAYMENT'; row: PaymentLedgerRow }
  | { kind: 'PROOF'; row: PaymentProofLedgerRow };

const byCreatedAtDesc = (a: LedgerEntry, b: LedgerEntry) =>
  b.row.createdAt.localeCompare(a.row.createdAt);

/**
 * Merges payments and proofs into one list: PENDING proofs pinned on top (they need action),
 * then everything else by `createdAt` desc. ISO strings with the same offset sort lexically.
 */
export function buildLedgerEntries(
  payments: PaymentLedgerRow[],
  proofs: PaymentProofLedgerRow[],
): LedgerEntry[] {
  const pending: LedgerEntry[] = [];
  const rest: LedgerEntry[] = payments.map((row) => ({
    kind: 'PAYMENT',
    row,
  }));
  for (const row of proofs) {
    (row.status === 'PENDING' ? pending : rest).push({ kind: 'PROOF', row });
  }
  return [...pending.sort(byCreatedAtDesc), ...rest.sort(byCreatedAtDesc)];
}
