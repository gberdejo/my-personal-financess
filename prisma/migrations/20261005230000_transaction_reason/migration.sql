-- Escrita a mano: Prisma generaría DROP + CREATE para el renombre y se
-- perderían los motivos guardados. Aquí nada se borra.

-- AlterTable: nuevo campo motivo
ALTER TABLE "Transaction" ADD COLUMN "reason" TEXT;

-- Copia la descripción actual como motivo (la descripción queda igual) para
-- que los gastos ya registrados sigan agrupándose en recurrentes.
UPDATE "Transaction" SET "reason" = "description" WHERE "description" IS NOT NULL;

-- RenameTable: CategoryDescription -> CategoryReason, con sus restricciones e índices
ALTER TABLE "CategoryDescription" RENAME TO "CategoryReason";
ALTER TABLE "CategoryReason" RENAME CONSTRAINT "CategoryDescription_pkey" TO "CategoryReason_pkey";
ALTER TABLE "CategoryReason" RENAME CONSTRAINT "CategoryDescription_categoryId_fkey" TO "CategoryReason_categoryId_fkey";
ALTER INDEX "CategoryDescription_categoryId_idx" RENAME TO "CategoryReason_categoryId_idx";
ALTER INDEX "CategoryDescription_userId_categoryId_name_key" RENAME TO "CategoryReason_userId_categoryId_name_key";
