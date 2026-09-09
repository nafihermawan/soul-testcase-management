-- CreateTable
CREATE TABLE "TestSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "submoduleId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSection_pkey" PRIMARY KEY ("id")
);

-- Migrate existing section strings into TestSection rows
INSERT INTO "TestSection" ("id", "name", "order", "submoduleId", "createdAt", "updatedAt")
SELECT 'sec_' || md5("submoduleId" || '|' || "section"),
       "section",
       0,
       "submoduleId",
       MIN("createdAt"),
       MAX("updatedAt")
FROM "TestCase"
WHERE "section" IS NOT NULL AND "section" <> ''
GROUP BY "submoduleId", "section";

-- Add sectionId column to TestCase
ALTER TABLE "TestCase" ADD COLUMN "sectionId" TEXT;

-- Link existing test cases to their migrated section
UPDATE "TestCase" tc
SET "sectionId" = s."id"
FROM "TestSection" s
WHERE tc."section" IS NOT NULL
  AND s."submoduleId" = tc."submoduleId"
  AND s."name" = tc."section";

-- Drop the old section string column
ALTER TABLE "TestCase" DROP COLUMN "section";

-- CreateIndex
CREATE UNIQUE INDEX "TestSection_submoduleId_name_key" ON "TestSection"("submoduleId", "name");

-- CreateIndex
CREATE INDEX "TestSection_submoduleId_order_idx" ON "TestSection"("submoduleId", "order");

-- CreateIndex
CREATE INDEX "TestCase_sectionId_order_idx" ON "TestCase"("sectionId", "order");

-- AddForeignKey
ALTER TABLE "TestSection" ADD CONSTRAINT "TestSection_submoduleId_fkey" FOREIGN KEY ("submoduleId") REFERENCES "Submodule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSection" ADD CONSTRAINT "TestSection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TestSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
