-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('PADEL', 'FOOTBALL_5', 'FOOTBALL_7', 'TENNIS');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('PLAYER', 'ADMIN', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CustomerSource" AS ENUM ('PUBLIC', 'ADMIN');

-- CreateEnum
CREATE TYPE "PaymentProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "complexes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "cancellation_window_hours" INTEGER NOT NULL DEFAULT 24,
    "auto_confirm_public_requests" BOOLEAN NOT NULL DEFAULT false,
    "instagram_url" TEXT,
    "facebook_url" TEXT,
    "tiktok_url" TEXT,
    "youtube_url" TEXT,
    "contact_whatsapp" TEXT,
    "primary_color" VARCHAR(7),
    "secondary_color" VARCHAR(7),
    "logo_url" TEXT,
    "bank_cbu" VARCHAR(22),
    "bank_alias" VARCHAR(20),
    "bank_holder_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courts" (
    "id" TEXT NOT NULL,
    "complex_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "surface" TEXT,
    "is_indoor" BOOLEAN NOT NULL DEFAULT false,
    "slot_duration_minutes" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "price_per_slot" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "complex_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "complex_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" "CustomerSource" NOT NULL DEFAULT 'ADMIN',
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "price" INTEGER NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'PLAYER',
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancellation_reason" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "started_by_id" TEXT,
    "finished_at" TIMESTAMPTZ(3),
    "finished_by_id" TEXT,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "registered_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_proofs" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'PENDING',
    "payer_name" TEXT NOT NULL,
    "players_count" INTEGER,
    "declared_amount" INTEGER NOT NULL,
    "amount" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" TEXT,
    "reject_reason" TEXT,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "complexes_slug_key" ON "complexes"("slug");

-- CreateIndex
CREATE INDEX "courts_complex_id_is_active_sport_idx" ON "courts"("complex_id", "is_active", "sport");

-- CreateIndex
CREATE UNIQUE INDEX "courts_complex_id_name_key" ON "courts"("complex_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_complex_id_idx" ON "users"("complex_id");

-- CreateIndex
CREATE INDEX "customers_complex_id_is_active_first_name_last_name_idx" ON "customers"("complex_id", "is_active", "first_name", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_complex_id_phone_key" ON "customers"("complex_id", "phone");

-- CreateIndex
CREATE INDEX "bookings_customer_id_starts_at_idx" ON "bookings"("customer_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_court_id_starts_at_idx" ON "bookings"("court_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_starts_at_idx" ON "bookings"("starts_at");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE INDEX "payment_proofs_booking_id_idx" ON "payment_proofs"("booking_id");

-- CreateIndex
CREATE INDEX "payment_proofs_status_idx" ON "payment_proofs"("status");

-- AddForeignKey
ALTER TABLE "courts" ADD CONSTRAINT "courts_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_started_by_id_fkey" FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_finished_by_id_fkey" FOREIGN KEY ("finished_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Constraints Prisma cannot express. Appended by hand.
-- Derived from the latest state of the original schema history.
-- ============================================================================

-- 1. No double bookings per court: a slot (court + start) can hold ONE active
--    booking. PENDING blocks the slot like CONFIRMED; CANCELLED frees it.
CREATE UNIQUE INDEX "bookings_court_starts_at_active_uidx"
  ON "bookings" ("court_id", "starts_at")
  WHERE "status" IN ('CONFIRMED', 'PENDING');

-- btree_gist stays installed for future exclusion constraints (e.g. court time ranges).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Sanity checks.
ALTER TABLE "bookings"  ADD CONSTRAINT "bookings_ends_after_starts_chk" CHECK ("ends_at" > "starts_at");
ALTER TABLE "bookings"  ADD CONSTRAINT "bookings_pending_expires_chk"
  CHECK ("status" <> 'PENDING' OR "expires_at" IS NOT NULL);
-- A booking without a customer is only valid as a counter booking from the admin panel.
ALTER TABLE "bookings"  ADD CONSTRAINT "bookings_customer_or_admin_chk"
  CHECK ("customer_id" IS NOT NULL OR "source" = 'ADMIN');
ALTER TABLE "courts"    ADD CONSTRAINT "courts_slot_duration_chk"       CHECK ("slot_duration_minutes" BETWEEN 15 AND 240);
ALTER TABLE "courts"    ADD CONSTRAINT "courts_price_chk"               CHECK ("price_per_slot" >= 0);
ALTER TABLE "courts"    ADD CONSTRAINT "courts_open_time_fmt_chk"       CHECK ("open_time"  ~ '^([01]\d|2[0-3]):[0-5]\d$');
ALTER TABLE "courts"    ADD CONSTRAINT "courts_close_time_fmt_chk"      CHECK ("close_time" ~ '^([01]\d|2[0-3]):[0-5]\d$');
ALTER TABLE "complexes" ADD CONSTRAINT "complexes_cancel_window_chk"    CHECK ("cancellation_window_hours" >= 0);
ALTER TABLE "complexes" ADD CONSTRAINT "complexes_slug_fmt_chk"         CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "users"     ADD CONSTRAINT "users_admin_has_complex_chk"    CHECK ("role" <> 'ADMIN' OR "complex_id" IS NOT NULL);

-- 3. Customers: canonical phone ('+' + digits); NULL = counter customer without a phone.
--    Postgres uses NULLS DISTINCT, so several phone-less customers coexist in a complex.
ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_fmt_chk"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[0-9]{8,15}$');
CREATE INDEX "customers_complex_first_name_lower_idx" ON "customers" ("complex_id", lower("first_name"));
CREATE INDEX "customers_complex_last_name_lower_idx"  ON "customers" ("complex_id", lower("last_name"));

-- 4. Payments: positive amount; void metadata only when voided.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive_chk" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_consistency_chk"
  CHECK ("voided_at" IS NOT NULL OR ("voided_by_id" IS NULL AND "void_reason" IS NULL));
