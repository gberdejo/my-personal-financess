-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouletteOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledPaymentId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "feeRate" DECIMAL(6,4) NOT NULL,
    "charge" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouletteOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_scheduledPaymentId_dueDate_key" ON "CardStatement"("scheduledPaymentId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RouletteOperation_transactionId_key" ON "RouletteOperation"("transactionId");

-- CreateIndex
CREATE INDEX "RouletteOperation_userId_date_idx" ON "RouletteOperation"("userId", "date");

-- CreateIndex
CREATE INDEX "RouletteOperation_scheduledPaymentId_dueDate_idx" ON "RouletteOperation"("scheduledPaymentId", "dueDate");

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteOperation" ADD CONSTRAINT "RouletteOperation_scheduledPaymentId_fkey" FOREIGN KEY ("scheduledPaymentId") REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteOperation" ADD CONSTRAINT "RouletteOperation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
