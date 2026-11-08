'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SuperAdminComplex, SuperAdminRevenue } from '@/types/admin';
import {
  getComplexRevenue,
  listSuperAdminComplexes,
  setComplexSuspension,
} from './api';

export const superAdminKeys = {
  all: ['super-admin', 'complexes'] as const,
  list: (month: string) => ['super-admin', 'complexes', month] as const,
  revenue: (id: string, month: string) =>
    ['super-admin', 'complexes', 'revenue', id, month] as const,
};

export function useComplexRevenue(id: string, month: string) {
  return useQuery<SuperAdminRevenue>({
    queryKey: superAdminKeys.revenue(id, month),
    queryFn: () => getComplexRevenue(id, month),
    staleTime: 30_000,
  });
}

export function useSuperAdminComplexes(month: string) {
  return useQuery<SuperAdminComplex[]>({
    queryKey: superAdminKeys.list(month),
    queryFn: () => listSuperAdminComplexes(month),
    staleTime: 30_000,
  });
}

export function useSetComplexSuspension() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      setComplexSuspension(id, suspended),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: superAdminKeys.all }),
  });
}
