'use client';

import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NewBookingDialog } from '@/features/admin-bookings/components/NewBookingDialog';
import { useAdminBookings } from '@/features/admin-bookings/hooks';
import { useAdminCourts } from '@/features/admin-courts/hooks';
import { useComplex } from '@/features/complex/hooks';
import { useNow } from '@/hooks/use-now';
import {
  addDaysToParam,
  formatLongDate,
  isValidDateParam,
  startOfDayIso,
  todayInTz,
} from '@/lib/date';
import type { Complex } from '@/types';
import { buildAgendaRows, buildSlotIndex, indexBookings } from '../lib/grid';
import { AgendaGrid } from './AgendaGrid';

const LIMIT = 200;

interface CreateTarget {
  courtId?: string;
  startsAt?: string;
}

/** Agenda del día: canchas en columnas, horarios en filas (docs/07-admin-bookings.md). */
export function AgendaView() {
  const complex = useComplex();
  if (complex.isPending) return <AgendaSkeleton />;
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }
  return <AgendaContent complex={complex.data} />;
}

function AgendaSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function AgendaContent({ complex }: { complex: Complex }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow(true);
  const today = todayInTz(complex.timezone);
  const dateParam = params.get('date');
  const date = isValidDateParam(dateParam) ? dateParam : today;

  const [target, setTarget] = useState<CreateTarget | null>(null);

  const courts = useAdminCourts();
  const activeCourts = useMemo(
    () => (courts.data ?? []).filter((c) => c.isActive),
    [courts.data],
  );
  const rows = useMemo(
    () => buildAgendaRows(date, activeCourts, complex.timezone),
    [date, activeCourts, complex.timezone],
  );
  const slotIndex = useMemo(
    () => buildSlotIndex(date, activeCourts, complex.timezone),
    [date, activeCourts, complex.timezone],
  );

  // Cover the whole business day, including small-hours slots of courts closing after midnight.
  const range = useMemo(() => {
    const last = rows.length > 0 ? rows[rows.length - 1].time + 1 : null;
    return {
      from: startOfDayIso(date, complex.timezone),
      to: new Date(
        Math.max(
          last ?? 0,
          new Date(
            startOfDayIso(addDaysToParam(date, 1), complex.timezone),
          ).getTime(),
        ),
      ).toISOString(),
    };
  }, [rows, date, complex.timezone]);

  const bookings = useAdminBookings({
    ...range,
    order: 'asc',
    limit: LIMIT,
  });
  const byCell = useMemo(
    () => indexBookings(bookings.data ?? []),
    [bookings.data],
  );

  const setDate = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === today) sp.delete('date');
    else sp.set('date', next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const error = courts.error ?? bookings.error;

  return (
    <>
      <PageHeader
        title="Agenda"
        action={
          <Button onClick={() => setTarget({})}>
            <PlusIcon data-icon="inline-start" />
            Nueva reserva
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Día anterior"
          onClick={() => setDate(addDaysToParam(date, -1))}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          disabled={date === today}
          onClick={() => setDate(today)}
        >
          Hoy
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Día siguiente"
          onClick={() => setDate(addDaysToParam(date, 1))}
        >
          <ChevronRightIcon />
        </Button>
        <Input
          type="date"
          aria-label="Día"
          className="w-auto"
          value={date}
          onChange={(e) => {
            if (isValidDateParam(e.target.value)) setDate(e.target.value);
          }}
        />
        <span className="text-muted-foreground text-sm capitalize">
          {formatLongDate(date)}
        </span>
      </div>

      {error ? (
        <ErrorAlert
          error={error}
          onRetry={() => {
            void courts.refetch();
            void bookings.refetch();
          }}
        />
      ) : courts.isPending || bookings.isPending ? (
        <AgendaSkeleton />
      ) : activeCourts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No hay canchas activas</p>
        </div>
      ) : (
        <>
          <AgendaGrid
            courts={activeCourts}
            rows={rows}
            slotIndex={slotIndex}
            bookings={byCell}
            now={now}
            onCreate={(courtId, startsAt) => setTarget({ courtId, startsAt })}
          />
          {(bookings.data?.length ?? 0) >= LIMIT && (
            <p className="text-muted-foreground text-sm">
              Mostrando las primeras {LIMIT} reservas del día.
            </p>
          )}
        </>
      )}

      <NewBookingDialog
        open={target !== null}
        complex={complex}
        defaultCourtId={target?.courtId}
        defaultStartsAt={target?.startsAt}
        defaultDate={date}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
