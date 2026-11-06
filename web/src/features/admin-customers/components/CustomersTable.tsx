'use client';

import { PhoneIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/layout/ButtonLink';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/date';
import type { AdminCustomer } from '@/types/admin';

interface Props {
  customers: AdminCustomer[];
  timezone: string;
}

function SourceLabel({ source }: { source: AdminCustomer['source'] }) {
  return (
    <Badge variant={source === 'PUBLIC' ? 'default' : 'secondary'}>
      {source === 'PUBLIC' ? 'App' : 'Panel'}
    </Badge>
  );
}

/** Tabla (md+) o cards (mobile) del listado de clientes (docs/18-admin-customers.md). */
export function CustomersTable({ customers, timezone }: Props) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="text-right">Turnos</TableHead>
              <TableHead>Último turno</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <div className="flex items-center gap-2 font-medium">
                    {customer.name}
                    {!customer.isActive && (
                      <Badge variant="secondary">Archivado</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-primary flex items-center gap-1.5 hover:underline"
                    >
                      <PhoneIcon className="size-3.5" />
                      {customer.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {customer.bookingsCount}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {customer.lastBookingAt
                    ? formatDateTime(customer.lastBookingAt, timezone)
                    : '—'}
                </TableCell>
                <TableCell>
                  <SourceLabel source={customer.source} />
                </TableCell>
                <TableCell>
                  <ButtonLink
                    href={`/admin/customers/${customer.id}`}
                    variant="outline"
                    size="xs"
                  >
                    Ver ficha
                  </ButtonLink>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {customers.map((customer) => (
          <li
            key={customer.id}
            className="bg-card flex flex-col gap-3 rounded-lg border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {customer.name}
                  {!customer.isActive && (
                    <Badge variant="secondary">Archivado</Badge>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  {customer.phone ?? 'Sin teléfono'}
                </p>
              </div>
              <SourceLabel source={customer.source} />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {customer.bookingsCount} turnos · Último{' '}
                {customer.lastBookingAt
                  ? formatDateTime(customer.lastBookingAt, timezone)
                  : '—'}
              </span>
              <ButtonLink
                href={`/admin/customers/${customer.id}`}
                variant="outline"
                size="sm"
              >
                Ver ficha
              </ButtonLink>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
