import { z } from 'zod';

export const NOTE_MAX = 120;

/** Registrar pago (docs/12-admin-payments.md › RegisterPaymentDialog). Sin tope: el sobrepago solo avisa. */
export const registerPaymentSchema = z.object({
  amount: z.coerce
    .number({ message: 'Ingresá un monto' })
    .int('Debe ser un número entero')
    .min(1, 'Debe ser mayor a 0'),
  method: z.enum(['CASH', 'TRANSFER']),
  note: z
    .string()
    .trim()
    .max(NOTE_MAX, `Máximo ${NOTE_MAX} caracteres`)
    .optional(),
});

/** Input del form (amount llega como string del <input>) vs. output validado. */
export type RegisterPaymentInput = z.input<typeof registerPaymentSchema>;
export type RegisterPaymentValues = z.output<typeof registerPaymentSchema>;
