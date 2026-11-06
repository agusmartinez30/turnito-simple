'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePublicComplex,
  usePublicHome,
} from '@/features/public-request/hooks';
import { isApiError } from '@/lib/api/errors';
import { formatBookingDate, formatPrice, formatTimeRange } from '@/lib/date';
import type { PublicPayment } from '../api';
import { useUploadPaymentProof, usePublicPayment } from '../hooks';
import {
  buildProofFormSchema,
  formatFileSize,
  PAYER_NAME_MAX,
  PLAYERS_COUNT_MAX,
  parseProofForm,
  type ProofFormValues,
  validateProofFile,
} from '../schemas';

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
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-none font-bold tracking-tight">
          Pagar tu turno
        </h1>
        <p className="text-muted-foreground text-pretty">
          Transferí al complejo y subí el comprobante en PDF para que lo
          revisen.
        </p>
      </header>

      <BookingSummary booking={booking} tz={tz} />

      {justSent && upload.variables && (
        <Alert>
          <CheckIcon />
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
          <BankCard bank={bank} hasBank={hasBank} />
          {hasBank && (
            <UploadForm
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

function BookingSummary({
  booking,
  tz,
}: {
  booking: PublicPayment['booking'];
  tz: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{booking.courtName}</CardTitle>
        <CardDescription className="first-letter:uppercase">
          {formatBookingDate(booking.startsAt, tz)} ·{' '}
          {formatTimeRange(booking.startsAt, booking.endsAt, tz)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="text-right font-medium tabular-nums">
            {formatPrice(booking.price)}
          </dd>
          <dt className="text-muted-foreground">Ya pagado</dt>
          <dd className="text-right font-medium tabular-nums">
            {formatPrice(booking.paidAmount)}
          </dd>
          {booking.pendingProofsAmount > 0 && (
            <>
              <dt className="text-muted-foreground">En revisión</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatPrice(booking.pendingProofsAmount)}
              </dd>
            </>
          )}
          <dt className="pt-2 font-medium">Saldo a pagar</dt>
          <dd
            data-testid="payment-remaining"
            className="pt-2 text-right text-2xl leading-none font-bold tabular-nums"
          >
            {formatPrice(booking.remaining)}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function BankCard({
  bank,
  hasBank,
}: {
  bank: PublicPayment['bank'];
  hasBank: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos para transferir</CardTitle>
        {!hasBank && (
          <CardDescription>
            El complejo todavía no cargó sus datos bancarios. Comunicate con el
            complejo para coordinar el pago.
          </CardDescription>
        )}
      </CardHeader>
      {hasBank && (
        <CardContent>
          <dl className="flex flex-col divide-y">
            <BankRow label="CBU / CVU" value={bank.cbu} />
            <BankRow label="Alias" value={bank.alias} />
            <BankRow label="Titular" value={bank.holderName} />
          </dl>
        </CardContent>
      )}
    </Card>
  );
}

function BankRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('No se pudo copiar. Copialo a mano.');
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="font-medium break-all">{value}</dd>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Copiar ${label}`}
        onClick={copy}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

const FORM_FIELDS: ReadonlySet<string> = new Set([
  'payerName',
  'playersCount',
  'amount',
]);

function UploadForm({
  upload,
  remaining,
}: {
  upload: ReturnType<typeof useUploadPaymentProof>;
  remaining: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const schema = useMemo(() => buildProofFormSchema(remaining), [remaining]);
  const form = useForm<ProofFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { payerName: '', playersCount: '', amount: '' },
  });
  const { errors, isValid } = form.formState;
  const busy = upload.isPending;

  const choose = (next: File | undefined) => {
    upload.reset();
    if (!next) return;
    const error = validateProofFile(next);
    setFileError(error);
    setFile(error ? null : next);
  };
  const clear = () => {
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!file) return;
    upload.mutate(
      { file, ...parseProofForm(values) },
      {
        onError: (error) => {
          if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return;
          for (const [field, messages] of Object.entries(error.details ?? {})) {
            const message = messages[0];
            if (message && FORM_FIELDS.has(field)) {
              form.setError(field as keyof ProofFormValues, { message });
            }
          }
        },
      },
    );
  });

  // Field-level API errors are shown under their input; anything else goes in the alert.
  const fieldLevelError =
    upload.isError &&
    isApiError(upload.error) &&
    upload.error.code === 'VALIDATION_ERROR' &&
    Object.keys(upload.error.details ?? {}).some((f) => FORM_FIELDS.has(f));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tu comprobante</CardTitle>
        <CardDescription>
          Cargá los datos de la transferencia y el PDF (hasta 5 MB).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
          {upload.isError && !fieldLevelError && (
            <ErrorAlert error={upload.error} />
          )}
          {fileError && <ErrorAlert message={fileError} />}

          <FieldGroup>
            <Field data-invalid={Boolean(errors.payerName)}>
              <FieldLabel htmlFor="proof-payer-name">
                Nombre de quien paga
              </FieldLabel>
              <Input
                id="proof-payer-name"
                autoComplete="name"
                maxLength={PAYER_NAME_MAX}
                aria-invalid={Boolean(errors.payerName)}
                disabled={busy}
                {...form.register('payerName')}
              />
              <FieldError errors={[errors.payerName]} />
            </Field>

            <Field data-invalid={Boolean(errors.playersCount)}>
              <FieldLabel htmlFor="proof-players-count">
                Cantidad de jugadores que paga{' '}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </FieldLabel>
              <Input
                id="proof-players-count"
                type="text"
                inputMode="numeric"
                className="tabular-nums"
                aria-invalid={Boolean(errors.playersCount)}
                disabled={busy}
                {...form.register('playersCount')}
              />
              <FieldDescription>
                Entre 1 y {PLAYERS_COUNT_MAX}.
              </FieldDescription>
              <FieldError errors={[errors.playersCount]} />
            </Field>

            <Field data-invalid={Boolean(errors.amount)}>
              <FieldLabel htmlFor="proof-amount">
                Monto del comprobante
              </FieldLabel>
              <Input
                id="proof-amount"
                type="text"
                inputMode="numeric"
                className="tabular-nums"
                aria-invalid={Boolean(errors.amount)}
                disabled={busy}
                {...form.register('amount')}
              />
              <FieldDescription>
                Saldo a pagar: {formatPrice(remaining)}.{' '}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2"
                  disabled={busy}
                  onClick={() =>
                    form.setValue('amount', String(remaining), {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                >
                  Usar el saldo completo
                </button>
              </FieldDescription>
              <FieldError errors={[errors.amount]} />
            </Field>
          </FieldGroup>

          <input
            ref={inputRef}
            id="payment-proof-file"
            data-testid="payment-proof-input"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={busy}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
              <FileTextIcon className="text-muted-foreground size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {file.name}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatFileSize(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Quitar archivo"
                disabled={busy}
                onClick={clear}
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <label
              htmlFor="payment-proof-file"
              className="bg-muted/40 hover:bg-muted flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-6 text-center text-sm transition-colors"
            >
              <UploadIcon className="text-muted-foreground size-5" />
              <span className="font-medium">Elegir comprobante en PDF</span>
            </label>
          )}

          <Button type="submit" size="lg" disabled={!file || !isValid || busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            {busy ? 'Enviando…' : 'Confirmar pago'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
