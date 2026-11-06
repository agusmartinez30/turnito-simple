'use client';

import { differenceInMilliseconds, parseISO } from 'date-fns';
import { InfoIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { isApiError } from '@/lib/api/errors';
import { formatBookingDate, formatTimeRange } from '@/lib/date';
import type { Complex } from '@/types';
import { useAdminCancelBooking } from '../hooks';

const REASON_MAX = 280;

/** Lo mínimo que el diálogo necesita de una reserva (sirve para AdminBooking y para el resumen de la agenda). */
export interface CancelTarget {
  id: string;
  startsAt: string;
  endsAt: string;
  courtName: string;
  customerName: string;
  /** Solicitud pública PENDING: el diálogo habla de "rechazar". */
  pending?: boolean;
}

interface Props {
  target: CancelTarget | null;
  complex: Complex;
  onClose: () => void;
  /** Tras 422 BOOKING_ALREADY_CANCELLED: refetch para mostrar el estado actual sin error visible. */
  onRefetch?: () => void;
}

/**
 * Cancelación del admin, sin ventana de anticipación, con motivo opcional
 * (docs/07-admin-bookings.md › AdminCancelDialog). Compartido por agenda, listado y detalle.
 */
export function AdminCancelDialog({
  target,
  complex,
  onClose,
  onRefetch,
}: Props) {
  const [reason, setReason] = useState('');
  const cancel = useAdminCancelBooking();
  const open = target !== null;

  const close = () => {
    if (cancel.isPending) return;
    cancel.reset();
    setReason('');
    onClose();
  };

  const insideWindow =
    target !== null &&
    differenceInMilliseconds(parseISO(target.startsAt), new Date()) <
      complex.cancellationWindowHours * 3_600_000;

  const confirm = () => {
    if (!target) return;
    cancel.mutate(
      { id: target.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(
            target.pending ? 'Solicitud rechazada' : 'Reserva cancelada',
          );
          close();
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'BOOKING_ALREADY_CANCELLED') {
            close();
            onRefetch?.();
          }
          // Otros errores quedan inline en el diálogo.
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target?.pending
              ? '¿Rechazar la solicitud?'
              : '¿Cancelar la reserva?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target && (
              <>
                {target.customerName} · {target.courtName} ·{' '}
                {formatBookingDate(target.startsAt, complex.timezone)} ·{' '}
                {formatTimeRange(
                  target.startsAt,
                  target.endsAt,
                  complex.timezone,
                )}
                . El turno queda libre para otro cliente. Esta acción no se
                puede deshacer.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {insideWindow && !target?.pending && (
          <Alert>
            <InfoIcon />
            <AlertDescription>
              Faltan menos de {complex.cancellationWindowHours} h. El jugador no
              podría cancelarla por su cuenta; como administrador podés hacerlo
              igual.
            </AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="cancel-reason">
            Motivo{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </FieldLabel>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
            placeholder="Ej.: el cliente avisó por teléfono"
            rows={3}
            disabled={cancel.isPending}
          />
          <FieldDescription>
            {reason.length}/{REASON_MAX}. El jugador lo ve en su reserva.
          </FieldDescription>
        </Field>

        {cancel.isError && <ErrorAlert error={cancel.error} />}

        <AlertDialogFooter>
          <Button variant="outline" onClick={close} disabled={cancel.isPending}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={cancel.isPending}
          >
            {cancel.isPending && <Loader2Icon className="animate-spin" />}
            {target?.pending ? 'Sí, rechazar' : 'Sí, cancelar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
