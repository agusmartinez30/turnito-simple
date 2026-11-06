'use client';

import { parseISO } from 'date-fns';
import { MoreHorizontalIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PaymentStatusBadge } from '@/features/admin-payments/components/PaymentStatusBadge';
import { formatPrice, formatShortDate, formatTimeRange } from '@/lib/date';
import {
  BOOKING_ACTOR_LABELS,
  BOOKING_STATUS_LABELS,
  SPORT_LABELS,
} from '@/lib/labels';
import type { BookingStatus } from '@/types';
import type { AdminBooking, BookingCustomer } from '@/types/admin';

interface Props {
  bookings: AdminBooking[];
  timezone: string;
  /** Reloj del padre (`useNow`): evita `new Date()` en render. */
  now: Date | null;
  onCancel: (booking: AdminBooking) => void;
  onConfirm?: (booking: AdminBooking) => void;
  onRegisterPayment?: (booking: AdminBooking) => void;
}

/** Una reserva no cancelada admite pagos (docs/12-admin-payments.md). */
export function canRegisterPayment(booking: AdminBooking): boolean {
  return booking.status !== 'CANCELLED';
}

/** En canceladas el estado de pago solo importa si hay plata cobrada (a devolver). */
function PaymentCell({ booking }: { booking: AdminBooking }) {
  if (booking.status === 'CANCELLED' && booking.payment.paidAmount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <PaymentStatusBadge payment={booking.payment} price={booking.price} />;
}

/**
 * Una reserva activa (CONFIRMED o PENDING) cuyo turno no terminó se puede cancelar / rechazar.
 */
export function canAdminCancel(
  booking: AdminBooking,
  now = new Date(),
): boolean {
  return (
    (booking.status === 'CONFIRMED' || booking.status === 'PENDING') &&
    parseISO(booking.endsAt) > now
  );
}

/** Una solicitud PENDING vigente se puede confirmar. */
export function canAdminConfirm(
  booking: AdminBooking,
  now = new Date(),
): boolean {
  return (
    booking.status === 'PENDING' &&
    (!booking.expiresAt || parseISO(booking.expiresAt) > now)
  );
}

/**
 * Solo presentación: el modelo no tiene COMPLETED, pero una confirmada cuyo turno
 * ya terminó se lee mejor como "Completada" que como "Confirmada".
 */
export function isBookingCompleted(
  booking: AdminBooking,
  now: Date | null,
): boolean {
  return (
    now !== null &&
    booking.status === 'CONFIRMED' &&
    parseISO(booking.endsAt) <= now
  );
}

/** Variante de Badge por estado; PENDING usa el ámbar de "sin confirmar". */
export const BOOKING_STATUS_BADGE_VARIANT = {
  CONFIRMED: 'default',
  PENDING: 'warning',
  CANCELLED: 'secondary',
} as const satisfies Record<BookingStatus, string>;

function StatusBadge({
  booking,
  now,
}: {
  booking: AdminBooking;
  now: Date | null;
}) {
  if (isBookingCompleted(booking, now)) {
    return <Badge variant="success">Completada</Badge>;
  }
  const badge = (
    <Badge variant={BOOKING_STATUS_BADGE_VARIANT[booking.status]}>
      {BOOKING_STATUS_LABELS[booking.status]}
    </Badge>
  );
  if (booking.status === 'CANCELLED' && booking.cancelledBy) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>{badge}</TooltipTrigger>
        <TooltipContent>
          {BOOKING_ACTOR_LABELS[booking.cancelledBy]}
        </TooltipContent>
      </Tooltip>
    );
  }
  return badge;
}

/** Iniciales del cliente para el avatar; sin apellido queda una sola letra. */
function initials(customer: BookingCustomer | null): string {
  if (!customer) return '—';
  const letters =
    (customer.firstName[0] ?? '') + (customer.lastName?.[0] ?? '');
  return letters.toUpperCase() || '?';
}

function CustomerCell({ customer }: { customer: BookingCustomer | null }) {
  if (!customer) {
    return (
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
        >
          —
        </span>
        <span className="text-muted-foreground">Sin cliente</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      >
        {initials(customer)}
      </span>
      <div className="flex flex-col">
        <span className="font-medium">{customer.name}</span>
        <span className="text-muted-foreground text-xs">
          {customer.phone ?? '—'}
        </span>
      </div>
    </div>
  );
}

/** Tabla (md+) o cards (mobile) del listado de reservas (docs/07-admin-bookings.md). */
export function AdminBookingsTable({
  bookings,
  timezone,
  now,
  onCancel,
  onConfirm,
  onRegisterPayment,
}: Props) {
  const router = useRouter();

  return (
    <>
      {/* Tabla md+ */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Deporte</TableHead>
              <TableHead>Cancha</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((booking) => (
              <TableRow
                key={booking.id}
                className="cursor-pointer"
                onClick={() => router.push(`/admin/bookings/${booking.id}`)}
              >
                <TableCell>
                  <CustomerCell customer={booking.customer} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {SPORT_LABELS[booking.court.sport]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {booking.court.name}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap capitalize">
                  {formatShortDate(booking.startsAt, timezone)}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatTimeRange(booking.startsAt, booking.endsAt, timezone)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPrice(booking.price)}
                </TableCell>
                <TableCell>
                  <PaymentCell booking={booking} />
                </TableCell>
                <TableCell>
                  <StatusBadge booking={booking} now={now} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Acciones"
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={<Link href={`/admin/bookings/${booking.id}`} />}
                      >
                        Ver detalle
                      </DropdownMenuItem>
                      {onConfirm && canAdminConfirm(booking) && (
                        <DropdownMenuItem onClick={() => onConfirm(booking)}>
                          Confirmar
                        </DropdownMenuItem>
                      )}
                      {onRegisterPayment && canRegisterPayment(booking) && (
                        <DropdownMenuItem
                          onClick={() => onRegisterPayment(booking)}
                        >
                          Registrar pago
                        </DropdownMenuItem>
                      )}
                      {canAdminCancel(booking) && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onCancel(booking)}
                        >
                          {booking.status === 'PENDING'
                            ? 'Rechazar'
                            : 'Cancelar'}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Cards mobile */}
      <ul className="flex flex-col gap-3 md:hidden">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <Link
              href={`/admin/bookings/${booking.id}`}
              className="bg-card hover:bg-muted/50 flex flex-col gap-2 rounded-lg border p-3 text-sm transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <CustomerCell customer={booking.customer} />
                <StatusBadge booking={booking} now={now} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {SPORT_LABELS[booking.court.sport]}
                </Badge>
                <span>{booking.court.name}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-medium capitalize">
                    {formatShortDate(booking.startsAt, timezone)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatTimeRange(
                      booking.startsAt,
                      booking.endsAt,
                      timezone,
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentCell booking={booking} />
                  <span className="tabular-nums">
                    {formatPrice(booking.price)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AdminBookingsTableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
