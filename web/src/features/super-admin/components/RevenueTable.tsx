import { format, parseISO } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatPrice } from '@/lib/date';
import type { SuperAdminRevenueBooking } from '@/types/admin';

export function RevenueTable({
  bookings,
}: {
  bookings: SuperAdminRevenueBooking[];
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Turno</TableHead>
            <TableHead>Cancha</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Comprobantes</TableHead>
            <TableHead className="text-right">Efectivo</TableHead>
            <TableHead className="text-right">Cobrado</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="tabular-nums">
                {format(parseISO(b.startsAt), 'dd/MM/yyyy HH:mm')}
              </TableCell>
              <TableCell>{b.courtName}</TableCell>
              <TableCell>{b.customerName ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(b.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(b.transferAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(b.cashAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(b.paidTotal)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPrice(b.balance)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
