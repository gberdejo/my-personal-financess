-- Escrita a mano: revierte 20261024125738_loans_focus_on_payments.
-- isExtra y note no llegaron a usarse; balance se recalcula desde el capital
-- del préstamo para no dejar cuotas sin saldo.

-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "principal" SET NOT NULL,
ALTER COLUMN "tea" SET NOT NULL,
ALTER COLUMN "disbursementDate" SET NOT NULL;

-- AlterTable
ALTER TABLE "LoanInstallment" DROP COLUMN "isExtra",
DROP COLUMN "note",
ADD COLUMN     "balance" DECIMAL(14,2),
ALTER COLUMN "number" SET NOT NULL,
ALTER COLUMN "principal" DROP DEFAULT,
ALTER COLUMN "interest" DROP DEFAULT;

-- Saldo de capital después de cada cuota = capital prestado − capital amortizado hasta esa cuota.
UPDATE "LoanInstallment" AS i
SET "balance" = l."principal" - s."amortized"
FROM (
  SELECT "id", SUM("principal") OVER (PARTITION BY "scheduledPaymentId" ORDER BY "dueDate") AS "amortized"
  FROM "LoanInstallment"
) AS s
JOIN "Loan" AS l ON TRUE
WHERE s."id" = i."id" AND l."scheduledPaymentId" = i."scheduledPaymentId";

ALTER TABLE "LoanInstallment" ALTER COLUMN "balance" SET NOT NULL;
