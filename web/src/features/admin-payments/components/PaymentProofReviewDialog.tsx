'use client';

import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ErrorAlert } from '@/components/layout/ErrorAlert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api/errors';
import { formatPrice } from '@/lib/date';
import type { PaymentProof } from '@/types/admin';
import { useApprovePaymentProof, useRejectPaymentProof } from '../hooks';

/** Only what the dialogs need, so both the booking card and the ledger rows can open them. */
export type ReviewableProof = Pick<
  PaymentProof,
  'id' | 'payerName' | 'playersCount' | 'declaredAmount'
>;

export type ProofReview = {
  kind: 'approve' | 'reject';
  proof: ReviewableProof;
};

export const REJECT_REASON_MAX = 300;

interface Props {
  bookingId: string;
  review: ProofReview | null;
  /** Saldo pendiente de la reserva: monto sugerido al aprobar. */
  pendingAmount: number;
  onClose: () => void;
}

/** Aprobar (monto opcional) o rechazar (motivo obligatorio) un comprobante pendiente. */
export function PaymentProofReviewDialog({
  bookingId,
  review,
  pendingAmount,
  onClose,
}: Props) {
  return (
    <Dialog open={review !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {review?.kind === 'approve' && (
          <ApproveForm
            key={review.proof.id}
            bookingId={bookingId}
            proof={review.proof}
            pendingAmount={pendingAmount}
            onClose={onClose}
          />
        )}
        {review?.kind === 'reject' && (
          <RejectForm
            key={review.proof.id}
            bookingId={bookingId}
            proof={review.proof}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Errores que invalidan la decisión: se avisa, se cierra y la lista ya se refrescó. */
function handleStaleError(error: unknown, onClose: () => void): boolean {
  if (
    isApiError(error) &&
    (error.code === 'PAYMENT_PROOF_NOT_PENDING' ||
      error.code === 'BOOKING_NOT_PAYABLE')
  ) {
    toast.error(error.message);
    onClose();
    return true;
  }
  return false;
}

function ApproveForm({
  bookingId,
  proof,
  pendingAmount,
  onClose,
}: {
  bookingId: string;
  proof: ReviewableProof;
  pendingAmount: number;
  onClose: () => void;
}) {
  const approve = useApprovePaymentProof(bookingId);
  // Prefill with what the payer declared; legacy rows (0) fall back to the balance.
  const suggested =
    proof.declaredAmount > 0 ? proof.declaredAmount : pendingAmount;
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : '');
  const trimmed = amount.trim();
  const parsed = trimmed === '' ? undefined : Number(trimmed);
  const invalid =
    parsed !== undefined && (!Number.isInteger(parsed) || parsed < 1);

  const submit = () => {
    approve.mutate(
      { proofId: proof.id, amount: parsed },
      {
        onSuccess: () => {
          toast.success('Comprobante aprobado: pago registrado');
          onClose();
        },
        onError: (error) => {
          handleStaleError(error, onClose);
        },
      },
    );
  };

  const showInlineError =
    approve.isError &&
    !(
      isApiError(approve.error) &&
      (approve.error.code === 'PAYMENT_PROOF_NOT_PENDING' ||
        approve.error.code === 'BOOKING_NOT_PAYABLE')
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aprobar comprobante</DialogTitle>
        <DialogDescription>
          Se registra un pago por transferencia en la reserva. {proof.payerName}
          {proof.playersCount !== null &&
            ` (${proof.playersCount === 1 ? '1 jugador' : `${proof.playersCount} jugadores`})`}
          {proof.declaredAmount > 0 &&
            ` declara ${formatPrice(proof.declaredAmount)}`}
          . Si dejás el monto vacío se usa ese monto, sin pasar el saldo
          pendiente
          {pendingAmount > 0 && ` (${formatPrice(pendingAmount)})`}.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="proof-approve-amount">
          Monto{' '}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </FieldLabel>
        <Input
          id="proof-approve-amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          autoFocus
          className="tabular-nums"
          aria-invalid={invalid}
          disabled={approve.isPending}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {invalid && (
          <p className="text-destructive text-sm">
            Ingresá un monto entero mayor a 0.
          </p>
        )}
      </Field>
      {showInlineError && <ErrorAlert error={approve.error} />}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={approve.isPending}
        >
          Volver
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={approve.isPending || invalid}
        >
          {approve.isPending && <Loader2Icon className="animate-spin" />}
          Aprobar
        </Button>
      </DialogFooter>
    </>
  );
}

function RejectForm({
  bookingId,
  proof,
  onClose,
}: {
  bookingId: string;
  proof: ReviewableProof;
  onClose: () => void;
}) {
  const reject = useRejectPaymentProof(bookingId);
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  const submit = () => {
    reject.mutate(
      { proofId: proof.id, reason: trimmed },
      {
        onSuccess: () => {
          toast.success('Comprobante rechazado');
          onClose();
        },
        onError: (error) => {
          handleStaleError(error, onClose);
        },
      },
    );
  };

  const showInlineError =
    reject.isError &&
    !(
      isApiError(reject.error) &&
      (reject.error.code === 'PAYMENT_PROOF_NOT_PENDING' ||
        reject.error.code === 'BOOKING_NOT_PAYABLE')
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rechazar comprobante</DialogTitle>
        <DialogDescription>
          El monto de este comprobante vuelve a estar disponible en el link de
          pago para que se pueda enviar otro. El motivo queda registrado acá.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="proof-reject-reason">Motivo</FieldLabel>
        <Textarea
          id="proof-reject-reason"
          autoFocus
          rows={3}
          maxLength={REJECT_REASON_MAX}
          placeholder="Ej.: el monto no coincide"
          disabled={reject.isPending}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {showInlineError && <ErrorAlert error={reject.error} />}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={reject.isPending}
        >
          Volver
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={submit}
          disabled={reject.isPending || trimmed.length === 0}
        >
          {reject.isPending && <Loader2Icon className="animate-spin" />}
          Rechazar
        </Button>
      </DialogFooter>
    </>
  );
}
