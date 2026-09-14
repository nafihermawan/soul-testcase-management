import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { apiSession, apiRoleAtLeast, json401, json403 } from "@/lib/api-auth";
import type {
  AutomationPayload,
  AutomationProjectStat,
  AutomationRow,
  AutomationRowStatus,
  AutomationSummary,
  AutomationSuiteGroup,
  PlatformCode,
} from "@/types/api";

// Ambang umur data (hari) agar status dianggap "Stale" (mudah diubah).
const STALE_THRESHOLD_DAYS = 30;
const DEFAULT_PER_PAGE = 25;
const PER_PAGE_MIN = 10;
const PER_PAGE_MAX = 100;
// Status efektif yang dihitung dari AutomationLink + umur lastRunAt.
const STATUS_VALUES = new Set([
  "FAILING",
  "STALE",
  "UNSTABLE",
  "NOT_AUTOMATED",
  "AUTOMATED",
]);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const int = (v: number | bigint | string | null | undefined) => Number(v ?? 0);
const csv = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Status efektif AutomationLink dalam SQL. STALE = link AUTOMATED yang
 * lastRunAt-nya lebih tua dari STALE_THRESHOLD_DAYS. Ditaruh di SQL supaya
 * filter & order problem-first konsisten lintas halaman.
 */
const effStatusSql = Prisma.sql`CASE
  WHEN a.status::text = 'FAILING' THEN 'FAILING'
  WHEN a.status::text = 'AUTOMATED' AND a."lastRunAt" IS NOT NULL
       AND a."lastRunAt" < now() - make_interval(days => ${STALE_THRESHOLD_DAYS}::int) THEN 'STALE'
  WHEN a.status::text = 'UNSTABLE' THEN 'UNSTABLE'
  WHEN a.status IS NULL OR a.status::text = 'NOT_AUTOMATED' THEN 'NOT_AUTOMATED'
  ELSE 'AUTOMATED'
END`;

/** Problem-first: FAILING → STALE → UNSTABLE → NOT_AUTOMATED → AUTOMATED. */
const problemOrderSql = Prisma.sql`CASE
  WHEN a.status::text = 'FAILING' THEN 0
  WHEN a.status::text = 'AUTOMATED' AND a."lastRunAt" IS NOT NULL
       AND a."lastRunAt" < now() - make_interval(days => ${STALE_THRESHOLD_DAYS}::int) THEN 1
  WHEN a.status::text = 'UNSTABLE' THEN 2
  WHEN a.status IS NULL OR a.status::text = 'NOT_AUTOMATED' THEN 3
  ELSE 4
END`;

type AggRow = {
  gid: number;
  project_id: string | null;
  suite_id: string | null;
  total: number | bigint;
  automated: number | bigint;
  failing: number | bigint;
  stale: number | bigint;
  unstable: number | bigint;
  not_automated: number | bigint;
  suite_name: string | null;
  project_name: string | null;
  platform: string | null;
};

type RowRow = {
  id: string;
  tcId: string;
  title: string;
  project_id: string | null;
  project_name: string | null;
  platform: string | null;
  suite_id: string | null;
  suite_name: string | null;
  link_id: string | null;
  external_test_id: string | null;
  script_path: string | null;
  eff_status: string;
  last_run_at: Date | null;
  last_result: string | null;
  rows_total: number | bigint;
};

export async function GET(req: NextRequest) {
  const user = await apiSession();
  if (!user) return json401();
  // Role PRODUCT tidak boleh melihat halaman automation.
  if (user.role === "PRODUCT") return json403("Halaman automation tidak tersedia untuk role Anda.");

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const status = (sp.get("status") ?? "ALL").toUpperCase();
  const projectIds = csv(sp.get("projects"));
  const suiteIds = csv(sp.get("suites"));
  const suiteId = sp.get("suiteId")?.trim() || null;
  const perPage = clamp(Number(sp.get("perPage")) || DEFAULT_PER_PAGE, PER_PAGE_MIN, PER_PAGE_MAX);
  const page = Math.max(1, Number(sp.get("page")) || 1);

  // Baris diminta bila ada suiteId, atau bila client eksplisit mengirim
  // pagination (mode flat lintas suite). View collapsed (default) tidak
  // mengirim keduanya, sehingga payload tetap ringan.
  const wantsRows = suiteId !== null || sp.has("page") || sp.has("perPage");
  // suiteId = "all" -> semua suite (mode flat); selain itu batasi ke suite itu.
  const restrictSuiteId = suiteId && suiteId !== "all" ? suiteId : null;

  // Filter dasar yang berlaku untuk agregat MAUPUN baris.
  const conds: Prisma.Sql[] = [Prisma.sql`tc.status::text <> 'DEPRECATED'`];
  if (projectIds.length) conds.push(Prisma.sql`s."projectId" IN (${Prisma.join(projectIds)})`);
  if (suiteIds.length) conds.push(Prisma.sql`tc."suiteId" IN (${Prisma.join(suiteIds)})`);
  if (q) {
    const like = `%${q}%`;
    conds.push(
      Prisma.sql`(tc."tcId" ILIKE ${like} OR tc.title ILIKE ${like} OR a."externalTestId" ILIKE ${like} OR a."scriptPath" ILIKE ${like})`
    );
  }
  const baseWhere = Prisma.join(conds, " AND ");
  const hasStatus = STATUS_VALUES.has(status);
  // Di query agregat `eff_status` adalah kolom CTE; di query baris ia hanya
  // alias SELECT sehingga filternya mengulang ekspresi CASE.
  //
  // PENTING: penanda "tidak ada filter" harus `null`, BUKAN `Prisma.empty`.
  // `Prisma.empty` adalah objek yang selalu truthy, sehingga ternary
  // `${frag ? sql`WHERE ${frag}` : Prisma.empty}` tetap menempelkan kata kunci
  // (`WHERE `/`AND `) tanpa isi -> Postgres error "syntax error at or near GROUP".
  const statusFilterAgg = hasStatus ? Prisma.sql`f.eff_status = ${status}` : null;
  const statusFilterRows = hasStatus ? Prisma.sql`(${effStatusSql}) = ${status}` : null;

  // Query 1: daftar project untuk filter + kerangka coverage bar.
  // Query 2: agregat summary + projectStats + suiteGroups dalam SATU query
  //   (GROUPING SETS) supaya tidak ada 3 round-trip terpisah.
  // Query 3 (kondisional): halaman baris TC + rowsTotal via window function.
  // Ketiganya tidak saling bergantung -> dijalankan dalam satu fase paralel.
  const aggSql = Prisma.sql`
    WITH filtered AS (
      SELECT tc.id,
             s."projectId" AS project_id,
             tc."suiteId" AS suite_id,
             ${effStatusSql} AS eff_status
      FROM "TestCase" tc
      LEFT JOIN "Suite" s ON s.id = tc."suiteId"
      LEFT JOIN "AutomationLink" a ON a."testCaseId" = tc.id
      WHERE ${baseWhere}
    )
    SELECT GROUPING(f.project_id, f.suite_id)::int AS gid,
           f.project_id, f.suite_id,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE f.eff_status = 'AUTOMATED')::int AS automated,
           COUNT(*) FILTER (WHERE f.eff_status = 'FAILING')::int AS failing,
           COUNT(*) FILTER (WHERE f.eff_status = 'STALE')::int AS stale,
           COUNT(*) FILTER (WHERE f.eff_status = 'UNSTABLE')::int AS unstable,
           COUNT(*) FILTER (WHERE f.eff_status = 'NOT_AUTOMATED')::int AS not_automated,
           MIN(s.name) AS suite_name,
           MIN(p.name) AS project_name,
           MIN(p.platform::text) AS platform
    FROM filtered f
    LEFT JOIN "Suite" s ON s.id = f.suite_id
    LEFT JOIN "Project" p ON p.id = f.project_id
    ${statusFilterAgg ? Prisma.sql`WHERE ${statusFilterAgg}` : Prisma.empty}
    GROUP BY GROUPING SETS ((f.project_id, f.suite_id), (f.project_id), ())
  `;

  const rowsSql = wantsRows
    ? Prisma.sql`
        SELECT tc.id, tc."tcId", tc.title,
               s."projectId" AS project_id, p.name AS project_name, p.platform::text AS platform,
               tc."suiteId" AS suite_id, s.name AS suite_name,
               a.id AS link_id, a."externalTestId" AS external_test_id, a."scriptPath" AS script_path,
               ${effStatusSql} AS eff_status,
               a."lastRunAt" AS last_run_at, a."lastResult" AS last_result,
               COUNT(*) OVER ()::int AS rows_total
        FROM "TestCase" tc
        LEFT JOIN "Suite" s ON s.id = tc."suiteId"
        LEFT JOIN "Project" p ON p.id = s."projectId"
        LEFT JOIN "AutomationLink" a ON a."testCaseId" = tc.id
        WHERE ${baseWhere}
          ${restrictSuiteId ? Prisma.sql`AND tc."suiteId" = ${restrictSuiteId}` : Prisma.empty}
          ${statusFilterRows ? Prisma.sql`AND ${statusFilterRows}` : Prisma.empty}
        ORDER BY ${problemOrderSql}, tc.title ASC, tc."tcId" ASC
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
      `
    : null;

  const [projects, aggRows, rowRows] = await Promise.all([
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, platform: true },
    }),
    prisma.$queryRaw<AggRow[]>(aggSql),
    rowsSql ? prisma.$queryRaw<RowRow[]>(rowsSql) : Promise.resolve([] as RowRow[]),
  ]);

  // --- Pisahkan hasil GROUPING SETS (gid): 0=grup suite, 1=project, 3=total. ---
  let summary: AutomationSummary = {
    total: 0,
    automated: 0,
    failing: 0,
    stale: 0,
    unstable: 0,
    notAutomated: 0,
    coveragePct: 0,
  };
  const suiteGroups: AutomationSuiteGroup[] = [];
  const statByProject = new Map<
    string,
    { total: number; automated: number; failing: number; stale: number; unstable: number; notAutomated: number }
  >();

  for (const r of aggRows) {
    const counts = {
      total: int(r.total),
      automated: int(r.automated),
      failing: int(r.failing),
      stale: int(r.stale),
      unstable: int(r.unstable),
      notAutomated: int(r.not_automated),
    };
    if (int(r.gid) === 3) {
      summary = { ...counts, coveragePct: coveragePct(counts) };
    } else if (int(r.gid) === 1 && r.project_id) {
      statByProject.set(r.project_id, counts);
    } else if (r.suite_id && r.project_id) {
      suiteGroups.push({
        suiteId: r.suite_id,
        suiteName: r.suite_name ?? "Tanpa Suite",
        projectId: r.project_id,
        projectName: r.project_name ?? "—",
        platform: (r.platform as PlatformCode | null) ?? null,
        ...counts,
      });
    }
  }

  // suiteGroups problem-first: jumlah bermasalah (failing+stale+unstable) desc,
  // lalu total desc, lalu nama suite.
  suiteGroups.sort((a, b) => {
    const pa = a.failing + a.stale + a.unstable;
    const pb = b.failing + b.stale + b.unstable;
    if (pb !== pa) return pb - pa;
    if (b.total !== a.total) return b.total - a.total;
    return a.suiteName.localeCompare(b.suiteName);
  });

  const EMPTY = { total: 0, automated: 0, failing: 0, stale: 0, unstable: 0, notAutomated: 0 };
  const projectStats: AutomationProjectStat[] = projects.map((p) => {
    const s = statByProject.get(p.id) ?? EMPTY;
    return {
      projectId: p.id,
      name: p.name,
      platform: p.platform,
      ...s,
      coveragePct: coveragePct(s),
    };
  });

  const rows: AutomationRow[] = rowRows.map((r) => ({
    id: r.id,
    tcId: r.tcId,
    title: r.title,
    projectId: r.project_id,
    projectName: r.project_name ?? "—",
    platform: (r.platform as PlatformCode | null) ?? null,
    suiteId: r.suite_id,
    suiteName: r.suite_name ?? "Tanpa Suite",
    linkId: r.link_id,
    externalTestId: r.external_test_id,
    scriptPath: r.script_path,
    status: r.eff_status as AutomationRowStatus,
    lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
    lastResult: r.last_result,
  }));

  const payload: AutomationPayload = {
    projects: projects.map((p) => ({ id: p.id, name: p.name, platform: p.platform })),
    projectStats,
    summary,
    suiteGroups,
    rows,
    rowsTotal: rowRows.length > 0 ? int(rowRows[0].rows_total) : 0,
    page,
    perPage,
    canManage: apiRoleAtLeast(user.role, "QA"),
    canUpdateStatus: apiRoleAtLeast(user.role, "DEVELOPER"),
  };

  return NextResponse.json(payload);
}

/** Coverage = (automated + failing + stale + unstable) / total. */
function coveragePct(s: {
  total: number;
  automated: number;
  failing: number;
  stale: number;
  unstable: number;
}): number {
  if (s.total <= 0) return 0;
  return Math.round(((s.automated + s.failing + s.stale + s.unstable) / s.total) * 100);
}

export const dynamic = "force-dynamic";
