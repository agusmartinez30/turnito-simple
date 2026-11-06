'use client';

import {
  ArchiveIcon,
  PencilIcon,
  PhoneIcon,
  RotateCcwIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { PaymentStatusBadge } from '@/features/admin-payments/components/PaymentStatusBadge';
import { useComplex } from '@/features/complex/hooks';
import { errorMessage, isApiError } from '@/lib/api/errors';
import {
  formatDateTime,
  formatPrice,
  formatShortDate,
  formatTimeRange,
} from '@/lib/date';
import { BOOKING_STATUS_LABELS, SPORT_LABELS } from '@/lib/labels';
import type { AdminCustomer } from '@/types/admin';
import { useCustomer, useUpdateCustomer } from '../hooks';
import { CustomerForm } from './CustomerForm';

/** /admin/customers/[id] (docs/18-admin-customers.md). */
export function CustomerDetailPage({ id }: { id: string }) {
  const complex = useComplex();
  const customerQuery = useCustomer(id);
  const update = useUpdateCustomer();
  const [editing, setEditing] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AdminCustomer | null>(
    null,
  );

  if (
    customerQuery.isError &&
    isApiError(customerQuery.error) &&
    customerQuery.error.code === 'NOT_FOUND'
  ) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Cliente no encontrado</h1>
        <ButtonLink href="/admin/customers">Ir a clientes</ButtonLink>
      </div>
    );
  }

  if (customerQuery.isPending || complex.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (customerQuery.isError) {
    return (
      <ErrorAlert
        error={customerQuery.error}
        onRetry={() => customerQuery.refetch()}
      />
    );
  }
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }

  const customer = customerQuery.data;
  const tz = complex.data.timezone;
  const stats = customer.stats;
  const balanceLabel =
    stats.balance > 0
      ? `Debe ${formatPrice(stats.balance)}`
      : stats.balance < 0
        ? `${formatPrice(-stats.balance)} a favor`
        : 'Al día';

  const toggleArchive = (isActive: boolean) => {
    update.mutate(
      { id: customer.id, payload: { isActive } },
      {
        onSuccess: () => {
          toast.success(isActive ? 'Cliente restaurado' : 'Cliente archivado');
          setArchiveTarget(null);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/admin/customers" />}>
              Clientes
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{customer.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name}
            {!customer.isActive && <Badge variant="secondary">Archivado</Badge>}
          </span>
        }
        description={`Cliente desde ${formatDateTime(customer.createdAt, tz)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={update.isPending}
            >
              <PencilIcon />
              Editar
            </Button>
            {customer.isActive ? (
              <Button
                variant="destructive"
                onClick={() => setArchiveTarget(customer)}
                disabled={update.isPending}
              >
                <ArchiveIcon />
                Archivar
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => toggleArchive(true)}
                disabled={update.isPending}
              >
                <RotateCcwIcon />
                Restaurar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-base font-medium">{customer.name}</p>
            {customer.phone ? (
              <a
                href={`tel:${customer.phone}`}
                className="text-primary flex items-center gap-2 hover:underline"
              >
                <PhoneIcon className="size-4" />
                {customer.phone}
              </a>
            ) : (
              <p className="text-muted-foreground">Sin teléfono</p>
            )}
            {customer.note ? (
              <p className="text-muted-foreground whitespace-pre-line">
                {customer.note}
              </p>
            ) : (
              <p className="text-muted-foreground">Sin nota</p>
            )}
            <p className="text-muted-foreground text-xs">
              Alta{' '}
              {customer.source === 'PUBLIC' ? 'desde la app' : 'desde el panel'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-muted-foreground text-xs">Turnos</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {stats.bookings.confirmed}
                  <span className="text-muted-foreground text-sm">
                    {' '}
                    / {stats.bookings.pending} pend. /{' '}
                    {stats.bookings.cancelled} canc.
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Facturado</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {formatPrice(stats.billed)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Pagado</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {formatPrice(stats.paid)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Saldo</dt>
                <dd className="text-xl font-semibold tabular-nums">
                  {balanceLabel}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Turnos</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no reservó ningún turno.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {customer.bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3"
                >
                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="hover:underline"
                  >
                    <span className="capitalize">
                      {formatShortDate(booking.startsAt, tz)}
                    </span>{' '}
                    · {formatTimeRange(booking.startsAt, booking.endsAt, tz)} ·{' '}
                    {booking.court.name}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">
                      {SPORT_LABELS[booking.court.sport]}
                    </Badge>
                    <Badge
                      variant={
                        booking.status === 'CONFIRMED' ? 'default' : 'secondary'
                      }
                    >
                      {BOOKING_STATUS_LABELS[booking.status]}
                    </Badge>
                    {booking.status !== 'CANCELLED' && (
                      <PaymentStatusBadge
                        payment={booking.payment}
                        price={booking.price}
                        compact
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editing}
        onOpenChange={(open) => !open && setEditing(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>
              Los cambios se reflejan en todo su historial.
            </DialogDescription>
          </DialogHeader>
          <CustomerForm
            customer={customer}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) =>
          !open && !update.isPending && setArchiveTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Archivar a {archiveTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en el buscador y al cargar turnos. Sus turnos,
              pagos y turnos fijos se conservan tal cual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={update.isPending}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={update.isPending}
              onClick={() => archiveTarget && toggleArchive(false)}
            >
              Sí, archivar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
