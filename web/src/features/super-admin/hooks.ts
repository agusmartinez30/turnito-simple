'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SuperAdminComplex } from '@/types/admin';
import { listSuperAdminComplexes, setComplexSuspension } from './api';

export const superAdminKeys = {
  all: ['super-admin', 'complexes'] as const,
  list: (month: string) => ['super-admin', 'complexes', month] as const,
};

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
