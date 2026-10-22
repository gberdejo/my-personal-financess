-- CreateEnum
CREATE TYPE "ScheduledPaymentType" AS ENUM ('BILL', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PAID', 'SKIPPED');

-- CreateTable
CREATE TABLE "ScheduledPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ScheduledPaymentType" NOT NULL DEFAULT 'BILL',
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "accountId" TEXT,
    "paymentMethod" "PaymentMethod",
    "amount" DECIMAL(12,2),
    "frequency" "ScheduleFrequency" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "closingDay" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledOccurrence" (
    "id" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "OccurrenceStatus" NOT NULL,
    "amount" DECIMAL(12,2),
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledPayment_userId_idx" ON "ScheduledPayment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledOccurrence_transactionId_key" ON "ScheduledOccurrence"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledOccurrence_scheduledPaymentId_dueDate_key" ON "ScheduledOccurrence"("scheduledPaymentId", "dueDate");

-- AddForeignKey
ALTER TABLE "ScheduledPayment" ADD CONSTRAINT "ScheduledPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPayment" ADD CONSTRAINT "ScheduledPayment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledOccurrence" ADD CONSTRAINT "ScheduledOccurrence_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledOccurrence" ADD CONSTRAINT "ScheduledOccurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
