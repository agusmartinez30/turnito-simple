'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangleIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { isApiError } from '@/lib/api/errors';
import { formatPrice } from '@/lib/date';
import type { useUploadPaymentProof } from '../hooks';
import {
  buildProofFormSchema,
  isAmountOverBalance,
  PAYER_NAME_MAX,
  parseProofForm,
  type ProofFormValues,
  validateProofFile,
} from '../schemas';
import { ProofUploadField } from './ProofUploadField';

const FORM_FIELDS: ReadonlySet<string> = new Set([
  'payerName',
  'playersCount',
  'amount',
]);
const schema = buildProofFormSchema();

/** "Informar transferencia" form. Amount is never prefilled; over-balance is a soft warning. */
export function PaymentForm({
  upload,
  remaining,
}: {
  upload: ReturnType<typeof useUploadPaymentProof>;
  remaining: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const form = useForm<ProofFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { payerName: '', playersCount: '', amount: '' },
  });
  const { errors, isValid } = form.formState;
  const amount = useWatch({ control: form.control, name: 'amount' });
  const overBalance = isAmountOverBalance(amount ?? '', remaining);
  const busy = upload.isPending;

  const choose = (next: File | undefined) => {
    upload.reset();
    if (!next) return;
    const error = validateProofFile(next);
    setFileError(error);
    setFile(error ? null : next);
    // Allow re-picking the same file after an error.
    if (error && inputRef.current) inputRef.current.value = '';
  };
  const clear = () => {
    setFile(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!file || busy) return;
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
        <CardTitle>Informar transferencia</CardTitle>
        <CardDescription>
          Ingresá el importe que transferiste y adjuntá tu comprobante para que
          el complejo pueda verificarlo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate className="flex flex-col gap-6" onSubmit={onSubmit}>
          {upload.isError && !fieldLevelError && (
            <ErrorAlert error={upload.error} />
          )}

          <FieldGroup>
            <Field data-invalid={Boolean(errors.payerName)}>
              <FieldLabel htmlFor="proof-payer-name">
                Nombre de quien paga
              </FieldLabel>
              <Input
                id="proof-payer-name"
                autoComplete="name"
                placeholder="Ej. Juan Pérez"
                maxLength={PAYER_NAME_MAX}
                aria-invalid={Boolean(errors.payerName)}
                disabled={busy}
                {...form.register('payerName')}
              />
              <FieldError errors={[errors.payerName]} />
            </Field>

            <Field data-invalid={Boolean(errors.amount)}>
              <FieldLabel htmlFor="proof-amount">
                Importe transferido
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>$</InputGroupAddon>
                <InputGroupInput
                  id="proof-amount"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular-nums"
                  aria-invalid={Boolean(errors.amount)}
                  disabled={busy}
                  {...form.register('amount')}
                />
              </InputGroup>
              <FieldDescription>
                Ingresá exactamente el monto que figura en tu comprobante
              </FieldDescription>
              <FieldError errors={[errors.amount]} />
              {overBalance && !errors.amount && (
                <p
                  role="status"
                  className="text-warning-subtle-foreground bg-warning-subtle flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <AlertTriangleIcon
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <span>
                    El importe supera el saldo pendiente (
                    {formatPrice(remaining)}). Revisá que sea el monto de tu
                    comprobante.
                  </span>
                </p>
              )}
            </Field>

            <Field data-invalid={Boolean(errors.playersCount)}>
              <FieldLabel htmlFor="proof-players-count">
                Cantidad de jugadores{' '}
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
                Indicá cuántos jugadores cubre tu transferencia
              </FieldDescription>
              <FieldError errors={[errors.playersCount]} />
            </Field>
          </FieldGroup>

          <ProofUploadField
            inputRef={inputRef}
            file={file}
            error={fileError}
            disabled={busy}
            onChoose={choose}
            onClear={clear}
          />

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!file || !isValid || busy}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
              {busy ? 'Enviando…' : 'Enviar comprobante'}
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              El complejo verificará tu transferencia
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
