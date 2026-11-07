'use client';

import { ArrowRightIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePublicComplex,
  usePublicSlug,
} from '@/features/public-request/hooks';
import { isApiError } from '@/lib/api/errors';
import {
  dateParamOf,
  formatBookingDateCapitalized,
  formatRelativeDay,
  formatTimeRange,
} from '@/lib/date';
import { SPORT_LABELS, isSport } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { usePublicBookings } from '../hooks';
import { groupByDay, type PublicBooking } from '../schemas';
import { SportCourtIcon } from '@/features/courts/components/SportCourtIcon';

/** /app/[slug]: what the venue QR opens. Players pick their booking to pay it. */
export function PublicBookingsView() {
  const complex = usePublicComplex();
  const bookings = usePublicBookings();

  if (
    (complex.isError &&
      isApiError(complex.error) &&
      complex.error.code === 'NOT_FOUND') ||
    (bookings.isError &&
      isApiError(bookings.error) &&
      bookings.error.code === 'NOT_FOUND')
  ) {
    return (
      <div className="flex flex-col items-start gap-2 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Complejo no encontrado
        </h1>
        <p className="text-muted-foreground max-w-[44ch]">
          El link no es válido. Revisá el código QR o pedile el link al
          complejo.
        </p>
      </div>
    );
  }
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }
  if (bookings.isError) {
    return (
      <ErrorAlert error={bookings.error} onRetry={() => bookings.refetch()} />
    );
  }
  if (complex.isPending || bookings.isPending) return <ListSkeleton />;

  return <BookingList bookings={bookings.data} tz={complex.data.timezone} />;
}

function Header() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-3xl leading-none font-bold tracking-tight">
        Pagar tu turno
      </h1>
      <p className="text-muted-foreground text-pretty">
        Elegí tu turno para ver los datos de transferencia y subir el
        comprobante.
      </p>
    </header>
  );
}

function BookingList({
  bookings,
  tz,
}: {
  bookings: PublicBooking[];
  tz: string;
}) {
  const days = useMemo(
    () => groupByDay(bookings, (iso) => dateParamOf(iso, tz)),
    [bookings, tz],
  );

  return (
    <div className="flex flex-col gap-6">
      <Header />
      {days.length === 0 ? (
        <p
          data-testid="public-bookings-empty"
          className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm"
        >
          No hay turnos recientes. Si jugaste hoy o ayer y no ves tu turno,
          consultá en el complejo.
        </p>
      ) : (
        days.map((day) => (
          <section
            key={day.dateParam}
            aria-label={dayLabel(day.iso, tz)}
            className="flex flex-col gap-2"
          >
            <h2 className="text-muted-foreground text-sm font-medium">
              {dayLabel(day.iso, tz)}
            </h2>
            <ul className="flex flex-col gap-2">
              {day.bookings.map((booking) => (
                <li key={booking.id}>
                  <BookingCard booking={booking} tz={tz} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** "Hoy · Sábado 7 de noviembre" / "Mañana · …"; other days show the full date only. */
function dayLabel(iso: string, tz: string): string {
  const relative = formatRelativeDay(iso, tz);
  const date = formatBookingDateCapitalized(iso, tz);
  return relative === 'Hoy' || relative === 'Mañana' || relative === 'Ayer'
    ? `${relative} · ${date}`
    : date;
}

function BookingCard({ booking, tz }: { booking: PublicBooking; tz: string }) {
  const slug = usePublicSlug();
  const paid = booking.payment.status === 'PAID';
  const sport = isSport(booking.court.sport)
    ? SPORT_LABELS[booking.court.sport]
    : booking.court.sport;

  return (
    <Link
      href={`/app/${encodeURIComponent(slug)}/pagar/${encodeURIComponent(booking.id)}`}
      data-testid="public-booking-card"
      className={cn(
        'bg-card focus-visible:ring-ring/50 flex flex-col gap-3 rounded-xl border p-4 outline-none focus-visible:ring-[3px]',
        paid ? 'opacity-60' : 'hover:bg-muted/50 shadow-xs',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SportCourtIcon
            sport={booking.court.sport}
            className="size-11 rounded-lg"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-lg leading-none font-semibold tabular-nums">
              {formatTimeRange(booking.startsAt, booking.endsAt, tz)}
            </span>
            <span className="text-muted-foreground truncate text-sm">
              {sport} · {booking.court.name}
            </span>
          </div>
        </div>
        <PaymentBadge payment={booking.payment} />
      </div>

      <div className="flex items-center gap-2 border-t pt-3 text-sm">
        <UserIcon
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="text-muted-foreground shrink-0">Reservado por</span>
        <span
          className={cn(
            'truncate font-medium',
            !booking.customerName && 'text-muted-foreground font-normal italic',
          )}
        >
          {booking.customerName ?? 'Reserva sin nombre'}
        </span>
      </div>

      <div className="text-primary flex items-center justify-end gap-1 text-sm font-medium">
        Abonar mi parte
        <ArrowRightIcon aria-hidden="true" className="size-4" />
      </div>
    </Link>
  );
}

function PaymentBadge({ payment }: { payment: PublicBooking['payment'] }) {
  if (payment.status === 'PAID') {
    return <Badge variant="ghost">Pagado</Badge>;
  }
  if (payment.hasPendingProof) {
    return <Badge variant="warning">Comprobante en revisión</Badge>;
  }
  if (payment.status === 'PARTIAL') {
    return <Badge variant="warning">Pago parcial</Badge>;
  }
  return <Badge variant="secondary">Sin pagar</Badge>;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}
