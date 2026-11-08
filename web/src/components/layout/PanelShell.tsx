'use client';

import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LogOutIcon,
  MenuIcon,
  UserIcon,
  XIcon,
  type LucideIcon,
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
import { useLogout, useMe } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';

export interface PanelNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

function isActive(pathname: string, item: PanelNavItem): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Foco visible dentro de la navegación (usa el anillo propio de la sidebar). */
const NAV_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring';

/**
 * Ítem de la sidebar. El activo se marca con el filete y el ícono en `highlight`; el relleno
 * gris solo acompaña (docs/05-admin-overview.md › Layout).
 */
function navItemClass(active: boolean): string {
  return cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    NAV_FOCUS,
    active
      ? 'bg-sidebar-active text-sidebar-foreground before:bg-sidebar-primary relative font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full [&>svg]:text-sidebar-primary'
      : 'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  );
}

/** "Ver app" link; `href: null` renders it disabled while the target is still loading. */
export interface AppLink {
  href: string | null;
}

/** Menú del usuario: en la sidebar va sobre la sidebar, en el header mobile sobre el fondo claro. */
function UserMenu({
  onSidebar = false,
  appLink,
}: {
  onSidebar?: boolean;
  appLink?: AppLink;
}) {
  const me = useMe();
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
        {appLink && (
          <>
            <DropdownMenuItem
              disabled={!appLink.href}
              render={
                <Link
                  href={appLink.href ?? '#'}
                  target="_blank"
                  rel="noopener"
                />
              }
            >
              <ExternalLinkIcon />
              Ver app
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
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

interface PanelShellProps {
  children: React.ReactNode;
  navItems: readonly PanelNavItem[];
  /** Where the brand links to. */
  homeHref: string;
  homeLabel: string;
  /** Logo + name block, rendered in the sidebar, the mobile header and the drawer. */
  mark: React.ReactNode;
  brandName: React.ReactNode;
  /** Notification bell, if the panel has one. */
  renderBell?: (className: string) => React.ReactNode;
  /** Optional trailing content of a nav item (e.g. pending badge). */
  renderNavBadge?: (item: PanelNavItem) => React.ReactNode;
  /** Complex public app link; omit for panels without a complex (SUPER_ADMIN). */
  appLink?: AppLink;
}

/**
 * Layout del panel (docs/05-admin-overview.md › Layout): sidebar fija en lg+, header + drawer
 * lateral en pantallas chicas. La navegación es una superficie neutra propia (tokens
 * `--sidebar-*`). Es presentacional: el contenido por rol lo inyectan `AdminShell` y
 * `SuperAdminShell`, así ningún hook de complejo corre para el SUPER_ADMIN.
 */
export function PanelShell({
  children,
  navItems,
  homeHref,
  homeLabel,
  mark,
  brandName,
  renderBell,
  renderNavBadge,
  appLink,
}: PanelShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingBadge = (item: PanelNavItem) => renderNavBadge?.(item) ?? null;

  return (
    <div className="flex min-h-full flex-1">
      {/* Sidebar (lg+) */}
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-60 shrink-0 flex-col lg:flex">
        <div className="border-sidebar-border flex h-14 items-center border-b pr-2">
          <Link
            href={homeHref}
            className={cn(
              'flex h-full min-w-0 flex-1 items-center gap-2 px-4 font-semibold',
              NAV_FOCUS,
            )}
            aria-label={homeLabel}
          >
            {mark}
            <span className="truncate">{brandName}</span>
          </Link>
          {renderBell?.(
            'text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/50 size-9 shrink-0',
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Panel">
          {navItems.map((item) => {
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
          {appLink && (
            <Link
              href={appLink.href ?? '#'}
              aria-disabled={!appLink.href}
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
          )}
          <UserMenu onSidebar appLink={appLink} />
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
            href={homeHref}
            className="flex min-w-0 flex-1 items-center gap-2 font-semibold"
            aria-label={homeLabel}
          >
            {mark}
            <span className="truncate">{brandName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {renderBell?.('size-11')}
            <UserMenu appLink={appLink} />
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
              <span className="truncate font-semibold">{brandName}</span>
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
              {navItems.map((item) => {
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
            {appLink && (
              <div className="border-sidebar-border flex shrink-0 flex-col gap-1 border-t p-3">
                <Link
                  href={appLink.href ?? '#'}
                  aria-disabled={!appLink.href}
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
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
