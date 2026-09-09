"use client";

import { useState } from "react";
import { Bug, CalendarClock, ExternalLink, FolderTree } from "lucide-react";
import { Badge, Card, DonutChart, PanelHeader, ProgressBar, Sparkline } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import { EnvFilter, type EnvFilterType } from "@/components/dashboard/env-filter";
import { firstUrlOf } from "@/lib/format";

type ProjectMetrics = {
  projectId: string;
  environment: string | null;
  totalTC: number;
  automatedTC: number;
  testedTC: number;
  coveragePct: number;
  passRate: number;
  executed: number;
  passed: number;
  openBugs: number;
  criticalBugs: number;
  highBugs: number;
};

type RunItem = {
  id: string;
  name: string;
  project: string;
  projectId: string;
  environment: string | null;
  status: string;
  executedBy: string;
  total: number;
  createdAt: string;
};

type BugItem = {
  id: string;
  title: string;
  severity: string;
  status: string;
  projectId: string | null;
  environment: string | null;
  createdAt: string;
};

type SuiteCoverageItem = {
  id: string;
  name: string;
  code: string;
  projectId: string;
  environment: string | null;
  docUrl: string | null;
  total: number;
  automated: number;
  coveragePct: number;
};

const severityTone = (s: string) =>
  s === "CRITICAL" ? "danger" : s === "HIGH" ? "warning" : s === "MEDIUM" ? "info" : "neutral";
const bugStatusLabel = (s: string) =>
  s === "OPEN"
    ? "Open"
    : s === "IN_PROGRESS"
      ? "In Progress"
      : s === "RESOLVED"
        ? "Resolved"
        : "Closed";

/** Sparkline netral saat tidak ada data historis (hindari chart menyesatkan untuk 0). */
function TrendLine({ value, color }: { value: number; color: string }) {
  if (value <= 0) {
    return <Sparkline points={[0, 0, 0, 0, 0, 0, 0, 0]} color={color} />;
  }
  return (
    <Sparkline
      points={[Math.max(value - 8, 0), Math.max(value - 5, 0), Math.max(value - 3, 0), value]}
      color={color}
    />
  );
}

/** Kartu metrik seragam: label + nilai + sub-label + sparkline (digunakan 5x dalam 1 baris). */
function MetricCard({
  label,
  value,
  sub,
  trendValue,
  trendColor,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  trendValue: number;
  trendColor: string;
}) {
  return (
    <Card style={{ padding: "1rem 1.25rem", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.5rem",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {label}
          </div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, marginTop: "0.2rem", lineHeight: 1.2 }}>
            {value}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
            {sub}
          </div>
        </div>
        <TrendLine value={trendValue} color={trendColor} />
      </div>
    </Card>
  );
}

export function Dashboard({
  user,
  projectMetrics,
  runs,
  bugs,
  suiteCoverage,
}: {
  user?: { name?: string | null };
  projectMetrics: ProjectMetrics[];
  runs: RunItem[];
  bugs: BugItem[];
  suiteCoverage: SuiteCoverageItem[];
}) {
  // ENV sebagai satu-satunya filter global dashboard
  const [activeEnv, setActiveEnv] = useState<EnvFilterType>("ALL");
  const firstName = (user?.name ?? "Nafi").split(" ")[0];

  const envMatch = (env: string | null) =>
    activeEnv === "ALL" || (env ?? "").toUpperCase() === activeEnv.toUpperCase();

  // Filter data berdasarkan environment terpilih
  const filteredSuites = suiteCoverage.filter((s) => envMatch(s.environment));
  const filteredRuns = runs.filter((r) => envMatch(r.environment));
  const filteredBugs = bugs.filter((b) => envMatch(b.environment));
  const envMetrics = projectMetrics.filter((m) => envMatch(m.environment));

  // Metrik: agregat dari project yang match environment
  const sum = (
    key:
      | "totalTC"
      | "automatedTC"
      | "testedTC"
      | "executed"
      | "passed"
      | "openBugs"
      | "criticalBugs"
      | "highBugs"
  ) => envMetrics.reduce((s, m) => s + m[key], 0);

  const metrics: ProjectMetrics = {
    projectId: "all",
    environment: activeEnv === "ALL" ? null : activeEnv,
    totalTC: sum("totalTC"),
    automatedTC: sum("automatedTC"),
    testedTC: sum("testedTC"),
    coveragePct: (() => {
      const total = sum("totalTC");
      const auto = sum("automatedTC");
      return total > 0 ? Math.round((auto / total) * 100) : 0;
    })(),
    passRate: (() => {
      const exec = sum("executed");
      const pass = sum("passed");
      return exec > 0 ? Math.round((pass / exec) * 100) : 0;
    })(),
    executed: sum("executed"),
    passed: sum("passed"),
    openBugs: sum("openBugs"),
    criticalBugs: sum("criticalBugs"),
    highBugs: sum("highBugs"),
  };

  const totalAutomated = metrics.automatedTC;
  const totalManual = Math.max(metrics.totalTC - totalAutomated, 0);
  // Persen TC yang sudah pernah di-test (distinct, hasil != NOT_RUN pada run COMPLETED)
  const testedPct = metrics.totalTC > 0 ? Math.round((metrics.testedTC / metrics.totalTC) * 100) : 0;

  return (
    <div
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        background: "#F6F7F9",
        padding: "0.25rem",
      }}
    >
      {/* Top header: greeting (kiri) + ENV filter (kanan) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>
            Good afternoon, {firstName}!
          </h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)", fontSize: "0.92rem" }}>
            Is it safe today, or haven&apos;t you got the bug yet?
          </p>
        </div>
        <EnvFilter value={activeEnv} onChange={setActiveEnv} />
      </div>

      {/* Metric cards — 5 kartu sejajar (responsif: 1/2/5 kolom) */}
      <div className="metric-grid">
        <MetricCard
          label="Total Test Cases"
          value={metrics.totalTC.toLocaleString("id-ID")}
          sub={`${metrics.automatedTC} automated`}
          trendValue={metrics.totalTC}
          trendColor="var(--brand-500)"
        />
        <MetricCard
          label="Automation Coverage"
          value={`${metrics.coveragePct}%`}
          sub={`${totalAutomated}/${metrics.totalTC} automated`}
          trendValue={metrics.coveragePct}
          trendColor="var(--info)"
        />
        <MetricCard
          label="Pass Rate"
          value={`${metrics.passRate}%`}
          sub={`${metrics.passed} of ${metrics.executed} executed`}
          trendValue={metrics.passRate}
          trendColor="var(--success)"
        />
        <MetricCard
          label="Open Bugs"
          value={String(metrics.openBugs)}
          sub={
            <>
              <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                {metrics.criticalBugs} Critical
              </span>{" "}
              •{" "}
              <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                {metrics.highBugs} High
              </span>
            </>
          }
          trendValue={metrics.openBugs}
          trendColor="var(--danger)"
        />
        <MetricCard
          label="TC Tested"
          value={`${testedPct}%`}
          sub={`${metrics.testedTC.toLocaleString("id-ID")}/${metrics.totalTC.toLocaleString("id-ID")} Tested`}
          trendValue={testedPct}
          trendColor="var(--info)"
        />
      </div>

      {/* Middle: 12-col grid — Coverage Matrix (7) + Execution Summary (5) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)",
          gap: "1rem",
          alignItems: "stretch",
        }}
      >
        {/* Coverage matrix */}
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <PanelHeader title="Coverage Matrix per Suite" />
          {filteredSuites.length === 0 ? (
            <EmptyState
              icon={<FolderTree size={22} />}
              title="Belum Ada Suite"
              subtext="Suite dengan test case akan muncul di sini lengkap dengan persentase coverage otomasinya."
            />
          ) : (
            <div style={{ padding: "0.75rem 1.25rem" }}>
              {filteredSuites.map((s) => (
                <div
                  key={s.id}
                  style={{ padding: "0.55rem 0", borderBottom: "1px solid var(--border)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {(() => {
                      const docHref = firstUrlOf(s.docUrl);
                      return docHref ? (
                        <a
                          href={docHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Buka Dokumentasi Suite"
                          style={{
                            fontWeight: 700,
                            fontSize: "0.88rem",
                            width: 160,
                            flexShrink: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#2563EB",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          {s.name}
                          <ExternalLink size={14} style={{ flexShrink: 0, color: "#2563EB" }} />
                        </a>
                      ) : (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.88rem",
                            width: 160,
                            flexShrink: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.name}
                        </span>
                      );
                    })()}
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--text-muted)",
                        width: 90,
                        textAlign: "right",
                      }}
                    >
                      {s.total} TC
                    </span>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--text-muted)",
                        width: 80,
                        textAlign: "right",
                      }}
                    >
                      {s.automated} auto
                    </span>
                    <span style={{ flex: 1, minWidth: 80 }}>
                      <ProgressBar
                        value={s.coveragePct}
                        color={
                          s.coveragePct >= 70
                            ? "var(--success)"
                            : s.coveragePct >= 40
                              ? "var(--warning)"
                              : "var(--danger)"
                        }
                      />
                    </span>
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        width: 52,
                        textAlign: "right",
                      }}
                    >
                      {s.coveragePct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Execution summary */}
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <PanelHeader title="Execution Summary" />
          <div
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "1.25rem",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DonutChart
                segments={[
                  { value: metrics.passed, color: "var(--success)" },
                  { value: Math.max(metrics.executed - metrics.passed, 0), color: "var(--danger)" },
                  {
                    value: Math.max(metrics.totalTC - metrics.executed, 0),
                    color: "var(--border-strong)",
                  },
                ]}
                size={140}
                thickness={18}
                centerLabel={String(metrics.executed)}
                centerSub="Executed"
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                  fontSize: "0.82rem",
                }}
              >
                <LegendItem
                  color="var(--success)"
                  label="Passed"
                  value={String(metrics.passed)}
                  pct={
                    metrics.executed > 0
                      ? `${Math.round((metrics.passed / metrics.executed) * 100)}%`
                      : "—"
                  }
                />
                <LegendItem
                  color="var(--danger)"
                  label="Failed/Other"
                  value={String(Math.max(metrics.executed - metrics.passed, 0))}
                  pct="—"
                />
                <LegendItem
                  color="var(--border-strong)"
                  label="Not Run"
                  value={String(Math.max(metrics.totalTC - metrics.executed, 0))}
                  pct="—"
                />
              </div>
            </div>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.82rem",
                marginTop: "auto",
              }}
            >
              <tbody>
                <SummaryRow
                  label="Total Test Cases"
                  value={metrics.totalTC.toLocaleString("id-ID")}
                  strong
                />
                <SummaryRow label="Executed" value={metrics.executed.toLocaleString("id-ID")} />
                <SummaryRow label="Automated" value={totalAutomated.toLocaleString("id-ID")} />
                <SummaryRow label="Manual Only" value={totalManual.toLocaleString("id-ID")} />
                <SummaryRow label="Pass Rate" value={`${metrics.passRate}%`} strong />
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Bottom: Recent runs + bugs (min-height symmetric) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "1rem",
          alignItems: "stretch",
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", minHeight: 220 }}>
          <PanelHeader title="Recent Test Runs" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {filteredRuns.length === 0 ? (
              <EmptyState
                icon={<CalendarClock size={22} />}
                title="Belum Ada Test Run"
                subtext="Belum ada test run yang tercatat."
                actionLabel="Buat Test Run Baru"
                actionHref="/test-runs"
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                      <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Test Run Name</th>
                      <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Project</th>
                      <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>TC</th>
                      <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((r) => (
                      <tr
                        key={r.id}
                        style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                        onClick={() => {
                          window.location.href = `/test-runs/${r.id}`;
                        }}
                      >
                        <td
                          style={{
                            padding: "0.6rem 1.25rem",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.name}
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
                          {r.project}
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem" }}>
                          <TestRunStatusBadge status={r.status} />
                        </td>
                        <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
                          {r.total}
                        </td>
                        <td
                          style={{
                            padding: "0.6rem 1.25rem",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {new Date(r.createdAt).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", minHeight: 220 }}>
          <PanelHeader title="Recent Bugs" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {filteredBugs.length === 0 ? (
              <EmptyState
                icon={<Bug size={22} />}
                title="Belum Ada Bug"
                subtext="Belum ada bug yang tercatat di sistem."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                      <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Title</th>
                      <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Severity</th>
                      <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBugs.map((b) => (
                      <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.6rem 1.25rem", fontWeight: 500 }}>{b.title}</td>
                        <td style={{ padding: "0.6rem 0.5rem" }}>
                          <Badge tone={severityTone(b.severity)}>{b.severity || "—"}</Badge>
                        </td>
                        <td style={{ padding: "0.6rem 1.25rem" }}>
                          <Badge
                            tone={
                              b.status === "RESOLVED"
                                ? "success"
                                : b.status === "IN_PROGRESS"
                                  ? "info"
                                  : b.status === "CLOSED"
                                    ? "neutral"
                                    : "warning"
                            }
                          >
                            {bugStatusLabel(b.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: 700 }}>{value}</span>
      <span style={{ color: "var(--text-muted)", width: 42, textAlign: "right" }}>{pct}</span>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ padding: "0.45rem 0", color: "var(--text-secondary)" }}>{label}</td>
      <td style={{ padding: "0.45rem 0", textAlign: "right", fontWeight: strong ? 800 : 600 }}>
        {value}
      </td>
    </tr>
  );
}
