import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import { emptyCounts, type ExecutionCounts, type RunResultStatus } from "@/lib/qa-metrics";
import type {
  DashboardPayload,
  DashboardRunItem,
  DashboardBugItem,
  DashboardSuiteCoverageItem,
} from "@/types/api";

/** Batas daftar run terbaru di dashboard (bagian "recent" + action required). */
const RECENT_RUN_LIMIT = 100;

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const [projects, tcBySuite, autoBySuite, runs, bugs, runStats, suites, latestResults] =
    await Promise.all([
      prisma.project.findMany({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, code: true, platform: true },
      }),
      // Total TC per suite
      prisma.testCase.groupBy({ by: ["suiteId"], _count: { _all: true } }),
      // TC automated per suite
      prisma.testCase.groupBy({
        by: ["suiteId"],
        where: { automation: { is: { status: { in: ["AUTOMATED", "FAILING", "UNSTABLE"] } } } },
        _count: { _all: true },
      }),
      prisma.testRun.findMany({
        orderBy: { createdAt: "desc" },
        take: RECENT_RUN_LIMIT,
        include: {
          project: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
          _count: { select: { results: true } },
          results: { select: { testCase: { select: { suiteId: true } } } },
        },
      }),
      prisma.bug.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          testCase: {
            select: {
              suite: {
                select: {
                  id: true,
                  name: true,
                  projectId: true,
                  project: { select: { platform: true } },
                },
              },
            },
          },
          testRunResult: { select: { run: { select: { environment: true } } } },
        },
      }),
      // Distribusi hasil per run (untuk progress tiap run)
      prisma.testRunResult.groupBy({ by: ["runId", "status"], _count: { _all: true } }),
      prisma.suite.findMany({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          projectId: true,
          docUrl: true,
          _count: { select: { testCases: true } },
        },
      }),
      // Hasil TERAKHIR tiap TC pada run COMPLETED -> distribusi status per suite
      // tanpa double counting lintas run.
      prisma.testRunResult.findMany({
        where: { run: { is: { status: "COMPLETED" } } },
        orderBy: { updatedAt: "desc" },
        select: {
          testCaseId: true,
          status: true,
          testCase: { select: { suiteId: true } },
        },
      }),
    ]);

  const platformByProject = new Map(projects.map((p) => [p.id, p.platform ?? null]));

  // --- total & automated TC per suite ---
  const totalBySuite = new Map<string, number>();
  for (const r of tcBySuite) {
    if (!r.suiteId) continue;
    totalBySuite.set(r.suiteId, (totalBySuite.get(r.suiteId) ?? 0) + r._count._all);
  }
  const automatedBySuite = new Map<string, number>();
  for (const r of autoBySuite) {
    if (!r.suiteId) continue;
    automatedBySuite.set(r.suiteId, (automatedBySuite.get(r.suiteId) ?? 0) + r._count._all);
  }

  // --- distribusi status per suite (latest result per TC) ---
  // Mulai dari semua TC = NOT_RUN, lalu timpa dengan hasil terakhir yang ditemukan.
  const countsBySuite = new Map<string, ExecutionCounts>();
  const seenTestCase = new Set<string>();

  // Inisialisasi per suite memakai jumlah TC-nya (semuanya NOT_RUN di awal).
  for (const s of suites) {
    const c = emptyCounts();
    c.notRun = totalBySuite.get(s.id) ?? 0;
    c.total = c.notRun;
    countsBySuite.set(s.id, c);
  }

  for (const res of latestResults) {
    if (seenTestCase.has(res.testCaseId)) continue; // hanya hasil terbaru per TC
    seenTestCase.add(res.testCaseId);
    const suiteId = res.testCase?.suiteId;
    if (!suiteId) continue;
    const c = countsBySuite.get(suiteId);
    if (!c) continue;
    const status = res.status as RunResultStatus;
    if (status === "NOT_RUN") continue;
    // TC ini punya hasil -> pindahkan dari notRun ke bucket statusnya.
    if (c.notRun > 0) c.notRun--;
    if (status === "PASS") c.passed++;
    else if (status === "FAIL") c.failed++;
    else if (status === "BLOCKED") c.blocked++;
    else if (status === "SKIPPED") c.skipped++;
    c.executed++;
  }

  const suiteCoverage: DashboardSuiteCoverageItem[] = suites.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    projectId: s.projectId,
    platform: platformByProject.get(s.projectId) ?? null,
    docUrl: s.docUrl,
    total: totalBySuite.get(s.id) ?? 0,
    automated: automatedBySuite.get(s.id) ?? 0,
    counts: countsBySuite.get(s.id) ?? emptyCounts(),
  }));

  // --- distribusi hasil per run ---
  const countsByRun = new Map<string, ExecutionCounts>();
  for (const r of runStats) {
    const c = countsByRun.get(r.runId) ?? emptyCounts();
    const n = r._count._all;
    const status = r.status as RunResultStatus;
    c.total += n;
    if (status === "PASS") c.passed += n;
    else if (status === "FAIL") c.failed += n;
    else if (status === "BLOCKED") c.blocked += n;
    else if (status === "SKIPPED") c.skipped += n;
    else c.notRun += n;
    if (status !== "NOT_RUN") c.executed += n;
    countsByRun.set(r.runId, c);
  }

  const runItems: DashboardRunItem[] = runs.map((r) => {
    const suiteIds = Array.from(
      new Set(r.results.map((res) => res.testCase?.suiteId).filter((id): id is string => !!id))
    );
    return {
      id: r.id,
      name: r.name,
      project: r.project.name,
      projectId: r.project.id,
      platform: platformByProject.get(r.project.id) ?? null,
      environment: r.environment ?? null,
      status: r.status,
      executedBy: r.createdBy?.name ?? "—",
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      suiteIds,
      counts: countsByRun.get(r.id) ?? emptyCounts(),
    };
  });

  const bugItems: DashboardBugItem[] = bugs.map((b) => {
    const suite = b.testCase?.suite ?? null;
    return {
      id: b.id,
      title: b.title,
      severity: b.severity ?? "",
      status: b.status,
      projectId: suite?.projectId ?? null,
      platform: suite ? platformByProject.get(suite.projectId) ?? null : null,
      environment: b.testRunResult?.run?.environment ?? null,
      suiteId: suite?.id ?? null,
      suiteName: suite?.name ?? null,
      createdAt: b.createdAt.toISOString(),
    };
  });

  const payload: DashboardPayload = {
    user: { name: user.name, email: user.email, image: user.image },
    runs: runItems,
    bugs: bugItems,
    suiteCoverage,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
