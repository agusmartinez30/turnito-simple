'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2Icon,
  PhoneIcon,
  UserCheckIcon,
  UserPlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/hooks/use-debounced';
import { errorMessage, isApiError } from '@/lib/api/errors';
import type { AdminCustomer } from '@/types/admin';
import {
  listCustomers,
  type CreateCustomerPayload,
} from '@/features/admin-customers/api';
import { useCreateCustomer } from '@/features/admin-customers/hooks';
import {
  customerSchema,
  type CustomerFormInput,
  type CustomerFormValues,
} from '@/features/admin-customers/schemas';
import { useSearchCustomers } from '../hooks';

const DEBOUNCE_MS = 300;

interface Props {
  selected: AdminCustomer | null;
  onSelect: (customer: AdminCustomer | null) => void;
  disabled?: boolean;
}

function splitTerm(term: string): {
  firstName: string;
  lastName: string;
  phone: string;
} {
  const trimmed = term.trim();
  if (/^\+?\d{6,}$/.test(trimmed)) {
    return { firstName: '', lastName: '', phone: trimmed };
  }
  const [first = '', ...rest] = trimmed.split(/\s+/);
  return {
    firstName: first,
    lastName: rest.join(' '),
    phone: '',
  };
}

/** Buscador de clientes del complejo, con alta inline (docs/18-admin-customers.md). */
export function CustomerPicker({ selected, onSelect, disabled }: Props) {
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [conflict, setConflict] = useState<AdminCustomer | null>(null);
  const debounced = useDebounced(term, DEBOUNCE_MS);
  const search = useSearchCustomers(debounced);
  const create = useCreateCustomer();

  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: splitTerm(term),
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <div className="flex min-w-0 items-center gap-3">
          <UserCheckIcon className="text-primary size-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium">{selected.name}</p>
            <p className="text-muted-foreground truncate">
              {selected.phone ? (
                <>
                  <PhoneIcon className="mr-1 inline size-3.5" />
                  {selected.phone}
                </>
              ) : (
                'Sin teléfono'
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(null)}
          disabled={disabled}
        >
          Cambiar
        </Button>
      </div>
    );
  }

  const tooShort = debounced.trim().length < 2;
  const createLabel = `+ Crear cliente "${term.trim()}"`;

  const startCreate = () => {
    const defaults = splitTerm(term);
    form.reset(defaults);
    setConflict(null);
    setCreating(true);
  };

  const onSubmit = form.handleSubmit((values) => {
    const payload: CreateCustomerPayload = {
      firstName: values.firstName,
      ...(values.lastName ? { lastName: values.lastName } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
    };
    create.mutate(payload, {
      onSuccess: (customer) => {
        toast.success('Cliente creado');
        onSelect(customer);
      },
      onError: async (error) => {
        if (
          isApiError(error) &&
          error.code === 'CUSTOMER_PHONE_ALREADY_EXISTS' &&
          values.phone
        ) {
          const results = await listCustomers({
            q: values.phone,
            status: 'all',
            limit: 10,
          });
          const match = results.find((c) => c.phone === values.phone);
          if (match) {
            setConflict(match);
            form.setError('phone', { message: errorMessage(error) });
            return;
          }
        }
        toast.error(errorMessage(error));
      },
    });
  });

  if (creating) {
    // No es un <form>: el picker vive dentro de otros forms (reserva, inscripción) y un form
    // anidado hace un submit nativo que navega. Enter crea el cliente sin enviar el de afuera.
    return (
      <div
        role="group"
        aria-label="Nuevo cliente"
        className="flex flex-col gap-3 rounded-lg border p-3"
        onKeyDown={(event) => {
          if (
            event.key !== 'Enter' ||
            event.target instanceof HTMLTextAreaElement
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          void onSubmit();
        }}
      >
        <p className="text-sm font-medium">Nuevo cliente</p>
        {conflict && (
          <div className="rounded-md border p-3 text-sm">
            <p className="text-muted-foreground">
              Ya existe un cliente con ese teléfono:
            </p>
            <p className="font-medium">{conflict.name}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => onSelect(conflict)}
            >
              Usar este cliente
            </Button>
          </div>
        )}
        <FieldGroup>
          <Field data-invalid={Boolean(form.formState.errors.firstName)}>
            <FieldLabel htmlFor="pick-customer-first-name">Nombre</FieldLabel>
            <Input
              id="pick-customer-first-name"
              autoComplete="off"
              disabled={create.isPending || disabled}
              {...form.register('firstName')}
            />
            <FieldError errors={[form.formState.errors.firstName]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.lastName)}>
            <FieldLabel htmlFor="pick-customer-last-name">Apellido</FieldLabel>
            <Input
              id="pick-customer-last-name"
              autoComplete="off"
              disabled={create.isPending || disabled}
              {...form.register('lastName')}
            />
            <FieldError errors={[form.formState.errors.lastName]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.phone)}>
            <FieldLabel htmlFor="pick-customer-phone">Teléfono</FieldLabel>
            <Input
              id="pick-customer-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              disabled={create.isPending || disabled}
              {...form.register('phone')}
            />
            <FieldError errors={[form.formState.errors.phone]} />
          </Field>
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCreating(false)}
            disabled={create.isPending || disabled}
          >
            Volver
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={create.isPending || disabled}
            onClick={() => void onSubmit()}
          >
            {create.isPending && <Loader2Icon className="animate-spin" />}
            Crear
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Command
      shouldFilter={false}
      label="Buscar cliente"
      className="rounded-lg border"
    >
      <CommandInput
        placeholder="Nombre, apellido o teléfono"
        value={term}
        onValueChange={setTerm}
        disabled={disabled}
      />
      <CommandList>
        {tooShort ? (
          <div className="text-muted-foreground px-3 py-4 text-center text-sm">
            Escribí al menos 2 caracteres
          </div>
        ) : search.isPending ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 px-3 py-4 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Buscando…
          </div>
        ) : search.isError ? (
          <div className="text-destructive px-3 py-4 text-center text-sm">
            {errorMessage(search.error)}
          </div>
        ) : (
          <>
            <CommandEmpty>No encontramos clientes con ese dato.</CommandEmpty>
            <CommandGroup>
              {search.data.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => onSelect(customer)}
                  className="flex-col items-start gap-0"
                >
                  <span className="font-medium">{customer.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {customer.phone ?? 'Sin teléfono'}
                  </span>
                </CommandItem>
              ))}
              {term.trim().length >= 2 && (
                <CommandItem
                  value={createLabel}
                  onSelect={startCreate}
                  className="text-primary font-medium"
                >
                  <UserPlusIcon className="mr-2 size-4" />
                  {createLabel}
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
