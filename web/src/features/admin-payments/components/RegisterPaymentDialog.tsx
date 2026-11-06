'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BanknoteIcon,
  LandmarkIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Path } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { useIsDesktop } from '@/hooks/use-media-query';
import { isApiError } from '@/lib/api/errors';
import { formatBookingDate, formatPrice, formatTimeRange } from '@/lib/date';
import {
  PAYMENT_METHOD_LABELS,
  SPLIT_DEFAULT_BY_SPORT,
  customerDisplayName,
} from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { Sport } from '@/types';
import type {
  AdminBooking,
  PaymentMethod,
  PaymentSummary,
} from '@/types/admin';
import { useRegisterPayment } from '../hooks';
import {
  NOTE_MAX,
  type RegisterPaymentInput,
  registerPaymentSchema,
  type RegisterPaymentValues,
} from '../schemas';

/** Lo mínimo que el diálogo necesita para registrar un pago sobre un turno. */
export interface PaymentTarget {
  id: string;
  price: number;
  sport: Sport;
  courtName: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  payment: PaymentSummary;
}

export function toPaymentTarget(booking: AdminBooking): PaymentTarget {
  return {
    id: booking.id,
    price: booking.price,
    sport: booking.court.sport,
    courtName: booking.court.name,
    customerName: customerDisplayName(booking.customer),
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    payment: booking.payment,
  };
}

interface Props {
  target: PaymentTarget | null;
  timezone: string;
  onClose: () => void;
  /** Tras 409 BOOKING_NOT_PAYABLE: refetch para mostrar el estado actual. */
  onRefetch?: () => void;
}

const TITLE = 'Registrar pago';
const FORM_ID = 'register-payment-form';
const SPLIT_MIN = 1;
const SPLIT_MAX = 30;
const FIELD_NAMES = new Set<string>(['amount', 'method', 'note']);

/**
 * Registro de pagos encadenados (docs/12-admin-payments.md › RegisterPaymentDialog).
 * `Dialog` en md+, `Sheet` inferior en mobile. No se cierra al registrar: el empleado carga
 * un pago por jugador con Enter y cierra con "Listo". El formulario se monta con `key` por turno.
 */
export function RegisterPaymentDialog({
  target,
  timezone,
  onClose,
  onRefetch,
}: Props) {
  const isDesktop = useIsDesktop();
  const [busy, setBusy] = useState(false);
  const open = target !== null;

  const handleOpenChange = (next: boolean) => {
    if (!next && !busy) onClose();
  };

  const description = target
    ? `${target.courtName} · ${formatBookingDate(target.startsAt, timezone)} · ${formatTimeRange(target.startsAt, target.endsAt, timezone)} · ${target.customerName}`
    : '';

  const content = target && (
    <RegisterPaymentForm
      key={target.id}
      target={target}
      onClose={onClose}
      onRefetch={onRefetch}
      onBusyChange={setBusy}
      footer={isDesktop ? 'dialog' : 'sheet'}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!busy} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{TITLE}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={!busy}
        className="max-h-[90svh] overflow-y-auto rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{TITLE}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}

interface FormProps {
  target: PaymentTarget;
  onClose: () => void;
  onRefetch?: () => void;
  onBusyChange: (busy: boolean) => void;
  footer: 'dialog' | 'sheet';
}

function RegisterPaymentForm({
  target,
  onClose,
  onRefetch,
  onBusyChange,
  footer,
}: FormProps) {
  const register = useRegisterPayment();
  // El resumen vive acá para actualizarse con cada respuesta sin depender de la query de detalle.
  const [summary, setSummary] = useState<PaymentSummary>(target.payment);
  const [registered, setRegistered] = useState(0);
  const [splitN, setSplitN] = useState(SPLIT_DEFAULT_BY_SPORT[target.sport]);

  const form = useForm<RegisterPaymentInput, unknown, RegisterPaymentValues>({
    resolver: zodResolver(registerPaymentSchema),
    defaultValues: { amount: '', method: 'CASH', note: '' },
  });
  const { errors } = form.formState;
  const amountRaw = useWatch({ control: form.control, name: 'amount' });
  const amount = Number(amountRaw);

  const remaining = Math.max(summary.balance, 0);
  const settled = summary.balance <= 0;
  const share = Math.ceil(target.price / Math.max(splitN, SPLIT_MIN));
  const overpayBy =
    Number.isFinite(amount) && amount > 0 ? amount - remaining : 0;

  const setAmount = (value: number) => {
    form.setValue('amount', value, {
      shouldValidate: false,
      shouldDirty: true,
    });
    form.clearErrors('amount');
    form.setFocus('amount');
  };

  const onSubmit = form.handleSubmit((values) => {
    onBusyChange(true);
    register.mutate(
      {
        bookingId: target.id,
        payload: {
          amount: values.amount,
          method: values.method,
          ...(values.note ? { note: values.note } : {}),
        },
      },
      {
        onSettled: () => onBusyChange(false),
        onSuccess: (booking) => {
          toast.success(
            `Pago registrado: ${formatPrice(values.amount)} en ${PAYMENT_METHOD_LABELS[values.method].toLowerCase()}`,
          );
          setSummary(booking.payment);
          setRegistered((n) => n + 1);
          // Se limpian monto y nota con setValue, no con reset(): reset() vacía el registro
          // interno de campos y, con React Compiler memoizando el ref de register(), el
          // input queda desconectado del form. El método se conserva a propósito.
          form.setValue('amount', '');
          form.setValue('note', '');
          form.clearErrors();
          form.setFocus('amount');
        },
        onError: (error) => {
          if (!isApiError(error)) return;
          if (error.code === 'BOOKING_NOT_PAYABLE') {
            toast.error(error.message);
            onClose();
            onRefetch?.();
            return;
          }
          if (error.code === 'VALIDATION_ERROR' && error.details) {
            for (const [field, messages] of Object.entries(error.details)) {
              if (FIELD_NAMES.has(field)) {
                form.setError(field as Path<RegisterPaymentInput>, {
                  message: messages[0],
                });
              }
            }
          }
          // Otros errores quedan inline en el diálogo.
        },
      },
    );
  });

  const pending = register.isPending;
  const showInlineError =
    register.isError &&
    !(
      isApiError(register.error) &&
      (register.error.code === 'VALIDATION_ERROR' ||
        register.error.code === 'BOOKING_NOT_PAYABLE')
    );

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        disabled={pending}
      >
        {registered > 0
          ? `Listo · ${registered} ${registered === 1 ? 'pago' : 'pagos'}`
          : 'Listo'}
      </Button>
      <Button type="submit" form={FORM_ID} disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        Registrar pago
      </Button>
    </>
  );

  const body = (
    <form
      id={FORM_ID}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      <SummaryHeader summary={summary} price={target.price} />

      <Field data-invalid={Boolean(errors.method)}>
        <FieldLabel>Método</FieldLabel>
        <Controller
          control={form.control}
          name="method"
          render={({ field }) => (
            <div
              role="radiogroup"
              aria-label="Método de pago"
              className="grid grid-cols-2 gap-2"
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                (method) => {
                  const selected = field.value === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={pending}
                      onClick={() => field.onChange(method)}
                      className={cn(
                        'focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {method === 'CASH' ? (
                        <BanknoteIcon className="size-4" />
                      ) : (
                        <LandmarkIcon className="size-4" />
                      )}
                      {PAYMENT_METHOD_LABELS[method]}
                    </button>
                  );
                },
              )}
            </div>
          )}
        />
        <FieldError errors={[errors.method]} />
      </Field>

      <Field data-invalid={Boolean(errors.amount)}>
        <FieldLabel htmlFor="payment-amount">Monto</FieldLabel>
        <div className="relative">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
            $
          </span>
          <Input
            id="payment-amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            autoFocus
            autoComplete="off"
            className="pl-6 text-lg tabular-nums"
            aria-invalid={Boolean(errors.amount)}
            disabled={pending}
            {...form.register('amount')}
          />
        </div>
        <FieldError errors={[errors.amount]} />

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || settled}
            onClick={() => setAmount(remaining)}
          >
            Saldar restante ({formatPrice(remaining)})
          </Button>
          <div className="flex items-center gap-1.5 text-sm">
            <label htmlFor="payment-split" className="text-muted-foreground">
              Dividir entre
            </label>
            <Input
              id="payment-split"
              type="number"
              inputMode="numeric"
              min={SPLIT_MIN}
              max={SPLIT_MAX}
              step={1}
              value={splitN}
              disabled={pending}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= SPLIT_MIN && n <= SPLIT_MAX) {
                  setSplitN(n);
                }
              }}
              className="h-8 w-16 tabular-nums"
              aria-label="Cantidad de jugadores"
            />
            <span className="text-muted-foreground tabular-nums">
              = {formatPrice(share)} c/u
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setAmount(share)}
            >
              Usar una parte
            </Button>
          </div>
        </div>
      </Field>

      <Field data-invalid={Boolean(errors.note)}>
        <FieldLabel htmlFor="payment-note">
          Nota{' '}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </FieldLabel>
        <Input
          id="payment-note"
          maxLength={NOTE_MAX}
          autoComplete="off"
          placeholder="Ej.: Juan, paga por dos"
          aria-invalid={Boolean(errors.note)}
          disabled={pending}
          {...form.register('note')}
        />
        <FieldError errors={[errors.note]} />
      </Field>

      {overpayBy > 0 && (
        <Alert className="border-warning/50 bg-warning-subtle text-warning-subtle-foreground">
          <TriangleAlertIcon />
          <AlertDescription>
            {settled
              ? `Este turno ya está saldado; el pago quedará como saldo a favor de ${formatPrice(amount - summary.balance)}.`
              : `Supera el restante por ${formatPrice(overpayBy)}. El turno quedará con saldo a favor de ${formatPrice(overpayBy)}.`}
          </AlertDescription>
        </Alert>
      )}

      {showInlineError && <ErrorAlert error={register.error} />}
    </form>
  );

  if (footer === 'dialog') {
    return (
      <>
        {body}
        <DialogFooter>{actions}</DialogFooter>
      </>
    );
  }
  return (
    <>
      <div className="px-4">{body}</div>
      <SheetFooter className="flex-col-reverse">{actions}</SheetFooter>
    </>
  );
}

/** Total / Pagado / Restante, siempre visible y actualizado tras cada pago. */
function SummaryHeader({
  summary,
  price,
}: {
  summary: PaymentSummary;
  price: number;
}) {
  const settled = summary.balance <= 0;
  return (
    <div className="bg-muted/50 grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
      <Stat label="Total" value={formatPrice(price)} />
      <Stat label="Pagado" value={formatPrice(summary.paidAmount)} />
      <Stat
        label={summary.balance < 0 ? 'Saldo a favor' : 'Restante'}
        value={formatPrice(Math.abs(summary.balance))}
        className={cn(
          'text-lg',
          settled ? 'text-success-subtle-foreground' : 'text-foreground',
        )}
        hint={summary.balance === 0 ? 'Turno saldado' : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  className,
  hint,
}: {
  label: string;
  value: string;
  className?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-semibold tabular-nums', className)}>
        {value}
      </span>
      {hint && (
        <span className="text-success-subtle-foreground text-xs">{hint}</span>
      )}
    </div>
  );
}
