import { api } from '@/lib/api/client';

/** Public (no auth) payment link of a booking. The booking UUID is the key. */

export interface PublicPayment {
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
    /** Σ payments registered by the club. */
    paidAmount: number;
    /** price - paidAmount; ignores receipts awaiting review. */
    pendingAmount: number;
    /** Σ declared amounts of receipts awaiting review (visual discount only). */
    pendingProofsAmount: number;
    /** price - paidAmount - pendingProofsAmount: what can still be declared. */
    remaining: number;
    /** Paid + receipts in review already cover the price. */
    fullyCovered: boolean;
  };
  /** Counts only: no names or amounts of other payers are exposed. */
  proofs: {
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
  };
}

export interface UploadPaymentProofInput {
  file: File;
  payerName: string;
  /** Optional: how many players this transfer covers. */
  playersCount?: number;
  /** Pesos the receipt supports (<= remaining). */
  amount: number;
}

const base = (slug: string, id: string) =>
  `/public/c/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(id)}/payment`;

export function getPublicPayment(
  slug: string,
  id: string,
): Promise<PublicPayment> {
  return api.get<PublicPayment>(base(slug, id), { auth: false });
}

export function uploadPaymentProof(
  slug: string,
  id: string,
  input: UploadPaymentProofInput,
): Promise<PublicPayment> {
  const form = new FormData();
  form.append('payerName', input.payerName);
  if (input.playersCount !== undefined) {
    form.append('playersCount', String(input.playersCount));
  }
  form.append('amount', String(input.amount));
  form.append('file', input.file, input.file.name);
  return api.post<PublicPayment>(`${base(slug, id)}-proof`, {
    body: form,
    auth: false,
  });
}
