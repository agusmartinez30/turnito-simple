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

/** Same field name the API reads from the multipart body (`LOGO_FIELD`). */
const LOGO_FIELD = 'logo';

/** `POST /admin/complex/logo` (ADMIN only): replaces the logo, returns the updated `Complex`. */
export function uploadComplexLogo(file: File): Promise<Complex> {
  const body = new FormData();
  body.append(LOGO_FIELD, file);
  return api.post<Complex>('/admin/complex/logo', { body });
}

/** `DELETE /admin/complex/logo` (ADMIN only): removes the logo, returns the updated `Complex`. */
export function deleteComplexLogo(): Promise<Complex> {
  return api.delete<Complex>('/admin/complex/logo');
}
