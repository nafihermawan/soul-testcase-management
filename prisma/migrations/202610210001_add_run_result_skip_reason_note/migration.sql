-- AlterTable
-- Keterangan bebas untuk alasan skip "Lainnya" (dropdown "Alasan Skipped" di
-- panel Eksekusi). Nullable + aditif: baris lama tetap valid dan dibiarkan NULL.
ALTER TABLE "TestRunResult" ADD COLUMN "skipReasonNote" TEXT;
