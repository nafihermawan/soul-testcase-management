-- AlterTable
ALTER TABLE "Bug" ADD COLUMN "environment" TEXT;

-- CreateIndex
CREATE INDEX "Bug_environment_idx" ON "Bug"("environment");

-- Backfill: bug dari eksekusi mewarisi environment dari TestRun hasilnya.
-- Bug ad-hoc dibiarkan NULL (tidak ada sumbernya).
UPDATE "Bug" b
SET "environment" = r."environment"
FROM "TestRunResult" trr
JOIN "TestRun" r ON r.id = trr."runId"
WHERE b."testRunResultId" = trr.id
  AND b."environment" IS NULL
  AND r."environment" IS NOT NULL;
