-- Multi-assignee: satu TestRun boleh ditugaskan ke lebih dari satu QA.
-- Additive — kolom tunggal "TestRun"."assigneeId" tidak diubah maupun dihapus
-- (masih disinkronkan ke assignee pertama untuk kompatibilitas data lama).

-- CreateTable
CREATE TABLE "TestRunAssignee" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRunAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestRunAssignee_testRunId_userId_key" ON "TestRunAssignee"("testRunId", "userId");

-- CreateIndex
CREATE INDEX "TestRunAssignee_userId_idx" ON "TestRunAssignee"("userId");

-- AddForeignKey
ALTER TABLE "TestRunAssignee" ADD CONSTRAINT "TestRunAssignee_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRunAssignee" ADD CONSTRAINT "TestRunAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: penugasan tunggal yang sudah ada dipindahkan ke tabel relasi supaya
-- tidak ada assignee yang hilang saat UI beralih ke multi-assignee. Id dibuat
-- deterministik dari pasangan (run, user) agar migrasi ini aman diulang.
INSERT INTO "TestRunAssignee" ("id", "testRunId", "userId")
SELECT 'tra_' || md5("id" || ':' || "assigneeId"), "id", "assigneeId"
FROM "TestRun"
WHERE "assigneeId" IS NOT NULL
ON CONFLICT ("testRunId", "userId") DO NOTHING;
