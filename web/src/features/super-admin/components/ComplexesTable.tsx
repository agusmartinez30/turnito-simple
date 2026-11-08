'use client';

import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SuperAdminComplex } from '@/types/admin';
import { SuspensionDialog } from './SuspensionDialog';

/** Ratios arrive as `null` when the month has no bookings. */
function formatRatio(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

export function ComplexesTable({
  complexes,
}: {
  complexes: SuperAdminComplex[];
}) {
  const [target, setTarget] = useState<SuperAdminComplex | null>(null);

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complejo</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Reservas</TableHead>
              <TableHead className="text-right">Comprobantes</TableHead>
              <TableHead className="text-right">Aprobados</TableHead>
              <TableHead className="text-right">Comp. / reserva</TableHead>
              <TableHead className="text-right">Aprob. / reserva</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {complexes.map((c) => {
              const suspended = c.suspendedAt !== null;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/admin/complexes/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {c.slug}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {format(parseISO(c.createdAt), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={suspended ? 'warning' : 'success'}>
                      {suspended ? 'Suspendido' : 'Activo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.bookingsCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.proofsCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.approvedProofsCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRatio(c.proofsPerBooking)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRatio(c.approvedProofsPerBooking)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={suspended ? 'outline' : 'ghost'}
                      size="sm"
                      onClick={() => setTarget(c)}
                    >
                      {suspended ? 'Activar' : 'Suspender'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <SuspensionDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
