'use client';

import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { PageHeader } from '@/components/layout/PageShell';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { isApiError } from '@/lib/api/errors';
import { useAdminCourt, useAdminCourts } from '../hooks';
import { CourtForm } from './CourtForm';

function Crumbs({ current }: { current: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/admin/courts" />}>
            Canchas
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-96" />
      <Skeleton className="h-96" />
    </div>
  );
}

/** /admin/courts/new: el default de `sortOrder` es el máximo actual + 1. */
export function NewCourtPage() {
  const courts = useAdminCourts();
  const nextSortOrder = courts.data
    ? Math.max(-1, ...courts.data.map((c) => c.sortOrder)) + 1
    : undefined;

  return (
    <>
      <Crumbs current="Nueva cancha" />
      <PageHeader title="Nueva cancha" />
      {courts.isPending ? (
        <FormSkeleton />
      ) : (
        <CourtForm nextSortOrder={nextSortOrder ?? 0} />
      )}
    </>
  );
}

/** /admin/courts/[id]: el form se monta con `key` cuando llega la cancha para tomar sus valores. */
export function EditCourtPage({ id }: { id: string }) {
  const court = useAdminCourt(id);

  if (
    court.isError &&
    isApiError(court.error) &&
    court.error.code === 'NOT_FOUND'
  ) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Cancha no encontrada</h1>
        <ButtonLink href="/admin/courts">Ir a canchas</ButtonLink>
      </div>
    );
  }

  return (
    <>
      <Crumbs current={court.data?.name ?? 'Editar'} />
      <PageHeader
        title={court.data ? `Editar ${court.data.name}` : 'Editar cancha'}
      />
      {court.isPending ? (
        <FormSkeleton />
      ) : court.isError ? (
        <ErrorAlert error={court.error} onRetry={() => court.refetch()} />
      ) : (
        <CourtForm key={court.data.updatedAt} court={court.data} />
      )}
    </>
  );
}
