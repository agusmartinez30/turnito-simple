import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
    JWT_EXPIRES_IN: z.string().min(1).default('7d'),
    WEB_ORIGIN: z.string().url(),
    BOOKING_MAX_DAYS_AHEAD: z.coerce.number().int().min(1).max(365).default(7),
    /** `true` detrás de un reverse proxy: Express confía en X-Forwarded-For para req.ip (rate limit). */
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Storage de archivos subidos (docs/18-storage.md). `stub` no persiste: dev/tests. */
    STORAGE_PROVIDER: z.enum(['stub', 'supabase']).default('stub'),
    /** Project URL de Supabase, ej. https://abcdefgh.supabase.co. Obligatoria con `supabase`. */
    SUPABASE_URL: z.string().url().optional(),
    /** Clave `service_role`: bypassea RLS de TODO el proyecto. Solo servidor, nunca NEXT_PUBLIC_. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    /** Bucket público donde viven los logos. Tiene que existir y estar marcado público. */
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default('complex-logos'),
    /** Bucket **privado** de documentos (se leen solo con URLs firmadas). */
    SUPABASE_PRIVATE_BUCKET: z.string().min(1).default('private-documents'),
    /** Bucket **privado** exclusivo de comprobantes de pago (PDF/JPG/PNG), URLs firmadas. */
    SUPABASE_PAYMENT_PROOFS_BUCKET: z.string().min(1).default('payment-proofs'),
  })
  .superRefine((env, ctx) => {
    // Falla al arrancar y no con un 503 en la primera subida (docs/18-storage.md).
    if (env.STORAGE_PROVIDER === 'supabase') {
      if (!env.SUPABASE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['SUPABASE_URL'],
          message: 'Obligatoria cuando STORAGE_PROVIDER=supabase',
        });
      }
      if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['SUPABASE_SERVICE_ROLE_KEY'],
          message: 'Obligatoria cuando STORAGE_PROVIDER=supabase',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Usado por ConfigModule.forRoot({ validate }). Lanza si falta o es inválida alguna variable. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return result.data;
}
