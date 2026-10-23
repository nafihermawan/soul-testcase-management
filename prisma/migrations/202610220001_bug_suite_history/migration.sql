-- ============================================================================
-- Bug: tautan Suite menjadi RIWAYAT, bukan penghalang penghapusan Suite.
--
-- Masalah: migrasi 202610140002 membuat "Bug"."suiteId" WAJIB + FK RESTRICT,
-- sehingga Suite yang masih punya bug CLOSED/RESOLVED tidak bisa dihapus.
-- Deadlock-nya nyata: bug tersebut berada di Test Run yang sudah COMPLETED,
-- jadi QA tidak bisa memindahkan/mengubahnya lagi.
--
-- Perubahan (ADDITIF — tanpa drop tabel/kolom, tanpa reset data):
--   1. Tambah kolom snapshot "suiteName" (nama suite saat tautan diputus).
--   2. Backfill snapshot untuk seluruh bug yang saat ini masih tertaut.
--   3. "suiteId" boleh NULL + FK jadi ON DELETE SET NULL (unlink, bukan block).
--
-- Aturan blokir sekarang ada di level APLIKASI (lib/actions/hierarchy.ts →
-- deleteSuite): hanya bug AKTIF (OPEN/IN_PROGRESS) yang menolak penghapusan.
--
-- Idempotent: aman dijalankan ulang.
--
-- Verifikasi setelah menjalankan:
--   -- harus 0 (semua bug tertaut sudah punya snapshot)
--   SELECT count(*) FROM "Bug" WHERE "suiteId" IS NOT NULL AND "suiteName" IS NULL;
--   -- suite yang tadinya memblokir, sekarang bisa dihitung
--   SELECT count(DISTINCT "suiteId") FROM "Bug" WHERE "status" IN ('CLOSED','RESOLVED');
-- ============================================================================

ALTER TABLE "Bug" ADD COLUMN IF NOT EXISTS "suiteName" TEXT;

UPDATE "Bug" b
SET "suiteName" = s."name"
FROM "Suite" s
WHERE b."suiteId" = s."id"
  AND b."suiteName" IS NULL;

ALTER TABLE "Bug" ALTER COLUMN "suiteId" DROP NOT NULL;

ALTER TABLE "Bug" DROP CONSTRAINT IF EXISTS "Bug_suiteId_fkey";
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_suiteId_fkey"
  FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
