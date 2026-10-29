import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401, json403 } from "@/lib/api-auth";
import type {
  AutomationAlertItem,
  AutomationCoverageProjectItem,
  AutomationDailyItem,
  AutomationMatrixCellState,
  AutomationMatrixItem,
  AutomationOverviewPayload,
  PlatformCode,
} from "@/types/api";

/**
 * GET /api/automation/overview?days=7|14|30&date=YYYY-MM-DD&limit=20
 *
 * Semua metrik halaman "Automation Coverage & Health" dihitung dari data yang
 * SUDAH ADA (AutomationRun = riwayat tiap eksekusi, AutomationLink = status per
 * TC, TestCase/Suite/Project = hitungan cakupan). Tidak ada kolom baru.
 *
 * Definisi:
 * - "run" = satu baris AutomationRun.
 * - Pass rate = PASS / total run (SKIPPED ikut di penyebut, sesuai spec).
 * - Failing sekarang = link dengan lastResult = 'FAIL'.
 * - Flaky = tidak sedang failing & ≥ 3 transisi PASS↔FAIL dalam rentang.
 * - Stale = lastRunAt kosong atau > 7 hari.
 * - Coverage = link status ≠ NOT_AUTOMATED / total TC.
 * - Bucket hari memakai WIB (UTC+7).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIB_MS = 7 * 60 * 60 * 1000;
const STALE_DAYS = 7;
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Tanggal "29 Okt 2026" (WIB) dari timestamp UTC. */
function fmtDate(d: Date): string {
  const w = new Date(d.getTime() + WIB_MS);
  return `${pad2(w.getUTCDate())} ${MONTHS_ID[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

/** Kunci tanggal WIB "YYYY-MM-DD" dari timestamp UTC. */
function wibDateKey(d: Date): string {
  const w = new Date(d.getTime() + WIB_MS);
  return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-${pad2(w.getUTCDate())}`;
}

/** Awal hari WIB (Y,M,D 0-based month) → instant UTC. */
function wibMidnightUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - WIB_MS);
}

const n = (v: number | bigint | string | null | undefined): number => Number(v ?? 0);
/** Persentase dengan 1 desimal (mis. 0.4 / 81.3) — client memformat tampilannya. */
const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

type RunRow = {
  test_case_id: string;
  tc_id: string;
  title: string;
  status: string;
  ran_at: Date;
};

type LinkRow = {
  test_case_id: string;
  tc_id: string;
  title: string;
  last_result: string | null;
  last_run_at: Date | null;
};

type DayRunRow = {
  id: string;
  ran_at: Date;
  status: string;
  test_case_id: string;
  tc_id: string;
  title: string;
  project: string | null;
  suite: string | null;
};

type ProjectRow = {
  project_id: string;
  name: string;
  platform: string | null;
  total: number | bigint;
  automated: number | bigint;
};

function emptyPayload(days: number, from: Date, to: Date, date: string): AutomationOverviewPayload {
  const daily: AutomationDailyItem[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i));
    daily.push({ date: wibDateKey(new Date(d.getTime() + WIB_MS)), passed: 0, failed: 0, total: 0, passRate: null });
  }
  return {
    range: { days, from: wibDateKey(from), to: wibDateKey(to) },
    kpi: {
      passRate: null,
      passRatePrev: null,
      totalRuns: 0,
      totalRunsPrev: 0,
      failed: 0,
      failedPrev: 0,
      failingNow: 0,
      flaky: 0,
      coverage: { automated: 0, total: 0, pct: null },
    },
    daily,
    alerts: { failing: [], flaky: [], stale: [] },
    matrix: { items: [], hiddenCount: 0 },
    day: { date, runs: [] },
    coverageByProject: [],
    hiddenProjects: 0,
  };
}

export async function GET(req: NextRequest) {
  const user = await apiSession();
  if (!user) return json401();
  if (user.role === "PRODUCT") return json403("Halaman automation tidak tersedia untuk role Anda.");

  const sp = req.nextUrl.searchParams;
  const rawDays = Number(sp.get("days"));
  const days = rawDays === 7 || rawDays === 14 || rawDays === 30 ? rawDays : 14;
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 20));

  // "Sekarang" dalam WIB.
  const nowWib = new Date(Date.now() + WIB_MS);
  const Y = nowWib.getUTCFullYear();
  const M = nowWib.getUTCMonth();
  const D = nowWib.getUTCDate();
  const todayKey = `${Y}-${pad2(M + 1)}-${pad2(D)}`;

  const rawSelected = (sp.get("date") ?? "").trim();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawSelected) ? rawSelected : todayKey;

  const start = wibMidnightUtc(Y, M, D - (days - 1));
  const end = wibMidnightUtc(Y, M, D + 1);
  const prevStart = wibMidnightUtc(Y, M, D - (2 * days - 1));

  // Bounds hari terpilih (bisa di luar rentang; tetap valid).
  const [sy, sm, sd] = selectedDate.split("-").map(Number);
  const dayStart = wibMidnightUtc(sy, sm - 1, sd);
  const dayEnd = wibMidnightUtc(sy, sm - 1, sd + 1);

  // Kunci tanggal seluruh rentang (termasuk hari tanpa run).
  const dailyKeys: string[] = [];
  for (let i = 0; i < days; i++) {
    dailyKeys.push(wibDateKey(new Date(Date.UTC(Y, M, D - (days - 1) + i) + WIB_MS)));
  }

  try {
    const [runs, kpiRows, links, failingNowRows, dayRuns, projects, totalTc, automatedTc] =
      await Promise.all([
        // Seluruh run dalam rentang (dipakai untuk daily, transisi/flaky, matriks).
        prisma.$queryRaw<RunRow[]>`
          SELECT l."testCaseId" AS test_case_id, tc."tcId" AS tc_id, tc."title" AS title,
                 r."status" AS status, r."ranAt" AS ran_at
          FROM "AutomationRun" r
          JOIN "AutomationLink" l ON l.id = r."automationLinkId"
          JOIN "TestCase" tc ON tc.id = l."testCaseId"
          WHERE r."ranAt" >= ${start} AND r."ranAt" < ${end}
          ORDER BY l."testCaseId" ASC, r."ranAt" ASC
        `,
        // KPI aktif + periode pembanding dalam satu query.
        prisma.$queryRaw<
          {
            cur_total: number | bigint;
            cur_passed: number | bigint;
            cur_failed: number | bigint;
            prev_total: number | bigint;
            prev_passed: number | bigint;
            prev_failed: number | bigint;
          }[]
        >`
          SELECT
            COUNT(*) FILTER (WHERE "ranAt" >= ${start} AND "ranAt" < ${end})::int AS cur_total,
            COUNT(*) FILTER (WHERE "ranAt" >= ${start} AND "ranAt" < ${end} AND "status" = 'PASS')::int AS cur_passed,
            COUNT(*) FILTER (WHERE "ranAt" >= ${start} AND "ranAt" < ${end} AND "status" = 'FAIL')::int AS cur_failed,
            COUNT(*) FILTER (WHERE "ranAt" >= ${prevStart} AND "ranAt" < ${start})::int AS prev_total,
            COUNT(*) FILTER (WHERE "ranAt" >= ${prevStart} AND "ranAt" < ${start} AND "status" = 'PASS')::int AS prev_passed,
            COUNT(*) FILTER (WHERE "ranAt" >= ${prevStart} AND "ranAt" < ${start} AND "status" = 'FAIL')::int AS prev_failed
          FROM "AutomationRun"
        `,
        // Semua TC automated (termasuk yang tidak punya run di rentang).
        prisma.$queryRaw<LinkRow[]>`
          SELECT l."testCaseId" AS test_case_id, tc."tcId" AS tc_id, tc."title" AS title,
                 l."lastResult" AS last_result, l."lastRunAt" AS last_run_at
          FROM "AutomationLink" l
          JOIN "TestCase" tc ON tc.id = l."testCaseId"
          WHERE l."status" <> 'NOT_AUTOMATED'
        `,
        prisma.$queryRaw<{ n: number | bigint }[]>`
          SELECT COUNT(*)::int AS n FROM "AutomationLink" WHERE "lastResult" = 'FAIL'
        `,
        // Detail run pada hari terpilih.
        prisma.$queryRaw<DayRunRow[]>`
          SELECT r.id, r."ranAt" AS ran_at, r."status" AS status,
                 l."testCaseId" AS test_case_id, tc."tcId" AS tc_id, tc."title" AS title,
                 p.name AS project, s.name AS suite
          FROM "AutomationRun" r
          JOIN "AutomationLink" l ON l.id = r."automationLinkId"
          JOIN "TestCase" tc ON tc.id = l."testCaseId"
          LEFT JOIN "Suite" s ON s.id = tc."suiteId"
          LEFT JOIN "Project" p ON p.id = s."projectId"
          WHERE r."ranAt" >= ${dayStart} AND r."ranAt" < ${dayEnd}
          ORDER BY r."ranAt" DESC
        `,
        // Coverage per project.
        prisma.$queryRaw<ProjectRow[]>`
          SELECT p.id AS project_id, p.name AS name, p.platform::text AS platform,
                 COUNT(DISTINCT tc.id)::int AS total,
                 COUNT(DISTINCT tc.id) FILTER (
                   WHERE l."status" IS NOT NULL AND l."status" <> 'NOT_AUTOMATED'
                 )::int AS automated
          FROM "Project" p
          LEFT JOIN "Suite" s ON s."projectId" = p.id
          LEFT JOIN "TestCase" tc ON tc."suiteId" = s.id
          LEFT JOIN "AutomationLink" l ON l."testCaseId" = tc.id
          GROUP BY p.id, p.name, p.platform
          ORDER BY total DESC, p.name ASC
        `,
        prisma.testCase.count(),
        prisma.automationLink.count({ where: { status: { not: "NOT_AUTOMATED" } } }),
      ]);

    // ---------- Daily ----------
    const dailyMap = new Map<string, { passed: number; failed: number; total: number }>();
    for (const r of runs) {
      const key = wibDateKey(r.ran_at);
      const cur = dailyMap.get(key) ?? { passed: 0, failed: 0, total: 0 };
      cur.total += 1;
      if (r.status === "PASS") cur.passed += 1;
      else if (r.status === "FAIL") cur.failed += 1;
      dailyMap.set(key, cur);
    }
    const daily: AutomationDailyItem[] = dailyKeys.map((date) => {
      const c = dailyMap.get(date) ?? { passed: 0, failed: 0, total: 0 };
      return { date, passed: c.passed, failed: c.failed, total: c.total, passRate: pct(c.passed, c.total) };
    });

    // ---------- KPI ----------
    const k = kpiRows[0] ?? {
      cur_total: 0,
      cur_passed: 0,
      cur_failed: 0,
      prev_total: 0,
      prev_passed: 0,
      prev_failed: 0,
    };
    const kpi = {
      passRate: pct(n(k.cur_passed), n(k.cur_total)),
      passRatePrev: pct(n(k.prev_passed), n(k.prev_total)),
      totalRuns: n(k.cur_total),
      totalRunsPrev: n(k.prev_total),
      failed: n(k.cur_failed),
      failedPrev: n(k.prev_failed),
      failingNow: n(failingNowRows[0]?.n),
      flaky: 0,
      coverage: { automated: automatedTc, total: totalTc, pct: pct(automatedTc, totalTc) },
    };

    // ---------- Per-link: transisi, streak, per-hari ----------
    type Agg = {
      testCaseId: string;
      tcId: string;
      title: string;
      lastResult: string | null;
      lastRunAt: Date | null;
      seq: { status: string; ranAt: Date }[];
      perDay: Map<string, { passed: number; failed: number; total: number }>;
    };
    const linkMap = new Map<string, Agg>();
    for (const l of links) {
      linkMap.set(l.test_case_id, {
        testCaseId: l.test_case_id,
        tcId: l.tc_id,
        title: l.title,
        lastResult: l.last_result,
        lastRunAt: l.last_run_at,
        seq: [],
        perDay: new Map(),
      });
    }
    for (const r of runs) {
      const agg = linkMap.get(r.test_case_id);
      if (!agg) continue;
      agg.seq.push({ status: r.status, ranAt: r.ran_at });
      const key = wibDateKey(r.ran_at);
      const cur = agg.perDay.get(key) ?? { passed: 0, failed: 0, total: 0 };
      cur.total += 1;
      if (r.status === "PASS") cur.passed += 1;
      else if (r.status === "FAIL") cur.failed += 1;
      agg.perDay.set(key, cur);
    }

    const transitionsOf = (seq: { status: string }[]): number => {
      const flows = seq.map((s) => s.status).filter((s) => s === "PASS" || s === "FAIL");
      let n = 0;
      for (let i = 1; i < flows.length; i++) if (flows[i] !== flows[i - 1]) n += 1;
      return n;
    };

    for (const a of Array.from(linkMap.values())) {
      const isFailing = a.lastResult === "FAIL";
      const transitions = transitionsOf(a.seq);
      if (!isFailing && transitions >= 3) kpi.flaky += 1;
    }

    // ---------- Alerts ----------
    const failingAlerts: AutomationAlertItem[] = [];
    const flakyAlerts: AutomationAlertItem[] = [];
    const staleAlerts: AutomationAlertItem[] = [];
    const staleThreshold = Date.now() - STALE_DAYS * 86_400_000;
    // Tanggal awal run tertua di rentang — batas aproximasi streak.
    const rangeStartMonth = start;

    for (const a of Array.from(linkMap.values())) {
      const isFailing = a.lastResult === "FAIL";
      const transitions = transitionsOf(a.seq);

      if (isFailing) {
        // Streak FAIL dari belakang (abaikan SKIPPED).
        let count = 0;
        let since: Date | null = null;
        for (let i = a.seq.length - 1; i >= 0; i--) {
          const s = a.seq[i];
          if (s.status === "SKIPPED") continue;
          if (s.status !== "FAIL") break;
          count += 1;
          since = s.ranAt;
        }
        if (count === 0) {
          count = 1; // failing tapi run terakhir di luar rentang
          since = a.lastRunAt;
        }
        failingAlerts.push({
          testCaseId: a.testCaseId,
          tcId: a.tcId,
          title: a.title,
          note: `Gagal ${count}x berturut-turut sejak ${since ? fmtDate(since) : fmtDate(rangeStartMonth)}`,
        });
      } else if (transitions >= 3) {
        const cc = dailyKeys.reduce(
          (acc, d) => {
            const c = a.perDay.get(d);
            if (c) {
              acc.failed += c.failed;
              acc.total += c.total;
            }
            return acc;
          },
          { failed: 0, total: 0 }
        );
        flakyAlerts.push({
          testCaseId: a.testCaseId,
          tcId: a.tcId,
          title: a.title,
          note: `Berganti hasil ${transitions}x · ${cc.failed} dari ${cc.total} run gagal`,
        });
      }

      const staleBase = a.lastRunAt ? a.lastRunAt.getTime() : null;
      if (staleBase === null || staleBase < staleThreshold) {
        staleAlerts.push({
          testCaseId: a.testCaseId,
          tcId: a.tcId,
          title: a.title,
          note: staleBase === null ? "Belum pernah dijalankan" : `Terakhir dijalankan ${fmtDate(a.lastRunAt!)}`,
        });
      }
    }

    // Urutkan: failing by streak desc (streak tertanam di note count) → pakai panjang seq FAIL.
    const streakOf = (a: Agg): number => {
      let count = 0;
      for (let i = a.seq.length - 1; i >= 0; i--) {
        const s = a.seq[i];
        if (s.status === "SKIPPED") continue;
        if (s.status !== "FAIL") break;
        count += 1;
      }
      return count;
    };
    failingAlerts.sort((x, y) => {
      const ax = linkMap.get(x.testCaseId);
      const ay = linkMap.get(y.testCaseId);
      return (ay ? streakOf(ay) : 0) - (ax ? streakOf(ax) : 0);
    });
    flakyAlerts.sort((x, y) => x.title.localeCompare(y.title));
    staleAlerts.sort((x, y) => x.title.localeCompare(y.title));

    // ---------- Matriks ----------
    const failingSet = new Set(failingAlerts.map((a) => a.testCaseId));
    const flakySet = new Set(flakyAlerts.map((a) => a.testCaseId));

    const matrixAll: AutomationMatrixItem[] = Array.from(linkMap.values()).map((a) => {
      let passed = 0;
      let total = 0;
      const cells = dailyKeys.map((date) => {
        const c = a.perDay.get(date) ?? { passed: 0, failed: 0, total: 0 };
        passed += c.passed;
        total += c.total;
        const state: AutomationMatrixCellState =
          c.total === 0
            ? "none"
            : c.failed === 0
              ? "all-pass"
              : c.passed === 0
                ? "all-fail"
                : "some-fail";
        return { date, state, passed: c.passed, failed: c.failed };
      });
      return {
        testCaseId: a.testCaseId,
        tcId: a.tcId,
        title: a.title,
        passRate: pct(passed, total),
        cells,
      };
    });

    // Problem-first: failing → flaky → sisanya; lalu pass rate terendah.
    matrixAll.sort((x, y) => {
      const rank = (id: string) => (failingSet.has(id) ? 0 : flakySet.has(id) ? 1 : 2);
      const rx = rank(x.testCaseId);
      const ry = rank(y.testCaseId);
      if (rx !== ry) return rx - ry;
      const px = x.passRate ?? 101;
      const py = y.passRate ?? 101;
      if (px !== py) return px - py;
      return x.title.localeCompare(y.title);
    });

    const matrixItems = matrixAll.slice(0, limit);

    // ---------- Coverage per project ----------
    const coverageByProject: AutomationCoverageProjectItem[] = projects.map((p) => {
      const total = n(p.total);
      const automated = n(p.automated);
      return {
        projectId: p.project_id,
        name: p.name,
        platform: (p.platform as PlatformCode | null) ?? null,
        total,
        automated,
        pct: pct(automated, total),
      };
    });
    const hiddenProjects = coverageByProject.filter((p) => p.total === 0).length;

    const payload: AutomationOverviewPayload = {
      range: { days, from: wibDateKey(start), to: wibDateKey(end) },
      kpi,
      daily,
      alerts: {
        failing: failingAlerts,
        flaky: flakyAlerts,
        stale: staleAlerts,
      },
      matrix: { items: matrixItems, hiddenCount: Math.max(0, matrixAll.length - matrixItems.length) },
      day: {
        date: selectedDate,
        runs: dayRuns.map((r) => ({
          id: r.id,
          ranAt: r.ran_at.toISOString(),
          testCaseId: r.test_case_id,
          tcId: r.tc_id,
          title: r.title,
          project: r.project ?? "—",
          suite: r.suite ?? "Tanpa Suite",
          status: r.status,
        })),
      },
      coverageByProject: coverageByProject.filter((p) => p.total > 0),
      hiddenProjects,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    // Tabel AutomationRun mungkin belum dimigrasi → kembalikan payload kosong
    // agar halaman tetap tampil (bukan 500 yang memblokir seluruh halaman).
    console.error("automation/overview gagal:", error);
    return NextResponse.json(emptyPayload(days, start, end, selectedDate));
  }
}
