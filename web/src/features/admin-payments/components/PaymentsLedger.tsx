'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { PageHeader } from '@/components/layout/PageShell';
import { useComplex } from '@/features/complex/hooks';
import { formatPrice, isValidDateParam, todayInTz } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { Complex } from '@/types';
import type { PaymentLedgerTotals } from '@/types/admin';
import type { PaymentLedgerFilters as ApiFilters } from '../api';
import { buildLedgerEntries } from '../ledger-entries';
import { useOpenPaymentProofFile, usePaymentsLedger } from '../hooks';
import { DayNav } from './DayNav';
import {
  PaymentProofReviewDialog,
  type ProofReview,
} from './PaymentProofReviewDialog';
import {
  PaymentsLedgerFilters,
  type PaymentLedgerUrlFilters,
} from './PaymentsLedgerFilters';
import {
  PaymentsLedgerTable,
  PaymentsLedgerTableSkeleton,
} from './PaymentsLedgerTable';
import { VoidPaymentDialog, type VoidTarget } from './VoidPaymentDialog';

const LIMIT = 100;

/** Pagos y comprobantes de un día o rango en un solo listado, con totales (docs/12-admin-payments.md › PaymentsLedger). */
export function PaymentsLedger() {
  const complex = useComplex();
  if (complex.isPending) return <LedgerSkeleton />;
  if (complex.isError) {
    return (
      <ErrorAlert error={complex.error} onRetry={() => complex.refetch()} />
    );
  }
  return <PaymentsLedgerContent complex={complex.data} />;
}

function PaymentsLedgerContent({ complex }: { complex: Complex }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = todayInTz(complex.timezone);

  const filters = useMemo<PaymentLedgerUrlFilters>(() => {
    const q = params.get('q') ?? undefined;
    const date = params.get('date');
    const from = params.get('from');
    const to = params.get('to');
    const method = params.get('method');
    const range = isValidDateParam(from) && isValidDateParam(to) && from <= to;
    return {
      q: q && q.length >= 2 ? q : undefined,
      date: !range && isValidDateParam(date) ? date : undefined,
      from: range ? from : undefined,
      to: range ? to : undefined,
      method: method === 'CASH' || method === 'TRANSFER' ? method : undefined,
      voided: params.get('voided') === '1' || undefined,
    };
  }, [params]);

  const setFilters = useCallback(
    (next: PaymentLedgerUrlFilters) => {
      const sp = new URLSearchParams();
      if (next.from && next.to) {
        sp.set('from', next.from);
        sp.set('to', next.to);
      } else if (next.date && next.date !== today) {
        sp.set('date', next.date);
      }
      if (next.method) sp.set('method', next.method);
      if (next.q) sp.set('q', next.q);
      if (next.voided) sp.set('voided', '1');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, today],
  );

  const isRange = Boolean(filters.from && filters.to);
  const day = filters.date ?? today;

  const apiFilters = useMemo<ApiFilters>(() => {
    const base: ApiFilters = { limit: LIMIT };
    if (filters.from && filters.to) {
      base.from = filters.from;
      base.to = filters.to;
    } else {
      base.date = filters.date ?? today;
    }
    if (filters.method) base.method = filters.method;
    if (filters.q) base.q = filters.q;
    if (filters.voided) base.voided = true;
    return base;
  }, [filters, today]);

  const ledger = usePaymentsLedger(apiFilters);
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [proofReview, setProofReview] = useState<{
    bookingId: string;
    review: ProofReview;
  } | null>(null);
  const proofFile = useOpenPaymentProofFile();
  const entries = useMemo(
    () =>
      ledger.data
        ? buildLedgerEntries(ledger.data.payments, ledger.data.proofs)
        : [],
    [ledger.data],
  );
  const pendingProofs = ledger.data
    ? ledger.data.proofs.filter((p) => p.status === 'PENDING').length
    : 0;

  return (
    <>
      <PageHeader title="Pagos" />

      {!isRange && (
        <DayNav
          date={day}
          today={today}
          onChange={(date) =>
            setFilters({ ...filters, date, from: undefined, to: undefined })
          }
        />
      )}

      <PaymentsLedgerFilters
        filters={filters}
        today={today}
        onChange={(patch) => setFilters({ ...filters, ...patch })}
        onClear={() => setFilters({})}
      />

      {ledger.isPending ? (
        <>
          <TotalsSkeleton />
          <PaymentsLedgerTableSkeleton />
        </>
      ) : ledger.isError ? (
        <ErrorAlert error={ledger.error} onRetry={() => ledger.refetch()} />
      ) : (
        <>
          <Totals totals={ledger.data.totals} />
          {pendingProofs > 0 && (
            <p className="text-warning-subtle-foreground bg-warning-subtle rounded-lg px-3 py-2 text-sm font-medium">
              {pendingProofs === 1
                ? '1 comprobante pendiente de revisión'
                : `${pendingProofs} comprobantes pendientes de revisión`}
              . No se cuentan en los totales hasta aceptarlos.
            </p>
          )}
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
              <p className="text-muted-foreground">
                No hay pagos ni comprobantes en este período
              </p>
              {(filters.method ||
                filters.q ||
                filters.voided ||
                isRange ||
                filters.date) && (
                <Button variant="outline" onClick={() => setFilters({})}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              <PaymentsLedgerTable
                entries={entries}
                timezone={complex.timezone}
                showDate={isRange}
                onVoid={(p) =>
                  setVoidTarget({ bookingId: p.booking.id, payment: p })
                }
                onReview={(kind, proof) =>
                  setProofReview({
                    bookingId: proof.booking.id,
                    review: { kind, proof },
                  })
                }
                onOpenProof={(proof) =>
                  proofFile.open(proof.booking.id, proof.id)
                }
                openingProofId={proofFile.openingId}
              />
              {ledger.data.payments.length >= LIMIT && (
                <p className="text-muted-foreground text-sm">
                  Mostrando los primeros {LIMIT} pagos. Los totales incluyen
                  todo el período.
                </p>
              )}
            </>
          )}
        </>
      )}

      <PaymentProofReviewDialog
        bookingId={proofReview?.bookingId ?? ''}
        review={proofReview?.review ?? null}
        pendingAmount={0}
        onClose={() => setProofReview(null)}
      />

      <VoidPaymentDialog
        target={voidTarget}
        timezone={complex.timezone}
        onClose={() => setVoidTarget(null)}
        onRefetch={() => ledger.refetch()}
      />
    </>
  );
}

/** 4 cards con los números del período (mismo layout que DashboardSummary). */
function Totals({ totals }: { totals: PaymentLedgerTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <TotalCard
        label="Total cobrado"
        value={formatPrice(totals.collected)}
        emphasis
      />
      <TotalCard label="Efectivo" value={formatPrice(totals.cash)} />
      <TotalCard label="Transferencia" value={formatPrice(totals.transfer)} />
      <TotalCard
        label="Pagos"
        value={totals.count}
        hint="sin contar anulados"
      />
    </div>
  );
}

function TotalCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: number | string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-1 px-4 py-4">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </span>
        <span
          className={cn(
            'text-2xl font-semibold tabular-nums',
            emphasis && 'text-success-subtle-foreground',
          )}
        >
          {value}
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  );
}

function TotalsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function LedgerSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-9 w-72" />
      <TotalsSkeleton />
      <PaymentsLedgerTableSkeleton />
    </div>
  );
}
