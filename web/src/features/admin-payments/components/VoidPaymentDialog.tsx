'use client';

import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { isApiError } from '@/lib/api/errors';
import { formatDateTime, formatPrice } from '@/lib/date';
import { PAYMENT_METHOD_LABELS } from '@/lib/labels';
import type { Payment } from '@/types/admin';
import { useVoidPayment } from '../hooks';

const REASON_MAX = 280;

export interface VoidTarget {
  bookingId: string;
  payment: Payment;
}

interface Props {
  target: VoidTarget | null;
  timezone: string;
  onClose: () => void;
  /** Tras 409 PAYMENT_ALREADY_VOIDED: refetch para mostrar el estado actual sin error visible. */
  onRefetch?: () => void;
}

/** Anulación soft de un pago con motivo opcional (docs/12-admin-payments.md › VoidPaymentDialog). */
export function VoidPaymentDialog({
  target,
  timezone,
  onClose,
  onRefetch,
}: Props) {
  const [reason, setReason] = useState('');
  const voidPayment = useVoidPayment();
  const open = target !== null;

  const close = () => {
    if (voidPayment.isPending) return;
    voidPayment.reset();
    setReason('');
    onClose();
  };

  const confirm = () => {
    if (!target) return;
    voidPayment.mutate(
      {
        bookingId: target.bookingId,
        paymentId: target.payment.id,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Pago anulado');
          close();
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'PAYMENT_ALREADY_VOIDED') {
            toast.error(error.message);
            close();
            onRefetch?.();
          }
          // Otros errores quedan inline en el diálogo.
        },
      },
    );
  };

  const p = target?.payment;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular este pago?</AlertDialogTitle>
          <AlertDialogDescription>
            {p && (
              <>
                {formatPrice(p.amount)} en{' '}
                {PAYMENT_METHOD_LABELS[p.method].toLowerCase()}
                {p.note && ` (${p.note})`} · por {p.registeredBy.name} el{' '}
                {formatDateTime(p.createdAt, timezone)}. Deja de contar para el
                saldo pero queda en el historial.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field>
          <FieldLabel htmlFor="void-reason">
            Motivo{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </FieldLabel>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
            placeholder="Ej.: se cargó dos veces"
            rows={2}
            disabled={voidPayment.isPending}
          />
          <FieldDescription>
            {reason.length}/{REASON_MAX}
          </FieldDescription>
        </Field>

        {voidPayment.isError && <ErrorAlert error={voidPayment.error} />}

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={close}
            disabled={voidPayment.isPending}
          >
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={voidPayment.isPending}
          >
            {voidPayment.isPending && <Loader2Icon className="animate-spin" />}
            Sí, anular
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
