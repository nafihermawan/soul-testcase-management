-- CreateEnum
CREATE TYPE "TCType" AS ENUM ('POSITIVE', 'NEGATIVE');

-- AlterTable: default POSITIVE supaya seluruh baris lama langsung terisi.
ALTER TABLE "TestCase" ADD COLUMN "type" "TCType" NOT NULL DEFAULT 'POSITIVE';
