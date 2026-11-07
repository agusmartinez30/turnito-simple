'use client';

import {
  BanknoteIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  LandPlotIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  VolleyballIcon,
  XIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingCount } from '@/features/admin-bookings/hooks';
import { ComplexMark } from '@/components/layout/ComplexMark';
import { useLogout, useMe } from '@/features/auth/hooks';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useComplex } from '@/features/complex/hooks';
import { APP_NAME } from '@/lib/app-name';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/admin/bookings',
    label: 'Reservas',
    icon: ClipboardListIcon,
  },
  {
    href: '/admin/payments',
    label: 'Pagos',
    icon: BanknoteIcon,
  },
  {
    href: '/admin/customers',
    label: 'Clientes',
    icon: UsersIcon,
  },
  {
    href: '/admin/courts',
    label: 'Canchas',
    icon: LandPlotIcon,
  },
  {
    href: '/admin/settings',
    label: 'Configuración',
    icon: SettingsIcon,
  },
] as const;

function isActive(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if ('exact' in item && item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Foco visible sobre el índigo: el anillo por defecto es índigo y ahí no se vería. */
const NAV_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring';

/**
 * Ítem de la sidebar. El activo se marca con el filete lima + el ícono lima; el relleno
 * índigo claro solo acompaña (docs/05-admin-overview.md › Layout).
 */
function navItemClass(active: boolean): string {
  return cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    NAV_FOCUS,
    active
      ? 'bg-sidebar-active text-sidebar-foreground before:bg-highlight relative font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full [&>svg]:text-highlight'
      : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  );
}

/** Menú del usuario: en la sidebar va sobre índigo, en el header mobile sobre el fondo claro. */
function UserMenu({ onSidebar = false }: { onSidebar?: boolean }) {
  const me = useMe();
  const complex = useComplex();
  const logout = useLogout();

  if (!me.data) return <Skeleton className="h-7 w-24" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={onSidebar ? 'default' : 'sm'}
            className={cn(
              onSidebar &&
                // Misma métrica que los ítems de la nav, para que la fila del usuario alinee.
                'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/50 focus-visible:border-sidebar-ring dark:hover:bg-sidebar-accent h-9 w-full justify-start gap-3 rounded-md px-3 font-normal',
            )}
          />
        }
      >
        <UserIcon className={cn(!onSidebar && 'lg:hidden')} />
        <span className="hidden max-w-36 truncate lg:inline">
          {me.data.name}
        </span>
        <ChevronDownIcon
          data-icon="inline-end"
          className={cn('hidden lg:block', onSidebar && 'ml-auto')}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          disabled={!complex.data}
          render={
            <Link
              href={complex.data ? `/app/${complex.data.slug}` : '#'}
              target="_blank"
              rel="noopener"
            />
          }
        >
          <ExternalLinkIcon />
          Ver app
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOutIcon />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Layout del panel (docs/05-admin-overview.md › Layout): sidebar fija en lg+, header + drawer
 * lateral en pantallas chicas. La navegación es la superficie índigo de la marca: el
 * contenido queda claro. El gate por rol lo hace `(admin)/layout.tsx`.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const complex = useComplex();
  const pending = usePendingCount();
  const [menuOpen, setMenuOpen] = useState(false);

  const pendingBadge = (item: (typeof NAV_ITEMS)[number]) =>
    item.href === '/admin/bookings' && pending.data ? (
      <span
        className="bg-warning text-warning-foreground ml-auto rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
        aria-label={`${pending.data} solicitudes pendientes`}
      >
        {pending.data}
      </span>
    ) : null;

  const complexName = complex.data ? (
    complex.data.name
  ) : complex.isPending ? (
    <Skeleton className="h-4 w-28" />
  ) : (
    APP_NAME
  );

  /** Logo del complejo, o el ícono de siempre. Va en los tres headers. */
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
    <div className="flex min-h-full flex-1">
      {/* Sidebar (lg+) */}
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-60 shrink-0 flex-col lg:flex">
        <div className="border-sidebar-border flex h-14 items-center border-b pr-2">
          <Link
            href="/admin/bookings"
            className={cn(
              'flex h-full min-w-0 flex-1 items-center gap-2 px-4 font-semibold',
              NAV_FOCUS,
            )}
            aria-label="Reservas"
          >
            {mark}
            <span className="truncate">{complexName}</span>
          </Link>
          <NotificationBell className="text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/50 size-9 shrink-0" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Panel">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={navItemClass(active)}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
                {pendingBadge(item)}
              </Link>
            );
          })}
        </nav>
        <div className="border-sidebar-border flex flex-col gap-1 border-t p-3">
          <Link
            href={complex.data ? `/app/${complex.data.slug}` : '#'}
            aria-disabled={!complex.data}
            target="_blank"
            rel="noopener"
            className={cn(
              navItemClass(false),
              'aria-disabled:pointer-events-none aria-disabled:opacity-50',
            )}
          >
            <ExternalLinkIcon className="size-4 shrink-0" />
            Ver app
          </Link>
          <UserMenu onSidebar />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header (< lg) */}
        <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(true)}
            className="-ml-2 size-11 shrink-0"
            aria-label="Abrir menú"
          >
            <MenuIcon className="size-5" />
          </Button>
          <Link
            href="/admin/bookings"
            className="flex min-w-0 flex-1 items-center gap-2 font-semibold"
            aria-label="Reservas"
          >
            {mark}
            <span className="truncate">{complexName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell className="size-11" />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:py-8">
          {children}
        </main>

        {/* Drawer lateral (< lg): reemplaza a la antigua barra inferior. */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="bg-sidebar text-sidebar-foreground gap-0 p-0"
          >
            <div className="border-sidebar-border flex h-14 shrink-0 items-center gap-2 border-b px-4">
              {mark}
              <span className="truncate font-semibold">{complexName}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuOpen(false)}
                className="text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ml-auto size-10 shrink-0"
                aria-label="Cerrar menú"
              >
                <XIcon className="size-5" />
              </Button>
            </div>
            <nav
              className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
              aria-label="Panel"
            >
              {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={navItemClass(active)}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                    {pendingBadge(item)}
                  </Link>
                );
              })}
            </nav>
            <div className="border-sidebar-border flex shrink-0 flex-col gap-1 border-t p-3">
              <Link
                href={complex.data ? `/app/${complex.data.slug}` : '#'}
                aria-disabled={!complex.data}
                target="_blank"
                rel="noopener"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  navItemClass(false),
                  'aria-disabled:pointer-events-none aria-disabled:opacity-50',
                )}
              >
                <ExternalLinkIcon className="size-4 shrink-0" />
                Ver app
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
