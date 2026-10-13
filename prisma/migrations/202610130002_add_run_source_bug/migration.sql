-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN "sourceBugId" TEXT;

-- CreateIndex
CREATE INDEX "TestRun_sourceBugId_idx" ON "TestRun"("sourceBugId");

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_sourceBugId_fkey" FOREIGN KEY ("sourceBugId") REFERENCES "Bug"("id") ON DELETE SET NULL ON UPDATE CASCADE;
