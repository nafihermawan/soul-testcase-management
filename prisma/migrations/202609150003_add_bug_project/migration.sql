-- AlterTable
ALTER TABLE "Bug" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "Bug_projectId_idx" ON "Bug"("projectId");

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill 1: bug dari eksekusi belum menyimpan suite — ambil dari TestCase-nya.
UPDATE "Bug" b
SET "suiteId" = tc."suiteId"
FROM "TestCase" tc
WHERE b."testCaseId" = tc.id
  AND b."suiteId" IS NULL
  AND tc."suiteId" IS NOT NULL;

-- Backfill 2: project selalu diturunkan dari suite (berlaku untuk bug eksekusi
-- maupun temuan ad-hoc yang sudah punya suite).
UPDATE "Bug" b
SET "projectId" = s."projectId"
FROM "Suite" s
WHERE b."suiteId" = s.id
  AND b."projectId" IS NULL;
