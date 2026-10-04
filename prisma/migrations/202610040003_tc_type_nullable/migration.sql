-- Type awalnya dibuat NOT NULL DEFAULT 'POSITIVE', sehingga seluruh baris lama
-- terisi otomatis. Kolom ini seharusnya "belum dipilih" sampai QA memilihnya
-- sendiri, jadi default & NOT NULL dilepas lalu nilai hasil auto-fill dikosongkan.
ALTER TABLE "TestCase" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "TestCase" ALTER COLUMN "type" DROP NOT NULL;
UPDATE "TestCase" SET "type" = NULL;
