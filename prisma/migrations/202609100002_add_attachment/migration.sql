-- Attachment: file evidence/reference (gambar & video).
-- Metadata saja; byte file disimpan di Cloudflare R2 (object storage),
-- karena Vercel Hobby membatasi body request ~4.5MB sehingga upload harus
-- dilakukan langsung dari browser ke R2 (lihat lib/storage/r2.ts).

CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "testCaseId" TEXT,
    "testRunResultId" TEXT,
    "bugId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_testCaseId_idx" ON "Attachment"("testCaseId");
CREATE INDEX "Attachment_testRunResultId_idx" ON "Attachment"("testRunResultId");
CREATE INDEX "Attachment_bugId_idx" ON "Attachment"("bugId");

-- Satu attachment hanya boleh menempel ke TEPAT SATU pemilik
-- (testCase ATAU testRunResult ATAU bug). Ditegakkan di level DB agar
-- tidak bisa dilanggar oleh jalur mana pun, termasuk SQL manual.
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_one_owner_check"
    CHECK (num_nonnulls("testCaseId", "testRunResultId", "bugId") = 1);

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testCaseId_fkey"
    FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_testRunResultId_fkey"
    FOREIGN KEY ("testRunResultId") REFERENCES "TestRunResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_bugId_fkey"
    FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
