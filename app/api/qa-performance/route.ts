import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401, json403 } from "@/lib/api-auth";
import { isQaLead } from "@/lib/qa-lead";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { performanceScore, periodRange, type PeriodMode } from "@/lib/qa-performance";
import type {
  QaPerformanceMember,
  QaPerformancePayload,
  QaPerformanceTotals,
} from "@/types/api";

/** Status hasil eksekusi yang dihitung sebagai "sudah dieksekusi". */
const EXECUTED_STATUSES = ["PASS", "FAIL", "BLOCKED", "SKIPPED"] as const;

function toYear(value: string | null): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return null;
  return n;
}

/**
 * Agregasi performa per member QA untuk satu periode (quarter/tahun).
 *
 * Sumber tiap metrik memakai timestamp PERISTIWANYA sendiri:
 * - run ditugaskan  → TestRunAssignee.createdAt (join table) — di-filter lewat
 *   relasi `testRun.createdAt` agar "assigned runs" mengikuti periode run-nya.
 * - eksekusi        → TestRunResult.updatedAt (waktu modifikasi terakhir; tidak
 *   ada kolom executedAt di skema).
 * - bug dilaporkan  → Bug.createdAt (createdById = pelapor).
 * - run selesai     → TestRun.completedAt.
 *
 * Hanya Lead QA (role QA + flag isQaLead) yang boleh membaca.
 */
export async function GET(request: Request) {
  const user = await apiSession();
  if (!user) return json401();
  if (!(await isQaLead(user.id))) {
    return json403("Halaman ini hanya untuk Lead QA.");
  }

  const params = new URL(request.url).searchParams;
  const mode: PeriodMode = params.get("mode") === "year" ? "year" : "quarter";
  const nowYear = new Date().getUTCFullYear();
  const year = toYear(params.get("year")) ?? nowYear;
  const rawQuarter = Number(params.get("quarter"));
  const quarter =
    Number.isInteger(rawQuarter) && rawQuarter >= 1 && rawQuarter <= 4
      ? rawQuarter
      : Math.floor(new Date().getUTCMonth() / 3) + 1;

  const { start, end, label } = periodRange(mode, year, quarter);
  const range = { gte: start, lt: end };

  const [
    qaUsers,
    assignedByUser,
    execRows,
    bugsByUser,
    completedRuns,
    reopenedRuns,
    firstRun,
    createdTcByUser,
    allTimeCreatedCases,
  ] = await Promise.all([
    // Member yang selalu ditampilkan: seluruh user role QA.
    prisma.user.findMany({
      where: { role: "QA" },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    // Assigned runs (multi-assignee) pada periode.
    prisma.testRunAssignee.groupBy({
      by: ["userId"],
      where: { testRun: { createdAt: range } },
      _count: { _all: true },
    }),
    // Eksekusi per orang per status — dasar Executed Cases & Pass Rate.
    prisma.testRunResult.groupBy({
      by: ["updatedById", "status"],
      where: {
        status: { in: [...EXECUTED_STATUSES] },
        updatedAt: range,
        updatedById: { not: null },
      },
      _count: { _all: true },
    }),
    // Bug yang dilaporkan pada periode.
    prisma.bug.groupBy({
      by: ["createdById"],
      where: { createdAt: range, createdById: { not: null } },
      _count: { _all: true },
    }),
    prisma.testRun.count({ where: { status: "COMPLETED", completedAt: range } }),
    prisma.testRun.count({ where: { status: "RE_OPEN", createdAt: range } }),
    // Tahun paling awal di data → pilihan filter.
    prisma.testRun.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    // Test case yang DIBUAT pada periode — dimensi authoring (bukan eksekusi).
    prisma.testCase.groupBy({
      by: ["createdById"],
      where: { createdAt: range, createdById: { not: null } },
      _count: { _all: true },
    }),
    // Total test case di sistem (seluruh waktu) — angka konteks di header tabel,
    // sengaja TIDAK ikut filter periode.
    prisma.testCase.count(),
  ]);

  // --- Kumpulkan angka per user ---------------------------------------------
  const stat = new Map<
    string,
    {
      assignedRuns: number;
      executed: number;
      passed: number;
      failed: number;
      bugs: number;
      created: number;
    }
  >();
  const ensure = (id: string) => {
    let s = stat.get(id);
    if (!s) {
      s = { assignedRuns: 0, executed: 0, passed: 0, failed: 0, bugs: 0, created: 0 };
      stat.set(id, s);
    }
    return s;
  };

  for (const row of assignedByUser) ensure(row.userId).assignedRuns = row._count._all;
  for (const row of execRows) {
    const id = row.updatedById;
    if (!id) continue;
    const s = ensure(id);
    s.executed += row._count._all;
    if (row.status === "PASS") s.passed = row._count._all;
    if (row.status === "FAIL") s.failed = row._count._all;
  }
  for (const row of bugsByUser) {
    const id = row.createdById;
    if (!id) continue;
    ensure(id).bugs = row._count._all;
  }
  for (const row of createdTcByUser) {
    const id = row.createdById;
    if (!id) continue;
    ensure(id).created = row._count._all;
  }

  // Nama/member tambahan: siapa pun yang punya aktivitas di periode ini, supaya
  // eksekusi oleh non-QA tidak hilang dari laporan.
  const knownIds = new Set(qaUsers.map((u) => u.id));
  const extraIds = Array.from(stat.keys()).filter((id) => !knownIds.has(id));
  const extraUsers =
    extraIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: extraIds } },
          select: { id: true, name: true, role: true },
        })
      : [];

  const membersRaw = [
    ...qaUsers,
    ...extraUsers.map((u) => ({ id: u.id, name: u.name, role: u.role })),
  ];

  const maxExecuted = Math.max(0, ...Array.from(stat.values()).map((s) => s.executed));
  const maxBugs = Math.max(0, ...Array.from(stat.values()).map((s) => s.bugs));

  const members: QaPerformanceMember[] = membersRaw
    .map((u) => {
      const s = stat.get(u.id) ?? {
        assignedRuns: 0,
        executed: 0,
        passed: 0,
        failed: 0,
        bugs: 0,
        created: 0,
      };
      const denom = s.passed + s.failed;
      const passRate = denom > 0 ? Math.round((s.passed / denom) * 100) : null;
      const { score, badge } = performanceScore({
        passRate,
        executed: s.executed,
        bugs: s.bugs,
        maxExecuted,
        maxBugs,
      });
      return {
        id: u.id,
        name: u.name,
        role: u.role as Role,
        roleLabel: ROLE_LABEL[u.role as Role] ?? u.role,
        assignedRuns: s.assignedRuns,
        executedCases: s.executed,
        createdCases: s.created,
        passRate,
        passed: s.passed,
        failed: s.failed,
        bugsFound: s.bugs,
        score,
        badge,
      };
    })
    // Member tanpa aktivitas apa pun tidak perlu ditampilkan.
    .filter((m) => m.assignedRuns + m.executedCases + m.createdCases + m.bugsFound > 0)
    .sort((a, b) => b.score - a.score || (a.name ?? "").localeCompare(b.name ?? ""));

  // --- Ringkasan periode ----------------------------------------------------
  let totalPassed = 0;
  let totalFailed = 0;
  let totalExecuted = 0;
  let totalBugs = 0;
  let totalCreated = 0;
  for (const s of Array.from(stat.values())) {
    totalPassed += s.passed;
    totalFailed += s.failed;
    totalExecuted += s.executed;
    totalBugs += s.bugs;
    totalCreated += s.created;
  }
  const totalDenom = totalPassed + totalFailed;

  const totals: QaPerformanceTotals = {
    executedCases: totalExecuted,
    createdCases: totalCreated,
    allTimeCreatedCases,
    passRate: totalDenom > 0 ? Math.round((totalPassed / totalDenom) * 100) : null,
    bugsReported: totalBugs,
    completedRuns,
    reopenedRuns,
  };

  const currentYear = new Date().getUTCFullYear();
  const earliestYear = firstRun?.createdAt.getUTCFullYear() ?? currentYear;
  const availableYears: number[] = [];
  for (let y = currentYear; y >= Math.min(earliestYear, currentYear); y -= 1) {
    availableYears.push(y);
  }

  const payload: QaPerformancePayload = {
    period: { mode, year, quarter: mode === "quarter" ? quarter : null, label },
    totals,
    members,
    availableYears,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
