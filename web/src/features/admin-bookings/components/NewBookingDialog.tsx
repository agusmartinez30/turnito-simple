'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { useAdminCourts } from '@/features/admin-courts/hooks';
import { isApiError } from '@/lib/api/errors';
import { dateParamOf, formatPrice, todayInTz } from '@/lib/date';
import { SPORT_LABELS } from '@/lib/labels';
import type { Complex } from '@/types';
import type { AdminCustomer } from '@/types/admin';
import { useAdminBookings, useCreateAdminBooking } from '../hooks';
import { slotStartsFor } from '../lib/slot-starts';
import {
  type NewBookingInput,
  newBookingSchema,
  type NewBookingValues,
} from '../schemas';
import { CustomerPicker } from './CustomerPicker';

const FORM_ID = 'new-booking-form';

interface Props {
  open: boolean;
  complex: Complex;
  onClose: () => void;
  /** Prefill from an agenda cell. */
  defaultCourtId?: string;
  /** ISO instant of the slot to preselect (needs `defaultCourtId`). */
  defaultStartsAt?: string;
  /** Business day (`YYYY-MM-DD`); defaults to the day of `defaultStartsAt`, else today. */
  defaultDate?: string;
}

/** Manual booking: court + date + start time, optional customer, price and note. */
export function NewBookingDialog({
  open,
  complex,
  onClose,
  defaultCourtId,
  defaultStartsAt,
  defaultDate,
}: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent showCloseButton={!busy} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva reserva</DialogTitle>
          <DialogDescription>
            Cargá un turno desde el mostrador: elegí cancha, día y horario.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <NewBookingForm
            complex={complex}
            onClose={onClose}
            onBusyChange={setBusy}
            defaultCourtId={defaultCourtId}
            defaultStartsAt={defaultStartsAt}
            defaultDate={defaultDate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewBookingForm({
  complex,
  onClose,
  onBusyChange,
  defaultCourtId,
  defaultStartsAt,
  defaultDate,
}: {
  complex: Complex;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  defaultCourtId?: string;
  defaultStartsAt?: string;
  defaultDate?: string;
}) {
  const courts = useAdminCourts();
  const create = useCreateAdminBooking();
  const activeCourts = useMemo(
    () => (courts.data ?? []).filter((c) => c.isActive),
    [courts.data],
  );

  const [courtId, setCourtId] = useState(defaultCourtId ?? '');
  const [date, setDate] = useState(
    () =>
      defaultDate ??
      (defaultStartsAt
        ? dateParamOf(defaultStartsAt, complex.timezone)
        : todayInTz(complex.timezone)),
  );
  const [startsAt, setStartsAt] = useState(
    defaultCourtId ? (defaultStartsAt ?? '') : '',
  );
  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [noCustomer, setNoCustomer] = useState(false);

  const court = activeCourts.find((c) => c.id === courtId);
  const slots = useMemo(
    () => (court ? slotStartsFor(date, court, complex.timezone) : []),
    [court, date, complex.timezone],
  );

  // Active bookings of that court and day, to mark the taken slots.
  const dayBookings = useAdminBookings({
    date,
    courtId: courtId || undefined,
    order: 'asc',
  });
  const taken = useMemo(
    () =>
      new Set(
        (dayBookings.data ?? [])
          .filter((b) => b.status !== 'CANCELLED' && b.courtId === courtId)
          .map((b) => new Date(b.startsAt).getTime()),
      ),
    [dayBookings.data, courtId],
  );

  const form = useForm<NewBookingInput, unknown, NewBookingValues>({
    resolver: zodResolver(newBookingSchema),
    defaultValues: {
      customerId: '',
      price:
        activeCourts.find((c) => c.id === defaultCourtId)?.pricePerSlot ?? 0,
      note: '',
    },
  });
  const { errors } = form.formState;

  const slotItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const s of slots) {
      const suffix = taken.has(new Date(s.startsAt).getTime())
        ? ' (ocupado)'
        : '';
      items[s.startsAt] = `${s.startLabel} – ${s.endLabel}${suffix}`;
    }
    return items;
  }, [slots, taken]);

  const courtItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const c of activeCourts) {
      items[c.id] = `${c.name} · ${SPORT_LABELS[c.sport]}`;
    }
    return items;
  }, [activeCourts]);

  // The price follows the list price of the chosen court.
  const onCourtChange = (next: string | null) => {
    const id = next ?? '';
    setCourtId(id);
    setStartsAt('');
    const picked = activeCourts.find((c) => c.id === id);
    if (picked) {
      form.setValue('price', picked.pricePerSlot, { shouldValidate: true });
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!court || !startsAt) {
      toast.error('Elegí cancha y horario.');
      return;
    }
    onBusyChange(true);
    const customerId = noCustomer ? undefined : values.customerId || undefined;
    create.mutate(
      {
        courtId: court.id,
        startsAt,
        ...(customerId ? { customerId } : {}),
        ...(values.price !== court.pricePerSlot ? { price: values.price } : {}),
        ...(values.note ? { note: values.note } : {}),
      },
      {
        onSettled: () => onBusyChange(false),
        onSuccess: (booking) => {
          toast.success(
            booking.customer
              ? `Turno cargado para ${booking.customer.name}`
              : 'Turno cargado sin cliente',
          );
          onClose();
        },
        onError: (error) => {
          if (
            isApiError(error) &&
            (error.code === 'SLOT_UNAVAILABLE' ||
              error.code === 'BOOKING_IN_PAST')
          ) {
            toast.error(
              error.code === 'SLOT_UNAVAILABLE'
                ? 'Ese turno ya está reservado.'
                : 'Ese turno ya pasó.',
            );
          }
        },
      },
    );
  });

  const pending = create.isPending;

  return (
    <>
      <form
        id={FORM_ID}
        onSubmit={onSubmit}
        noValidate
        className="flex max-h-[60svh] flex-col gap-5 overflow-y-auto px-0.5"
      >
        <Field>
          <FieldLabel>Cancha</FieldLabel>
          <Select
            items={courtItems}
            value={courtId}
            onValueChange={onCourtChange}
            disabled={pending || courts.isPending}
          >
            <SelectTrigger className="w-full" aria-label="Cancha">
              <SelectValue placeholder="Elegí una cancha" />
            </SelectTrigger>
            <SelectContent>
              {activeCourts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {courtItems[c.id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="new-booking-date">Día</FieldLabel>
            <Input
              id="new-booking-date"
              type="date"
              value={date}
              disabled={pending}
              onChange={(e) => {
                if (!e.target.value) return;
                setDate(e.target.value);
                setStartsAt('');
              }}
            />
          </Field>
          <Field>
            <FieldLabel>Horario</FieldLabel>
            <Select
              items={slotItems}
              value={startsAt}
              onValueChange={(next) => setStartsAt(next ?? '')}
              disabled={pending || !court}
            >
              <SelectTrigger className="w-full" aria-label="Horario">
                <SelectValue placeholder="Elegí un horario" />
              </SelectTrigger>
              <SelectContent>
                {slots.map((s) => (
                  <SelectItem
                    key={s.startsAt}
                    value={s.startsAt}
                    disabled={taken.has(new Date(s.startsAt).getTime())}
                  >
                    {slotItems[s.startsAt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Cliente</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setNoCustomer((value) => !value);
                setCustomer(null);
                form.setValue('customerId', '', { shouldValidate: true });
              }}
            >
              {noCustomer ? 'Elegir cliente' : 'Crear sin cliente'}
            </Button>
          </div>
          {noCustomer ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
              Turno sin cliente
            </p>
          ) : (
            <Field data-invalid={Boolean(errors.customerId)}>
              <CustomerPicker
                selected={customer}
                onSelect={(next) => {
                  setCustomer(next);
                  form.setValue('customerId', next?.id ?? '', {
                    shouldValidate: true,
                  });
                }}
                disabled={pending}
              />
              <FieldError errors={[errors.customerId]} />
            </Field>
          )}
        </div>

        <Field data-invalid={Boolean(errors.price)}>
          <FieldLabel htmlFor="new-booking-price">Precio</FieldLabel>
          <Input
            id="new-booking-price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-invalid={Boolean(errors.price)}
            disabled={pending}
            {...form.register('price')}
          />
          {court && (
            <FieldDescription>
              Precio de lista: {formatPrice(court.pricePerSlot)}
            </FieldDescription>
          )}
          <FieldError errors={[errors.price]} />
        </Field>

        <Field data-invalid={Boolean(errors.note)}>
          <FieldLabel htmlFor="new-booking-note">
            Nota{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </FieldLabel>
          <Textarea
            id="new-booking-note"
            rows={2}
            maxLength={280}
            placeholder="Ej.: paga al llegar, trae 4 personas"
            aria-invalid={Boolean(errors.note)}
            disabled={pending}
            {...form.register('note')}
          />
          <FieldError errors={[errors.note]} />
        </Field>

        {create.error && <ErrorAlert error={create.error} />}
      </form>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={pending}
        >
          Volver
        </Button>
        <Button
          type="submit"
          form={FORM_ID}
          disabled={pending || !court || !startsAt}
        >
          {pending && <Loader2Icon className="animate-spin" />}
          Confirmar turno
        </Button>
      </DialogFooter>
    </>
  );
}
