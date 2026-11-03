-- CreateTable
CREATE TABLE "TransactionImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "accountId" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "counterparty" TEXT,
    "message" TEXT,
    "rawType" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "discarded" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "createdTransaction" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImportedMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionImport_userId_createdAt_idx" ON "TransactionImport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportedMovement_importId_idx" ON "ImportedMovement"("importId");

-- CreateIndex
CREATE INDEX "ImportedMovement_userId_fingerprint_idx" ON "ImportedMovement"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "ImportedMovement_transactionId_idx" ON "ImportedMovement"("transactionId");

-- AddForeignKey
ALTER TABLE "TransactionImport" ADD CONSTRAINT "TransactionImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedMovement" ADD CONSTRAINT "ImportedMovement_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TransactionImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedMovement" ADD CONSTRAINT "ImportedMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
