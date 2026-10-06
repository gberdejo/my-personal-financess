-- CreateTable
CREATE TABLE "CategoryDescription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryDescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryDescription_categoryId_idx" ON "CategoryDescription"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryDescription_userId_categoryId_name_key" ON "CategoryDescription"("userId", "categoryId", "name");

-- AddForeignKey
ALTER TABLE "CategoryDescription" ADD CONSTRAINT "CategoryDescription_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

