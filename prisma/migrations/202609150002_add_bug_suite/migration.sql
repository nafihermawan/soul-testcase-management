-- AlterTable
ALTER TABLE "Bug" ADD COLUMN "suiteId" TEXT;

-- CreateIndex
CREATE INDEX "Bug_suiteId_idx" ON "Bug"("suiteId");

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
