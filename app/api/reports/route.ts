import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type { ReportsPayload } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const [projects, tcBySuite, autoBySuite, runStats, runs] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, code: true },
    }),
    prisma.testCase.groupBy({
      by: ["suiteId"],
      _count: { _all: true },
    }),
    prisma.testCase.groupBy({
      by: ["suiteId"],
      where: {
        automation: { is: { status: { in: ["AUTOMATED", "FAILING", "UNSTABLE"] } } },
      },
      _count: { _all: true },
    }),
    prisma.testRunResult.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.testRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
  ]);

  const suites = await prisma.suite.findMany({
    select: { id: true, name: true, code: true, projectId: true },
  });
  const suiteName = new Map(suites.map((s) => [s.id, s.name]));

  // Total & automated TC per project
  const totalByProject = new Map<string, number>();
  const autoByProject = new Map<string, number>();
  const perSuite: { suiteId: string; total: number; automated: number }[] = [];

  const suiteTotals = new Map<string, number>();
  for (const r of tcBySuite) {
    if (r.suiteId) suiteTotals.set(r.suiteId, r._count._all);
  }
  const suiteAutos = new Map<string, number>();
  for (const r of autoBySuite) {
    if (r.suiteId) suiteAutos.set(r.suiteId, r._count._all);
  }

  for (const s of suites) {
    const total = suiteTotals.get(s.id) ?? 0;
    const automated = suiteAutos.get(s.id) ?? 0;
    perSuite.push({ suiteId: s.id, total, automated });
    const pid = s.projectId;
    totalByProject.set(pid, (totalByProject.get(pid) ?? 0) + total);
    autoByProject.set(pid, (autoByProject.get(pid) ?? 0) + automated);
  }

  // Pass rate global
  const statusCount: Record<string, number> = {};
  for (const r of runStats) statusCount[r.status] = r._count._all;
  const passed = statusCount.PASS ?? 0;
  const executed =
    (statusCount.PASS ?? 0) + (statusCount.FAIL ?? 0) + (statusCount.BLOCKED ?? 0) + (statusCount.SKIPPED ?? 0);
  const passRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  const payload: ReportsPayload = {
    summary: {
      totalTC: executed + (statusCount.NOT_RUN ?? 0),
      executed,
      passRate,
    },
    projects: projects.map((p) => {
      const total = totalByProject.get(p.id) ?? 0;
      const automated = autoByProject.get(p.id) ?? 0;
      return { id: p.id, name: p.name, total, automated, coveragePct: pct(automated, total) };
    }),
    suites: perSuite
      .filter((s) => s.total > 0)
      .map((s) => ({
        suiteId: s.suiteId,
        name: suiteName.get(s.suiteId) ?? s.suiteId,
        total: s.total,
        automated: s.automated,
        coveragePct: pct(s.automated, s.total),
      })),
    recentRuns: runs.map((r) => ({
      id: r.id,
      name: r.name,
      projectName: r.project.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
