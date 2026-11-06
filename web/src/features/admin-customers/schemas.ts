import { z } from 'zod';

/** Alta y edición de cliente (docs/18-admin-customers.md). */
export const customerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(60, 'Máximo 60 caracteres'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(60, 'Máximo 60 caracteres')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,15}$/, 'Solo números, 8 a 15 dígitos')
    .optional()
    .or(z.literal('')),
  note: z.string().trim().max(280, 'Máximo 280 caracteres').optional(),
});

export type CustomerFormInput = z.input<typeof customerSchema>;
export type CustomerFormValues = z.output<typeof customerSchema>;
