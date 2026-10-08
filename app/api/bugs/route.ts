import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401 } from "@/lib/api-auth";
import { toAttachmentItems } from "@/lib/attachments";
import { presignGetUrls } from "@/lib/storage/r2";
import type { BugsPayload, BugRow } from "@/types/api";

/**
 * Fallback status: 'RESOLVED' sudah dihapus dari alur (Open → In Progress →
 * Closed). Kalau masih ada baris lama ber-status itu, tampilkan sebagai Closed
 * supaya tidak muncul sebagai status tanpa pilihan di dropdown.
 */
function normalizeBugStatus(status: BugRow["status"]): BugRow["status"] {
  return status === "RESOLVED" ? "CLOSED" : status;
}

/**
 * GET /api/bugs
 * - tanpa query   -> seluruh bug (halaman Bugs Tracker).
 * - ?testCaseId=  -> hanya bug milik TestCase tsb, dipakai section
 *   "Linked Bugs & History" di modal detail eksekusi. Bug yang sudah
 *   CLOSED tetap ikut supaya riwayatnya tidak hilang.
 */
export async function GET(req: NextRequest) {
  const user = await apiSession();
  if (!user) return json401();

  const testCaseId = (req.nextUrl.searchParams.get("testCaseId") ?? "").trim();

  const bugs = await prisma.bug.findMany({
    where: testCaseId ? { testCaseId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      testCase: { select: { id: true, tcId: true, title: true, expectedResult: true } },
      suite: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      testRunResult: {
        select: { run: { select: { id: true, name: true, environment: true } } },
      },
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
      status: normalizeBugStatus(b.status),
      severity: b.severity,
      environment: b.environment,
      expectedResult: b.expectedResult,
      externalLink: b.externalLink,
      createdAt: b.createdAt.toISOString(),
      resolvedAt: b.resolvedAt?.toISOString() ?? null,
      testCase: b.testCase,
      suite: b.suite,
      project: b.project,
      run: b.testRunResult?.run ?? null,
      createdBy: b.createdBy,
      attachments: await toAttachmentItems(b.attachments, urlMap),
      sourceType: b.testCaseId ? "EXECUTION" : "GENERAL_FINDING",
    }))
  );

  return NextResponse.json({
    bugs: rows,
    canAttach: apiRoleAtLeast(user.role, "QA"),
  } satisfies BugsPayload);
}

export const dynamic = "force-dynamic";
