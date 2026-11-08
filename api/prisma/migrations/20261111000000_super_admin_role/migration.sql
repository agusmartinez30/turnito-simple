-- Platform-level role plus complex suspension.
-- The new enum value cannot be used in this same transaction; the CHECK that references it
-- lives in the next migration (20261111000001_super_admin_constraint).
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

ALTER TABLE "complexes" ADD COLUMN "suspended_at" TIMESTAMPTZ(3);
