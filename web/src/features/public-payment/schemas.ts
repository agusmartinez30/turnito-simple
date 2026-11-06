import { z } from 'zod';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PAYER_NAME_MAX = 100;
export const PLAYERS_COUNT_MAX = 50;

/** Client-side check of the receipt; the API re-validates type, size and magic bytes. */
export function validateProofFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'El comprobante tiene que ser un PDF.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_PROOF_BYTES) {
    return 'El PDF pesa más de 5 MB. Elegí uno más liviano.';
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

/** `max` = remaining balance: the API rejects a larger amount too. */
export function buildProofFormSchema(max: number) {
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
      .min(1, 'Ingresá el monto del comprobante')
      .refine(
        (v) => isInt(v) && Number(v) >= 1,
        'Ingresá un monto entero mayor a 0',
      )
      .refine(
        (v) => !isInt(v) || Number(v) <= max,
        `El monto no puede superar el saldo restante`,
      ),
  });
}

export function parseProofForm(values: ProofFormValues) {
  const players = values.playersCount.trim();
  return {
    payerName: values.payerName.trim(),
    playersCount: players === '' ? undefined : Number(players),
    amount: Number(values.amount.trim()),
  };
}
