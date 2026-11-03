-- AlterTable
ALTER TABLE "ImportedMovement" ADD COLUMN     "categoryName" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "TransactionImport" ADD COLUMN     "paymentMethod" "PaymentMethod";
