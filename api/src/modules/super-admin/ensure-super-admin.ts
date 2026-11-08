import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const MIN_PASSWORD_LENGTH = 8;

export type EnsureSuperAdminResult = 'created' | 'exists' | 'skipped';

/**
 * Bootstraps the platform operator from environment variables:
 * SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME (optional).
 *
 * Creates the SUPER_ADMIN only if no user with that email exists. An existing user is never
 * modified (role and password untouched), so it is safe to run on every boot.
 * Without the variables it does nothing.
 */
export async function ensureSuperAdmin(
  prisma: Pick<PrismaClient, 'user'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnsureSuperAdminResult> {
  const email = env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return 'skipped';
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SUPER_ADMIN_PASSWORD must have at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return 'exists';

  await prisma.user.create({
    data: {
      name: env.SUPER_ADMIN_NAME?.trim() || 'Super Admin',
      email,
      passwordHash: await argon2.hash(password),
      role: UserRole.SUPER_ADMIN,
      complexId: null,
    },
  });
  return 'created';
}
