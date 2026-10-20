import Link from "next/link";
import { Card, PanelHeader, ProgressBar } from "@/components/ui";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/dashboard/empty-state";
import { executionProgress, formatPct, passRateOf } from "@/lib/qa-metrics";
import { RUN_STATUS_LABEL, type RunStatusValue } from "@/lib/run-status";
import type { DashboardRunItem } from "@/types/api";
import { CalendarClock } from "lucide-react";

const MAX_ROWS = 10;

/** Warna teks status run (teks polos, tanpa pill). */
const runStatusColor: Record<string, string> = {
  PENDING: "#64748B",
  IN_PROGRESS: "#B45309",
  COMPLETED: "#047857",
  RE_OPEN: "#1D4ED8",
};

/** Garis pemisah inset (tidak menyentuh tepi kartu). */
const insetDivider: React.CSSProperties = {
  backgroundImage: "linear-gradient(to right, var(--border), var(--border))",
  backgroundSize: "calc(100% - 2rem) 1px",
  backgroundPosition: "1rem 100%",
  backgroundRepeat: "no-repeat",
};

/** Urutan prioritas tampilan: yang masih berjalan di atas, Completed di bawah. */
const STATUS_RANK: Record<string, number> = {
  IN_PROGRESS: 0,
  RE_OPEN: 1,
  PENDING: 2,
  COMPLETED: 3,
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Test run terbaru — cukup jelas untuk memahami kondisinya tanpa membukanya. */
export function RecentRuns({ runs }: { runs: DashboardRunItem[] }) {
  // Urutkan: In Progress → Re-Open → Pending → Completed (yang berjalan di atas),
  // tiebreak tetap run terbaru lebih dulu.
  const rows = [...runs]
    .sort((a, b) => {
      const ra = STATUS_RANK[a.status] ?? 9;
      const rb = STATUS_RANK[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, MAX_ROWS);

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PanelHeader
        title="Recent Test Runs"
        action={
          runs.length > MAX_ROWS ? (
            <Link href="/test-runs/history" style={{ fontSize: "0.78rem", color: "#2563EB", textDecoration: "none" }}>
              View all →
            </Link>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="No Test Runs Yet"
          subtext="No test run matches the current filters."
          actionLabel="Create New Test Run"
          actionHref="/test-runs"
        />
      ) : (
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table
            style={{
              width: "100%",
              minWidth: 600,
              borderCollapse: "collapse",
              fontSize: 12,
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
                  whiteSpace: "nowrap",
                  ...insetDivider,
                }}
              >
                <th style={{ padding: "0.625rem 1.25rem", fontWeight: 600, minWidth: 160, whiteSpace: "nowrap" }}>Test Run</th>
                <th style={{ padding: "0.625rem 0.5rem", fontWeight: 600, minWidth: 100, width: 116, whiteSpace: "nowrap" }}>Project</th>
                <th style={{ padding: "0.625rem 0.5rem", fontWeight: 600, width: 84, whiteSpace: "nowrap" }}>Env</th>
                <th style={{ padding: "0.625rem 0.5rem", fontWeight: 600, minWidth: 170, width: 190, textAlign: "left", whiteSpace: "nowrap" }}>Progress</th>
                <th style={{ padding: "0.625rem 0.75rem", fontWeight: 600, width: 84, textAlign: "right", whiteSpace: "nowrap" }}>
                  Pass Rate
                </th>
                <th style={{ padding: "0.625rem 0.5rem", fontWeight: 600, width: 96, whiteSpace: "nowrap" }}>Status</th>
                <th style={{ padding: "0.625rem 1.25rem", fontWeight: 600, width: 112, whiteSpace: "nowrap" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // Progress eksekusi: definisi TUNGGAL dari lib/qa-metrics.
                const progress = executionProgress(r.counts);
                const status = r.status as RunStatusValue;
                // Jaring pengaman: Completed tapi eksekusi belum 100%.
                const completedIncomplete = status === "COMPLETED" && (progress ?? 0) < 100;
                // Pass Rate = rasio lolos dari TC yang dieksekusi valid
                // (Passed+Failed+Blocked); Skipped dikecualikan dari penyebut.
                const passRate = passRateOf(r.counts);
                // Rincian status dipindah ke tooltip progress (menggantikan sub-teks).
                // Skipped ikut ditampilkan supaya angka penyebut progress
                // (Total − Skipped) tetap bisa ditelusuri dari tooltip ini.
                const statusDetail = `${r.counts.passed} Passed · ${r.counts.failed} Failed · ${r.counts.notRun} Not Run${
                  r.counts.blocked > 0 ? ` · ${r.counts.blocked} Blocked` : ""
                }${r.counts.skipped > 0 ? ` · ${r.counts.skipped} Skipped` : ""}`;
                return (
                  <tr
                    key={r.id}
                    style={{ ...insetDivider, whiteSpace: "nowrap" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <td
                      style={{
                        padding: "0.625rem 1.25rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Link
                        href={`/test-runs/${r.id}`}
                        title={r.name}
                        style={{
                          display: "block",
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: 500,
                          color: "#1E293B",
                          textDecoration: "none",
                        }}
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "0.625rem 0.5rem",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.project}
                    </td>
                    <td style={{ padding: "0.625rem 0.5rem", color: "var(--text-secondary)" }}>
                      {r.environment ?? "—"}
                    </td>
                    <td style={{ padding: "0.625rem 0.5rem", minWidth: 170 }}>
                      {/* Hover di bar / persentase memunculkan rincian status
                          sebagai tooltip — baris tetap ringkas satu tinggi. */}
                      <Tooltip label={statusDetail} style={{ display: "block", width: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                          <span style={{ flex: 1, maxWidth: 160, minWidth: 0 }}>
                            <ProgressBar value={progress ?? 0} color="#0EA5E9" height={6} />
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatPct(progress)}
                          </span>
                        </div>
                      </Tooltip>
                    </td>
                    <td
                      style={{
                        padding: "0.625rem 0.75rem",
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        // Teks polos: hijau ≥80, amber 50–79, rose <50.
                        color:
                          passRate === null
                            ? "#94A3B8"
                            : passRate >= 80
                              ? "#047857"
                              : passRate >= 50
                                ? "#B45309"
                                : "#BE123C",
                      }}
                    >
                      {formatPct(passRate)}
                    </td>
                    <td
                      style={{
                        padding: "0.625rem 0.5rem",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        color: runStatusColor[status] ?? "#64748B",
                      }}
                    >
                      {RUN_STATUS_LABEL[status] ?? status}
                      {completedIncomplete && (
                        <span style={{ color: "#B45309", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {" "}· {progress ?? 0}% executed
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.625rem 1.25rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
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
