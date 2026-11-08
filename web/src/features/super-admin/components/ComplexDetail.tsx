'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useComplexRevenue } from '../hooks';
import { RevenueSummary } from './RevenueSummary';
import { RevenueTable } from './RevenueTable';

/** /admin/complexes/[id]: ingresos del mes por turno, comprobantes vs efectivo. */
export function ComplexDetail({ id }: { id: string }) {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const revenue = useComplexRevenue(id, month);
  const complex = revenue.data?.complex;

  return (
    <>
      <PageHeader
        title={complex?.name ?? 'Complejo'}
        description="Ingresos del mes por turno, separados en comprobantes y efectivo."
        action={
          <div className="flex items-end gap-3">
            {complex && (
              <Badge variant={complex.suspendedAt ? 'warning' : 'success'}>
                {complex.suspendedAt ? 'Suspendido' : 'Activo'}
              </Badge>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Mes
              <Input
                type="month"
                value={month}
                // A cleared input yields '': keep the previous month instead of querying with it.
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="w-44"
              />
            </label>
            <ButtonLink href="/admin/complexes" variant="outline">
              Volver
            </ButtonLink>
          </div>
        }
      />

      {revenue.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : revenue.isError ? (
        <ErrorAlert error={revenue.error} onRetry={() => revenue.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <RevenueSummary totals={revenue.data.totals} />
          {revenue.data.bookings.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="text-muted-foreground">
                No hay turnos en este mes.
              </p>
            </div>
          ) : (
            <RevenueTable bookings={revenue.data.bookings} />
          )}
        </div>
      )}
    </>
  );
}
