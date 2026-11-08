'use client';

import { Building2Icon, ShieldCheckIcon } from 'lucide-react';
import { PanelShell, type PanelNavItem } from '@/components/layout/PanelShell';
import { APP_NAME } from '@/lib/app-name';

const NAV_ITEMS: readonly PanelNavItem[] = [
  { href: '/admin/complexes', label: 'Complejos', icon: Building2Icon },
];

/**
 * Shell del SUPER_ADMIN (docs/26-super-admin.md). No tiene complejo propio: no usa
 * `useComplex`, `usePendingCount` ni la campana, porque esos endpoints devuelven 403.
 */
export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <PanelShell
      navItems={NAV_ITEMS}
      homeHref="/admin/complexes"
      homeLabel="Complejos"
      mark={
        <span className="bg-highlight text-highlight-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
          <ShieldCheckIcon className="size-4" />
        </span>
      }
      brandName={APP_NAME}
    >
      {children}
    </PanelShell>
  );
}
