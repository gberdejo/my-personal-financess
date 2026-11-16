-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('PEN', 'USD');

-- AlterTable
ALTER TABLE "CardStatement" ADD COLUMN     "amountUsd" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ScheduledOccurrence" ADD COLUMN     "amountUsd" DECIMAL(12,2),
ADD COLUMN     "estimatedUsdAtPayment" DECIMAL(12,2),
ADD COLUMN     "exchangeRate" DECIMAL(10,4),
ADD COLUMN     "usdTransactionId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'PEN',
ADD COLUMN     "exchangeRate" DECIMAL(10,4),
ADD COLUMN     "foreignAmount" DECIMAL(12,2);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledOccurrence_usdTransactionId_key" ON "ScheduledOccurrence"("usdTransactionId");

-- AddForeignKey
ALTER TABLE "ScheduledOccurrence" ADD CONSTRAINT "ScheduledOccurrence_usdTransactionId_fkey" FOREIGN KEY ("usdTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
