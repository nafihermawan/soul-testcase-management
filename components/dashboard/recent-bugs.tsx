import Link from "next/link";
import { Card, PanelHeader } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ACTIVE_BUG_STATUSES, RETEST_BUG_STATUS, ageInDays, formatAge, severityRank } from "@/lib/qa-metrics";
import type { DashboardBugItem } from "@/types/api";
import { Bug as BugIcon } from "lucide-react";

const MAX_ROWS = 10;

/** Garis pemisah inset (tidak menyentuh tepi kartu). */
const insetDivider: React.CSSProperties = {
  backgroundImage: "linear-gradient(to right, var(--border), var(--border))",
  backgroundSize: "calc(100% - 2rem) 1px",
  backgroundPosition: "1rem 100%",
  backgroundRepeat: "no-repeat",
};

/** Urutan: status aktif (Open/In Progress) di atas, selesai (Resolved/Closed) di bawah. */
const BUG_STATUS_RANK: Record<string, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  CLOSED: 3,
};

const statusLabel = (s: string) =>
  s === "OPEN"
    ? "Open"
    : s === "IN_PROGRESS"
      ? "In Progress"
      : s === "RESOLVED"
        ? "Resolved"
        : "Closed";

/** Bug terbaru — status aktif dulu, lalu severity tertinggi. */
export function RecentBugs({ bugs }: { bugs: DashboardBugItem[] }) {
  const rows = [...bugs]
    .sort((a, b) => {
      // Status aktif dulu (Open/In Progress), selesai di bawah (Resolved/Closed);
      // di dalam grup: severity lebih tinggi dulu, lalu yang terbaru.
      const ra = BUG_STATUS_RANK[a.status] ?? 9;
      const rb = BUG_STATUS_RANK[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
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
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table
            style={{
              width: "100%",
              minWidth: 450,
              borderCollapse: "collapse",
              fontSize: "0.8rem",
              // table-auto: kolom mengikuti konten (tidak kolaps) sehingga header
              // tidak bertumpuk; container overflow-x menangani layar sempit.
              tableLayout: "auto",
            }}
          >
            <thead>
              <tr
                style={{
                  color: "var(--text-muted)",
                  textAlign: "left",
                  ...insetDivider,
                }}
              >
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600, minWidth: 150, whiteSpace: "nowrap" }}>Bug</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: 88, whiteSpace: "nowrap" }}>Severity</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: 118, whiteSpace: "nowrap" }}>Module</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: 84, whiteSpace: "nowrap" }}>Env</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600, width: 106, whiteSpace: "nowrap" }}>Status</th>
                <th style={{ padding: "0.75rem 1.25rem", fontWeight: 600, width: 92, whiteSpace: "nowrap" }}>Age</th>
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
                  <tr key={b.id} style={{ ...insetDivider, whiteSpace: "nowrap" }}>
                    <td
                      title={b.title}
                      style={{
                        padding: "0.75rem 1.25rem",
                        maxWidth: 180,
                        overflow: "hidden",
                        fontWeight: attention ? 600 : 400,
                      }}
                    >
                      {/* Span blok ber-maxWidth: di table-auto, batas lebar harus
                          ada di elemen blok agar kolom tak melebar penuh. */}
                      <span
                        style={{
                          display: "block",
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.title}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.5rem",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        // Teks polos berwarna (tanpa pill).
                        color:
                          sev === "CRITICAL"
                            ? "#BE123C"
                            : sev === "HIGH"
                              ? "#E11D48"
                              : sev === "MEDIUM"
                                ? "#B45309"
                                : "#64748B",
                      }}
                    >
                      {b.severity ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.5rem",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.suiteName ?? "—"}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)" }}>
                      {b.environment ?? "—"}
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        {/* Status teks polos: open/in-progress amber, resolved
                            emerald, closed slate muted. */}
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            color:
                              b.status === "CLOSED"
                                ? "#94A3B8"
                                : b.status === "RESOLVED"
                                  ? "#047857"
                                  : "#B45309",
                          }}
                        >
                          {statusLabel(b.status)}
                        </span>
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
                    <td style={{ padding: "0.75rem 1.25rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
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
