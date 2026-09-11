import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCodeOf, monthRangeToDateRange } from "@/lib/format";
import { OPEN_RUN_STATUSES } from "@/lib/run-status";
import { apiSession, apiRoleAtLeast, json401 } from "@/lib/api-auth";
import type { ActiveRunsPayload, ActiveRunRow } from "@/types/api";


export async function GET(req: NextRequest) {
  const user = await apiSession();
  if (!user) return json401();

  // Params filter (pola sama dengan history)
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const platformList = (sp.get("platforms") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const projectList = (sp.get("projects") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const legacyProject = (sp.get("project") ?? "").trim();
  const allProjectIds = legacyProject
    ? [legacyProject, ...projectList.filter((p) => p !== legacyProject)]
    : projectList;
  // Rentang bulan "YYYY-MM" (from & to inklusif).
  const monthRange = monthRangeToDateRange(sp.get("from"), sp.get("to"));

  const allProjects = await prisma.project.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, platform: true },
  });

  // Active Runs = semua yang BELUM SELESAI (PENDING + IN_PROGRESS + RE_OPEN).
  const where: Record<string, unknown> = { status: { in: OPEN_RUN_STATUSES } };
  const andClauses: Record<string, unknown>[] = [];
  if (q) {
    andClauses.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { id: { contains: q.replace(/^run-\d+-/i, ""), mode: "insensitive" } },
      ],
    });
  }
  if (platformList.length > 0) {
    andClauses.push({
      OR: platformList.map((p) => ({ platforms: { contains: p, mode: "insensitive" as const } })),
    });
  }
  if (allProjectIds.length > 0) {
    andClauses.push({
      results: {
        some: { testCase: { suite: { projectId: { in: allProjectIds } } } },
      },
    });
  }
  if (monthRange) {
    andClauses.push({ createdAt: { gte: monthRange.gte, lt: monthRange.lt } });
  }
  if (andClauses.length > 0) where.AND = andClauses;

  // Full list: seluruh run aktif dikirim sekaligus (halaman Active Runs tidak
  // memakai pagination — semua run tampil di dalam grup statusnya).
  const runs = await prisma.testRun.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { results: true } },
      results: {
        select: {
          testCase: {
            select: {
              suite: {
                select: {
                  id: true,
                  name: true,
                  projectId: true,
                  project: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Pass rate per run
  const runStats = await prisma.testRunResult.groupBy({
    by: ["runId", "status"],
    _count: { _all: true },
  });
  const statsByRun = new Map<string, Record<string, number>>();
  for (const r of runStats) {
    const cur = statsByRun.get(r.runId) ?? {};
    cur[r.status] = r._count._all;
    statsByRun.set(r.runId, cur);
  }

  // Metadata per run: projects & suites unik (via testCase.suite)
  const metaByRun = new Map<
    string,
    { projects: { id: string; name: string }[]; suites: { id: string; name: string }[] }
  >();
  for (const run of runs) {
    const projectMap = new Map<string, string>();
    const suiteMap = new Map<string, string>();
    for (const r of run.results) {
      const suite = r.testCase?.suite;
      if (!suite) continue;
      if (!projectMap.has(suite.projectId)) projectMap.set(suite.projectId, suite.project.name);
      if (!suiteMap.has(suite.id)) suiteMap.set(suite.id, suite.name);
    }
    metaByRun.set(run.id, {
      projects: Array.from(projectMap.entries()).map(([id, name]) => ({ id, name })),
      suites: Array.from(suiteMap.entries()).map(([id, name]) => ({ id, name })),
    });
  }

  const rows: ActiveRunRow[] = runs.map((run) => {
    const stats = statsByRun.get(run.id) ?? {};
    const total = run._count.results;
    const passed = stats.PASS ?? 0;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const meta = metaByRun.get(run.id);
    return {
      id: run.id,
      runCode: runCodeOf({ id: run.id, sprint: run.sprint, createdAt: run.createdAt }),
      name: run.name,
      projects: meta?.projects ?? [],
      suites: meta?.suites ?? [],
      sprint: run.sprint,
      status: run.status,
      pct,
      createdByName: run.createdBy?.name ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  });

  const payload: ActiveRunsPayload = {
    runs: rows,
    canEdit: apiRoleAtLeast(user.role, "QA"),
    allProjects,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
