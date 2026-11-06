import { api } from '@/lib/api/client';
import type { PublicComplex } from '@/types';

/** Public (no auth) complex profile: `/public/c/:slug/complex`. Never sends Authorization. */
export function getPublicComplex(slug: string): Promise<PublicComplex> {
  return api.get<PublicComplex>(
    `/public/c/${encodeURIComponent(slug)}/complex`,
    {
      auth: false,
    },
  );
}
