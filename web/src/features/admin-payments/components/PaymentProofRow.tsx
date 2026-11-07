'use client';

import { FileSearchIcon, Loader2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatPrice } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { PaymentProof, PaymentProofStatus } from '@/types/admin';
import { PaymentEntryIcon } from './PaymentEntryIcon';

const STATUS_LABELS: Record<PaymentProofStatus, string> = {
  PENDING: 'Por revisar',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

const STATUS_VARIANTS: Record<
  PaymentProofStatus,
  'warning' | 'success' | 'danger'
> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

interface Props {
  proof: PaymentProof;
  timezone: string;
  canReview: boolean;
  opening: boolean;
  onOpen: () => void;
  onReview: (kind: 'approve' | 'reject') => void;
}

/** Fila de un comprobante subido desde el link público de pago (docs/23-public-payment-link.md). */
export function PaymentProofRow({
  proof,
  timezone,
  canReview,
  opening,
  onOpen,
  onReview,
}: Props) {
  const pending = proof.status === 'PENDING';
  const players =
    proof.playersCount === null
      ? null
      : proof.playersCount === 1
        ? '1 jugador'
        : `${proof.playersCount} jugadores`;

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3',
        pending && 'bg-warning-subtle/40 border-l-warning border-l-2',
      )}
    >
      <PaymentEntryIcon kind="proof" tone={pending ? 'warning' : 'danger'} />
      <div className="flex min-w-48 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{proof.payerName}</span>
          <Badge variant={STATUS_VARIANTS[proof.status]}>
            {STATUS_LABELS[proof.status]}
          </Badge>
        </div>
        <span className="text-muted-foreground text-xs">
          Comprobante · {formatDateTime(proof.createdAt, timezone)}
          {players && ` · ${players}`}
        </span>
        {proof.status === 'REJECTED' && proof.rejectReason && (
          <p className="text-muted-foreground text-xs">
            Motivo: {proof.rejectReason}
          </p>
        )}
      </div>
      {proof.declaredAmount > 0 && (
        <div className="flex shrink-0 flex-col items-end">
          <span className="font-semibold tabular-nums">
            {formatPrice(proof.declaredAmount)}
          </span>
          <span className="text-muted-foreground text-xs">declarado</span>
        </div>
      )}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={opening}
          onClick={onOpen}
        >
          {opening ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <FileSearchIcon />
          )}
          Ver comprobante
        </Button>
        {pending && canReview && (
          <>
            <Button type="button" size="sm" onClick={() => onReview('approve')}>
              Aprobar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onReview('reject')}
            >
              Rechazar
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
