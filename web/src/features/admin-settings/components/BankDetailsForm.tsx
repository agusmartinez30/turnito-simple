'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useForm, type Path } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
import { bankDetailsSchema, type BankDetailsValues } from '../schemas';

type BankField = keyof BankDetailsValues;

const FIELDS: {
  name: BankField;
  label: string;
  placeholder: string;
  description?: string;
  inputMode?: 'numeric';
}[] = [
  {
    name: 'bankCbu',
    label: 'CBU / CVU',
    placeholder: '0000003100012345678901',
    description: '22 dígitos, sin espacios.',
    inputMode: 'numeric',
  },
  {
    name: 'bankAlias',
    label: 'Alias',
    placeholder: 'tucomplejo.mp',
    description: 'Entre 6 y 20 caracteres: letras, números, puntos o guiones.',
  },
  {
    name: 'bankHolderName',
    label: 'Titular de la cuenta',
    placeholder: 'Nombre y apellido o razón social',
  },
];

const FIELD_NAMES: ReadonlySet<string> = new Set(FIELDS.map((f) => f.name));

/**
 * Datos bancarios del complejo: los ve el jugador en el link de pago de su reserva para hacer la
 * transferencia. La página lo monta con `key` por valores (no se usa `form.reset()`).
 */
export function BankDetailsForm({ complex }: { complex: Complex }) {
  const update = useUpdateComplex();
  const form = useForm<BankDetailsValues>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: {
      bankCbu: complex.bankCbu ?? '',
      bankAlias: complex.bankAlias ?? '',
      bankHolderName: complex.bankHolderName ?? '',
    },
  });
  const { errors, isDirty } = form.formState;
  const busy = update.isPending;

  const onSubmit = form.handleSubmit((values) => {
    const payload: UpdateComplexPayload = {};
    for (const { name } of FIELDS) {
      if (values[name] !== (complex[name] ?? '')) {
        payload[name] = values[name] || null;
      }
    }
    if (Object.keys(payload).length === 0) return;

    update.mutate(payload, {
      onSuccess: () => toast.success('Datos bancarios guardados'),
      onError: (error) =>
        applyApiFieldErrors(error, FIELD_NAMES, (name, fieldError) =>
          form.setError(name as Path<BankDetailsValues>, fieldError),
        ),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Datos bancarios</CardTitle>
          <CardDescription>
            Los jugadores los ven en el link de pago de su reserva para
            transferirte la seña.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {update.isError && !isValidationError(update.error) && (
            <ErrorAlert error={update.error} />
          )}

          <FieldGroup>
            {FIELDS.map(
              ({ name, label, placeholder, description, inputMode }) => (
                <Field key={name} data-invalid={Boolean(errors[name])}>
                  <FieldLabel htmlFor={`complex-${name}`}>{label}</FieldLabel>
                  <Input
                    id={`complex-${name}`}
                    inputMode={inputMode}
                    placeholder={placeholder}
                    aria-invalid={Boolean(errors[name])}
                    disabled={busy}
                    {...form.register(name)}
                  />
                  {description && (
                    <FieldDescription>{description}</FieldDescription>
                  )}
                  <FieldError errors={[errors[name]]} />
                </Field>
              ),
            )}
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
