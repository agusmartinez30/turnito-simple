import { z } from 'zod';

/** Basic complex data (name and address). One schema per card, each with its own save button. */
export const complexSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(80, 'Máximo 80 caracteres'),
  address: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .max(160, 'Máximo 160 caracteres'),
});

export type ComplexSettingsValues = z.output<typeof complexSettingsSchema>;

/** Bank details for transfers; every field may be empty (the API stores it as null). */
export const bankDetailsSchema = z.object({
  bankCbu: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\d{22}$/, 'El CBU/CVU debe tener exactamente 22 dígitos'),
  ]),
  bankAlias: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9.-]{6,20}$/,
        'Entre 6 y 20 caracteres: letras, números, puntos o guiones',
      ),
  ]),
  bankHolderName: z.string().trim().max(100, 'Máximo 100 caracteres'),
});

export type BankDetailsValues = z.output<typeof bankDetailsSchema>;
