import { z } from 'zod';
import { countSlots, isHHmm } from '@/lib/slots';

/** Form de cancha (docs/08-admin-courts.md › Validación cliente). */
export const courtSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Mínimo 2 caracteres')
      .max(40, 'Máximo 40 caracteres'),
    sport: z.enum(['PADEL', 'FOOTBALL_5', 'FOOTBALL_7', 'TENNIS']),
    surface: z
      .string()
      .trim()
      .max(40, 'Máximo 40 caracteres')
      .optional()
      .or(z.literal('')),
    isIndoor: z.boolean(),
    imageUrl: z.url('Ingresá una URL válida').optional().or(z.literal('')),
    sortOrder: z.coerce
      .number({ message: 'Ingresá un número' })
      .int('Debe ser un número entero')
      .min(0, 'No puede ser negativo'),
    openTime: z.string().refine(isHHmm, 'Formato HH:mm'),
    closeTime: z.string().refine(isHHmm, 'Formato HH:mm'),
    slotDurationMinutes: z.coerce
      .number({ message: 'Elegí una duración' })
      .int()
      .min(15)
      .max(240),
    pricePerSlot: z.coerce
      .number({ message: 'Ingresá un precio' })
      .int('Debe ser un número entero')
      .min(0, 'No puede ser negativo'),
  })
  // Un cierre menor que la apertura es del día siguiente (turnos trasnoche); solo el igual es inválido.
  .refine((v) => v.openTime !== v.closeTime, {
    path: ['closeTime'],
    message: 'Debe ser distinta de la hora de apertura',
  })
  .refine(
    (v) => countSlots(v.openTime, v.closeTime, v.slotDurationMinutes) >= 1,
    {
      path: ['slotDurationMinutes'],
      message: 'No entra ningún turno completo en ese horario',
    },
  );

export type CourtFormInput = z.input<typeof courtSchema>;
export type CourtFormValues = z.output<typeof courtSchema>;

export const SLOT_DURATION_OPTIONS = [30, 45, 60, 90, 120, 180] as const;
