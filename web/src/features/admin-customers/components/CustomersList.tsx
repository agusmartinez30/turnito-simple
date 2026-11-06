'use client';

import { PlusIcon, SearchIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useComplex } from '@/features/complex/hooks';
import type { CustomerStatusFilter } from '@/types/admin';
import { useCustomers } from '../hooks';
import { CustomersTable } from './CustomersTable';

const STATUSES: Array<{ value: CustomerStatusFilter; label: string }> = [
  { value: 'active', label: 'Activos' },
  { value: 'archived', label: 'Archivados' },
  { value: 'all', label: 'Todos' },
];

/** /admin/customers (docs/18-admin-customers.md). */
export function CustomersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const complex = useComplex();

  const status = (() => {
    const raw = params.get('status');
    return raw === 'archived' || raw === 'all' ? raw : 'active';
  })();
  const q = params.get('q') ?? '';
  const [term, setTerm] = useState(q);

  useEffect(() => {
    const trimmed = term.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    if (next === q) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params);
      if (next) sp.set('q', next);
      else sp.delete('q');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const setStatus = useCallback(
    (next: CustomerStatusFilter) => {
      const sp = new URLSearchParams(params);
      if (next === 'active') sp.delete('status');
      else sp.set('status', next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const customers = useCustomers({
    status,
    ...(q.length >= 2 ? { q } : {}),
  });

  return (
    <>
      <PageHeader
        title="Clientes"
        description="La agenda de personas que reservan en el complejo."
        action={
          <ButtonLink href="/admin/customers/new">
            <PlusIcon data-icon="inline-start" />
            Nuevo cliente
          </ButtonLink>
        }
      />

      <div className="relative w-full sm:w-72">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Nombre, apellido o teléfono"
          className="pl-8"
          aria-label="Buscar clientes"
        />
      </div>

      <Tabs
        value={status}
        onValueChange={(value) => setStatus(value as CustomerStatusFilter)}
      >
        <TabsList>
          {STATUSES.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {complex.isPending || customers.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : complex.isError ? (
        <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
      ) : customers.isError ? (
        <ErrorAlert
          error={customers.error}
          onRetry={() => customers.refetch()}
        />
      ) : customers.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">
            {q
              ? 'No encontramos clientes con ese dato.'
              : 'Todavía no hay clientes. Aparecen solos cuando alguien pide turno desde la app, o cargá el primero.'}
          </p>
          {!q && (
            <ButtonLink href="/admin/customers/new">
              Cargar el primero
            </ButtonLink>
          )}
        </div>
      ) : (
        <CustomersTable
          customers={customers.data}
          timezone={complex.data.timezone}
        />
      )}
    </>
  );
}
