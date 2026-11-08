'use client';

import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import type { SuperAdminComplex } from '@/types/admin';
import { useSetComplexSuspension } from '../hooks';

interface Props {
  /** Complex to suspend (when active) or reactivate (when suspended); `null` closes the dialog. */
  target: SuperAdminComplex | null;
  onClose: () => void;
}

/** Confirmation for suspending or reactivating a complex (docs/26-super-admin.md). */
export function SuspensionDialog({ target, onClose }: Props) {
  const mutation = useSetComplexSuspension();
  const suspending = target !== null && target.suspendedAt === null;

  const close = () => {
    if (mutation.isPending) return;
    mutation.reset();
    onClose();
  };

  const confirm = () => {
    if (!target) return;
    mutation.mutate(
      { id: target.id, suspended: suspending },
      {
        // Errors stay inline in the dialog.
        onSuccess: () => {
          toast.success(
            suspending ? 'Complejo suspendido' : 'Complejo reactivado',
          );
          close();
        },
      },
    );
  };

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(next) => !next && close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {suspending ? '¿Suspender el complejo?' : '¿Reactivar el complejo?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {suspending
              ? `${target?.name} deja de recibir reservas y sus administradores pierden el acceso al panel hasta que lo reactives.`
              : `${target?.name} vuelve a recibir reservas y sus administradores recuperan el acceso al panel.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {mutation.isError && <ErrorAlert error={mutation.error} />}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={close}
            disabled={mutation.isPending}
          >
            Volver
          </Button>
          <Button
            variant={suspending ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2Icon className="animate-spin" />}
            {suspending ? 'Sí, suspender' : 'Sí, reactivar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
