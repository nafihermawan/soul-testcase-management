import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import { toAttachmentItems } from "@/lib/attachments";
import { presignGetUrls } from "@/lib/storage/r2";
import type { BugsPayload, BugRow } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const bugs = await prisma.bug.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      testCase: { select: { id: true, tcId: true, title: true } },
      createdBy: { select: { name: true } },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  });

  // Presign sekali untuk SEMUA attachment di halaman ini (bukan per baris bug).
  const urlMap = await presignGetUrls(
    bugs.flatMap((b) => b.attachments.map((a) => a.storageKey))
  );

  const rows: BugRow[] = await Promise.all(
    bugs.map(async (b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      status: b.status,
      severity: b.severity,
      externalLink: b.externalLink,
      createdAt: b.createdAt.toISOString(),
      testCase: b.testCase,
      createdBy: b.createdBy,
      attachments: await toAttachmentItems(b.attachments, urlMap),
      sourceType: b.testCaseId ? "EXECUTION" : "GENERAL_FINDING",
    }))
  );

  return NextResponse.json({ bugs: rows } satisfies BugsPayload);
}

export const dynamic = "force-dynamic";
