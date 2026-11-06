import { z } from 'zod';

/** Response of `GET /public/c/:slug/bookings` (minimal data: no phone, no bank data). */
export const publicBookingSchema = z.object({
  id: z.string(),
  court: z.object({ name: z.string(), sport: z.string() }),
  startsAt: z.string(),
  endsAt: z.string(),
  price: z.number(),
  /** Full name of who booked; null for counter bookings without customer. */
  customerName: z.string().nullable(),
  payment: z.object({
    paidAmount: z.number(),
    status: z.enum(['UNPAID', 'PARTIAL', 'PAID']),
    /** A proof is awaiting review by the complex. */
    hasPendingProof: z.boolean(),
  }),
});

export const publicBookingsSchema = z.array(publicBookingSchema);

export type PublicBooking = z.infer<typeof publicBookingSchema>;

export interface PublicBookingDay {
  /** `YYYY-MM-DD` in the complex timezone. */
  dateParam: string;
  /** First booking's ISO instant, used to label the day. */
  iso: string;
  bookings: PublicBooking[];
}

/** Groups bookings by local day, preserving the API order (most recent first). */
export function groupByDay(
  bookings: readonly PublicBooking[],
  dayOf: (iso: string) => string,
): PublicBookingDay[] {
  const days: PublicBookingDay[] = [];
  for (const booking of bookings) {
    const dateParam = dayOf(booking.startsAt);
    const last = days[days.length - 1];
    if (last && last.dateParam === dateParam) {
      last.bookings.push(booking);
    } else {
      days.push({ dateParam, iso: booking.startsAt, bookings: [booking] });
    }
  }
  return days;
}
