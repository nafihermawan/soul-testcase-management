import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type {
  DashboardPayload,
  DashboardProjectMetric,
  DashboardRunItem,
  DashboardBugItem,
  DashboardSuiteCoverageItem,
} from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const [
    projects,
    tcByProject,
    autoByProject,
    runs,
    bugs,
    runStats,
    suites,
    testedResults,
  ] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, code: true, platform: true },
    }),
    // Total TC per project (via suite.projectId)
    prisma.testCase.groupBy({
      by: ["suiteId"],
      _count: { _all: true },
    }),
    // TC automated per project
    prisma.testCase.groupBy({
      by: ["suiteId"],
      where: {
        automation: { is: { status: { in: ["AUTOMATED", "FAILING", "UNSTABLE"] } } },
      },
      _count: { _all: true },
    }),
    prisma.testRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        project: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { results: true } },
      },
    }),
    prisma.bug.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { testCase: { select: { suite: { select: { projectId: true } } } } },
    }),
    prisma.testRunResult.groupBy({
      by: ["runId", "status"],
      _count: { _all: true },
    }),
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
    // TC yang pernah di-test: distinct testCaseId dengan hasil bukan NOT_RUN
    // pada run yang sudah COMPLETED.
    prisma.testRunResult.findMany({
      where: { status: { not: "NOT_RUN" }, run: { is: { status: "COMPLETED" } } },
      select: {
        testCaseId: true,
        testCase: { select: { suite: { select: { projectId: true } } } },
      },
    }),
  ]);

  // Map suiteId -> projectId
  const suiteProject = new Map(suites.map((s) => [s.id, s.projectId]));
  const projectEnv = new Map(projects.map((p) => [p.id, p.platform ?? null]));

  // Hitung total & automated TC per project
  const totalByProject = new Map<string, number>();
  const automatedByProject = new Map<string, number>();
  const updateProjectCount = (map: Map<string, number>, projectId: string, n: number) =>
    map.set(projectId, (map.get(projectId) ?? 0) + n);

  for (const r of tcByProject) {
    const pid = r.suiteId ? suiteProject.get(r.suiteId) : undefined;
    if (pid) updateProjectCount(totalByProject, pid, r._count._all);
  }
  for (const r of autoByProject) {
    const pid = r.suiteId ? suiteProject.get(r.suiteId) : undefined;
    if (pid) updateProjectCount(automatedByProject, pid, r._count._all);
  }

  // Pass rate per project: runs -> projectId -> results
  const runProject = new Map(runs.map((r) => [r.id, r.project.id]));
  const passByProject = new Map<string, number>();
  const execByProject = new Map<string, number>();
  for (const r of runStats) {
    const pid = runProject.get(r.runId);
    if (!pid) continue;
    if (r.status === "PASS") {
      passByProject.set(pid, (passByProject.get(pid) ?? 0) + r._count._all);
    }
    if (r.status !== "NOT_RUN") {
      execByProject.set(pid, (execByProject.get(pid) ?? 0) + r._count._all);
    }
  }

  // Bug counts per project (via testCase.suite.projectId; bugs tanpa TC masuk "all" saja)
  const openByProject = new Map<string, number>();
  const critByProject = new Map<string, number>();
  const highByProject = new Map<string, number>();
  for (const b of bugs) {
    const pid = b.testCase?.suite?.projectId;
    const isActive = b.status !== "CLOSED" && b.status !== "RESOLVED";
    if (!isActive) continue;
    if (b.status === "OPEN" || b.status === "IN_PROGRESS") {
      if (pid) openByProject.set(pid, (openByProject.get(pid) ?? 0) + 1);
    }
    if (pid && b.severity === "CRITICAL") critByProject.set(pid, (critByProject.get(pid) ?? 0) + 1);
    if (pid && b.severity === "HIGH") highByProject.set(pid, (highByProject.get(pid) ?? 0) + 1);
  }

  // Distinct TC yang pernah di-test (hasil != NOT_RUN pada run COMPLETED), per project
  const testedByProject = new Map<string, Set<string>>();
  for (const r of testedResults) {
    const pid = r.testCase?.suite?.projectId;
    if (!pid) continue;
    let set = testedByProject.get(pid);
    if (!set) {
      set = new Set();
      testedByProject.set(pid, set);
    }
    set.add(r.testCaseId);
  }

  const projectMetrics: DashboardProjectMetric[] = projects.map((p) => {
    const total = totalByProject.get(p.id) ?? 0;
    const automated = automatedByProject.get(p.id) ?? 0;
    const executed = execByProject.get(p.id) ?? 0;
    const passed = passByProject.get(p.id) ?? 0;
    return {
      projectId: p.id,
      environment: p.platform ?? null,
      totalTC: total,
      automatedTC: automated,
      testedTC: testedByProject.get(p.id)?.size ?? 0,
      coveragePct: total > 0 ? Math.round((automated / total) * 100) : 0,
      passRate: executed > 0 ? Math.round((passed / executed) * 100) : 0,
      executed,
      passed,
      openBugs: openByProject.get(p.id) ?? 0,
      criticalBugs: critByProject.get(p.id) ?? 0,
      highBugs: highByProject.get(p.id) ?? 0,
    };
  });

  const suiteCoverage: DashboardSuiteCoverageItem[] = suites.map((s) => {
    const total = s._count.testCases;
    const automated = autoByProject
      .filter((r) => r.suiteId === s.id)
      .reduce((sum, r) => sum + r._count._all, 0);
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      projectId: s.projectId,
      environment: projectEnv.get(s.projectId) ?? null,
      docUrl: s.docUrl,
      total,
      automated,
      coveragePct: total > 0 ? Math.round((automated / total) * 100) : 0,
    };
  });

  const runItems: DashboardRunItem[] = runs.map((r) => ({
    id: r.id,
    name: r.name,
    project: r.project.name,
    projectId: r.project.id,
    environment: projectEnv.get(r.project.id) ?? null,
    status: r.status,
    executedBy: r.createdBy?.name ?? "—",
    total: r._count.results,
    createdAt: r.createdAt.toISOString(),
  }));

  const bugItems: DashboardBugItem[] = bugs.map((b) => ({
    id: b.id,
    title: b.title,
    severity: b.severity ?? "",
    status: b.status,
    projectId: b.testCase?.suite?.projectId ?? null,
    environment:
      (b.testCase?.suite?.projectId && projectEnv.get(b.testCase.suite.projectId)) ?? null,
    createdAt: b.createdAt.toISOString(),
  }));

  const payload: DashboardPayload = {
    user: { name: user.name, email: user.email, image: user.image },
    projectMetrics,
    runs: runItems,
    bugs: bugItems,
    suiteCoverage,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
