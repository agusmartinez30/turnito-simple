import { CalendarIcon, ClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatBookingDate, formatPrice, formatTimeRange } from '@/lib/date';
import type { PublicPayment } from '../api';

type Booking = PublicPayment['booking'];

function statusBadge(booking: Booking) {
  if (booking.pendingProofsAmount > 0) {
    return { label: 'Comprobante en revisión', variant: 'warning' } as const;
  }
  if (booking.paidAmount > 0 && booking.pendingAmount <= 0) {
    return { label: 'Pagado', variant: 'success' } as const;
  }
  if (booking.paidAmount > 0) {
    return { label: 'Pago parcial', variant: 'secondary' } as const;
  }
  return null;
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Turn identity + money summary. The pending balance is the visual anchor. */
export function BookingSummaryCard({
  booking,
  tz,
}: {
  booking: Booking;
  tz: string;
}) {
  const badge = statusBadge(booking);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl leading-tight break-words">
            {booking.courtName}
          </CardTitle>
          {badge && (
            <Badge variant={badge.variant} className="shrink-0">
              {badge.label}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground flex flex-col gap-1 text-sm">
          <p className="flex items-center gap-2 first-letter:uppercase">
            <CalendarIcon className="size-4 shrink-0" aria-hidden />
            <span className="first-letter:uppercase">
              {formatBookingDate(booking.startsAt, tz)}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <ClockIcon className="size-4 shrink-0" aria-hidden />
            <span>{formatTimeRange(booking.startsAt, booking.endsAt, tz)}</span>
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        <dl className="flex flex-col gap-2">
          <AmountRow
            label="Total del turno"
            value={formatPrice(booking.price)}
          />
          <AmountRow
            label="Total abonado"
            value={formatPrice(booking.paidAmount)}
          />
          {booking.pendingProofsAmount > 0 && (
            <AmountRow
              label="En revisión"
              value={formatPrice(booking.pendingProofsAmount)}
            />
          )}
        </dl>
        <div className="bg-primary/5 flex items-center justify-between gap-4 rounded-xl px-4 py-3">
          <span className="text-sm font-medium">Saldo pendiente del turno</span>
          <span
            data-testid="payment-remaining"
            className="text-2xl leading-none font-bold tabular-nums"
          >
            {formatPrice(booking.remaining)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
