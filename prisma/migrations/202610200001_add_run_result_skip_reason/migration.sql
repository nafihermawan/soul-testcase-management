-- AlterTable
-- Alasan wajib saat hasil eksekusi di-Skip (dropdown "Alasan Skipped" di panel
-- Eksekusi). Nullable + aditif: baris lama tetap valid dan dibiarkan NULL.
ALTER TABLE "TestRunResult" ADD COLUMN "skipReason" TEXT;
