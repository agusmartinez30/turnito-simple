'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCourt } from '@/types/admin';
import {
  createCourt,
  getAdminCourt,
  listAdminCourts,
  type UpdateCourtPayload,
  updateCourt,
} from './api';

/** Query keys de docs/08-admin-courts.md. */
export const adminCourtKeys = {
  all: ['admin', 'courts'] as const,
  list: ['admin', 'courts', 'list'] as const,
  detail: (id: string) => ['admin', 'courts', id] as const,
};

export function useAdminCourts() {
  return useQuery<AdminCourt[]>({
    queryKey: adminCourtKeys.list,
    queryFn: listAdminCourts,
    staleTime: 60_000,
  });
}

export function useAdminCourt(id: string) {
  return useQuery<AdminCourt>({
    queryKey: adminCourtKeys.detail(id),
    queryFn: () => getAdminCourt(id),
    staleTime: 60_000,
  });
}

/** Invalida canchas admin, canchas de jugador y la agenda (docs/08-admin-courts.md › mutaciones). */
function useInvalidateCourts() {
  const queryClient = useQueryClient();
  return (court: AdminCourt) => {
    queryClient.setQueryData(adminCourtKeys.detail(court.id), court);
    void queryClient.invalidateQueries({ queryKey: adminCourtKeys.all });
  };
}

export function useCreateCourt() {
  const invalidate = useInvalidateCourts();
  return useMutation({
    mutationFn: createCourt,
    onSuccess: invalidate,
  });
}

export function useUpdateCourt() {
  const invalidate = useInvalidateCourts();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateCourtPayload;
    }) => updateCourt(id, payload),
    onSuccess: invalidate,
  });
}
