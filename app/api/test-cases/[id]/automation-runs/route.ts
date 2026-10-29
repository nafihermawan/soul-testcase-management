import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type { AutomationRunsPayload } from "@/types/api";

/**
 * GET /api/test-cases/[id]/automation-runs?offset=0&limit=5
 *
 * Riwayat run automation per test case, dipaginasi (terbaru dulu) supaya tab
 * Automation cukup memuat 5 baris pertama lalu menambah saat "Tampilkan lagi".
 * `total`/`passed`/`failed` dihitung dari SELURUH riwayat (bukan halaman).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await apiSession();
  if (!user) return json401();

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 5));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const link = await prisma.automationLink.findUnique({
    where: { testCaseId: params.id },
    select: { id: true },
  });

  if (!link) {
    return NextResponse.json({
      runs: [],
      total: 0,
      passed: 0,
      failed: 0,
    } satisfies AutomationRunsPayload);
  }

  const [runs, total, passed, failed] = await Promise.all([
    prisma.automationRun.findMany({
      where: { automationLinkId: link.id },
      orderBy: { ranAt: "desc" },
      skip: offset,
      take: limit,
      select: { id: true, status: true, ranAt: true },
    }),
    prisma.automationRun.count({ where: { automationLinkId: link.id } }),
    prisma.automationRun.count({ where: { automationLinkId: link.id, status: "PASS" } }),
    prisma.automationRun.count({ where: { automationLinkId: link.id, status: "FAIL" } }),
  ]);

  return NextResponse.json({
    runs: runs.map((r) => ({ id: r.id, status: r.status, ranAt: r.ranAt.toISOString() })),
    total,
    passed,
    failed,
  } satisfies AutomationRunsPayload);
}

export const dynamic = "force-dynamic";
