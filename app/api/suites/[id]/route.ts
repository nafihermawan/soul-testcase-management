import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json404 } from "@/lib/api-auth";
import type { SuiteDetailPayload, SuiteDetailTestCase } from "@/types/api";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await apiSession();
  if (!user) return json401();

  const suite = await prisma.suite.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, name: true, code: true } },
      parent: { select: { id: true, name: true } },
      testCases: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          tcId: true,
          title: true,
          scenario: true,
          precondition: true,
          steps: true,
          testData: true,
          expectedResult: true,
          priority: true,
          status: true,
          sectionId: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
      sections: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, description: true },
      },
    },
  });

  if (!suite) {
    return json404("Suite tidak ditemukan.");
  }

  const testCases: SuiteDetailTestCase[] = suite.testCases.map((tc) => ({
    id: tc.id,
    tcId: tc.tcId,
    title: tc.title,
    scenario: tc.scenario,
    precondition: tc.precondition,
    steps: tc.steps,
    testData: tc.testData,
    expectedResult: tc.expectedResult,
    priority: tc.priority,
    status: tc.status,
    sectionId: tc.sectionId,
    createdAt: tc.createdAt.toISOString(),
    createdBy: tc.createdBy,
  }));

  const payload: SuiteDetailPayload = {
    suite: {
      id: suite.id,
      name: suite.name,
      code: suite.code,
      project: suite.project,
      parent: suite.parent,
      testCaseCount: suite.testCases.length,
      description: suite.description,
      docUrl: suite.docUrl,
    },
    sections: suite.sections,
    testCases,
    canEdit: apiRoleAtLeast(user.role, "QA"),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
