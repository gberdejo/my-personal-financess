-- Escrita a mano: hay que migrar datos. Los vencimientos de tarjeta ya pagados
-- quedan con las dos partes (soles y dólares) resueltas. Nada se borra.

-- AlterEnum: un vencimiento de tarjeta con una sola parte resuelta
ALTER TYPE "OccurrenceStatus" ADD VALUE 'PARTIAL';

-- AlterTable: estado y monto por parte
ALTER TABLE "ScheduledOccurrence"
ADD COLUMN "penSettled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "usdSettled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "penAmount" DECIMAL(12,2);

-- Datos: las tarjetas ya pagadas tienen las dos partes resueltas; los soles son
-- el total menos los dólares convertidos con su tipo de cambio.
UPDATE "ScheduledOccurrence" AS o
SET "penSettled" = true,
    "usdSettled" = true,
    "penAmount" = o."amount" - ROUND(COALESCE(o."amountUsd" * o."exchangeRate", 0), 2)
FROM "ScheduledPayment" AS p
WHERE p."id" = o."scheduledPaymentId"
  AND p."type" = 'CREDIT_CARD'
  AND o."status" = 'PAID';
