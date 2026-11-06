'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { InfoIcon, Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { useLogin } from '../hooks';
import { loginSchema, type LoginValues } from '../schemas';
import { PasswordInput } from './PasswordInput';

interface Props {
  /** `?next=` de la URL: ruta a la que volver tras autenticarse. */
  next?: string;
  /** Llegó por un 401: se avisa que la sesión expiró. */
  expired?: boolean;
}

export function LoginForm({ next, expired }: Props) {
  const login = useLogin(next);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors } = form.formState;
  const busy = login.isPending || login.isSuccess;

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {expired && !login.isError && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Tu sesión expiró. Volvé a ingresar.
          </AlertDescription>
        </Alert>
      )}
      {/* Credenciales inválidas o error de red: un solo Alert, sin marcar campo. */}
      {login.isError && <ErrorAlert error={login.error} />}

      <FieldGroup>
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

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            disabled={busy}
            {...form.register('password')}
          />
          <FieldError errors={[errors.password]} />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <Loader2Icon className="animate-spin" />}
        Ingresar
      </Button>
    </form>
  );
}
