'use client';

import { Loader2Icon, PauseCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/hooks';

/** Full-screen notice for an ADMIN whose complex was suspended (403 COMPLEX_SUSPENDED). */
export function ComplexSuspended() {
  const logout = useLogout();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <PauseCircleIcon className="text-muted-foreground size-10" />
      <h1 className="text-xl font-semibold">Tu complejo está suspendido</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Por ahora no podés usar el panel ni recibir reservas. Contactá al equipo
        de la plataforma para reactivarlo.
      </p>
      <Button onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending && <Loader2Icon className="animate-spin" />}
        Cerrar sesión
      </Button>
    </main>
  );
}
