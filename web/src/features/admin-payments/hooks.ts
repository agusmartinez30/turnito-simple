'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api/errors';
import { adminBookingKeys } from '@/features/admin-bookings/hooks';
import type { AdminBooking, PaymentLedger, PaymentProof } from '@/types/admin';
import {
  approvePaymentProof,
  getPaymentProofFileUrl,
  listPaymentProofs,
  rejectPaymentProof,
  listPayments,
  type PaymentLedgerFilters,
  type RegisterPaymentPayload,
  registerPayment,
  voidPayment,
} from './api';

/** Query keys de docs/12-admin-payments.md. */
export const adminPaymentKeys = {
  all: ['admin', 'payments'] as const,
  list: (filters: PaymentLedgerFilters) =>
    ['admin', 'payments', 'list', filters] as const,
};

export function usePaymentsLedger(filters: PaymentLedgerFilters) {
  return useQuery<PaymentLedger>({
    queryKey: adminPaymentKeys.list(filters),
    queryFn: () => listPayments(filters),
    staleTime: 30_000,
  });
}

/**
 * Sin query propia: los pagos viajan embebidos en el detalle de la reserva.
 * Tras cada mutación se siembra ese detalle y se invalida lo que muestra `payment`.
 */
function useAfterPaymentChange() {
  const queryClient = useQueryClient();
  return (booking: AdminBooking) => {
    queryClient.setQueryData(adminBookingKeys.detail(booking.id), booking);
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all });
    void queryClient.invalidateQueries({ queryKey: adminPaymentKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
  };
}

export function useRegisterPayment() {
  const after = useAfterPaymentChange();
  return useMutation({
    mutationFn: ({
      bookingId,
      payload,
    }: {
      bookingId: string;
      payload: RegisterPaymentPayload;
    }) => registerPayment(bookingId, payload),
    onSuccess: after,
  });
}

export function useVoidPayment() {
  const after = useAfterPaymentChange();
  return useMutation({
    mutationFn: ({
      bookingId,
      paymentId,
      reason,
    }: {
      bookingId: string;
      paymentId: string;
      reason?: string;
    }) => voidPayment(bookingId, paymentId, reason),
    onSuccess: after,
  });
}

export const paymentProofKeys = {
  list: (bookingId: string) => ['admin', 'payment-proofs', bookingId] as const,
};

export function usePaymentProofs(bookingId: string) {
  return useQuery<PaymentProof[]>({
    queryKey: paymentProofKeys.list(bookingId),
    queryFn: () => listPaymentProofs(bookingId),
    staleTime: 30_000,
  });
}

/**
 * "Ver comprobante": pide la URL firmada (corta vida, nunca se cachea) al hacer click y abre el
 * PDF en una pestaña nueva. Compartido por la tarjeta del turno y el listado de caja.
 */
export function useOpenPaymentProofFile() {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const fileUrl = useMutation({
    mutationFn: ({
      bookingId,
      proofId,
    }: {
      bookingId: string;
      proofId: string;
    }) => getPaymentProofFileUrl(bookingId, proofId),
  });

  const open = (bookingId: string, proofId: string) => {
    setOpeningId(proofId);
    fileUrl.mutate(
      { bookingId, proofId },
      {
        onSuccess: ({ url }) => {
          // Ancla temporal: abre en pestaña nueva sin darle acceso al opener.
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.click();
        },
        onError: (error) => toast.error(errorMessage(error)),
        onSettled: () => setOpeningId(null),
      },
    );
  };

  return { open, openingId };
}

/** Aprobar crea un pago TRANSFER: refresca el detalle y todo lo que muestra `payment`. */
function useAfterProofReview(bookingId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: paymentProofKeys.list(bookingId),
    });
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all });
    void queryClient.invalidateQueries({ queryKey: adminPaymentKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
  };
}

export function useApprovePaymentProof(bookingId: string) {
  const after = useAfterProofReview(bookingId);
  return useMutation({
    mutationFn: ({ proofId, amount }: { proofId: string; amount?: number }) =>
      approvePaymentProof(bookingId, proofId, amount),
    onSuccess: after,
    // Un comprobante ya revisado o una reserva no cobrable cambian el estado: se refresca igual.
    onError: after,
  });
}

export function useRejectPaymentProof(bookingId: string) {
  const after = useAfterProofReview(bookingId);
  return useMutation({
    mutationFn: ({ proofId, reason }: { proofId: string; reason: string }) =>
      rejectPaymentProof(bookingId, proofId, reason),
    onSuccess: after,
    onError: after,
  });
}
