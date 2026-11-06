'use client';

import { BanIcon, FileSearchIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatPrice } from '@/lib/date';
import { PAYMENT_METHOD_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { AdminBooking, Payment, PaymentProof } from '@/types/admin';
import { useOpenPaymentProofFile, usePaymentProofs } from '../hooks';
import { PaymentEntryIcon } from './PaymentEntryIcon';
import {
  PaymentProofReviewDialog,
  type ProofReview,
} from './PaymentProofReviewDialog';
import { PaymentProofRow } from './PaymentProofRow';
import { PaymentStatusBadge } from './PaymentStatusBadge';

type Entry =
  | { kind: 'payment'; payment: Payment; at: string }
  | { kind: 'proof'; proof: PaymentProof; at: string };

interface Props {
  booking: AdminBooking;
  timezone: string;
  onRegister: () => void;
  onVoid: (payment: Payment) => void;
}

/** Lo que pide acción (comprobante pendiente) va primero; el resto, por fecha. */
function rank(entry: Entry): number {
  return entry.kind === 'proof' && entry.proof.status === 'PENDING' ? 0 : 1;
}

/** Card "Pagos" del detalle de una reserva (docs/12-admin-payments.md › PaymentsCard). */
export function PaymentsCard({ booking, timezone, onRegister, onVoid }: Props) {
  const { payment, price } = booking;
  const credit = payment.balance < 0;
  const payable = booking.status !== 'CANCELLED';
  const proofs = usePaymentProofs(booking.id);
  const { open, openingId } = useOpenPaymentProofFile();
  const [review, setReview] = useState<ProofReview | null>(null);

  // Un comprobante aprobado ya es un pago registrado: solo se listan los pendientes y rechazados.
  const entries: Entry[] = [
    ...(booking.payments ?? []).map((p): Entry => ({
      kind: 'payment',
      payment: p,
      at: p.createdAt,
    })),
    ...(proofs.data ?? [])
      .filter((p) => p.status !== 'APPROVED')
      .map((p): Entry => ({ kind: 'proof', proof: p, at: p.createdAt })),
  ].sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at));
  const toReview = entries.filter(
    (e) => e.kind === 'proof' && e.proof.status === 'PENDING',
  ).length;
  const progress =
    price > 0
      ? Math.min(100, Math.round((payment.paidAmount / price) * 100))
      : 0;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Pagos
          <PaymentStatusBadge payment={payment} price={price} />
          {toReview > 0 && (
            <Badge variant="warning">
              {toReview === 1
                ? '1 comprobante por revisar'
                : `${toReview} comprobantes por revisar`}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <Total label="Total" value={formatPrice(price)} />
            <Total label="Pagado" value={formatPrice(payment.paidAmount)} />
            <Total
              label={credit ? 'Saldo a favor' : 'Saldo'}
              value={formatPrice(Math.abs(payment.balance))}
              className={cn(
                payment.balance <= 0 && 'text-success-subtle-foreground',
              )}
            />
          </dl>
          {price > 0 && (
            <div
              role="progressbar"
              aria-label="Porcentaje cobrado"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="bg-muted h-1.5 overflow-hidden rounded-full"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] motion-reduce:transition-none',
                  progress >= 100 ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {proofs.isError && (
          <ErrorAlert error={proofs.error} onRetry={() => proofs.refetch()} />
        )}
        {entries.length === 0 ? (
          proofs.isPending ? (
            <Skeleton className="h-16" />
          ) : (
            <p className="text-muted-foreground text-sm">
              Todavía no se registraron pagos ni comprobantes.
            </p>
          )
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border text-sm">
            {entries.map((entry) => {
              if (entry.kind === 'proof') {
                return (
                  <PaymentProofRow
                    key={`proof-${entry.proof.id}`}
                    proof={entry.proof}
                    timezone={timezone}
                    canReview={payable}
                    opening={openingId === entry.proof.id}
                    onOpen={() => open(booking.id, entry.proof.id)}
                    onReview={(kind) => setReview({ kind, proof: entry.proof })}
                  />
                );
              }
              const p = entry.payment;
              return (
                <li key={p.id} className="flex gap-3 px-3 py-3">
                  <PaymentEntryIcon
                    kind={p.method}
                    className={cn(p.voidedAt && 'opacity-50')}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'font-medium',
                              p.voidedAt && 'text-muted-foreground',
                            )}
                          >
                            {PAYMENT_METHOD_LABELS[p.method]}
                          </span>
                          {p.voidedAt && (
                            <Badge variant="outline">Anulado</Badge>
                          )}
                          {p.payerName && (
                            <span className="truncate">{p.payerName}</span>
                          )}
                          {p.note && (
                            <span className="text-muted-foreground truncate">
                              {p.note}
                            </span>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {formatDateTime(p.createdAt, timezone)} · por{' '}
                          {p.registeredBy.name}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 font-semibold tabular-nums',
                          p.voidedAt && 'text-muted-foreground line-through',
                        )}
                      >
                        {formatPrice(p.amount)}
                      </span>
                    </div>
                    {p.proofId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        disabled={openingId === p.proofId}
                        onClick={() => open(booking.id, p.proofId!)}
                      >
                        {openingId === p.proofId ? (
                          <Loader2Icon className="animate-spin" />
                        ) : (
                          <FileSearchIcon />
                        )}
                        Ver comprobante
                      </Button>
                    )}
                    {p.voidedAt ? (
                      <span className="text-muted-foreground text-xs">
                        Anulado{p.voidedBy && ` por ${p.voidedBy.name}`} el{' '}
                        {formatDateTime(p.voidedAt, timezone)}
                        {p.voidReason && ` · ${p.voidReason}`}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground -ml-2 w-fit"
                        onClick={() => onVoid(p)}
                      >
                        <BanIcon data-icon="inline-start" />
                        Anular
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {payable && (
          <Button className="w-fit" onClick={onRegister}>
            <PlusIcon data-icon="inline-start" />
            Registrar pago
          </Button>
        )}
      </CardContent>
      <PaymentProofReviewDialog
        bookingId={booking.id}
        review={review}
        pendingAmount={Math.max(payment.balance, 0)}
        onClose={() => setReview(null)}
      />
    </Card>
  );
}

function Total({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn('text-base font-semibold tabular-nums', className)}>
        {value}
      </dd>
    </div>
  );
}
