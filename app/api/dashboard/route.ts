import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { apiSession, json401 } from "@/lib/api-auth";
import type { ExecutionCounts } from "@/lib/qa-metrics";
import { EXECUTED_RUN_STATUSES } from "@/lib/run-status";
import type {
  DashboardPayload,
  DashboardRunItem,
  DashboardBugItem,
  DashboardSuiteCoverageItem,
  PlatformCode,
} from "@/types/api";

/** Batas daftar run terbaru di dashboard (bagian "recent" + action required). */
const RECENT_RUN_LIMIT = 100;
/** Batas daftar bug terbaru yang dikirim ke dashboard. */
const RECENT_BUG_LIMIT = 200;

/** `COUNT(*)` dari Postgres bertipe bigint -> dinormalisasi ke number. */
const n = (v: number | bigint | string | null | undefined): number => Number(v ?? 0);

type SuiteAggRow = {
  project_id: string;
  platform: string | null;
  suite_id: string;
  suite_name: string;
  suite_code: string;
  doc_url: string | null;
  total_tc: number | bigint;
  automated: number | bigint;
  passed: number | bigint;
  failed: number | bigint;
  blocked: number | bigint;
  skipped: number | bigint;
  last_executed_at: Date | null;
};

type RunAggRow = {
  id: string;
  name: string;
  status: string;
  environment: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  sprint: string | null;
  project_id: string;
  project_name: string;
  created_by_name: string | null;
  passed: number | bigint;
  failed: number | bigint;
  blocked: number | bigint;
  skipped: number | bigint;
  not_run: number | bigint;
  suite_ids: string[] | null;
};

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  // Dulu 8 query terpisah. Karena round-trip DB ~100ms dan parallelisme pooler
  // tidak menolong (lihat docs/AUDIT-Performa-Navigasi.md §6), agregasi
  // dipindah ke SQL supaya cukup 4 query dalam satu fase. Dua agregat kecil
  // (bug per severity & jumlah run) menyusul agar KPI tidak perlu menghitung
  // ulang dari daftar yang sudah dibatasi limit.
  const [projects, suiteAgg, runAgg, bugBySeverity, runTotal, bugs] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, code: true, platform: true },
    }),

    // Per-suite: total TC, jumlah TC automated, dan distribusi status dari
    // hasil TERAKHIR tiap TC pada run yang sudah tuntas. DISTINCT ON
    // menggantikan dedupe "hasil terakhir per TC" yang sebelumnya di Node.
    prisma.$queryRaw<SuiteAggRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (r."testCaseId") r."testCaseId", r."status", r."updatedAt"
        FROM "TestRunResult" r
        JOIN "TestRun" run ON run.id = r."runId"
        WHERE run."status"::text IN (${Prisma.join(EXECUTED_RUN_STATUSES)})
        ORDER BY r."testCaseId", r."updatedAt" DESC
      ),
      per_suite AS (
        SELECT tc."suiteId" AS suite_id,
               COUNT(*) FILTER (WHERE l."status"::text = 'PASS')    AS passed,
               COUNT(*) FILTER (WHERE l."status"::text = 'FAIL')    AS failed,
               COUNT(*) FILTER (WHERE l."status"::text = 'BLOCKED') AS blocked,
               COUNT(*) FILTER (WHERE l."status"::text = 'SKIPPED') AS skipped,
               MAX(l."updatedAt") AS last_executed_at
        FROM latest l
        JOIN "TestCase" tc ON tc.id = l."testCaseId"
        WHERE tc."suiteId" IS NOT NULL AND l."status"::text <> 'NOT_RUN'
        GROUP BY tc."suiteId"
      )
      SELECT p.id AS project_id, p.platform,
             s.id AS suite_id, s.name AS suite_name, s.code AS suite_code,
             s."docUrl" AS doc_url,
             COUNT(tc.id) AS total_tc,
             COUNT(a.id) FILTER (WHERE a."status"::text IN ('AUTOMATED','FAILING','UNSTABLE')) AS automated,
             COALESCE(ps.passed, 0) AS passed,
             COALESCE(ps.failed, 0) AS failed,
             COALESCE(ps.blocked, 0) AS blocked,
             COALESCE(ps.skipped, 0) AS skipped,
             ps.last_executed_at
      FROM "Suite" s
      JOIN "Project" p ON p.id = s."projectId"
      LEFT JOIN "TestCase" tc ON tc."suiteId" = s.id
      LEFT JOIN "AutomationLink" a ON a."testCaseId" = tc.id
      LEFT JOIN per_suite ps ON ps.suite_id = s.id
      GROUP BY p.id, s.id, ps.passed, ps.failed, ps.blocked, ps.skipped, ps.last_executed_at
      ORDER BY s."order" ASC, s."createdAt" ASC
    `,

    // Run terbaru sekaligus distribusi hasilnya + suite unik yang terlibat,
    // dalam satu query (sebelumnya: satu findMany + satu groupBy seluruh tabel).
    prisma.$queryRaw<RunAggRow[]>`
      WITH recent AS (
        SELECT id, name, status, environment, "createdAt", "updatedAt", "completedAt",
               sprint, "projectId", "createdById"
        FROM "TestRun"
        ORDER BY "createdAt" DESC
        LIMIT ${RECENT_RUN_LIMIT}
      )
      SELECT run.id, run.name, run."status"::text AS status, run.environment,
             run."createdAt" AS created_at, run."updatedAt" AS updated_at,
             run."completedAt" AS completed_at, run.sprint,
             p.id AS project_id, p.name AS project_name,
             u.name AS created_by_name,
             COALESCE(stats.passed, 0)  AS passed,
             COALESCE(stats.failed, 0)  AS failed,
             COALESCE(stats.blocked, 0) AS blocked,
             COALESCE(stats.skipped, 0) AS skipped,
             COALESCE(stats.not_run, 0) AS not_run,
             suites.suite_ids
      FROM recent run
      JOIN "Project" p ON p.id = run."projectId"
      LEFT JOIN "User" u ON u.id = run."createdById"
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE r."status"::text = 'PASS')    AS passed,
               COUNT(*) FILTER (WHERE r."status"::text = 'FAIL')    AS failed,
               COUNT(*) FILTER (WHERE r."status"::text = 'BLOCKED') AS blocked,
               COUNT(*) FILTER (WHERE r."status"::text = 'SKIPPED') AS skipped,
               COUNT(*) FILTER (WHERE r."status"::text = 'NOT_RUN') AS not_run
        FROM "TestRunResult" r WHERE r."runId" = run.id
      ) stats ON true
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT tc."suiteId") AS suite_ids
        FROM "TestRunResult" r
        JOIN "TestCase" tc ON tc.id = r."testCaseId"
        WHERE r."runId" = run.id AND tc."suiteId" IS NOT NULL
      ) suites ON true
      ORDER BY run."createdAt" DESC
    `,

    // Agregat bug AKTIF (OPEN/IN_PROGRESS) per severity — dasar KPI "Open Bugs".
    // Dihitung terpisah dari daftar "recent bugs" yang dibatasi RECENT_BUG_LIMIT.
    prisma.bug.groupBy({
      by: ["severity"],
      where: { status: { notIn: ["CLOSED", "RESOLVED"] } },
      _count: { _all: true },
    }),

    // Jumlah SELURUH test run — daftar `runs` sendiri dibatasi RECENT_RUN_LIMIT,
    // jadi angka "Test runs" tidak boleh dihitung dari panjang array itu.
    prisma.testRun.count(),

    prisma.bug.findMany({
      // Card "Recent / Critical Bugs" hanya untuk bug yang masih butuh
      // perhatian: bug selesai (CLOSED) dan status legacy (RESOLVED) dibuang
      // di query, bukan cuma disembunyikan di UI.
      where: { status: { notIn: ["CLOSED", "RESOLVED"] } },
      orderBy: { createdAt: "desc" },
      take: RECENT_BUG_LIMIT,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        createdAt: true,
        // Sumber UTAMA: kolom milik bug sendiri. Bug ad-hoc tidak punya
        // testCase/testRunResult, jadi Module & Env-nya dulu kosong di sini.
        environment: true,
        suite: { select: { id: true, name: true, projectId: true } },
        // Fallback untuk data lama yang relasi barunya belum terisi.
        testCase: { select: { suite: { select: { id: true, name: true, projectId: true } } } },
        testRunResult: { select: { run: { select: { environment: true } } } },
      },
    }),
  ]);

  const platformByProject = new Map(projects.map((p) => [p.id, (p.platform ?? null) as PlatformCode | null]));

  const suiteCoverage: DashboardSuiteCoverageItem[] = suiteAgg.map((s) => {
    const total = n(s.total_tc);
    const passed = n(s.passed);
    const failed = n(s.failed);
    const blocked = n(s.blocked);
    const skipped = n(s.skipped);
    const counts: ExecutionCounts = {
      passed,
      failed,
      blocked,
      skipped,
      notRun: Math.max(total - (passed + failed + blocked + skipped), 0),
      total,
      executed: passed + failed + blocked + skipped,
    };
    return {
      id: s.suite_id,
      name: s.suite_name,
      code: s.suite_code,
      projectId: s.project_id,
      platform: (s.platform ?? null) as PlatformCode | null,
      docUrl: s.doc_url,
      total,
      automated: n(s.automated),
      counts,
      lastExecutedAt: s.last_executed_at ? s.last_executed_at.toISOString() : null,
    };
  });

  const runItems: DashboardRunItem[] = runAgg.map((r) => {
    const counts: ExecutionCounts = {
      passed: n(r.passed),
      failed: n(r.failed),
      blocked: n(r.blocked),
      skipped: n(r.skipped),
      notRun: n(r.not_run),
      total:
        n(r.passed) + n(r.failed) + n(r.blocked) + n(r.skipped) + n(r.not_run),
      executed: n(r.passed) + n(r.failed) + n(r.blocked) + n(r.skipped),
    };
    return {
      id: r.id,
      name: r.name,
      project: r.project_name,
      projectId: r.project_id,
      platform: platformByProject.get(r.project_id) ?? null,
      environment: r.environment ?? null,
      status: r.status as DashboardRunItem["status"],
      sprint: r.sprint ?? null,
      executedBy: r.created_by_name ?? "—",
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      suiteIds: r.suite_ids ?? [],
      counts,
    };
  });

  const bugItems: DashboardBugItem[] = bugs.map((b) => {
    // Kolom bug sendiri lebih dulu; record terkait (TestCase/TestRun) hanya
    // fallback — sama seperti yang dipakai halaman Bugs.
    const suite = b.suite ?? b.testCase?.suite ?? null;
    return {
      id: b.id,
      title: b.title,
      severity: b.severity ?? "",
      status: b.status,
      projectId: suite?.projectId ?? null,
      platform: suite ? platformByProject.get(suite.projectId) ?? null : null,
      environment: b.environment ?? b.testRunResult?.run?.environment ?? null,
      suiteId: suite?.id ?? null,
      suiteName: suite?.name ?? null,
      createdAt: b.createdAt.toISOString(),
    };
  });

  const severityCount = (key: string) =>
    n(bugBySeverity.find((g) => (g.severity ?? "").toUpperCase() === key)?._count._all);
  const bugStats = {
    active: bugBySeverity.reduce((sum, g) => sum + n(g._count._all), 0),
    critical: severityCount("CRITICAL"),
    high: severityCount("HIGH"),
  };

  const payload: DashboardPayload = {
    user: { name: user.name, email: user.email, image: user.image },
    runs: runItems,
    bugs: bugItems,
    suiteCoverage,
    bugStats,
    runTotal,
  };

  return NextResponse.json(payload, {
    headers: {
      // Statistik selalu dihitung ulang dari DB — jangan pernah disajikan dari
      // cache browser / CDN / edge.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export const dynamic = "force-dynamic";
