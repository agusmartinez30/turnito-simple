'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { AdminForbidden } from '@/components/layout/AdminForbidden';
import { AdminShell } from '@/components/layout/AdminShell';
import { useMe } from '@/features/auth/hooks';

/**
 * Gate por rol del panel (docs/05-admin-overview.md › Protección de /admin/*).
 * El proxy ya filtró por el payload del JWT; acá se decide con `GET /auth/me` (fuente de verdad del lado web).
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const me = useMe();

  if (me.isPending) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (me.isError) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <ErrorAlert error={me.error} onRetry={() => me.refetch()} />
      </main>
    );
  }

  if (me.data.role !== 'ADMIN') return <AdminForbidden />;

  return <AdminShell>{children}</AdminShell>;
}
