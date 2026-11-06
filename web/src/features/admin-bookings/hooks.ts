'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCourtKeys } from '@/features/admin-courts/hooks';
import type { AdminBooking, AdminCustomer } from '@/types/admin';
import {
  type AdminBookingFilters,
  cancelAdminBooking,
  confirmAdminBooking,
  createAdminBooking,
  finishAdminBooking,
  getAdminBooking,
  listAdminBookings,
  searchCustomers,
  startAdminBooking,
} from './api';

/** Query keys de docs/07-admin-bookings.md. */
export const adminBookingKeys = {
  all: ['admin', 'bookings'] as const,
  list: (filters: AdminBookingFilters) =>
    ['admin', 'bookings', 'list', filters] as const,
  detail: (id: string) => ['admin', 'bookings', id] as const,
};

export function useAdminBookings(filters: AdminBookingFilters) {
  return useQuery<AdminBooking[]>({
    queryKey: adminBookingKeys.list(filters),
    queryFn: () => listAdminBookings(filters),
    staleTime: 30_000,
  });
}

export function useAdminBooking(id: string) {
  return useQuery<AdminBooking>({
    queryKey: adminBookingKeys.detail(id),
    queryFn: () => getAdminBooking(id),
    staleTime: 30_000,
  });
}

/** Invalidación común a cancelar, confirmar, iniciar y finalizar. */
function useAfterAdminBookingChange() {
  const queryClient = useQueryClient();
  return (booking: AdminBooking) => {
    queryClient.setQueryData(adminBookingKeys.detail(booking.id), booking);
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all });
    void queryClient.invalidateQueries({ queryKey: adminCourtKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
  };
}

export function useAdminCancelBooking() {
  const after = useAfterAdminBookingChange();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      cancelAdminBooking(id, reason),
    onSuccess: after,
  });
}

export function useAdminConfirmBooking() {
  const after = useAfterAdminBookingChange();
  return useMutation({
    mutationFn: confirmAdminBooking,
    onSuccess: after,
  });
}

export function useAdminStartBooking() {
  const after = useAfterAdminBookingChange();
  return useMutation({
    mutationFn: startAdminBooking,
    onSuccess: after,
  });
}

export function useAdminFinishBooking() {
  const after = useAfterAdminBookingChange();
  return useMutation({
    mutationFn: finishAdminBooking,
    onSuccess: after,
  });
}

/** Solicitudes pendientes futuras (badge de la sidebar). */
export function usePendingCount() {
  return useQuery<AdminBooking[], Error, number>({
    queryKey: adminBookingKeys.list({
      status: 'PENDING',
      from: 'now',
      limit: 200,
    }),
    queryFn: () =>
      listAdminBookings({
        status: 'PENDING',
        from: new Date().toISOString(),
        limit: 200,
      }),
    select: (data) => data.length,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Customer search for the manual booking picker: at least 2 characters. */
export function useSearchCustomers(q: string) {
  return useQuery<AdminCustomer[]>({
    queryKey: ['admin', 'customers', 'search', q.trim(), 10],
    queryFn: () => searchCustomers(q.trim()),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useCreateAdminBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAdminBooking,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: adminCourtKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });
}
