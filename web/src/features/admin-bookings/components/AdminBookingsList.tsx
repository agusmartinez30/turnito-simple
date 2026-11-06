'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageShell';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { useAdminCourts } from '@/features/admin-courts/hooks';
import {
  type PaymentTarget,
  RegisterPaymentDialog,
  toPaymentTarget,
} from '@/features/admin-payments/components/RegisterPaymentDialog';
import { useComplex } from '@/features/complex/hooks';
import { useNow } from '@/hooks/use-now';
import { isValidDateParam, todayInTz } from '@/lib/date';
import { CUSTOMERLESS_LABEL } from '@/lib/labels';
import type { BookingStatus, Complex } from '@/types';
import type { AdminBooking } from '@/types/admin';
import type { AdminBookingFilters as ApiFilters } from '../api';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/api/errors';
import { useAdminBookings, useAdminConfirmBooking } from '../hooks';
import {
  AdminBookingFilters,
  type AdminBookingUrlFilters,
} from './AdminBookingFilters';
import {
  AdminBookingsTable,
  AdminBookingsTableSkeleton,
} from './AdminBookingsTable';
import { AdminCancelDialog, type CancelTarget } from './AdminCancelDialog';
import { NewBookingDialog } from './NewBookingDialog';

const LIMIT = 100;

function toCancelTarget(b: AdminBooking): CancelTarget {
  return {
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    courtName: b.court.name,
    customerName: b.customer?.name ?? CUSTOMERLESS_LABEL,
    pending: b.status === 'PENDING',
  };
}

/** Listado de reservas con filtros en la URL (docs/07-admin-bookings.md). */
export function AdminBookingsList() {
  const complex = useComplex();
  if (complex.isPending) return <AdminBookingsTableSkeleton />;
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }
  return <AdminBookingsContent complex={complex.data} />;
}

function AdminBookingsContent({ complex }: { complex: Complex }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const courts = useAdminCourts();
  const today = todayInTz(complex.timezone);
  // Reloj para el estado derivado "Completada" (ver AdminBookingsTable).
  const now = useNow(true);

  const filters = useMemo<AdminBookingUrlFilters>(() => {
    const q = params.get('q') ?? undefined;
    const date = params.get('date');
    const status = params.get('status');
    return {
      q: q && q.length >= 2 ? q : undefined,
      date: isValidDateParam(date) ? date : undefined,
      courtId: params.get('courtId') ?? undefined,
      status:
        status === 'PENDING' || status === 'CONFIRMED' || status === 'CANCELLED'
          ? (status as BookingStatus)
          : undefined,
    };
  }, [params]);

  const setFilters = useCallback(
    (next: AdminBookingUrlFilters) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Regla de docs/07: sin filtros → próximas desde ahora (asc); con q sin fecha → recientes (desc).
  const apiFilters = useMemo<ApiFilters>(() => {
    const base: ApiFilters = { limit: LIMIT };
    if (filters.courtId) base.courtId = filters.courtId;
    if (filters.status) base.status = filters.status;
    if (filters.q) base.q = filters.q;
    if (filters.date) {
      base.date = filters.date;
    } else if (filters.q) {
      base.order = 'desc';
    } else {
      base.from = new Date().toISOString();
      base.order = 'asc';
    }
    return base;
  }, [filters]);

  const bookings = useAdminBookings(apiFilters);
  const confirm = useAdminConfirmBooking();
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(
    null,
  );

  return (
    <>
      <PageHeader
        title="Reservas"
        action={
          <Button onClick={() => setNewBookingOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Nueva reserva
          </Button>
        }
      />

      <AdminBookingFilters
        filters={filters}
        courts={courts.data ?? []}
        today={today}
        onChange={(patch) => setFilters({ ...filters, ...patch })}
        onClear={() => setFilters({})}
      />

      {bookings.isPending ? (
        <AdminBookingsTableSkeleton />
      ) : bookings.isError ? (
        <ErrorAlert error={bookings.error} onRetry={() => bookings.refetch()} />
      ) : bookings.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">
            No hay reservas para estos filtros
          </p>
          <Button variant="outline" onClick={() => setFilters({})}>
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <>
          <AdminBookingsTable
            bookings={bookings.data}
            timezone={complex.timezone}
            now={now}
            onCancel={(b) => setCancelTarget(toCancelTarget(b))}
            onRegisterPayment={(b) => setPaymentTarget(toPaymentTarget(b))}
            onConfirm={(b) =>
              confirm.mutate(b.id, {
                onSuccess: () => toast.success('Solicitud confirmada'),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          />
          {bookings.data.length >= LIMIT && (
            <p className="text-muted-foreground text-sm">
              Mostrando las primeras {LIMIT}. Afiná los filtros para ver más.
            </p>
          )}
        </>
      )}

      <AdminCancelDialog
        target={cancelTarget}
        complex={complex}
        onClose={() => setCancelTarget(null)}
        onRefetch={() => bookings.refetch()}
      />
      <NewBookingDialog
        open={newBookingOpen}
        complex={complex}
        onClose={() => setNewBookingOpen(false)}
      />
      <RegisterPaymentDialog
        target={paymentTarget}
        timezone={complex.timezone}
        onClose={() => setPaymentTarget(null)}
        onRefetch={() => bookings.refetch()}
      />
    </>
  );
}
