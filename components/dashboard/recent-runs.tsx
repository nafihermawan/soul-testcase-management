import Link from "next/link";
import { Card, PanelHeader, ProgressBar } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import { formatPct, passRateOf, pct } from "@/lib/qa-metrics";
import type { DashboardRunItem } from "@/types/api";
import { CalendarClock } from "lucide-react";

const MAX_ROWS = 10;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Test run terbaru — cukup jelas untuk memahami kondisinya tanpa membukanya. */
export function RecentRuns({ runs }: { runs: DashboardRunItem[] }) {
  const rows = runs.slice(0, MAX_ROWS);

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Recent Test Runs"
        action={
          runs.length > MAX_ROWS ? (
            <Link href="/test-runs/history" style={{ fontSize: "0.78rem", color: "#2563EB", textDecoration: "none" }}>
              Lihat semua →
            </Link>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="Belum Ada Test Run"
          subtext="Belum ada test run yang cocok dengan filter saat ini."
          actionLabel="Buat Test Run Baru"
          actionHref="/test-runs"
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr
                style={{
                  color: "var(--text-muted)",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600 }}>Test Run</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 116 }}>Project</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 84 }}>Env</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 190 }}>Progress</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 76, textAlign: "right" }}>
                  Pass Rate
                </th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 96 }}>Status</th>
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600, width: 104 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const progress = pct(r.counts.executed, r.counts.total);
                const passRate = passRateOf(r.counts);
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td
                      style={{
                        padding: "0.55rem 1.25rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Link
                        href={`/test-runs/${r.id}`}
                        title={`Buka run ${r.name}`}
                        style={{ fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.project}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", color: "var(--text-secondary)" }}>
                      {r.environment ?? "—"}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ width: 84, flexShrink: 0 }}>
                          <ProgressBar value={progress ?? 0} />
                        </span>
                        <span style={{ fontWeight: 700, fontSize: "0.76rem" }}>
                          {formatPct(progress)}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: "0.2rem",
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.counts.passed} Passed · {r.counts.failed} Failed · {r.counts.notRun} Not Run
                        {r.counts.blocked > 0 ? ` · ${r.counts.blocked} Blocked` : ""}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        textAlign: "right",
                        fontWeight: 700,
                        color:
                          passRate !== null && passRate < 70
                            ? "var(--danger)"
                            : passRate !== null && passRate < 85
                              ? "var(--warning)"
                              : "var(--text)",
                      }}
                    >
                      {formatPct(passRate)}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem" }}>
                      <TestRunStatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: "0.55rem 1.25rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {formatDate(r.completedAt ?? r.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
