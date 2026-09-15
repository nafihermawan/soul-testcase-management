import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json404 } from "@/lib/api-auth";
import { toAttachmentItems } from "@/lib/attachments";
import type { BugDetailPayload, BugRow } from "@/types/api";

/** Detail satu bug + evidence yang menempel padanya. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await apiSession();
  if (!user) return json401();

  const bug = await prisma.bug.findUnique({
    where: { id: params.id },
    include: {
      testCase: { select: { id: true, tcId: true, title: true } },
      suite: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!bug) return json404("Bug tidak ditemukan.");

  const row: BugRow = {
    id: bug.id,
    title: bug.title,
    description: bug.description,
    status: bug.status,
    severity: bug.severity,
    externalLink: bug.externalLink,
    createdAt: bug.createdAt.toISOString(),
    testCase: bug.testCase,
    suite: bug.suite,
    project: bug.project,
    createdBy: bug.createdBy,
    attachments: await toAttachmentItems(bug.attachments),
    sourceType: bug.testCaseId ? "EXECUTION" : "GENERAL_FINDING",
  };

  return NextResponse.json({
    bug: row,
    canAttach: apiRoleAtLeast(user.role, "QA"),
    canUpdateStatus: apiRoleAtLeast(user.role, "DEVELOPER"),
    canDelete: apiRoleAtLeast(user.role, "QA"),
  } satisfies BugDetailPayload);
}

export const dynamic = "force-dynamic";
