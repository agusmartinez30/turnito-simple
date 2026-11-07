'use client';

import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePublicComplex,
  usePublicHome,
} from '@/features/public-request/hooks';
import { isApiError } from '@/lib/api/errors';
import { formatPrice } from '@/lib/date';
import type { PublicPayment } from '../api';
import { usePublicPayment, useUploadPaymentProof } from '../hooks';
import { BankTransferCard } from './BankTransferCard';
import { BookingSummaryCard } from './BookingSummaryCard';
import { PaymentForm } from './PaymentForm';

/** /app/[slug]/pagar/[id]: bank data + receipt upload for a booking (docs/23-public-payment-link.md). */
export function PublicPaymentView({ id }: { id: string }) {
  const home = usePublicHome();
  const complex = usePublicComplex();
  const payment = usePublicPayment(id);

  if (
    payment.isError &&
    isApiError(payment.error) &&
    (payment.error.code === 'NOT_FOUND' ||
      payment.error.code === 'BOOKING_NOT_PAYABLE')
  ) {
    const notFound = payment.error.code === 'NOT_FOUND';
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {notFound ? 'Reserva no encontrada' : 'Esta reserva no admite pagos'}
        </h1>
        <p className="text-muted-foreground max-w-[44ch]">
          {notFound
            ? 'El link no es válido o la reserva ya no existe.'
            : 'La reserva fue cancelada o ya está paga. Si tenés dudas, comunicate con el complejo.'}
        </p>
        <ButtonLink href={home} size="lg">
          Ir al inicio
        </ButtonLink>
      </div>
    );
  }
  if (payment.isError) {
    return (
      <ErrorAlert error={payment.error} onRetry={() => payment.refetch()} />
    );
  }
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }
  if (payment.isPending || complex.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <PaymentContent id={id} data={payment.data} tz={complex.data.timezone} />
  );
}

function PaymentContent({
  id,
  data,
  tz,
}: {
  id: string;
  data: PublicPayment;
  tz: string;
}) {
  const { booking, bank, proofs } = data;
  const home = usePublicHome();
  const upload = useUploadPaymentProof(id);
  // Bumping the key remounts the form (fresh values) without calling form.reset().
  const [formKey, setFormKey] = useState(0);
  const hasBank = Boolean(bank.cbu || bank.alias || bank.holderName);
  const justSent = upload.isSuccess;
  const canUpload = booking.remaining > 0;

  const sendAnother = () => {
    upload.reset();
    setFormKey((key) => key + 1);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <ButtonLink
        href={home}
        variant="ghost"
        size="sm"
        className="-ml-2.5 w-fit"
      >
        <ArrowLeftIcon />
        Volver a los turnos
      </ButtonLink>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-none font-bold tracking-tight">
          Pagar tu turno
        </h1>
        <p className="text-muted-foreground text-pretty">
          Transferí al complejo y subí el comprobante (PDF o captura) para que
          lo revisen.
        </p>
      </header>

      <BookingSummaryCard booking={booking} tz={tz} />

      {justSent && upload.variables && (
        <Alert className="border-success/40 bg-success-subtle">
          <CheckCircle2Icon className="text-success" />
          <AlertTitle>Comprobante enviado, pendiente de revisión</AlertTitle>
          <AlertDescription>
            <p>
              Enviaste {formatPrice(upload.variables.amount)}. El complejo lo va
              a revisar y registrar el pago.
            </p>
            <p>
              {booking.remaining > 0
                ? `Todavía quedan ${formatPrice(booking.remaining)} por pagar.`
                : 'Con esto el turno queda cubierto.'}
            </p>
            {booking.remaining > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={sendAnother}
              >
                Enviar otro comprobante
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!canUpload && !justSent && <CoverageMessage data={data} />}
      {canUpload && !justSent && proofs.pendingCount > 0 && (
        <Alert>
          <ClockIcon />
          <AlertTitle>
            {proofs.pendingCount === 1
              ? 'Hay un comprobante en revisión'
              : `Hay ${proofs.pendingCount} comprobantes en revisión`}
          </AlertTitle>
          <AlertDescription>
            Ya está descontado del saldo. Si todavía falta pagar, podés enviar
            otro comprobante.
          </AlertDescription>
        </Alert>
      )}

      {canUpload && !justSent && (
        <>
          <BankTransferCard bank={bank} hasBank={hasBank} />
          {hasBank && (
            <PaymentForm
              key={formKey}
              upload={upload}
              remaining={booking.remaining}
            />
          )}
        </>
      )}
    </div>
  );
}

function CoverageMessage({ data }: { data: PublicPayment }) {
  const { booking, proofs } = data;
  // Paid by the club: nothing left even ignoring receipts in review.
  if (booking.pendingAmount <= 0) {
    return (
      <Alert>
        <CheckIcon />
        <AlertTitle>Turno pago, ¡gracias!</AlertTitle>
        <AlertDescription>
          No queda saldo pendiente en este turno.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <ClockIcon />
      <AlertTitle>Ya está cubierto, pendiente de revisión</AlertTitle>
      <AlertDescription>
        {proofs.pendingCount === 1
          ? 'Hay un comprobante en revisión'
          : `Hay ${proofs.pendingCount} comprobantes en revisión`}
        . El complejo los va a revisar y registrar los pagos. Si rechazan
        alguno, el saldo vuelve a estar disponible.
      </AlertDescription>
    </Alert>
  );
}
