-- ============================================================================
-- Riwayat run automation (ADDITIF — tanpa drop tabel/kolom, tanpa reset data).
--
-- Latar belakang: AutomationLink hanya menyimpan status + run TERAKHIR
-- (lastRunAt/lastResult). Tab Automation di halaman detail test case butuh
-- riwayat per-run (tabel + pagination). Tabel baru ini diisi oleh webhook CI
-- (/api/automation-results) dan upload laporan (applyAutomationReport).
--
-- Idempotent: aman dijalankan ulang.
--
-- Verifikasi setelah menjalankan:
--   SELECT count(*) FROM "AutomationRun";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AutomationRun" (
  "id" TEXT NOT NULL,
  "automationLinkId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationRun_automationLinkId_ranAt_idx"
  ON "AutomationRun"("automationLinkId", "ranAt");

ALTER TABLE "AutomationRun" DROP CONSTRAINT IF EXISTS "AutomationRun_automationLinkId_fkey";
ALTER TABLE "AutomationRun"
  ADD CONSTRAINT "AutomationRun_automationLinkId_fkey"
  FOREIGN KEY ("automationLinkId") REFERENCES "AutomationLink"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
