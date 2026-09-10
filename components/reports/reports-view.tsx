"use client";

import { Badge, Card, PanelHeader, ProgressBar } from "@/components/ui";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import {
  ErrorBlock,
  StatsCardsSkeleton,
  TableCardSkeleton,
} from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { ReportsPayload } from "@/types/api";

const barColor = (v: number) => (v >= 70 ? "var(--success)" : v >= 40 ? "var(--warning)" : "var(--danger)");

export function ReportsView() {
  const { data, error, loading, reload } = useApi<ReportsPayload>("/api/reports");

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <div className="skeleton-block" style={{ width: 140, height: 22 }} />
          <div className="skeleton-block" style={{ width: 260, height: 12, marginTop: "0.5rem" }} />
        </div>
        <StatsCardsSkeleton count={3} />
        <div style={{ height: "1.25rem" }} />
        <TableCardSkeleton />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.25rem" }}>
        Reports
      </h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
        Ringkasan coverage otomasi dan hasil eksekusi.
      </p>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
        <Card style={{ padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Total Test Cases</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{data.summary.totalTC}</div>
        </Card>
        <Card style={{ padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Executed</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{data.summary.executed}</div>
        </Card>
        <Card style={{ padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Pass Rate</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--success)" }}>{data.summary.passRate}%</div>
        </Card>
      </div>

      {/* Coverage per project */}
      <Card style={{ marginBottom: "1.25rem" }}>
        <PanelHeader title="Coverage per Project" />
        <div style={{ padding: "0.75rem 1.25rem" }}>
          {data.projects.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Belum ada project.</p>
          ) : (
            data.projects.map((p) => (
              <div key={p.id} style={{ padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", width: 200, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", width: 80, textAlign: "right" }}>{p.total} TC</span>
                  <span style={{ flex: 1, minWidth: 80 }}>
                    <ProgressBar value={p.coveragePct} color={barColor(p.coveragePct)} />
                  </span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, width: 48, textAlign: "right" }}>{p.coveragePct}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Coverage per suite */}
      <Card>
        <PanelHeader title="Coverage per Suite" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left", background: "#F8FAFC" }}>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Suite</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Total TC</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Automated</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Coverage</th>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.suites.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "1.25rem", color: "var(--text-muted)", textAlign: "center" }}>
                    Belum ada suite.
                  </td>
                </tr>
              ) : (
                data.suites.map((s) => (
                  <tr key={s.suiteId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>{s.total}</td>
                    <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>{s.automated}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ flex: 1, minWidth: 80, maxWidth: 160 }}>
                          <ProgressBar value={s.coveragePct} color={barColor(s.coveragePct)} />
                        </span>
                        <span style={{ fontWeight: 700, width: 42, textAlign: "right" }}>{s.coveragePct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.6rem 1.25rem" }}>
                      <Badge tone={s.coveragePct >= 70 ? "success" : s.coveragePct >= 40 ? "warning" : "danger"}>
                        {s.coveragePct >= 70 ? "Baik" : s.coveragePct >= 40 ? "Sedang" : "Rendah"}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent runs */}
      <Card style={{ marginTop: "1.25rem" }}>
        <PanelHeader title="Run Terakhir" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left", background: "#F8FAFC" }}>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Nama Run</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Project</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {data.recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "1.25rem", color: "var(--text-muted)", textAlign: "center" }}>
                    Belum ada test run.
                  </td>
                </tr>
              ) : (
                data.recentRuns.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>{r.projectName}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <TestRunStatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: "0.6rem 1.25rem", color: "var(--text-muted)" }}>
                      {new Date(r.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
