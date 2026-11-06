'use client';

import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { PageHeader } from '@/components/layout/PageShell';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { useAdminCourts } from '../hooks';
import { CourtsTable } from './CourtsTable';

type Tab = 'all' | 'active' | 'inactive';

/** /admin/courts (docs/08-admin-courts.md › Tabla). Inactivas al final, con opacidad. */
export function CourtsList() {
  const courts = useAdminCourts();
  const [tab, setTab] = useState<Tab>('all');

  const visible = useMemo(() => {
    const list = courts.data ?? [];
    const filtered =
      tab === 'active'
        ? list.filter((c) => c.isActive)
        : tab === 'inactive'
          ? list.filter((c) => !c.isActive)
          : list;
    // Inactivas al final; dentro de cada grupo, el orden de la API (sortOrder, name).
    return [...filtered].sort(
      (a, b) => Number(b.isActive) - Number(a.isActive),
    );
  }, [courts.data, tab]);

  return (
    <>
      <PageHeader
        title="Canchas"
        action={
          <ButtonLink href="/admin/courts/new">
            <PlusIcon data-icon="inline-start" />
            Nueva cancha
          </ButtonLink>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="active">Activas</TabsTrigger>
          <TabsTrigger value="inactive">Inactivas</TabsTrigger>
        </TabsList>
      </Tabs>

      {courts.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : courts.isError ? (
        <ErrorAlert error={courts.error} onRetry={() => courts.refetch()} />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">
            {courts.data.length === 0
              ? 'Todavía no hay canchas.'
              : 'No hay canchas en este estado.'}
          </p>
          {courts.data.length === 0 && (
            <ButtonLink href="/admin/courts/new">Creá la primera</ButtonLink>
          )}
        </div>
      ) : (
        <CourtsTable courts={visible} />
      )}
    </>
  );
}
