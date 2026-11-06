-- AlterTable
ALTER TABLE "payments" ADD COLUMN "payer_name" TEXT,
ADD COLUMN "proof_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_proof_id_key" ON "payments"("proof_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_id_fkey" FOREIGN KEY ("proof_id") REFERENCES "payment_proofs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
