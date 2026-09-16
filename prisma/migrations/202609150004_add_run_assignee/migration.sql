-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "TestRun_assigneeId_idx" ON "TestRun"("assigneeId");

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
