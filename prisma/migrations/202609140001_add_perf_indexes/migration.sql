-- Index tambahan untuk filter status (lihat docs/AUDIT-Performa-Navigasi.md):
-- Active Runs & Run History memfilter TestRun.status (History juga urut
-- completedAt), laporan memfilter TestRunResult.status, dan daftar Bugs /
-- laporan mingguan memfilter Bug.status.
--
-- Murni penambahan index (tidak mengubah data). Tidak berdampak besar pada
-- ukuran tabel saat ini, tapi menghindari full scan saat riwayat membesar.

-- CreateIndex
CREATE INDEX "TestRun_status_idx" ON "TestRun"("status");

-- CreateIndex
CREATE INDEX "TestRun_status_completedAt_idx" ON "TestRun"("status", "completedAt");

-- CreateIndex
CREATE INDEX "TestRunResult_status_idx" ON "TestRunResult"("status");

-- CreateIndex
CREATE INDEX "Bug_status_idx" ON "Bug"("status");
