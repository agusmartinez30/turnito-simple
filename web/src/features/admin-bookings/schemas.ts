import { z } from 'zod';

/** Manual booking form (the court, date and time are chosen outside the schema). */
export const newBookingSchema = z.object({
  customerId: z.string().optional(),
  price: z.coerce
    .number({ message: 'Ingresá un precio' })
    .int('Debe ser un número entero')
    .min(0, 'No puede ser negativo'),
  note: z.string().trim().max(280, 'Máximo 280 caracteres').optional(),
});

/** Form input (price arrives as a string from the <input>) vs. validated output. */
export type NewBookingInput = z.input<typeof newBookingSchema>;
export type NewBookingValues = z.output<typeof newBookingSchema>;
