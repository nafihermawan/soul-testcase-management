-- Step 3.5: Migrate to unified Project/Suite structure

-- 1. Rename Platform -> ProjectNew (top-level). Old "Project" (level 2) will become Suites.
ALTER TABLE "Platform" RENAME TO "ProjectNew";
ALTER INDEX "Platform_pkey" RENAME TO "ProjectNew_pkey";

-- 2. Create Suite table (recursive, projectId FK to new Project)
CREATE TABLE "Suite" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suite_pkey" PRIMARY KEY ("id")
);

-- 3. Migrate old level-2 Project rows into Suite rows (parentId = null).
--    projectId on the new Suite = platformId (FK to the renamed Platform/ProjectNew)
INSERT INTO "Suite" ("id", "projectId", "parentId", "name", "code", "description", "order", "isActive", "createdById", "createdAt", "updatedAt")
SELECT
    'suite_' || "id",
    "platformId",
    NULL,
    "name",
    "code",
    "description",
    "order",
    "isActive",
    "createdById",
    "createdAt",
    "updatedAt"
FROM "Project"
WHERE "id" LIKE 'proj_%';

-- 4. Migrate Module rows into Suite rows (parent = old Project suite).
--    Module.projectId references old level-2 Project; its platformId gives the top-level Project.
INSERT INTO "Suite" ("id", "projectId", "parentId", "name", "code", "description", "order", "isActive", "createdById", "createdAt", "updatedAt")
SELECT
    'suite_' || m."id",
    p."platformId",
    'suite_' || m."projectId",
    m."name",
    m."code",
    m."description",
    m."order",
    m."isActive",
    m."createdById",
    m."createdAt",
    m."updatedAt"
FROM "Module" m
JOIN "Project" p ON p."id" = m."projectId";

-- 5. Migrate Submodule rows into Suite rows (parent = old Module suite).
--    projectId must be the TOP-LEVEL project (platformId of old Project), resolved via Module -> old Project.
INSERT INTO "Suite" ("id", "projectId", "parentId", "name", "code", "description", "order", "isActive", "createdById", "createdAt", "updatedAt")
SELECT
    'suite_' || s."id",
    p."platformId",
    'suite_' || s."moduleId",
    s."name",
    s."code",
    s."description",
    s."order",
    s."isActive",
    s."createdById",
    s."createdAt",
    s."updatedAt"
FROM "Submodule" s
JOIN "Module" m ON m."id" = s."moduleId"
JOIN "Project" p ON p."id" = m."projectId";

-- 6. Migrate TestSection rows into Suite rows (parent = old Submodule suite), preserving section grouping
INSERT INTO "Suite" ("id", "projectId", "parentId", "name", "code", "description", "order", "isActive", "createdById", "createdAt", "updatedAt")
SELECT
    'suite_' || ts."id",
    (SELECT s."projectId" FROM "Suite" s WHERE s."id" = 'suite_' || ts."submoduleId"),
    'suite_' || ts."submoduleId",
    ts."name",
    'SEC-' || RIGHT(ts."id", 6),
    ts."description",
    ts."order",
    true,
    ts."createdById",
    ts."createdAt",
    ts."updatedAt"
FROM "TestSection" ts;

-- 7. Add suiteId to TestCase, link via old Submodule -> new Suite mapping
ALTER TABLE "TestCase" ADD COLUMN "suiteId" TEXT;

UPDATE "TestCase" tc
SET "suiteId" = 'suite_' || tc."submoduleId"
WHERE tc."submoduleId" IS NOT NULL;

-- 8. Drop obsolete columns on TestCase
ALTER TABLE "TestCase" DROP COLUMN "submoduleId";
ALTER TABLE "TestCase" DROP COLUMN "sectionId";

-- 9. Drop obsolete tables (after data migrated)
DROP TABLE "TestSection";
DROP TABLE "Submodule";
DROP TABLE "Module";

-- 10. Clean up old level-2 Project rows (now duplicated as Suites)
DELETE FROM "Project" WHERE "id" LIKE 'proj_%';

-- 11. Drop old Project constraints, then rename ProjectNew -> Project
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_platformId_fkey";
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_pkey";
ALTER TABLE "Project" RENAME TO "ProjectOld";
ALTER TABLE "ProjectNew" RENAME TO "Project";
ALTER INDEX "ProjectNew_pkey" RENAME TO "Project_pkey";

-- 12. Recreate relations & indexes for new schema
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

CREATE UNIQUE INDEX "Suite_projectId_parentId_code_key" ON "Suite"("projectId", "parentId", "code");
CREATE INDEX "Suite_projectId_order_idx" ON "Suite"("projectId", "order");
CREATE INDEX "Suite_parentId_order_idx" ON "Suite"("parentId", "order");
CREATE INDEX "TestCase_suiteId_order_idx" ON "TestCase"("suiteId", "order");

ALTER TABLE "Suite" ADD CONSTRAINT "Suite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Suite" ADD CONSTRAINT "Suite_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Suite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Suite" ADD CONSTRAINT "Suite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 13. Drop old Project table entirely (was level-2, now represented by Suites)
DROP TABLE "ProjectOld";
