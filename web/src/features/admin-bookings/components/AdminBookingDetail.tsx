'use client';

import { ClockIcon, Loader2Icon, PhoneIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { errorMessage } from '@/lib/api/errors';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PaymentsCard } from '@/features/admin-payments/components/PaymentsCard';
import { PaymentLinkCard } from '@/features/admin-payments/components/PaymentLinkCard';
import { PaymentStatusBadge } from '@/features/admin-payments/components/PaymentStatusBadge';
import {
  type PaymentTarget,
  RegisterPaymentDialog,
  toPaymentTarget,
} from '@/features/admin-payments/components/RegisterPaymentDialog';
import {
  VoidPaymentDialog,
  type VoidTarget,
} from '@/features/admin-payments/components/VoidPaymentDialog';
import { useComplex } from '@/features/complex/hooks';
import { useNow } from '@/hooks/use-now';
import { isApiError } from '@/lib/api/errors';
import {
  durationMinutes,
  formatBookingDate,
  formatDateTime,
  formatPrice,
  formatShortDate,
  formatTimeRange,
  todayInTz,
} from '@/lib/date';
import {
  BOOKING_ACTOR_LABELS,
  BOOKING_SOURCE_LABELS,
  BOOKING_STATUS_LABELS,
  SPORT_LABELS,
  customerDisplayName,
} from '@/lib/labels';
import { useAdminBooking, useAdminConfirmBooking } from '../hooks';
import { isInProgress, isStarted } from '../lib/turn-progress';
import {
  BOOKING_STATUS_BADGE_VARIANT,
  canAdminCancel,
  canAdminConfirm,
} from './AdminBookingsTable';
import { AdminCancelDialog, type CancelTarget } from './AdminCancelDialog';
import { TurnActionButton } from './TurnActionButton';
import { TurnTimer } from './TurnTimer';

/** Detalle de una reserva para el admin (docs/07-admin-bookings.md › Detalle). */
export function AdminBookingDetail({ id }: { id: string }) {
  const complex = useComplex();
  const booking = useAdminBooking(id);
  const confirm = useAdminConfirmBooking();
  // El reloj solo tickea mientras el turno está en curso; finalizado queda congelado.
  const now = useNow(booking.data ? isInProgress(booking.data) : false, 1_000);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(
    null,
  );
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);

  if (
    booking.isError &&
    isApiError(booking.error) &&
    booking.error.code === 'NOT_FOUND'
  ) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Reserva no encontrada</h1>
        <ButtonLink href="/admin/bookings">Ir a reservas</ButtonLink>
      </div>
    );
  }

  if (booking.isPending || complex.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48 md:col-span-2" />
        </div>
      </div>
    );
  }
  if (booking.isError) {
    return (
      <ErrorAlert error={booking.error} onRetry={() => booking.refetch()} />
    );
  }
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }

  const b = booking.data;
  const customer = b.customer;
  const tz = complex.data.timezone;
  const finished = !canAdminCancel(b) && b.status === 'CONFIRMED';
  const pending = b.status === 'PENDING';

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/bookings" />}>
              Reservas
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="capitalize">
              {b.court.name} · {formatShortDate(b.startsAt, tz)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={BOOKING_STATUS_BADGE_VARIANT[b.status]}
          className="h-6 px-3 text-sm"
        >
          {BOOKING_STATUS_LABELS[b.status]}
          {b.cancelledBy && ` ${BOOKING_ACTOR_LABELS[b.cancelledBy]}`}
        </Badge>
        {b.cancelledAt && (
          <span className="text-muted-foreground text-sm">
            el {formatDateTime(b.cancelledAt, tz)}
          </span>
        )}
        {isStarted(b) && (isInProgress(b) ? now !== null : true) && (
          <TurnTimer booking={b} now={now} className="text-sm" />
        )}
        <TurnActionButton
          booking={b}
          today={todayInTz(tz)}
          timezone={tz}
          label="long"
        />
        {(b.status !== 'CANCELLED' || b.payment.paidAmount > 0) && (
          <PaymentStatusBadge
            payment={b.payment}
            price={b.price}
            className="h-6 px-3 text-sm"
          />
        )}
      </div>

      {pending && (
        <Alert className="border-warning/50 bg-warning-subtle text-warning-subtle-foreground">
          <ClockIcon />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Solicitud pendiente desde la web pública
              {b.expiresAt && (
                <> · vence el {formatDateTime(b.expiresAt, tz)}</>
              )}
              . Llamá al cliente y confirmá o rechazá.
            </span>
            {canAdminConfirm(b) && (
              <Button
                size="sm"
                disabled={confirm.isPending}
                onClick={() =>
                  confirm.mutate(b.id, {
                    onSuccess: () => toast.success('Solicitud confirmada'),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                {confirm.isPending && <Loader2Icon className="animate-spin" />}
                Confirmar
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Turno</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Cancha</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium">
                <Link
                  href={`/admin/courts/${b.courtId}`}
                  className="hover:underline"
                >
                  {b.court.name}
                </Link>
                <Badge variant="outline">{SPORT_LABELS[b.court.sport]}</Badge>
              </dd>
              <dt className="text-muted-foreground">Fecha</dt>
              <dd className="font-medium">
                {formatBookingDate(b.startsAt, tz)}
              </dd>
              <dt className="text-muted-foreground">Horario</dt>
              <dd className="font-medium">
                {formatTimeRange(b.startsAt, b.endsAt, tz)}
              </dd>
              <dt className="text-muted-foreground">Duración</dt>
              <dd>{durationMinutes(b.startsAt, b.endsAt)} min</dd>
              <dt className="text-muted-foreground">Precio</dt>
              <dd className="font-medium">{formatPrice(b.price)}</dd>
              <dt className="text-muted-foreground">Origen</dt>
              <dd>
                <Badge variant="outline">
                  {BOOKING_SOURCE_LABELS[b.source]}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">Cargada el</dt>
              <dd>
                {formatDateTime(b.createdAt, tz)}
                {b.createdBy && ` por ${b.createdBy.name}`}
              </dd>
              {b.confirmedAt && (
                <>
                  <dt className="text-muted-foreground">Confirmada el</dt>
                  <dd>
                    {formatDateTime(b.confirmedAt, tz)}
                    {b.confirmedBy && ` por ${b.confirmedBy.name}`}
                  </dd>
                </>
              )}
              {b.startedAt && (
                <>
                  <dt className="text-muted-foreground">Iniciado el</dt>
                  <dd>
                    {formatDateTime(b.startedAt, tz)}
                    {b.startedBy && ` por ${b.startedBy.name}`}
                  </dd>
                </>
              )}
              {b.finishedAt && (
                <>
                  <dt className="text-muted-foreground">Finalizado el</dt>
                  <dd>
                    {formatDateTime(b.finishedAt, tz)}
                    {b.finishedBy && ` por ${b.finishedBy.name}`}
                  </dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Cliente
              {customer && !customer.isActive && (
                <Badge variant="secondary">Archivado</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {!customer ? (
              <p className="text-muted-foreground">Sin cliente</p>
            ) : (
              <>
                <p className="text-base font-medium">{customer.name}</p>
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-primary flex w-fit items-center gap-2 hover:underline"
                  >
                    <PhoneIcon className="size-4" />
                    {customer.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Sin teléfono</span>
                )}
                <ButtonLink
                  href={`/admin/customers/${customer.id}`}
                  variant="outline"
                  size="sm"
                  className="w-fit"
                >
                  Ver ficha
                </ButtonLink>
              </>
            )}
          </CardContent>
        </Card>

        {b.note && (
          <Card>
            <CardHeader>
              <CardTitle>Nota</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-line">
              {b.note}
            </CardContent>
          </Card>
        )}

        {b.cancellationReason && (
          <Card>
            <CardHeader>
              <CardTitle>Motivo de cancelación</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-line">
              {b.cancellationReason}
            </CardContent>
          </Card>
        )}

        <PaymentsCard
          booking={b}
          timezone={tz}
          onRegister={() => setPaymentTarget(toPaymentTarget(b))}
          onVoid={(payment) => setVoidTarget({ bookingId: b.id, payment })}
        />

        {b.status !== 'CANCELLED' && (
          <PaymentLinkCard
            bookingId={b.id}
            slug={complex.data.slug}
            customerName={customer?.name ?? null}
            customerPhone={customer?.phone ?? null}
            hasBankData={Boolean(
              complex.data.bankCbu &&
              complex.data.bankAlias &&
              complex.data.bankHolderName,
            )}
          />
        )}
      </div>

      {canAdminCancel(b) && (
        <Button
          variant="destructive"
          className="w-fit"
          onClick={() =>
            setCancelTarget({
              id: b.id,
              startsAt: b.startsAt,
              endsAt: b.endsAt,
              courtName: b.court.name,
              customerName: customerDisplayName(b.customer),
              pending,
            })
          }
        >
          {pending ? 'Rechazar solicitud' : 'Cancelar reserva'}
        </Button>
      )}
      {finished && (
        <p className="text-muted-foreground text-sm">Este turno ya pasó.</p>
      )}

      <AdminCancelDialog
        target={cancelTarget}
        complex={complex.data}
        onClose={() => setCancelTarget(null)}
        onRefetch={() => booking.refetch()}
      />
      <RegisterPaymentDialog
        target={paymentTarget}
        timezone={tz}
        onClose={() => setPaymentTarget(null)}
        onRefetch={() => booking.refetch()}
      />
      <VoidPaymentDialog
        target={voidTarget}
        timezone={tz}
        onClose={() => setVoidTarget(null)}
        onRefetch={() => booking.refetch()}
      />
    </>
  );
}
