-- AlterTable
ALTER TABLE "ImportedMovement" ADD COLUMN     "receiptUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "receiptUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
