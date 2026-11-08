'use client';

import {
  BanknoteIcon,
  Building2Icon,
  CalendarDaysIcon,
  LandPlotIcon,
  UsersIcon,
  VolleyballIcon,
} from 'lucide-react';
import { ComplexMark } from '@/components/layout/ComplexMark';
import { PanelShell, type PanelNavItem } from '@/components/layout/PanelShell';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingCount } from '@/features/admin-bookings/hooks';
import { useComplex } from '@/features/complex/hooks';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { APP_NAME } from '@/lib/app-name';

const NAV_ITEMS: readonly PanelNavItem[] = [
  { href: '/admin/agenda', label: 'Agenda', icon: CalendarDaysIcon },
  { href: '/admin/payments', label: 'Pagos', icon: BanknoteIcon },
  { href: '/admin/customers', label: 'Clientes', icon: UsersIcon },
  { href: '/admin/courts', label: 'Canchas', icon: LandPlotIcon },
  { href: '/admin/settings', label: 'Mi complejo', icon: Building2Icon },
];

/**
 * Shell del ADMIN de un complejo: nav, logo, campana y "Ver app" salen de endpoints
 * del complejo. El SUPER_ADMIN usa `SuperAdminShell` y nunca monta esto.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const complex = useComplex();
  const pending = usePendingCount();

  const brandName = complex.data ? (
    complex.data.name
  ) : complex.isPending ? (
    <Skeleton className="h-4 w-28" />
  ) : (
    APP_NAME
  );

  /** Logo del complejo, o el ícono de siempre. */
  const mark = (
    <ComplexMark
      logoUrl={complex.data?.logoUrl}
      pending={complex.isPending}
      className="size-6"
      fallback={
        <span className="bg-highlight text-highlight-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
          <VolleyballIcon className="size-4" />
        </span>
      }
    />
  );

  return (
    <PanelShell
      navItems={NAV_ITEMS}
      homeHref="/admin/agenda"
      homeLabel="Agenda"
      mark={mark}
      brandName={brandName}
      renderBell={(className) => <NotificationBell className={className} />}
      renderNavBadge={(item) =>
        item.href === '/admin/agenda' && pending.data ? (
          <span
            className="bg-warning text-warning-foreground ml-auto rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
            aria-label={`${pending.data} solicitudes pendientes`}
          >
            {pending.data}
          </span>
        ) : null
      }
      appLink={{ href: complex.data ? `/app/${complex.data.slug}` : null }}
    >
      {children}
    </PanelShell>
  );
}
