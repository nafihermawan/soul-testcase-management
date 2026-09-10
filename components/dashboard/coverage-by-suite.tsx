import Link from "next/link";
import { Card, PanelHeader, ProgressBar } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { firstUrlOf } from "@/lib/format";
import { formatPct, pct } from "@/lib/qa-metrics";
import type { DashboardSuiteCoverageItem } from "@/types/api";
import { ExternalLink, FolderTree } from "lucide-react";

const coverageColor = (value: number) =>
  value >= 70 ? "var(--success)" : value >= 40 ? "var(--warning)" : "var(--danger)";

/** Coverage per suite. Default urutan: coverage terendah dulu (risiko tertinggi). */
export function CoverageBySuite({ suites }: { suites: DashboardSuiteCoverageItem[] }) {
  const rows = [...suites].sort((a, b) => {
    const ca = pct(a.counts.executed, a.total);
    const cb = pct(b.counts.executed, b.total);
    // Tanpa TC = tidak ada risiko, taruh paling bawah.
    if (ca === null && cb === null) return b.total - a.total;
    if (ca === null) return 1;
    if (cb === null) return -1;
    // Coverage terendah dulu; seri -> suite dengan TC terbanyak (risiko lebih besar).
    if (ca !== cb) return ca - cb;
    return b.total - a.total;
  });

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <PanelHeader title="Coverage by Suite" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderTree size={22} />}
          title="Belum Ada Suite"
          subtext="Tidak ada suite yang cocok dengan filter saat ini."
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
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
                <th style={{ padding: "0.55rem 0.5rem", fontWeight: 600, width: 68, textAlign: "right" }}>
                  Pass
                </th>
                <th style={{ padding: "0.55rem 1.25rem", fontWeight: 600, width: 260 }}>
                  Coverage
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const cov = pct(s.counts.executed, s.total);
                const docHref = firstUrlOf(s.docUrl);
                return (
                  <tr
                    key={s.id}
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
                        href={`/suites/${s.id}`}
                        title={`Buka suite ${s.name}`}
                        style={{
                          fontWeight: 600,
                          color: "#2563EB",
                          textDecoration: "none",
                        }}
                      >
                        {s.name}
                      </Link>
                      {docHref && (
                        <a
                          href={docHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Buka Dokumentasi Suite"
                          style={{
                            marginLeft: "0.35rem",
                            color: "#2563EB",
                            display: "inline-flex",
                            verticalAlign: "middle",
                          }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.total}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.counts.executed}
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        textAlign: "right",
                        color: s.counts.failed > 0 ? "var(--danger)" : "var(--text-secondary)",
                        fontWeight: s.counts.failed > 0 ? 700 : 400,
                      }}
                    >
                      {s.counts.passed}
                    </td>
                    <td style={{ padding: "0.55rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ width: 160, flexShrink: 0 }}>
                          {cov === null ? (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                              Belum ada TC
                            </span>
                          ) : (
                            <ProgressBar value={cov} color={coverageColor(cov)} />
                          )}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            width: 44,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {formatPct(cov)}
                        </span>
                      </div>
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
