'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicSlug } from '@/features/public-request/hooks';
import { getPublicBookings } from './api';
import type { PublicBooking } from './schemas';

export const publicBookingsKey = (slug: string) =>
  ['public', slug, 'bookings'] as const;

export function usePublicBookings() {
  const slug = usePublicSlug();
  return useQuery<PublicBooking[]>({
    queryKey: publicBookingsKey(slug),
    queryFn: () => getPublicBookings(slug),
    staleTime: 0,
    // A missing slug is a definitive 404: retrying is pointless.
    retry: false,
  });
}
