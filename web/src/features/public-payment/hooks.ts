'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicSlug } from '@/features/public-request/hooks';
import { isApiError } from '@/lib/api/errors';
import {
  getPublicPayment,
  uploadPaymentProof,
  type PublicPayment,
  type UploadPaymentProofInput,
} from './api';

export const paymentKey = (slug: string, id: string) =>
  ['public', slug, 'payment', id] as const;

/** Polls every 30 s while at least one receipt is waiting for review. */
export function usePublicPayment(id: string) {
  const slug = usePublicSlug();
  return useQuery<PublicPayment>({
    queryKey: paymentKey(slug, id),
    queryFn: () => getPublicPayment(slug, id),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      (query.state.data?.proofs.pendingCount ?? 0) > 0 ? 30_000 : false,
  });
}

export function useUploadPaymentProof(id: string) {
  const slug = usePublicSlug();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadPaymentProofInput) =>
      uploadPaymentProof(slug, id, input),
    onSuccess: (payment) => {
      queryClient.setQueryData(paymentKey(slug, id), payment);
    },
    onError: (error) => {
      // The balance moved (another payer, or the club reviewed): show the real state.
      if (
        isApiError(error) &&
        (error.code === 'BOOKING_NOT_PAYABLE' ||
          (error.code === 'VALIDATION_ERROR' && error.details?.amount))
      ) {
        void queryClient.invalidateQueries({ queryKey: paymentKey(slug, id) });
      }
    },
  });
}
