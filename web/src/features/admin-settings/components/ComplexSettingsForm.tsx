'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useForm, type Path } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
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
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import type { Complex } from '@/types';
import type { UpdateComplexPayload } from '../api';
import { applyApiFieldErrors, isValidationError } from '../form-errors';
import { useUpdateComplex } from '../hooks';
import { type ComplexSettingsValues, complexSettingsSchema } from '../schemas';

const FIELD_NAMES: ReadonlySet<string> = new Set(['name', 'address']);

/** Name and address of the complex. The page mounts it with a value-based `key` (no `form.reset()`). */
export function ComplexSettingsForm({ complex }: { complex: Complex }) {
  const update = useUpdateComplex();
  const form = useForm<ComplexSettingsValues>({
    resolver: zodResolver(complexSettingsSchema),
    defaultValues: { name: complex.name, address: complex.address },
  });
  const { errors, isDirty } = form.formState;
  const busy = update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const payload: UpdateComplexPayload = {};
    if (values.name !== complex.name) payload.name = values.name;
    if (values.address !== complex.address) payload.address = values.address;
    if (Object.keys(payload).length === 0) return;

    update.mutate(payload, {
      onSuccess: () => toast.success('Datos del complejo guardados'),
      onError: (error) =>
        applyApiFieldErrors(error, FIELD_NAMES, (name, fieldError) =>
          form.setError(name as Path<ComplexSettingsValues>, fieldError),
        ),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Datos del complejo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {update.isError && !isValidationError(update.error) && (
            <ErrorAlert error={update.error} />
          )}
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="complex-name">Nombre</FieldLabel>
              <Input
                id="complex-name"
                aria-invalid={Boolean(errors.name)}
                disabled={busy}
                {...form.register('name')}
              />
              <FieldDescription>
                Aparece en el panel y en la página de pago.
              </FieldDescription>
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={Boolean(errors.address)}>
              <FieldLabel htmlFor="complex-address">Dirección</FieldLabel>
              <Input
                id="complex-address"
                aria-invalid={Boolean(errors.address)}
                disabled={busy}
                {...form.register('address')}
              />
              <FieldError errors={[errors.address]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={busy || !isDirty}>
            {busy && <Loader2Icon className="animate-spin" />}
            Guardar cambios
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
