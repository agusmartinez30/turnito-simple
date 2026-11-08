import { PrismaClient } from '@prisma/client';
import {
  ensureSuperAdmin,
  EnsureSuperAdminResult,
} from '../src/modules/super-admin/ensure-super-admin';

/** Manual run of the boot-time bootstrap: `pnpm admin:ensure-super` (needs SUPER_ADMIN_* env vars). */
const prisma = new PrismaClient();
ensureSuperAdmin(prisma)
  .then((result) => {
    const messages: Record<EnsureSuperAdminResult, string> = {
      created: 'Super admin created',
      exists: 'Super admin user already exists, nothing changed',
      skipped: 'SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set, skipping',
    };
    console.log(messages[result]);
  })
  .catch((err: Error) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
