'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { InfoIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch, type Path } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/layout/ButtonLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
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
import { Switch } from '@/components/ui/switch';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { CourtImage } from '@/features/courts/components/CourtImage';
import { isApiError } from '@/lib/api/errors';
import { SPORT_LABELS, SPORT_ORDER } from '@/lib/labels';
import { closesNextDay, summarizeSlots } from '@/lib/slots';
import type { AdminCourt } from '@/types/admin';
import type { CreateCourtPayload, UpdateCourtPayload } from '../api';
import { useCreateCourt, useUpdateCourt } from '../hooks';
import {
  type CourtFormInput,
  type CourtFormValues,
  courtSchema,
  SLOT_DURATION_OPTIONS,
} from '../schemas';

interface Props {
  /** Ausente → alta. */
  court?: AdminCourt;
  /** Default de `sortOrder` en alta (máximo actual + 1). */
  nextSortOrder?: number;
}

const FIELD_NAMES: ReadonlySet<string> = new Set<Path<CourtFormInput>>([
  'name',
  'sport',
  'surface',
  'isIndoor',
  'imageUrl',
  'sortOrder',
  'openTime',
  'closeTime',
  'slotDurationMinutes',
  'pricePerSlot',
]);

const SPORT_ITEMS = Object.fromEntries(
  SPORT_ORDER.map((s) => [s, SPORT_LABELS[s]]),
) as Record<string, string>;
const DURATION_ITEMS = Object.fromEntries(
  SLOT_DURATION_OPTIONS.map((d) => [String(d), `${d} min`]),
) as Record<string, string>;

function toValues(court?: AdminCourt, nextSortOrder = 0): CourtFormInput {
  return {
    name: court?.name ?? '',
    sport: court?.sport ?? 'PADEL',
    surface: court?.surface ?? '',
    isIndoor: court?.isIndoor ?? false,
    imageUrl: court?.imageUrl ?? '',
    sortOrder: court?.sortOrder ?? nextSortOrder,
    openTime: court?.openTime ?? '08:00',
    closeTime: court?.closeTime ?? '23:00',
    slotDurationMinutes: court?.slotDurationMinutes ?? 60,
    pricePerSlot: court?.pricePerSlot ?? 0,
  };
}

/** Alta y edición de cancha (docs/08-admin-courts.md › CourtForm). */
export function CourtForm({ court, nextSortOrder }: Props) {
  const router = useRouter();
  const create = useCreateCourt();
  const update = useUpdateCourt();
  const isEdit = Boolean(court);
  const hasFutureBookings = (court?.futureBookingsCount ?? 0) > 0;

  const form = useForm<CourtFormInput, unknown, CourtFormValues>({
    resolver: zodResolver(courtSchema),
    defaultValues: toValues(court, nextSortOrder),
  });
  const { errors, isDirty } = form.formState;
  const [openTime, closeTime, duration, imageUrl, sport] = useWatch({
    control: form.control,
    name: ['openTime', 'closeTime', 'slotDurationMinutes', 'imageUrl', 'sport'],
  });
  const slots = summarizeSlots(
    String(openTime),
    String(closeTime),
    Number(duration),
  );

  const mutation = isEdit ? update : create;
  const busy = mutation.isPending;

  const applyApiErrors = (error: unknown) => {
    if (!isApiError(error)) return;
    if (error.code === 'COURT_NAME_ALREADY_EXISTS') {
      form.setError('name', {
        message: 'Ya existe una cancha con ese nombre.',
      });
      return;
    }
    if (error.code === 'VALIDATION_ERROR' && error.details) {
      for (const [field, messages] of Object.entries(error.details)) {
        if (FIELD_NAMES.has(field)) {
          form.setError(field as Path<CourtFormInput>, {
            message: messages[0],
          });
        }
      }
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    const done = (saved: AdminCourt) => {
      toast.success(isEdit ? 'Cambios guardados' : 'Cancha creada');
      router.push('/admin/courts');
      return saved;
    };

    if (!court) {
      const payload: CreateCourtPayload = {
        name: values.name,
        sport: values.sport,
        isIndoor: values.isIndoor,
        sortOrder: values.sortOrder,
        openTime: values.openTime,
        closeTime: values.closeTime,
        slotDurationMinutes: values.slotDurationMinutes,
        pricePerSlot: values.pricePerSlot,
        ...(values.surface ? { surface: values.surface } : {}),
        ...(values.imageUrl ? { imageUrl: values.imageUrl } : {}),
      };
      create.mutate(payload, { onSuccess: done, onError: applyApiErrors });
      return;
    }

    // PATCH parcial: solo lo que cambió. '' en surface/imageUrl → null (borrar).
    const payload: UpdateCourtPayload = {};
    if (values.name !== court.name) payload.name = values.name;
    if (values.sport !== court.sport) payload.sport = values.sport;
    if ((values.surface || null) !== (court.surface ?? null)) {
      payload.surface = values.surface || null;
    }
    if (values.isIndoor !== court.isIndoor) payload.isIndoor = values.isIndoor;
    if ((values.imageUrl || null) !== (court.imageUrl ?? null)) {
      payload.imageUrl = values.imageUrl || null;
    }
    if (values.sortOrder !== court.sortOrder)
      payload.sortOrder = values.sortOrder;
    if (values.openTime !== court.openTime) payload.openTime = values.openTime;
    if (values.closeTime !== court.closeTime)
      payload.closeTime = values.closeTime;
    if (values.slotDurationMinutes !== court.slotDurationMinutes) {
      payload.slotDurationMinutes = values.slotDurationMinutes;
    }
    if (values.pricePerSlot !== court.pricePerSlot) {
      payload.pricePerSlot = values.pricePerSlot;
    }
    if (Object.keys(payload).length === 0) {
      router.push('/admin/courts');
      return;
    }
    update.mutate(
      { id: court.id, payload },
      { onSuccess: done, onError: applyApiErrors },
    );
  });

  const showGenericError =
    mutation.isError &&
    !(
      isApiError(mutation.error) &&
      (mutation.error.code === 'COURT_NAME_ALREADY_EXISTS' ||
        mutation.error.code === 'VALIDATION_ERROR')
    );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {showGenericError && <ErrorAlert error={mutation.error} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="court-name">Nombre</FieldLabel>
                <Input
                  id="court-name"
                  aria-invalid={Boolean(errors.name)}
                  disabled={busy}
                  {...form.register('name')}
                />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={Boolean(errors.sport)}>
                <FieldLabel htmlFor="court-sport">Deporte</FieldLabel>
                <Controller
                  control={form.control}
                  name="sport"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => v && field.onChange(v)}
                      items={SPORT_ITEMS}
                      disabled={busy}
                    >
                      <SelectTrigger id="court-sport" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SPORT_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SPORT_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.sport]} />
              </Field>

              <Field data-invalid={Boolean(errors.surface)}>
                <FieldLabel htmlFor="court-surface">
                  Superficie{' '}
                  <span className="text-muted-foreground font-normal">
                    (opcional)
                  </span>
                </FieldLabel>
                <Input
                  id="court-surface"
                  placeholder="césped sintético, cemento…"
                  aria-invalid={Boolean(errors.surface)}
                  disabled={busy}
                  {...form.register('surface')}
                />
                <FieldError errors={[errors.surface]} />
              </Field>

              <Field orientation="horizontal">
                <Controller
                  control={form.control}
                  name="isIndoor"
                  render={({ field }) => (
                    <Switch
                      id="court-indoor"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={busy}
                    />
                  )}
                />
                <FieldLabel htmlFor="court-indoor">Techada</FieldLabel>
              </Field>

              <Field data-invalid={Boolean(errors.imageUrl)}>
                <FieldLabel htmlFor="court-image">
                  Imagen (URL){' '}
                  <span className="text-muted-foreground font-normal">
                    (opcional)
                  </span>
                </FieldLabel>
                <Input
                  id="court-image"
                  type="url"
                  placeholder="https://…"
                  aria-invalid={Boolean(errors.imageUrl)}
                  disabled={busy}
                  {...form.register('imageUrl')}
                />
                <FieldError errors={[errors.imageUrl]} />
                {imageUrl && !errors.imageUrl && (
                  <CourtImage
                    sport={sport}
                    imageUrl={String(imageUrl)}
                    name="Vista previa"
                    className="mt-2 aspect-video max-w-xs rounded-md"
                    sizes="320px"
                  />
                )}
              </Field>

              <Field data-invalid={Boolean(errors.sortOrder)}>
                <FieldLabel htmlFor="court-order">Orden</FieldLabel>
                <Input
                  id="court-order"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className="w-32"
                  aria-invalid={Boolean(errors.sortOrder)}
                  disabled={busy}
                  {...form.register('sortOrder')}
                />
                <FieldDescription>
                  Menor número, más arriba en el listado.
                </FieldDescription>
                <FieldError errors={[errors.sortOrder]} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Turnos y precio</CardTitle>
          </CardHeader>
          <CardContent>
            {hasFutureBookings && court && (
              <Alert className="mb-4">
                <InfoIcon />
                <AlertDescription>
                  Esta cancha tiene {court.futureBookingsCount} reservas
                  futuras. Podés cambiar el horario o la duración; esas reservas
                  conservan su turno. No se puede desactivar la cancha hasta
                  cancelarlas.{' '}
                  <Link
                    href={`/admin/agenda?courtId=${court.id}`}
                    className="font-medium underline"
                  >
                    Ver reservas
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field data-invalid={Boolean(errors.openTime)}>
                  <FieldLabel htmlFor="court-open">Abre</FieldLabel>
                  <Input
                    id="court-open"
                    type="time"
                    step={900}
                    aria-invalid={Boolean(errors.openTime)}
                    disabled={busy}
                    {...form.register('openTime')}
                  />
                  <FieldError errors={[errors.openTime]} />
                </Field>
                <Field data-invalid={Boolean(errors.closeTime)}>
                  <FieldLabel htmlFor="court-close">Cierra</FieldLabel>
                  <Input
                    id="court-close"
                    type="time"
                    step={900}
                    aria-invalid={Boolean(errors.closeTime)}
                    disabled={busy}
                    {...form.register('closeTime')}
                  />
                  <FieldDescription>
                    {closesNextDay(String(openTime), String(closeTime))
                      ? 'Cierra al día siguiente (turnos trasnoche)'
                      : 'Para cerrar después de medianoche elegí la hora del día siguiente, por ejemplo 01:00'}
                  </FieldDescription>
                  <FieldError errors={[errors.closeTime]} />
                </Field>
              </div>

              <Field data-invalid={Boolean(errors.slotDurationMinutes)}>
                <FieldLabel htmlFor="court-duration">
                  Duración del turno
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="slotDurationMinutes"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => v && field.onChange(Number(v))}
                      items={DURATION_ITEMS}
                      disabled={busy}
                    >
                      <SelectTrigger id="court-duration" className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SLOT_DURATION_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  {slots.count > 0 && slots.last ? (
                    <>
                      <span className="text-foreground font-medium">
                        {slots.count} turnos por día
                      </span>{' '}
                      · último turno {slots.last.start} – {slots.last.end}
                    </>
                  ) : (
                    'No entra ningún turno completo en ese horario'
                  )}
                </FieldDescription>
                <FieldError errors={[errors.slotDurationMinutes]} />
              </Field>

              <Field data-invalid={Boolean(errors.pricePerSlot)}>
                <FieldLabel htmlFor="court-price">Precio por turno</FieldLabel>
                <div className="relative w-48">
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
                    $
                  </span>
                  <Input
                    id="court-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className="pl-6"
                    aria-invalid={Boolean(errors.pricePerSlot)}
                    disabled={busy}
                    {...form.register('pricePerSlot')}
                  />
                </div>
                <FieldError errors={[errors.pricePerSlot]} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href="/admin/courts" variant="outline">
          Cancelar
        </ButtonLink>
        <Button type="submit" disabled={busy || (isEdit && !isDirty)}>
          {busy && <Loader2Icon className="animate-spin" />}
          {isEdit ? 'Guardar cambios' : 'Crear cancha'}
        </Button>
      </div>
    </form>
  );
}
