-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROOF_SUBMITTED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "complex_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "proof_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "payer_name" TEXT NOT NULL,
    "declared_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_complex_id_read_at_idx" ON "notifications"("complex_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_complex_id_created_at_idx" ON "notifications"("complex_id", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_complex_id_fkey" FOREIGN KEY ("complex_id") REFERENCES "complexes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_proof_id_fkey" FOREIGN KEY ("proof_id") REFERENCES "payment_proofs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
