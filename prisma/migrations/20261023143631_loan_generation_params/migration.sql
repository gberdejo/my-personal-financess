-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "dateShift" TEXT NOT NULL DEFAULT 'SUNDAY',
ADD COLUMN     "fixedInstallment" DECIMAL(12,2);
