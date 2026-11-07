import { z } from 'zod';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PAYER_NAME_MAX = 100;
export const PLAYERS_COUNT_MAX = 50;

/** Client-side check of the receipt (PDF, JPG or PNG); the API re-validates type, size and magic bytes. */
const PROOF_EXTENSION = /\.(pdf|jpe?g|png)$/i;

export function validateProofFile(file: File): string | null {
  if (!PROOF_EXTENSION.test(file.name)) {
    return 'El comprobante tiene que ser un PDF, JPG o PNG.';
  }
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_PROOF_BYTES) {
    return 'El archivo pesa más de 5 MB. Elegí uno más liviano.';
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Receipt form values. Numeric inputs stay strings in the form and are parsed on submit
 * (`parseProofForm`), so an empty optional field is simply `''`.
 */
export interface ProofFormValues {
  payerName: string;
  playersCount: string;
  amount: string;
}

const isInt = (value: string) => /^\d+$/.test(value);

/**
 * The amount is never auto-filled. Going over the pending balance is NOT a validation error
 * here (see `isAmountOverBalance` for the soft warning); the API remains the authority.
 */
export function buildProofFormSchema() {
  return z.object({
    payerName: z
      .string()
      .trim()
      .min(1, 'Indicá el nombre de quien paga')
      .max(PAYER_NAME_MAX, `Máximo ${PAYER_NAME_MAX} caracteres`),
    playersCount: z
      .string()
      .trim()
      .refine(
        (v) =>
          v === '' ||
          (isInt(v) && Number(v) >= 1 && Number(v) <= PLAYERS_COUNT_MAX),
        `Ingresá un número entero entre 1 y ${PLAYERS_COUNT_MAX}`,
      ),
    amount: z
      .string()
      .trim()
      .min(1, 'Ingresá el importe transferido')
      .refine(
        (v) => isInt(v) && Number(v) >= 1,
        'Ingresá un importe entero mayor a 0',
      ),
  });
}

/** Non-blocking hint: true when a valid amount exceeds the pending balance. */
export function isAmountOverBalance(amount: string, remaining: number) {
  const value = amount.trim();
  return isInt(value) && Number(value) > remaining;
}

export function parseProofForm(values: ProofFormValues) {
  const players = values.playersCount.trim();
  return {
    payerName: values.payerName.trim(),
    playersCount: players === '' ? undefined : Number(players),
    amount: Number(values.amount.trim()),
  };
}
