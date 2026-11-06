'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { complexKeys } from '@/features/complex/hooks';
import type { Complex } from '@/types';
import { updateComplex } from './api';

/**
 * After saving, the `['complex']` cache is rewritten and invalidated: the sidebar, the booking
 * detail (payment link card) and the other consumers read the new bank data from it.
 */
export function useUpdateComplex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateComplex,
    onSuccess: (complex: Complex) => {
      queryClient.setQueryData(complexKeys.current, complex);
      void queryClient.invalidateQueries({ queryKey: complexKeys.current });
    },
  });
}
