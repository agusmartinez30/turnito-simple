import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    complexName: z
      .string()
      .trim()
      .min(2, 'Mínimo 2 caracteres')
      .max(80, 'Máximo 80 caracteres'),
    complexAddress: z
      .string()
      .trim()
      .min(2, 'Mínimo 2 caracteres')
      .max(160, 'Máximo 160 caracteres'),
    timezone: z.string().min(1, 'Elegí la zona horaria'),
    name: z
      .string()
      .trim()
      .min(2, 'Mínimo 2 caracteres')
      .max(60, 'Máximo 60 caracteres'),
    email: z.email('Ingresá un email válido'),
    phone: z
      .string()
      .regex(/^\+?\d{8,15}$/, 'Solo números, 8 a 15 dígitos')
      .optional()
      .or(z.literal('')),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });

export type RegisterValues = z.infer<typeof registerSchema>;
