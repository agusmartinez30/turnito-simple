import { api } from '@/lib/api/client';
import type { Complex } from '@/types';

export interface UpdateComplexPayload {
  name?: string;
  address?: string;
  bankCbu?: string | null;
  bankAlias?: string | null;
  bankHolderName?: string | null;
}

/** `PATCH /admin/complex` (ADMIN only): returns the whole updated `Complex`. */
export function updateComplex(payload: UpdateComplexPayload): Promise<Complex> {
  return api.patch<Complex>('/admin/complex', { body: payload });
}
