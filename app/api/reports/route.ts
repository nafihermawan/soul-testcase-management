import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import {
  pct,
  TC_PRIORITY_LABEL,
  TC_PRIORITY_ORDER,
  TC_STATUS_LABEL,
  TC_STATUS_ORDER,
} from "@/lib/qa-metrics";
import { EXECUTED_RUN_STATUSES } from "@/lib/run-status";
import type {
  ReportsCompositionItem,
  ReportsPayload,
  ReportsSuiteGapItem,
  PlatformCode,
} from "@/types/api";

/**
 * GET /api/reports — laporan INVENTARIS test case & celah coverage.
 *
 * Semua angka inventaris dihitung dari tabel TestCase (bukan baris hasil run),
 * dan "sudah di-test" memakai definisi yang sama dengan Dashboard: TC unik yang
 * punya hasil dengan status != NOT_RUN pada run yang sudah COMPLETED.
 */
export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const [
    projects,
    suites,
    tcByPriority,
    tcByStatus,
    tcTotal,
    tcOrphans,
    automatedCount,
    executedResults,
  ] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, platform: true },
    }),
    prisma.suite.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        projectId: true,
        _count: { select: { testCases: true } },
      },
    }),
    prisma.testCase.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.testCase.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.testCase.count(),
    // TC tanpa suite: tidak terhitung di ringkasan per-suite.
    prisma.testCase.findMany({
      where: { suiteId: null },
      orderBy: { tcId: "asc" },
      select: { id: true, tcId: true, title: true },
    }),
    prisma.testCase.count({
      where: { automation: { is: { status: { in: ["AUTOMATED", "FAILING", "UNSTABLE"] } } } },
    }),
    // TC unik yang pernah dieksekusi (status != NOT_RUN) pada run yang sudah
    // pernah tuntas (COMPLETED atau RE_OPEN — run yang dibuka ulang tetap
    // dihitung, agar angka coverage tidak turun palsu).
    prisma.testRunResult.findMany({
      where: { status: { not: "NOT_RUN" }, run: { is: { status: { in: EXECUTED_RUN_STATUSES } } } },
      select: { testCaseId: true, testCase: { select: { suiteId: true } } },
    }),
  ]);

  // Total hasil eksekusi apa pun statusnya (untuk noExecutionYet).
  const anyExecuted = await prisma.testRunResult.count({
    where: { status: { not: "NOT_RUN" } },
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));

  // --- "Tested" per suite: DISTINCT TC (eksekusi berulang tidak double-count) ---
  const testedBySuite = new Map<string, Set<string>>();
  for (const r of executedResults) {
    const suiteId = r.testCase?.suiteId;
    if (!suiteId) continue;
    let set = testedBySuite.get(suiteId);
    if (!set) {
      set = new Set();
      testedBySuite.set(suiteId, set);
    }
    set.add(r.testCaseId);
  }

  // --- Komposisi priority & status ---
  const priorityCount = new Map(tcByPriority.map((r) => [r.priority as string, r._count._all]));
  const statusCount = new Map(tcByStatus.map((r) => [r.status as string, r._count._all]));

  const priorityComposition: ReportsCompositionItem[] = TC_PRIORITY_ORDER.map((key) => ({
    key,
    label: TC_PRIORITY_LABEL[key] ?? key,
    count: priorityCount.get(key) ?? 0,
    pct: pct(priorityCount.get(key) ?? 0, tcTotal),
  }));

  const statusComposition: ReportsCompositionItem[] = TC_STATUS_ORDER.map((key) => ({
    key,
    label: TC_STATUS_LABEL[key] ?? key,
    count: statusCount.get(key) ?? 0,
    pct: pct(statusCount.get(key) ?? 0, tcTotal),
  }));

  // --- Celah coverage per suite (hanya suite yang punya TC) ---
  const coverageGap: ReportsSuiteGapItem[] = suites
    .filter((s) => s._count.testCases > 0)
    .map((s) => {
      const total = s._count.testCases;
      const tested = Math.min(testedBySuite.get(s.id)?.size ?? 0, total);
      const project = projectById.get(s.projectId);
      return {
        suiteId: s.id,
        name: s.name,
        projectId: s.projectId,
        projectName: project?.name ?? "—",
        platform: (project?.platform ?? null) as PlatformCode | null,
        total,
        tested,
        untested: Math.max(total - tested, 0),
      };
    });

  // --- Higienitas: suite tanpa TC ---
  const suitesWithoutTc = suites
    .filter((s) => s._count.testCases === 0)
    .map((s) => ({
      suiteId: s.id,
      name: s.name,
      projectId: s.projectId,
      projectName: projectById.get(s.projectId)?.name ?? "—",
    }));

  const inSuite = suites.reduce((sum, s) => sum + s._count.testCases, 0);
  // Disamakan persis dengan tabel celah coverage agar angkanya tidak beda.
  const untested = coverageGap.reduce((sum, s) => sum + s.untested, 0);

  const payload: ReportsPayload = {
    inventory: {
      totalTC: tcTotal,
      inSuite,
      suites: suites.length,
      projects: projects.length,
      untested,
      untestedPct: pct(untested, inSuite),
    },
    priorityComposition,
    statusComposition,
    coverageGap,
    automation: { automated: automatedCount, pct: pct(automatedCount, tcTotal) },
    suitesWithoutTc,
    orphanTc: tcOrphans.map((t) => ({ id: t.id, tcId: t.tcId, title: t.title })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      platform: (p.platform ?? null) as PlatformCode | null,
    })),
    noExecutionYet: anyExecuted === 0,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
