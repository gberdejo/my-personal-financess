-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "baseInstallment" DECIMAL(12,2),
ADD COLUMN     "installments" INTEGER NOT NULL DEFAULT 0;

-- Escrito a mano: los préstamos existentes toman como plazo sus cuotas actuales
-- y como cuota base la fija o, si no hay, la de la cuota 2 (la 1 suele tener
-- días de gracia).
UPDATE "Loan" AS l SET
  "installments" = (SELECT count(*) FROM "LoanInstallment" i WHERE i."scheduledPaymentId" = l."scheduledPaymentId"),
  "baseInstallment" = COALESCE(
    l."fixedInstallment",
    (SELECT i."total" FROM "LoanInstallment" i WHERE i."scheduledPaymentId" = l."scheduledPaymentId" ORDER BY i."dueDate" OFFSET 1 LIMIT 1),
    (SELECT i."total" FROM "LoanInstallment" i WHERE i."scheduledPaymentId" = l."scheduledPaymentId" ORDER BY i."dueDate" LIMIT 1)
  );

-- CreateTable
CREATE TABLE "LoanPrepayment" (
    "id" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "mode" TEXT NOT NULL,
    "note" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanPrepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanPrepayment_transactionId_key" ON "LoanPrepayment"("transactionId");

-- CreateIndex
CREATE INDEX "LoanPrepayment_scheduledPaymentId_date_idx" ON "LoanPrepayment"("scheduledPaymentId", "date");

-- AddForeignKey
ALTER TABLE "LoanPrepayment" ADD CONSTRAINT "LoanPrepayment_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPrepayment" ADD CONSTRAINT "LoanPrepayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
