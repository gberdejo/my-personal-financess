-- Tarjeta con que se pagó un gasto con tarjeta de crédito (la tarjeta del calendario).
ALTER TABLE "Transaction" ADD COLUMN "cardId" TEXT;
CREATE INDEX "Transaction_cardId_idx" ON "Transaction"("cardId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "ScheduledPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tarjeta por defecto de una importación.
ALTER TABLE "TransactionImport" ADD COLUMN "cardId" TEXT;
ALTER TABLE "TransactionImport" ADD CONSTRAINT "TransactionImport_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "ScheduledPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nombre de la tarjeta que trae la plantilla genérica.
ALTER TABLE "ImportedMovement" ADD COLUMN "cardName" TEXT;

-- Gastos con tarjeta ya registrados: si el usuario tiene una sola tarjeta, son de esa.
-- Con varias quedan sin asignar y el calendario avisa para asignarlos.
UPDATE "Transaction" t
SET "cardId" = c."id"
FROM "ScheduledPayment" c
WHERE t."paymentMethod" = 'CREDIT_CARD'
  AND t."cardId" IS NULL
  AND c."userId" = t."userId"
  AND c."type" = 'CREDIT_CARD'
  AND (
    SELECT COUNT(*) FROM "ScheduledPayment" o
    WHERE o."userId" = t."userId" AND o."type" = 'CREDIT_CARD'
  ) = 1;
