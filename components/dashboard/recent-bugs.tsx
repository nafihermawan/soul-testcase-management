import Link from "next/link";
import { Badge, Card, PanelHeader } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ACTIVE_BUG_STATUSES, RETEST_BUG_STATUS, ageInDays, formatAge, severityRank } from "@/lib/qa-metrics";
import type { DashboardBugItem } from "@/types/api";
import { Bug as BugIcon } from "lucide-react";

const MAX_ROWS = 10;

const severityTone = (s: string) =>
  s === "CRITICAL" ? "danger" : s === "HIGH" ? "warning" : s === "MEDIUM" ? "info" : "neutral";

const statusLabel = (s: string) =>
  s === "OPEN"
    ? "Open"
    : s === "IN_PROGRESS"
      ? "In Progress"
      : s === "RESOLVED"
        ? "Resolved"
        : "Closed";

const statusTone = (s: string) =>
  s === "OPEN" ? "warning" : s === "IN_PROGRESS" ? "info" : s === "RESOLVED" ? "success" : "neutral";

/** Bug terbaru/kritis — Critical & High diprioritaskan di atas. */
export function RecentBugs({ bugs }: { bugs: DashboardBugItem[] }) {
  const rows = [...bugs]
    .sort((a, b) => {
      const r = severityRank(a.severity) - severityRank(b.severity);
      if (r !== 0) return r;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, MAX_ROWS);

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Recent / Critical Bugs"
        action={
          <Link href="/bugs" style={{ fontSize: "0.78rem", color: "#2563EB", textDecoration: "none" }}>
            Lihat semua →
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<BugIcon size={22} />}
          title="Belum Ada Bug"
          subtext="Tidak ada bug yang cocok dengan filter saat ini."
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
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600 }}>Bug</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 88 }}>Severity</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 118 }}>Module</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 84 }}>Env</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 106 }}>Status</th>
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600, width: 92 }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const sev = (b.severity ?? "").toUpperCase();
                const isCriticalOrHigh = sev === "CRITICAL" || sev === "HIGH";
                const needsRetest = b.status === RETEST_BUG_STATUS;
                const isActive = (ACTIVE_BUG_STATUSES as readonly string[]).includes(b.status);
                const attention = isCriticalOrHigh || needsRetest;
                return (
                  <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td
                      style={{
                        padding: "0.55rem 1.25rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: attention ? 600 : 400,
                      }}
                    >
                      {b.title}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem" }}>
                      <Badge tone={severityTone(sev)}>{b.severity || "—"}</Badge>
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
                      {b.suiteName ?? "—"}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", color: "var(--text-secondary)" }}>
                      {b.environment ?? "—"}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
                        {needsRetest && (
                          <span
                            title="Siap untuk retest QA"
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: "var(--danger)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            retest
                          </span>
                        )}
                        {isActive && isCriticalOrHigh && (
                          <span
                            title="Bug aktif dengan severity tinggi"
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: "var(--danger)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            !
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ padding: "0.55rem 1.25rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {formatAge(ageInDays(b.createdAt))}
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
