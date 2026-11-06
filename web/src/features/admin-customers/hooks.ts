'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminBookingKeys } from '@/features/admin-bookings/hooks';
import type { AdminCustomer, AdminCustomerDetail } from '@/types/admin';
import {
  createCustomer,
  getCustomer,
  listCustomers,
  type CustomerFilters,
  updateCustomer,
} from './api';

export const adminCustomerKeys = {
  all: ['admin', 'customers'] as const,
  list: (filters: CustomerFilters) =>
    ['admin', 'customers', 'list', filters] as const,
  detail: (id: string) => ['admin', 'customers', id] as const,
  search: (q: string, limit: number) =>
    ['admin', 'customers', 'search', q, limit] as const,
};

export function useCustomers(filters: CustomerFilters) {
  return useQuery<AdminCustomer[]>({
    queryKey: adminCustomerKeys.list(filters),
    queryFn: () => listCustomers(filters),
    staleTime: 60_000,
  });
}

export function useCustomer(id: string) {
  return useQuery<AdminCustomerDetail>({
    queryKey: adminCustomerKeys.detail(id),
    queryFn: () => getCustomer(id),
    staleTime: 60_000,
  });
}

export function useSearchCustomers(q: string, limit = 10) {
  const term = q.trim();
  return useQuery<AdminCustomer[]>({
    queryKey: adminCustomerKeys.search(term, limit),
    queryFn: () => listCustomers({ q: term, limit, status: 'active' }),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}

function useInvalidateCustomerViews() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminCustomerKeys.all });
    void queryClient.invalidateQueries({ queryKey: adminBookingKeys.all });
  };
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomerViews();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomer,
    onSuccess: (customer) => {
      queryClient.setQueryData(adminCustomerKeys.detail(customer.id), customer);
      invalidate();
    },
  });
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateCustomerViews();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof updateCustomer>[1];
    }) => updateCustomer(id, payload),
    onSuccess: (customer) => {
      queryClient.setQueryData(adminCustomerKeys.detail(customer.id), customer);
      invalidate();
    },
  });
}
