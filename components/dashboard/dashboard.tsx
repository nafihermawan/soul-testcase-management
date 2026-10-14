"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
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
  executionProgress,
  PERIOD_OPTIONS,
} from "@/lib/qa-metrics";
import {
  DashboardFilters,
  type DashboardFilterState,
} from "@/components/dashboard/dashboard-filters";
import { KpiCard } from "@/components/ui/kpi-card";
import { StackedBar } from "@/components/ui/stacked-bar";
import { Card, PanelHeader } from "@/components/ui";
import { OPEN_RUN_STATUSES } from "@/lib/run-status";
import { ActionRequiredList, type ActionItem } from "@/components/dashboard/action-required";
import { CoverageBySuite } from "@/components/dashboard/coverage-by-suite";
import { ReleaseReadiness } from "@/components/dashboard/release-readiness";
import { RecentRuns } from "@/components/dashboard/recent-runs";
import { RecentBugs } from "@/components/dashboard/recent-bugs";
import type { DashboardBugItem, DashboardRunItem, DashboardSuiteCoverageItem } from "@/types/api";

const ALL = "ALL";

const PLATFORM_LABELS: Record<string, string> = {
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

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
  // Scope agregasi Pass Rate: seluruh waktu vs. sprint/release yang sedang aktif.
  const [passRateScope, setPassRateScope] = useState<"ALL" | "RELEASE">("ALL");
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
      coveragePct: executionProgress(counts),
      passRate: passRateOf(counts),
    };
  }, [filteredSuites]);

  /**
   * Sprint/release aktif = sprint dari run yang masih berjalan (PENDING/
   * IN_PROGRESS/RE_OPEN) paling baru; fallback ke sprint run terbaru. Model
   * tidak punya entitas "Release" — `TestRun.sprint` dipakai sebagai padanannya.
   */
  const activeSprint = useMemo(() => {
    const open = filteredRuns.filter(
      (r) => r.sprint && (OPEN_RUN_STATUSES as readonly string[]).includes(r.status)
    );
    const pool = (open.length ? open : filteredRuns.filter((r) => r.sprint))
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return pool[0]?.sprint ?? null;
  }, [filteredRuns]);

  /**
   * Ringkasan scope filter sebagai teks tipis di samping sub-judul (menggantikan
   * pill chip). Null bila tidak ada scope yang aktif sama sekali.
   */
  const scopeSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.platform !== ALL) parts.push(PLATFORM_LABELS[filters.platform] ?? filters.platform);
    if (filters.module !== ALL)
      parts.push(modules.find((m) => m.id === filters.module)?.name ?? "Module");
    if (filters.environment !== ALL) parts.push(filters.environment);
    if (filters.period !== "ALL")
      parts.push(PERIOD_OPTIONS.find((p) => p.value === filters.period)?.label ?? filters.period);

    const release = activeSprint ? `Release ${activeSprint}` : null;
    if (!release && parts.length === 0) return null;
    const scope = parts.length ? parts.join(", ") : "All Platforms, Modules & Envs";
    return [release, `(${scope})`].filter(Boolean).join(" ");
  }, [filters, modules, activeSprint]);

  /**
   * Pass Rate per scope. "All Time" = seluruh hasil terakhir (dari suite);
   * "Active Release" = akumulasi hasil run pada sprint aktif. Bila tidak ada
   * release aktif, scope "Active Release" otomatis jatuh ke All Time.
   */
  const passRateData = useMemo(() => {
    if (passRateScope === "RELEASE" && activeSprint) {
      const rows = filteredRuns.filter((r) => r.sprint === activeSprint);
      let passed = 0;
      let executed = 0;
      for (const r of rows) {
        passed += r.counts.passed;
        executed += r.counts.executed;
      }
      return { passed, executed, rate: pct(passed, executed), scope: "RELEASE" as const };
    }
    return {
      passed: execCounts.passed,
      executed: execCounts.executed,
      rate: passRate,
      scope: "ALL" as const,
    };
  }, [passRateScope, activeSprint, filteredRuns, execCounts, passRate]);

  // --- Bugs ---
  const openBugs = filteredBugs.filter((b) =>
    (ACTIVE_BUG_STATUSES as readonly string[]).includes(b.status)
  );
  const criticalBugs = openBugs.filter((b) => severityRank(b.severity) === 0).length;
  const highBugs = openBugs.filter((b) => severityRank(b.severity) === 1).length;

  const actionItems: ActionItem[] = [
    {
      key: "failed-runs",
      count: filteredRuns.filter((r) => r.counts.failed > 0).length,
      label: "Test Runs with Failures",
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
        // Spacing vertikal utama dirapatkan (space-y-3).
        gap: "0.75rem",
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
            Here&apos;s your QA testing overview
            {scopeSummary && <span style={{ color: "#94A3B8" }}> • {scopeSummary}</span>}
          </p>
        </div>
        <DashboardFilters value={filters} modules={modules} onChange={setFilters} />
      </div>

      {/* Baris statistik: 4 kartu KPI simetris */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div className="metric-grid">
              <KpiCard
                label="Total Test Cases"
                value={totalTC.toLocaleString("en-US")}
                sub={
                  filters.platform === ALL && filters.module === ALL
                    ? "Across all active suites"
                    : `Across ${filteredSuites.length} filtered suite${filteredSuites.length === 1 ? "" : "s"}`
                }
                accent="#2563EB"
              />
              <KpiCard
                label="Execution Progress"
                value={formatPct(coveragePct)}
                sub={totalTC === 0 ? "No test cases yet" : `${tested} / ${totalTC} executed`}
                accent="#0EA5E9"
              />
              <KpiCard
                label="Pass Rate"
                value={formatPct(passRateData.rate)}
                sub={
                  <>
                    {passRateData.rate === null
                      ? "No execution yet"
                      : `${passRateData.passed} / ${passRateData.executed} executed`}
                    <select
                      aria-label="Pass rate scope"
                      value={passRateData.scope}
                      onChange={(e) => setPassRateScope(e.target.value as "ALL" | "RELEASE")}
                      title="Aggregation scope"
                      style={{
                        marginLeft: 6,
                        verticalAlign: "middle",
                        fontSize: 11,
                        color: "#475569",
                        background: "#fff",
                        border: "1px solid #E2E8F0",
                        borderRadius: 6,
                        padding: "1px 4px",
                        cursor: "pointer",
                      }}
                    >
                      <option value="ALL">All Time</option>
                      <option value="RELEASE" disabled={!activeSprint}>
                        Active Release
                      </option>
                    </select>
                    {/* Ringkasan eksekusi (dulu teks menggantung di bawah stat
                        card) kini jadi tooltip ikon info. */}
                    <span
                      title={`${execCounts.executed} executed · ${execCounts.blocked} blocked · ${execCounts.notRun} not run${execCounts.failed > 0 ? ` · ${execCounts.failed} failed` : ""}${activeSprint ? ` · release ${activeSprint}` : ""}`}
                      style={{
                        display: "inline-flex",
                        marginLeft: 6,
                        verticalAlign: "middle",
                        color: "#94A3B8",
                        cursor: "help",
                      }}
                    >
                      <Info size={12} />
                    </span>
                  </>
                }
                accent="#F59E0B"
              />
              <KpiCard
                label="Open Bugs"
                value={String(openBugs.length)}
                sub={`${criticalBugs} Critical · ${highBugs} High`}
                accent="#F43F5E"
              />
            </div>
          </div>

      {/* Baris utama: Coverage by Suite (span 8) + Health & Action (span 4) */}
      <div className="dash-main-12">
        <div className="span-8" style={{ minWidth: 0 }}>
          <div className="dash-fill">
            <CoverageBySuite suites={filteredSuites} />
          </div>
        </div>
        <div className="span-4" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <ReleaseReadiness activeSprint={activeSprint} runs={filteredRuns} bugs={filteredBugs} />
          {/* Kartu terpadu (di-compact): Health + ringkasan eksekusi + Action
              Required + aksi cepat. Tinggi mengikuti konten (h-auto). */}
          <Card style={{ display: "flex", flexDirection: "column" }}>
            <PanelHeader title="Health & Action" compact />

            {/* 1. Ringkasan eksekusi: bar tersegmentasi + kartu badge */}
            <div style={{ padding: "0.9rem 1rem", borderBottom: "1px solid var(--border)" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748B",
                  marginBottom: "0.5rem",
                }}
              >
                Test Execution
              </div>

              {/* Bar rasio: emerald/rose/amber/slate (Passed/Failed/Blocked/
                  Skipped/Untested) — warna mengikuti badge di bawahnya. */}
              <StackedBar
                height={6}
                style={{ marginBottom: "0.6rem" }}
                segments={[
                  { key: "passed", label: "Passed", value: execCounts.passed, color: "#10B981" },
                  { key: "failed", label: "Failed", value: execCounts.failed, color: "#F43F5E" },
                  { key: "blocked", label: "Blocked", value: execCounts.blocked, color: "#F59E0B" },
                  { key: "skipped", label: "Skipped", value: execCounts.skipped, color: "#94A3B8" },
                  { key: "notRun", label: "Untested", value: execCounts.notRun, color: "#CBD5E1" },
                ]}
              />

              {/* Grid angka status: 2 baris (3 kolom) dengan gap lega */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "0.625rem",
                }}
              >
                {[
                  { label: "Passed", value: execCounts.passed, bg: "#ECFDF5", border: "#A7F3D0", color: "#047857" },
                  { label: "Failed", value: execCounts.failed, bg: "#FFF1F2", border: "#FECDD3", color: "#BE123C" },
                  { label: "Blocked", value: execCounts.blocked, bg: "#FFFBEB", border: "#FDE68A", color: "#B45309" },
                  { label: "Skipped", value: execCounts.skipped, bg: "#F1F5F9", border: "#CBD5E1", color: "#475569" },
                  { label: "Untested", value: execCounts.notRun, bg: "#F8FAFC", border: "#E2E8F0", color: "#64748B" },
                ].map((m) => (
                  <div
                    key={m.label}
                    style={{
                      background: m.bg,
                      border: `1px solid ${m.border}`,
                      borderRadius: 8,
                      padding: "0.5rem 0.6rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        lineHeight: 1.15,
                        color: m.color,
                      }}
                    >
                      {m.value.toLocaleString("en-US")}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: m.color,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Needs Attention */}
            <div style={{ padding: "0.9rem 1rem 0.35rem" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748B",
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
                padding: "0.9rem 1rem",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "nowrap",
              }}
            >
              {/* Primary CTA: Start Testing (amber solid) */}
              <Link
                href="/test-runs"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0.375rem 0.75rem",
                  borderRadius: 8,
                  background: "#F59E0B",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
              >
                + Start Testing
              </Link>
              {/* Secondary: outline amber (match tombol Filter kanan atas) */}
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
                    padding: "0.375rem 0.75rem",
                    borderRadius: 8,
                    border: "1px solid #FCD34D",
                    background: "#fff",
                    color: "#D97706",
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: "none",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                    whiteSpace: "nowrap",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FFFBEB";
                  }}
                  onMouseLeave={(e) => {
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

      {/* Baris bawah: Recent Runs / Recent Bugs — 1 kolom sampai 1280px */}
      <div className="dash-bottom-7-5">
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
