-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('MOBILE', 'WEB', 'HARDWARE', 'API');

-- Konversi kolom environment (TEXT) ke platform (Platform enum)
ALTER TABLE "Project" RENAME COLUMN "environment" TO "platform_tmp";

-- Update nilai: pastikan format konsisten (uppercase, hapus spasi/dash)
UPDATE "Project" SET "platform_tmp" = UPPER(TRIM("platform_tmp"));

ALTER TABLE "Project" ALTER COLUMN "platform_tmp" TYPE "Platform"
  USING (
    CASE
      WHEN "platform_tmp" = 'MOBILE' THEN 'MOBILE'::"Platform"
      WHEN "platform_tmp" = 'WEB' THEN 'WEB'::"Platform"
      WHEN "platform_tmp" = 'HARDWARE' THEN 'HARDWARE'::"Platform"
      WHEN "platform_tmp" = 'API' THEN 'API'::"Platform"
      ELSE NULL
    END
  );

ALTER TABLE "Project" RENAME COLUMN "platform_tmp" TO "platform";
