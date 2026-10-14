-- Selaraskan DATA LAMA dengan definisi progress eksekusi yang baru.
--
-- Definisi progress (lib/qa-metrics -> `executionProgress`) = jumlah TC yang
-- punya status akhir (PASS/FAIL/BLOCKED/SKIPPED) dibagi total TC. Artinya run
-- yang berstatus COMPLETED tidak boleh menyisakan hasil berstatus NOT_RUN,
-- supaya "Completed" selalu identik dengan progress 100%.
--
-- Run BARU sudah dijaga oleh `completeRun` (menolak bila masih ada NOT_RUN) dan
-- `completeRunWithSkip` (mengubah sisa NOT_RUN menjadi SKIPPED). Migration ini
-- melakukan hal yang sama untuk data lama: sisa NOT_RUN pada run COMPLETED
-- ditandai SKIPPED sehingga punya status akhir.
--
-- Catatan:
-- - Hanya kolom `status` hasil yang diubah; `actualResult`/`notes` dibiarkan.
-- - Idempotent: hanya baris NOT_RUN yang tersentuh.
--
-- Verifikasi setelah menjalankan (harus 0):
--   SELECT count(*) FROM "TestRunResult" r
--   JOIN "TestRun" run ON run.id = r."runId"
--   WHERE run."status" = 'COMPLETED' AND r."status" = 'NOT_RUN';

UPDATE "TestRunResult" r
SET "status" = 'SKIPPED'
WHERE r."status" = 'NOT_RUN'
  AND r."runId" IN (SELECT id FROM "TestRun" WHERE "status" = 'COMPLETED');
