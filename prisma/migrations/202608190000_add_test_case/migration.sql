-- CreateEnum
CREATE TYPE "TCPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TCStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "tcId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "section" TEXT,
    "scenario" TEXT,
    "precondition" TEXT,
    "steps" TEXT,
    "testData" TEXT,
    "expectedResult" TEXT,
    "priority" "TCPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TCStatus" NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "submoduleId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_tcId_key" ON "TestCase"("tcId");

-- CreateIndex
CREATE INDEX "TestCase_submoduleId_order_idx" ON "TestCase"("submoduleId", "order");

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_submoduleId_fkey" FOREIGN KEY ("submoduleId") REFERENCES "Submodule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
