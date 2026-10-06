"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addCounts,
  emptyCounts,
  formatPct,
  passRateOf,
  pct,
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
import { ActionRequiredList, type ActionItem } from "@/components/dashboard/action-required";
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

  const actionItems: ActionItem[] = [
    {
      key: "failed-runs",
      count: filteredRuns.filter((r) => r.counts.failed > 0).length,
      label: "Failed test runs",
      cta: "View",
      href: "/test-runs",
      tone: "danger",
    },
    {
      key: "retest-bugs",
      count: filteredBugs.filter((b) => b.status === RETEST_BUG_STATUS).length,
      label: "Bugs ready for retest",
      cta: "Retest",
      href: "/bugs",
      tone: "warning",
    },
    {
      key: "not-executed",
      count: Math.max(totalTC - tested, 0),
      label: "Test cases ready to run",
      cta: "Start",
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

      {/* Baris statistik: 4 kartu KPI simetris */}
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
                accent="#2563EB"
              />
              <KpiCard
                label="Test Coverage"
                value={formatPct(coveragePct)}
                sub={totalTC === 0 ? "Belum ada test case" : `${tested} / ${totalTC} tested`}
                accent="#0EA5E9"
              />
              <KpiCard
                label="Pass Rate"
                value={formatPct(passRate)}
                sub={
                  passRate === null
                    ? "No execution yet"
                    : `${execCounts.passed} / ${execCounts.executed} executed`
                }
                accent="#F59E0B"
              />
              <KpiCard
                label="Open Bugs"
                value={String(openBugs.length)}
                sub={`${criticalHighBugs} Critical / High`}
                accent="#F43F5E"
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

      {/* Baris utama: Coverage by Suite (span 8) + Health & Action (span 4) */}
      <div className="dash-main-12">
        <div className="span-8" style={{ minWidth: 0 }}>
          <CoverageBySuite suites={filteredSuites} />
        </div>
        <div className="span-4" style={{ minWidth: 0 }}>
          {/* Kartu terpadu: Health + ringkasan eksekusi + Action Required + aksi
              cepat. `marginTop: auto` mendorong aksi ke dasar kartu agar tidak
              ada ruang kosong dan tingginya sejajar dengan tabel kiri. */}
          <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <PanelHeader title="Health & Action" />

            {/* 1. Ringkasan eksekusi: bar tersegmentasi + kartu badge */}
            <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "0.5rem",
                }}
              >
                Test Execution
              </div>

              {/* Bar rasio: emerald/rose/amber/slate */}
              <div
                style={{
                  display: "flex",
                  height: 6,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "#F1F5F9",
                  marginBottom: "0.75rem",
                }}
              >
                {[
                  { key: "passed", value: execCounts.passed, color: "#10B981" },
                  { key: "failed", value: execCounts.failed, color: "#F43F5E" },
                  { key: "blocked", value: execCounts.blocked, color: "#F59E0B" },
                  { key: "notRun", value: execCounts.notRun, color: "#CBD5E1" },
                ].map((seg) =>
                  seg.value > 0 ? (
                    <div
                      key={seg.key}
                      style={{
                        width: `${(seg.value / Math.max(execCounts.total, 1)) * 100}%`,
                        background: seg.color,
                      }}
                    />
                  ) : null
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                {[
                  { label: "Passed", value: execCounts.passed, bg: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
                  { label: "Failed", value: execCounts.failed, bg: "#FFF1F2", border: "#FECDD3", color: "#BE123C" },
                  { label: "Blocked", value: execCounts.blocked, bg: "#FFFBEB", border: "#FDE68A", color: "#B45309" },
                  { label: "Not run", value: execCounts.notRun, bg: "#F8FAFC", border: "#E2E8F0", color: "#64748B" },
                ].map((m) => (
                  <div
                    key={m.label}
                    style={{
                      background: m.bg,
                      border: `1px solid ${m.border}`,
                      borderRadius: 8,
                      padding: "0.5rem 0.7rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        color: m.color,
                      }}
                    >
                      {m.value.toLocaleString("id-ID")}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: m.color }}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Needs Attention */}
            <div style={{ padding: "0.85rem 1.5rem 0.15rem" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#64748B",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Needs Attention
              </div>
            </div>

            <ActionRequiredList items={actionItems} />

            {/* Aksi cepat — didorong ke dasar kartu */}
            <div
              style={{
                marginTop: "auto",
                padding: "0.85rem 1.5rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              {/* Primary: Mulai Testing (amber) */}
              <Link
                href="/test-runs"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 0.9rem",
                  borderRadius: 8,
                  background: "#F59E0B",
                  color: "#111827",
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
              >
                + Mulai Testing
              </Link>
              {/* Secondary: outlined */}
              {[
                { href: "/bugs", label: "Bugs" },
                { href: "/reports", label: "Reports" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 32,
                    padding: "0 0.9rem",
                    borderRadius: 8,
                    border: "1px solid #E2E8F0",
                    background: "#fff",
                    color: "#475569",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "background-color 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#CBD5E1";
                    e.currentTarget.style.background = "#F8FAFC";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#E2E8F0";
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Baris bawah: Recent Runs / Recent Bugs */}
      <div className="dash-split dash-split-7-5">
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <RecentRuns runs={filteredRuns} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <RecentBugs bugs={filteredBugs} />
        </div>
      </div>
    </div>
  );
}
