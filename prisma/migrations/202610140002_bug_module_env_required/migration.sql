-- ============================================================================
-- Bug: Module (suiteId) & Environment menjadi WAJIB (NOT NULL).
--
-- Urutan penting — BACKFILL dulu, baru SET NOT NULL:
--   1. Tentukan project untuk bug tanpa suite (dari TestCase, atau project pertama).
--   2. Buat Suite "General" untuk tiap project yang masih punya bug tanpa suite.
--   3. Arahkan bug tanpa suite ke Suite "General" project-nya.
--   4. Environment: null/kosong -> 'DEV'; nilai lain dinormalisasi UPPERCASE.
--   5. Enforce: FK suite jadi RESTRICT + suiteId & environment SET NOT NULL.
--
-- Catatan:
-- - `gen_random_uuid()` tersedia di PostgreSQL 13+ (Supabase PG15).
-- - Langkah 1b mengasumsikan minimal ada 1 Project bila masih ada bug tanpa
--   suite; tanpa project, langkah 5 akan gagal (memang harus ada project).
-- - Idempotent: baris yang sudah terisi/normal tidak tersentuh.
--
-- Verifikasi setelah menjalankan (keduanya harus 0):
--   SELECT count(*) FROM "Bug" WHERE "suiteId" IS NULL OR "environment" IS NULL;
--   SELECT count(*) FROM "Bug" WHERE "environment" <> upper("environment");
-- ============================================================================

-- 1a. Bug tanpa suite tapi punya TestCase -> ambil project dari suite TestCase-nya.
UPDATE "Bug" b
SET "projectId" = s."projectId"
FROM "TestCase" tc
JOIN "Suite" s ON s.id = tc."suiteId"
WHERE b."testCaseId" = tc.id
  AND b."suiteId" IS NULL
  AND b."projectId" IS NULL;

-- 1b. Sisanya (tanpa project sama sekali) -> project pertama (deterministik).
UPDATE "Bug"
SET "projectId" = (
  SELECT p.id FROM "Project" p ORDER BY p."order" ASC, p."createdAt" ASC LIMIT 1
)
WHERE "suiteId" IS NULL AND "projectId" IS NULL;

-- 2. Suite "General" untuk tiap project yang masih punya bug tanpa suite.
INSERT INTO "Suite" (id, "projectId", name, code, "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p.id, 'General', 'general', 0, true, now(), now()
FROM "Project" p
WHERE EXISTS (SELECT 1 FROM "Bug" b WHERE b."suiteId" IS NULL AND b."projectId" = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM "Suite" s WHERE s."projectId" = p.id AND s.code = 'general'
  );

-- 3. Arahkan bug tanpa suite ke Suite "General" project-nya.
UPDATE "Bug" b
SET "suiteId" = s.id
FROM "Suite" s
WHERE b."suiteId" IS NULL
  AND s."projectId" = b."projectId"
  AND s.code = 'general';

-- 4. Environment: default 'DEV' + normalisasi UPPERCASE penuh.
UPDATE "Bug" SET "environment" = 'DEV'
WHERE "environment" IS NULL OR btrim("environment") = '';

UPDATE "Bug" SET "environment" = upper("environment")
WHERE "environment" <> upper("environment");

-- 5. Enforce NOT NULL + FK RESTRICT (suite tak bisa dihapus selama dipakai bug).
ALTER TABLE "Bug" DROP CONSTRAINT "Bug_suiteId_fkey";
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_suiteId_fkey"
  FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Bug" ALTER COLUMN "suiteId" SET NOT NULL;
ALTER TABLE "Bug" ALTER COLUMN "environment" SET NOT NULL;
