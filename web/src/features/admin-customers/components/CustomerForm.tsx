'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useForm, type Path } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { isApiError } from '@/lib/api/errors';
import type { AdminCustomer } from '@/types/admin';
import { type CreateCustomerPayload, type UpdateCustomerPayload } from '../api';
import { useCreateCustomer, useUpdateCustomer } from '../hooks';
import {
  customerSchema,
  type CustomerFormInput,
  type CustomerFormValues,
} from '../schemas';

interface Props {
  customer?: AdminCustomer;
  onCancel: () => void;
  onSaved?: (customer: AdminCustomer) => void;
}

function toValues(customer?: AdminCustomer): CustomerFormInput {
  return {
    firstName: customer?.firstName ?? '',
    lastName: customer?.lastName ?? '',
    phone: customer?.phone ?? '',
    note: customer?.note ?? '',
  };
}

const FIELD_NAMES: ReadonlySet<string> = new Set<Path<CustomerFormInput>>([
  'firstName',
  'lastName',
  'phone',
  'note',
]);

/** Alta y edición de cliente (docs/18-admin-customers.md). */
export function CustomerForm({ customer, onCancel, onSaved }: Props) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isEdit = Boolean(customer);

  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: toValues(customer),
  });
  const { errors, isDirty } = form.formState;
  const mutation = isEdit ? update : create;
  const busy = mutation.isPending;

  const applyApiErrors = (error: unknown) => {
    if (!isApiError(error)) return;
    if (error.code === 'CUSTOMER_PHONE_ALREADY_EXISTS') {
      form.setError('phone', { message: error.message });
      return;
    }
    if (error.code === 'VALIDATION_ERROR' && error.details) {
      for (const [field, messages] of Object.entries(error.details)) {
        if (FIELD_NAMES.has(field)) {
          form.setError(field as Path<CustomerFormInput>, {
            message: messages[0],
          });
        }
      }
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!customer) {
      const payload: CreateCustomerPayload = {
        firstName: values.firstName,
        ...(values.lastName ? { lastName: values.lastName } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.note ? { note: values.note } : {}),
      };
      create.mutate(payload, {
        onSuccess: (saved) => {
          toast.success('Cliente creado');
          onSaved?.(saved);
        },
        onError: applyApiErrors,
      });
      return;
    }

    const payload: UpdateCustomerPayload = {};
    if (values.firstName !== customer.firstName) {
      payload.firstName = values.firstName;
    }
    if ((values.lastName || null) !== (customer.lastName ?? null)) {
      payload.lastName = values.lastName || null;
    }
    if ((values.phone || null) !== (customer.phone ?? null)) {
      payload.phone = values.phone || null;
    }
    if ((values.note || null) !== (customer.note ?? null)) {
      payload.note = values.note || null;
    }
    if (Object.keys(payload).length === 0) {
      onCancel();
      return;
    }
    update.mutate(
      { id: customer.id, payload },
      {
        onSuccess: (saved) => {
          toast.success('Cambios guardados');
          onSaved?.(saved);
        },
        onError: applyApiErrors,
      },
    );
  });

  const showGenericError =
    mutation.isError &&
    !(
      isApiError(mutation.error) &&
      (mutation.error.code === 'CUSTOMER_PHONE_ALREADY_EXISTS' ||
        mutation.error.code === 'VALIDATION_ERROR')
    );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {showGenericError && <ErrorAlert error={mutation.error} />}

      <FieldGroup>
        <Field data-invalid={Boolean(errors.firstName)}>
          <FieldLabel htmlFor="customer-first-name">Nombre</FieldLabel>
          <Input
            id="customer-first-name"
            autoComplete="off"
            aria-invalid={Boolean(errors.firstName)}
            disabled={busy}
            {...form.register('firstName')}
          />
          <FieldError errors={[errors.firstName]} />
        </Field>

        <Field data-invalid={Boolean(errors.lastName)}>
          <FieldLabel htmlFor="customer-last-name">
            Apellido{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </FieldLabel>
          <Input
            id="customer-last-name"
            autoComplete="off"
            aria-invalid={Boolean(errors.lastName)}
            disabled={busy}
            {...form.register('lastName')}
          />
          <FieldDescription>
            Opcional, pero ayuda a no confundir clientes.
          </FieldDescription>
          <FieldError errors={[errors.lastName]} />
        </Field>

        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="customer-phone">
            Teléfono{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </FieldLabel>
          <Input
            id="customer-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            aria-invalid={Boolean(errors.phone)}
            disabled={busy}
            {...form.register('phone')}
          />
          <FieldDescription>
            Es lo que identifica al cliente. Sin teléfono no le podemos mandar
            WhatsApp.
          </FieldDescription>
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field data-invalid={Boolean(errors.note)}>
          <FieldLabel htmlFor="customer-note">
            Nota{' '}
            <span className="text-muted-foreground font-normal">
              (opcional)
            </span>
          </FieldLabel>
          <Textarea
            id="customer-note"
            rows={3}
            maxLength={280}
            aria-invalid={Boolean(errors.note)}
            disabled={busy}
            {...form.register('note')}
          />
          <FieldDescription>
            Interna del complejo; el cliente nunca la ve.
          </FieldDescription>
          <FieldError errors={[errors.note]} />
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={busy}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || (isEdit && !isDirty)}>
          {busy && <Loader2Icon className="animate-spin" />}
          {isEdit ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>
    </form>
  );
}
