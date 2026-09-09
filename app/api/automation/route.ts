import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401, json403 } from "@/lib/api-auth";
import type {
  AutomationPayload,
  AutomationProjectStat,
  AutomationRow,
} from "@/types/api";

// Ambang umur data (hari) agar status dianggap "Stale" (mudah diubah).
const STALE_THRESHOLD_DAYS = 30;

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();
  // Role PRODUCT tidak boleh melihat halaman automation.
  if (user.role === "PRODUCT") return json403("Halaman automation tidak tersedia untuk role Anda.");

  // Semua project aktif (urut nama)
  const projects = await prisma.project.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, platform: true },
  });

  // Semua test case + automation link, join suite + project
  const tcs = await prisma.testCase.findMany({
    where: { status: { not: "DEPRECATED" } },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      suite: { select: { id: true, name: true, projectId: true } },
      automation: true,
    },
  });

  // Row representasi TC di tabel automation (termasuk yang belum punya link)
  const rows: AutomationRow[] = tcs.map((tc) => {
    const projectId = tc.suite?.projectId ?? null;
    const project = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
    const suiteId = tc.suite?.id ?? null;
    const suiteName = tc.suite?.name ?? null;
    const a = tc.automation;
    const linkStatus = a?.status ?? "NOT_AUTOMATED";
    const stale =
      linkStatus === "AUTOMATED" &&
      !!a?.lastRunAt &&
      Date.now() - new Date(a.lastRunAt).getTime() > STALE_THRESHOLD_DAYS * 86400000;
    return {
      id: tc.id,
      tcId: tc.tcId,
      title: tc.title,
      projectId,
      projectName: project?.name ?? "—",
      platform: project?.platform ?? null,
      suiteId,
      suiteName: suiteName ?? "Tanpa Suite",
      linkId: a?.id ?? null,
      externalTestId: a?.externalTestId ?? null,
      scriptPath: a?.scriptPath ?? null,
      status: stale ? ("STALE" as const) : linkStatus,
      lastRunAt: a?.lastRunAt ? a.lastRunAt.toISOString() : null,
      lastResult: a?.lastResult ?? null,
    };
  });

  // Hitung statistik per project untuk coverage bar & cards
  const projectStats: AutomationProjectStat[] = projects.map((p) => {
    const pRows = rows.filter((r) => r.projectId === p.id);
    const total = pRows.length;
    const automated = pRows.filter((r) => r.status === "AUTOMATED").length;
    const failing = pRows.filter((r) => r.status === "FAILING").length;
    const stale = pRows.filter((r) => r.status === "STALE").length;
    const unstable = pRows.filter((r) => r.status === "UNSTABLE").length;
    const notAutomated = pRows.filter(
      (r) => r.status === "NOT_AUTOMATED" || r.linkId === null
    ).length;
    return {
      projectId: p.id,
      name: p.name,
      platform: p.platform,
      total,
      automated,
      failing,
      stale,
      unstable,
      notAutomated,
      coveragePct:
        total > 0 ? Math.round(((automated + failing + stale + unstable) / total) * 100) : 0,
    };
  });

  // Semua suite yang dimiliki project (untuk filter dependent)
  const suiteSet = new Map<string, { id: string; name: string }>();
  for (const tc of tcs) {
    if (tc.suite) {
      if (!suiteSet.has(tc.suite.id)) {
        suiteSet.set(tc.suite.id, { id: tc.suite.id, name: tc.suite.name });
      }
    }
  }
  const suitesByProject = projects.map((p) => ({
    projectId: p.id,
    suites: Array.from(suiteSet.values()).filter(
      (s) =>
        tcs.some((tc) => tc.suite?.id === s.id && tc.suite?.projectId === p.id)
    ),
  }));

  const payload: AutomationPayload = {
    projects: projects.map((p) => ({ id: p.id, name: p.name, platform: p.platform })),
    suitesByProject,
    rows,
    projectStats,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
