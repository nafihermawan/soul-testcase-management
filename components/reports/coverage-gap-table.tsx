import Link from "next/link";
import { Card, PanelHeader, ProgressBar } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatPct, pct } from "@/lib/qa-metrics";
import type { ReportsSuiteGapItem } from "@/types/api";
import { CheckCircle2, FolderTree, Info } from "lucide-react";

const gapColor = (value: number) =>
  value >= 80 ? "var(--danger)" : value >= 40 ? "var(--warning)" : "var(--success)";

/** Celah coverage per suite: TC yang belum pernah dieksekusi, gap terbesar dulu. */
export function CoverageGapTable({
  suites,
  noExecutionYet,
}: {
  suites: ReportsSuiteGapItem[];
  noExecutionYet: boolean;
}) {
  const rows = [...suites].sort((a, b) => {
    if (b.untested !== a.untested) return b.untested - a.untested;
    return b.total - a.total;
  });

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <PanelHeader title="Celah Coverage per Suite" />

      {noExecutionYet && rows.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.6rem",
            margin: "0.9rem 1.25rem 0",
            padding: "0.65rem 0.85rem",
            background: "var(--warning-bg)",
            border: "1px solid #FDE68A",
            borderRadius: 8,
            fontSize: "0.8rem",
            color: "#B45309",
            lineHeight: 1.5,
          }}
        >
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Belum ada eksekusi sama sekali.</strong> Seluruh test case di bawah masih
            berstatus belum pernah di-test — angka ini akan turun setelah test run dijalankan dan
            diselesaikan.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderTree size={22} />}
          title="Belum Ada Suite dengan Test Case"
          subtext="Tambahkan test case ke suite untuk melihat celah coverage di sini."
        />
      ) : (
        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.82rem",
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
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600 }}>Suite</th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 64, textAlign: "right" }}>
                  TC
                </th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 76, textAlign: "right" }}>
                  Tested
                </th>
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 76, textAlign: "right" }}>
                  Belum
                </th>
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600, width: 260 }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const gapPct = pct(s.untested, s.total);
                return (
                  <tr
                    key={s.suiteId}
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
                        href={`/suites/${s.suiteId}`}
                        title={`Buka suite ${s.name}`}
                        style={{ fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
                      >
                        {s.name}
                      </Link>
                      <span
                        style={{
                          marginLeft: "0.4rem",
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {s.projectName}
                      </span>
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.total}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.tested}
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        textAlign: "right",
                        fontWeight: s.untested > 0 ? 700 : 400,
                        color: s.untested > 0 ? "var(--text)" : "var(--text-muted)",
                      }}
                    >
                      {s.untested}
                    </td>
                    <td style={{ padding: "0.55rem 1.25rem" }}>
                      {gapPct === null ? (
                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          Belum ada TC
                        </span>
                      ) : s.untested === 0 ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            color: "var(--success)",
                          }}
                        >
                          <CheckCircle2 size={14} /> Semua sudah di-test
                        </span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{ width: 150, flexShrink: 0 }}>
                            <ProgressBar value={gapPct} color={gapColor(gapPct)} />
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              width: 52,
                              textAlign: "right",
                              flexShrink: 0,
                              fontSize: "0.78rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {formatPct(gapPct)} gap
                          </span>
                        </div>
                      )}
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
