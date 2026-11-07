'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { complexKeys } from '@/features/complex/hooks';
import type { Complex } from '@/types';
import { deleteComplexLogo, updateComplex, uploadComplexLogo } from './api';

/**
 * After saving, the `['complex']` cache is rewritten and invalidated: the sidebar, the booking
 * detail (payment link card) and the other consumers read the new bank data from it.
 */
export function useUpdateComplex() {
  return useComplexMutation(updateComplex);
}

/** Uploading or removing the logo returns the whole `Complex`, so it refreshes the same cache. */
export function useUploadComplexLogo() {
  return useComplexMutation(uploadComplexLogo);
}

export function useDeleteComplexLogo() {
  return useComplexMutation(deleteComplexLogo);
}

function useComplexMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<Complex>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (complex: Complex) => {
      queryClient.setQueryData(complexKeys.current, complex);
      void queryClient.invalidateQueries({ queryKey: complexKeys.current });
    },
  });
}
