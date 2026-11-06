'use client';

import { useQuery } from '@tanstack/react-query';
import type { Complex } from '@/types';
import { getComplex } from './api';

export const complexKeys = {
  current: ['complex'] as const,
};

/** El único complejo del MVP. Se cachea con `staleTime: Infinity` (docs/00-overview.md). */
export function useComplex() {
  return useQuery<Complex>({
    queryKey: complexKeys.current,
    queryFn: getComplex,
    staleTime: Infinity,
  });
}
