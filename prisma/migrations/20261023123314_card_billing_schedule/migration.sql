-- AlterTable
ALTER TABLE "ScheduledPayment" ADD COLUMN     "dueDay" INTEGER;

-- Escrito a mano: hasta ahora el día de pago de la tarjeta salía del día de
-- startDate. Se copia a la columna nueva para que las tarjetas existentes sigan
-- cayendo en las mismas fechas.
UPDATE "ScheduledPayment" SET "dueDay" = EXTRACT(DAY FROM "startDate")::INTEGER WHERE "type" = 'CREDIT_CARD';

-- CreateTable
CREATE TABLE "CardBillingPeriod" (
    "id" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardBillingPeriod_scheduledPaymentId_month_key" ON "CardBillingPeriod"("scheduledPaymentId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CardBillingPeriod_scheduledPaymentId_dueDate_key" ON "CardBillingPeriod"("scheduledPaymentId", "dueDate");

-- AddForeignKey
ALTER TABLE "CardBillingPeriod" ADD CONSTRAINT "CardBillingPeriod_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
