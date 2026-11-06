import { api } from '@/lib/api/client';
import type { Complex } from '@/types';

export function getComplex(): Promise<Complex> {
  return api.get<Complex>('/complex');
}
