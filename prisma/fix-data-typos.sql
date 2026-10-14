-- =============================================================================
-- Data cleansing: typo pada nama Suite/Module & judul Test Case
-- -----------------------------------------------------------------------------
-- Perbaikan:
--   "Attendence"  -> "Attendance"
--   "Kaluar Masuk" -> "Keluar Masuk"
--
-- CATATAN PENTING
-- - String ini TIDAK ada di source repo (tidak ada seeder), jadi kemungkinan
--   besar berada di DATABASE. Sebelum menjalankan, KONFIRMASI dulu kolom mana
--   yang memuatnya (lihat blok PREVIEW di bawah) — sesuaikan tabel/kolom bila
--   ternyata ada di Project.name / TestRun.name / Bug.title.
-- - Script aman diulang (idempotent): hanya baris yang mengandung substring
--   target yang di-update, dan REPLACE tidak mengubah baris yang sudah benar.
-- - Jalankan di dalam transaksi; COMMIT hanya kalau hasil PREVIEW sudah benar.
--
-- Cara pakai (psql):
--   psql "$DATABASE_URL" -f prisma/fix-data-typos.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PREVIEW 0: temukan di mana substring typo berada (jalankan ini dulu,
-- atau jalankan terpisah sebelum BEGIN kalau ingin meninjau manual).
-- ---------------------------------------------------------------------------
-- SELECT 'Suite'       AS tabel, id, name  AS teks FROM "Suite"     WHERE name  ILIKE '%attendence%' OR name  ILIKE '%kaluar masuk%'
-- UNION ALL
-- SELECT 'TestCase',            id, title          FROM "TestCase" WHERE title ILIKE '%attendence%' OR title ILIKE '%kaluar masuk%'
-- UNION ALL
-- SELECT 'Bug',                 id, title          FROM "Bug"      WHERE title ILIKE '%attendence%' OR title ILIKE '%kaluar masuk%'
-- UNION ALL
-- SELECT 'Project',             id, name           FROM "Project"  WHERE name  ILIKE '%attendence%' OR name  ILIKE '%kaluar masuk%'
-- UNION ALL
-- SELECT 'TestRun',             id, name           FROM "TestRun"  WHERE name  ILIKE '%attendence%' OR name  ILIKE '%kaluar masuk%';

-- ---------------------------------------------------------------------------
-- 1. Nama Suite / Module
-- ---------------------------------------------------------------------------
UPDATE "Suite"
SET name = REPLACE(REPLACE(name, 'Attendence', 'Attendance'), 'Kaluar Masuk', 'Keluar Masuk')
WHERE name LIKE '%Attendence%' OR name LIKE '%Kaluar Masuk%';

-- ---------------------------------------------------------------------------
-- 2. Judul Test Case
-- ---------------------------------------------------------------------------
UPDATE "TestCase"
SET title = REPLACE(REPLACE(title, 'Attendence', 'Attendance'), 'Kaluar Masuk', 'Keluar Masuk')
WHERE title LIKE '%Attendence%' OR title LIKE '%Kaluar Masuk%';

-- ---------------------------------------------------------------------------
-- 3. Judul Bug
-- ---------------------------------------------------------------------------
UPDATE "Bug"
SET title = REPLACE(REPLACE(title, 'Attendence', 'Attendance'), 'Kaluar Masuk', 'Keluar Masuk')
WHERE title LIKE '%Attendence%' OR title LIKE '%Kaluar Masuk%';

-- ---------------------------------------------------------------------------
-- 4. Nama Project (bila ada)
-- ---------------------------------------------------------------------------
UPDATE "Project"
SET name = REPLACE(REPLACE(name, 'Attendence', 'Attendance'), 'Kaluar Masuk', 'Keluar Masuk')
WHERE name LIKE '%Attendence%' OR name LIKE '%Kaluar Masuk%';

-- ---------------------------------------------------------------------------
-- 5. Nama Test Run (bila ada)
-- ---------------------------------------------------------------------------
UPDATE "TestRun"
SET name = REPLACE(REPLACE(name, 'Attendence', 'Attendance'), 'Kaluar Masuk', 'Keluar Masuk')
WHERE name LIKE '%Attendence%' OR name LIKE '%Kaluar Masuk%';

COMMIT;

-- =============================================================================
-- VERIFIKASI (harus 0 baris):
--   SELECT count(*) FROM "Suite"     WHERE name  ILIKE '%attendence%' OR name  ILIKE '%kaluar masuk%';
--   SELECT count(*) FROM "TestCase"  WHERE title ILIKE '%attendence%' OR title ILIKE '%kaluar masuk%';
-- =============================================================================
