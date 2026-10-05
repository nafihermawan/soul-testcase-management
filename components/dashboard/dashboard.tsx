"use client";

import { useMemo, useState } from "react";
import {
  addCounts,
  emptyCounts,
  formatPct,
  passRateOf,
  pct,
  testingHealth,
  ACTIVE_BUG_STATUSES,
  RETEST_BUG_STATUS,
  withinPeriod,
  severityRank,
} from "@/lib/qa-metrics";
import {
  DashboardFilters,
  type DashboardFilterState,
} from "@/components/dashboard/dashboard-filters";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, PanelHeader } from "@/components/ui";
import { TestingHealth } from "@/components/dashboard/testing-health";
import { ActionRequired, type ActionItem } from "@/components/dashboard/action-required";
import { CoverageBySuite } from "@/components/dashboard/coverage-by-suite";
import { RecentRuns } from "@/components/dashboard/recent-runs";
import { RecentBugs } from "@/components/dashboard/recent-bugs";
import type { DashboardBugItem, DashboardRunItem, DashboardSuiteCoverageItem } from "@/types/api";

const ALL = "ALL";

const DEFAULT_FILTERS: DashboardFilterState = {
  platform: ALL,
  module: ALL,
  environment: ALL,
  period: "ALL",
};

export function Dashboard({
  user,
  runs,
  bugs,
  suiteCoverage,
}: {
  user?: { name?: string | null };
  runs: DashboardRunItem[];
  bugs: DashboardBugItem[];
  suiteCoverage: DashboardSuiteCoverageItem[];
}) {
  const [filters, setFilters] = useState<DashboardFilterState>(DEFAULT_FILTERS);
  const firstName = (user?.name ?? "Nafi").split(" ")[0];

  const matchers = useMemo(() => {
    const byPlatform = (platform: string | null) =>
      filters.platform === ALL || (platform ?? "").toUpperCase() === filters.platform;
    const byModule = (suiteIds: (string | null)[]) =>
      filters.module === ALL ||
      suiteIds.some((id) => id !== null && id === filters.module);
    // Environment yang kosong = tidak diketahui, tetap ditampilkan agar bug/run
    // lama tidak "hilang" hanya karena env-nya belum terisi.
    const byEnvironment = (env: string | null) =>
      filters.environment === ALL ||
      env === null ||
      (env ?? "").toUpperCase() === filters.environment;
    const byPeriod = (iso: string) => withinPeriod(iso, filters.period);
    return { byPlatform, byModule, byEnvironment, byPeriod };
  }, [filters]);

  // Suites: dimensi environment & period tidak melekat pada suite (lihat catatan di header filter).
  const filteredSuites = useMemo(
    () =>
      suiteCoverage.filter(
        (s) => matchers.byPlatform(s.platform) && matchers.byModule([s.id])
      ),
    [suiteCoverage, matchers]
  );

  const filteredRuns = useMemo(
    () =>
      runs.filter(
        (r) =>
          matchers.byPlatform(r.platform) &&
          matchers.byModule(r.suiteIds) &&
          matchers.byEnvironment(r.environment) &&
          matchers.byPeriod(r.createdAt)
      ),
    [runs, matchers]
  );

  const filteredBugs = useMemo(
    () =>
      bugs.filter(
        (b) =>
          matchers.byPlatform(b.platform) &&
          matchers.byModule([b.suiteId]) &&
          matchers.byEnvironment(b.environment) &&
          matchers.byPeriod(b.createdAt)
      ),
    [bugs, matchers]
  );

  const modules = useMemo(
    () =>
      [...suiteCoverage]
        .map((s) => ({ id: s.id, name: s.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [suiteCoverage]
  );

  // --- Agregat dari suite terfilter (platform + module) ---
  const { totalTC, tested, execCounts, coveragePct, passRate } = useMemo(() => {
    let total = 0;
    let counts = emptyCounts();
    for (const s of filteredSuites) {
      total += s.total;
      counts = addCounts(counts, s.counts);
    }
    return {
      totalTC: total,
      tested: counts.executed,
      execCounts: counts,
      coveragePct: pct(counts.executed, total),
      passRate: passRateOf(counts),
    };
  }, [filteredSuites]);

  // --- Bugs ---
  const openBugs = filteredBugs.filter((b) =>
    (ACTIVE_BUG_STATUSES as readonly string[]).includes(b.status)
  );
  const criticalHighBugs = openBugs.filter((b) => severityRank(b.severity) <= 1).length;

  const health = testingHealth({
    executed: execCounts.executed,
    passRate,
    failed: execCounts.failed,
    criticalHighBugs,
    coveragePct,
  });

  const actionItems: ActionItem[] = [
    {
      key: "failed-runs",
      count: filteredRuns.filter((r) => r.counts.failed > 0).length,
      label: "failed test runs",
      cta: "View Test Run",
      href: "/test-runs",
      tone: "danger",
    },
    {
      key: "retest-bugs",
      count: filteredBugs.filter((b) => b.status === RETEST_BUG_STATUS).length,
      label: "bugs ready for retest",
      cta: "Retest",
      href: "/bugs",
      tone: "warning",
    },
    {
      key: "not-executed",
      count: Math.max(totalTC - tested, 0),
      label: "test cases ready to be executed",
      cta: "Start Testing",
      href: "/test-runs",
      tone: "brand",
    },
  ];

  return (
    <div
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        background: "#F6F7F9",
        padding: "0.25rem",
      }}
    >
      {/* Header: sapaan + filter global */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#1E293B", letterSpacing: "-0.025em" }}>
            Good afternoon, {firstName}
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: "#64748B", fontSize: 12, fontWeight: 400 }}>
            Here&apos;s your QA testing overview.
          </p>
        </div>
        <DashboardFilters value={filters} modules={modules} onChange={setFilters} />
      </div>

      {/* Layout 2 kolom: main content (kiri) + sidebar widget (kanan) */}
      <div className="dash-split dash-split-2-1">
        {/* ===== MAIN CONTENT ===== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
          {/* Baris 1: KPI metrics */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div className="metric-grid">
              <KpiCard
                label="Total Test Cases"
                value={totalTC.toLocaleString("id-ID")}
                sub={
                  filters.platform === ALL && filters.module === ALL
                    ? "Across all active suites"
                    : `Across ${filteredSuites.length} filtered suite${filteredSuites.length === 1 ? "" : "s"}`
                }
                tone="brand"
              />
              <KpiCard
                label="Test Coverage"
                value={formatPct(coveragePct)}
                sub={totalTC === 0 ? "Belum ada test case" : `${tested} / ${totalTC} tested`}
                tone="info"
              />
              <KpiCard
                label="Pass Rate"
                value={formatPct(passRate)}
                sub={
                  passRate === null
                    ? "No execution yet"
                    : `${execCounts.passed} / ${execCounts.executed} executed`
                }
                tone={
                  passRate === null
                    ? "neutral"
                    : passRate < 70
                      ? "danger"
                      : passRate < 85
                        ? "warning"
                        : "success"
                }
              />
              <KpiCard
                label="Open Bugs"
                value={String(openBugs.length)}
                sub={`${criticalHighBugs} Critical / High`}
                tone={criticalHighBugs > 0 ? "danger" : "neutral"}
              />
            </div>

            {/* Rincian eksekusi ringkas — menggantikan widget Execution Summary. */}
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {execCounts.executed.toLocaleString("id-ID")} executed
              {" · "}
              {execCounts.blocked.toLocaleString("id-ID")} blocked
              {" · "}
              {execCounts.notRun.toLocaleString("id-ID")} not run
              {execCounts.failed > 0 && (
                <>{" · "}{execCounts.failed.toLocaleString("id-ID")} failed</>
              )}
            </div>
          </div>

          {/* Baris 2: detail breakdown */}
          <CoverageBySuite suites={filteredSuites} />

          <div className="dash-split dash-split-7-5">
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <RecentRuns runs={filteredRuns} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <RecentBugs bugs={filteredBugs} />
            </div>
          </div>
        </div>

        {/* ===== SIDEBAR ===== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
          {/* Widget 1: Testing Health */}
          <Card>
            <PanelHeader title="Testing Health" />
            <div style={{ padding: "1rem 1.5rem" }}>
              <TestingHealth health={health} />
            </div>
          </Card>

          {/* Widget 2: Action Required */}
          <ActionRequired items={actionItems} />
        </div>
      </div>
    </div>
  );
}
