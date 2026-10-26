/*
  Warnings:

  - You are about to drop the column `balance` on the `LoanInstallment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "principal" DROP NOT NULL,
ALTER COLUMN "tea" DROP NOT NULL,
ALTER COLUMN "disbursementDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LoanInstallment" DROP COLUMN "balance",
ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ALTER COLUMN "number" DROP NOT NULL,
ALTER COLUMN "principal" SET DEFAULT 0,
ALTER COLUMN "interest" SET DEFAULT 0;
