-- AlterEnum
ALTER TYPE "ScheduledPaymentType" ADD VALUE 'LOAN';

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "lender" TEXT,
    "principal" DECIMAL(14,2) NOT NULL,
    "tea" DECIMAL(9,6) NOT NULL,
    "disbursementDate" TIMESTAMP(3) NOT NULL,
    "dayBasis" INTEGER NOT NULL DEFAULT 360,
    "lifeInsuranceRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "interest" DECIMAL(12,2) NOT NULL,
    "lifeInsurance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loan_scheduledPaymentId_key" ON "Loan"("scheduledPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_scheduledPaymentId_number_key" ON "LoanInstallment"("scheduledPaymentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_scheduledPaymentId_dueDate_key" ON "LoanInstallment"("scheduledPaymentId", "dueDate");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
