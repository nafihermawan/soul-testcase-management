-- Tambah kolom resolvedAt ke Bug (timestamp saat status -> RESOLVED/CLOSED)
ALTER TABLE "Bug" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Backfill: bug yang sudah RESOLVED/CLOSED sebelum kolom ini ada,
-- gunakan updatedAt sebagai perkiraan waktu resolve.
UPDATE "Bug" SET "resolvedAt" = "updatedAt"
WHERE "status" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL;
