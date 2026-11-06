'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { PublicComplex } from '@/types';
import { getPublicComplex } from './api';

/** Query keys of the public surface. Everything hangs from `['public', slug]`. */
export const publicKeys = {
  complex: (slug: string) => ['public', slug, 'complex'] as const,
};

/** Complex slug from the `/app/[slug]/...` URL. */
export function usePublicSlug(): string {
  const { slug } = useParams<{ slug: string }>();
  return slug;
}

/** Link to the public home of the current complex. */
export function usePublicHome(): string {
  return `/app/${usePublicSlug()}`;
}

export function usePublicComplex() {
  const slug = usePublicSlug();
  return useQuery<PublicComplex>({
    queryKey: publicKeys.complex(slug),
    queryFn: () => getPublicComplex(slug),
    staleTime: Infinity,
    // A missing slug is a definitive 404: retrying is pointless.
    retry: false,
  });
}
