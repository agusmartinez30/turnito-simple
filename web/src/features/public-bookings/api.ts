import { api } from '@/lib/api/client';
import { publicBookingsSchema, type PublicBooking } from './schemas';

/** Public (no auth) list of recent bookings: `/public/c/:slug/bookings`. */
export async function getPublicBookings(
  slug: string,
): Promise<PublicBooking[]> {
  const data = await api.get<unknown>(
    `/public/c/${encodeURIComponent(slug)}/bookings`,
    { auth: false },
  );
  return publicBookingsSchema.parse(data);
}
