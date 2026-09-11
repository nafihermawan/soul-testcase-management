import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCodeOf, monthRangeToDateRange } from "@/lib/format";
import { apiSession, apiRoleAtLeast, json401 } from "@/lib/api-auth";
import type { HistoryPayload, HistoryRunRow } from "@/types/api";


export async function GET(req: NextRequest) {
  const user = await apiSession();
  if (!user) return json401();

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
  // Sorting: default completed_at desc (semua run di sini berstatus COMPLETED,
  // jadi waktu selesai adalah urutan yang paling bermakna).
  const sortBy = sp.get("sort_by") === "created_at" ? "createdAt" : "completedAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  // `nulls` hanya berlaku untuk kolom nullable; createdAt non-nullable sehingga
  // memakai bentuk orderBy biasa.
  const orderBy =
    sortBy === "completedAt"
      ? { completedAt: { sort: order as "asc" | "desc", nulls: "last" as const } }
      : { createdAt: order as "asc" | "desc" };
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(100, Math.max(10, parseInt(sp.get("perPage") ?? "10", 10) || 10));

  const allProjects = await prisma.project.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, platform: true },
  });

  // Query where — kombinasi AND antar kriteria, OR di dalam kriteria
  const where: Record<string, unknown> = { status: "COMPLETED" };
  const andClauses: Record<string, unknown>[] = [];
  if (q) {
    andClauses.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { id: { contains: q.replace(/^RUN-\d+-/i, ""), mode: "insensitive" } },
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

  const [total, runs] = await Promise.all([
    prisma.testRun.count({ where }),
    prisma.testRun.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
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
    }),
  ]);

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

  const rows: HistoryRunRow[] = runs.map((run) => {
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
      platforms: run.platforms,
      sprint: run.sprint,
      status: run.status,
      pct,
      qaName: run.createdBy?.name ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  });

  // Count filter aktif (untuk label tombol)
  const activeCount =
    (platformList.length > 0 ? 1 : 0) +
    (allProjectIds.length > 0 ? 1 : 0) +
    (monthRange ? 1 : 0);

  const payload: HistoryPayload = {
    allProjects,
    runs: rows,
    total,
    page,
    perPage,
    activeCount,
    canDelete: apiRoleAtLeast(user.role, "QA"),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
