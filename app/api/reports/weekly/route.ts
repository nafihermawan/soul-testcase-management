import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import { runCodeOf } from "@/lib/format";
import {
  emptyCounts,
  passRateOf,
  pct,
  severityRank,
  type ExecutionCounts,
  type RunResultStatus,
} from "@/lib/qa-metrics";
import { OPEN_RUN_STATUSES } from "@/lib/run-status";
import type { WeeklyReportPayload, WeeklyReportTask } from "@/types/api";

/** Rentang laporan: N hari terakhir (termasuk hari ini). */
const REPORT_WINDOW_DAYS = 7;

/**
 * GET /api/reports/weekly — bahan laporan progres testing mingguan.
 *
 * - "Sedang berjalan": run yang belum selesai (PENDING/IN_PROGRESS/RE_OPEN).
 * - "Baru selesai"  : run COMPLETED yang completedAt-nya dalam 7 hari terakhir.
 *
 * Hanya metadata + angka ringkas per task; tidak ada daftar test case supaya
 * body email tetap pendek.
 */
export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const now = new Date();
  const windowStart = new Date(now.getTime() - REPORT_WINDOW_DAYS * 86_400_000);

  const [runningRuns, doneRuns] = await Promise.all([
    prisma.testRun.findMany({
      where: { status: { in: OPEN_RUN_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        _count: { select: { results: true } },
        results: { select: { status: true } },
      },
    }),
    prisma.testRun.findMany({
      where: { status: "COMPLETED", completedAt: { gte: windowStart } },
      orderBy: { completedAt: "desc" },
      include: {
        project: { select: { name: true } },
        _count: { select: { results: true } },
        results: { select: { status: true } },
      },
    }),
  ]);

  // Bug terbuka per run: bug aktif yang tertaut ke salah satu hasil run ini.
  const allRunIds = [...runningRuns.map((r) => r.id), ...doneRuns.map((r) => r.id)];
  const openBugsByRun = new Map<string, { total: number; criticalHigh: number }>();
  if (allRunIds.length > 0) {
    const bugs = await prisma.bug.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        testRunResult: { is: { runId: { in: allRunIds } } },
      },
      select: { severity: true, testRunResult: { select: { runId: true } } },
    });
    for (const b of bugs) {
      const runId = b.testRunResult?.runId;
      if (!runId) continue;
      const cur = openBugsByRun.get(runId) ?? { total: 0, criticalHigh: 0 };
      cur.total += 1;
      if (severityRank(b.severity) <= 1) cur.criticalHigh += 1;
      openBugsByRun.set(runId, cur);
    }
  }

  const toTask = (
    run: (typeof runningRuns)[number],
    bucket: "running" | "done"
  ): WeeklyReportTask => {
    const counts = emptyCounts();
    for (const r of run.results) {
      const s = r.status as RunResultStatus;
      counts.total += 1;
      if (s === "PASS") counts.passed += 1;
      else if (s === "FAIL") counts.failed += 1;
      else if (s === "BLOCKED") counts.blocked += 1;
      else if (s === "SKIPPED") counts.skipped += 1;
      else counts.notRun += 1;
      if (s !== "NOT_RUN") counts.executed += 1;
    }
    const bugs = openBugsByRun.get(run.id) ?? { total: 0, criticalHigh: 0 };
    return {
      id: run.id,
      runCode: runCodeOf({ id: run.id, sprint: run.sprint, createdAt: run.createdAt }),
      name: run.name,
      project: run.project.name,
      sprint: run.sprint,
      environment: run.environment,
      activityType: run.activityType,
      platforms: run.platforms,
      taskLink: run.taskLink,
      bucket,
      status: run.status,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      counts,
      progressPct: pct(counts.executed, counts.total),
      openBugs: bugs.total,
      criticalHighBugs: bugs.criticalHigh,
    };
  };

  const running = runningRuns.map((r) => toTask(r, "running"));
  const done = doneRuns.map((r) => toTask(r, "done"));

  const sumCounts = (tasks: WeeklyReportTask[]): ExecutionCounts =>
    tasks.reduce<ExecutionCounts>(
      (acc, t) => ({
        passed: acc.passed + t.counts.passed,
        failed: acc.failed + t.counts.failed,
        blocked: acc.blocked + t.counts.blocked,
        skipped: acc.skipped + t.counts.skipped,
        notRun: acc.notRun + t.counts.notRun,
        total: acc.total + t.counts.total,
        executed: acc.executed + t.counts.executed,
      }),
      emptyCounts()
    );

  const all = [...running, ...done];
  const totals = sumCounts(all);

  const payload: WeeklyReportPayload = {
    period: { from: windowStart.toISOString(), to: now.toISOString() },
    running,
    done,
    summary: {
      runningTasks: running.length,
      doneTasks: done.length,
      totalTC: totals.total,
      executed: totals.executed,
      passed: totals.passed,
      failed: totals.failed,
      openBugs: all.reduce((n, t) => n + t.openBugs, 0),
      passRate: passRateOf(totals),
    },
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
