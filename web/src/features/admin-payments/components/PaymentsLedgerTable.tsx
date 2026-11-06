'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { FileTextIcon, Loader2Icon, MoreHorizontalIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDateTime,
  formatPrice,
  formatShortDate,
  formatTimeRange,
} from '@/lib/date';
import { PAYMENT_METHOD_LABELS, customerDisplayName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type {
  LedgerBooking,
  PaymentLedgerRow,
  PaymentProofLedgerRow,
} from '@/types/admin';
import type { LedgerEntry } from '../ledger-entries';

interface Props {
  entries: LedgerEntry[];
  timezone: string;
  /** En modo rango la columna Hora muestra también la fecha. */
  showDate: boolean;
  onVoid: (payment: PaymentLedgerRow) => void;
  onReview: (kind: 'approve' | 'reject', proof: PaymentProofLedgerRow) => void;
  onOpenProof: (proof: PaymentProofLedgerRow) => void;
  /** Id del comprobante cuya URL firmada se está pidiendo. */
  openingProofId: string | null;
}

/** Tabla (md+) o cards (mobile) del listado de caja: pagos y comprobantes juntos (docs/12-admin-payments.md › PaymentsLedgerTable). */
export function PaymentsLedgerTable({
  entries,
  timezone,
  showDate,
  onVoid,
  onReview,
  onOpenProof,
  openingProofId,
}: Props) {
  const when = (createdAt: string) =>
    showDate
      ? formatDateTime(createdAt, timezone)
      : formatInTimeZone(createdAt, timezone, 'HH:mm');

  const proofActions = (proof: PaymentProofLedgerRow) => (
    <ProofActions
      proof={proof}
      opening={openingProofId === proof.id}
      onReview={onReview}
      onOpen={onOpenProof}
    />
  );

  return (
    <>
      {/* Tabla md+ */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{showDate ? 'Fecha y hora' : 'Hora'}</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead>Registró</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) =>
              entry.kind === 'PAYMENT' ? (
                <PaymentTableRow
                  key={`p-${entry.row.id}`}
                  payment={entry.row}
                  timezone={timezone}
                  time={when(entry.row.createdAt)}
                  onVoid={onVoid}
                />
              ) : (
                <ProofTableRow
                  key={`r-${entry.row.id}`}
                  proof={entry.row}
                  timezone={timezone}
                  time={when(entry.row.createdAt)}
                  actions={proofActions(entry.row)}
                />
              ),
            )}
          </TableBody>
        </Table>
      </div>

      {/* Cards mobile */}
      <ul className="flex flex-col gap-3 md:hidden">
        {entries.map((entry) =>
          entry.kind === 'PAYMENT' ? (
            <PaymentCard
              key={`p-${entry.row.id}`}
              payment={entry.row}
              timezone={timezone}
              time={when(entry.row.createdAt)}
              onVoid={onVoid}
            />
          ) : (
            <ProofCard
              key={`r-${entry.row.id}`}
              proof={entry.row}
              timezone={timezone}
              time={when(entry.row.createdAt)}
              actions={proofActions(entry.row)}
            />
          ),
        )}
      </ul>
    </>
  );
}

function PaymentTableRow({
  payment: p,
  timezone,
  time,
  onVoid,
}: {
  payment: PaymentLedgerRow;
  timezone: string;
  time: string;
  onVoid: (payment: PaymentLedgerRow) => void;
}) {
  const voided = Boolean(p.voidedAt);
  return (
    <TableRow className={cn(voided && 'text-muted-foreground')}>
      <TableCell className="whitespace-nowrap tabular-nums">{time}</TableCell>
      <TableCell
        className={cn(
          'text-right font-medium tabular-nums',
          voided && 'line-through',
        )}
      >
        {formatPrice(p.amount)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className={cn(voided && 'line-through')}>
            {PAYMENT_METHOD_LABELS[p.method]}
          </Badge>
          {voided && <VoidedInfo payment={p} />}
        </div>
      </TableCell>
      <TableCell>
        <BookingLink booking={p.booking} timezone={timezone} />
      </TableCell>
      <TableCell>
        <CustomerInfo booking={p.booking} />
      </TableCell>
      <TableCell className="max-w-48 truncate" title={p.note}>
        {p.note ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>{p.registeredBy.name}</TableCell>
      <TableCell>
        <RowActions payment={p} onVoid={onVoid} />
      </TableCell>
    </TableRow>
  );
}

function PaymentCard({
  payment: p,
  timezone,
  time,
  onVoid,
}: {
  payment: PaymentLedgerRow;
  timezone: string;
  time: string;
  onVoid: (payment: PaymentLedgerRow) => void;
}) {
  const voided = Boolean(p.voidedAt);
  return (
    <li
      className={cn(
        'bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm',
        voided && 'text-muted-foreground',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span
            className={cn(
              'text-base font-semibold tabular-nums',
              voided && 'line-through',
            )}
          >
            {formatPrice(p.amount)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {time}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className={cn(voided && 'line-through')}>
            {PAYMENT_METHOD_LABELS[p.method]}
          </Badge>
          <RowActions payment={p} onVoid={onVoid} />
        </div>
      </div>
      {voided && <VoidedInfo payment={p} />}
      <BookingLink booking={p.booking} timezone={timezone} />
      <CustomerInfo booking={p.booking} />
      {p.note && <p className="text-muted-foreground text-xs">{p.note}</p>}
      <span className="text-muted-foreground text-xs">
        Registró {p.registeredBy.name}
      </span>
    </li>
  );
}

const PROOF_STATUS_LABELS = {
  PENDING: 'Pendiente de revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
} as const;

function ProofStatusBadge({ proof }: { proof: PaymentProofLedgerRow }) {
  return (
    <Badge variant={proof.status === 'PENDING' ? 'warning' : 'danger'}>
      {PROOF_STATUS_LABELS[proof.status]}
    </Badge>
  );
}

/** Payer name, optional players count and, when rejected, the reason. */
function ProofDetails({ proof }: { proof: PaymentProofLedgerRow }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">
        {proof.payerName}
        {proof.playersCount !== null && (
          <span className="text-muted-foreground font-normal">
            {' '}
            ·{' '}
            {proof.playersCount === 1
              ? '1 jugador'
              : `${proof.playersCount} jugadores`}
          </span>
        )}
      </span>
      {proof.status === 'REJECTED' && proof.rejectReason && (
        <span className="text-muted-foreground text-xs">
          Motivo: {proof.rejectReason}
        </span>
      )}
    </div>
  );
}

/** The declared amount is what the payer claims, not collected money: shown muted and labeled. */
function DeclaredAmount({ proof }: { proof: PaymentProofLedgerRow }) {
  if (proof.declaredAmount <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground tabular-nums">
        {formatPrice(proof.declaredAmount)}
      </span>
      <span className="text-muted-foreground text-xs font-normal">
        declarado
      </span>
    </div>
  );
}

function ProofTableRow({
  proof,
  timezone,
  time,
  actions,
}: {
  proof: PaymentProofLedgerRow;
  timezone: string;
  time: string;
  actions: React.ReactNode;
}) {
  return (
    <TableRow
      className={cn(proof.status === 'PENDING' && 'bg-warning-subtle/40')}
    >
      <TableCell className="whitespace-nowrap tabular-nums">{time}</TableCell>
      <TableCell className="text-right font-medium">
        <DeclaredAmount proof={proof} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline">Transferencia</Badge>
          <ProofStatusBadge proof={proof} />
        </div>
      </TableCell>
      <TableCell>
        <BookingLink booking={proof.booking} timezone={timezone} />
      </TableCell>
      <TableCell>
        <CustomerInfo booking={proof.booking} />
      </TableCell>
      <TableCell className="max-w-56">
        <ProofDetails proof={proof} />
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">—</span>
      </TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );
}

function ProofCard({
  proof,
  timezone,
  time,
  actions,
}: {
  proof: PaymentProofLedgerRow;
  timezone: string;
  time: string;
  actions: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        'bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm',
        proof.status === 'PENDING' && 'bg-warning-subtle/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <DeclaredAmount proof={proof} />
          <span className="text-muted-foreground text-xs tabular-nums">
            {time}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline">Transferencia</Badge>
          <ProofStatusBadge proof={proof} />
        </div>
      </div>
      <ProofDetails proof={proof} />
      <BookingLink booking={proof.booking} timezone={timezone} />
      <CustomerInfo booking={proof.booking} />
      {actions}
    </li>
  );
}

/** Pending proofs: Aceptar / Rechazar / Ver comprobante. Rejected ones only keep the receipt link. */
function ProofActions({
  proof,
  opening,
  onReview,
  onOpen,
}: {
  proof: PaymentProofLedgerRow;
  opening: boolean;
  onReview: (kind: 'approve' | 'reject', proof: PaymentProofLedgerRow) => void;
  onOpen: (proof: PaymentProofLedgerRow) => void;
}) {
  // A cancelled booking keeps its history but cannot be approved (the API answers 409).
  const canReview =
    proof.status === 'PENDING' && proof.booking.status !== 'CANCELLED';
  return (
    <div className="flex flex-wrap gap-2">
      {canReview && (
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => onReview('approve', proof)}
          >
            Aceptar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onReview('reject', proof)}
          >
            Rechazar
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={opening}
        onClick={() => onOpen(proof)}
      >
        {opening ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />}
        Ver comprobante
      </Button>
    </div>
  );
}

function BookingLink({
  booking: b,
  timezone,
}: {
  booking: LedgerBooking;
  timezone: string;
}) {
  return (
    <Link
      href={`/admin/bookings/${b.id}`}
      className="flex flex-col hover:underline"
    >
      <span className="font-medium">{b.court.name}</span>
      <span className="text-muted-foreground text-xs">
        <span className="capitalize">
          {formatShortDate(b.startsAt, timezone)}
        </span>{' '}
        · {formatTimeRange(b.startsAt, b.endsAt, timezone)}
        {b.status === 'CANCELLED' && ' · cancelada'}
      </span>
    </Link>
  );
}

function CustomerInfo({ booking }: { booking: LedgerBooking }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">
        {customerDisplayName(booking.customer)}
      </span>
      <span className="text-muted-foreground text-xs">
        {booking.customer?.phone ?? '—'}
      </span>
    </div>
  );
}

function VoidedInfo({ payment }: { payment: PaymentLedgerRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="outline">Anulado</Badge>
      <span className="text-xs">
        {payment.voidedBy && `por ${payment.voidedBy.name}`}
        {payment.voidReason && ` · ${payment.voidReason}`}
      </span>
    </div>
  );
}

function RowActions({
  payment,
  onVoid,
}: {
  payment: PaymentLedgerRow;
  onVoid: (payment: PaymentLedgerRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Acciones" />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={<Link href={`/admin/bookings/${payment.booking.id}`} />}
        >
          Ver reserva
        </DropdownMenuItem>
        {!payment.voidedAt && (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onVoid(payment)}
          >
            Anular pago
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PaymentsLedgerTableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
