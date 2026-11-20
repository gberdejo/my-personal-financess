-- CreateTable
CREATE TABLE "MarketRate" (
    "series" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkedOn" TIMESTAMP(3) NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketRate_pkey" PRIMARY KEY ("series")
);
