'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSuperAdminComplexes } from '../hooks';
import { ComplexesTable } from './ComplexesTable';

/** /admin/complexes (docs/26-super-admin.md): complejos de la plataforma con métricas del mes. */
export function ComplexesList() {
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const complexes = useSuperAdminComplexes(month);

  return (
    <>
      <PageHeader
        title="Complejos"
        description="Todos los complejos de la plataforma, con las métricas del mes elegido."
        action={
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
        }
      />

      {complexes.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : complexes.isError ? (
        <ErrorAlert
          error={complexes.error}
          onRetry={() => complexes.refetch()}
        />
      ) : complexes.data.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">Todavía no hay complejos.</p>
        </div>
      ) : (
        <ComplexesTable complexes={complexes.data} />
      )}
    </>
  );
}
