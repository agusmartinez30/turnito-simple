'use client';

import { Fragment, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeftIcon, CheckIcon, Loader2Icon } from 'lucide-react';
import { Controller, useForm, type Path } from 'react-hook-form';
import { Button } from '@/components/ui/button';
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
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { useRegister } from '../hooks';
import { registerSchema, type RegisterValues } from '../schemas';
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_ITEMS,
  TIMEZONE_OPTIONS,
} from '../timezones';
import { PasswordInput } from './PasswordInput';

const FIELD_NAMES: ReadonlySet<string> = new Set<Path<RegisterValues>>([
  'complexName',
  'complexAddress',
  'timezone',
  'name',
  'email',
  'phone',
  'password',
]);

const ACCOUNT_FIELDS: Path<RegisterValues>[] = [
  'name',
  'email',
  'phone',
  'password',
  'confirmPassword',
];

const STEPS = ['Tu cuenta', 'Tu complejo'] as const;

interface Props {
  /** `?next=` de la URL: ruta a la que ir tras crear el complejo. */
  next?: string;
}

/** Alta de complejo + primer administrador, en dos pasos (docs/16-multi-complex.md). */
export function RegisterForm({ next }: Props) {
  const register = useRegister(next);
  const [step, setStep] = useState<0 | 1>(0);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      complexName: '',
      complexAddress: '',
      timezone: DEFAULT_TIMEZONE,
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { errors } = form.formState;
  const busy = register.isPending || register.isSuccess;

  const submit = form.handleSubmit((values) => {
    register.mutate(
      {
        complexName: values.complexName,
        complexAddress: values.complexAddress,
        timezone: values.timezone,
        name: values.name,
        email: values.email,
        password: values.password,
        ...(values.phone ? { phone: values.phone } : {}),
      },
      {
        onError: (error) => {
          if (!isApiError(error)) return;
          if (error.code === 'EMAIL_ALREADY_EXISTS') {
            form.setError('email', {
              message: 'Ya existe una cuenta con este email',
            });
            setStep(0);
            return;
          }
          if (error.code === 'VALIDATION_ERROR' && error.details) {
            // Errores por campo de la API → RHF. Campos desconocidos se ignoran.
            let targetStep: 0 | 1 | null = null;
            for (const [field, messages] of Object.entries(error.details)) {
              if (!FIELD_NAMES.has(field)) continue;
              form.setError(field as Path<RegisterValues>, {
                message: messages[0],
              });
              if (targetStep === null) {
                targetStep = ACCOUNT_FIELDS.includes(
                  field as Path<RegisterValues>,
                )
                  ? 0
                  : 1;
              }
            }
            if (targetStep !== null) setStep(targetStep);
          }
        },
      },
    );
  });

  // El Enter en el paso 1 solo avanza; recién en el paso 2 valida y envía todo.
  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 0) {
      const valid = await form.trigger(ACCOUNT_FIELDS);
      if (valid) setStep(1);
      return;
    }
    await submit(event);
  };

  // Los errores mapeados a campos no se repiten arriba del form.
  const showGenericError =
    register.isError &&
    !(
      isApiError(register.error) &&
      (register.error.code === 'EMAIL_ALREADY_EXISTS' ||
        register.error.code === 'VALIDATION_ERROR')
    );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {showGenericError && <ErrorAlert error={register.error} />}

      <Steps current={step} />

      {step === 0 ? (
        <FieldGroup>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="name">Nombre</FieldLabel>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              disabled={busy}
              {...form.register('name')}
            />
            <FieldError errors={[errors.name]} />
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              disabled={busy}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="phone">
              Teléfono{' '}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </FieldLabel>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
              disabled={busy}
              {...form.register('phone')}
            />
            <FieldError errors={[errors.phone]} />
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              disabled={busy}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="confirmPassword">
              Repetir contraseña
            </FieldLabel>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              disabled={busy}
              {...form.register('confirmPassword')}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
        </FieldGroup>
      ) : (
        <FieldGroup>
          <Field data-invalid={Boolean(errors.complexName)}>
            <FieldLabel htmlFor="complexName">Nombre del complejo</FieldLabel>
            <Input
              id="complexName"
              autoComplete="organization"
              placeholder="Club Río"
              aria-invalid={Boolean(errors.complexName)}
              disabled={busy}
              {...form.register('complexName')}
            />
            <FieldDescription>
              Así lo van a ver tus clientes en el link para reservar
            </FieldDescription>
            <FieldError errors={[errors.complexName]} />
          </Field>

          <Field data-invalid={Boolean(errors.complexAddress)}>
            <FieldLabel htmlFor="complexAddress">Dirección</FieldLabel>
            <Input
              id="complexAddress"
              autoComplete="street-address"
              aria-invalid={Boolean(errors.complexAddress)}
              disabled={busy}
              {...form.register('complexAddress')}
            />
            <FieldError errors={[errors.complexAddress]} />
          </Field>

          <Field data-invalid={Boolean(errors.timezone)}>
            <FieldLabel htmlFor="timezone">Zona horaria</FieldLabel>
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(v)}
                  items={TIMEZONE_ITEMS}
                  disabled={busy}
                >
                  <SelectTrigger id="timezone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription>
              Define los horarios de las canchas. No se puede cambiar después.
            </FieldDescription>
            <FieldError errors={[errors.timezone]} />
          </Field>
        </FieldGroup>
      )}

      {step === 0 ? (
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          Continuar
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setStep(0)}
            disabled={busy}
          >
            <ArrowLeftIcon />
            Volver
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />}
            Crear complejo
          </Button>
        </div>
      )}
    </form>
  );
}

/** Indicador de progreso: dos pasos, con el actual resaltado y el anterior marcado como listo. */
function Steps({ current }: { current: 0 | 1 }) {
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={label}>
            <li
              aria-current={active ? 'step' : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                  done && 'bg-highlight text-highlight-foreground',
                  active && 'bg-primary text-primary-foreground',
                  !done &&
                    !active &&
                    'bg-background text-muted-foreground ring-border ring-1',
                )}
              >
                {done ? (
                  <CheckIcon className="size-4" strokeWidth={2.5} />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
            {i < STEPS.length - 1 && (
              <li
                aria-hidden
                className={cn(
                  'h-px flex-1',
                  current > i ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
