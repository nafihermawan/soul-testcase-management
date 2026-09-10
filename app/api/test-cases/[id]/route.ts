import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json404 } from "@/lib/api-auth";
import { toAttachmentItems } from "@/lib/attachments";
import type {
  TestCaseActivityItem,
  TestCaseBugItem,
  TestCaseDetailPayload,
  TestCaseRunHistoryItem,
} from "@/types/api";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await apiSession();
  if (!user) return json401();

  const tc = await prisma.testCase.findUnique({
    where: { id: params.id },
    include: {
      suite: {
        select: {
          id: true,
          name: true,
          projectId: true,
          project: { select: { id: true, name: true } },
        },
      },
      createdBy: { select: { name: true } },
      automation: true,
      bugs: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { name: true } } },
      },
      runResults: {
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          run: { select: { id: true, name: true, createdAt: true, status: true } },
          updatedBy: { select: { name: true } },
        },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  });

  if (!tc) {
    return json404("Test case tidak ditemukan.");
  }

  const bugs: TestCaseBugItem[] = tc.bugs.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    status: b.status,
    severity: b.severity,
    externalLink: b.externalLink,
    createdAt: b.createdAt.toISOString(),
    createdBy: b.createdBy,
  }));

  const activities: TestCaseActivityItem[] = tc.activities.map((a) => ({
    id: a.id,
    action: a.action,
    detail: a.detail,
    createdAt: a.createdAt.toISOString(),
    user: a.user,
  }));

  const runResults: TestCaseRunHistoryItem[] = tc.runResults.map((r) => ({
    id: r.id,
    status: r.status,
    actualResult: r.actualResult,
    updatedAt: r.updatedAt.toISOString(),
    run: {
      id: r.run.id,
      name: r.run.name,
      createdAt: r.run.createdAt.toISOString(),
      status: r.run.status,
    },
  }));

  const payload: TestCaseDetailPayload = {
    id: tc.id,
    tcId: tc.tcId,
    title: tc.title,
    priority: tc.priority,
    status: tc.status,
    canEdit: apiRoleAtLeast(user.role, "QA"),
    scenario: tc.scenario,
    precondition: tc.precondition,
    steps: tc.steps,
    testData: tc.testData,
    expectedResult: tc.expectedResult,
    createdAt: tc.createdAt.toISOString(),
    updatedAt: tc.updatedAt.toISOString(),
    suite: tc.suite,
    createdBy: tc.createdBy,
    automation: tc.automation
      ? {
          id: tc.automation.id,
          externalTestId: tc.automation.externalTestId,
          scriptPath: tc.automation.scriptPath,
          status: tc.automation.status,
          lastRunAt: tc.automation.lastRunAt ? tc.automation.lastRunAt.toISOString() : null,
          lastResult: tc.automation.lastResult,
        }
      : null,
    bugs,
    activities,
    runResults,
    attachments: await toAttachmentItems(tc.attachments),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
