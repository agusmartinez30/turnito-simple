'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { AdminForbidden } from '@/components/layout/AdminForbidden';
import { AdminShell } from '@/components/layout/AdminShell';
import { ComplexSuspended } from '@/components/layout/ComplexSuspended';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { useMe } from '@/features/auth/hooks';
import { useComplex } from '@/features/complex/hooks';
import { AdminRealtimeProvider } from '@/features/realtime/AdminRealtimeProvider';
import { hasErrorCode } from '@/lib/api/errors';

/** The only panel route a SUPER_ADMIN may use; everything else under /admin is complex-scoped. */
const SUPER_ADMIN_HOME = '/admin/complexes';
const ADMIN_HOME = '/admin/agenda';

function isSuperAdminRoute(pathname: string): boolean {
  return (
    pathname === SUPER_ADMIN_HOME || pathname.startsWith(`${SUPER_ADMIN_HOME}/`)
  );
}

function GateSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </main>
  );
}

/** Complex-scoped area: shows the suspension notice instead of a page full of 403s. */
function ComplexAdminArea({ children }: { children: React.ReactNode }) {
  const complex = useComplex();
  if (hasErrorCode(complex.error, 'COMPLEX_SUSPENDED')) {
    return <ComplexSuspended />;
  }
  return (
    <AdminShell>
      <AdminRealtimeProvider>{children}</AdminRealtimeProvider>
    </AdminShell>
  );
}

/**
 * Gate por rol del panel (docs/05-admin-overview.md › Protección de /admin/*).
 * El proxy ya filtró por el payload del JWT; acá se decide con `GET /auth/me` (fuente de verdad del lado web).
 * ADMIN usa las rutas del complejo; SUPER_ADMIN solo `/admin/complexes` (docs/26-super-admin.md).
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();

  const role = me.data?.role;
  const redirectTo =
    role === 'SUPER_ADMIN' && !isSuperAdminRoute(pathname)
      ? SUPER_ADMIN_HOME
      : role === 'ADMIN' && isSuperAdminRoute(pathname)
        ? ADMIN_HOME
        : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (me.isPending) return <GateSkeleton />;

  if (me.isError) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        <ErrorAlert error={me.error} onRetry={() => me.refetch()} />
      </main>
    );
  }

  if (me.data.role !== 'ADMIN' && me.data.role !== 'SUPER_ADMIN') {
    return <AdminForbidden />;
  }

  if (redirectTo) return <GateSkeleton />;

  if (me.data.role === 'SUPER_ADMIN') {
    return <SuperAdminShell>{children}</SuperAdminShell>;
  }

  return <ComplexAdminArea>{children}</ComplexAdminArea>;
}
