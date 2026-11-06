'use client';

import { Loader2Icon, ShieldOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/hooks';

/**
 * Pantalla completa para un usuario logueado sin rol ADMIN (docs/05-admin-overview.md).
 * La web con sesión es solo el panel (docs/16-multi-complex.md): la única salida es cerrar sesión.
 */
export function AdminForbidden() {
  const logout = useLogout();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <ShieldOffIcon className="text-muted-foreground size-10" />
      <h1 className="text-xl font-semibold">
        No tenés permisos para acceder a esta sección
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        El panel de administración es solo para el personal del complejo.
        Ingresá con la cuenta de administrador de tu complejo.
      </p>
      <Button onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending && <Loader2Icon className="animate-spin" />}
        Cerrar sesión
      </Button>
    </main>
  );
}
