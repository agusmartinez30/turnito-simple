import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/date';
import { PAYMENT_STATUS_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { PaymentStatus, PaymentSummary } from '@/types/admin';

/** Variante de Badge por estado de pago; el sin pagar queda sobrio, no alarmista. */
const BADGE_VARIANT = {
  UNPAID: 'outline',
  PARTIAL: 'warning',
  PAID: 'success',
} as const satisfies Record<PaymentStatus, string>;

const DOT_CLASS: Record<PaymentStatus, string> = {
  UNPAID: 'bg-destructive',
  PARTIAL: 'bg-warning',
  PAID: 'bg-success',
};

interface Props {
  payment: PaymentSummary;
  price: number;
  /** Solo un punto de color con `aria-label` (celda de la agenda). */
  compact?: boolean;
  className?: string;
}

/** Estado de pago de una reserva (docs/12-admin-payments.md › PaymentStatusBadge). */
export function PaymentStatusBadge({
  payment,
  price,
  compact,
  className,
}: Props) {
  const title = `Pagado ${formatPrice(payment.paidAmount)} de ${formatPrice(price)}`;
  const label = PAYMENT_STATUS_LABELS[payment.status];

  if (compact) {
    return (
      <span
        role="img"
        aria-label={`${label} · ${title}`}
        title={title}
        className={cn(
          'inline-block size-2 shrink-0 rounded-full',
          DOT_CLASS[payment.status],
          className,
        )}
      />
    );
  }

  return (
    <Badge
      variant={BADGE_VARIANT[payment.status]}
      title={title}
      className={cn(
        payment.status === 'UNPAID' && 'text-destructive-subtle-foreground',
        className,
      )}
    >
      {label}
    </Badge>
  );
}
